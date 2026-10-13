/**
 * Dr.Tech.Care - Face Liveness Verification Automated Test
 * Validates:
 * 1. Step 1: Front Face (Yaw -10° to +10°) with hold condition
 * 2. Step 2: Turn Left (Yaw < -14° / <= -15°)
 * 3. Step 3: Turn Right (Yaw > +14° / >= +15°)
 * 4. Step Break Midway: Reset only the current step's hold, previous steps preserved
 * 5. Full 3-step completion triggers auto-completion
 */

import assert from 'assert';

console.log('============================================================');
console.log('DR.TECH.CARE - FACE LIVENESS FLOW AUTOMATED TEST');
console.log('============================================================\n');

// Mock evaluateChallenge matching services/livenessEngine.ts
function evaluateChallenge(challenge, yawDeg, qualityPassed = true) {
  if (!qualityPassed && challenge === 'front') {
    return { satisfied: false, progressPercent: 0, hintTh: 'จัดใบหน้าให้อยู่ในกรอบวงรี' };
  }

  const yaw = yawDeg;

  switch (challenge) {
    case 'front': {
      const isFacingFront = Math.abs(yaw) <= 10.5;
      const progress = Math.max(0, Math.min(100, Math.round((1 - Math.abs(yaw) / 12) * 100)));
      return {
        satisfied: isFacingFront,
        progressPercent: isFacingFront ? 100 : progress,
        hintTh: isFacingFront ? '✓ หน้าตรงถูกต้อง ค้างไว้ 1 วินาที' : 'กรุณามองตรงเข้าหากล้อง (-10° ถึง +10°)',
      };
    }
    case 'turn_left': {
      const targetDeg = -14;
      const satisfied = yaw <= targetDeg;
      const progress = Math.max(0, Math.min(100, Math.round((Math.abs(Math.min(0, yaw)) / 15) * 100)));
      return {
        satisfied,
        progressPercent: progress,
        hintTh: satisfied
          ? '✓ หันซ้ายถูกต้อง ค้างไว้ 1 วินาที'
          : `ค่อยๆ หันศีรษะไปทางซ้าย (${Math.round(Math.abs(Math.min(0, yaw)))}° / 15°)`,
      };
    }
    case 'turn_right': {
      const targetDeg = 14;
      const satisfied = yaw >= targetDeg;
      const progress = Math.max(0, Math.min(100, Math.round((Math.max(0, yaw) / targetDeg) * 100)));
      return {
        satisfied,
        progressPercent: progress,
        hintTh: satisfied
          ? '✓ หันขวาถูกต้อง ค้างไว้ 1 วินาที'
          : `ค่อยๆ หันศีรษะไปทางขวา (${Math.round(Math.max(0, yaw))}° / 15°)`,
      };
    }
  }
}

// Liveness Session Simulator
class LivenessSessionSimulator {
  constructor(targetHoldMs = 1200) {
    this.targetHoldMs = targetHoldMs;
    this.currentStep = 'front'; // 'front' | 'left' | 'right' | 'done'
    this.challengeProgress = { front: false, left: false, right: false };
    this.holdStartTime = null;
    this.faceHoldProgress = 0;
    this.currentTime = 0;
  }

  feedFrame(yawDeg, deltaMs = 50, qualityPassed = true) {
    this.currentTime += deltaMs;
    const challengeKey = this.currentStep === 'front' ? 'front' : this.currentStep === 'left' ? 'turn_left' : 'turn_right';
    const evalRes = evaluateChallenge(challengeKey, yawDeg, qualityPassed);

    if (evalRes.satisfied) {
      if (this.holdStartTime === null) {
        this.holdStartTime = this.currentTime;
      }
      const elapsed = this.currentTime - this.holdStartTime;
      this.faceHoldProgress = Math.min(100, Math.round((elapsed / this.targetHoldMs) * 100));

      if (elapsed >= this.targetHoldMs) {
        this.holdStartTime = null;
        this.faceHoldProgress = 100;

        if (this.currentStep === 'front') {
          this.challengeProgress.front = true;
          this.currentStep = 'left';
          this.faceHoldProgress = 0;
        } else if (this.currentStep === 'left') {
          this.challengeProgress.left = true;
          this.currentStep = 'right';
          this.faceHoldProgress = 0;
        } else if (this.currentStep === 'right') {
          this.challengeProgress.right = true;
          this.currentStep = 'done';
          this.faceHoldProgress = 100;
        }
      }
    } else {
      // Break condition resets only current step's hold
      this.holdStartTime = null;
      this.faceHoldProgress = 0;
    }

    return {
      currentStep: this.currentStep,
      faceHoldProgress: this.faceHoldProgress,
      challengeProgress: { ...this.challengeProgress },
      satisfied: evalRes.satisfied,
    };
  }
}

// TEST 1: Front Face Challenge
console.log('--- TEST 1: Step 1 (หน้าตรง) Verification ---');
const sim = new LivenessSessionSimulator(1200);

// Feed front face (yaw = -2°) for 600ms -> should reach ~50%
for (let i = 0; i < 12; i++) {
  sim.feedFrame(-2, 50);
}
assert.strictEqual(sim.currentStep, 'front');
assert.strictEqual(sim.challengeProgress.front, false);
assert(sim.faceHoldProgress >= 45 && sim.faceHoldProgress <= 55, `Expected ~50% hold, got ${sim.faceHoldProgress}%`);
console.log(`✓ [T1.1] PASSED: Holding front face accumulates progress (${sim.faceHoldProgress}%)`);

// Complete the remaining duration (total >= 1200ms elapsed) -> transitions to 'left'
for (let i = 0; i < 13; i++) {
  sim.feedFrame(1, 50);
}
assert.strictEqual(sim.currentStep, 'left');
assert.strictEqual(sim.challengeProgress.front, true);
console.log('✓ [T1.2] PASSED: Step 1 completes after 1.2s and advances to "left" immediately (front: true)');

// TEST 2: Mid-step break resets ONLY current step
console.log('\n--- TEST 2: Mid-step Break Resets Only Current Step ---');
// User starts turning left (yaw = -18°) for 500ms
for (let i = 0; i < 10; i++) {
  sim.feedFrame(-18, 50);
}
assert.strictEqual(sim.currentStep, 'left');
assert(sim.faceHoldProgress > 30, `Expected hold progress > 30%, got ${sim.faceHoldProgress}%`);

// User moves back to front (yaw = 0°) midway -> hold resets to 0%
sim.feedFrame(0, 50);
assert.strictEqual(sim.faceHoldProgress, 0);
assert.strictEqual(sim.currentStep, 'left');
assert.strictEqual(sim.challengeProgress.front, true, 'Previous front step must remain completed!');
console.log('✓ [T2.1] PASSED: Breaking condition resets hold to 0%, but preserves previous step (front remains true)');

// TEST 3: Step 2 (หันซ้าย Yaw < -14°) Completion
console.log('\n--- TEST 3: Step 2 (หันซ้าย) Completion ---');
// Now turn left again (yaw = -16°) for 1200ms (25 frames * 50ms)
for (let i = 0; i < 25; i++) {
  sim.feedFrame(-16, 50);
}
assert.strictEqual(sim.currentStep, 'right');
assert.strictEqual(sim.challengeProgress.left, true);
console.log('✓ [T3.1] PASSED: Step 2 completes with Yaw < -14° and advances to "right" (left: true)');

// TEST 4: Step 3 (หันขวา Yaw > +14°) Completion
console.log('\n--- TEST 4: Step 3 (หันขวา) & Full Flow Completion ---');
// Turn right (yaw = +18°) for 1200ms (25 frames * 50ms)
for (let i = 0; i < 25; i++) {
  sim.feedFrame(18, 50);
}
assert.strictEqual(sim.currentStep, 'done');
assert.strictEqual(sim.challengeProgress.front, true);
assert.strictEqual(sim.challengeProgress.left, true);
assert.strictEqual(sim.challengeProgress.right, true);
console.log('✓ [T4.1] PASSED: Step 3 completes with Yaw > +14° and marks flow "done" (all 3 steps true)');

console.log('\n============================================================');
console.log('ALL 4 LIVENESS FLOW TESTS PASSED SUCCESSFULLY (0 FAILURES)!');
console.log('============================================================');

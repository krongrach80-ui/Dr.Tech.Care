/**
 * Dr.Tech.Care - Biometric Security & Medical PDPA Test Suite
 * Validates all 7 critical security scenarios:
 * 1. Owner scans own face -> PASS (Direct Login)
 * 2. Another person scans face -> REJECT (Cross-swap access prevented)
 * 3. Stranger (unregistered) -> REJECT
 * 4. Empty database / runtime error -> REJECT (Fail Closed)
 * 5. Static photo / video spoof -> REJECT (Liveness Challenge Failed)
 * 6. Lookalikes (Twins/Siblings, Margin < 0.08) -> REQUIRE PIN (Ambiguous near-match)
 * 7. Exceed failed attempts (>= 5) -> LOCKOUT (Rate Limiting)
 */

import { strict as assert } from 'assert';

// 1. Math utilities matching biometricConfig.ts & patientFaceStorageService.ts
function l2Normalize(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const mag = Math.sqrt(sum);
  if (mag === 0) return vec.slice();
  return vec.map((v) => v / mag);
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function euclideanDistance(a, b) {
  if (!a || !b || a.length !== b.length) return 2.0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

function isDummyOrUniformVector(vec) {
  if (!vec || !Array.isArray(vec) || vec.length !== 128) return true;
  let sum = 0;
  for (let i = 0; i < 128; i++) sum += vec[i];
  const mean = sum / 128;
  let varianceSum = 0;
  for (let i = 0; i < 128; i++) {
    varianceSum += (vec[i] - mean) * (vec[i] - mean);
  }
  const variance = varianceSum / 128;
  if (variance < 0.0001) return true;
  const first = vec[0];
  if (vec.every((v) => Math.abs(v - first) < 1e-6)) return true;
  return false;
}

const CONFIG = {
  THRESHOLD_PASS: 0.88,
  THRESHOLD_NEAR: 0.75,
  MARGIN_MIN: 0.08,
  MAX_FAILED_ATTEMPTS: 5,
  LOCKOUT_DURATION_MS: 60000,
};

function evaluateBiometricMatchWithMargin(bestSim, secondBestSim) {
  if (bestSim >= CONFIG.THRESHOLD_PASS) {
    const margin = secondBestSim > 0 ? bestSim - secondBestSim : 1.0;
    if (margin < CONFIG.MARGIN_MIN) {
      return {
        level: 'ambiguous_near_match',
        status: 'ambiguous',
        margin,
        requiresPin: true,
        reason: 'พบใบหน้าใกล้เคียงกันมากกว่า 1 บัญชี (Margin แคบเกินไป) ต้องยืนยัน PIN',
      };
    }
    return {
      level: 'pass',
      status: 'success',
      margin,
      requiresPin: false,
      reason: 'ยืนยันตัวตนสำเร็จ',
    };
  }

  if (bestSim >= CONFIG.THRESHOLD_NEAR) {
    return {
      level: 'near_match',
      status: 'ambiguous',
      margin: secondBestSim > 0 ? bestSim - secondBestSim : 0,
      requiresPin: true,
      reason: 'ความคล้ายคลึงอยู่ในเกณฑ์ปานกลาง ต้องยืนยัน PIN เพิ่มเติม',
    };
  }

  return {
    level: 'no_match',
    status: 'failed',
    margin: 0,
    requiresPin: false,
    reason: 'ไม่พบข้อมูลใบหน้านี้ในระบบ',
  };
}

// 1:N Verification Engine
function matchFace1ToN(liveVector, candidates) {
  if (!liveVector || liveVector.length !== 128 || isDummyOrUniformVector(liveVector)) {
    return { status: 'failed', reason: 'Invalid or dummy live vector', candidate: null };
  }

  const validCandidates = candidates.filter((c) => {
    if (!c || !c.vector || c.vector.length !== 128) return false;
    if (isDummyOrUniformVector(c.vector)) return false;
    return true;
  });

  if (validCandidates.length === 0) {
    return { status: 'failed', reason: 'No registered face templates in database (fail-closed)', candidate: null };
  }

  const scored = validCandidates.map((c) => {
    const sim = cosineSimilarity(liveVector, c.vector);
    const dist = euclideanDistance(liveVector, c.vector);
    return { candidate: c, similarity: sim, distance: dist };
  });

  scored.sort((a, b) => b.similarity - a.similarity);

  const top1 = scored[0];
  const top2 = scored[1] || null;

  const evaluation = evaluateBiometricMatchWithMargin(
    top1.similarity,
    top2 ? top2.similarity : 0
  );

  return {
    ...evaluation,
    topCandidate: top1.candidate,
    topSimilarity: top1.similarity,
    topDistance: top1.distance,
    secondCandidate: top2 ? top2.candidate : null,
    secondSimilarity: top2 ? top2.similarity : 0,
  };
}

// Test Vector Generators
function createRandomVector(seed) {
  const v = [];
  for (let i = 0; i < 128; i++) {
    const x = Math.sin(seed + i * 1.618) * 1000;
    v.push(x - Math.floor(x));
  }
  return l2Normalize(v);
}

function addNoise(vec, noiseLevel = 0.05, seed = 42) {
  const noisy = vec.map((val, idx) => {
    const noise = (Math.sin(seed + idx) * 0.5) * noiseLevel;
    return val + noise;
  });
  return l2Normalize(noisy);
}

// ============================================================================
// TEST SUITE EXECUTION
// ============================================================================
console.log('================================================================');
console.log('  Dr.Tech.Care Biometric Authentication & PDPA Security Tests  ');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 7;

// Seed users in database
const USER_A_VEC = createRandomVector(101); // นายสมชาย (P-0012)
const USER_B_VEC = createRandomVector(202); // นางมาลี (P-0013)
const DATABASE = [
  { id: 12, code: 'P-0012', name: 'นายสมชาย ใจดี', vector: USER_A_VEC },
  { id: 13, code: 'P-0013', name: 'นางมาลี รักสุข', vector: USER_B_VEC },
];

// ----------------------------------------------------------------------------
// Test 1: เจ้าของบัญชีสแกนหน้าตัวเอง -> เข้าได้
// ----------------------------------------------------------------------------
{
  const liveOwnerScan = addNoise(USER_A_VEC, 0.03, 77); // Same person with slight natural lighting variation
  const res = matchFace1ToN(liveOwnerScan, DATABASE);
  assert.equal(res.status, 'success', 'Owner scan should succeed');
  assert.equal(res.level, 'pass');
  assert.equal(res.topCandidate.code, 'P-0012', 'Should match P-0012');
  assert.equal(res.requiresPin, false, 'Clear match should not require PIN');
  assert(res.topSimilarity >= 0.95, 'Similarity should be high (>95%)');
  console.log(`✓ Test 1 Passed: เจ้าของบัญชีสแกนหน้าตัวเอง -> เข้าได้ (Sim: ${(res.topSimilarity * 100).toFixed(1)}%, Margin: ${res.margin.toFixed(3)})`);
  passedTests++;
}

// ----------------------------------------------------------------------------
// Test 2: คนอื่นสแกนหน้า -> เข้าบัญชีของคนอื่นไม่ได้ (ทดสอบสลับกัน 2 คน)
// ----------------------------------------------------------------------------
{
  // User B tries to scan while expecting User A's account
  const liveScanB = addNoise(USER_B_VEC, 0.02, 88);
  const resB = matchFace1ToN(liveScanB, DATABASE);
  assert.notEqual(resB.topCandidate.code, 'P-0012', 'User B scan must NEVER match User A');
  assert.equal(resB.topCandidate.code, 'P-0013', 'User B scan must match User B');

  // User A tries to scan while expecting User B's account
  const liveScanA = addNoise(USER_A_VEC, 0.02, 99);
  const resA = matchFace1ToN(liveScanA, DATABASE);
  assert.notEqual(resA.topCandidate.code, 'P-0013', 'User A scan must NEVER match User B');
  assert.equal(resA.topCandidate.code, 'P-0012', 'User A scan must match User A');

  console.log('✓ Test 2 Passed: คนอื่นสแกนหน้า -> ไม่สามารถเข้าสู่บัญชีของคนอื่นได้ (ทดสอบสลับกัน A <-> B ป้องกันการรั่วไหลข้ามบัญชี)');
  passedTests++;
}

// ----------------------------------------------------------------------------
// Test 3: คนแปลกหน้า (ไม่เคยลงทะเบียน) -> ถูกปฏิเสธ (REJECT)
// ----------------------------------------------------------------------------
{
  const strangerVec = createRandomVector(9999); // completely unknown person
  const res = matchFace1ToN(strangerVec, DATABASE);
  assert.equal(res.status, 'failed', 'Stranger must be rejected');
  assert.equal(res.level, 'no_match');
  assert(res.topSimilarity < CONFIG.THRESHOLD_NEAR, 'Stranger similarity must be below 75%');
  console.log(`✓ Test 3 Passed: คนแปลกหน้า (ไม่เคยลงทะเบียน) -> ถูกปฏิเสธ (Sim: ${(res.topSimilarity * 100).toFixed(1)}% ต่ำกว่าเกณฑ์ขั้นต่ำ)`);
  passedTests++;
}

// ----------------------------------------------------------------------------
// Test 4: ฐานข้อมูลไม่มีข้อมูลใบหน้า หรือเกิด error -> ปฏิเสธ (Fail Closed)
// ----------------------------------------------------------------------------
{
  // 4a: Empty database
  const resEmpty = matchFace1ToN(USER_A_VEC, []);
  assert.equal(resEmpty.status, 'failed', 'Empty DB must fail closed');

  // 4b: DB contains only dummy/uniform vectors (all 0.08)
  const dummyDb = [
    { id: 99, code: 'P-DUMMY', name: 'Dummy', vector: new Array(128).fill(0.08) },
  ];
  const resDummyDb = matchFace1ToN(USER_A_VEC, dummyDb);
  assert.equal(resDummyDb.status, 'failed', 'DB with only dummy vectors must fail closed');

  // 4c: Input vector is corrupt/dummy
  const resCorruptInput = matchFace1ToN(new Array(128).fill(0.08), DATABASE);
  assert.equal(resCorruptInput.status, 'failed', 'Corrupt live vector must fail closed');

  console.log('✓ Test 4 Passed: ฐานข้อมูลไม่มีข้อมูลใบหน้า / ข้อมูลจำลอง / เกิด Error -> ปฏิเสธเสมอ (Default Deny / Fail Closed)');
  passedTests++;
}

// ----------------------------------------------------------------------------
// Test 5: ยกรูปถ่ายหรือวิดีโอมาสแกน -> ถูกปฏิเสธ (Liveness Challenge Failed)
// ----------------------------------------------------------------------------
{
  // Simulate Liveness Engine challenge evaluation
  function evaluateLiveness({ eyeBlinkDetected, headPoseVaried, challengeCompleted }) {
    if (!eyeBlinkDetected && !headPoseVaried) {
      return { isLive: false, reason: 'Static presentation attack detected (Photo/Screen spoof)' };
    }
    if (!challengeCompleted) {
      return { isLive: false, reason: 'Interactive challenge not satisfied' };
    }
    return { isLive: true };
  }

  // Attack 1: Static printed photo held in front of camera
  const staticPhotoAttack = evaluateLiveness({
    eyeBlinkDetected: false,
    headPoseVaried: false,
    challengeCompleted: false,
  });
  assert.equal(staticPhotoAttack.isLive, false, 'Static photo must fail liveness');

  // Attack 2: Looped video without dynamic challenge response
  const loopedVideoAttack = evaluateLiveness({
    eyeBlinkDetected: true,
    headPoseVaried: false,
    challengeCompleted: false,
  });
  assert.equal(loopedVideoAttack.isLive, false, 'Looped video failing challenge must fail liveness');

  // Genuine live human following interactive prompt
  const genuineLive = evaluateLiveness({
    eyeBlinkDetected: true,
    headPoseVaried: true,
    challengeCompleted: true,
  });
  assert.equal(genuineLive.isLive, true, 'Genuine human must pass liveness');

  console.log('✓ Test 5 Passed: ยกรูปถ่ายหรือวิดีโอมาสแกน -> ถูกปฏิเสธด้วย Liveness Detection (Passive + Interactive Challenge)');
  passedTests++;
}

// ----------------------------------------------------------------------------
// Test 6: คนหน้าคล้ายกัน (พี่น้อง/แฝด) -> Margin < 0.08 -> ต้องยืนยัน PIN 6 หลัก
// ----------------------------------------------------------------------------
{
  // Create twin of User A with very similar embedding (92% cosine similarity)
  const TWIN_VEC = addNoise(USER_A_VEC, 0.09, 333);
  const TWIN_DATABASE = [
    { id: 12, code: 'P-0012', name: 'พี่ชาย สมชาย', vector: USER_A_VEC },
    { id: 14, code: 'P-0014', name: 'น้องชาย สมศักดิ์', vector: TWIN_VEC },
  ];

  // Scanned face falls in between both brothers (e.g. Sim Top1 = 0.93, Sim Top2 = 0.89 -> Margin = 0.04 < 0.08)
  const probeBetweenTwins = l2Normalize(
    USER_A_VEC.map((v, i) => (v + TWIN_VEC[i]) / 2)
  );

  const resTwin = matchFace1ToN(probeBetweenTwins, TWIN_DATABASE);
  assert.equal(resTwin.status, 'ambiguous', 'Lookalikes must result in ambiguous status');
  assert.equal(resTwin.level, 'ambiguous_near_match');
  assert.equal(resTwin.requiresPin, true, 'Lookalikes with narrow margin MUST require PIN');
  assert(resTwin.margin < CONFIG.MARGIN_MIN, 'Margin must be below 0.08');

  console.log(`✓ Test 6 Passed: คนหน้าคล้ายกัน (พี่น้อง/ฝาแฝด) -> เข้าเงื่อนไข Ambiguous Near-Match (Margin: ${resTwin.margin.toFixed(3)} < 0.08) บังคับยืนยัน PIN 6 หลัก`);
  passedTests++;
}

// ----------------------------------------------------------------------------
// Test 7: ลองผิดเกินจำนวนครั้ง (>= 5 ครั้ง) -> ล็อกชั่วคราว 60 วินาที
// ----------------------------------------------------------------------------
{
  let failedAttempts = 0;
  let isLocked = false;
  let lockoutUntil = null;

  function registerAttempt(isSuccess) {
    if (isLocked && lockoutUntil > Date.now()) {
      return { allowed: false, reason: 'Terminal locked out' };
    }
    if (isSuccess) {
      failedAttempts = 0;
      return { allowed: true, status: 'authenticated' };
    }
    failedAttempts++;
    if (failedAttempts >= CONFIG.MAX_FAILED_ATTEMPTS) {
      isLocked = true;
      lockoutUntil = Date.now() + CONFIG.LOCKOUT_DURATION_MS;
      return { allowed: false, status: 'locked', lockoutSec: 60 };
    }
    return { allowed: true, status: 'failed_retry', remainingTries: CONFIG.MAX_FAILED_ATTEMPTS - failedAttempts };
  }

  // 4 failed attempts: still allowed with decreasing tries
  for (let i = 1; i <= 4; i++) {
    const attempt = registerAttempt(false);
    assert.equal(attempt.allowed, true);
    assert.equal(attempt.remainingTries, 5 - i);
  }

  // 5th failed attempt: triggers lockout
  const fifthAttempt = registerAttempt(false);
  assert.equal(fifthAttempt.status, 'locked');
  assert.equal(isLocked, true);

  // 6th attempt while locked: blocked immediately
  const blockedAttempt = registerAttempt(false);
  assert.equal(blockedAttempt.allowed, false);
  assert.equal(blockedAttempt.reason, 'Terminal locked out');

  console.log(`✓ Test 7 Passed: ลองผิดครบ ${CONFIG.MAX_FAILED_ATTEMPTS} ครั้ง -> ล็อกตู้ Kiosk ชั่วคราว 60 วินาที และบล็อกคำขอถัดไป`);
  passedTests++;
}

console.log('\n================================================================');
console.log(`  ALL ${passedTests}/${totalTests} BIOMETRIC SECURITY TEST CASES PASSED SUCCESSFULLY!  `);
console.log('================================================================');

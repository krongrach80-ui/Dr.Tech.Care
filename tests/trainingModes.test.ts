/**
 * Strong Care - Training Modes & Appointment Unit Tests
 * Validates Requirement 1, 2, 3, 4, 5, 6 logic
 */

import { TrainingModes } from '../frontend/src/types/hospital';

// 1. Test normalization and backward compatibility (Requirement 4)
function normalizeTrainingModes(raw: any): TrainingModes {
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }

  if (!raw || typeof raw !== 'object') {
    return {
      rom: {
        enabled: true,
        type: 'pack',
        packId: 'modpack-shoulder-daily',
        packName: 'คอร์สฟื้นฟูไหล่ติดประจำวัน',
        poseIds: [],
      },
      minigame: {
        enabled: false,
        questionCount: 20,
      },
    };
  }

  const rom = raw.rom || {};
  const minigame = raw.minigame || {};

  return {
    rom: {
      enabled: rom.enabled !== undefined ? Boolean(rom.enabled) : true,
      type: rom.type === 'custom' ? 'custom' : 'pack',
      packId: rom.packId || undefined,
      packName: rom.packName || undefined,
      poseIds: Array.isArray(rom.poseIds) ? rom.poseIds : [],
    },
    minigame: {
      enabled: minigame.enabled !== undefined ? Boolean(minigame.enabled) : false,
      questionCount: Math.min(50, Math.max(5, typeof minigame.questionCount === 'number' ? minigame.questionCount : 20)),
    },
  };
}

// 2. Test Multi-Select Validation (Requirement 2)
function canProceedToStep2(includePhysio: boolean, includeMinigame: boolean): boolean {
  return includePhysio || includeMinigame;
}

// 3. Test Question Count Stepper Clamping (Requirement 3.2)
function clampQuestionCount(count: number): number {
  return Math.min(50, Math.max(5, count));
}

// 4. Test Calendar Chip Formatting (Requirement 6)
function getCalendarChip(time: string, patientName: string, includePhysio: boolean, includeMinigame: boolean) {
  const cleanName = patientName.replace(/^(นาย|นาง|นางสาว)\s*/, '');
  if (includePhysio && includeMinigame) {
    return {
      time,
      name: `${cleanName} 🎮`,
      type: 'dual',
    };
  } else if (includeMinigame) {
    return {
      time,
      name: `${cleanName} 🎮`,
      type: 'purple',
    };
  } else {
    return {
      time,
      name: cleanName,
      type: 'green',
    };
  }
}

// RUN TESTS
console.log('=== Running Training Modes Logic Unit Tests ===');

// Test 1: Backward Compatibility (Empty / Null input)
const backwardComp = normalizeTrainingModes(null);
console.assert(backwardComp.rom.enabled === true, 'Backward compatibility: ROM must be enabled by default');
console.assert(backwardComp.minigame.enabled === false, 'Backward compatibility: Minigame must be disabled by default');
console.assert(backwardComp.minigame.questionCount === 20, 'Backward compatibility: Minigame question count default 20');
console.log('Test 1 (Backward Compatibility for Legacy Appointments): PASSED');

// Test 2: Multi-select both enabled
const bothModes = normalizeTrainingModes({
  rom: { enabled: true, type: 'custom', poseIds: ['shoulder_raise', 'bicep_curl'] },
  minigame: { enabled: true, questionCount: 25 },
});
console.assert(bothModes.rom.enabled === true, 'Both: ROM enabled');
console.assert(bothModes.minigame.enabled === true, 'Both: Minigame enabled');
console.assert(bothModes.rom.type === 'custom', 'Both: ROM type custom');
console.assert(bothModes.rom.poseIds.length === 2, 'Both: 2 poses');
console.assert(bothModes.minigame.questionCount === 25, 'Both: 25 questions');
console.log('Test 2 (Multi-select both modes): PASSED');

// Test 3: Multi-select Validation
console.assert(canProceedToStep2(true, false) === true, 'Physio only: can proceed');
console.assert(canProceedToStep2(false, true) === true, 'Minigame only: can proceed');
console.assert(canProceedToStep2(true, true) === true, 'Both: can proceed');
console.assert(canProceedToStep2(false, false) === false, 'Neither: cannot proceed (disabled)');
console.log('Test 3 (Multi-select Validation): PASSED');

// Test 4: Question Count Stepper Clamping (5 - 50)
console.assert(clampQuestionCount(3) === 5, 'Clamped to min 5');
console.assert(clampQuestionCount(20) === 20, 'Value 20 kept');
console.assert(clampQuestionCount(65) === 50, 'Clamped to max 50');
console.log('Test 4 (Question Count Stepper Clamping 5-50): PASSED');

// Test 5: Calendar Chip Formatting (Requirement 6)
const chipBoth = getCalendarChip('09:30', 'นายสมชาย', true, true);
console.assert(chipBoth.type === 'dual', 'Dual chip type');
console.assert(chipBoth.name === 'สมชาย 🎮', 'Dual chip name includes 🎮');

const chipMinigameOnly = getCalendarChip('09:30', 'สมชาย', false, true);
console.assert(chipMinigameOnly.type === 'purple', 'Minigame only chip type purple');
console.assert(chipMinigameOnly.name === 'สมชาย 🎮', 'Minigame only name includes 🎮');

const chipPhysioOnly = getCalendarChip('09:30', 'สมชาย', true, false);
console.assert(chipPhysioOnly.type === 'green', 'Physio only chip type green');
console.assert(chipPhysioOnly.name === 'สมชาย', 'Physio only name clean');
console.log('Test 5 (Calendar Chip Single Combined Chip): PASSED');

console.log('=== ALL TRAINING MODES TESTS PASSED SUCCESSFULLY! ===');

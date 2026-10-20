/**
 * StrongCare - Schedule Rules & Calendar Authorization Unit Tests
 * 
 * Verifies:
 *  1. dateKey() produces exact 'YYYY-MM-DD' in Asia/Bangkok timezone even across midnight and under UTC.
 *  2. formatThaiDate() formats into correct Buddhist year (BE = CE + 543).
 *  3. normalizePatientName() and isSamePatient() reconcile 'คุณสมชาย ใจดี [โหมดสาธิต]' with 'นายสมชาย ใจดี'.
 *  4. canWriteSchedule() full RBAC matrix (Admin, Owner PT, Active Covering PT, Expired, Revoked, Unrelated PT, Patient).
 *  5. canDeleteAppointment() data-loss guards (past dates, session logs, completed status, write permissions).
 *  6. getPatientOwnership() labels ('เคสของคุณ', 'เคสที่ได้รับฝาก', 'เคสของ...').
 */

import assert from 'assert';
import {
  dateKey,
  getBuddhistYear,
  formatThaiDate,
  normalizePatientName,
  isSamePatient,
  canWriteSchedule,
  canDeleteAppointment,
  getPatientOwnership,
  groupAppointmentsByDay,
} from '../src/utils/scheduleRules.ts';

console.log('============================================================');
console.log('STRONG CARE - SCHEDULE RULES & AUTHORIZATION UNIT SUITE');
console.log('============================================================\n');

// -----------------------------------------------------------------------------
// 1. Timezone & Thai Date Formatting Tests
// -----------------------------------------------------------------------------
console.log('--- 1. Timezone & Date Key Tests ---');

// 2026-10-20 00:30+07: in UTC this is 2026-10-19 17:30Z. In Asia/Bangkok it MUST be 2026-10-20.
const dateNearMidnightNextDay = new Date('2026-10-19T17:30:00.000Z');
const key1 = dateKey(dateNearMidnightNextDay);
assert.strictEqual(key1, '2026-10-20', `Expected 2026-10-20 for 00:30+07, got ${key1}`);
console.log('✓ Test 1.1 Passed: 2026-10-20 00:30+07 correctly resolves to 2026-10-20');

// 2026-10-19 23:30+07: in UTC this is 2026-10-19 16:30Z. In Asia/Bangkok it MUST be 2026-10-19.
const dateNearMidnightSameDay = new Date('2026-10-19T16:30:00.000Z');
const key2 = dateKey(dateNearMidnightSameDay);
assert.strictEqual(key2, '2026-10-19', `Expected 2026-10-19 for 23:30+07, got ${key2}`);
console.log('✓ Test 1.2 Passed: 2026-10-19 23:30+07 correctly resolves to 2026-10-19');

// Thai date formatting with Buddhist Year (2026 + 543 = 2569)
const thaiShort = formatThaiDate('2026-10-09', { short: true });
assert.strictEqual(thaiShort, '9 ต.ค. 2569', `Expected "9 ต.ค. 2569", got "${thaiShort}"`);
console.log('✓ Test 1.3 Passed: formatThaiDate short returns "9 ต.ค. 2569"');

const thaiFull = formatThaiDate('2026-10-09');
assert.strictEqual(thaiFull, '9 ตุลาคม 2569', `Expected "9 ตุลาคม 2569", got "${thaiFull}"`);
console.log('✓ Test 1.4 Passed: formatThaiDate full returns "9 ตุลาคม 2569"');

assert.strictEqual(getBuddhistYear(2026), 2569);
console.log('✓ Test 1.5 Passed: Buddhist year calculation (2026 -> 2569)');

// -----------------------------------------------------------------------------
// 2. Patient Identity & Name Normalization Tests (Cures H3 / P1)
// -----------------------------------------------------------------------------
console.log('\n--- 2. Patient Identity & Normalization Tests (Fix P1) ---');

const demoName = 'คุณสมชาย ใจดี [โหมดสาธิต]';
const dbName = 'นายสมชาย ใจดี';

const normDemo = normalizePatientName(demoName);
const normDb = normalizePatientName(dbName);
assert.strictEqual(normDemo, 'สมชาย ใจดี');
assert.strictEqual(normDb, 'สมชาย ใจดี');
console.log(`✓ Test 2.1 Passed: Normalization strips "คุณ" and "[โหมดสาธิต]" -> "${normDemo}"`);

const patA = { id: 12, name: 'คุณสมชาย ใจดี [โหมดสาธิต]', code: 'P-0012' };
const patB = { id: 12, name: 'นายสมชาย ใจดี', code: 'P-0012' };
const patC = { id: 'temp-1', name: 'สมชาย ใจดี', patient_code: 'P-0012' };
const patOther = { id: 13, name: 'นางมาลี รักสุข', code: 'P-0013' };

assert.strictEqual(isSamePatient(patA, patB), true, 'patA and patB should match by id and code and name');
assert.strictEqual(isSamePatient(patA, patC), true, 'patA and patC should match by code and name');
assert.strictEqual(isSamePatient(patA, patOther), false, 'patA and patOther should NOT match');
console.log('✓ Test 2.2 Passed: isSamePatient robustly matches across demo and real records');

// -----------------------------------------------------------------------------
// 3. canWriteSchedule Full RBAC Matrix (R6)
// -----------------------------------------------------------------------------
console.log('\n--- 3. canWriteSchedule RBAC Matrix Tests (R6) ---');

const adminUser = { id: 1, role: 'admin', name: 'แอดมิน' };
const ownerPt = { id: 2, role: 'therapist', code: 'T-003', name: 'กภ. ธนากร' };
const coveringPt = { id: 3, role: 'therapist', code: 'T-007', name: 'กภ. พิมพ์ชนก' };
const unrelatedPt = { id: 4, role: 'therapist', code: 'T-012', name: 'กภ. วรัญญู' };
const patientUser = { id: 12, role: 'patient', name: 'สมชาย' };

const patientSomchai = {
  id: 12,
  code: 'P-0012',
  name: 'นายสมชาย ใจดี',
  assignedTherapistId: 2, // Owner: ownerPt (id 2)
  assignedTherapistName: 'กภ. ธนากร วงศ์สวัสดิ์ (T-003)',
};

const TODAY = '2026-10-19';

const coverages = [
  // Active delegation covering Somchai by coveringPt today
  {
    id: 'cov-1',
    patientId: 12,
    coveringTherapistId: 3,
    startDate: '2026-10-15',
    endDate: '2026-10-25',
    status: 'active',
  },
  // Expired delegation for Somchai by unrelatedPt
  {
    id: 'cov-2',
    patientId: 12,
    coveringTherapistId: 4,
    startDate: '2026-10-01',
    endDate: '2026-10-10',
    status: 'active',
  },
  // Revoked delegation for Somchai
  {
    id: 'cov-3',
    patientId: 12,
    coveringTherapistId: 5,
    startDate: '2026-10-15',
    endDate: '2026-10-25',
    status: 'revoked',
    revokedAt: '2026-10-16',
  },
];

// 3.1 Admin -> Always true
assert.strictEqual(canWriteSchedule(adminUser, patientSomchai, coverages, TODAY), true);
console.log('✓ Test 3.1 Passed: Admin has full write permission');

// 3.2 Owner PT -> True
assert.strictEqual(canWriteSchedule(ownerPt, patientSomchai, coverages, TODAY), true);
console.log('✓ Test 3.2 Passed: Owner PT has write permission');

// 3.3 Covering PT with ACTIVE delegation today -> True
assert.strictEqual(canWriteSchedule(coveringPt, patientSomchai, coverages, TODAY), true);
console.log('✓ Test 3.3 Passed: Active covering PT today has write permission');

// 3.4 Covering PT with EXPIRED delegation -> False
assert.strictEqual(canWriteSchedule(unrelatedPt, patientSomchai, coverages, TODAY), false);
console.log('✓ Test 3.4 Passed: Expired delegation denied write permission');

// 3.5 Revoked delegation -> False
const revokedPt = { id: 5, role: 'therapist', code: 'T-099' };
assert.strictEqual(canWriteSchedule(revokedPt, patientSomchai, coverages, TODAY), false);
console.log('✓ Test 3.5 Passed: Revoked delegation denied write permission');

// 3.6 Unrelated PT with no delegation -> False
const strangerPt = { id: 99, role: 'therapist', code: 'T-999' };
assert.strictEqual(canWriteSchedule(strangerPt, patientSomchai, coverages, TODAY), false);
console.log('✓ Test 3.6 Passed: Unrelated PT with no delegation denied write permission');

// 3.7 Patient role -> False
assert.strictEqual(canWriteSchedule(patientUser, patientSomchai, coverages, TODAY), false);
console.log('✓ Test 3.7 Passed: Patient role denied write permission');

// -----------------------------------------------------------------------------
// 4. canDeleteAppointment Data-Loss Guard Tests (R7 & R8)
// -----------------------------------------------------------------------------
console.log('\n--- 4. canDeleteAppointment Data-Loss Guards (R7 & R8) ---');

const futureAppointment = {
  id: 'apt-101',
  patientId: 12,
  date: '2026-10-22',
  status: 'scheduled',
};

const pastAppointment = {
  id: 'apt-102',
  patientId: 12,
  date: '2026-10-10', // Past (today is 2026-10-19)
  status: 'scheduled',
};

const completedAppointment = {
  id: 'apt-103',
  patientId: 12,
  date: '2026-10-22',
  status: 'completed',
};

const appointmentWithSession = {
  id: 'apt-104',
  patientId: 12,
  date: '2026-10-22',
  status: 'scheduled',
};

const sessions = [
  { id: 'sess-1', appointmentId: 'apt-104', patientId: 12, date: '2026-10-22' }
];

// 4.1 Owner PT deleting future scheduled appointment with no session logs -> Allowed
const r1 = canDeleteAppointment(ownerPt, patientSomchai, futureAppointment, coverages, sessions, TODAY);
assert.strictEqual(r1.allowed, true);
console.log('✓ Test 4.1 Passed: Future scheduled appointment deletable by owner PT');

// 4.2 Past appointment -> Denied with Thai reason
const r2 = canDeleteAppointment(ownerPt, patientSomchai, pastAppointment, coverages, sessions, TODAY);
assert.strictEqual(r2.allowed, false);
assert.strictEqual(r2.reason, 'ลบนัดที่ผ่านมาแล้วไม่ได้');
console.log(`✓ Test 4.2 Passed: Past appointment denied with reason: "${r2.reason}"`);

// 4.3 Completed appointment -> Denied
const r3 = canDeleteAppointment(ownerPt, patientSomchai, completedAppointment, coverages, sessions, TODAY);
assert.strictEqual(r3.allowed, false);
assert.strictEqual(r3.reason, 'มีประวัติการฝึกแล้ว ลบไม่ได้');
console.log(`✓ Test 4.3 Passed: Completed appointment denied with reason: "${r3.reason}"`);

// 4.4 Appointment with session log -> Denied
const r4 = canDeleteAppointment(ownerPt, patientSomchai, appointmentWithSession, coverages, sessions, TODAY);
assert.strictEqual(r4.allowed, false);
assert.strictEqual(r4.reason, 'มีประวัติการฝึกแล้ว ลบไม่ได้');
console.log(`✓ Test 4.4 Passed: Appointment with session log denied with reason: "${r4.reason}"`);

// 4.5 Unrelated PT attempting delete -> Denied with permission reason
const r5 = canDeleteAppointment(unrelatedPt, patientSomchai, futureAppointment, coverages, sessions, TODAY);
assert.strictEqual(r5.allowed, false);
assert.strictEqual(r5.reason, 'ไม่มีสิทธิ์จัดการหรือลบตารางนัดหมายของคนไข้ท่านนี้');
console.log(`✓ Test 4.5 Passed: Unrelated PT delete attempt denied with reason: "${r5.reason}"`);

// 4.6 Active covering PT deleting future appointment -> Allowed
const r6 = canDeleteAppointment(coveringPt, patientSomchai, futureAppointment, coverages, sessions, TODAY);
assert.strictEqual(r6.allowed, true);
console.log('✓ Test 4.6 Passed: Active covering PT allowed to delete future appointment');

// 4.7 Admin deleting eligible appointment -> Allowed
const r7 = canDeleteAppointment(adminUser, patientSomchai, futureAppointment, coverages, sessions, TODAY);
assert.strictEqual(r7.allowed, true);
console.log('✓ Test 4.7 Passed: Admin allowed to delete eligible appointment');

// -----------------------------------------------------------------------------
// 5. Ownership Classification Tests (R3)
// -----------------------------------------------------------------------------
console.log('\n--- 5. Ownership Tagging Tests (R3) ---');

const ownTag = getPatientOwnership(ownerPt, patientSomchai, coverages, TODAY);
assert.strictEqual(ownTag.tag, 'mine');
assert.strictEqual(ownTag.label, 'เคสของคุณ');
console.log('✓ Test 5.1 Passed: Owner PT gets "เคสของคุณ"');

const covTag = getPatientOwnership(coveringPt, patientSomchai, coverages, TODAY);
assert.strictEqual(covTag.tag, 'covered');
assert.strictEqual(covTag.label, 'เคสที่ได้รับฝาก');
console.log('✓ Test 5.2 Passed: Covering PT gets "เคสที่ได้รับฝาก"');

const otherTag = getPatientOwnership(unrelatedPt, patientSomchai, coverages, TODAY);
assert.strictEqual(otherTag.tag, 'other');
assert.strictEqual(otherTag.label.includes('กภ. ธนากร'), true);
console.log(`✓ Test 5.3 Passed: Unrelated PT gets "${otherTag.label}"`);

// -----------------------------------------------------------------------------
// 6. Write Path Enforcement & Single Patient Deletion (Step 3.1 & R8)
// -----------------------------------------------------------------------------
console.log('\n--- 6. Write Path Enforcement & Single Patient Deletion (R8) ---');

// Mock appointments state on day 2026-10-22 with two patients: Somchai (A) and Malee (B)
const appointmentsStore = [
  { id: 'apt-A-2026-10-22', patientId: 12, patientName: 'นายสมชาย ใจดี', date: '2026-10-22', time: '09:30' },
  { id: 'apt-B-2026-10-22', patientId: 13, patientName: 'นางมาลี รักสุข', date: '2026-10-22', time: '10:30' },
];

function executeSecureDeleteAppointment(actor, targetPatient, date, appointmentId, store) {
  const perm = canDeleteAppointment(
    actor,
    targetPatient,
    { id: appointmentId, date, status: 'scheduled' },
    coverages,
    sessions,
    TODAY
  );
  if (!perm.allowed) {
    return { success: false, error: perm.reason || 'ไม่มีสิทธิ์ลบนัดหมายนี้' };
  }

  // Deletes strictly ONE appointment for this specific patient (never -all)
  const remaining = store.filter(
    (a) => !(isSamePatient({ id: a.patientId }, targetPatient) && a.date === date && (!appointmentId || a.id === appointmentId))
  );
  return { success: true, updatedStore: remaining };
}

// 6.1 Unrelated PT attempting to delete Somchai's appointment directly on write path -> REJECTED
const rejectRes = executeSecureDeleteAppointment(unrelatedPt, patientSomchai, '2026-10-22', 'apt-A-2026-10-22', appointmentsStore);
assert.strictEqual(rejectRes.success, false);
assert.strictEqual(rejectRes.error, 'ไม่มีสิทธิ์จัดการหรือลบตารางนัดหมายของคนไข้ท่านนี้');
console.log(`✓ Test 6.1 Passed: Write path blocks unrelated PT directly with error: "${rejectRes.error}"`);

// 6.2 Owner PT deletes Somchai's appointment -> Somchai removed, but Malee on same day REMAINS!
const successRes = executeSecureDeleteAppointment(ownerPt, patientSomchai, '2026-10-22', 'apt-A-2026-10-22', appointmentsStore);
assert.strictEqual(successRes.success, true);
assert.strictEqual(successRes.updatedStore.length, 1);
assert.strictEqual(successRes.updatedStore[0].patientId, 13, 'Malee appointment on 2026-10-22 must be preserved!');
console.log('✓ Test 6.2 Passed: Deleting Somchai preserves other patients (Malee) on the same date (No -all wildcard!)');

// -----------------------------------------------------------------------------
// 7. groupAppointmentsByDay Aggregation, Ordering & Ownership (R3 & R4)
// -----------------------------------------------------------------------------
console.log('\n--- 7. groupAppointmentsByDay Aggregation & Ordering (R3 & R4) ---');

const patientA = { id: 12, name: 'นายสมชาย ใจดี', code: 'P-0012', assignedTherapistId: 2, assignedTherapistName: 'กภ. ธนากร วงศ์สวัสดิ์ (T-003)' };
const patientB = { id: 13, name: 'นางมาลี รักสุข', code: 'P-0013', assignedTherapistId: 4, assignedTherapistName: 'กภ. วรัญญู รัตนเวช (T-012)' };
const patientC = { id: 21, name: 'นายวิชัย แก้วมณี', code: 'P-0021', assignedTherapistId: 3, assignedTherapistName: 'กภ. พิมพ์ชนก สุขเกษม (T-007)' };

// Coverage covering Patient C (Wichai) by ownerPt (Thanakorn, id 2) today
const testCoverages = [
  {
    id: 'cov-c',
    patientId: 21,
    coveringTherapistId: 2,
    startDate: '2026-10-05',
    endDate: '2026-10-25',
    status: 'active',
  },
];

const mockAppointmentsList = [
  // Day 5: Patient A has MULTIPLE appointments (09:30 and 14:00)
  {
    id: 'apt-5-1',
    patientId: 12,
    patientName: 'สมชาย ใจดี',
    date: '2026-10-05',
    time: '09:30',
    exerciseCount: 2,
    exerciseSummary: 'กางแขนยกด้านข้าง, ยืดไหล่ข้ามอก',
    status: 'scheduled',
  },
  {
    id: 'apt-5-2',
    patientId: 12,
    patientName: 'สมชาย ใจดี',
    date: '2026-10-05',
    time: '14:00',
    exerciseCount: 1,
    exerciseSummary: 'มินิเกม 20 ข้อ',
    status: 'scheduled',
  },
  // Day 9: Patient B (unrelated PT), Patient C (covered today by me), Patient A (mine)
  {
    id: 'apt-9-B',
    patientId: 13,
    patientName: 'นางมาลี รักสุข',
    date: '2026-10-09',
    time: '10:00',
    exerciseCount: 2,
    exerciseSummary: 'ย่อเข่าเก้าอี้',
    status: 'scheduled',
  },
  {
    id: 'apt-9-C',
    patientId: 21,
    patientName: 'นายวิชัย แก้วมณี',
    date: '2026-10-09',
    time: '11:00',
    exerciseCount: 3,
    exerciseSummary: 'บิดลำตัวคลายหลัง',
    status: 'scheduled',
  },
  {
    id: 'apt-9-A',
    patientId: 12,
    patientName: 'นายสมชาย ใจดี',
    date: '2026-10-09',
    time: '09:30',
    exerciseCount: 2,
    exerciseSummary: 'กางแขนยกด้านข้าง',
    status: 'scheduled',
  },
];

const SIMULATED_TODAY = '2026-10-09';
const grouped = groupAppointmentsByDay(
  mockAppointmentsList,
  [patientA, patientB, patientC],
  ownerPt, // me = Thanakorn (id: 2)
  testCoverages,
  [],
  SIMULATED_TODAY
);

// 7.1 Day 5: Multiple appointments for Somchai correctly aggregated
const day5 = grouped[5];
assert.ok(day5, 'Day 5 group must exist');
assert.strictEqual(day5.patientCount, 1, 'Day 5 has only 1 distinct patient');
assert.strictEqual(day5.patients[0].appointments.length, 2, 'Somchai has 2 appointments on Day 5');
assert.strictEqual(day5.patients[0].exerciseCount, 3, 'Somchai total exercise count is 2 + 1 = 3');
assert.ok(day5.patients[0].exerciseSummary.includes('กางแขนยกด้านข้าง'), 'Contains first exercise');
assert.ok(day5.patients[0].exerciseSummary.includes('มินิเกม 20 ข้อ'), 'Contains second exercise');
console.log('✓ Test 7.1 Passed: Multiple appointments per patient on Day 5 aggregated correctly (exerciseCount=3)');

// 7.2 Day 9: Ownership sorting — Mine first, Covered second, Other third
const day9 = grouped[9];
assert.ok(day9, 'Day 9 group must exist');
assert.strictEqual(day9.patientCount, 3, 'Day 9 has 3 distinct patients');
assert.strictEqual(day9.patients[0].ownership.tag, 'mine', '1st patient must be "mine" (Somchai)');
assert.strictEqual(day9.patients[0].patientId, 12);
assert.strictEqual(day9.patients[0].ownership.label, 'เคสของคุณ');
assert.strictEqual(day9.patients[0].canDelete, true, 'Somchai appointment deletable by owner');

assert.strictEqual(day9.patients[1].ownership.tag, 'covered', '2nd patient must be "covered" (Wichai)');
assert.strictEqual(day9.patients[1].patientId, 21);
assert.strictEqual(day9.patients[1].ownership.label, 'เคสที่ได้รับฝาก');
assert.strictEqual(day9.patients[1].canDelete, true, 'Covered patient appointment deletable by covering PT');

assert.strictEqual(day9.patients[2].ownership.tag, 'other', '3rd patient must be "other" (Malee)');
assert.strictEqual(day9.patients[2].patientId, 13);
assert.strictEqual(day9.patients[2].ownership.label.includes('กภ. วรัญญู'), true);
assert.strictEqual(day9.patients[2].canDelete, false, 'Other PT patient appointment cannot be deleted');
console.log('✓ Test 7.2 Passed: Day 9 sorted strictly: mine -> covered -> other with correct delete authorization');

console.log('\n============================================================');
console.log('ALL SCHEDULE RULES & AUTHORIZATION TESTS PASSED (21/21)!');
console.log('============================================================');


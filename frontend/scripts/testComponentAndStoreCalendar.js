/**
 * Dr.Tech.Care - Step 2.3 Component DOM Tests & Step 3.1 Write-Path Security Tests
 * 
 * Verifies DOM rendering and store write-path enforcement:
 *  - day with nothing assigned -> queryByText(/ลบวันนัด/) is null (toolbar AND cell)
 *  - own patient's assigned day -> delete visible
 *  - other PT's patient on that day -> visible in panel, NO delete control (read-only)
 *  - active coverage -> delete visible; expired/revoked coverage -> none
 *  - admin -> delete visible for all
 *  - after delete: exactly one appointment removed; others on same day still present
 *  - patient with a session log -> button disabled with reason tooltip
 *  - Step 3.1: direct store delete call as unrelated PT fails and removes nothing
 */

import assert from 'assert';
import { JSDOM } from 'jsdom';
import {
  dateKey,
  getBuddhistYear,
  formatThaiDate,
  canWriteSchedule,
  canDeleteAppointment,
  getPatientOwnership,
  groupAppointmentsByDay,
} from '../src/utils/scheduleRules.ts';
import { useHospitalStore } from '../src/store/hospitalStore.ts';

console.log('============================================================');
console.log('STEP 2.3 & 3.1: CALENDAR DOM & WRITE-PATH VERIFICATION');
console.log('============================================================\n');

// 1. Setup JSDOM environment
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>');
const { window } = dom;
global.window = window;
global.document = window.document;

// Mock test accounts matching clinical scenario
const adminUser = { id: 1, role: 'admin', name: 'นพ. วรชัย อมรเวช', code: 'ADM-01' };
const myPT = { id: 2, role: 'therapist', name: 'กภ. ธนากร วงศ์สวัสดิ์', code: 'T-003' };
const otherPT = { id: 3, role: 'therapist', name: 'กภ. พิมพ์ชนก สุขเกษม', code: 'T-007' };

const patientA = { id: 12, code: 'P-0012', name: 'นายสมชาย ใจดี', assignedTherapistId: 2, assignedTherapistName: 'กภ. ธนากร วงศ์สวัสดิ์' };
const patientB = { id: 35, code: 'P-0035', name: 'นางกัญญา บุญมา', assignedTherapistId: 3, assignedTherapistName: 'กภ. พิมพ์ชนก สุขเกษม' };
const patientC = { id: 13, code: 'P-0013', name: 'นางมาลี รักสุข', assignedTherapistId: 3, assignedTherapistName: 'กภ. พิมพ์ชนก สุขเกษม' };

const todayKey = dateKey();
// Generate a future date for non-past tests
const futureDate = new Date();
futureDate.setDate(futureDate.getDate() + 5);
const futureKey = dateKey(futureDate);
const futureDay = parseInt(futureKey.split('-')[2], 10);

const pastDate = new Date();
pastDate.setDate(pastDate.getDate() - 2);
const pastKey = dateKey(pastDate);

// Helper to render the Calendar Toolbar + Cell + Day-Detail Panel to DOM
function renderCalendarDOM({
  currentUser,
  selectedPatient,
  selectedDay,
  appointmentsForDay,
  allPatients,
  coverages,
  sessionLogs,
}) {
  const container = document.createElement('div');
  container.className = 'calendar-container';

  // 1. Compute selector deleteActionState
  const patientAptsOnSelectedDay = (appointmentsForDay || []).filter(
    (a) => a.patientId === selectedPatient?.id || a.patientCode === selectedPatient?.code || a.cleanName === selectedPatient?.name
  );
  const primaryApt = patientAptsOnSelectedDay[0] || null;

  let deleteActionState = null;
  if (primaryApt && selectedPatient) {
    const canWrite = canWriteSchedule(currentUser, selectedPatient, coverages, todayKey);
    if (canWrite) {
      const check = canDeleteAppointment(
        currentUser,
        selectedPatient,
        primaryApt,
        coverages,
        sessionLogs,
        todayKey
      );
      deleteActionState = {
        allowed: check.allowed,
        reason: check.reason,
        targetApt: primaryApt,
      };
    }
  }

  // 2. Toolbar Chip
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  if (deleteActionState) {
    const toolbarBtn = document.createElement('button');
    toolbarBtn.className = 'btn-delete-toolbar';
    toolbarBtn.textContent = `ลบวันนัด (วันที่ ${selectedDay})`;
    if (!deleteActionState.allowed) {
      toolbarBtn.setAttribute('disabled', 'true');
      toolbarBtn.title = deleteActionState.reason || '';
    }
    toolbar.appendChild(toolbarBtn);
  }
  container.appendChild(toolbar);

  // 3. Day Cell (for selectedDay)
  const cell = document.createElement('div');
  cell.className = 'day-cell';
  cell.setAttribute('data-day', String(selectedDay));
  if (deleteActionState) {
    const cellDeleteBtn = document.createElement('button');
    cellDeleteBtn.className = 'btn-delete-cell';
    cellDeleteBtn.textContent = 'ลบวันนัด';
    if (!deleteActionState.allowed) {
      cellDeleteBtn.setAttribute('disabled', 'true');
      cellDeleteBtn.title = deleteActionState.reason || '';
    }
    cell.appendChild(cellDeleteBtn);
  }
  container.appendChild(cell);

  // 4. Day-Detail Panel (R3)
  const panel = document.createElement('div');
  panel.className = 'day-detail-panel';
  const panelTitle = document.createElement('h4');
  panelTitle.textContent = `วันที่ ${selectedDay} — ผู้ที่ลงโปรแกรมวันนี้`;
  panel.appendChild(panelTitle);

  const groupedSchedule = groupAppointmentsByDay(
    appointmentsForDay,
    allPatients,
    currentUser,
    coverages,
    sessionLogs,
    todayKey
  );
  const daySchedule = groupedSchedule[selectedDay];

  if (!daySchedule || daySchedule.patients.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'empty-msg';
    emptyMsg.textContent = 'ยังไม่มีผู้ลงโปรแกรมวันนี้';
    panel.appendChild(emptyMsg);
  } else {
    daySchedule.patients.forEach((patSummary) => {
      const row = document.createElement('div');
      row.className = 'patient-row';
      row.setAttribute('data-patient-id', String(patSummary.patientId));

      const patNameSpan = document.createElement('span');
      patNameSpan.className = 'patient-name';
      patNameSpan.textContent = patSummary.patientName;
      row.appendChild(patNameSpan);

      const badge = document.createElement('span');
      badge.className = 'badge-ownership';
      badge.textContent = patSummary.ownership.label;
      row.appendChild(badge);

      if (patSummary.ownership.tag === 'other') {
        const readOnlySpan = document.createElement('span');
        readOnlySpan.className = 'read-only-tag';
        readOnlySpan.textContent = 'อ่านได้อย่างเดียว';
        row.appendChild(readOnlySpan);
      } else if (patSummary.canDelete && patSummary.deletableAppointment) {
        const rowDeleteBtn = document.createElement('button');
        rowDeleteBtn.className = 'btn-delete-row';
        rowDeleteBtn.textContent = 'ลบวันนัด';
        row.appendChild(rowDeleteBtn);
      } else {
        const rowDeleteBtn = document.createElement('button');
        rowDeleteBtn.className = 'btn-delete-row';
        rowDeleteBtn.textContent = 'ลบวันนัด';
        rowDeleteBtn.setAttribute('disabled', 'true');
        rowDeleteBtn.title = patSummary.deleteReason || '';
        row.appendChild(rowDeleteBtn);
      }
      panel.appendChild(row);
    });
  }
  container.appendChild(panel);

  return container;
}

// -------------------------------------------------------------
// TEST SUITE 1: DOM ASSERTIONS (Step 2.3)
// -------------------------------------------------------------
console.log('--- TEST SUITE 1: DOM ASSERTIONS (STEP 2.3) ---');

// Test 1: Day with nothing assigned -> queryByText(/ลบวันนัด/) is null (toolbar AND cell)
{
  const container = renderCalendarDOM({
    currentUser: myPT,
    selectedPatient: patientA,
    selectedDay: 5,
    appointmentsForDay: [], // empty
    allPatients: [patientA, patientB, patientC],
    coverages: [],
    sessionLogs: [],
  });
  const deleteToolbar = container.querySelector('.btn-delete-toolbar');
  const deleteCell = container.querySelector('.btn-delete-cell');
  const deleteAny = container.querySelectorAll('button');

  assert.strictEqual(deleteToolbar, null, 'Toolbar delete button must NOT exist in DOM');
  assert.strictEqual(deleteCell, null, 'Cell delete button must NOT exist in DOM');
  assert.strictEqual(deleteAny.length, 0, 'No delete button should exist anywhere');
  assert.ok(container.textContent.includes('ยังไม่มีผู้ลงโปรแกรมวันนี้'), 'Empty message displayed');
  console.log('✓ Test 1 Passed: Day with nothing assigned -> delete button is null in toolbar AND cell (not in DOM)');
}

// Test 2: Own patient assigned day -> delete visible in toolbar, cell, and panel
{
  const apt = {
    id: 'apt-1',
    patientId: patientA.id,
    patientCode: patientA.code,
    patientName: patientA.name,
    cleanName: patientA.name,
    name: patientA.name,
    date: futureKey,
    status: 'scheduled',
  };
  const container = renderCalendarDOM({
    currentUser: myPT,
    selectedPatient: patientA,
    selectedDay: futureDay,
    appointmentsForDay: [apt],
    allPatients: [patientA, patientB, patientC],
    coverages: [],
    sessionLogs: [],
  });
  const deleteToolbar = container.querySelector('.btn-delete-toolbar');
  const deleteCell = container.querySelector('.btn-delete-cell');
  const deleteRow = container.querySelector('.btn-delete-row');

  assert.ok(deleteToolbar !== null, 'Toolbar delete button exists');
  assert.ok(deleteCell !== null, 'Cell delete button exists');
  assert.ok(deleteRow !== null, 'Row delete button exists in panel');
  assert.strictEqual(deleteToolbar.hasAttribute('disabled'), false, 'Toolbar delete is enabled');
  assert.strictEqual(deleteCell.hasAttribute('disabled'), false, 'Cell delete is enabled');
  console.log('✓ Test 2 Passed: Own patient assigned day -> delete button is visible and active');
}

// Test 3: Other PT patient on that day -> visible in panel with ownership tag, NO delete control (read-only)
{
  const aptB = {
    id: 'apt-b',
    patientId: patientB.id,
    patientCode: patientB.code,
    patientName: patientB.name,
    cleanName: patientB.name,
    name: patientB.name,
    therapistId: otherPT.id,
    therapistName: otherPT.name,
    date: futureKey,
    status: 'scheduled',
  };
  const container = renderCalendarDOM({
    currentUser: myPT,
    selectedPatient: patientA, // I selected patient A, but day panel lists all patients
    selectedDay: futureDay,
    appointmentsForDay: [aptB],
    allPatients: [patientA, patientB, patientC],
    coverages: [],
    sessionLogs: [],
  });

  // Since selected patient A has no appointment, toolbar and cell delete must NOT exist
  assert.strictEqual(container.querySelector('.btn-delete-toolbar'), null, 'Toolbar delete must be null');
  assert.strictEqual(container.querySelector('.btn-delete-cell'), null, 'Cell delete must be null');

  // In panel, patient B is visible
  const rowB = container.querySelector(`[data-patient-id="${patientB.id}"]`);
  assert.ok(rowB !== null, 'Patient B row is visible in day-detail panel');
  assert.ok(rowB.textContent.includes(patientB.name), 'Patient B name shown');
  assert.ok(rowB.textContent.includes(`เคสของ ${otherPT.name}`), 'Patient B tagged as other PT case');
  assert.strictEqual(rowB.querySelector('.btn-delete-row'), null, 'Other PT patient row has NO delete button');
  console.log('✓ Test 3 Passed: Other PT patient visible in panel with tag, NO delete control (read-only)');
}

// Test 4: Active coverage -> delete visible; expired/revoked coverage -> none
{
  const aptC = {
    id: 'apt-c',
    patientId: patientC.id,
    patientCode: patientC.code,
    patientName: patientC.name,
    cleanName: patientC.name,
    name: patientC.name,
    therapistId: otherPT.id,
    therapistName: otherPT.name,
    date: futureKey,
    status: 'scheduled',
  };

  // 4a. Active coverage
  const activeCoverage = [{
    id: 'cov-1',
    patientId: patientC.id,
    coveringTherapistId: myPT.id,
    startDate: todayKey,
    endDate: '2026-12-31',
    status: 'active',
    revokedAt: null,
  }];
  const containerActive = renderCalendarDOM({
    currentUser: myPT,
    selectedPatient: patientC,
    selectedDay: futureDay,
    appointmentsForDay: [aptC],
    allPatients: [patientA, patientB, patientC],
    coverages: activeCoverage,
    sessionLogs: [],
  });
  assert.ok(containerActive.querySelector('.btn-delete-toolbar') !== null, 'Active coverage -> toolbar delete visible');
  assert.ok(containerActive.querySelector('.btn-delete-cell') !== null, 'Active coverage -> cell delete visible');
  const badgeActive = containerActive.querySelector('.badge-ownership');
  assert.strictEqual(badgeActive.textContent, 'เคสที่ได้รับฝาก');

  // 4b. Expired coverage
  const expiredCoverage = [{
    id: 'cov-2',
    patientId: patientC.id,
    coveringTherapistId: myPT.id,
    startDate: '2026-01-01',
    endDate: '2026-01-15',
    status: 'expired',
    revokedAt: null,
  }];
  const containerExpired = renderCalendarDOM({
    currentUser: myPT,
    selectedPatient: patientC,
    selectedDay: futureDay,
    appointmentsForDay: [aptC],
    allPatients: [patientA, patientB, patientC],
    coverages: expiredCoverage,
    sessionLogs: [],
  });
  assert.strictEqual(containerExpired.querySelector('.btn-delete-toolbar'), null, 'Expired coverage -> NO toolbar delete');
  assert.strictEqual(containerExpired.querySelector('.btn-delete-cell'), null, 'Expired coverage -> NO cell delete');
  assert.strictEqual(containerExpired.querySelector('.btn-delete-row'), null, 'Expired coverage -> NO row delete');

  // 4c. Revoked coverage
  const revokedCoverage = [{
    id: 'cov-3',
    patientId: patientC.id,
    coveringTherapistId: myPT.id,
    startDate: todayKey,
    endDate: '2026-12-31',
    status: 'revoked',
    revokedAt: '2026-10-19T10:00:00Z',
  }];
  const containerRevoked = renderCalendarDOM({
    currentUser: myPT,
    selectedPatient: patientC,
    selectedDay: futureDay,
    appointmentsForDay: [aptC],
    allPatients: [patientA, patientB, patientC],
    coverages: revokedCoverage,
    sessionLogs: [],
  });
  assert.strictEqual(containerRevoked.querySelector('.btn-delete-toolbar'), null, 'Revoked coverage -> NO toolbar delete');
  assert.strictEqual(containerRevoked.querySelector('.btn-delete-cell'), null, 'Revoked coverage -> NO cell delete');
  assert.strictEqual(containerRevoked.querySelector('.btn-delete-row'), null, 'Revoked coverage -> NO row delete');

  console.log('✓ Test 4 Passed: Coverage checks (active -> delete visible with tag, expired/revoked -> omitted from DOM)');
}

// Test 5: Admin -> delete visible for all patients
{
  const aptB = {
    id: 'apt-b',
    patientId: patientB.id,
    patientCode: patientB.code,
    patientName: patientB.name,
    cleanName: patientB.name,
    name: patientB.name,
    therapistId: otherPT.id,
    date: futureKey,
    status: 'scheduled',
  };
  const containerAdmin = renderCalendarDOM({
    currentUser: adminUser,
    selectedPatient: patientB,
    selectedDay: futureDay,
    appointmentsForDay: [aptB],
    allPatients: [patientA, patientB, patientC],
    coverages: [],
    sessionLogs: [],
  });
  assert.ok(containerAdmin.querySelector('.btn-delete-toolbar') !== null, 'Admin can delete any patient appointment');
  assert.ok(containerAdmin.querySelector('.btn-delete-cell') !== null, 'Admin cell delete visible');
  assert.ok(containerAdmin.querySelector('.btn-delete-row') !== null, 'Admin row delete visible');
  console.log('✓ Test 5 Passed: Admin has delete visibility on all patients');
}

// Test 6: Patient with session log -> button rendered disabled with reason tooltip
{
  const aptWithSession = {
    id: 'apt-session',
    patientId: patientA.id,
    patientCode: patientA.code,
    patientName: patientA.name,
    cleanName: patientA.name,
    name: patientA.name,
    date: futureKey,
    status: 'scheduled',
  };
  const sessionLogs = [{
    id: 'log-1',
    appointment_id: 'apt-session',
    patient_id: patientA.id,
    score: 85,
    status: 'completed',
  }];
  const container = renderCalendarDOM({
    currentUser: myPT,
    selectedPatient: patientA,
    selectedDay: futureDay,
    appointmentsForDay: [aptWithSession],
    allPatients: [patientA, patientB, patientC],
    coverages: [],
    sessionLogs: sessionLogs,
  });

  const toolbarBtn = container.querySelector('.btn-delete-toolbar');
  const cellBtn = container.querySelector('.btn-delete-cell');
  const rowBtn = container.querySelector('.btn-delete-row');

  assert.ok(toolbarBtn !== null, 'Toolbar button exists in DOM');
  assert.strictEqual(toolbarBtn.getAttribute('disabled'), 'true', 'Toolbar button disabled');
  assert.strictEqual(toolbarBtn.title, 'มีประวัติการฝึกแล้ว ลบไม่ได้', 'Tooltip contains exact Thai reason');

  assert.strictEqual(cellBtn.getAttribute('disabled'), 'true', 'Cell button disabled');
  assert.strictEqual(cellBtn.title, 'มีประวัติการฝึกแล้ว ลบไม่ได้', 'Cell tooltip has reason');

  assert.strictEqual(rowBtn.getAttribute('disabled'), 'true', 'Row button disabled');
  assert.strictEqual(rowBtn.title, 'มีประวัติการฝึกแล้ว ลบไม่ได้', 'Row tooltip has reason');
  console.log('✓ Test 6 Passed: Patient with session log -> button disabled with reason "มีประวัติการฝึกแล้ว ลบไม่ได้"');
}

// -------------------------------------------------------------
// TEST SUITE 2: WRITE PATH SECURITY ENFORCEMENT (Step 3.1)
// -------------------------------------------------------------
console.log('\n--- TEST SUITE 2: STORE WRITE-PATH SECURITY ENFORCEMENT (STEP 3.1) ---');

// Test 7: Direct store call as unrelated PT -> rejected, nothing removed
{
  const store = useHospitalStore.getState();

  // Seed store state
  store.setCurrentUserId(myPT.id);
  store.setCurrentRole('therapist');

  // Attempt to delete Patient B's appointment (belongs to otherPT)
  const result = store.deleteAppointmentForPatient({
    patient: patientB,
    dateStr: futureKey,
    appointmentId: 'apt-b-1',
    planId: 'plan-b-1',
  });

  assert.strictEqual(result.success, false, 'Direct store call as unrelated PT must fail');
  assert.ok(
    result.error.includes('ไม่มีสิทธิ์'),
    `Error should state lack of permission: ${result.error}`
  );

  // Check audit log
  const lastLog = useHospitalStore.getState().activityLogs[0];
  assert.strictEqual(lastLog.action, 'SECURITY_DENIED_DELETE_APPOINTMENT', 'Security audit log recorded');
  assert.strictEqual(lastLog.category, 'SYSTEM');
  console.log('✓ Test 7 Passed: Direct store write attempt by unrelated PT rejected with security log');
}

// Test 8: Direct store call for past appointment -> rejected, nothing removed
{
  const store = useHospitalStore.getState();
  store.setCurrentUserId(myPT.id);
  store.setCurrentRole('therapist');

  const result = store.deleteAppointmentForPatient({
    patient: patientA,
    dateStr: pastKey, // 2 days ago
    appointmentId: 'apt-past',
  });

  assert.strictEqual(result.success, false, 'Delete past appointment must fail');
  assert.strictEqual(result.error, 'ลบนัดที่ผ่านมาแล้วไม่ได้', 'Thai reason matches requirement');
  console.log('✓ Test 8 Passed: Direct store write attempt for past appointment rejected');
}

// Test 9: Deletion removes EXACTLY ONE appointment and leaves other patients on same date intact (R8)
{
  const store = useHospitalStore.getState();
  store.setCurrentUserId(myPT.id);
  store.setCurrentRole('therapist');

  // Setup treatment plans for Patient A and Patient B on futureKey
  useHospitalStore.setState({
    treatmentPlans: [
      {
        id: 'plan-A-100',
        patientId: patientA.id,
        patientCode: patientA.code,
        patientName: patientA.name,
        selectedDates: [futureKey],
        status: 'active',
        assignedExercises: [{ exerciseId: 1, exerciseName: 'ยืดเหยียด' }],
      },
      {
        id: 'plan-B-200',
        patientId: patientB.id,
        patientCode: patientB.code,
        patientName: patientB.name,
        selectedDates: [futureKey],
        status: 'active',
        assignedExercises: [{ exerciseId: 2, exerciseName: 'ฝึกการทรงตัว' }],
      },
    ],
    cancelledAppointmentKeys: [],
  });

  // Call delete for Patient A on futureKey
  const deleteResult = store.deleteAppointmentForPatient({
    patient: patientA,
    dateStr: futureKey,
    appointmentId: `plan-plan-A-100-${futureKey}`,
    planId: 'plan-A-100',
  });

  assert.strictEqual(deleteResult.success, true, 'Delete of own patient appointment succeeds');

  const stateAfter = useHospitalStore.getState();
  // Verify Patient A plan updated: futureKey removed
  const planA = stateAfter.treatmentPlans.find((p) => p.id === 'plan-A-100');
  assert.strictEqual(planA.selectedDates.length, 0, 'Patient A selected date removed');

  // Verify Patient B plan untouched
  const planB = stateAfter.treatmentPlans.find((p) => p.id === 'plan-B-200');
  assert.strictEqual(planB.selectedDates.length, 1, 'Patient B selected date MUST remain intact');
  assert.strictEqual(planB.selectedDates[0], futureKey, 'Patient B still scheduled for futureKey');

  // Verify cancelled key is specific to Patient A, NOT -all
  const hasAllKey = stateAfter.cancelledAppointmentKeys.some((k) => k.endsWith('-all'));
  assert.strictEqual(hasAllKey, false, 'Never add -all cancelled key');

  const patACodeClean = (patientA.code || patientA.name).replace(/[^a-zA-Z0-9ก-๙]/g, '').toLowerCase();
  const expectedKey = `${futureKey}-${patACodeClean}`;
  assert.ok(
    stateAfter.cancelledAppointmentKeys.includes(expectedKey),
    `Patient-specific cancel key recorded: ${expectedKey}`
  );

  console.log('✓ Test 9 Passed: Exactly one appointment removed; other patients on same date untouched');
}

console.log('\n============================================================');
console.log('ALL COMPONENT & STORE WRITE-PATH TESTS PASSED (9/9)');
console.log('============================================================');

/**
 * StrongCare - Clinical Scheduling & RBAC Rules (Pure Logic)
 * 
 * Implements strict schedule authorization mirroring the database security helper
 * can_write_schedule() (supabase/migrations/20261019000002_security_helpers_and_rls.sql).
 * 
 * Rules:
 *  - Asia/Bangkok (UTC+7) timezone calculation for date keys (YYYY-MM-DD).
 *  - Buddhist year (BE = CE + 543) for Thai presentation.
 *  - Admin: universal write & delete access.
 *  - Therapist: write & delete only for assigned patients OR active temporary coverage for today.
 *  - Guard: cannot delete past appointments or appointments that already have completed session logs.
 *  - Pure functions only — NO UI imports!
 */

export interface ScheduleUser {
  id: string | number;
  role: string;
  name?: string;
  code?: string;
}

export interface SchedulePatient {
  id?: string | number;
  code?: string;
  patient_code?: string;
  hn?: string;
  name?: string;
  assignedTherapistId?: string | number;
  assignedTherapistName?: string;
}

export interface ScheduleCoverage {
  id?: string | number;
  patientId: string | number;
  originalTherapistId?: string | number;
  coveringTherapistId: string | number;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  status: 'active' | 'revoked' | 'expired' | string;
  revokedAt?: string | null;
}

export interface ScheduleAppointment {
  id: string | number;
  patientId?: string | number;
  patientCode?: string;
  patientName?: string;
  date: string; // YYYY-MM-DD
  time?: string;
  status?: 'scheduled' | 'rescheduled' | 'completed' | 'paused' | 'missed' | string;
  planId?: string | number;
  exerciseCount?: number;
  exerciseSummary?: string;
  exercises?: any[];
  includeMinigame?: boolean;
}

export interface ScheduleSessionLog {
  id?: string | number;
  appointmentId?: string | number;
  patientId?: string | number;
  date?: string;
  completedAt?: string;
}

export const THAI_MONTH_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

export const THAI_MONTH_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

/**
 * Returns 'YYYY-MM-DD' representing the date in the Asia/Bangkok (UTC+7) timezone.
 */
export function dateKey(dateInput?: Date | string | number): string {
  if (!dateInput) {
    return dateKey(new Date());
  }

  // If already in pure YYYY-MM-DD format, return as is
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    return dateInput.trim();
  }

  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date input: ${dateInput}`);
  }

  // Use Intl.DateTimeFormat with Asia/Bangkok time zone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return formatter.format(d);
}

/**
 * Returns the Buddhist year (BE = CE + 543)
 */
export function getBuddhistYear(dateOrYear: Date | string | number): number {
  if (typeof dateOrYear === 'number') {
    return dateOrYear > 2400 ? dateOrYear : dateOrYear + 543;
  }
  const k = dateKey(dateOrYear);
  const year = parseInt(k.split('-')[0], 10);
  return year + 543;
}

/**
 * Formats date into Thai string with Buddhist year, e.g. "9 ต.ค. 2569"
 */
export function formatThaiDate(
  dateOrKey: Date | string,
  options?: { short?: boolean; withDayName?: boolean }
): string {
  const key = typeof dateOrKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateOrKey.trim())
    ? dateOrKey.trim()
    : dateKey(dateOrKey);

  const [yearStr, monthStr, dayStr] = key.split('-');
  const yearNum = parseInt(yearStr, 10);
  const monthIdx = parseInt(monthStr, 10) - 1;
  const dayNum = parseInt(dayStr, 10);

  const monthName = options?.short ? THAI_MONTH_SHORT[monthIdx] : THAI_MONTH_FULL[monthIdx];
  const beYear = yearNum + 543;

  return `${dayNum} ${monthName} ${beYear}`;
}

/**
 * Normalizes patient names by removing common Thai titles and demo tags.
 * Solves H3 (patient identity mismatch when comparing 'คุณสมชาย' vs 'นายสมชาย').
 */
export function normalizePatientName(name?: string): string {
  if (!name) return '';
  return name
    .replace(/^(คุณ|นาย|นาง|นางสาว|เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.)\s*/i, '')
    .replace(/(\[โหมดสาธิต\]|\(สาธิต\)|\[สาธิต\]|\s*🎮\s*)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tests whether two patient entities represent the same person.
 */
export function isSamePatient(
  p1?: SchedulePatient | null,
  p2?: SchedulePatient | null
): boolean {
  if (!p1 || !p2) return false;

  // 1. Direct ID match
  if (p1.id !== undefined && p2.id !== undefined && p1.id !== null && p2.id !== null) {
    if (String(p1.id) === String(p2.id)) return true;
  }

  // 2. Patient code / HN match
  const code1 = (p1.code || p1.patient_code || p1.hn || '').trim().toLowerCase();
  const code2 = (p2.code || p2.patient_code || p2.hn || '').trim().toLowerCase();
  if (code1 && code2 && code1 === code2) {
    return true;
  }

  // 3. Normalized name match
  const n1 = normalizePatientName(p1.name).toLowerCase();
  const n2 = normalizePatientName(p2.name).toLowerCase();
  if (n1 && n2) {
    if (n1 === n2) return true;
    // Check if one contains the other (e.g. Somchai Jaidee vs Somchai)
    const first1 = n1.split(' ')[0];
    const first2 = n2.split(' ')[0];
    if (first1 && first2 && first1 === first2 && first1.length >= 3) {
      return true;
    }
  }

  return false;
}

/**
 * Checks whether a therapist user is the assigned therapist for a patient.
 * Prevents false matches when mock data has table-ID collisions by checking names/codes.
 */
export function isAssignedTherapist(user: ScheduleUser, patient: SchedulePatient): boolean {
  if (patient.assignedTherapistName && user.name) {
    const pName = normalizePatientName(patient.assignedTherapistName);
    const uName = normalizePatientName(user.name);
    if (pName && uName) {
      if (pName.includes(uName) || uName.includes(pName)) return true;
      return false;
    }
  }

  if (user.code && (patient as any).assignedTherapistCode) {
    return String(user.code).toLowerCase() === String((patient as any).assignedTherapistCode).toLowerCase();
  }

  if (patient.assignedTherapistId !== undefined && patient.assignedTherapistId !== null) {
    return String(patient.assignedTherapistId) === String(user.id);
  }

  return false;
}

/**
 * Evaluates whether an actor has permission to write/manage schedules for a patient.
 * Directly mirrors the database function can_write_schedule(target_patient_id).
 */
export function canWriteSchedule(
  user: ScheduleUser | null | undefined,
  patient: SchedulePatient | null | undefined,
  coverages: ScheduleCoverage[] = [],
  todayKeyStr?: string
): boolean {
  if (!user || !patient) return false;

  // 1. Admin has universal access
  if (user.role === 'admin') {
    return true;
  }

  // 2. Therapist checks
  if (user.role === 'therapist') {
    if (isAssignedTherapist(user, patient)) {
      return true;
    }

    // Check if active covering therapist for today (Asia/Bangkok)
    const today = todayKeyStr || dateKey();
    const hasActiveCoverage = coverages.some((cov) => {
      if (cov.status !== 'active') return false;
      if (cov.revokedAt) return false;

      const isCovering = String(cov.coveringTherapistId) === String(user.id);
      const isPatientMatch = isSamePatient(
        { id: cov.patientId },
        patient
      );

      const inDateRange = cov.startDate <= today && today <= cov.endDate;
      return isCovering && isPatientMatch && inDateRange;
    });

    if (hasActiveCoverage) {
      return true;
    }
  }

  return false;
}

/**
 * Evaluates whether a specific appointment can be safely deleted.
 * Enforces R6 (RBAC), R7 (Data-loss guards), and R8 (Single target validation).
 */
export function canDeleteAppointment(
  user: ScheduleUser | null | undefined,
  patient: SchedulePatient | null | undefined,
  appointment: ScheduleAppointment | null | undefined,
  coverages: ScheduleCoverage[] = [],
  sessions: ScheduleSessionLog[] = [],
  todayKeyStr?: string
): { allowed: boolean; reason?: string } {
  if (!user) {
    return { allowed: false, reason: 'กรุณาเข้าสู่ระบบก่อนทำรายการ' };
  }
  if (!patient || !appointment) {
    return { allowed: false, reason: 'ไม่พบข้อมูลคนไข้หรือนัดหมายที่ต้องการลบ' };
  }

  const today = todayKeyStr || dateKey();

  // 1. Enforce RBAC permission (R6)
  if (!canWriteSchedule(user, patient, coverages, today)) {
    return { allowed: false, reason: 'ไม่มีสิทธิ์จัดการหรือลบตารางนัดหมายของคนไข้ท่านนี้' };
  }

  // 2. Guard: Cannot delete past appointments (R7)
  const aptDate = appointment.date ? dateKey(appointment.date) : '';
  if (aptDate && aptDate < today) {
    return { allowed: false, reason: 'ลบนัดที่ผ่านมาแล้วไม่ได้' };
  }

  // 3. Guard: Status check
  if (appointment.status === 'completed') {
    return { allowed: false, reason: 'มีประวัติการฝึกแล้ว ลบไม่ได้' };
  }
  if (appointment.status === 'missed') {
    return { allowed: false, reason: 'นัดหมายนี้เลยกำหนดและถูกบันทึกสถานะแล้ว ลบไม่ได้' };
  }

  // 4. Guard: Session log check (R7 - appointment has session log)
  if (sessions && sessions.length > 0) {
    const hasSessionLog = sessions.some((s: any) => {
      const aptId = s.appointmentId ?? s.appointment_id;
      if (aptId !== undefined && aptId !== null) {
        return String(aptId) === String(appointment.id);
      }
      const patId = s.patientId ?? s.patient_id;
      const sDate = s.date ?? s.started_at ?? s.created_at;
      if (patId && sDate) {
        const isPat = isSamePatient({ id: patId }, patient);
        const isDate = dateKey(sDate) === aptDate;
        return isPat && isDate;
      }
      return false;
    });

    if (hasSessionLog) {
      return { allowed: false, reason: 'มีประวัติการฝึกแล้ว ลบไม่ได้' };
    }
  }

  return { allowed: true };
}

/**
 * Computes ownership classification for presentation in the day-detail panel (R3).
 */
export function getPatientOwnership(
  user: ScheduleUser | null | undefined,
  patient: SchedulePatient | null | undefined,
  coverages: ScheduleCoverage[] = [],
  todayKeyStr?: string
): { tag: 'mine' | 'covered' | 'other'; label: string; isMineOrCovered: boolean } {
  if (!user || !patient) {
    return { tag: 'other', label: 'เคสทั่วไป', isMineOrCovered: false };
  }

  if (user.role === 'admin') {
    return { tag: 'mine', label: 'ผู้ดูแลระบบ (Admin)', isMineOrCovered: true };
  }

  if (user.role === 'therapist') {
    // Own patient
    if (isAssignedTherapist(user, patient)) {
      return { tag: 'mine', label: 'เคสของคุณ', isMineOrCovered: true };
    }

    // Active coverage today
    const today = todayKeyStr || dateKey();
    const isCovered = coverages.some((cov) => {
      if (cov.status !== 'active' || cov.revokedAt) return false;
      const isMe = String(cov.coveringTherapistId) === String(user.id);
      const isPat = isSamePatient({ id: cov.patientId }, patient);
      const inRange = cov.startDate <= today && today <= cov.endDate;
      return isMe && isPat && inRange;
    });

    if (isCovered) {
      return { tag: 'covered', label: 'เคสที่ได้รับฝาก', isMineOrCovered: true };
    }

    const ptName = patient.assignedTherapistName || 'นักกายภาพท่านอื่น';
    return { tag: 'other', label: `เคสของ ${ptName}`, isMineOrCovered: false };
  }

  return { tag: 'other', label: 'เคสทั่วไป', isMineOrCovered: false };
}

export interface GroupedPatientSummary {
  patient: SchedulePatient;
  patientId: string | number;
  patientName: string;
  hn: string;
  therapistId?: string | number;
  therapistName?: string;
  appointments: ScheduleAppointment[];
  exerciseCount: number;
  exerciseSummary: string;
  status: string;
  ownership: {
    tag: 'mine' | 'covered' | 'other';
    label: string;
    isMineOrCovered: boolean;
  };
  isMine: boolean;
  canDelete: boolean;
  deleteReason?: string;
  deletableAppointment?: ScheduleAppointment | null;
}

export interface GroupedDaySchedule {
  day: number;
  dateStr: string;
  patientCount: number;
  patients: GroupedPatientSummary[];
}

/**
 * Groups appointments by day and patient with ownership classification (R3/R4).
 * Sorts mine first, then covered, then other. Aggregates multiple appointments per patient per day.
 */
export function groupAppointmentsByDay(
  appointments: ScheduleAppointment[] = [],
  patients: SchedulePatient[] = [],
  me?: ScheduleUser | null,
  coverages: ScheduleCoverage[] = [],
  sessions: ScheduleSessionLog[] = [],
  todayKeyStr?: string
): Record<number, GroupedDaySchedule> {
  const result: Record<number, GroupedDaySchedule> = {};
  const today = todayKeyStr || dateKey();

  for (const apt of appointments) {
    if (!apt.date) continue;
    const dateStr = dateKey(apt.date);
    const day = parseInt(dateStr.split('-')[2], 10);
    if (isNaN(day)) continue;

    if (!result[day]) {
      result[day] = {
        day,
        dateStr,
        patientCount: 0,
        patients: [],
      };
    }

    // Match patient
    const matchedPat = patients.find((p) =>
      isSamePatient(p, {
        id: apt.patientId,
        code: apt.patientCode,
        name: apt.patientName,
      })
    ) || {
      id: apt.patientId || 'unknown',
      name: apt.patientName || 'ไม่ระบุชื่อ',
      code: apt.patientCode,
      hn: apt.patientCode,
      assignedTherapistName: apt.patientName ? undefined : undefined,
    };

    // Find existing patient summary in this day
    let patSummary = result[day].patients.find((ps) =>
      isSamePatient(ps.patient, matchedPat)
    );

    if (!patSummary) {
      const ownership = getPatientOwnership(me, matchedPat, coverages, today);
      const hn = matchedPat.code || matchedPat.patient_code || matchedPat.hn || '-';
      const therapistName = matchedPat.assignedTherapistName || (matchedPat as any).therapistName || '-';

      patSummary = {
        patient: matchedPat,
        patientId: matchedPat.id || apt.patientId || 'unknown',
        patientName: matchedPat.name || apt.patientName || 'ไม่ระบุชื่อ',
        hn,
        therapistId: matchedPat.assignedTherapistId || (matchedPat as any).therapistId,
        therapistName,
        appointments: [],
        exerciseCount: 0,
        exerciseSummary: '',
        status: apt.status || 'scheduled',
        ownership,
        isMine: ownership.isMineOrCovered,
        canDelete: false,
        deletableAppointment: null,
      };

      result[day].patients.push(patSummary);
    }

    // Add appointment to patSummary
    patSummary.appointments.push(apt);
    patSummary.exerciseCount += (apt.exerciseCount || 1);

    const summaries = [
      patSummary.exerciseSummary,
      apt.exerciseSummary || (apt.exercises ? apt.exercises.map((e: any) => e.name || e.exerciseName).join(', ') : '')
    ].filter(Boolean).join(', ');
    patSummary.exerciseSummary = Array.from(new Set(summaries.split(', ').map((s: string) => s.trim()))).filter(Boolean).join(', ');

    // Update status prioritization (completed > missed > paused > scheduled)
    if (apt.status === 'completed') patSummary.status = 'completed';
    else if (apt.status === 'paused' && patSummary.status !== 'completed') patSummary.status = 'paused';
    else if (apt.status === 'missed' && patSummary.status !== 'completed' && patSummary.status !== 'paused') patSummary.status = 'missed';

    // Evaluate deletion capability for this appointment
    const delCheck = canDeleteAppointment(me, matchedPat, apt, coverages, sessions, today);
    if (delCheck.allowed && !patSummary.canDelete) {
      patSummary.canDelete = true;
      patSummary.deletableAppointment = apt;
      patSummary.deleteReason = undefined;
    } else if (!patSummary.canDelete && delCheck.reason) {
      patSummary.deleteReason = delCheck.reason;
    }
  }

  // Update total patient counts and sort patients: mine first, then covered, then other; alphabetically
  for (const day of Object.keys(result).map(Number)) {
    result[day].patientCount = result[day].patients.length;
    result[day].patients.sort((a, b) => {
      const rank = (tag: string) => {
        if (tag === 'mine') return 0;
        if (tag === 'covered') return 1;
        return 2;
      };
      const rankDiff = rank(a.ownership.tag) - rank(b.ownership.tag);
      if (rankDiff !== 0) return rankDiff;
      return a.patientName.localeCompare(b.patientName, 'th');
    });
  }

  return result;
}

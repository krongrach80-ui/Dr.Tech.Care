/**
 * StrongCare - Hospital Administration, RBAC & Clinical Management Types
 */

export type UserRole = 'admin' | 'therapist' | 'patient';
export type UserStatus = 'active' | 'suspended';

export interface UserAccount {
  id: number | string;
  username: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  code: string; // e.g. P-0012, T-003, ADM-01
  password?: string;
  assignedTherapistName?: string;
  assignedTherapistId?: number | string;
  phone?: string;
  email?: string;
  age?: number;
  gender?: 'male' | 'female' | 'other';
  diagnosis?: string;
  chiefComplaint?: string;       // ประวัติการซักประวัติ
  patientBackground?: string;    // ประวัติคนไข้ตามปกติ / โรคประจำตัว
  treatmentOutcome?: string;     // ผลการรักษา
  therapistNotes?: string;       // โน้ต/ข้อความคำแนะนำจากนักกายภาพ
  created_at: string;
  last_active?: string;
  must_change_password?: boolean;
  temp_password?: string;
}

export interface PhysicalTherapist {
  id: number | string;
  code: string; // T-003
  name: string;
  specialty: string;
  phone: string;
  email: string;
  activePatientsCount: number;
  assignedCases?: string[];      // รายชื่อเคสที่รับผิดชอบ
  bio?: string;                  // ประวัติส่วนตัว & การศึกษา
  status: 'active' | 'on_leave' | 'suspended';
  licenseNumber: string;
}

export interface HospitalExercise {
  id: number | string;
  name: string;
  englishName: string;
  category: string;
  targetJoint: string;
  targetAngle: number;
  holdSeconds: number;
  description: string;
  cautions: string;
  svgType?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  repsPerSet?: number;
  sets?: number;
  contraindications?: string;
}

export interface PrescribedExercise {
  exerciseSlug: string;
  exerciseName: string;
  sets: number;
  reps: number;
  holdSeconds: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

export interface TreatmentPlan {
  id: number | string;
  patientId: number | string;
  patientName: string;
  patientCode: string;
  therapistId: number | string;
  therapistName: string;
  diagnosis: string;
  targetJoint: string;
  assignedExercises: PrescribedExercise[];
  clinicalNotes: string;
  createdAt: string;
  updatedAt?: string;
  status: 'active' | 'completed' | 'paused';
  // Timetable Scheduling (ตารางจัดเวลาเหมือนตารางเรียน)
  scheduleDays?: string[];  // วันที่ลงฝึก เช่น ['จันทร์', 'พุธ', 'ศุกร์']
  timeSlot?: string;        // ช่วงเวลา เช่น '09:30 - 10:30'
  startTime?: string;       // เวลาเริ่มต้น เช่น '09:30'
  endTime?: string;         // เวลาสิ้นสุด เช่น '10:30'
  startDate?: string;       // วัน/เดือน/ปี เริ่มต้น เช่น '2026-10-01'
  endDate?: string;         // วัน/เดือน/ปี สิ้นสุด เช่น '2026-10-31'
  roomStation?: string;     // ห้อง/ตู้ฝึก เช่น 'ตู้ Kiosk 1'
}

export interface ActivityLog {
  id: number | string;
  timestamp: string;
  userId: number | string;
  userName: string;
  role: UserRole;
  action: string;
  category: 'AUTH' | 'PATIENT' | 'THERAPIST' | 'TREATMENT' | 'SYSTEM' | 'AI';
  details: string;
  device?: string;       // อุปกรณ์/เบราว์เซอร์
  ipAddress?: string;    // IP Address
  isBannedDevice?: boolean;
  isBannedIp?: boolean;
}

export interface PatientSymptomReport {
  id: number | string;
  patientId: number | string;
  patientName: string;
  therapistId: number | string;
  reportedAt: string;
  symptomType: 'pain' | 'dizziness' | 'fatigue' | 'difficulty' | 'other';
  severity: 1 | 2 | 3 | 4 | 5; // 1-5 pain score
  affectedArea: string;
  description: string;
  status: 'pending' | 'reviewed';
  therapistReply?: string;
}

export interface AiSystemSettings {
  similarityThreshold: number; // default 0.80
  marginThreshold: number;     // default 0.08
  minVisibilityThreshold: number; // default 0.55
  poseConfidenceThreshold: number; // default 0.65
  toleranceDeg: number;        // default 10
  maxTrunkLeanDeg: number;     // default 22
  maxVelocityDegPerSec: number; // default 220
  modelVersion: string;
  enableVoiceGuidance: boolean;
  enableAutoSync: boolean;
  strictLivenessChallenge: boolean;
}

/**
 * StrongCare - Hospital Administration, RBAC & Clinical Management Types
 */

export type UserRole = 'admin' | 'therapist' | 'patient';
export type UserStatus = 'active' | 'suspended' | 'pending_info' | 'disabled';

export interface MedicalNoteItem {
  id: string | number;
  date: string;
  author: string;
  text?: string;
  note?: string;
  role?: UserRole;
}

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
  chiefComplaint?: string;       // ประวัติการซักประวัติ / อาการเริ่มต้น
  patientBackground?: string;    // ประวัติคนไข้ตามปกติ / โรคประจำตัว
  underlyingDiseases?: string;   // โรคประจำตัว (default "-")
  drugAllergies?: string;        // แพ้ยา/สารอาหาร (default "-")
  admissionDate?: string;        // วันที่เริ่มรับการรักษา (Admission Date)
  treatmentStatus?: 'active' | 'discharged' | 'on_hold'; // สถานะการรักษา
  progressPercent?: number;      // ความก้าวหน้าการฟื้นฟู (%)
  medicalNotesHistory?: MedicalNoteItem[]; // ประวัติโน้ตทางการแพทย์
  treatmentOutcome?: string;     // ผลการรักษา
  therapistNotes?: string;       // โน้ต/ข้อความคำแนะนำจากนักกายภาพ
  created_at: string;
  last_active?: string;
  must_change_password?: boolean;
  temp_password?: string;
  pendingInfoNote?: string;      // e.g. 'บัญชีนี้สแกนหน้าแล้ว รอลงข้อมูลส่วนตัว'
  biometricVector?: number[];    // 128-D embedding vector for biometric authentication
  face_vector?: number[] | string; // 128-D embedding vector for patient biometric authentication
  face_image_url?: string;       // Path or Data URL pointing to the patient's registered facial photo
  faceRegisteredAt?: string;     // Timestamp when face was enrolled at kiosk
  faceStatus?: 'registered' | 'pending'; // Face ID Status
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
  photoUrl?: string;             // รูปโปรไฟล์
  status: 'active' | 'on_leave' | 'suspended';
  licenseNumber: string;
}

export interface TemporaryCaseDelegation {
  id: string | number;
  patientId: number | string;
  patientName: string;
  patientCode: string;
  originalTherapistId: number | string;
  originalTherapistName: string;
  coveringTherapistId: number | string;
  coveringTherapistName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  reason: string;
  status: 'active' | 'revoked' | 'expired';
  createdAt: string;
}

export interface HospitalExercise {
  id: number | string;
  name: string;
  englishName: string;
  category: string;
  targetJoint: string;
  targetAngle: number;
  minAngle?: number;
  maxAngle?: number;
  holdSeconds: number;
  description: string;
  cautions: string;
  warnings?: string;
  svgType?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  repsPerSet?: number;
  sets?: number;
  contraindications?: string;
  imageUrl?: string;
  demoImageUrl?: string;
  type?: 'single' | 'preset';
  defaultReps?: number;
  defaultSets?: number;
  createdBy?: string;
  benefits?: string;
  instructions?: string | string[];
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
}

export interface PrescribedExercise {
  exerciseSlug: string;
  exerciseName: string;
  sets: number;
  reps: number;
  holdSeconds: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

export interface ExerciseModpack {
  id: string | number;
  name: string;
  description?: string;
  category?: string;
  targetJoint?: string;
  icon?: string;
  exercises: PrescribedExercise[];
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}

export interface TrainingModes {
  rom: {
    enabled: boolean;
    type: 'pack' | 'custom';
    packId?: string;
    packName?: string;
    poseIds: string[];
    exercises?: PrescribedExercise[];
  };
  minigame: {
    enabled: boolean;
    questionCount: number;
  };
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
  scheduledDates?: (string | { date: string; status: 'scheduled' | 'completed' | 'missed_rescheduled' })[];
  selectedDates?: string[]; // วันที่ระบุเฉพาะเจาะจง เช่น ['2026-10-16', '2026-10-19', '2026-10-21']
  timeSlot?: string;        // ช่วงเวลา เช่น '09:30 - 10:30'
  startTime?: string;       // เวลาเริ่มต้น เช่น '09:30'
  endTime?: string;         // เวลาสิ้นสุด เช่น '10:30'
  startDate?: string;       // วัน/เดือน/ปี เริ่มต้น เช่น '2026-10-01'
  endDate?: string;         // วัน/เดือน/ปี สิ้นสุด เช่น '2026-10-31'
  roomStation?: string;     // ห้อง/ตู้ฝึก เช่น 'ตู้ Kiosk 1'
  includeMinigame?: boolean; // รวมมินิเกมฝึกสมองและการตอบสนอง (Interactive Quiz) ในคอร์สประจำวัน
  include_minigame?: boolean; // snake_case compatibility alias
  minigameQuestionCount?: number; // จำนวนคำถามมินิเกมฝึกสมอง เช่น 20 ข้อ
  trainingModes?: TrainingModes;  // โครงสร้างต่อ 1 นัด (ROM + มินิเกม)
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
  status?: string;
  device?: string;       // อุปกรณ์/เบราว์เซอร์
  ipAddress?: string;    // IP Address
  isBannedDevice?: boolean;
  isBannedIp?: boolean;
  securityStatus?: 'normal' | 'suspicious' | 'warning';
  userCode?: string;
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

import { z } from 'zod';

// ==============================================================================
// 1. USER & AUTH SCHEMAS
// ==============================================================================

export const UserRoleSchema = z.enum(['admin', 'pt', 'patient']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserStatusSchema = z.enum(['active', 'disabled']);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export const GenderSchema = z.enum(['male', 'female', 'other']);
export type Gender = z.infer<typeof GenderSchema>;

export const TreatmentStatusSchema = z.enum(['active', 'discharged']);
export type TreatmentStatus = z.infer<typeof TreatmentStatusSchema>;

export const DepartmentSchema = z.enum(['Musculoskeletal', 'Neurological', 'Geriatric', 'Sports PT']);
export type Department = z.infer<typeof DepartmentSchema>;

export const UserSchema = z.object({
  id: z.string(), // A-###, T-###, P-####
  full_name: z.string().min(2),
  username: z.string().min(3),
  password_hash: z.string().default('Hashed ●●●●'),
  role: UserRoleSchema,
  phone: z.string().default('-'),
  email: z.string().default('-'),
  status: UserStatusSchema.default('active'),
  must_change_password: z.number().int().default(0),
  face_id_status: z.enum(['Registered', 'Pending']).optional(),
  created_at: z.string(),
  updated_at: z.string().optional(),
  // Patient Profile Fields (when role === 'patient')
  age: z.number().optional(),
  gender: GenderSchema.optional(),
  admission_date: z.string().optional(),
  assigned_pt_id: z.string().nullable().optional(),
  assigned_pt_name: z.string().nullable().optional(),
  treatment_status: TreatmentStatusSchema.optional(),
  initial_symptoms: z.string().nullable().optional(),
  underlying_diseases: z.string().default('-').optional(),
  drug_allergies: z.string().default('-').optional(),
  // PT Profile Fields (when role === 'pt')
  license_number: z.string().optional(),
  department: DepartmentSchema.optional(),
  bio: z.string().nullable().optional(),
  active_case_count: z.number().optional(),
  is_covering: z.boolean().optional(),
});
export type User = z.infer<typeof UserSchema>;

export const CreateUserWizardSchema = z.object({
  role: UserRoleSchema,
  full_name: z.string().min(2, 'Full name is required (อย่างน้อย 2 ตัวอักษร)'),
  username: z.string().min(3, 'Username must be at least 3 characters'),
  id: z.string().min(3, 'Unique ID is required (e.g. P-1005, T-004, A-003)'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirm_password: z.string().min(6, 'Confirm password must match'),
  phone: z.string().default('-'),
  email: z.string().default('-'),
  // Role = Patient fields
  age: z.coerce.number().min(1).max(120).optional(),
  gender: GenderSchema.default('male'),
  admission_date: z.string().optional(),
  assigned_pt_id: z.string().nullable().optional(),
  initial_symptoms: z.string().optional(),
  underlying_diseases: z.string().default('-'),
  drug_allergies: z.string().default('-'),
  // Role = PT fields
  license_number: z.string().optional(),
  department: DepartmentSchema.default('Musculoskeletal'),
  bio: z.string().optional(),
  initial_assigned_patients: z.array(z.string()).optional(),
}).refine((data) => data.password === data.confirm_password, {
  message: "Passwords do not match (รหัสผ่านไม่ตรงกัน)",
  path: ["confirm_password"],
});
export type CreateUserWizardInput = z.infer<typeof CreateUserWizardSchema>;

// ==============================================================================
// 2. EXERCISE & PRESET SCHEMAS
// ==============================================================================

export const ExerciseCategorySchema = z.enum(['Neck', 'Shoulder', 'Back', 'Arm', 'Leg', 'Minigame']);
export type ExerciseCategory = z.infer<typeof ExerciseCategorySchema>;

export const ExerciseTypeSchema = z.enum(['single', 'preset']);
export type ExerciseType = z.infer<typeof ExerciseTypeSchema>;

export const PresetItemSchema = z.object({
  id: z.number().optional(),
  preset_id: z.string(),
  exercise_id: z.string(),
  order_index: z.number().default(0),
  reps: z.number().default(10),
  sets: z.number().default(3),
  rest_seconds: z.number().default(30),
  exercise_name_th: z.string().optional(),
  exercise_name_en: z.string().optional(),
});
export type PresetItem = z.infer<typeof PresetItemSchema>;

export const ExerciseSchema = z.object({
  id: z.string(), // MG-##, PS-##, EX-##
  name_th: z.string().min(1),
  name_en: z.string().min(1),
  category: ExerciseCategorySchema,
  type: ExerciseTypeSchema.default('single'),
  default_reps: z.number().int().default(10),
  default_sets: z.number().int().default(3),
  default_rest_seconds: z.number().int().default(30),
  instructions: z.string().nullable().optional(),
  benefits: z.string().nullable().optional(),
  media_path: z.string().nullable().optional(),
  is_active: z.number().int().default(1),
  created_by: z.string(),
  created_by_name: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string().optional(),
  preset_items: z.array(PresetItemSchema).optional(),
});
export type Exercise = z.infer<typeof ExerciseSchema>;

// ==============================================================================
// 3. APPOINTMENT & ROUTINE SCHEMAS
// ==============================================================================

export const AppointmentStatusSchema = z.enum(['scheduled', 'completed', 'missed', 'cancelled']);
export type AppointmentStatus = z.infer<typeof AppointmentStatusSchema>;

export const RoutineItemSchema = z.object({
  id: z.number().optional(),
  appointment_id: z.number(),
  exercise_id: z.string(),
  order_index: z.number().default(0),
  reps: z.number().default(10),
  sets: z.number().default(3),
  rest_seconds: z.number().default(30),
  custom_instructions: z.string().nullable().optional(),
  status: z.enum(['pending', 'completed', 'skipped']).default('pending'),
  exercise_name_th: z.string().optional(),
  exercise_name_en: z.string().optional(),
  category: z.string().optional(),
  exercise: ExerciseSchema.optional(),
});
export type RoutineItem = z.infer<typeof RoutineItemSchema>;

export const AppointmentSchema = z.object({
  id: z.number(),
  patient_id: z.string(),
  patient_name: z.string().optional(),
  pt_id: z.string().nullable().optional(),
  pt_name: z.string().nullable().optional(),
  appointment_date: z.string(), // YYYY-MM-DD
  status: AppointmentStatusSchema.default('scheduled'),
  notes: z.string().nullable().optional(),
  created_by: z.string(),
  created_at: z.string(),
  updated_at: z.string().optional(),
  routine_items: z.array(RoutineItemSchema).optional(),
});
export type Appointment = z.infer<typeof AppointmentSchema>;

// ==============================================================================
// 4. SESSION LOGS (Kiosk to Module 2 Tab 3 Analytics)
// ==============================================================================

export const SessionLogSchema = z.object({
  id: z.number(),
  appointment_id: z.number().nullable().optional(),
  patient_id: z.string(),
  exercise_id: z.string(),
  exercise_name_th: z.string().optional(),
  exercise_name_en: z.string().optional(),
  started_at: z.string(),
  ended_at: z.string(),
  correct_reps: z.number().default(0),
  incorrect_reps: z.number().default(0),
  accuracy_percent: z.number().default(0),
  score: z.number().default(0),
  duration_seconds: z.number().default(0),
  status: z.enum(['completed', 'partial']).default('completed'),
  created_at: z.string(),
});
export type SessionLog = z.infer<typeof SessionLogSchema>;

// ==============================================================================
// 5. MEDICAL NOTES (Strictly Append-Only)
// ==============================================================================

export const MedicalNoteSchema = z.object({
  id: z.number(),
  patient_id: z.string(),
  author_id: z.string(),
  author_role: z.enum(['admin', 'pt']),
  author_name: z.string(),
  header_stamp: z.string(), // [DD/MM/YYYY HH:mm - Logged by PT: Name]
  note_content: z.string().min(1),
  referenced_note_id: z.number().nullable().optional(),
  created_at: z.string(),
});
export type MedicalNote = z.infer<typeof MedicalNoteSchema>;

// ==============================================================================
// 6. TEMPORARY CASE DELEGATION
// ==============================================================================

export const TemporaryCoverageSchema = z.object({
  id: z.number(),
  patient_id: z.string(),
  patient_name: z.string().optional(),
  owner_pt_id: z.string(),
  owner_pt_name: z.string().optional(),
  cover_pt_id: z.string(),
  cover_pt_name: z.string().optional(),
  start_date: z.string(),
  end_date: z.string(),
  reason: z.string().nullable().optional(),
  status: z.enum(['active', 'revoked', 'expired']).default('active'),
  created_by: z.string(),
  revoked_by: z.string().nullable().optional(),
  revoked_at: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string().optional(),
});
export type TemporaryCoverage = z.infer<typeof TemporaryCoverageSchema>;

// ==============================================================================
// 7. AUDIT LOGS & SECURITY
// ==============================================================================

export const AuditLogSchema = z.object({
  id: z.number(),
  user_id: z.string().nullable().optional(),
  user_name: z.string().nullable().optional(),
  user_role: z.string().nullable().optional(),
  ip_address: z.string(),
  device_type: z.enum(['Desktop', 'Kiosk', 'Mobile']).default('Desktop'),
  action: z.string(),
  details: z.string().nullable().optional(),
  security_status: z.enum(['Normal', 'Suspicious']).default('Normal'),
  created_at: z.string(),
});
export type AuditLog = z.infer<typeof AuditLogSchema>;

export const BannedIpSchema = z.object({
  id: z.number(),
  ip_address: z.string(),
  reason: z.string(),
  banned_by: z.string(),
  banned_by_name: z.string().optional(),
  banned_at: z.string(),
  is_active: z.number().default(1),
});
export type BannedIp = z.infer<typeof BannedIpSchema>;

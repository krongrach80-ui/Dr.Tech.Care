-- ============================================================================
-- DR.TECH.CARE: Phase 1 - Migration 1: Core Schema, Extensions & Data Backfill
-- Additive, idempotent migration ensuring all existing data survives.
-- WARNING: Do NOT use legacy init_all.sql or schema.sql; they contain hardcoded
--          dev passwords. Only execute official timestamped migrations.
-- ============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Enhance Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'therapist', 'patient')),
  phone text,
  email text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Ensure username conforms to [a-z0-9._-]{3,32} with NOT VALID to prevent aborting on legacy usernames
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_username_format_check'
  ) THEN
    ALTER TABLE public.profiles 
      ADD CONSTRAINT profiles_username_format_check 
      CHECK (username ~ '^[a-z0-9._-]{3,32}$') NOT VALID;
  END IF;
END $$;

-- Sequence for server-side HN generation (P-####)
CREATE SEQUENCE IF NOT EXISTS public.patient_hn_seq START WITH 1001;

-- 3. Enhance Patients Table (profile_id is nullable; patients do not have auth accounts)
CREATE TABLE IF NOT EXISTS public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  patient_code text,
  full_name text NOT NULL,
  age int,
  gender text,
  phone text,
  chief_complaint text,
  medical_history text,
  treatment_outcome text,
  therapist_notes text,
  responsible_therapist_id uuid REFERENCES public.profiles(id),
  started_at date DEFAULT current_date,
  status text DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'discharged', 'pending_info')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Ensure all columns read by migrations and services exist if legacy table was present
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS patient_code text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS hn text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS age int;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS pin_hash text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS face_vector jsonb;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS chief_complaint text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS medical_history text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS treatment_outcome text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS therapist_notes text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS responsible_therapist_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS started_at date DEFAULT current_date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS admission_date date DEFAULT current_date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS assigned_therapist_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS underlying_diseases text NOT NULL DEFAULT '-';
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS drug_allergies text NOT NULL DEFAULT '-';
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS treatment_status text NOT NULL DEFAULT 'active' CHECK (treatment_status IN ('active', 'discharged'));
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS progress_pct numeric NOT NULL DEFAULT 0;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS face_registered boolean NOT NULL DEFAULT false;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS face_enrolled_at timestamptz;

-- Drop NOT NULL on legacy patient_code if present
ALTER TABLE public.patients ALTER COLUMN patient_code DROP NOT NULL;

-- Trigger to keep patient_code and hn in sync bidirectionally & auto-generate HN if blank
CREATE OR REPLACE FUNCTION public.trg_sync_patient_hn_and_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.hn IS NULL AND NEW.patient_code IS NOT NULL THEN
    NEW.hn := NEW.patient_code;
  ELSIF NEW.patient_code IS NULL AND NEW.hn IS NOT NULL THEN
    NEW.patient_code := NEW.hn;
  ELSIF NEW.hn IS NULL AND NEW.patient_code IS NULL THEN
    NEW.hn := 'P-' || lpad(nextval('public.patient_hn_seq')::text, 4, '0');
    NEW.patient_code := NEW.hn;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.hn IS DISTINCT FROM OLD.hn AND NEW.patient_code IS NOT DISTINCT FROM OLD.patient_code THEN
      NEW.patient_code := NEW.hn;
    ELSIF NEW.patient_code IS DISTINCT FROM OLD.patient_code AND NEW.hn IS NOT DISTINCT FROM OLD.hn THEN
      NEW.hn := NEW.patient_code;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_patients_sync_hn_code ON public.patients;
CREATE TRIGGER trg_patients_sync_hn_code
BEFORE INSERT OR UPDATE ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_patient_hn_and_code();

-- Backfill HN from patient_code
UPDATE public.patients
SET hn = patient_code
WHERE hn IS NULL AND patient_code IS NOT NULL;

-- Backfill patient_code from HN
UPDATE public.patients
SET patient_code = hn
WHERE patient_code IS NULL AND hn IS NOT NULL;

-- Backfill admission_date from started_at
UPDATE public.patients
SET admission_date = started_at
WHERE admission_date IS NULL AND started_at IS NOT NULL;

-- Backfill assigned_therapist_id from responsible_therapist_id
-- Checks both public.profiles and legacy public.therapists mapping
UPDATE public.patients p
SET assigned_therapist_id = COALESCE(
  (SELECT prof.id FROM public.profiles prof WHERE prof.id = p.responsible_therapist_id),
  (SELECT t.profile_id FROM public.therapists t WHERE t.id = p.responsible_therapist_id)
)
WHERE p.assigned_therapist_id IS NULL AND p.responsible_therapist_id IS NOT NULL;

-- Backfill treatment_status from legacy status 'discharged'
UPDATE public.patients
SET treatment_status = 'discharged'
WHERE status = 'discharged' AND treatment_status != 'discharged';

-- Backfill face_registered from legacy face_vector or face_templates
UPDATE public.patients p
SET face_registered = true,
    face_enrolled_at = COALESCE(p.face_enrolled_at, now())
WHERE p.face_registered = false
  AND (
    p.face_vector IS NOT NULL 
    OR EXISTS (SELECT 1 FROM public.face_templates ft WHERE ft.patient_id = p.id)
  );

-- Add unique constraint on hn once backfilled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'patients_hn_unique'
  ) THEN
    UPDATE public.patients SET hn = 'P-' || substring(id::text, 1, 6) WHERE hn IS NULL;
    ALTER TABLE public.patients ADD CONSTRAINT patients_hn_unique UNIQUE (hn);
  END IF;
END $$;

-- 4. Enhance Therapists Table
CREATE TABLE IF NOT EXISTS public.therapists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  code text,
  license_no text,
  specialty text,
  bio text,
  phone text,
  email text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'on_leave', 'suspended', 'leave')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'therapists_code_unique'
  ) THEN
    ALTER TABLE public.therapists ADD CONSTRAINT therapists_code_unique UNIQUE (code);
  END IF;
END $$;

-- 5. Enhance Exercises Table
CREATE TABLE IF NOT EXISTS public.exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE,
  name_th text NOT NULL,
  name_en text,
  category text,
  difficulty text CHECK (difficulty IN ('easy', 'medium', 'hard')),
  target_angle numeric,
  hold_seconds int DEFAULT 20,
  reps int DEFAULT 1,
  sets int DEFAULT 1,
  target_joint text,
  instructions text,
  caution text,
  contraindication text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'single' CHECK (kind IN ('single', 'preset'));
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS is_minigame boolean NOT NULL DEFAULT false;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS default_reps int DEFAULT 10;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS default_sets int DEFAULT 3;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS rest_seconds int DEFAULT 30;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS benefits text;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS media_path text;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exercises_code_unique'
  ) THEN
    UPDATE public.exercises SET code = 'EX-' || substring(id::text, 1, 4) WHERE code IS NULL;
    ALTER TABLE public.exercises ADD CONSTRAINT exercises_code_unique UNIQUE (code);
  END IF;
END $$;

-- 6. Preset Items Table
CREATE TABLE IF NOT EXISTS public.preset_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 7. Appointments Table
CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  date date NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'missed', 'rescheduled')),
  original_date date,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 8. Routine Items Table
CREATE TABLE IF NOT EXISTS public.routine_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  reps int NOT NULL DEFAULT 10,
  sets int NOT NULL DEFAULT 3,
  rest_seconds int NOT NULL DEFAULT 30,
  instructions text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 9. Session Logs Table (Unified Execution Log)
CREATE TABLE IF NOT EXISTS public.session_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  exercise_id uuid REFERENCES public.exercises(id) ON DELETE SET NULL,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'partial', 'placeholder')),
  correct int DEFAULT 0,
  incorrect int DEFAULT 0,
  score numeric DEFAULT 0,
  accuracy numeric DEFAULT 0,
  assisted boolean NOT NULL DEFAULT false,
  device_id text,
  created_at timestamptz DEFAULT now()
);

-- 10. Medical Notes Table (APPEND-ONLY Clinical Notes)
-- NOTE: author_id uses ON DELETE RESTRICT because clinical medical notes are immutable legal records.
--       Users must never be hard-deleted; staff profiles are only soft-deleted (deleted_at).
CREATE TABLE IF NOT EXISTS public.medical_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  note_type text NOT NULL CHECK (note_type IN ('progress', 'outcome_rom', 'pt_advice')),
  body text NOT NULL,
  author_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  author_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Reconcile legacy medical_notes shape (which had note, author_role, formatted_date instead of body/note_type)
ALTER TABLE public.medical_notes ADD COLUMN IF NOT EXISTS body text;
ALTER TABLE public.medical_notes ADD COLUMN IF NOT EXISTS note_type text;

-- If legacy column 'note' exists, backfill into 'body' as real 'progress' notes
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'medical_notes' AND column_name = 'note'
  ) THEN
    UPDATE public.medical_notes 
    SET body = note 
    WHERE body IS NULL AND note IS NOT NULL;

    UPDATE public.medical_notes 
    SET note_type = 'progress' 
    WHERE note_type IS NULL;

    -- Drop NOT NULL from legacy columns
    ALTER TABLE public.medical_notes ALTER COLUMN note DROP NOT NULL;
    ALTER TABLE public.medical_notes ALTER COLUMN author_role DROP NOT NULL;
    ALTER TABLE public.medical_notes ALTER COLUMN formatted_date DROP NOT NULL;
  END IF;
END $$;

-- Ensure non-null and constraint on note_type
DO $$
BEGIN
  UPDATE public.medical_notes SET note_type = 'progress' WHERE note_type IS NULL;
  UPDATE public.medical_notes SET body = '-' WHERE body IS NULL;
  ALTER TABLE public.medical_notes ALTER COLUMN body SET NOT NULL;
  ALTER TABLE public.medical_notes ALTER COLUMN note_type SET NOT NULL;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'medical_notes_note_type_check'
  ) THEN
    ALTER TABLE public.medical_notes ADD CONSTRAINT medical_notes_note_type_check 
      CHECK (note_type IN ('progress', 'outcome_rom', 'pt_advice'));
  END IF;

  -- Ensure ON DELETE RESTRICT foreign key
  ALTER TABLE public.medical_notes DROP CONSTRAINT IF EXISTS medical_notes_author_id_fkey;
  ALTER TABLE public.medical_notes ADD CONSTRAINT medical_notes_author_id_fkey 
    FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 11. Temporary Case Coverages Table
CREATE TABLE IF NOT EXISTS public.temporary_coverages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  owner_therapist_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  cover_therapist_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text DEFAULT '-',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Reconcile legacy temporary_coverages columns
ALTER TABLE public.temporary_coverages ADD COLUMN IF NOT EXISTS owner_therapist_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.temporary_coverages ADD COLUMN IF NOT EXISTS cover_therapist_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.temporary_coverages ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.temporary_coverages ADD COLUMN IF NOT EXISTS revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.temporary_coverages ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'temporary_coverages' AND column_name = 'original_therapist_id'
  ) THEN
    UPDATE public.temporary_coverages
    SET owner_therapist_id = original_therapist_id
    WHERE owner_therapist_id IS NULL AND original_therapist_id IS NOT NULL;

    UPDATE public.temporary_coverages
    SET cover_therapist_id = covering_therapist_id
    WHERE cover_therapist_id IS NULL AND covering_therapist_id IS NOT NULL;

    -- Relax NOT NULL on legacy columns
    ALTER TABLE public.temporary_coverages ALTER COLUMN original_therapist_id DROP NOT NULL;
    ALTER TABLE public.temporary_coverages ALTER COLUMN original_therapist_name DROP NOT NULL;
    ALTER TABLE public.temporary_coverages ALTER COLUMN covering_therapist_id DROP NOT NULL;
    ALTER TABLE public.temporary_coverages ALTER COLUMN covering_therapist_name DROP NOT NULL;
    ALTER TABLE public.temporary_coverages ALTER COLUMN patient_code DROP NOT NULL;
    ALTER TABLE public.temporary_coverages ALTER COLUMN patient_name DROP NOT NULL;
  END IF;

  -- Reconcile status check constraint
  ALTER TABLE public.temporary_coverages DROP CONSTRAINT IF EXISTS temporary_coverages_status_check;
  ALTER TABLE public.temporary_coverages ADD CONSTRAINT temporary_coverages_status_check 
    CHECK (status IN ('active', 'revoked', 'expired'));
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 12. Face Templates Table (DIM = 128, Euclidean distance <-> calibrated)
CREATE TABLE IF NOT EXISTS public.face_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  pose text NOT NULL CHECK (pose IN ('straight', 'left', 'right')),
  yaw numeric,
  pitch numeric,
  quality numeric,
  embedding vector(128) NOT NULL,
  frame_path text,
  is_average boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 13. Kiosk Devices Table
CREATE TABLE IF NOT EXISTS public.kiosk_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{"rotation": 0, "mirror": false}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 14. Kiosk Tokens Table
CREATE TABLE IF NOT EXISTS public.kiosk_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  device_id uuid REFERENCES public.kiosk_devices(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 15. Audit Logs Table (APPEND-ONLY)
-- NOTE: actor_id uses ON DELETE RESTRICT because audit records are immutable.
--       Users must never be hard-deleted; staff profiles are only soft-deleted (deleted_at).
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  actor_name text,
  role text,
  category text,
  action text NOT NULL,
  detail text,
  device_info text,
  ip_address text,
  status text DEFAULT 'success' CHECK (status IN ('success', 'denied', 'error')),
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_actor_id_fkey;
  ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_actor_id_fkey 
    FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 16. System Settings Table
CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 17. Banned IPs Table
CREATE TABLE IF NOT EXISTS public.banned_ips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  reason text,
  banned_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.banned_ips ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.banned_ips ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE public.banned_ips ADD COLUMN IF NOT EXISTS banned_by uuid REFERENCES public.profiles(id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'banned_ips' AND column_name = 'value'
  ) THEN
    UPDATE public.banned_ips SET ip_address = value WHERE ip_address IS NULL AND value IS NOT NULL;
    ALTER TABLE public.banned_ips ALTER COLUMN value DROP NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- 18. DATA BACKFILLS (Ensuring all existing data survives)
-- ============================================================================

-- Backfill from activity_logs -> audit_logs
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'activity_logs') THEN
    INSERT INTO public.audit_logs (id, actor_id, actor_name, role, category, action, detail, device_info, ip_address, status, created_at)
    SELECT 
      id, actor_id, actor_name, role, category, action, detail, device_info, ip_address, 'success', created_at
    FROM public.activity_logs
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Backfill from treatment_sessions -> session_logs
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'treatment_sessions') THEN
    INSERT INTO public.session_logs (id, patient_id, exercise_id, started_at, ended_at, status, score, accuracy, created_at)
    SELECT 
      id, patient_id, exercise_id, created_at, created_at, 'completed', COALESCE(score, 0), COALESCE(accuracy_percent, 0), created_at
    FROM public.treatment_sessions
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Backfill from minigame_results -> session_logs (quiz-style: correct, incorrect = total - correct, score)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'minigame_results') THEN
    INSERT INTO public.session_logs (id, patient_id, started_at, ended_at, status, correct, incorrect, score, created_at)
    SELECT 
      id, 
      patient_id, 
      created_at, 
      created_at, 
      'completed', 
      correct_count, 
      GREATEST(0, total_questions - correct_count), 
      score, 
      created_at
    FROM public.minigame_results
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Backfill patients.therapist_notes -> medical_notes (type 'pt_advice', stamped "[Imported]")
INSERT INTO public.medical_notes (patient_id, note_type, body, author_name, created_at)
SELECT 
  id, 
  'pt_advice', 
  '[Imported] ' || therapist_notes, 
  'ระบบนำเข้าข้อมูลเดิม', 
  created_at
FROM public.patients
WHERE therapist_notes IS NOT NULL 
  AND length(trim(therapist_notes)) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.medical_notes mn 
    WHERE mn.patient_id = patients.id 
      AND mn.note_type = 'pt_advice'
      AND mn.body LIKE '[Imported] %'
  );

-- Backfill patients.treatment_outcome -> medical_notes (type 'outcome_rom', stamped "[Imported]")
INSERT INTO public.medical_notes (patient_id, note_type, body, author_name, created_at)
SELECT 
  id, 
  'outcome_rom', 
  '[Imported] ' || treatment_outcome, 
  'ระบบนำเข้าข้อมูลเดิม', 
  created_at
FROM public.patients
WHERE treatment_outcome IS NOT NULL 
  AND length(trim(treatment_outcome)) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.medical_notes mn 
    WHERE mn.patient_id = patients.id 
      AND mn.note_type = 'outcome_rom'
      AND mn.body LIKE '[Imported] %'
  );

-- ============================================================================
-- 19. INDEXES (Optimizing Foreign Keys & Filters)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_patients_hn ON public.patients(hn);
CREATE INDEX IF NOT EXISTS idx_patients_assigned_pt ON public.patients(assigned_therapist_id);
CREATE INDEX IF NOT EXISTS idx_patients_status ON public.patients(treatment_status);
CREATE INDEX IF NOT EXISTS idx_appointments_patient_date ON public.appointments(patient_id, date);
CREATE INDEX IF NOT EXISTS idx_routine_appointment ON public.routine_items(appointment_id);
CREATE INDEX IF NOT EXISTS idx_session_logs_patient ON public.session_logs(patient_id);
CREATE INDEX IF NOT EXISTS idx_session_logs_appointment ON public.session_logs(appointment_id);
CREATE INDEX IF NOT EXISTS idx_medical_notes_patient ON public.medical_notes(patient_id, note_type);
CREATE INDEX IF NOT EXISTS idx_face_templates_patient ON public.face_templates(patient_id);
CREATE INDEX IF NOT EXISTS idx_temp_coverage_active ON public.temporary_coverages(patient_id, cover_therapist_id, start_date, end_date) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kiosk_tokens_hash ON public.kiosk_tokens(token_hash);

-- ============================================================================
-- 20. PRODUCTION REFERENCE DATA (Settings Defaults & Core Clinical Mini-Games)
-- Verified against frontend DailyRoutineAssignmentModal.tsx & Kiosk Hub
-- Uses ON CONFLICT DO NOTHING so re-running never resets tuned values.
-- ============================================================================

-- Core System Settings Defaults
INSERT INTO public.system_settings (key, value)
VALUES 
  ('FEATURE_PT_POSE_EXERCISES', 'false'::jsonb),
  ('FACE_THRESHOLD', '0.5'::jsonb),
  ('FACE_MARGIN', '0.1'::jsonb),
  ('PLACEHOLDER_SECONDS', '4'::jsonb),
  ('KIOSK_SESSION_TIMEOUT_SECONDS', '90'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Clinical Mini-Games: Exact matches with frontend AVAILABLE_MINIGAMES
INSERT INTO public.exercises (code, slug, name_th, name_en, category, kind, is_minigame, difficulty, default_reps, default_sets, rest_seconds, instructions, benefits, is_active)
VALUES 
  (
    'MG-01',
    'minigame_quiz',
    'มินิเกมตอบคำถามฝึกสมองและการตอบสนอง (Interactive Quiz)',
    'Interactive Cognitive Quiz Minigame',
    'มินิเกม (Minigame)',
    'single',
    true,
    'easy',
    5,
    1,
    15,
    'ตอบคำถามฝึกสมอง การสังเกต และการตอบสนองผ่านจอสัมผัสหรือท่าทาง',
    'ฟื้นฟูการทำงานประสานระบบประสาทและความจำ',
    true
  ),
  (
    'MG-02',
    'minigame_arm_coordination',
    'มินิเกมฝึกประสานการเคลื่อนไหวแขน (Bilateral Arm Coordination)',
    'Bilateral Arm Coordination Minigame',
    'มินิเกม (Minigame)',
    'single',
    true,
    'medium',
    10,
    2,
    15,
    'เคลื่อนไหวแขนทั้งสองข้างประสานกันตามเป้าหมายบนหน้าจอ',
    'ฟื้นฟูข้อต่อหัวไหล่และแขนสองข้าง',
    true
  ),
  (
    'MG-03',
    'minigame_balloon_catch',
    'มินิเกมสะบัดแขนจับลูกโป่ง (Balloon Catch Game)',
    'Balloon Catch Minigame',
    'มินิเกม (Minigame)',
    'single',
    true,
    'easy',
    12,
    2,
    15,
    'สะบัดและเอื้อมแขนเพื่อจับลูกโป่งที่ลอยขึ้นมาในทิศทางต่างๆ',
    'เพิ่มช่วงการเคลื่อนไหวของข้อไหล่ (ROM)',
    true
  )
ON CONFLICT (code) DO NOTHING;

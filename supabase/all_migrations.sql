-- ========================================================
-- DR.TECH.CARE: ALL PRODUCTION & STAGING MIGRATIONS
-- Includes: Core Schema, Extensions, Helpers, Strict RLS,
--           Triggers, Storage Buckets, Autoreschedule Cron,
--           and Reference Data (Settings & Clinical Mini-Games).
-- Generated: 2026-10-19T04:57:20.394Z
-- ========================================================


-- >>> FILE: 20261019000001_core_schema_and_extensions.sql <<<
-- ============================================================================
-- DR.TECH.CARE: Phase 1 - Migration 1: Core Schema, Extensions & Data Backfill
-- Additive, idempotent migration ensuring all existing data survives.
-- WARNING: Do NOT use legacy init_all.sql or schema.sql; they contain hardcoded
--          dev passwords. Only execute official timestamped migrations.
--
-- Phase 2 Mini-Game Field Mappings between Frontend DailyRoutineAssignmentModal.tsx & DB Schema:
--   1. Modal holdSeconds (rest between sets) maps to routine_items.rest_seconds and exercises.rest_seconds.
--   2. Modal difficulty ('beginner', 'intermediate', 'advanced') maps to routine_items.difficulty (per-prescription).
--      exercises.difficulty ('easy', 'medium', 'hard') is library-level catalog metadata only.
--   3. Modal targetJoint maps to exercises.target_joint.
--
-- Extension Schema Requirement (F12):
--   SECURITY DEFINER functions using pgvector, pgcrypto, or uuid-ossp must include
--   the extension's installation schema in search_path (e.g. public, extensions, pg_temp)
--   or schema-qualify operators/types to guarantee reliable execution on any Supabase project.
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

-- Backfill treatment_status from legacy status 'discharged'
UPDATE public.patients
SET treatment_status = 'discharged'
WHERE status = 'discharged' AND treatment_status != 'discharged';

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
    -- Generate collision-resistant unique code for legacy exercises (16^8 values)
    UPDATE public.exercises 
    SET code = 'EX-' || substring(replace(id::text, '-', ''), 1, 8) 
    WHERE code IS NULL;

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

-- Phase 2 Prep: Add routine_items.difficulty matching frontend prescription difficulty
ALTER TABLE public.routine_items ADD COLUMN IF NOT EXISTS difficulty text DEFAULT 'beginner' 
  CHECK (difficulty IN ('beginner', 'intermediate', 'advanced'));

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

  -- F1: Unconditionally ensure legacy compatibility columns exist on fresh databases too
  ALTER TABLE public.medical_notes ADD COLUMN IF NOT EXISTS note text; -- legacy compatibility
  ALTER TABLE public.medical_notes ADD COLUMN IF NOT EXISTS author_role text; -- legacy compatibility
  ALTER TABLE public.medical_notes ADD COLUMN IF NOT EXISTS formatted_date text; -- legacy compatibility

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'medical_notes_author_role_check'
  ) THEN
    ALTER TABLE public.medical_notes ADD CONSTRAINT medical_notes_author_role_check
      CHECK (author_role IS NULL OR author_role IN ('admin', 'therapist'));
  END IF;
END $$;

-- Ensure non-null and constraint on note_type without silent exception swallowing
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

  -- Ensure ON DELETE RESTRICT foreign key only if absent or different confdeltype
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'medical_notes_author_id_fkey'
      AND conrelid = 'public.medical_notes'::regclass
      AND confdeltype = 'r'
  ) THEN
    ALTER TABLE public.medical_notes DROP CONSTRAINT IF EXISTS medical_notes_author_id_fkey;
    ALTER TABLE public.medical_notes ADD CONSTRAINT medical_notes_author_id_fkey 
      FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
  END IF;
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

  -- Reconcile status check constraint only when missing or definition differs
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'temporary_coverages_status_check'
      AND conrelid = 'public.temporary_coverages'::regclass
      AND pg_get_constraintdef(oid) LIKE '%status%active%revoked%expired%'
  ) THEN
    ALTER TABLE public.temporary_coverages DROP CONSTRAINT IF EXISTS temporary_coverages_status_check;
    ALTER TABLE public.temporary_coverages ADD CONSTRAINT temporary_coverages_status_check 
      CHECK (status IN ('active', 'revoked', 'expired'));
  END IF;
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
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'audit_logs_actor_id_fkey'
      AND conrelid = 'public.audit_logs'::regclass
      AND confdeltype = 'r'
  ) THEN
    ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_actor_id_fkey;
    ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_actor_id_fkey 
      FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
  END IF;
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
-- Placed AFTER all tables are created to resolve all cross-table relations safely.
-- ============================================================================

-- Backfill patients.assigned_therapist_id from responsible_therapist_id
-- Checks both public.profiles and legacy public.therapists mapping
UPDATE public.patients p
SET assigned_therapist_id = COALESCE(
  (SELECT prof.id FROM public.profiles prof WHERE prof.id = p.responsible_therapist_id),
  (SELECT t.profile_id FROM public.therapists t WHERE t.id = p.responsible_therapist_id)
)
WHERE p.assigned_therapist_id IS NULL AND p.responsible_therapist_id IS NOT NULL;

-- Backfill patients.face_registered from legacy face_vector or face_templates
UPDATE public.patients p
SET face_registered = true,
    face_enrolled_at = COALESCE(p.face_enrolled_at, now())
WHERE p.face_registered = false
  AND (
    p.face_vector IS NOT NULL 
    OR EXISTS (SELECT 1 FROM public.face_templates ft WHERE ft.patient_id = p.id)
  );

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
-- Normalizes existing rows first, then uses plain ON CONFLICT DO NOTHING.
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

-- T2 / T5 / F2: Mini-game convergence for pre-existing legacy rows (re-runnable)
-- Sets code, name_th, target_joint, rest_seconds (15/5/5), default_reps, and default_sets
-- ONLY at the moment of normalization (code IS NULL OR code LIKE 'EX-%').
-- If a non-minigame row already holds MG-0x, renames it to EX-<8 hex> first with RAISE NOTICE.
CREATE OR REPLACE FUNCTION public.converge_minigame_exercises()
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_conflicting_id uuid;
  v_new_random_code text;
  v_mg_games RECORD;
BEGIN
  FOR v_mg_games IN
    SELECT * FROM (VALUES
      ('minigame_quiz', 'MG-01', 'มินิเกมตอบคำถามฝึกสมองและการตอบสนอง (Interactive Quiz)', 'ประสานระบบประสาทและความจำ', 15, 5, 1),
      ('minigame_arm_coordination', 'MG-02', 'มินิเกมฝึกประสานการเคลื่อนไหวแขน (Bilateral Arm Coordination)', 'ข้อต่อหัวไหล่และแขนสองข้าง', 5, 10, 2),
      ('minigame_balloon_catch', 'MG-03', 'มินิเกมสะบัดแขนจับลูกโป่ง (Balloon Catch Game)', 'ช่วงการเคลื่อนไหวของข้อไหล่ (ROM)', 5, 12, 2)
    ) AS t(slug, target_code, name_th, target_joint, rest_sec, reps, sets)
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.exercises
      WHERE slug = v_mg_games.slug AND (code IS NULL OR code LIKE 'EX-%')
    ) THEN
      -- Handle conflict if another row currently holds target_code (MG-0x).
      -- IS DISTINCT FROM so rows with a NULL slug are detected too (F2).
      SELECT id INTO v_conflicting_id
      FROM public.exercises
      WHERE code = v_mg_games.target_code AND slug IS DISTINCT FROM v_mg_games.slug
      LIMIT 1;

      IF v_conflicting_id IS NOT NULL THEN
        v_new_random_code := 'EX-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
        UPDATE public.exercises
        SET code = v_new_random_code
        WHERE id = v_conflicting_id;
        RAISE NOTICE 'Conflict resolved: Renamed non-minigame exercise % holding code % to %',
          v_conflicting_id, v_mg_games.target_code, v_new_random_code;
      END IF;

      -- Normalize legacy row to exact frontend constants
      UPDATE public.exercises
      SET code = v_mg_games.target_code,
          name_th = v_mg_games.name_th,
          target_joint = v_mg_games.target_joint,
          rest_seconds = v_mg_games.rest_sec,
          default_reps = v_mg_games.reps,
          default_sets = v_mg_games.sets,
          is_minigame = true
      WHERE slug = v_mg_games.slug AND (code IS NULL OR code LIKE 'EX-%');

      RAISE NOTICE 'Normalized legacy exercise slug % to code %', v_mg_games.slug, v_mg_games.target_code;
    END IF;
  END LOOP;
END
$fn$;

REVOKE EXECUTE ON FUNCTION public.converge_minigame_exercises() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.converge_minigame_exercises() TO service_role;

SELECT public.converge_minigame_exercises();

-- Clinical Mini-Games: Exact matches with frontend AVAILABLE_MINIGAMES
-- Note: Plain ON CONFLICT DO NOTHING (no conflict target) skips both code & slug unique collisions
INSERT INTO public.exercises (code, slug, name_th, name_en, category, kind, is_minigame, difficulty, default_reps, default_sets, rest_seconds, target_joint, instructions, benefits, is_active)
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
    'ประสานระบบประสาทและความจำ',
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
    5,
    'ข้อต่อหัวไหล่และแขนสองข้าง',
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
    5,
    'ช่วงการเคลื่อนไหวของข้อไหล่ (ROM)',
    'สะบัดและเอื้อมแขนเพื่อจับลูกโป่งที่ลอยขึ้นมาในทิศทางต่างๆ',
    'เพิ่มช่วงการเคลื่อนไหวของข้อไหล่ (ROM)',
    true
  )
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 21. STRUCTURAL INTEGRITY ASSERTION (T3)
-- Validates that no silent error swallowing occurred during schema migration.
-- ============================================================================
DO $$
DECLARE
  v_notes_body_nullable text;
  v_notes_type_nullable text;
  v_notes_fk_deltype char;
  v_audit_fk_deltype char;
  v_temp_cov_check_exists boolean;
BEGIN
  -- 1. Check medical_notes.body NOT NULL
  SELECT is_nullable INTO v_notes_body_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'medical_notes' AND column_name = 'body';

  IF v_notes_body_nullable IS DISTINCT FROM 'NO' THEN
    RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: medical_notes.body must be NOT NULL (current: %)', v_notes_body_nullable;
  END IF;

  -- 2. Check medical_notes.note_type NOT NULL
  SELECT is_nullable INTO v_notes_type_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'medical_notes' AND column_name = 'note_type';

  IF v_notes_type_nullable IS DISTINCT FROM 'NO' THEN
    RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: medical_notes.note_type must be NOT NULL (current: %)', v_notes_type_nullable;
  END IF;

  -- 3. Check medical_notes_author_id_fkey confdeltype = 'r' (RESTRICT)
  SELECT confdeltype INTO v_notes_fk_deltype
  FROM pg_constraint
  WHERE conname = 'medical_notes_author_id_fkey';

  IF v_notes_fk_deltype IS DISTINCT FROM 'r' THEN
    RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: medical_notes_author_id_fkey must have confdeltype = ''r'' (RESTRICT), found: %', v_notes_fk_deltype;
  END IF;

  -- 4. Check audit_logs_actor_id_fkey confdeltype = 'r' (RESTRICT)
  SELECT confdeltype INTO v_audit_fk_deltype
  FROM pg_constraint
  WHERE conname = 'audit_logs_actor_id_fkey';

  IF v_audit_fk_deltype IS DISTINCT FROM 'r' THEN
    RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: audit_logs_actor_id_fkey must have confdeltype = ''r'' (RESTRICT), found: %', v_audit_fk_deltype;
  END IF;

  -- 5. Check temporary_coverages_status_check exists
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'temporary_coverages_status_check'
  ) INTO v_temp_cov_check_exists;

  IF NOT v_temp_cov_check_exists THEN
    RAISE EXCEPTION 'MIGRATION ASSERTION FAILED: temporary_coverages_status_check constraint is missing!';
  END IF;

  RAISE NOTICE 'MIGRATION ASSERTION PASSED: All structural constraints, non-null guarantees, and soft-delete foreign keys verified.';
END $$;


-- >>> FILE: 20261019000002_security_helpers_and_rls.sql <<<
-- ============================================================================
-- DR.TECH.CARE: Phase 1 - Migration 2: Security Helpers, Triggers & Strict RLS
-- Enforces server-side permissions, immutable logs/notes, and locks down anon.
-- ALL functions use: SET search_path = public, pg_temp
-- Functions using pgvector/pgcrypto extensions also include 'extensions' in search_path (F12)
-- ALL open policies (USING true / WITH CHECK true) are permanently eliminated.
-- ============================================================================

-- ============================================================================
-- 1. SECURITY DEFINER HELPER FUNCTIONS
-- ============================================================================

-- Helper: Identify trusted execution contexts (Edge Functions, service_role, migrations, pg_cron)
-- RESTRICTED: Never trusts anon or authenticated PostgREST clients.
-- Explicitly checks service_role JWT claim OR direct superuser/admin DB roles (postgres, supabase_admin)
-- when no untrusted client session role (anon, authenticated) has been set.
-- Uses NULLIF(current_setting(...), '') so that set_config(..., '', true) does not cause sticky empty-string bugs.
CREATE OR REPLACE FUNCTION public.is_trusted_context()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT 
    -- 1. Explicit service_role token/caller:
    -- Checks auth.role(), legacy request.jwt.claim.role GUC, or modern PostgREST request.jwt.claims JSON
    (
      auth.role() = 'service_role'
      OR NULLIF(current_setting('request.jwt.claim.role', true), '') = 'service_role'
      OR (
        NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL 
        AND (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
      )
    )
    -- 2. Direct database administrative connections (psql, migrations, pg_cron, SQL editor)
    -- Must NOT have an active client session with anon or authenticated role
    OR (
      session_user IN ('postgres', 'supabase_admin')
      AND (auth.role() IS NULL OR auth.role() = '' OR auth.role() = 'service_role')
      AND NULLIF(current_setting('request.jwt.claim.role', true), '') IS NULL
      AND (
        NULLIF(current_setting('request.jwt.claims', true), '') IS NULL
        OR (current_setting('request.jwt.claims', true)::jsonb ->> 'role') IS NULL
      )
      AND COALESCE(NULLIF(current_setting('role', true), 'none'), session_user) NOT IN ('anon', 'authenticated')
    );
$$;

REVOKE EXECUTE ON FUNCTION public.is_trusted_context() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_trusted_context() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
BEGIN
  IF public.is_trusted_context() THEN
    RETURN 'admin';
  END IF;

  SELECT role INTO v_role 
  FROM public.profiles 
  WHERE id = auth.uid() 
    AND is_active = true 
    AND deleted_at IS NULL;
    
  RETURN COALESCE(v_role, 'anon');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.current_app_role() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.current_app_role() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_trusted_context() THEN
    RETURN true;
  END IF;
  RETURN public.current_app_role() = 'admin';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_edit_user(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_role text;
  v_target_role text;
BEGIN
  IF public.is_trusted_context() THEN
    RETURN true;
  END IF;

  v_actor_role := public.current_app_role();
  
  -- Admin can edit any user
  IF v_actor_role = 'admin' THEN
    RETURN true;
  END IF;

  -- Therapist can only edit patients (never admin or fellow therapists)
  IF v_actor_role = 'therapist' THEN
    SELECT role INTO v_target_role 
    FROM public.profiles 
    WHERE id = target_user_id 
      AND deleted_at IS NULL;

    IF v_target_role IN ('admin', 'therapist') THEN
      RETURN false;
    END IF;

    -- Patients have NO auth user or profiles row
    IF EXISTS (SELECT 1 FROM public.patients WHERE id = target_user_id OR profile_id = target_user_id) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.can_edit_user(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_user(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_write_schedule(target_patient_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_role text;
  v_assigned_pt uuid;
  v_has_active_coverage boolean;
  v_today date;
BEGIN
  IF public.is_trusted_context() THEN
    RETURN true;
  END IF;

  v_actor_id := auth.uid();
  v_actor_role := public.current_app_role();

  -- 1. Admin has universal schedule write rights
  IF v_actor_role = 'admin' THEN
    RETURN true;
  END IF;

  -- 2. Therapist checks
  IF v_actor_role = 'therapist' THEN
    SELECT assigned_therapist_id INTO v_assigned_pt
    FROM public.patients
    WHERE id = target_patient_id;

    IF v_assigned_pt = v_actor_id THEN
      RETURN true;
    END IF;

    -- Check if active covering therapist (start_date <= today <= end_date, active, not revoked)
    v_today := (timezone('Asia/Bangkok', now()))::date;
    SELECT EXISTS (
      SELECT 1 FROM public.temporary_coverages
      WHERE patient_id = target_patient_id
        AND cover_therapist_id = v_actor_id
        AND start_date <= v_today
        AND end_date >= v_today
        AND status = 'active'
        AND revoked_at IS NULL
    ) INTO v_has_active_coverage;

    IF v_has_active_coverage THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.can_write_schedule(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_write_schedule(uuid) TO authenticated, service_role;

-- Helper: Determine if caller has patient write rights (Admin, Assigned PT, or Active Covering PT)
-- Directly mirrors UI canWrite capability.
CREATE OR REPLACE FUNCTION public.can_write_patient(target_patient_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_role text;
  v_assigned_pt uuid;
  v_has_active_coverage boolean;
  v_today date;
BEGIN
  IF public.is_trusted_context() THEN
    RETURN true;
  END IF;

  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RETURN false;
  END IF;

  v_actor_role := public.current_app_role();

  -- 1. Admin has universal patient write rights
  IF v_actor_role = 'admin' THEN
    RETURN true;
  END IF;

  -- 2. Therapist checks
  IF v_actor_role = 'therapist' THEN
    SELECT assigned_therapist_id INTO v_assigned_pt
    FROM public.patients
    WHERE id = target_patient_id;

    IF v_assigned_pt = v_actor_id THEN
      RETURN true;
    END IF;

    -- Check if active covering therapist for today (Asia/Bangkok)
    v_today := (now() AT TIME ZONE 'Asia/Bangkok')::date;
    SELECT EXISTS (
      SELECT 1 FROM public.temporary_coverages
      WHERE patient_id = target_patient_id
        AND cover_therapist_id = v_actor_id
        AND start_date <= v_today
        AND end_date >= v_today
        AND status = 'active'
        AND revoked_at IS NULL
    ) INTO v_has_active_coverage;

    RETURN v_has_active_coverage;
  END IF;

  RETURN false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.can_write_patient(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_write_patient(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_edit_exercise(target_exercise_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_role text;
  v_created_by uuid;
BEGIN
  IF public.is_trusted_context() THEN
    RETURN true;
  END IF;

  v_actor_id := auth.uid();
  v_actor_role := public.current_app_role();

  IF v_actor_role = 'admin' THEN
    RETURN true;
  END IF;

  IF v_actor_role = 'therapist' THEN
    SELECT created_by INTO v_created_by
    FROM public.exercises
    WHERE id = target_exercise_id;

    IF v_created_by = v_actor_id THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.can_edit_exercise(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_exercise(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_view_audit()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_trusted_context() THEN
    RETURN true;
  END IF;
  RETURN public.current_app_role() = 'admin';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.can_view_audit() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_view_audit() TO authenticated, service_role;

-- ============================================================================
-- 2. IMMUTABILITY & GUARD TRIGGERS
-- ============================================================================

-- Medical Notes Immutability Trigger (BEFORE UPDATE OR DELETE)
CREATE OR REPLACE FUNCTION public.trg_block_medical_notes_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Medical notes are append-only clinical records and cannot be updated or deleted.'
    USING ERRCODE = 'P0001';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_block_medical_notes_mutation() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.trg_block_medical_notes_mutation() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_immutable_medical_notes ON public.medical_notes;
CREATE TRIGGER trg_immutable_medical_notes
BEFORE UPDATE OR DELETE ON public.medical_notes
FOR EACH ROW EXECUTE FUNCTION public.trg_block_medical_notes_mutation();

-- Audit Logs Immutability Trigger (BEFORE UPDATE OR DELETE)
CREATE OR REPLACE FUNCTION public.trg_block_audit_logs_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable security records and cannot be updated or deleted.'
    USING ERRCODE = 'P0001';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_block_audit_logs_mutation() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.trg_block_audit_logs_mutation() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_immutable_audit_logs ON public.audit_logs;
CREATE TRIGGER trg_immutable_audit_logs
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.trg_block_audit_logs_mutation();

-- Guard: Patient Sensitive Columns (assigned_therapist_id, treatment_status, hn, profile_id)
-- Only admin or the current assigned therapist can alter these sensitive fields.
CREATE OR REPLACE FUNCTION public.trg_guard_patient_sensitive_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Trusted execution contexts and administrators are exempt
  IF public.is_trusted_context() OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Therapists can only change sensitive fields if they are the currently assigned therapist
  IF OLD.assigned_therapist_id IS DISTINCT FROM auth.uid() THEN
    IF NEW.assigned_therapist_id IS DISTINCT FROM OLD.assigned_therapist_id OR
       NEW.treatment_status IS DISTINCT FROM OLD.treatment_status OR
       NEW.hn IS DISTINCT FROM OLD.hn OR
       NEW.profile_id IS DISTINCT FROM OLD.profile_id THEN
      RAISE EXCEPTION 'Only an administrator or the currently assigned therapist can reassign, discharge, or alter patient identifiers.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_guard_patient_sensitive_updates() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.trg_guard_patient_sensitive_updates() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_guard_patient_sensitive_fields ON public.patients;
CREATE TRIGGER trg_guard_patient_sensitive_fields
BEFORE UPDATE ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.trg_guard_patient_sensitive_updates();

-- Guard: Prevent patient hard deletion by clients (preserves clinical notes, history, and audit trails)
CREATE OR REPLACE FUNCTION public.trg_prevent_patient_hard_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_trusted_context() THEN
    RAISE EXCEPTION 'Patients cannot be hard-deleted. Clinical history, treatment sessions, and medical notes are immutable records. Use treatment_status = ''discharged'' or deleted_at to archive.'
      USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_prevent_patient_hard_delete() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.trg_prevent_patient_hard_delete() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_prevent_patient_hard_delete ON public.patients;
CREATE TRIGGER trg_prevent_patient_hard_delete
BEFORE DELETE ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.trg_prevent_patient_hard_delete();

-- Guard: Patient Registration Assignment Guard (Non-admin therapist must assign to themselves)
CREATE OR REPLACE FUNCTION public.trg_guard_patient_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF public.is_trusted_context() OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Non-admin therapist registering a patient must assign the patient to their own UID
  IF NEW.assigned_therapist_id IS NULL THEN
    NEW.assigned_therapist_id := auth.uid();
  ELSIF NEW.assigned_therapist_id != auth.uid() THEN
    RAISE EXCEPTION 'Therapists may only assign newly registered patients to themselves.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_guard_patient_insert() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.trg_guard_patient_insert() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_guard_patient_insert ON public.patients;
CREATE TRIGGER trg_guard_patient_insert
BEFORE INSERT ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.trg_guard_patient_insert();

-- F10: Patient Deletion / Erasure Procedure (PDPA Compliance)
-- Anonymizes direct identifiers and removes biometric face templates.
-- Leaves immutable clinical medical notes intact for statutory medical records retention.
CREATE OR REPLACE FUNCTION public.admin_anonymize_patient(p_patient_id uuid, p_reason text DEFAULT 'PDPA erasure request')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_patient public.patients%ROWTYPE;
  v_caller_id uuid := auth.uid();
  v_caller_name text := 'Admin';
BEGIN
  -- 1. Authorization: strictly admin or service_role
  IF NOT (public.is_trusted_context() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Only an administrator can anonymize patient records.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Find target patient
  SELECT * INTO v_patient
  FROM public.patients
  WHERE id = p_patient_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Patient with ID % not found.', p_patient_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_caller_id IS NOT NULL THEN
    SELECT full_name INTO v_caller_name FROM public.profiles WHERE id = v_caller_id;
  END IF;

  -- 3. Delete biometric templates
  DELETE FROM public.face_templates WHERE patient_id = p_patient_id;

  -- 4. Overwrite direct identifiers and free-text fields in patients table
  UPDATE public.patients
  SET full_name = '[ANONYMIZED PATIENT]',
      phone = '000-000-0000',
      avatar_url = NULL,
      pin_hash = NULL,
      face_vector = NULL,
      face_registered = false,
      face_enrolled_at = NULL,
      chief_complaint = '[ANONYMIZED CLINICAL RECORD]',
      medical_history = '[ANONYMIZED]',
      treatment_outcome = '[ANONYMIZED]',
      therapist_notes = '[ANONYMIZED]',
      treatment_status = 'discharged',
      status = 'discharged',
      updated_at = now()
  WHERE id = p_patient_id;

  -- 5. Revoke any active temporary coverages
  UPDATE public.temporary_coverages
  SET status = 'revoked',
      revoked_by = v_caller_id,
      revoked_at = now()
  WHERE patient_id = p_patient_id AND status = 'active';

  -- 6. Write immutable audit log entry
  INSERT INTO public.audit_logs (actor_id, actor_name, role, category, action, detail, status)
  VALUES (
    v_caller_id,
    COALESCE(v_caller_name, 'System Admin'),
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'system' END,
    'SECURITY',
    'PATIENT_ANONYMIZED',
    format('Patient %s (HN: %s) anonymized. Reason: %s', p_patient_id, v_patient.hn, COALESCE(p_reason, 'Not specified')),
    'success'
  );

  RETURN jsonb_build_object(
    'success', true,
    'patient_id', p_patient_id,
    'anonymized_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_anonymize_patient(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_anonymize_patient(uuid, text) TO authenticated, service_role;

-- Guard: Pose Exercise Guard in Routine Items
CREATE OR REPLACE FUNCTION public.trg_check_pose_exercise_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pose_flag text;
  v_is_minigame boolean;
BEGIN
  IF public.is_trusted_context() THEN
    RETURN NEW;
  END IF;

  SELECT trim(both '"' from value::text)
  INTO v_pose_flag
  FROM public.system_settings
  WHERE key = 'FEATURE_PT_POSE_EXERCISES';

  IF COALESCE(v_pose_flag, 'false') != 'true' THEN
    SELECT COALESCE(is_minigame, false)
    INTO v_is_minigame
    FROM public.exercises
    WHERE id = NEW.exercise_id;

    IF v_is_minigame != true THEN
      RAISE EXCEPTION 'Pose exercises are currently locked (FEATURE_PT_POSE_EXERCISES = false). Routine items may only reference mini-games (is_minigame = true).'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_check_pose_exercise_guard() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.trg_check_pose_exercise_guard() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_guard_pose_exercise_in_routine ON public.routine_items;
CREATE TRIGGER trg_guard_pose_exercise_in_routine
BEFORE INSERT OR UPDATE ON public.routine_items
FOR EACH ROW EXECUTE FUNCTION public.trg_check_pose_exercise_guard();

-- Guard: Exercise Creation / Modification Pose Guard Bypass Prevention
-- Only admins may set is_minigame = true or assign 'MG-' codes. Non-admin writes are forced to is_minigame = false.
CREATE OR REPLACE FUNCTION public.trg_guard_exercise_minigame()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_trusted_context() OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Block non-admin from using mini-game codes
  IF NEW.code ILIKE 'MG-%' OR NEW.slug ILIKE 'minigame_%' OR NEW.slug ILIKE 'mg-%' THEN
    RAISE EXCEPTION 'Only administrators can create or assign mini-game codes (MG-).'
      USING ERRCODE = '42501';
  END IF;

  -- Strictly force is_minigame = false for therapist-authored exercises
  NEW.is_minigame := false;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_guard_exercise_minigame() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.trg_guard_exercise_minigame() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_guard_exercises_minigame ON public.exercises;
CREATE TRIGGER trg_guard_exercises_minigame
BEFORE INSERT OR UPDATE ON public.exercises
FOR EACH ROW EXECUTE FUNCTION public.trg_guard_exercise_minigame();

-- Guard: Medical Notes Author & Timestamp Stamping (Prevents forgery)
CREATE OR REPLACE FUNCTION public.trg_stamp_medical_notes_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_trusted_context() THEN
    IF NEW.created_at IS NULL THEN
      NEW.created_at := now();
    END IF;
    IF NEW.author_name IS NULL THEN
      NEW.author_name := 'System Service';
    END IF;
  ELSE
    -- Force author fields from current authenticated session
    NEW.author_id := auth.uid();
    SELECT full_name INTO NEW.author_name 
    FROM public.profiles 
    WHERE id = auth.uid();
    NEW.author_name := COALESCE(NEW.author_name, 'Therapist');
    NEW.created_at := now();
  END IF;

  -- Backward compatibility sync for legacy columns
  IF NEW.note IS NULL THEN
    NEW.note := NEW.body;
  END IF;
  IF NEW.formatted_date IS NULL THEN
    NEW.formatted_date := to_char(NEW.created_at, 'DD/MM/YYYY');
  END IF;
  IF NEW.author_role IS NULL THEN
    NEW.author_role := CASE WHEN public.is_admin() THEN 'admin' ELSE 'therapist' END;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_stamp_medical_notes_author() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.trg_stamp_medical_notes_author() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_medical_notes_stamp ON public.medical_notes;
CREATE TRIGGER trg_medical_notes_stamp
BEFORE INSERT ON public.medical_notes
FOR EACH ROW EXECUTE FUNCTION public.trg_stamp_medical_notes_author();

-- Guard: Audit Logs Timestamp Stamping
CREATE OR REPLACE FUNCTION public.trg_stamp_audit_logs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.created_at IS NULL THEN
    NEW.created_at := now();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_stamp_audit_logs() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.trg_stamp_audit_logs() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_audit_logs_stamp ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_stamp
BEFORE INSERT ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.trg_stamp_audit_logs();

-- Guard: Temporary Case Coverages Validation
CREATE OR REPLACE FUNCTION public.trg_guard_temporary_coverages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_assigned_pt uuid;
  v_cover_is_active boolean;
  v_overlap boolean;
BEGIN
  IF public.is_trusted_context() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- 1. Enforce patient.assigned_therapist_id = owner_therapist_id
    SELECT assigned_therapist_id INTO v_assigned_pt
    FROM public.patients
    WHERE id = NEW.patient_id;

    IF v_assigned_pt IS DISTINCT FROM NEW.owner_therapist_id THEN
      RAISE EXCEPTION 'Coverage owner must be the patient''s current assigned therapist.'
        USING ERRCODE = 'P0001';
    END IF;

    -- 2. Owner must be auth.uid() unless admin
    IF NOT public.is_admin() AND NEW.owner_therapist_id != auth.uid() THEN
      RAISE EXCEPTION 'Therapists can only delegate cases from their own caseload.'
        USING ERRCODE = 'P0001';
    END IF;

    -- 3. Cover must be an active therapist
    SELECT EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = NEW.cover_therapist_id 
        AND role = 'therapist' 
        AND is_active = true 
        AND deleted_at IS NULL
    ) INTO v_cover_is_active;

    IF NOT v_cover_is_active THEN
      RAISE EXCEPTION 'Covering therapist must be an active therapist.'
        USING ERRCODE = 'P0001';
    END IF;

    -- 4. No self-delegation
    IF NEW.owner_therapist_id = NEW.cover_therapist_id THEN
      RAISE EXCEPTION 'Covering therapist cannot be the owner therapist.'
        USING ERRCODE = 'P0001';
    END IF;

    -- 5. Date order check
    IF NEW.end_date < NEW.start_date THEN
      RAISE EXCEPTION 'Coverage end date cannot be earlier than start date.'
        USING ERRCODE = 'P0001';
    END IF;

    -- 6. No overlapping active coverage for the same patient
    SELECT EXISTS (
      SELECT 1 FROM public.temporary_coverages
      WHERE patient_id = NEW.patient_id
        AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND status = 'active'
        AND revoked_at IS NULL
        AND start_date <= NEW.end_date
        AND end_date >= NEW.start_date
    ) INTO v_overlap;

    IF v_overlap THEN
      RAISE EXCEPTION 'An active temporary coverage already exists for this patient in the selected date range.'
        USING ERRCODE = 'P0001';
    END IF;

    NEW.status := 'active';
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- F9: Who may revoke: admin, the owner, and the cover therapist (decline)
    IF NOT (public.is_admin() OR auth.uid() = OLD.owner_therapist_id OR auth.uid() = OLD.cover_therapist_id) THEN
      RAISE EXCEPTION 'Unauthorized to modify temporary coverage.'
        USING ERRCODE = '42501';
    END IF;

    -- Non-trusted callers may change ONLY status -> 'revoked' (never 'expired')
    IF NEW.status != 'revoked' OR OLD.status != 'active' THEN
      RAISE EXCEPTION 'Non-trusted callers may only change active coverage status to revoked.'
        USING ERRCODE = 'P0001';
    END IF;

    -- All other columns must remain unchanged
    IF NEW.patient_id IS DISTINCT FROM OLD.patient_id OR
       NEW.owner_therapist_id IS DISTINCT FROM OLD.owner_therapist_id OR
       NEW.cover_therapist_id IS DISTINCT FROM OLD.cover_therapist_id OR
       NEW.start_date IS DISTINCT FROM OLD.start_date OR
       NEW.end_date IS DISTINCT FROM OLD.end_date THEN
      RAISE EXCEPTION 'Coverage parameters (patient, therapists, dates) cannot be altered on update.'
        USING ERRCODE = 'P0001';
    END IF;

    -- Automatically stamp revocation metadata
    NEW.revoked_by := auth.uid();
    NEW.revoked_at := now();
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_guard_temporary_coverages() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.trg_guard_temporary_coverages() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_guard_temporary_coverages_ins_upd ON public.temporary_coverages;
CREATE TRIGGER trg_guard_temporary_coverages_ins_upd
BEFORE INSERT OR UPDATE ON public.temporary_coverages
FOR EACH ROW EXECUTE FUNCTION public.trg_guard_temporary_coverages();

-- Guard: Profiles Self-Update (Prevents 42P17 recursion and restricts editable columns)
-- Non-admin users may ONLY update full_name, phone, and avatar_url.
CREATE OR REPLACE FUNCTION public.trg_guard_profiles_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_trusted_context() OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.id = auth.uid() THEN
    IF NEW.username IS DISTINCT FROM OLD.username OR
       NEW.role IS DISTINCT FROM OLD.role OR
       NEW.email IS DISTINCT FROM OLD.email OR
       NEW.is_active IS DISTINCT FROM OLD.is_active OR
       NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
      RAISE EXCEPTION 'Users may only update full_name, phone, and avatar_url on their own profile.'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unauthorized profile update.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_guard_profiles_self_update() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.trg_guard_profiles_self_update() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_guard_profiles_self_update_before ON public.profiles;
CREATE TRIGGER trg_guard_profiles_self_update_before
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trg_guard_profiles_self_update();

-- ============================================================================
-- 3. DYNAMICALLY DROP ALL EXISTING POLICIES IN SCHEMA PUBLIC
-- ============================================================================

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN (
    SELECT schemaname, tablename, policyname 
    FROM pg_policies 
    WHERE schemaname = 'public'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- ============================================================================
-- 4. STRICT ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- PROFILES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_read_auth" ON public.profiles
FOR SELECT TO authenticated
USING (deleted_at IS NULL);

CREATE POLICY "profiles_admin_all" ON public.profiles
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Avoids subquery to completely prevent 42P17 recursion.
-- Column restrictions are strictly enforced by trg_guard_profiles_self_update.
CREATE POLICY "profiles_self_update" ON public.profiles
FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- PATIENTS
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

-- Hard delete on patients is completely disallowed for all client roles.
-- History and clinical notes are immutable; deactivation is performed via treatment_status / deleted_at.
REVOKE DELETE ON public.patients FROM anon, authenticated, public;

CREATE POLICY "patients_read_staff" ON public.patients
FOR SELECT TO authenticated
USING (public.current_app_role() IN ('admin', 'therapist'));

CREATE POLICY "patients_admin_insert" ON public.patients
FOR INSERT TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "patients_admin_update" ON public.patients
FOR UPDATE TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "patients_pt_insert" ON public.patients
FOR INSERT TO authenticated
WITH CHECK (
  public.current_app_role() = 'therapist'
  AND (assigned_therapist_id = auth.uid() OR public.is_admin())
);

-- Therapists can update clinical columns for assigned or covered patients (can_write_patient).
CREATE POLICY "patients_pt_update" ON public.patients
FOR UPDATE TO authenticated
USING (public.can_write_patient(id))
WITH CHECK (public.can_write_patient(id));

-- THERAPISTS
ALTER TABLE public.therapists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "therapists_read_staff" ON public.therapists
FOR SELECT TO authenticated
USING (public.current_app_role() IN ('admin', 'therapist'));

CREATE POLICY "therapists_admin_all" ON public.therapists
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "therapists_self_update" ON public.therapists
FOR UPDATE TO authenticated
USING (profile_id = auth.uid())
WITH CHECK (profile_id = auth.uid());

-- EXERCISES
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exercises_read_staff" ON public.exercises
FOR SELECT TO authenticated
USING (public.current_app_role() IN ('admin', 'therapist'));

CREATE POLICY "exercises_admin_all" ON public.exercises
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "exercises_pt_insert" ON public.exercises
FOR INSERT TO authenticated
WITH CHECK (
  public.current_app_role() = 'therapist' 
  AND created_by = auth.uid()
  AND is_minigame = false
  AND (code IS NULL OR code NOT ILIKE 'MG-%')
);

CREATE POLICY "exercises_pt_update" ON public.exercises
FOR UPDATE TO authenticated
USING (public.can_edit_exercise(id))
WITH CHECK (
  public.can_edit_exercise(id)
  AND is_minigame = false
  AND (code IS NULL OR code NOT ILIKE 'MG-%')
);

CREATE POLICY "exercises_pt_delete" ON public.exercises
FOR DELETE TO authenticated
USING (public.can_edit_exercise(id));

-- PRESET ITEMS
ALTER TABLE public.preset_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "preset_items_read" ON public.preset_items
FOR SELECT TO authenticated
USING (public.current_app_role() IN ('admin', 'therapist'));

CREATE POLICY "preset_items_admin" ON public.preset_items
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- APPOINTMENTS
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "appointments_read" ON public.appointments
FOR SELECT TO authenticated
USING (public.current_app_role() IN ('admin', 'therapist'));

CREATE POLICY "appointments_write" ON public.appointments
FOR ALL TO authenticated
USING (public.can_write_schedule(patient_id))
WITH CHECK (public.can_write_schedule(patient_id));

-- ROUTINE ITEMS
ALTER TABLE public.routine_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "routine_items_read" ON public.routine_items
FOR SELECT TO authenticated
USING (public.current_app_role() IN ('admin', 'therapist'));

CREATE POLICY "routine_items_write" ON public.routine_items
FOR ALL TO authenticated
USING (
  public.can_write_schedule(
    (SELECT a.patient_id FROM public.appointments a WHERE a.id = appointment_id)
  )
)
WITH CHECK (
  public.can_write_schedule(
    (SELECT a.patient_id FROM public.appointments a WHERE a.id = appointment_id)
  )
);

-- SESSION LOGS
ALTER TABLE public.session_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_logs_read" ON public.session_logs
FOR SELECT TO authenticated
USING (public.current_app_role() IN ('admin', 'therapist'));

-- F8: Kiosk session results are written exclusively by Edge Functions using service_role.
-- Staff-assisted sessions (if required in future) go through a dedicated RPC verifying can_write_patient.
-- ZERO client-facing INSERT/UPDATE/DELETE policies on session_logs.

-- MEDICAL NOTES (Any therapist can read all & append to any patient with forced author stamping)
ALTER TABLE public.medical_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "medical_notes_read" ON public.medical_notes
FOR SELECT TO authenticated
USING (public.current_app_role() IN ('admin', 'therapist'));

CREATE POLICY "medical_notes_insert" ON public.medical_notes
FOR INSERT TO authenticated
WITH CHECK (public.current_app_role() IN ('admin', 'therapist'));

-- TEMPORARY COVERAGES
ALTER TABLE public.temporary_coverages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "temp_cov_read" ON public.temporary_coverages
FOR SELECT TO authenticated
USING (public.current_app_role() IN ('admin', 'therapist'));

CREATE POLICY "temp_cov_admin" ON public.temporary_coverages
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "temp_cov_owner_insert" ON public.temporary_coverages
FOR INSERT TO authenticated
WITH CHECK (
  public.current_app_role() = 'therapist'
  AND owner_therapist_id = auth.uid()
  AND cover_therapist_id != auth.uid()
  AND end_date >= start_date
);

-- F9: Admin, owner therapist, or covering therapist may revoke active coverage.
CREATE POLICY "temp_cov_revoke" ON public.temporary_coverages
FOR UPDATE TO authenticated
USING (
  public.is_admin()
  OR (public.current_app_role() = 'therapist' AND (owner_therapist_id = auth.uid() OR cover_therapist_id = auth.uid()))
)
WITH CHECK (
  status = 'revoked'
);

-- FACE TEMPLATES (Biometric embeddings: ZERO client-facing policies)
-- Direct client access (anon and authenticated) is default-denied by RLS.
-- Only Edge Functions (service_role) read or write face_templates.
ALTER TABLE public.face_templates ENABLE ROW LEVEL SECURITY;

-- KIOSK DEVICES & TOKENS
ALTER TABLE public.kiosk_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiosk_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kiosk_devices_admin" ON public.kiosk_devices
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "kiosk_tokens_admin" ON public.kiosk_tokens
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- AUDIT LOGS (Admin read only; ZERO client-facing insert policies)
-- Audit logs are written strictly by Edge Functions and SECURITY DEFINER procedures.
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_read" ON public.audit_logs
FOR SELECT TO authenticated
USING (public.can_view_audit());

-- BANNED IPS
ALTER TABLE public.banned_ips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "banned_ips_admin" ON public.banned_ips
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- SYSTEM SETTINGS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_settings_read" ON public.system_settings
FOR SELECT TO authenticated
USING (public.current_app_role() IN ('admin', 'therapist'));

CREATE POLICY "system_settings_admin" ON public.system_settings
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ============================================================================
-- 5. COLUMN-LEVEL PERMISSIONS ON PATIENTS (Locking down pin_hash & face_vector)
-- ============================================================================
-- F6: SELECT column visibility (pin_hash and face_vector are strictly excluded)
REVOKE SELECT ON public.patients FROM authenticated;
GRANT SELECT (
  id, profile_id, patient_code, hn, full_name, age, gender, phone, avatar_url,
  admission_date, assigned_therapist_id, underlying_diseases, drug_allergies,
  treatment_status, progress_pct, chief_complaint, medical_history,
  treatment_outcome, therapist_notes, responsible_therapist_id, started_at,
  status, face_registered, face_enrolled_at, created_at, updated_at
) ON public.patients TO authenticated;

-- F5a: Explicit allowlist for INSERT and UPDATE on patients
-- pin_hash, face_vector, face_registered, face_enrolled_at, progress_pct, hn, patient_code are service_role/trigger only!
REVOKE INSERT, UPDATE ON public.patients FROM authenticated;
GRANT INSERT (
  full_name, age, gender, phone,
  chief_complaint, medical_history, treatment_outcome, therapist_notes,
  underlying_diseases, drug_allergies, treatment_status,
  admission_date, started_at, avatar_url, assigned_therapist_id, responsible_therapist_id, status
) ON public.patients TO authenticated;

GRANT UPDATE (
  full_name, age, gender, phone,
  chief_complaint, medical_history, treatment_outcome, therapist_notes,
  underlying_diseases, drug_allergies, treatment_status,
  admission_date, started_at, avatar_url, assigned_therapist_id, responsible_therapist_id, status
) ON public.patients TO authenticated;

-- ============================================================================
-- 6. DYNAMICALLY ENABLE RLS ON ALL PUBLIC TABLES & REVOKE ANON ACCESS
-- ============================================================================

DO $$
DECLARE
  tbl RECORD;
BEGIN
  FOR tbl IN (
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  ) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl.tablename);
  END LOOP;
END $$;

-- Preserve schema usage for anon
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- F8: Revoke mutation privileges on session_logs from authenticated (kiosk writes via service_role Edge Functions)
REVOKE INSERT, UPDATE, DELETE ON public.session_logs FROM authenticated;

-- F7: Revoke dangerous table privileges on all public tables from anon and authenticated
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- F7: Revoke mutation privileges on append-only medical notes and immutable audit logs
REVOKE UPDATE, DELETE ON public.medical_notes FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM authenticated;

-- Revoke all table and sequence access from anon
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Set default privileges for postgres and supabase_admin roles
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon';
  END IF;
END $$;

-- ============================================================================
-- 7. AUDIT ASSERTIONS
-- ============================================================================

-- Assertion 1: ZERO open policies (qual/with_check = 'true')
DO $$
DECLARE
  bad_pol RECORD;
BEGIN
  SELECT schemaname, tablename, policyname, qual, with_check
  INTO bad_pol
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (
      trim(qual) = 'true' 
      OR trim(with_check) = 'true'
      OR qual = '(true)'
      OR with_check = '(true)'
    )
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'SECURITY AUDIT FAILED: Open policy found in schema public: % on %.% (qual: %, with_check: %)',
      bad_pol.policyname, bad_pol.schemaname, bad_pol.tablename, bad_pol.qual, bad_pol.with_check;
  END IF;

  RAISE NOTICE 'SECURITY AUDIT PASSED: Zero open policies (qual/with_check = true) in schema public.';
END $$;

-- Assertion 2: All tables in schema public MUST have RLS enabled
DO $$
DECLARE
  insecure_tbl text;
BEGIN
  SELECT c.relname INTO insecure_tbl
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' 
    AND c.relkind = 'r'
    AND c.relrowsecurity = false
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'SECURITY AUDIT FAILED: Table public.% does not have RLS enabled!', insecure_tbl;
  END IF;

  RAISE NOTICE 'SECURITY AUDIT PASSED: All tables in schema public have RLS enabled.';
END $$;


-- >>> FILE: 20261019000003_storage_buckets.sql <<<
-- ============================================================================
-- DR.TECH.CARE: Phase 1 - Migration 3: Storage Buckets & Policies
-- Buckets: avatars (PRIVATE), biometric-data (PRIVATE), exercise-media (public)
-- CRITICAL SECURITY RULE: biometric-data has ZERO client-facing storage policies.
-- Only Edge Functions (service role) read or write biometric-data.
-- ============================================================================

-- 1. Create Buckets
-- avatars is made PRIVATE to protect patient photo privacy.
-- biometric-data is strictly PRIVATE with NO client-facing policies.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('avatars', 'avatars', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('biometric-data', 'biometric-data', false, 10485760, ARRAY['image/jpeg', 'image/png']),
  ('exercise-media', 'exercise-media', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'video/mp4', 'video/webm'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Dynamically Drop Legacy Policies on storage.objects for our Buckets
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN (
    SELECT schemaname, tablename, policyname 
    FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (
        policyname ILIKE '%avatar%' 
        OR policyname ILIKE '%biometric%' 
        OR policyname ILIKE '%exercise%'
        OR qual ILIKE '%avatars%'
        OR qual ILIKE '%biometric-data%'
        OR qual ILIKE '%exercise-media%'
        OR with_check ILIKE '%avatars%'
        OR with_check ILIKE '%biometric-data%'
        OR with_check ILIKE '%exercise-media%'
      )
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- 3. Storage Policies on storage.objects

-- AVATARS (Private Bucket: Authenticated Staff Read via Signed URLs / Staff Session, Staff Write)
CREATE POLICY "avatars_staff_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'avatars'
  AND public.current_app_role() IN ('admin', 'therapist')
);

CREATE POLICY "avatars_staff_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND public.current_app_role() IN ('admin', 'therapist')
);

CREATE POLICY "avatars_staff_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND public.current_app_role() IN ('admin', 'therapist')
);

CREATE POLICY "avatars_admin_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND public.is_admin()
);

-- BIOMETRIC DATA (Strictly Private - ZERO Client-Facing Policies)
-- NOTE: Absolutely NO storage policies are created for 'biometric-data'.
-- Direct client access (anon and authenticated) is default-denied by RLS.
-- Only Edge Functions using Supabase service_role key read/write this bucket.

-- EXERCISE MEDIA (Public Read, Staff Write)
CREATE POLICY "exercise_media_public_select" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'exercise-media');

CREATE POLICY "exercise_media_staff_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'exercise-media' 
  AND public.current_app_role() IN ('admin', 'therapist')
);

CREATE POLICY "exercise_media_staff_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'exercise-media' 
  AND public.current_app_role() IN ('admin', 'therapist')
);

CREATE POLICY "exercise_media_admin_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'exercise-media' 
  AND public.is_admin()
);

-- ============================================================================
-- 4. AUDIT ASSERTION: ZERO OPEN POLICIES ON storage.objects
-- Raises an exception if any policy on storage.objects has qual or with_check = 'true'.
-- ============================================================================

DO $$
DECLARE
  bad_pol RECORD;
BEGIN
  SELECT schemaname, tablename, policyname, qual, with_check
  INTO bad_pol
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND (
      trim(qual) = 'true' 
      OR trim(with_check) = 'true'
      OR qual = '(true)'
      OR with_check = '(true)'
    )
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'SECURITY AUDIT FAILED: Open storage policy found: % on storage.objects (qual: %, with_check: %)',
      bad_pol.policyname, bad_pol.qual, bad_pol.with_check;
  END IF;

  RAISE NOTICE 'SECURITY AUDIT PASSED: Zero open policies on storage.objects.';
END $$;


-- >>> FILE: 20261019000004_autoreschedule_cron.sql <<<
-- ============================================================================
-- DR.TECH.CARE: Phase 1 - Migration 4: Auto-Reschedule Routine & pg_cron Job
-- Daily execution at 00:05 Asia/Bangkok (17:05 UTC)
-- Handles missed appointments, routine rollover, and writes audit log.
--
-- Round 3 change: the function takes p_now (default now()) so the Bangkok-midnight
-- boundary can be tested against the REAL function (see rls_negative_test.sql Case 16)
-- instead of re-implementing date arithmetic in the test.
-- ============================================================================

-- The old zero-argument signature must go: keeping it next to f(p_now DEFAULT now())
-- would make `SELECT auto_reschedule_missed_appointments()` ambiguous.
DROP FUNCTION IF EXISTS public.auto_reschedule_missed_appointments();

-- Function: auto_reschedule_missed_appointments
CREATE OR REPLACE FUNCTION public.auto_reschedule_missed_appointments(p_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date;
  v_missed_count int := 0;
  v_rescheduled_count int := 0;
  v_rec record;
  v_next_date date;
  v_next_appt_id uuid;
  v_item record;
BEGIN
  -- Compute "today" in hospital timezone explicitly (Asia/Bangkok, UTC+7)
  v_today := (p_now AT TIME ZONE 'Asia/Bangkok')::date;
  v_next_date := v_today;

  -- 1. Identify past 'scheduled' and 'rescheduled' appointments with no check-in
  FOR v_rec IN
    SELECT a.id, a.patient_id, a.date, a.created_by
    FROM public.appointments a
    WHERE a.status IN ('scheduled', 'rescheduled')
      AND a.date < v_today
      AND NOT EXISTS (
        -- Check-in is valid if there is a completed, partial, or placeholder session log
        SELECT 1 FROM public.session_logs s
        WHERE s.appointment_id = a.id
      )
  LOOP
    BEGIN
      -- Mark missed appointment
      UPDATE public.appointments
      SET status = 'missed',
          updated_at = now()
      WHERE id = v_rec.id;

      v_missed_count := v_missed_count + 1;

      -- 2. Find or create appointment for next therapy date (today)
      SELECT id INTO v_next_appt_id
      FROM public.appointments
      WHERE patient_id = v_rec.patient_id
        AND date = v_next_date
        AND status IN ('scheduled', 'rescheduled')
      LIMIT 1;

      IF v_next_appt_id IS NULL THEN
        INSERT INTO public.appointments (patient_id, date, status, original_date, created_by)
        VALUES (v_rec.patient_id, v_next_date, 'rescheduled', v_rec.date, v_rec.created_by)
        RETURNING id INTO v_next_appt_id;

        v_rescheduled_count := v_rescheduled_count + 1;
      END IF;

      -- 3. Rollover / Merge routine items
      FOR v_item IN
        SELECT exercise_id, reps, sets, rest_seconds, instructions, sort_order
        FROM public.routine_items
        WHERE appointment_id = v_rec.id
      LOOP
        IF NOT EXISTS (
          SELECT 1 FROM public.routine_items
          WHERE appointment_id = v_next_appt_id
            AND exercise_id = v_item.exercise_id
        ) THEN
          INSERT INTO public.routine_items (appointment_id, exercise_id, reps, sets, rest_seconds, instructions, sort_order)
          VALUES (v_next_appt_id, v_item.exercise_id, v_item.reps, v_item.sets, v_item.rest_seconds, v_item.instructions, v_item.sort_order);
        END IF;
      END LOOP;

      -- 4. Audit Log Entry (Success)
      INSERT INTO public.audit_logs (actor_name, role, category, action, detail, status)
      VALUES (
        'pg_cron Auto-Reschedule',
        'system',
        'SCHEDULE',
        'AUTO_RESCHEDULE_MISSED',
        format('Appointment %s for patient %s missed on %s rolled over to %s', v_rec.id, v_rec.patient_id, v_rec.date, v_next_date),
        'success'
      );

    EXCEPTION
      WHEN OTHERS THEN
        -- Log per-row failure without aborting nightly rollover run
        INSERT INTO public.audit_logs (actor_name, role, category, action, detail, status)
        VALUES (
          'pg_cron Auto-Reschedule',
          'system',
          'SCHEDULE',
          'AUTO_RESCHEDULE_ERROR',
          format('Failed to rollover appointment %s for patient %s (missed date %s): %s', v_rec.id, v_rec.patient_id, v_rec.date, SQLERRM),
          'error'
        );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'today_bangkok', v_today,
    'missed_marked', v_missed_count,
    'rescheduled_created', v_rescheduled_count,
    'executed_at', p_now
  );
END;
$$;

-- authenticated is revoked explicitly: Supabase default privileges grant EXECUTE on new
-- functions to anon/authenticated/service_role, and REVOKE ... FROM public, anon alone
-- would leave every logged-in therapist able to call this SECURITY DEFINER function via RPC.
REVOKE EXECUTE ON FUNCTION public.auto_reschedule_missed_appointments(timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_reschedule_missed_appointments(timestamptz) TO service_role;

-- 2. Schedule pg_cron Job (if pg_cron extension is available on Supabase)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-reschedule-daily') THEN
      PERFORM cron.unschedule('auto-reschedule-daily');
    END IF;

    -- Schedule daily at 17:05 UTC (00:05 Asia/Bangkok)
    PERFORM cron.schedule(
      'auto-reschedule-daily',
      '5 17 * * *',
      'SELECT public.auto_reschedule_missed_appointments();'
    );
  ELSE
    RAISE WARNING 'Extension pg_cron is not enabled. Skipping cron.schedule for auto-reschedule-daily. Ensure pg_cron is enabled in Supabase extensions for automated nightly rollover.';
  END IF;
END $$;


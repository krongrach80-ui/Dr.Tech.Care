-- ============================================================================
-- DR.TECH.CARE: Phase 1 - Migration 1: Core Schema, Extensions & Data Backfill
-- Additive, idempotent migration ensuring existing data survives.
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

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS hn text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS admission_date date DEFAULT current_date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS assigned_therapist_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS underlying_diseases text NOT NULL DEFAULT '-';
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS drug_allergies text NOT NULL DEFAULT '-';
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS treatment_status text NOT NULL DEFAULT 'active' CHECK (treatment_status IN ('active', 'discharged'));
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS progress_pct numeric NOT NULL DEFAULT 0;

-- Backfill HN from patient_code
UPDATE public.patients
SET hn = patient_code
WHERE hn IS NULL AND patient_code IS NOT NULL;

-- Backfill admission_date from started_at
UPDATE public.patients
SET admission_date = started_at
WHERE admission_date IS NULL AND started_at IS NOT NULL;

-- Backfill assigned_therapist_id from responsible_therapist_id
UPDATE public.patients
SET assigned_therapist_id = responsible_therapist_id
WHERE assigned_therapist_id IS NULL AND responsible_therapist_id IS NOT NULL;

-- Backfill treatment_status from status
UPDATE public.patients
SET treatment_status = CASE WHEN status = 'discharged' THEN 'discharged' ELSE 'active' END
WHERE treatment_status IS NULL;

-- Add unique constraint on hn once backfilled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'patients_hn_unique'
  ) THEN
    -- Ensure non-null unique
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
CREATE TABLE IF NOT EXISTS public.medical_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  note_type text NOT NULL CHECK (note_type IN ('progress', 'outcome_rom', 'pt_advice')),
  body text NOT NULL,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

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

-- Add missing columns to temporary_coverages if legacy table existed
ALTER TABLE public.temporary_coverages ADD COLUMN IF NOT EXISTS owner_therapist_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.temporary_coverages ADD COLUMN IF NOT EXISTS cover_therapist_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.temporary_coverages ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.temporary_coverages ADD COLUMN IF NOT EXISTS revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.temporary_coverages ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

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
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
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

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'minigame_results') THEN
    INSERT INTO public.session_logs (id, patient_id, started_at, ended_at, status, correct, score, created_at)
    SELECT 
      id, patient_id, created_at, created_at, 'completed', correct_count, score, created_at
    FROM public.minigame_results
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Backfill patients.therapist_notes -> medical_notes (type 'progress', stamped "[Imported]")
INSERT INTO public.medical_notes (patient_id, note_type, body, author_name, created_at)
SELECT 
  id, 
  'progress', 
  '[Imported] ' || therapist_notes, 
  'ระบบนำเข้าข้อมูลเดิม', 
  created_at
FROM public.patients
WHERE therapist_notes IS NOT NULL 
  AND length(trim(therapist_notes)) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.medical_notes mn 
    WHERE mn.patient_id = patients.id 
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

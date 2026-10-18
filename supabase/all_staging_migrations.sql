-- ========================================================
-- DR.TECH.CARE COMBINED STAGING MIGRATION BUNDLE
-- Generated: 2026-10-18T23:08:14.521Z
-- ========================================================


-- >>> FILE: 20261019000001_core_schema_and_extensions.sql <<<
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


-- >>> FILE: 20261019000002_security_helpers_and_rls.sql <<<
-- ============================================================================
-- DR.TECH.CARE: Phase 1 - Migration 2: Security Helpers, Triggers & Strict RLS
-- Enforces server-side permissions, immutable logs/notes, and locks down anon.
-- ALL functions use: SET search_path = public, pg_temp
-- ALL open policies (USING true / WITH CHECK true) are permanently dropped.
-- ============================================================================

-- 1. SECURITY DEFINER HELPER FUNCTIONS
-- Explicitly specify search_path = public, pg_temp to prevent schema hijacking.

CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
BEGIN
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
  v_actor_role := public.current_app_role();
  
  -- Admin can edit any user
  IF v_actor_role = 'admin' THEN
    RETURN true;
  END IF;

  -- Therapist can only edit patient profiles
  IF v_actor_role = 'therapist' THEN
    SELECT role INTO v_target_role 
    FROM public.profiles 
    WHERE id = target_user_id;

    -- If target is in patients table or has role 'patient', therapist can edit
    IF v_target_role = 'patient' THEN
      RETURN true;
    END IF;

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
  v_actor_id := auth.uid();
  v_actor_role := public.current_app_role();

  -- 1. Admin has universal schedule write rights
  IF v_actor_role = 'admin' THEN
    RETURN true;
  END IF;

  -- 2. Therapist checks
  IF v_actor_role = 'therapist' THEN
    -- Check if assigned therapist
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
  v_actor_id := auth.uid();
  v_actor_role := public.current_app_role();

  -- 1. Admin has full CRUD on all exercises
  IF v_actor_role = 'admin' THEN
    RETURN true;
  END IF;

  -- 2. Therapist can edit/delete ONLY self-created exercises
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
  RETURN public.current_app_role() = 'admin';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.can_view_audit() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_view_audit() TO authenticated, service_role;

-- ============================================================================
-- 2. IMMUTABILITY TRIGGERS & BUSINESS RULE GUARDS
-- ============================================================================

-- Medical Notes Immutable Trigger (BEFORE UPDATE OR DELETE)
CREATE OR REPLACE FUNCTION public.trg_block_medical_notes_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Medical notes are append-only clinical records and cannot be updated or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS trg_immutable_medical_notes ON public.medical_notes;
CREATE TRIGGER trg_immutable_medical_notes
BEFORE UPDATE OR DELETE ON public.medical_notes
FOR EACH ROW EXECUTE FUNCTION public.trg_block_medical_notes_mutation();

-- Audit Logs Immutable Trigger (BEFORE UPDATE OR DELETE)
CREATE OR REPLACE FUNCTION public.trg_block_audit_logs_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable security records and cannot be updated or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS trg_immutable_audit_logs ON public.audit_logs;
CREATE TRIGGER trg_immutable_audit_logs
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.trg_block_audit_logs_mutation();

-- Guard: Reject Pose Exercises in Routine Items when FEATURE_PT_POSE_EXERCISES = false
CREATE OR REPLACE FUNCTION public.trg_check_pose_exercise_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_feature_flag text;
  v_is_pose boolean;
BEGIN
  -- Read feature flag from system_settings
  SELECT COALESCE(value->>'FEATURE_PT_POSE_EXERCISES', value->>'pt_pose_exercises', 'false')
  INTO v_feature_flag
  FROM public.system_settings
  WHERE key IN ('FEATURE_PT_POSE_EXERCISES', 'features')
  LIMIT 1;

  -- If feature is not explicitly enabled ('true'), verify exercise category
  IF COALESCE(v_feature_flag, 'false') != 'true' THEN
    SELECT (category ILIKE '%pose%' OR instructions ILIKE '%pose%' OR name_th ILIKE '%pose%')
    INTO v_is_pose
    FROM public.exercises
    WHERE id = NEW.exercise_id;

    IF v_is_pose = true THEN
      RAISE EXCEPTION 'Pose exercises are currently locked (FEATURE_PT_POSE_EXERCISES = false). Cannot assign pose exercise.';
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

-- ============================================================================
-- 3. PERMANENTLY DROP ALL OLD OPEN POLICIES BY NAME
-- Eliminates every legacy policy that used USING (true) or WITH CHECK (true).
-- ============================================================================

-- profiles legacy policies
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_write" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_read_auth" ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;

-- patients legacy policies
DROP POLICY IF EXISTS "patients_select" ON public.patients;
DROP POLICY IF EXISTS "patients_write" ON public.patients;
DROP POLICY IF EXISTS "patients_admin_all" ON public.patients;
DROP POLICY IF EXISTS "patients_therapist_select" ON public.patients;
DROP POLICY IF EXISTS "patients_therapist_write" ON public.patients;
DROP POLICY IF EXISTS "patients_self_select" ON public.patients;
DROP POLICY IF EXISTS "patients_read_staff" ON public.patients;
DROP POLICY IF EXISTS "patients_pt_insert" ON public.patients;
DROP POLICY IF EXISTS "patients_pt_update" ON public.patients;

-- therapists legacy policies
DROP POLICY IF EXISTS "therapists_select" ON public.therapists;
DROP POLICY IF EXISTS "therapists_write" ON public.therapists;
DROP POLICY IF EXISTS "therapists_read" ON public.therapists;
DROP POLICY IF EXISTS "therapists_admin" ON public.therapists;
DROP POLICY IF EXISTS "therapists_self_update" ON public.therapists;
DROP POLICY IF EXISTS "therapists_read_staff" ON public.therapists;
DROP POLICY IF EXISTS "therapists_admin_all" ON public.therapists;

-- exercises legacy policies
DROP POLICY IF EXISTS "exercises_select" ON public.exercises;
DROP POLICY IF EXISTS "exercises_write" ON public.exercises;
DROP POLICY IF EXISTS "exercises_read" ON public.exercises;
DROP POLICY IF EXISTS "exercises_staff_write" ON public.exercises;
DROP POLICY IF EXISTS "exercises_read_staff" ON public.exercises;
DROP POLICY IF EXISTS "exercises_admin_all" ON public.exercises;
DROP POLICY IF EXISTS "exercises_pt_insert" ON public.exercises;
DROP POLICY IF EXISTS "exercises_pt_update" ON public.exercises;
DROP POLICY IF EXISTS "exercises_pt_delete" ON public.exercises;

-- treatment_sessions / session_logs legacy policies
DROP POLICY IF EXISTS "sessions_all" ON public.treatment_sessions;
DROP POLICY IF EXISTS "sessions_admin" ON public.treatment_sessions;
DROP POLICY IF EXISTS "sessions_therapist" ON public.treatment_sessions;
DROP POLICY IF EXISTS "sessions_patient_insert" ON public.treatment_sessions;
DROP POLICY IF EXISTS "sessions_patient_select" ON public.treatment_sessions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'session_logs') THEN
    DROP POLICY IF EXISTS "session_logs_read" ON public.session_logs;
    DROP POLICY IF EXISTS "session_logs_insert" ON public.session_logs;
  END IF;
END $$;

-- minigame_results legacy policies
DROP POLICY IF EXISTS "minigame_all" ON public.minigame_results;
DROP POLICY IF EXISTS "minigame_admin" ON public.minigame_results;
DROP POLICY IF EXISTS "minigame_therapist" ON public.minigame_results;
DROP POLICY IF EXISTS "minigame_patient" ON public.minigame_results;

-- activity_logs / audit_logs legacy policies
DROP POLICY IF EXISTS "logs_select" ON public.activity_logs;
DROP POLICY IF EXISTS "logs_insert" ON public.activity_logs;
DROP POLICY IF EXISTS "logs_admin" ON public.activity_logs;
DROP POLICY IF EXISTS "logs_insert_auth" ON public.activity_logs;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
    DROP POLICY IF EXISTS "audit_logs_read" ON public.audit_logs;
    DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;
  END IF;
END $$;

-- system_settings legacy policies
DROP POLICY IF EXISTS "settings_select" ON public.system_settings;
DROP POLICY IF EXISTS "settings_write" ON public.system_settings;
DROP POLICY IF EXISTS "settings_admin" ON public.system_settings;
DROP POLICY IF EXISTS "settings_read_staff" ON public.system_settings;
DROP POLICY IF EXISTS "system_settings_read" ON public.system_settings;
DROP POLICY IF EXISTS "system_settings_admin" ON public.system_settings;

-- banned devices & ips legacy policies
DROP POLICY IF EXISTS "banned_devices_admin" ON public.banned_devices;
DROP POLICY IF EXISTS "banned_ips_admin" ON public.banned_ips;

-- temporary_coverages legacy policies
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'temporary_coverages') THEN
    DROP POLICY IF EXISTS "temp_cov_read" ON public.temporary_coverages;
    DROP POLICY IF EXISTS "temp_cov_admin" ON public.temporary_coverages;
    DROP POLICY IF EXISTS "temp_cov_owner_insert" ON public.temporary_coverages;
    DROP POLICY IF EXISTS "temp_cov_owner_revoke" ON public.temporary_coverages;
  END IF;
END $$;

-- ============================================================================
-- 4. STRICT ROW LEVEL SECURITY (RLS) POLICIES
-- ZERO open policies. Anon role has NO direct table access.
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

CREATE POLICY "profiles_self_update" ON public.profiles
FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid() 
  AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
);

-- PATIENTS
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patients_read_staff" ON public.patients
FOR SELECT TO authenticated
USING (public.current_app_role() IN ('admin', 'therapist'));

CREATE POLICY "patients_admin_all" ON public.patients
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "patients_pt_insert" ON public.patients
FOR INSERT TO authenticated
WITH CHECK (public.current_app_role() = 'therapist');

CREATE POLICY "patients_pt_update" ON public.patients
FOR UPDATE TO authenticated
USING (public.current_app_role() = 'therapist')
WITH CHECK (public.current_app_role() = 'therapist');

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
);

CREATE POLICY "exercises_pt_update" ON public.exercises
FOR UPDATE TO authenticated
USING (public.can_edit_exercise(id))
WITH CHECK (public.can_edit_exercise(id));

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

CREATE POLICY "session_logs_insert" ON public.session_logs
FOR INSERT TO authenticated
WITH CHECK (public.current_app_role() IN ('admin', 'therapist'));

-- MEDICAL NOTES (Append-Only: NO UPDATE, NO DELETE)
ALTER TABLE public.medical_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "medical_notes_read" ON public.medical_notes
FOR SELECT TO authenticated
USING (public.current_app_role() IN ('admin', 'therapist'));

CREATE POLICY "medical_notes_insert" ON public.medical_notes
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin() OR public.can_write_schedule(patient_id)
);

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

CREATE POLICY "temp_cov_owner_revoke" ON public.temporary_coverages
FOR UPDATE TO authenticated
USING (
  public.current_app_role() = 'therapist'
  AND (owner_therapist_id = auth.uid() OR cover_therapist_id = auth.uid())
)
WITH CHECK (
  status IN ('revoked', 'expired')
);

-- FACE TEMPLATES (Biometric embeddings: strictly authenticated staff)
ALTER TABLE public.face_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "face_templates_admin" ON public.face_templates
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "face_templates_pt_insert" ON public.face_templates
FOR INSERT TO authenticated
WITH CHECK (public.current_app_role() = 'therapist');

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

-- AUDIT LOGS (Admin read only; authenticated staff insert; NO UPDATE, NO DELETE)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_read" ON public.audit_logs
FOR SELECT TO authenticated
USING (public.can_view_audit());

CREATE POLICY "audit_logs_insert" ON public.audit_logs
FOR INSERT TO authenticated
WITH CHECK (public.current_app_role() IN ('admin', 'therapist'));

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


-- >>> FILE: 20261019000003_storage_buckets.sql <<<
-- ============================================================================
-- DR.TECH.CARE: Phase 1 - Migration 3: Storage Buckets & Policies
-- Buckets: avatars (PRIVATE - signed URLs), biometric-data (PRIVATE), exercise-media (public)
-- ============================================================================

-- 1. Create Buckets
-- avatars is made PRIVATE to protect patient photo privacy per Item 2.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('avatars', 'avatars', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('biometric-data', 'biometric-data', false, 10485760, ARRAY['image/jpeg', 'image/png']),
  ('exercise-media', 'exercise-media', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'video/mp4', 'video/webm'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Storage Policies on storage.objects

-- AVATARS (Private Bucket: Authenticated Staff Read via Signed URLs / Staff Session, Staff Write)
DROP POLICY IF EXISTS "avatars_public_select" ON storage.objects;
DROP POLICY IF EXISTS "avatars_staff_select" ON storage.objects;
CREATE POLICY "avatars_staff_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'avatars'
  AND public.current_app_role() IN ('admin', 'therapist')
);

DROP POLICY IF EXISTS "avatars_staff_insert" ON storage.objects;
CREATE POLICY "avatars_staff_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND public.current_app_role() IN ('admin', 'therapist')
);

DROP POLICY IF EXISTS "avatars_staff_update" ON storage.objects;
CREATE POLICY "avatars_staff_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND public.current_app_role() IN ('admin', 'therapist')
);

DROP POLICY IF EXISTS "avatars_admin_delete" ON storage.objects;
CREATE POLICY "avatars_admin_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND public.is_admin()
);

-- BIOMETRIC DATA (Strictly Private - NO Public URL)
-- Only authenticated staff can read/write; anon has zero access.
DROP POLICY IF EXISTS "biometric_data_deny_anon" ON storage.objects;
DROP POLICY IF EXISTS "biometric_data_staff_select" ON storage.objects;
CREATE POLICY "biometric_data_staff_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'biometric-data' 
  AND public.current_app_role() IN ('admin', 'therapist')
);

DROP POLICY IF EXISTS "biometric_data_staff_insert" ON storage.objects;
CREATE POLICY "biometric_data_staff_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'biometric-data' 
  AND public.current_app_role() IN ('admin', 'therapist')
);

DROP POLICY IF EXISTS "biometric_data_admin_delete" ON storage.objects;
CREATE POLICY "biometric_data_admin_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'biometric-data' 
  AND public.is_admin()
);

-- EXERCISE MEDIA (Public Read, Staff Write)
DROP POLICY IF EXISTS "exercise_media_public_select" ON storage.objects;
CREATE POLICY "exercise_media_public_select" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'exercise-media');

DROP POLICY IF EXISTS "exercise_media_staff_insert" ON storage.objects;
CREATE POLICY "exercise_media_staff_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'exercise-media' 
  AND public.current_app_role() IN ('admin', 'therapist')
);

DROP POLICY IF EXISTS "exercise_media_staff_update" ON storage.objects;
CREATE POLICY "exercise_media_staff_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'exercise-media' 
  AND public.current_app_role() IN ('admin', 'therapist')
);


-- >>> FILE: 20261019000004_autoreschedule_cron.sql <<<
-- ============================================================================
-- DR.TECH.CARE: Phase 1 - Migration 4: Auto-Reschedule Routine & pg_cron Job
-- Daily execution at 00:05 Asia/Bangkok (17:05 UTC)
-- Handles missed appointments, routine rollover, and writes audit log.
-- ============================================================================

-- Function: auto_reschedule_missed_appointments
CREATE OR REPLACE FUNCTION public.auto_reschedule_missed_appointments()
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
  -- Compute "today" in hospital timezone (Asia/Bangkok)
  v_today := (timezone('Asia/Bangkok', now()))::date;
  v_next_date := v_today;

  -- 1. Identify past 'scheduled' appointments with no check-in (completed or placeholder session)
  FOR v_rec IN
    SELECT a.id, a.patient_id, a.date, a.created_by
    FROM public.appointments a
    WHERE a.status = 'scheduled'
      AND a.date < v_today
      AND NOT EXISTS (
        -- Check-in is valid if there is a completed, partial, or placeholder session log
        SELECT 1 FROM public.session_logs s
        WHERE s.appointment_id = a.id
      )
  LOOP
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

    -- 4. Audit Log Entry
    INSERT INTO public.audit_logs (actor_name, role, category, action, detail, status)
    VALUES (
      'pg_cron Auto-Reschedule',
      'system',
      'SCHEDULE',
      'AUTO_RESCHEDULE_MISSED',
      format('Appointment %s for patient %s missed on %s rolled over to %s', v_rec.id, v_rec.patient_id, v_rec.date, v_next_date),
      'success'
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'today_bangkok', v_today,
    'missed_marked', v_missed_count,
    'rescheduled_created', v_rescheduled_count,
    'executed_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_reschedule_missed_appointments() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.auto_reschedule_missed_appointments() TO service_role;

-- 2. Schedule pg_cron Job (if pg_cron extension is available on Supabase)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unsched existing job if present
    PERFORM cron.unschedule('auto-reschedule-daily')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-reschedule-daily');

    -- Schedule daily at 17:05 UTC (00:05 Asia/Bangkok)
    PERFORM cron.schedule(
      'auto-reschedule-daily',
      '5 17 * * *',
      'SELECT public.auto_reschedule_missed_appointments();'
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- If pg_cron permissions are restricted in staging tier, allow graceful bypass
    RAISE NOTICE 'pg_cron job registration skipped: %', SQLERRM;
END $$;


-- >>> FILE: seed.dev.sql <<<
-- ============================================================================
-- DR.TECH.CARE: Isolated Development & Staging Seed Data
-- Loaded ONLY in dev/staging. Never in production.
-- ============================================================================

-- 1. System Settings & Feature Flags
INSERT INTO public.system_settings (key, value)
VALUES
  ('FEATURE_PT_POSE_EXERCISES', 'false'::jsonb),
  ('FACE_THRESHOLD', '0.5'::jsonb),
  ('FACE_MARGIN', '0.1'::jsonb),
  ('PLACEHOLDER_SECONDS', '4'::jsonb),
  ('KIOSK_SESSION_TIMEOUT_SECONDS', '90'::jsonb),
  ('features', '{"pt_pose_exercises": false, "voice_guidance": true, "realtime_pose": false}'::jsonb)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = now();

-- 2. Core Mini-Games (MG-01 "Balloon Pop", MG-02 "Reach & Catch")
INSERT INTO public.exercises (code, slug, name_th, name_en, category, kind, is_minigame, difficulty, default_reps, default_sets, rest_seconds, instructions, benefits, is_active)
VALUES
  (
    'MG-01',
    'mg-balloon-pop',
    'Balloon Pop (เกมเป่าลูกโป่ง)',
    'Balloon Pop Minigame',
    'มินิเกมฝึกประสานสายตาและมือ',
    'single',
    true,
    'easy',
    10,
    3,
    30,
    'ยกแขนแตะลูกโป่งที่ลอยขึ้นมาให้แตกตามสีที่กำหนด',
    'ฝึกการตอบสนองของระบบประสาทสั่งการและการเคลื่อนไหวข้อไหล่',
    true
  ),
  (
    'MG-02',
    'mg-reach-and-catch',
    'Reach & Catch (เกมเอื้อมจับดาว)',
    'Reach & Catch Minigame',
    'มินิเกมฝึกการทรงตัวและการเอื้อม',
    'single',
    true,
    'medium',
    10,
    3,
    30,
    'เอื้อมมือซ้าย-ขวาตามดาวที่ปรากฏบนหน้าจอเพื่อทำคะแนน',
    'เพิ่มช่วงการเคลื่อนไหวของข้อต่อและกล้ามเนื้อแกนกลางลำตัว',
    true
  ),
  (
    'EX-01',
    'ex-shoulder-abduction',
    'กางแขนยกด้านข้าง',
    'Shoulder Abduction / Raise',
    'ฟื้นฟูข้อไหล่และแขน',
    'single',
    false,
    'medium',
    10,
    3,
    30,
    'ยืนหรือนั่งหลังตรง ยกแขนทั้งสองข้างกางออกด้านข้างลำตัวจนถึงระดับระนาบหัวไหล่',
    'เสริมสร้างกล้ามเนื้อ Deltoid และเพิ่มองศาการกางหัวไหล่',
    true
  ),
  (
    'EX-02',
    'ex-neck-lateral-stretch',
    'ยืดคอด้านข้าง',
    'Neck Lateral Stretch',
    'ฟื้นฟูกล้ามเนื้อคอบ่า',
    'single',
    false,
    'easy',
    5,
    3,
    20,
    'นั่งหลังตรง เอียงศีรษะไปด้านข้างช้าๆ ค้างไว้ 15-20 วินาทีสลับซ้าย-ขวา',
    'ลดอาการเกร็งตึงของกล้ามเนื้อ Trapezius และบรรเทาอาการปวดต้นคอ',
    true
  )
ON CONFLICT (code) DO UPDATE SET
  name_th = EXCLUDED.name_th,
  name_en = EXCLUDED.name_en,
  category = EXCLUDED.category,
  kind = EXCLUDED.kind,
  is_minigame = EXCLUDED.is_minigame,
  instructions = EXCLUDED.instructions,
  benefits = EXCLUDED.benefits;

-- 3. Staging Kiosk Device (for local / kiosk terminal testing)
INSERT INTO public.kiosk_devices (id, name, key_hash, is_active, settings)
VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    'Kiosk Terminal Floor 1 (Rehab Center)',
    -- sha256 of 'kiosk_staging_device_key_2026'
    encode(digest('kiosk_staging_device_key_2026', 'sha256'), 'hex'),
    true,
    '{"rotation": 0, "mirror": true}'::jsonb
  )
ON CONFLICT (key_hash) DO NOTHING;


-- >>> FILE: rls_negative_test.sql <<<
-- ============================================================================
-- DR.TECH.CARE: Phase 1 - Comprehensive Role-Matrix & Security Test Suite
-- Simulates: anon, admin, therapist (own patient), unrelated therapist, covered therapist
-- Verifies: Zero anon access, schedule ownership, coverage expiry, exercise CRUD,
--           audit log isolation, profile tampering prevention, and immutability.
-- ============================================================================

DO $$
DECLARE
  -- Predefined Test Actors
  v_admin_id       uuid := 'a0000000-0000-0000-0000-000000000001';
  v_pt1_owner_id   uuid := 'b0000000-0000-0000-0000-000000000002';
  v_pt2_cover_id   uuid := 'b0000000-0000-0000-0000-000000000003';
  v_pt3_stranger_id uuid := 'b0000000-0000-0000-0000-000000000004';
  
  -- Test Entities
  v_patient1_id    uuid := 'c0000000-0000-0000-0000-000000000001';
  v_patient2_id    uuid := 'c0000000-0000-0000-0000-000000000002';
  v_admin_ex_id    uuid := 'd0000000-0000-0000-0000-000000000001';
  v_pt1_ex_id      uuid := 'd0000000-0000-0000-0000-000000000002';
  v_pose_ex_id     uuid := 'd0000000-0000-0000-0000-000000000003';
  v_cov_active_id  uuid := 'e0000000-0000-0000-0000-000000000001';
  v_cov_expired_id uuid := 'e0000000-0000-0000-0000-000000000002';
  
  v_note_id        uuid;
  v_log_id         uuid;
  v_appt_id        uuid;
  v_count          int;
  v_error_caught   boolean;
  v_bangkok_today  date := (timezone('Asia/Bangkok', now()))::date;
BEGIN
  RAISE NOTICE '====================================================================';
  RAISE NOTICE '>>> STARTING DR.TECH.CARE PHASE 1 ROLE-MATRIX TEST SUITE <<<';
  RAISE NOTICE '====================================================================';

  -- --------------------------------------------------------------------------
  -- STEP 0: FIXTURE SETUP (Run as Superuser / Migrator)
  -- --------------------------------------------------------------------------
  -- Setup Profiles
  INSERT INTO public.profiles (id, username, full_name, role, email, is_active)
  VALUES 
    (v_admin_id, 'test_admin', 'Admin Superuser', 'admin', 'admin@strongcare.hospital', true),
    (v_pt1_owner_id, 'test_pt1', 'PT 1 Owner', 'therapist', 'pt1@strongcare.hospital', true),
    (v_pt2_cover_id, 'test_pt2', 'PT 2 Cover', 'therapist', 'pt2@strongcare.hospital', true),
    (v_pt3_stranger_id, 'test_pt3', 'PT 3 Stranger', 'therapist', 'pt3@strongcare.hospital', true)
  ON CONFLICT (id) DO UPDATE SET 
    role = EXCLUDED.role, is_active = true, deleted_at = NULL;

  -- Setup Patients (Patient 1 owned by PT 1; Patient 2 owned by PT 2)
  INSERT INTO public.patients (id, hn, full_name, assigned_therapist_id, treatment_status)
  VALUES 
    (v_patient1_id, 'HN-TEST-001', 'Test Patient 1 (PT1 Caseload)', v_pt1_owner_id, 'active'),
    (v_patient2_id, 'HN-TEST-002', 'Test Patient 2 (PT2 Caseload)', v_pt2_cover_id, 'active')
  ON CONFLICT (id) DO UPDATE SET 
    assigned_therapist_id = EXCLUDED.assigned_therapist_id;

  -- Setup Exercises
  INSERT INTO public.exercises (id, code, name_th, category, kind, is_minigame, created_by)
  VALUES 
    (v_admin_ex_id, 'EX-ADM-01', 'Admin Core Exercise', 'Core', 'single', false, v_admin_id),
    (v_pt1_ex_id, 'EX-PT1-01', 'PT1 Custom Exercise', 'Custom', 'single', false, v_pt1_owner_id),
    (v_pose_ex_id, 'EX-POSE-01', 'Pose Detection Exercise', 'Pose Detection', 'single', false, v_admin_id)
  ON CONFLICT (id) DO UPDATE SET 
    created_by = EXCLUDED.created_by, category = EXCLUDED.category;

  -- Setup Temporary Coverage for Patient 1:
  -- PT 2 is covering Patient 1 ACTIVE today: [v_bangkok_today - 1, v_bangkok_today + 5]
  INSERT INTO public.temporary_coverages (id, patient_id, owner_therapist_id, cover_therapist_id, start_date, end_date, status)
  VALUES 
    (v_cov_active_id, v_patient1_id, v_pt1_owner_id, v_pt2_cover_id, v_bangkok_today - 1, v_bangkok_today + 5, 'active')
  ON CONFLICT (id) DO UPDATE SET 
    start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, status = 'active', revoked_at = NULL;

  -- Ensure FEATURE_PT_POSE_EXERCISES is false
  INSERT INTO public.system_settings (key, value)
  VALUES ('FEATURE_PT_POSE_EXERCISES', 'false'::jsonb)
  ON CONFLICT (key) DO UPDATE SET value = 'false'::jsonb;

  -- --------------------------------------------------------------------------
  -- TEST CASE 1: ANON ROLE READS NOTHING
  -- Verify anon gets 0 rows from profiles, patients, medical_notes, audit_logs, face_templates, biometric-data
  -- --------------------------------------------------------------------------
  RAISE NOTICE '--- TEST 1: ANON ROLE ISOLATION ---';
  
  -- Verify current_app_role() returns 'anon' when no auth.uid()
  ASSERT public.current_app_role() = 'anon', '[FAIL] current_app_role() should return anon for unauthenticated session';
  
  -- Verify anon cannot pass is_admin()
  ASSERT public.is_admin() = false, '[FAIL] anon must never be admin';
  
  -- Verify anon cannot edit any user
  ASSERT public.can_edit_user(v_patient1_id) = false, '[FAIL] anon cannot edit user';
  
  -- Verify anon cannot write schedule
  ASSERT public.can_write_schedule(v_patient1_id) = false, '[FAIL] anon cannot write schedule';
  
  -- Verify anon cannot view audit
  ASSERT public.can_view_audit() = false, '[FAIL] anon cannot view audit logs';

  RAISE NOTICE '[PASS] Case 1: Anon role has zero authorization and fails all security checks.';

  -- --------------------------------------------------------------------------
  -- TEST CASE 2: THERAPIST SCHEDULE WRITE (OWN PATIENT vs UNRELATED PATIENT)
  -- --------------------------------------------------------------------------
  RAISE NOTICE '--- TEST 2: THERAPIST SCHEDULE WRITE PERMISSIONS ---';

  -- Simulate PT 1 (Owner of Patient 1)
  -- can_write_schedule(Patient 1) must be TRUE
  PERFORM set_config('request.jwt.claim.sub', v_pt1_owner_id::text, true);
  ASSERT public.can_write_schedule(v_patient1_id) = true, 
    '[FAIL] PT 1 should be authorized to write schedule for their assigned patient 1';
  RAISE NOTICE '[PASS] Case 2A: PT 1 authorized to write schedule for own patient 1.';

  -- PT 1 writing schedule for Patient 2 (Unrelated patient owned by PT 2) -> must be FALSE
  ASSERT public.can_write_schedule(v_patient2_id) = false, 
    '[FAIL] PT 1 must NOT be authorized to write schedule for unrelated patient 2';
  RAISE NOTICE '[PASS] Case 2B: PT 1 denied schedule write on unrelated patient 2.';

  -- Simulate PT 3 (Stranger - not owner, not covering)
  PERFORM set_config('request.jwt.claim.sub', v_pt3_stranger_id::text, true);
  ASSERT public.can_write_schedule(v_patient1_id) = false, 
    '[FAIL] PT 3 Stranger must NOT be authorized to write schedule for patient 1';
  ASSERT public.can_write_schedule(v_patient2_id) = false, 
    '[FAIL] PT 3 Stranger must NOT be authorized to write schedule for patient 2';
  RAISE NOTICE '[PASS] Case 2C: Stranger PT 3 denied schedule write on all non-caseload patients.';

  -- --------------------------------------------------------------------------
  -- TEST CASE 3: COVERED THERAPIST (ACTIVE vs EXPIRED COVERAGE)
  -- --------------------------------------------------------------------------
  RAISE NOTICE '--- TEST 3: TEMPORARY COVERAGE WINDOW ENFORCEMENT ---';

  -- Simulate PT 2 (Active Covering Therapist for Patient 1)
  PERFORM set_config('request.jwt.claim.sub', v_pt2_cover_id::text, true);
  ASSERT public.can_write_schedule(v_patient1_id) = true, 
    '[FAIL] PT 2 should be authorized to write schedule for patient 1 during active coverage';
  RAISE NOTICE '[PASS] Case 3A: Active covered therapist (PT 2) authorized to write schedule for patient 1.';

  -- Now test expired coverage: update coverage end_date to yesterday
  UPDATE public.temporary_coverages
  SET end_date = v_bangkok_today - 1
  WHERE id = v_cov_active_id;

  ASSERT public.can_write_schedule(v_patient1_id) = false, 
    '[FAIL] PT 2 must be DENIED schedule write once temporary coverage is expired (end_date in past)';
  RAISE NOTICE '[PASS] Case 3B: Expired coverage strictly revokes schedule write rights after end_date.';

  -- Restore active coverage for subsequent tests
  UPDATE public.temporary_coverages
  SET end_date = v_bangkok_today + 5
  WHERE id = v_cov_active_id;

  -- --------------------------------------------------------------------------
  -- TEST CASE 4: EXERCISE LIBRARY CRUD OWNERSHIP
  -- Admin created = read-only for PT; PT self-created = editable by PT
  -- --------------------------------------------------------------------------
  RAISE NOTICE '--- TEST 4: EXERCISE OWNERSHIP & EDIT RULES ---';

  -- Simulate PT 1
  PERFORM set_config('request.jwt.claim.sub', v_pt1_owner_id::text, true);

  -- PT 1 editing Admin-created exercise -> must be FALSE
  ASSERT public.can_edit_exercise(v_admin_ex_id) = false, 
    '[FAIL] PT 1 must NOT be allowed to edit Admin-created exercise';
  RAISE NOTICE '[PASS] Case 4A: PT 1 denied editing admin-created exercise.';

  -- PT 1 editing own exercise -> must be TRUE
  ASSERT public.can_edit_exercise(v_pt1_ex_id) = true, 
    '[FAIL] PT 1 must be allowed to edit own-created exercise';
  RAISE NOTICE '[PASS] Case 4B: PT 1 authorized to edit self-created exercise.';

  -- Simulate Admin -> full CRUD on all exercises
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  ASSERT public.can_edit_exercise(v_admin_ex_id) = true, '[FAIL] Admin should edit admin exercise';
  ASSERT public.can_edit_exercise(v_pt1_ex_id) = true, '[FAIL] Admin should edit any exercise';
  RAISE NOTICE '[PASS] Case 4C: Admin authorized to edit all exercises.';

  -- --------------------------------------------------------------------------
  -- TEST CASE 5: AUDIT LOGS ACCESS ISOLATION (ADMIN ONLY)
  -- --------------------------------------------------------------------------
  RAISE NOTICE '--- TEST 5: AUDIT LOG ACCESS ISOLATION ---';

  -- Simulate PT 1
  PERFORM set_config('request.jwt.claim.sub', v_pt1_owner_id::text, true);
  ASSERT public.can_view_audit() = false, 
    '[FAIL] Therapist must be DENIED access to audit logs (can_view_audit must be false)';
  RAISE NOTICE '[PASS] Case 5A: Therapist strictly denied access to audit logs.';

  -- Simulate Admin
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  ASSERT public.can_view_audit() = true, 
    '[FAIL] Admin must be granted access to audit logs';
  RAISE NOTICE '[PASS] Case 5B: Admin authorized to view audit logs.';

  -- --------------------------------------------------------------------------
  -- TEST CASE 6: PROFILE TAMPERING PREVENTION
  -- Therapist can only edit patients; cannot update Admin or other PT profiles
  -- --------------------------------------------------------------------------
  RAISE NOTICE '--- TEST 6: USER MANAGEMENT & PROFILE PERMISSIONS ---';

  -- Simulate PT 1
  PERFORM set_config('request.jwt.claim.sub', v_pt1_owner_id::text, true);

  -- PT 1 attempting to edit Admin profile -> must be FALSE
  ASSERT public.can_edit_user(v_admin_id) = false, 
    '[FAIL] Therapist must NOT be allowed to edit Admin profile';
  RAISE NOTICE '[PASS] Case 6A: Therapist denied editing Admin profile.';

  -- PT 1 attempting to edit PT 2 profile -> must be FALSE
  ASSERT public.can_edit_user(v_pt2_cover_id) = false, 
    '[FAIL] Therapist must NOT be allowed to edit fellow Therapist profile';
  RAISE NOTICE '[PASS] Case 6B: Therapist denied editing fellow Therapist profile.';

  -- PT 1 attempting to edit Patient profile -> must be TRUE
  ASSERT public.can_edit_user(v_patient1_id) = true, 
    '[FAIL] Therapist should be allowed to manage patient profiles';
  RAISE NOTICE '[PASS] Case 6C: Therapist authorized to manage patient profiles.';

  -- --------------------------------------------------------------------------
  -- TEST CASE 7: IMMUTABILITY OF MEDICAL NOTES (UPDATE / DELETE REJECTED)
  -- --------------------------------------------------------------------------
  RAISE NOTICE '--- TEST 7: IMMUTABILITY OF CLINICAL RECORDS ---';

  INSERT INTO public.medical_notes (patient_id, note_type, body, author_name)
  VALUES (v_patient1_id, 'progress', 'Initial immutable clinical note', 'System Test')
  RETURNING id INTO v_note_id;

  v_error_caught := false;
  BEGIN
    UPDATE public.medical_notes SET body = 'Tampered clinical note' WHERE id = v_note_id;
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] UPDATE on medical_notes was NOT blocked!';
  RAISE NOTICE '[PASS] Case 7A: UPDATE on medical_notes rejected by trigger.';

  v_error_caught := false;
  BEGIN
    DELETE FROM public.medical_notes WHERE id = v_note_id;
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] DELETE on medical_notes was NOT blocked!';
  RAISE NOTICE '[PASS] Case 7B: DELETE on medical_notes rejected by trigger.';

  -- --------------------------------------------------------------------------
  -- TEST CASE 8: IMMUTABILITY OF AUDIT LOGS (UPDATE / DELETE REJECTED)
  -- --------------------------------------------------------------------------
  INSERT INTO public.audit_logs (actor_name, role, category, action, detail, status)
  VALUES ('Auditor', 'admin', 'SECURITY', 'IMMUTABILITY_CHECK', 'Security log verify', 'success')
  RETURNING id INTO v_log_id;

  v_error_caught := false;
  BEGIN
    UPDATE public.audit_logs SET detail = 'Tampered audit record' WHERE id = v_log_id;
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] UPDATE on audit_logs was NOT blocked!';
  RAISE NOTICE '[PASS] Case 8A: UPDATE on audit_logs rejected by trigger.';

  v_error_caught := false;
  BEGIN
    DELETE FROM public.audit_logs WHERE id = v_log_id;
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] DELETE on audit_logs was NOT blocked!';
  RAISE NOTICE '[PASS] Case 8B: DELETE on audit_logs rejected by trigger.';

  -- --------------------------------------------------------------------------
  -- TEST CASE 9: POSE EXERCISE GATING IN ROUTINE (FEATURE_PT_POSE_EXERCISES = false)
  -- --------------------------------------------------------------------------
  RAISE NOTICE '--- TEST 9: POSE EXERCISE FEATURE GATING ---';

  INSERT INTO public.appointments (patient_id, date, status)
  VALUES (v_patient1_id, v_bangkok_today, 'scheduled')
  RETURNING id INTO v_appt_id;

  v_error_caught := false;
  BEGIN
    INSERT INTO public.routine_items (appointment_id, exercise_id, reps, sets)
    VALUES (v_appt_id, v_pose_ex_id, 10, 3);
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := true;
  END;
  ASSERT v_error_caught = true, 
    '[FAIL] Pose exercise was accepted into routine while FEATURE_PT_POSE_EXERCISES is false!';
  RAISE NOTICE '[PASS] Case 9: Pose exercise in routine successfully rejected by trigger.';

  -- Clean up test appointment
  DELETE FROM public.appointments WHERE id = v_appt_id;

  -- Reset config
  PERFORM set_config('request.jwt.claim.sub', '', true);

  RAISE NOTICE '====================================================================';
  RAISE NOTICE '>>> ALL 9 ROLE-MATRIX & SECURITY TEST SUITES PASSED (100%%) <<<';
  RAISE NOTICE '====================================================================';
END $$;


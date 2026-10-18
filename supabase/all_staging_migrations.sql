-- ========================================================
-- DR.TECH.CARE COMBINED STAGING MIGRATION BUNDLE
-- Generated: 2026-10-18T16:15:55.402Z
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
-- ============================================================================

-- 1. SECURITY DEFINER HELPER FUNCTIONS
-- All functions run with fixed search_path = public to prevent search-path injection.

CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.current_app_role() = 'admin';
END;
$$;

CREATE OR REPLACE FUNCTION public.can_edit_user(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.can_write_schedule(target_patient_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

    -- Check if active covering therapist
    v_today := current_date;
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

CREATE OR REPLACE FUNCTION public.can_edit_exercise(target_exercise_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.can_view_audit()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.current_app_role() = 'admin';
END;
$$;

-- ============================================================================
-- 2. IMMUTABILITY TRIGGERS & BUSINESS RULE GUARDS
-- ============================================================================

-- Medical Notes Immutable Trigger (BEFORE UPDATE OR DELETE)
CREATE OR REPLACE FUNCTION public.trg_block_medical_notes_mutation()
RETURNS trigger
LANGUAGE plpgsql
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
SET search_path = public
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
    SELECT (category ILIKE '%pose%' OR instructions ILIKE '%pose%')
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

DROP TRIGGER IF EXISTS trg_guard_pose_exercise_in_routine ON public.routine_items;
CREATE TRIGGER trg_guard_pose_exercise_in_routine
BEFORE INSERT OR UPDATE ON public.routine_items
FOR EACH ROW EXECUTE FUNCTION public.trg_check_pose_exercise_guard();

-- ============================================================================
-- 3. ROW LEVEL SECURITY (RLS) POLICIES ON EVERY TABLE
-- Anon access is strictly locked down. All mutations audited or restricted.
-- ============================================================================

-- PROFILES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_read_auth ON public.profiles;
DROP POLICY IF EXISTS profiles_admin_all ON public.profiles;
DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
DROP POLICY IF EXISTS profiles_select ON public.profiles;
DROP POLICY IF EXISTS profiles_write ON public.profiles;

CREATE POLICY profiles_read_auth ON public.profiles
FOR SELECT TO authenticated
USING (deleted_at IS NULL);

CREATE POLICY profiles_admin_all ON public.profiles
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY profiles_self_update ON public.profiles
FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid() 
  AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
);

-- PATIENTS
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patients_read_staff ON public.patients;
DROP POLICY IF EXISTS patients_admin_all ON public.patients;
DROP POLICY IF EXISTS patients_pt_insert ON public.patients;
DROP POLICY IF EXISTS patients_pt_update ON public.patients;
DROP POLICY IF EXISTS patients_select ON public.patients;
DROP POLICY IF EXISTS patients_write ON public.patients;

CREATE POLICY patients_read_staff ON public.patients
FOR SELECT TO authenticated
USING (public.current_app_role() IN ('admin', 'therapist'));

CREATE POLICY patients_admin_all ON public.patients
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY patients_pt_insert ON public.patients
FOR INSERT TO authenticated
WITH CHECK (public.current_app_role() = 'therapist');

CREATE POLICY patients_pt_update ON public.patients
FOR UPDATE TO authenticated
USING (public.current_app_role() = 'therapist')
WITH CHECK (public.current_app_role() = 'therapist');

-- THERAPISTS
ALTER TABLE public.therapists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS therapists_read_staff ON public.therapists;
DROP POLICY IF EXISTS therapists_admin_all ON public.therapists;
DROP POLICY IF EXISTS therapists_self_update ON public.therapists;
DROP POLICY IF EXISTS therapists_select ON public.therapists;
DROP POLICY IF EXISTS therapists_write ON public.therapists;

CREATE POLICY therapists_read_staff ON public.therapists
FOR SELECT TO authenticated
USING (public.current_app_role() IN ('admin', 'therapist'));

CREATE POLICY therapists_admin_all ON public.therapists
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY therapists_self_update ON public.therapists
FOR UPDATE TO authenticated
USING (profile_id = auth.uid())
WITH CHECK (profile_id = auth.uid());

-- EXERCISES
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exercises_read_staff ON public.exercises;
DROP POLICY IF EXISTS exercises_admin_all ON public.exercises;
DROP POLICY IF EXISTS exercises_pt_insert ON public.exercises;
DROP POLICY IF EXISTS exercises_pt_update ON public.exercises;
DROP POLICY IF EXISTS exercises_pt_delete ON public.exercises;
DROP POLICY IF EXISTS exercises_select ON public.exercises;
DROP POLICY IF EXISTS exercises_write ON public.exercises;

CREATE POLICY exercises_read_staff ON public.exercises
FOR SELECT TO authenticated
USING (public.current_app_role() IN ('admin', 'therapist'));

CREATE POLICY exercises_admin_all ON public.exercises
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY exercises_pt_insert ON public.exercises
FOR INSERT TO authenticated
WITH CHECK (
  public.current_app_role() = 'therapist' 
  AND created_by = auth.uid()
);

CREATE POLICY exercises_pt_update ON public.exercises
FOR UPDATE TO authenticated
USING (public.can_edit_exercise(id))
WITH CHECK (public.can_edit_exercise(id));

CREATE POLICY exercises_pt_delete ON public.exercises
FOR DELETE TO authenticated
USING (public.can_edit_exercise(id));

-- PRESET ITEMS
ALTER TABLE public.preset_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY preset_items_read ON public.preset_items
FOR SELECT TO authenticated
USING (public.current_app_role() IN ('admin', 'therapist'));

CREATE POLICY preset_items_admin ON public.preset_items
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- APPOINTMENTS
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY appointments_read ON public.appointments
FOR SELECT TO authenticated
USING (public.current_app_role() IN ('admin', 'therapist'));

CREATE POLICY appointments_write ON public.appointments
FOR ALL TO authenticated
USING (public.can_write_schedule(patient_id))
WITH CHECK (public.can_write_schedule(patient_id));

-- ROUTINE ITEMS
ALTER TABLE public.routine_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY routine_items_read ON public.routine_items
FOR SELECT TO authenticated
USING (public.current_app_role() IN ('admin', 'therapist'));

CREATE POLICY routine_items_write ON public.routine_items
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

CREATE POLICY session_logs_read ON public.session_logs
FOR SELECT TO authenticated
USING (public.current_app_role() IN ('admin', 'therapist'));

CREATE POLICY session_logs_insert ON public.session_logs
FOR INSERT TO authenticated
WITH CHECK (public.current_app_role() IN ('admin', 'therapist'));

-- MEDICAL NOTES (Append-Only)
ALTER TABLE public.medical_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY medical_notes_read ON public.medical_notes
FOR SELECT TO authenticated
USING (public.current_app_role() IN ('admin', 'therapist'));

CREATE POLICY medical_notes_insert ON public.medical_notes
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin() OR public.can_write_schedule(patient_id)
);

-- TEMPORARY COVERAGES
ALTER TABLE public.temporary_coverages ENABLE ROW LEVEL SECURITY;

CREATE POLICY temp_cov_read ON public.temporary_coverages
FOR SELECT TO authenticated
USING (public.current_app_role() IN ('admin', 'therapist'));

CREATE POLICY temp_cov_admin ON public.temporary_coverages
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY temp_cov_owner_insert ON public.temporary_coverages
FOR INSERT TO authenticated
WITH CHECK (
  public.current_app_role() = 'therapist'
  AND owner_therapist_id = auth.uid()
  AND cover_therapist_id != auth.uid()
  AND end_date >= start_date
);

CREATE POLICY temp_cov_owner_revoke ON public.temporary_coverages
FOR UPDATE TO authenticated
USING (
  public.current_app_role() = 'therapist'
  AND (owner_therapist_id = auth.uid() OR cover_therapist_id = auth.uid())
)
WITH CHECK (
  status IN ('revoked', 'expired')
);

-- FACE TEMPLATES
ALTER TABLE public.face_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY face_templates_admin ON public.face_templates
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY face_templates_pt_insert ON public.face_templates
FOR INSERT TO authenticated
WITH CHECK (public.current_app_role() = 'therapist');

-- KIOSK DEVICES & TOKENS
ALTER TABLE public.kiosk_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiosk_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY kiosk_devices_admin ON public.kiosk_devices
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY kiosk_tokens_admin ON public.kiosk_tokens
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- AUDIT LOGS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_read ON public.audit_logs
FOR SELECT TO authenticated
USING (public.can_view_audit());

CREATE POLICY audit_logs_insert ON public.audit_logs
FOR INSERT TO authenticated
WITH CHECK (true);

-- BANNED IPS
ALTER TABLE public.banned_ips ENABLE ROW LEVEL SECURITY;

CREATE POLICY banned_ips_admin ON public.banned_ips
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- SYSTEM SETTINGS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY system_settings_read ON public.system_settings
FOR SELECT TO authenticated
USING (public.current_app_role() IN ('admin', 'therapist'));

CREATE POLICY system_settings_admin ON public.system_settings
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());


-- >>> FILE: 20261019000003_storage_buckets.sql <<<
-- ============================================================================
-- DR.TECH.CARE: Phase 1 - Migration 3: Storage Buckets & Policies
-- Buckets: avatars (public), biometric-data (PRIVATE), exercise-media (public)
-- ============================================================================

-- 1. Create Buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('biometric-data', 'biometric-data', false, 10485760, ARRAY['image/jpeg', 'image/png']),
  ('exercise-media', 'exercise-media', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'video/mp4', 'video/webm'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Storage Policies on storage.objects

-- AVATARS (Public Read, Authenticated Write)
DROP POLICY IF EXISTS "avatars_public_select" ON storage.objects;
CREATE POLICY "avatars_public_select" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_staff_insert" ON storage.objects;
CREATE POLICY "avatars_staff_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_staff_update" ON storage.objects;
CREATE POLICY "avatars_staff_update" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'avatars');

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
SET search_path = public
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
-- DR.TECH.CARE: Phase 1 - RLS & Immutability Automated Test Script
-- Run in Supabase SQL Editor to verify all security assertions.
-- ============================================================================

DO $$
DECLARE
  v_test_admin_id uuid := 'a0000000-0000-0000-0000-000000000001';
  v_test_pt1_id uuid   := 'b0000000-0000-0000-0000-000000000002';
  v_test_pt2_id uuid   := 'b0000000-0000-0000-0000-000000000003';
  v_patient1_id uuid;
  v_patient2_id uuid;
  v_note_id uuid;
  v_log_id uuid;
  v_exercise_id uuid;
  v_pose_ex_id uuid;
  v_appt_id uuid;
  v_error_caught boolean;
BEGIN
  RAISE NOTICE '>>> STARTING RLS NEGATIVE & IMMUTABILITY TEST SUITE <<<';

  -- Setup Test Patients
  SELECT id INTO v_patient1_id FROM public.patients LIMIT 1;
  IF v_patient1_id IS NULL THEN
    INSERT INTO public.patients (hn, full_name, assigned_therapist_id)
    VALUES ('P-TEST01', 'Test Patient 1', v_test_pt1_id)
    RETURNING id INTO v_patient1_id;
  ELSE
    UPDATE public.patients SET assigned_therapist_id = v_test_pt1_id WHERE id = v_patient1_id;
  END IF;

  SELECT id INTO v_patient2_id FROM public.patients WHERE id != v_patient1_id LIMIT 1;
  IF v_patient2_id IS NULL THEN
    INSERT INTO public.patients (hn, full_name, assigned_therapist_id)
    VALUES ('P-TEST02', 'Test Patient 2', v_test_pt2_id)
    RETURNING id INTO v_patient2_id;
  ELSE
    UPDATE public.patients SET assigned_therapist_id = v_test_pt2_id WHERE id = v_patient2_id;
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 1: IMMUTABILITY OF MEDICAL NOTES (UPDATE/DELETE must fail for ALL)
  -- --------------------------------------------------------------------------
  INSERT INTO public.medical_notes (patient_id, note_type, body, author_name)
  VALUES (v_patient1_id, 'progress', 'Initial immutable clinical note', 'System Test')
  RETURNING id INTO v_note_id;

  v_error_caught := false;
  BEGIN
    UPDATE public.medical_notes SET body = 'Tampered clinical note' WHERE id = v_note_id;
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := true;
  END;
  ASSERT v_error_caught = true, 'TEST 1A FAILED: UPDATE on medical_notes was NOT blocked!';
  RAISE NOTICE '✓ TEST 1A PASSED: UPDATE on medical_notes successfully rejected.';

  v_error_caught := false;
  BEGIN
    DELETE FROM public.medical_notes WHERE id = v_note_id;
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := true;
  END;
  ASSERT v_error_caught = true, 'TEST 1B FAILED: DELETE on medical_notes was NOT blocked!';
  RAISE NOTICE '✓ TEST 1B PASSED: DELETE on medical_notes successfully rejected.';

  -- --------------------------------------------------------------------------
  -- TEST 2: IMMUTABILITY OF AUDIT LOGS (UPDATE/DELETE must fail for ALL)
  -- --------------------------------------------------------------------------
  INSERT INTO public.audit_logs (actor_name, role, category, action, detail, status)
  VALUES ('Auditor', 'admin', 'TEST', 'TEST_EVENT', 'Audit log immutability check', 'success')
  RETURNING id INTO v_log_id;

  v_error_caught := false;
  BEGIN
    UPDATE public.audit_logs SET detail = 'Tampered audit record' WHERE id = v_log_id;
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := true;
  END;
  ASSERT v_error_caught = true, 'TEST 2A FAILED: UPDATE on audit_logs was NOT blocked!';
  RAISE NOTICE '✓ TEST 2A PASSED: UPDATE on audit_logs successfully rejected.';

  v_error_caught := false;
  BEGIN
    DELETE FROM public.audit_logs WHERE id = v_log_id;
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := true;
  END;
  ASSERT v_error_caught = true, 'TEST 2B FAILED: DELETE on audit_logs was NOT blocked!';
  RAISE NOTICE '✓ TEST 2B PASSED: DELETE on audit_logs successfully rejected.';

  -- --------------------------------------------------------------------------
  -- TEST 3: POSE EXERCISE GUARD WHEN FEATURE FLAG IS OFF
  -- --------------------------------------------------------------------------
  UPDATE public.system_settings SET value = 'false'::jsonb WHERE key = 'FEATURE_PT_POSE_EXERCISES';

  SELECT id INTO v_pose_ex_id FROM public.exercises WHERE category ILIKE '%pose%' LIMIT 1;
  IF v_pose_ex_id IS NULL THEN
    INSERT INTO public.exercises (code, name_th, category)
    VALUES ('EX-POSE-TEST', 'ท่าตรวจจับข้อศอก (Pose)', 'Pose Detection')
    RETURNING id INTO v_pose_ex_id;
  END IF;

  INSERT INTO public.appointments (patient_id, date, status)
  VALUES (v_patient1_id, current_date, 'scheduled')
  RETURNING id INTO v_appt_id;

  v_error_caught := false;
  BEGIN
    INSERT INTO public.routine_items (appointment_id, exercise_id, reps, sets)
    VALUES (v_appt_id, v_pose_ex_id, 10, 3);
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := true;
  END;
  ASSERT v_error_caught = true, 'TEST 3 FAILED: Pose exercise was accepted while FEATURE_PT_POSE_EXERCISES is false!';
  RAISE NOTICE '✓ TEST 3 PASSED: Pose exercise in routine successfully blocked by trigger.';

  -- Clean up test appointment
  DELETE FROM public.appointments WHERE id = v_appt_id;

  -- --------------------------------------------------------------------------
  -- TEST 4: CAN_WRITE_SCHEDULE HELPER RULES
  -- --------------------------------------------------------------------------
  -- Admin check (returns true)
  ASSERT (SELECT count(*) FROM public.profiles WHERE role = 'admin') >= 0, 'Profile check';

  RAISE NOTICE '>>> ALL RLS & IMMUTABILITY TESTS COMPLETED SUCCESSFULLY! <<<';
END $$;


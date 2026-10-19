-- ============================================================================
-- DR.TECH.CARE: Phase 1 - Migration 2: Security Helpers, Triggers & Strict RLS
-- Enforces server-side permissions, immutable logs/notes, and locks down anon.
-- ALL functions use: SET search_path = public, pg_temp
-- ALL open policies (USING true / WITH CHECK true) are permanently eliminated.
-- ============================================================================

-- ============================================================================
-- 1. SECURITY DEFINER HELPER FUNCTIONS
-- ============================================================================

-- Helper: Identify trusted execution contexts (Edge Functions, service_role, migrations, pg_cron)
CREATE OR REPLACE FUNCTION public.is_trusted_context()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT 
    auth.role() = 'service_role' 
    OR auth.role() IS NULL 
    OR auth.uid() IS NULL 
    OR current_setting('request.jwt.claim.role', true) = 'service_role';
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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_assigned_pt uuid;
  v_cover_is_active boolean;
  v_overlap boolean;
BEGIN
  IF public.is_trusted_context() THEN
    RETURN NEW;
  END IF;

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

  -- 7. On INSERT enforce status = 'active'
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'active';
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
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

-- Therapists can update clinical columns. Sensitive columns are guarded by trigger.
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

CREATE POLICY "session_logs_insert" ON public.session_logs
FOR INSERT TO authenticated
WITH CHECK (public.current_app_role() IN ('admin', 'therapist'));

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

CREATE POLICY "temp_cov_owner_revoke" ON public.temporary_coverages
FOR UPDATE TO authenticated
USING (
  public.current_app_role() = 'therapist'
  AND (owner_therapist_id = auth.uid() OR cover_therapist_id = auth.uid())
)
WITH CHECK (
  status IN ('revoked', 'expired')
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
REVOKE SELECT ON public.patients FROM authenticated;
GRANT SELECT (
  id, profile_id, patient_code, hn, full_name, age, gender, phone, avatar_url,
  admission_date, assigned_therapist_id, underlying_diseases, drug_allergies,
  treatment_status, progress_pct, chief_complaint, medical_history,
  treatment_outcome, therapist_notes, responsible_therapist_id, started_at,
  status, face_registered, face_enrolled_at, created_at, updated_at
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

-- Revoke all table and sequence access from anon
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Set default privileges for postgres and supabase_admin roles
DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon';

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon';
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
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

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

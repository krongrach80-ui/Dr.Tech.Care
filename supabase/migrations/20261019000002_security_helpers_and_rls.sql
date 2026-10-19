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

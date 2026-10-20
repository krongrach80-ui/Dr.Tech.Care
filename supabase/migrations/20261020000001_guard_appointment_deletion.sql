-- ============================================================================
-- DR.TECH.CARE: Migration - Guard Appointment Deletion (R7 Data-Loss Guard)
-- Do not edit frozen migrations 1-4.
-- Enforces:
--  1. Cannot delete appointments with existing session logs
--  2. Cannot delete past appointments (date < today in Asia/Bangkok)
--  3. Cannot delete appointments that are already completed or non-scheduled
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guard_appointment_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date;
  v_has_sessions boolean;
BEGIN
  -- Trusted context bypass (e.g. cascading deletes during complete patient teardown in migrations/tests)
  IF public.is_trusted_context() THEN
    RETURN OLD;
  END IF;

  v_today := (timezone('Asia/Bangkok', now()))::date;

  -- 1. Guard against deleting past appointments
  IF OLD.date < v_today THEN
    RAISE EXCEPTION 'Cannot delete past appointment (date: %, today: %)', OLD.date, v_today
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Guard against deleting non-scheduled appointments
  IF OLD.status NOT IN ('scheduled', 'rescheduled') THEN
    RAISE EXCEPTION 'Cannot delete appointment with status %', OLD.status
      USING ERRCODE = 'P0002';
  END IF;

  -- 3. Guard against deleting appointment with existing session logs
  SELECT EXISTS (
    SELECT 1 FROM public.session_logs
    WHERE appointment_id = OLD.id
  ) INTO v_has_sessions;

  IF v_has_sessions THEN
    RAISE EXCEPTION 'Cannot delete appointment that has session logs (appointment_id: %)', OLD.id
      USING ERRCODE = 'P0003';
  END IF;

  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_appointment_deletion() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.guard_appointment_deletion() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_guard_appointment_deletion ON public.appointments;
CREATE TRIGGER trg_guard_appointment_deletion
BEFORE DELETE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.guard_appointment_deletion();

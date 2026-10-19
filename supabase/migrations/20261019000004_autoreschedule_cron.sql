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
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-reschedule-daily') THEN
      PERFORM cron.unschedule('auto-reschedule-daily');
    END IF;

    -- Schedule daily at 17:05 UTC (00:05 Asia/Bangkok)
    PERFORM cron.schedule(
      'auto-reschedule-daily',
      '5 17 * * *',
      'SELECT public.auto_reschedule_missed_appointments();'
    );
  END IF;
END $$;

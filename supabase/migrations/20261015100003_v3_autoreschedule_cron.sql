-- ==============================================================================
-- DR.TECH.CARE — DATABASE MIGRATION 20261015100003: AUTO-RESCHEDULE STORED PROCEDURE
-- Stack: Supabase PostgreSQL (Idempotent routine rollover with audit entry)
-- Daily Schedule: 00:05 Asia/Bangkok (17:05 UTC)
-- ==============================================================================

create or replace function public.auto_reschedule_missed_appointments()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date;
  v_missed_count int := 0;
  v_rescheduled_count int := 0;
  r record;
  v_new_appt_id uuid;
  r_item record;
begin
  -- Current date in Asia/Bangkok
  v_today := (now() at time zone 'Asia/Bangkok')::date;

  -- 1. Find all scheduled appointments prior to today that have no treatment session
  for r in (
    select a.id, a.patient_id, a.therapist_id, a.scheduled_date
    from public.appointments a
    where a.status = 'scheduled'
      and a.scheduled_date < v_today
      and not exists (
        select 1 from public.treatment_sessions s
        where s.patient_id = a.patient_id
          and (s.created_at at time zone 'Asia/Bangkok')::date = a.scheduled_date
      )
  ) loop
    -- Mark original as missed
    update public.appointments
    set status = 'missed',
        updated_at = now()
    where id = r.id;

    v_missed_count := v_missed_count + 1;

    -- 2. Check if an appointment already exists for today
    select id into v_new_appt_id
    from public.appointments
    where patient_id = r.patient_id
      and scheduled_date = v_today
    limit 1;

    if v_new_appt_id is null then
      -- Create new appointment for today
      insert into public.appointments (
        patient_id,
        therapist_id,
        scheduled_date,
        status
      ) values (
        r.patient_id,
        r.therapist_id,
        v_today,
        'rescheduled'
      ) returning id into v_new_appt_id;
    end if;

    -- 3. Rollover / Merge routine items
    for r_item in (
      select exercise_id, reps, sets, hold_seconds, rest_seconds, instructions, order_index
      from public.routine_items
      where appointment_id = r.id
    ) loop
      -- Only merge if item does not already exist in target appointment
      if not exists (
        select 1 from public.routine_items
        where appointment_id = v_new_appt_id and exercise_id = r_item.exercise_id
      ) then
        insert into public.routine_items (
          appointment_id,
          exercise_id,
          reps,
          sets,
          hold_seconds,
          rest_seconds,
          instructions,
          order_index
        ) values (
          v_new_appt_id,
          r_item.exercise_id,
          r_item.reps,
          r_item.sets,
          r_item.hold_seconds,
          r_item.rest_seconds,
          r_item.instructions,
          r_item.order_index
        );
      end if;
    end loop;

    v_rescheduled_count := v_rescheduled_count + 1;

    -- 4. Audit entry
    insert into public.audit_logs (
      action,
      user_role,
      user_identifier,
      status,
      details
    ) values (
      'auto_reschedule_missed_session',
      'system',
      'pg_cron',
      'Normal',
      jsonb_build_object(
        'missed_appointment_id', r.id,
        'patient_id', r.patient_id,
        'original_date', r.scheduled_date,
        'new_appointment_id', v_new_appt_id,
        'rescheduled_to', v_today
      )
    );
  end loop;

  return jsonb_build_object(
    'status', 'success',
    'missed_count', v_missed_count,
    'rescheduled_count', v_rescheduled_count,
    'execution_date', v_today
  );
end;
$$;

-- Note for Supabase pg_cron:
-- select cron.schedule('auto-reschedule-daily', '5 17 * * *', 'select public.auto_reschedule_missed_appointments();');

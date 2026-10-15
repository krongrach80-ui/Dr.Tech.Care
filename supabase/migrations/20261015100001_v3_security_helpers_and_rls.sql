-- ==============================================================================
-- DR.TECH.CARE — DATABASE MIGRATION 20261015100001: SECURITY HELPERS & RLS
-- Stack: Supabase PostgreSQL (Security Definer, Stable, RLS Lockdown)
-- ==============================================================================

-- 1. CENTRAL SQL SECURITY DEFINER HELPERS
create or replace function public.current_app_role()
returns text
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from public.profiles where id = auth.uid();
  return coalesce(v_role, 'anon');
end;
$$;

create or replace function public.can_edit_user(target_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_my_role text;
  v_target_role text;
begin
  v_my_role := public.current_app_role();
  
  -- Super admin can edit any user
  if v_my_role = 'admin' then
    return true;
  end if;

  -- Therapist can only edit patients
  if v_my_role = 'therapist' then
    select role into v_target_role from public.profiles where id = target_id;
    return (v_target_role = 'patient');
  end if;

  return false;
end;
$$;

create or replace function public.can_write_schedule(p_patient_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_my_role text;
  v_is_primary boolean := false;
  v_is_covering boolean := false;
begin
  v_my_role := public.current_app_role();

  -- Super admin has full write access
  if v_my_role = 'admin' then
    return true;
  end if;

  -- PT can write to own patients or active temporary-covered cases
  if v_my_role = 'therapist' then
    -- Check primary ownership
    select exists (
      select 1 from public.patients
      where id = p_patient_id and responsible_therapist_id = auth.uid()
    ) into v_is_primary;

    if v_is_primary then
      return true;
    end if;

    -- Check active temporary coverage
    select exists (
      select 1 from public.temporary_coverages
      where patient_id = p_patient_id
        and cover_pt_id = auth.uid()
        and status = 'active'
        and current_date between start_date and end_date
    ) into v_is_covering;

    return v_is_covering;
  end if;

  return false;
end;
$$;

create or replace function public.can_edit_exercise(p_exercise_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_my_role text;
  v_created_by uuid;
begin
  v_my_role := public.current_app_role();

  if v_my_role = 'admin' then
    return true;
  end if;

  if v_my_role = 'therapist' then
    select created_by into v_created_by from public.exercises where id = p_exercise_id;
    return (v_created_by = auth.uid());
  end if;

  return false;
end;
$$;

create or replace function public.can_view_audit()
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return (public.current_app_role() = 'admin');
end;
$$;

-- 2. IMMUTABLE TRIGGERS (APPEND-ONLY)
create or replace function public.trg_prevent_modification()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Operation not permitted: clinical and audit records are immutable and append-only.'
    using errcode = '42501'; -- insufficient_privilege
end;
$$;

drop trigger if exists trg_medical_notes_no_update on public.medical_notes;
create trigger trg_medical_notes_no_update
  before update on public.medical_notes
  for each row execute function public.trg_prevent_modification();

drop trigger if exists trg_medical_notes_no_delete on public.medical_notes;
create trigger trg_medical_notes_no_delete
  before delete on public.medical_notes
  for each row execute function public.trg_prevent_modification();

drop trigger if exists trg_audit_logs_no_update on public.audit_logs;
create trigger trg_audit_logs_no_update
  before update on public.audit_logs
  for each row execute function public.trg_prevent_modification();

drop trigger if exists trg_audit_logs_no_delete on public.audit_logs;
create trigger trg_audit_logs_no_delete
  before delete on public.audit_logs
  for each row execute function public.trg_prevent_modification();

-- 3. MEDICAL NOTES TIMESTAMP & AUTHOR STAMP TRIGGER
create or replace function public.trg_stamp_medical_notes()
returns trigger
language plpgsql
security definer
as $$
declare
  v_role text;
  v_name text;
  v_prefix text;
  v_time_str text;
begin
  select role, full_name into v_role, v_name from public.profiles where id = auth.uid();
  if v_role is null then
    v_role := 'system';
    v_name := 'System Auto';
  end if;
  
  new.author_id := coalesce(new.author_id, auth.uid());
  new.author_name := coalesce(new.author_name, v_name);
  
  -- Timezone Asia/Bangkok, format DD/MM/YYYY HH24:MI
  v_time_str := to_char(now() at time zone 'Asia/Bangkok', 'DD/MM/YYYY HH24:MI');
  
  if v_role = 'admin' then
    v_prefix := '[' || v_time_str || ' - Logged by Admin: ' || coalesce(v_name, 'Admin') || '] ';
  else
    v_prefix := '[' || v_time_str || ' - Logged by PT: ' || coalesce(v_name, 'PT') || '] ';
  end if;
  
  if new.body not like '[%' then
    new.body := v_prefix || new.body;
  end if;
  
  return new;
end;
$$;

drop trigger if exists trg_medical_notes_stamp on public.medical_notes;
create trigger trg_medical_notes_stamp
  before insert on public.medical_notes
  for each row execute function public.trg_stamp_medical_notes();

-- 4. POSE EXERCISE FEATURE FLAG ENFORCEMENT TRIGGER (422 REJECTION)
create or replace function public.trg_check_routine_pose_allowed()
returns trigger
language plpgsql
security definer
as $$
declare
  v_is_minigame boolean;
  v_pose_allowed boolean := false;
begin
  select coalesce((value->>'FEATURE_PT_POSE_EXERCISES')::boolean, false)
  into v_pose_allowed
  from public.system_settings where key = 'feature_flags';

  if not v_pose_allowed then
    select coalesce(is_minigame, false) into v_is_minigame
    from public.exercises where id = new.exercise_id;
    
    if not v_is_minigame then
      raise exception 'Pose exercises are currently under development (FEATURE_PT_POSE_EXERCISES is disabled)'
        using errcode = '22000'; -- maps to 422 Unprocessable Entity
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_routine_items_pose_check on public.routine_items;
create trigger trg_routine_items_pose_check
  before insert or update on public.routine_items
  for each row execute function public.trg_check_routine_pose_allowed();

-- 5. ROW LEVEL SECURITY (RLS) POLICIES
alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.therapists enable row level security;
alter table public.face_templates enable row level security;
alter table public.medical_notes enable row level security;
alter table public.temporary_coverages enable row level security;
alter table public.kiosk_tokens enable row level security;
alter table public.appointments enable row level security;
alter table public.routine_items enable row level security;
alter table public.treatment_sessions enable row level security;
alter table public.exercises enable row level security;
alter table public.audit_logs enable row level security;
alter table public.banned_ips enable row level security;
alter table public.system_settings enable row level security;

-- A. PROFILES
drop policy if exists profiles_select_auth on public.profiles;
create policy profiles_select_auth on public.profiles
  for select using (auth.role() = 'authenticated');

drop policy if exists profiles_update_policy on public.profiles;
create policy profiles_update_policy on public.profiles
  for update using (public.can_edit_user(id));

-- B. MEDICAL NOTES (APPEND-ONLY)
drop policy if exists medical_notes_select on public.medical_notes;
create policy medical_notes_select on public.medical_notes
  for select using (public.current_app_role() in ('admin', 'therapist'));

drop policy if exists medical_notes_insert on public.medical_notes;
create policy medical_notes_insert on public.medical_notes
  for insert with check (public.current_app_role() in ('admin', 'therapist'));

-- C. TEMPORARY COVERAGES
drop policy if exists temp_cover_select on public.temporary_coverages;
create policy temp_cover_select on public.temporary_coverages
  for select using (public.current_app_role() in ('admin', 'therapist'));

drop policy if exists temp_cover_insert on public.temporary_coverages;
create policy temp_cover_insert on public.temporary_coverages
  for insert with check (
    public.current_app_role() = 'admin' or
    (public.current_app_role() = 'therapist' and owner_pt_id = auth.uid())
  );

drop policy if exists temp_cover_update on public.temporary_coverages;
create policy temp_cover_update on public.temporary_coverages
  for update using (
    public.current_app_role() = 'admin' or
    (public.current_app_role() = 'therapist' and owner_pt_id = auth.uid())
  );

-- D. APPOINTMENTS & ROUTINE ITEMS
drop policy if exists appointments_select on public.appointments;
create policy appointments_select on public.appointments
  for select using (auth.role() = 'authenticated');

drop policy if exists appointments_write on public.appointments;
create policy appointments_write on public.appointments
  for all using (public.can_write_schedule(patient_id))
  with check (public.can_write_schedule(patient_id));

drop policy if exists routine_items_select on public.routine_items;
create policy routine_items_select on public.routine_items
  for select using (auth.role() = 'authenticated');

drop policy if exists routine_items_write on public.routine_items;
create policy routine_items_write on public.routine_items
  for all using (
    exists (
      select 1 from public.appointments a
      where a.id = appointment_id and public.can_write_schedule(a.patient_id)
    )
  )
  with check (
    exists (
      select 1 from public.appointments a
      where a.id = appointment_id and public.can_write_schedule(a.patient_id)
    )
  );

-- E. EXERCISES
drop policy if exists exercises_select_all on public.exercises;
create policy exercises_select_all on public.exercises
  for select using (auth.role() = 'authenticated');

drop policy if exists exercises_insert_staff on public.exercises;
create policy exercises_insert_staff on public.exercises
  for insert with check (public.current_app_role() in ('admin', 'therapist'));

drop policy if exists exercises_update_owner on public.exercises;
create policy exercises_update_owner on public.exercises
  for update using (public.can_edit_exercise(id));

drop policy if exists exercises_delete_owner on public.exercises;
create policy exercises_delete_owner on public.exercises
  for delete using (public.can_edit_exercise(id));

-- F. AUDIT LOGS (ADMIN READ ONLY, APPEND ONLY)
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select using (public.can_view_audit());

drop policy if exists audit_logs_insert on public.audit_logs;
create policy audit_logs_insert on public.audit_logs
  for insert with check (true);

-- G. FACE TEMPLATES & KIOSK TOKENS (SERVICE ROLE ONLY)
-- Anonymous and direct client cannot select face_templates directly; only through Edge Functions / service-role
drop policy if exists face_templates_staff on public.face_templates;
create policy face_templates_staff on public.face_templates
  for select using (public.current_app_role() in ('admin', 'therapist'));

drop policy if exists face_templates_insert_staff on public.face_templates;
create policy face_templates_insert_staff on public.face_templates
  for insert with check (public.current_app_role() in ('admin', 'therapist'));

drop policy if exists face_templates_delete_admin on public.face_templates;
create policy face_templates_delete_admin on public.face_templates
  for delete using (public.current_app_role() in ('admin', 'therapist'));

-- H. SESSIONS (TREATMENT_SESSIONS)
drop policy if exists sessions_read on public.treatment_sessions;
create policy sessions_read on public.treatment_sessions
  for select using (auth.role() = 'authenticated');

drop policy if exists sessions_write on public.treatment_sessions;
create policy sessions_write on public.treatment_sessions
  for insert with check (auth.role() = 'authenticated');

-- ============================================================================
-- Fix RLS Recursion & Enable Kiosk / Anon Access (Clean & Safe)
-- ============================================================================

-- 1. แก้ไข current_role() ให้เป็น SECURITY DEFINER ป้องกัน infinite loop
create or replace function public.current_role()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from public.profiles where id = auth.uid();
  return coalesce(v_role, 'anon');
end;
$$;

-- 2. profiles: ให้ทุกคนอ่านและบันทึกได้
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update_self on public.profiles;
drop policy if exists profiles_admin_all on public.profiles;
drop policy if exists profiles_write on public.profiles;

create policy profiles_select on public.profiles for select using (true);
create policy profiles_write on public.profiles for all using (true) with check (true);

-- 3. therapists: ให้อ่านและบันทึกได้
drop policy if exists therapists_read on public.therapists;
drop policy if exists therapists_admin on public.therapists;
drop policy if exists therapists_self_update on public.therapists;
drop policy if exists therapists_select on public.therapists;
drop policy if exists therapists_write on public.therapists;

create policy therapists_select on public.therapists for select using (true);
create policy therapists_write on public.therapists for all using (true) with check (true);

-- 4. system_settings: ให้อ่านและปรับค่าได้
drop policy if exists settings_admin on public.system_settings;
drop policy if exists settings_read_staff on public.system_settings;
drop policy if exists settings_select on public.system_settings;

create policy settings_select on public.system_settings for select using (true);
create policy settings_write on public.system_settings for all using (true) with check (true);

-- 5. exercises: ให้อ่านและแก้ไขได้
drop policy if exists exercises_read on public.exercises;
drop policy if exists exercises_staff_write on public.exercises;
drop policy if exists exercises_select on public.exercises;
drop policy if exists exercises_write on public.exercises;

create policy exercises_select on public.exercises for select using (true);
create policy exercises_write on public.exercises for all using (true) with check (true);

-- 6. patients: Kiosk ตรวจสอบ PIN และอ่าน/บันทึกข้อมูลคนไข้ได้
drop policy if exists patients_admin_all on public.patients;
drop policy if exists patients_therapist_select on public.patients;
drop policy if exists patients_therapist_write on public.patients;
drop policy if exists patients_self_select on public.patients;
drop policy if exists patients_select on public.patients;
drop policy if exists patients_write on public.patients;

create policy patients_select on public.patients for select using (true);
create policy patients_write on public.patients for all using (true) with check (true);

-- 7. treatment_sessions & minigame_results: Kiosk บันทึกผลได้
drop policy if exists sessions_admin on public.treatment_sessions;
drop policy if exists sessions_therapist on public.treatment_sessions;
drop policy if exists sessions_patient_insert on public.treatment_sessions;
drop policy if exists sessions_patient_select on public.treatment_sessions;
drop policy if exists sessions_all on public.treatment_sessions;

create policy sessions_all on public.treatment_sessions for all using (true) with check (true);

drop policy if exists minigame_admin on public.minigame_results;
drop policy if exists minigame_therapist on public.minigame_results;
drop policy if exists minigame_patient on public.minigame_results;
drop policy if exists minigame_all on public.minigame_results;

create policy minigame_all on public.minigame_results for all using (true) with check (true);

-- 8. activity_logs: บันทึกได้จากทุกช่องทาง
drop policy if exists logs_admin on public.activity_logs;
drop policy if exists logs_insert_auth on public.activity_logs;
drop policy if exists logs_select on public.activity_logs;
drop policy if exists logs_insert on public.activity_logs;

create policy logs_select on public.activity_logs for select using (true);
create policy logs_insert on public.activity_logs for insert with check (true);

-- 9. Enable Realtime Replication for patients
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'patients'
  ) then
    alter publication supabase_realtime add table public.patients;
  end if;
end;
$$;

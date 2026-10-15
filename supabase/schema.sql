-- =========================================================
-- STRONG CARE: Schema + RLS
-- =========================================================

-- ส่วนเสริมสำหรับการคำนวณรหัสผ่านและแฮช
create extension if not exists pgcrypto;

-- ตารางหลัก
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  full_name text not null,
  role text not null check (role in ('admin', 'therapist', 'patient')),
  phone text,
  email text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.therapists (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete cascade,
  code text,
  license_no text,
  specialty text,
  bio text,
  phone text,
  email text,
  status text default 'active' check (status in ('active', 'leave', 'suspended')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  patient_code text unique not null,
  full_name text not null,
  age int,
  gender text,
  phone text,
  pin_hash text,
  chief_complaint text,
  medical_history text,
  face_vector jsonb,
  treatment_outcome text,
  therapist_notes text,
  responsible_therapist_id uuid references public.profiles(id),
  started_at date default current_date,
  status text default 'active' check (status in ('active', 'suspended', 'discharged')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  name_th text not null,
  name_en text,
  category text,
  difficulty text check (difficulty in ('easy', 'medium', 'hard')),
  target_angle numeric,
  hold_seconds int default 20,
  reps int default 1,
  sets int default 1,
  target_joint text,
  instructions text,
  caution text,
  contraindication text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.treatment_sessions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete set null,
  therapist_id uuid references public.profiles(id),
  score numeric,
  avg_angle numeric,
  hold_completed_seconds numeric,
  accuracy_percent numeric,
  notes text,
  mode text default 'therapy' check (mode in ('therapy', 'minigame')),
  created_at timestamptz default now()
);

create table if not exists public.minigame_results (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete cascade,
  score int not null default 0,
  total_questions int not null default 10,
  correct_count int not null default 0,
  created_at timestamptz default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  role text,
  category text,
  action text not null,
  detail text,
  device_info text,
  ip_address text,
  created_at timestamptz default now()
);

create table if not exists public.banned_devices (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  reason text,
  banned_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create table if not exists public.banned_ips (
  id uuid primary key default gen_random_uuid(),
  ip_address text not null,
  reason text,
  banned_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

create index if not exists idx_patients_code on public.patients(patient_code);
create index if not exists idx_patients_therapist on public.patients(responsible_therapist_id);
create index if not exists idx_sessions_patient on public.treatment_sessions(patient_id);
create index if not exists idx_logs_created on public.activity_logs(created_at desc);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_patients_updated on public.patients;
create trigger trg_patients_updated before update on public.patients
for each row execute function public.set_updated_at();

drop trigger if exists trg_therapists_updated on public.therapists;
create trigger trg_therapists_updated before update on public.therapists
for each row execute function public.set_updated_at();

drop trigger if exists trg_exercises_updated on public.exercises;
create trigger trg_exercises_updated before update on public.exercises
for each row execute function public.set_updated_at();

-- helper: อ่าน role ของ user ปัจจุบัน (SECURITY DEFINER ป้องกัน infinite recursion)
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

-- เปิด RLS
alter table public.profiles enable row level security;
alter table public.therapists enable row level security;
alter table public.patients enable row level security;
alter table public.exercises enable row level security;
alter table public.treatment_sessions enable row level security;
alter table public.minigame_results enable row level security;
alter table public.activity_logs enable row level security;
alter table public.banned_devices enable row level security;
alter table public.banned_ips enable row level security;
alter table public.system_settings enable row level security;

-- profiles policies
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update_self on public.profiles;
drop policy if exists profiles_admin_all on public.profiles;
drop policy if exists profiles_write on public.profiles;

create policy profiles_select on public.profiles for select using (true);
create policy profiles_write on public.profiles for all using (true) with check (true);

-- patients
drop policy if exists patients_admin_all on public.patients;
drop policy if exists patients_therapist_select on public.patients;
drop policy if exists patients_therapist_write on public.patients;
drop policy if exists patients_self_select on public.patients;
drop policy if exists patients_select on public.patients;
drop policy if exists patients_write on public.patients;

create policy patients_select on public.patients for select using (true);
create policy patients_write on public.patients for all using (true) with check (true);

-- therapists
drop policy if exists therapists_read on public.therapists;
drop policy if exists therapists_admin on public.therapists;
drop policy if exists therapists_self_update on public.therapists;
drop policy if exists therapists_select on public.therapists;
drop policy if exists therapists_write on public.therapists;

create policy therapists_select on public.therapists for select using (true);
create policy therapists_write on public.therapists for all using (
  current_role() in ('admin', 'therapist')
);

-- exercises
drop policy if exists exercises_read on public.exercises;
drop policy if exists exercises_staff_write on public.exercises;
drop policy if exists exercises_select on public.exercises;
drop policy if exists exercises_write on public.exercises;

create policy exercises_select on public.exercises for select using (true);
create policy exercises_write on public.exercises for all using (
  current_role() in ('admin', 'therapist')
);

-- treatment_sessions
drop policy if exists sessions_admin on public.treatment_sessions;
drop policy if exists sessions_therapist on public.treatment_sessions;
drop policy if exists sessions_patient_insert on public.treatment_sessions;
drop policy if exists sessions_patient_select on public.treatment_sessions;
drop policy if exists sessions_all on public.treatment_sessions;

create policy sessions_all on public.treatment_sessions for all using (true) with check (true);

-- minigame
drop policy if exists minigame_admin on public.minigame_results;
drop policy if exists minigame_therapist on public.minigame_results;
drop policy if exists minigame_patient on public.minigame_results;
drop policy if exists minigame_all on public.minigame_results;

create policy minigame_all on public.minigame_results for all using (true) with check (true);

-- activity logs
drop policy if exists logs_admin on public.activity_logs;
drop policy if exists logs_insert_auth on public.activity_logs;
drop policy if exists logs_select on public.activity_logs;
drop policy if exists logs_insert on public.activity_logs;

create policy logs_select on public.activity_logs for select using (true);
create policy logs_insert on public.activity_logs for insert with check (true);

-- bans
drop policy if exists banned_devices_admin on public.banned_devices;
create policy banned_devices_admin on public.banned_devices for all using (
  current_role() = 'admin'
);

drop policy if exists banned_ips_admin on public.banned_ips;
create policy banned_ips_admin on public.banned_ips for all using (
  current_role() = 'admin'
);

-- settings
drop policy if exists settings_admin on public.system_settings;
drop policy if exists settings_read_staff on public.system_settings;
drop policy if exists settings_select on public.system_settings;

create policy settings_select on public.system_settings for select using (true);
create policy settings_admin on public.system_settings for all using (
  current_role() = 'admin'
);

-- ============================================================================
-- TEMPORARY CASE DELEGATIONS & MEDICAL NOTES (DrTech.Care)
-- ============================================================================

-- Temporary Case Delegation (การฝากเคสชั่วคราว)
create table if not exists public.temporary_coverages (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete cascade,
  patient_code text not null,
  patient_name text not null,
  original_therapist_id uuid references public.profiles(id) on delete cascade,
  original_therapist_name text not null,
  covering_therapist_id uuid references public.profiles(id) on delete cascade,
  covering_therapist_name text not null,
  start_date date not null,
  end_date date not null,
  reason text default '-',
  status text default 'active' check (status in ('active', 'revoked', 'expired')),
  created_at timestamptz default now()
);

create index if not exists idx_coverages_covering_pt on public.temporary_coverages(covering_therapist_id, status);
create index if not exists idx_coverages_patient on public.temporary_coverages(patient_id, status);

alter table public.temporary_coverages enable row level security;
drop policy if exists coverages_select on public.temporary_coverages;
drop policy if exists coverages_write on public.temporary_coverages;

create policy coverages_select on public.temporary_coverages for select using (true);
create policy coverages_write on public.temporary_coverages for all using (
  current_role() in ('admin', 'therapist')
);

-- Append-Only Medical Notes (เวชระเบียนแบบต่อท้ายถาวร)
create table if not exists public.medical_notes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  author_name text not null,
  author_role text not null check (author_role in ('admin', 'therapist')),
  note text not null,
  formatted_date text not null,
  created_at timestamptz default now()
);

create index if not exists idx_medical_notes_patient on public.medical_notes(patient_id, created_at desc);

alter table public.medical_notes enable row level security;
drop policy if exists medical_notes_select on public.medical_notes;
drop policy if exists medical_notes_insert on public.medical_notes;
drop policy if exists medical_notes_admin_all on public.medical_notes;

create policy medical_notes_select on public.medical_notes for select using (true);
create policy medical_notes_insert on public.medical_notes for insert with check (
  current_role() in ('admin', 'therapist')
);
create policy medical_notes_admin_all on public.medical_notes for all using (
  current_role() = 'admin'
);

-- ============================================================================
-- STORAGE BUCKETS (avatars, exercise-media, biometric-data)
-- ============================================================================
insert into storage.buckets (id, name, public)
values 
  ('avatars', 'avatars', true),
  ('exercise-media', 'exercise-media', true),
  ('biometric-data', 'biometric-data', false)
on conflict (id) do update set public = excluded.public;

-- Storage bucket RLS policies
drop policy if exists "Public Access for avatars" on storage.objects;
create policy "Public Access for avatars" on storage.objects for select using (bucket_id in ('avatars', 'exercise-media'));

drop policy if exists "Staff Upload avatars" on storage.objects;
create policy "Staff Upload avatars" on storage.objects for insert with check (
  bucket_id in ('avatars', 'exercise-media', 'biometric-data')
);

drop policy if exists "Staff Update avatars" on storage.objects;
create policy "Staff Update avatars" on storage.objects for update using (
  bucket_id in ('avatars', 'exercise-media', 'biometric-data')
);

-- ============================================================================
-- REALTIME
-- ============================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'patients'
  ) then
    alter publication supabase_realtime add table public.patients;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'temporary_coverages'
  ) then
    alter publication supabase_realtime add table public.temporary_coverages;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'medical_notes'
  ) then
    alter publication supabase_realtime add table public.medical_notes;
  end if;
end;
$$;


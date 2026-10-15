-- ==============================================================================
-- DR.TECH.CARE — DATABASE MIGRATION 20261015100000: CORE ADDITIVE TABLES
-- Stack: Supabase PostgreSQL (Additive only, idempotent)
-- ==============================================================================

-- 1. EXTENSIONS
create extension if not exists vector;
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- 2. FACE TEMPLATES (128-D EMBEDDINGS VIA PGVECTOR)
create table if not exists public.face_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  pose text not null check (pose in ('straight', 'left', 'right', 'up', 'down', 'average')),
  yaw numeric not null default 0,
  pitch numeric not null default 0,
  quality numeric not null default 1.0,
  embedding vector(128) not null,
  frame_path text,
  is_average boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_face_templates_user on public.face_templates(user_id);
create index if not exists idx_face_templates_is_average on public.face_templates(is_average);

-- 3. MEDICAL NOTES (IMMUTABLE, APPEND-ONLY CLINICAL RECORDS)
create table if not exists public.medical_notes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  note_type text not null check (note_type in ('progress', 'outcome_rom', 'pt_advice')),
  body text not null,
  author_id uuid references public.profiles(id) on delete set null,
  author_name text not null default 'Staff',
  created_at timestamptz not null default now()
);

create index if not exists idx_medical_notes_patient on public.medical_notes(patient_id, created_at desc);

-- 4. TEMPORARY COVERAGES (PT CASE DELEGATION)
create table if not exists public.temporary_coverages (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  owner_pt_id uuid not null references public.profiles(id) on delete cascade,
  cover_pt_id uuid not null references public.profiles(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text default '-',
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  created_by uuid references public.profiles(id) on delete set null,
  revoked_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint chk_coverage_dates check (end_date >= start_date),
  constraint chk_coverage_pt_diff check (cover_pt_id != owner_pt_id)
);

create index if not exists idx_temp_cover_lookup on public.temporary_coverages(patient_id, cover_pt_id, status);

-- 5. KIOSK TOKENS (EPHEMERAL TIME-BOUND ACCESS TOKENS)
create table if not exists public.kiosk_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text unique not null,
  patient_id uuid not null references public.patients(id) on delete cascade,
  device_id text not null default 'kiosk-main',
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_kiosk_tokens_lookup on public.kiosk_tokens(token_hash, expires_at);

-- 6. APPOINTMENTS (HOSPITAL SCHEDULES)
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  therapist_id uuid references public.profiles(id) on delete set null,
  scheduled_date date not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'missed', 'rescheduled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_appointments_patient_date on public.appointments(patient_id, scheduled_date);

-- 7. ROUTINE ITEMS (DAILY PRESCRIBED REHAB EXERCISES)
create table if not exists public.routine_items (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  reps int not null default 10,
  sets int not null default 3,
  hold_seconds int not null default 0,
  rest_seconds int not null default 30,
  instructions text default '-',
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_routine_items_appointment on public.routine_items(appointment_id, order_index);

-- 8. ADDITIVE COLUMNS ON EXISTING TABLES
-- A. treatment_sessions
alter table public.treatment_sessions
  add column if not exists status text default 'completed' check (status in ('completed', 'partial', 'placeholder')),
  add column if not exists assisted boolean default false,
  add column if not exists correct_reps int default 0,
  add column if not exists incorrect_reps int default 0,
  add column if not exists duration_seconds int default 0;

-- B. exercises
alter table public.exercises
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists is_minigame boolean not null default false;

-- C. session_logs view alias
create or replace view public.session_logs as
  select
    id,
    patient_id,
    exercise_id,
    therapist_id,
    score,
    avg_angle,
    hold_completed_seconds,
    accuracy_percent,
    notes,
    mode,
    status,
    assisted,
    correct_reps,
    incorrect_reps,
    duration_seconds,
    created_at
  from public.treatment_sessions;

-- 9. AUDIT LOGS (SECURITY & ACTION MONITORING)
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  user_role text default 'system',
  user_identifier text default '-',
  ip_address text default '127.0.0.1',
  device_info text default 'Desktop',
  action text not null,
  status text not null default 'Normal' check (status in ('Normal', 'Suspicious', 'Denied')),
  details jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_action on public.audit_logs(action, created_at desc);
create index if not exists idx_audit_logs_user on public.audit_logs(user_id, created_at desc);

-- 10. SYSTEM SETTINGS DEFAULTS
insert into public.system_settings (key, value)
values
  ('feature_flags', '{"FEATURE_PT_POSE_EXERCISES": false, "KIOSK_LIVENESS_MODE": "passive", "KIOSK_PIN_FALLBACK": false, "KIOSK_SHOW_ABOUT": true, "PLACEHOLDER_SECONDS": 4, "FACE_THRESHOLD": 0.82, "FACE_MARGIN": 0.08}'::jsonb)
on conflict (key) do nothing;

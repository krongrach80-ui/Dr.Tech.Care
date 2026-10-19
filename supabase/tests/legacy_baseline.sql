-- ============================================================================
-- DR.TECH.CARE: Staging-Only Legacy Database Baseline Fixture
-- Purpose: Simulates pre-migration production database state to validate:
--          1. Zero-data-loss migration across differing schema shapes.
--          2. Idempotent re-run of all_migrations.sql without data resets.
--          3. Correctness of backfills (notes, session_logs, coverages, etc.).
--
-- STAGING RUN ORDER:
--   Step 1: Execute supabase/tests/legacy_baseline.sql (loads legacy tables & data)
--   Step 2: Execute supabase/all_migrations.sql (runs schema migration & backfills)
--   Step 3: Execute supabase/all_migrations.sql AGAIN (proves strict idempotency)
--   Step 4: Execute supabase/dev_extras.sql (runs seed fixtures & full test suite)
--
-- NOTE: Contains ONLY synthetic/mock data. Never contains real patient names,
--       production hashes, or plaintext credentials.
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing public tables in reverse dependency order for clean baseline simulation
DROP TABLE IF EXISTS public.temporary_coverages CASCADE;
DROP TABLE IF EXISTS public.medical_notes CASCADE;
DROP TABLE IF EXISTS public.treatment_sessions CASCADE;
DROP TABLE IF EXISTS public.minigame_results CASCADE;
DROP TABLE IF EXISTS public.session_logs CASCADE;
DROP TABLE IF EXISTS public.routine_items CASCADE;
DROP TABLE IF EXISTS public.appointments CASCADE;
DROP TABLE IF EXISTS public.preset_items CASCADE;
DROP TABLE IF EXISTS public.face_templates CASCADE;
DROP TABLE IF EXISTS public.kiosk_tokens CASCADE;
DROP TABLE IF EXISTS public.kiosk_devices CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.activity_logs CASCADE;
DROP TABLE IF EXISTS public.banned_ips CASCADE;
DROP TABLE IF EXISTS public.exercises CASCADE;
DROP TABLE IF EXISTS public.patients CASCADE;
DROP TABLE IF EXISTS public.therapists CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.system_settings CASCADE;

-- 1. Legacy Profiles Shape
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'therapist', 'patient')),
  phone text,
  email text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Legacy Therapists Shape
CREATE TABLE public.therapists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  code text,
  license_no text,
  specialty text,
  bio text,
  phone text,
  email text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'leave', 'suspended')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Legacy Patients Shape (Includes legacy pin_hash, face_vector, patient_code NOT NULL)
CREATE TABLE public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  patient_code text UNIQUE NOT NULL,
  full_name text NOT NULL,
  age int,
  gender text,
  phone text,
  pin_hash text,
  chief_complaint text,
  medical_history text,
  face_vector jsonb,
  treatment_outcome text,
  therapist_notes text,
  responsible_therapist_id uuid REFERENCES public.profiles(id),
  started_at date DEFAULT current_date,
  status text DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'discharged')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. Legacy Exercises Shape
CREATE TABLE public.exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE,
  name_th text NOT NULL,
  name_en text,
  category text,
  difficulty text CHECK (difficulty IN ('easy', 'medium', 'hard')),
  target_angle numeric,
  hold_seconds int DEFAULT 20,
  reps int DEFAULT 1,
  sets int DEFAULT 1,
  target_joint text,
  instructions text,
  caution text,
  contraindication text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 5. Legacy Treatment Sessions Shape
CREATE TABLE public.treatment_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE,
  exercise_id uuid REFERENCES public.exercises(id) ON DELETE SET NULL,
  therapist_id uuid REFERENCES public.profiles(id),
  score numeric,
  avg_angle numeric,
  hold_completed_seconds numeric,
  accuracy_percent numeric,
  notes text,
  mode text DEFAULT 'therapy' CHECK (mode IN ('therapy', 'minigame')),
  created_at timestamptz DEFAULT now()
);

-- 6. Legacy Minigame Results Shape (Quiz-style: total_questions, correct_count)
CREATE TABLE public.minigame_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE,
  score int NOT NULL DEFAULT 0,
  total_questions int NOT NULL DEFAULT 10,
  correct_count int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 7. Legacy Activity Logs Shape
CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name text,
  role text,
  category text,
  action text NOT NULL,
  detail text,
  device_info text,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

-- 8. Legacy Temporary Coverages Shape (original_therapist_id, covering_therapist_id, NOT NULL)
CREATE TABLE public.temporary_coverages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE,
  patient_code text NOT NULL,
  patient_name text NOT NULL,
  original_therapist_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  original_therapist_name text NOT NULL,
  covering_therapist_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  covering_therapist_name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text DEFAULT '-',
  status text DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  created_at timestamptz DEFAULT now()
);

-- 9. Legacy Medical Notes Shape (note, author_role, formatted_date NOT NULL; no body / note_type)
CREATE TABLE public.medical_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  author_role text NOT NULL CHECK (author_role IN ('admin', 'therapist')),
  note text NOT NULL,
  formatted_date text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 10. Legacy Banned IPs Shape
CREATE TABLE public.banned_ips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  reason text,
  banned_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

-- 11. Legacy System Settings Shape
CREATE TABLE public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- INSERT SYNTHETIC LEGACY DATA (Deterministic UUIDs for verification)
-- ============================================================================

-- Staff Profiles
INSERT INTO public.profiles (id, username, full_name, role, email)
VALUES 
  ('11111111-0000-0000-0000-000000000001', 'legacy_admin', 'Legacy Administrator', 'admin', 'admin@drtechcare.invalid'),
  ('11111111-0000-0000-0000-000000000002', 'legacy_pt1', 'PT Somchai Clinic', 'therapist', 'pt1@drtechcare.invalid'),
  ('11111111-0000-0000-0000-000000000003', 'legacy_pt2', 'PT Somsri Rehab', 'therapist', 'pt2@drtechcare.invalid');

-- Staff Therapists
INSERT INTO public.therapists (id, profile_id, code, license_no, specialty, status)
VALUES 
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', 'T-001', 'PT-98765', 'Orthopedic', 'active'),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000003', 'T-002', 'PT-98766', 'Neurology', 'active');

-- Patients
INSERT INTO public.patients (
  id, patient_code, full_name, age, gender, phone, pin_hash, face_vector, 
  chief_complaint, medical_history, treatment_outcome, therapist_notes, 
  responsible_therapist_id, status
)
VALUES 
  (
    '33333333-0000-0000-0000-000000000001',
    'P-LEGACY-001',
    'Mock Patient Active',
    58,
    'ชาย',
    '089-111-2222',
    '$2a$10$synthetic_legacy_pin_hash_fixture_sample',
    '[-0.042, 0.125, 0.088, -0.312]'::jsonb,
    'ปวดไหล่ขวาเรื้อรัง ยกแขนไม่ขึ้น',
    'ความดันโลหิตสูง ไม่มีประวัติแพ้ยา',
    'ROM กางแขนทำได้ดีขึ้นแตะ 120 องศา',
    'แนะนำให้คนไข้ทำกายภาพบริหารกล้ามเนื้อสะบักวันละ 2 รอบ',
    '11111111-0000-0000-0000-000000000002',
    'active'
  ),
  (
    '33333333-0000-0000-0000-000000000002',
    'P-LEGACY-002',
    'Mock Patient Discharged',
    42,
    'หญิง',
    '089-333-4444',
    NULL,
    NULL,
    'ข้อศอกติดหลังถอดเฝือก',
    'กระดูกต้นแขนหัก หายสนิทแล้ว',
    'ข้อศอกเหยียดได้ 0 องศา งอได้ 135 องศา ปกติสมบูรณ์',
    'จบคอร์สการรักษา ผู้ป่วยหายดีจำหน่ายกลับบ้านได้',
    '11111111-0000-0000-0000-000000000003',
    'discharged'
  );

-- Exercises
INSERT INTO public.exercises (id, slug, name_th, name_en, category, difficulty)
VALUES 
  ('44444444-0000-0000-0000-000000000001', 'legacy-shoulder-press', 'ท่ายกแขนเหนือศีรษะ', 'Shoulder Overhead Press', 'ข้อไหล่', 'medium');

-- Treatment Sessions
INSERT INTO public.treatment_sessions (
  id, patient_id, exercise_id, therapist_id, score, avg_angle, hold_completed_seconds, accuracy_percent, notes, created_at
)
VALUES 
  (
    '55555555-0000-0000-0000-000000000001',
    '33333333-0000-0000-0000-000000000001',
    '44444444-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000002',
    88.5,
    115.0,
    18.0,
    92.0,
    'ท่าทางดี ยกแขนได้มั่นคง',
    now() - interval '2 days'
  );

-- Minigame Results
INSERT INTO public.minigame_results (
  id, patient_id, score, total_questions, correct_count, created_at
)
VALUES 
  (
    '66666666-0000-0000-0000-000000000001',
    '33333333-0000-0000-0000-000000000001',
    80,
    10,
    8,
    now() - interval '1 day'
  );

-- Activity Logs
INSERT INTO public.activity_logs (
  id, actor_id, actor_name, role, category, action, detail, ip_address, created_at
)
VALUES 
  (
    '77777777-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000001',
    'Legacy Administrator',
    'admin',
    'AUTH',
    'LEGACY_LOGIN',
    'Admin login from staging verification runner',
    '127.0.0.1',
    now() - interval '3 days'
  );

-- Legacy Temporary Coverage (Old column shape)
INSERT INTO public.temporary_coverages (
  id, patient_id, patient_code, patient_name,
  original_therapist_id, original_therapist_name,
  covering_therapist_id, covering_therapist_name,
  start_date, end_date, reason, status, created_at
)
VALUES 
  (
    '88888888-0000-0000-0000-000000000001',
    '33333333-0000-0000-0000-000000000001',
    'P-LEGACY-001',
    'Mock Patient Active',
    '11111111-0000-0000-0000-000000000002',
    'PT Somchai Clinic',
    '11111111-0000-0000-0000-000000000003',
    'PT Somsri Rehab',
    current_date - 1,
    current_date + 4,
    'ไปราชการสัมมนาวิชาการ',
    'active',
    now() - interval '1 day'
  );

-- Legacy Medical Notes (Old column shape: note, author_role, formatted_date)
INSERT INTO public.medical_notes (
  id, patient_id, author_id, author_name, author_role, note, formatted_date, created_at
)
VALUES 
  (
    '99999999-0000-0000-0000-000000000001',
    '33333333-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000002',
    'PT Somchai Clinic',
    'therapist',
    'ตรวจประเมินครั้งแรก: ข้อต่อหัวไหล่จำกัดการเคลื่อนไหวที่ 90 องศา ปวด VAS 6/10',
    '14/10/2026',
    now() - interval '5 days'
  );

-- Banned IPs
INSERT INTO public.banned_ips (ip_address, reason, created_at)
VALUES ('198.51.100.99', 'Legacy brute-force attempt simulated fixture', now());

-- ============================================================================
-- VERIFICATION QUERY (Run this after applying all_migrations.sql)
-- ============================================================================
/*
SELECT 
  'patients' AS table_name, count(*) AS total_rows, 
  count(*) FILTER (WHERE treatment_status = 'discharged') AS discharged_count,
  count(*) FILTER (WHERE face_registered = true) AS face_registered_count
FROM public.patients
UNION ALL
SELECT 
  'medical_notes' AS table_name, count(*) AS total_rows,
  count(*) FILTER (WHERE note_type = 'progress') AS progress_count,
  count(*) FILTER (WHERE note_type = 'pt_advice') AS pt_advice_count
FROM public.medical_notes
UNION ALL
SELECT 
  'session_logs' AS table_name, count(*) AS total_rows,
  count(*) FILTER (WHERE correct > 0) AS quiz_sessions_count,
  count(*) FILTER (WHERE score > 0) AS scored_sessions_count
FROM public.session_logs
UNION ALL
SELECT 
  'audit_logs' AS table_name, count(*) AS total_rows,
  count(*) FILTER (WHERE action = 'LEGACY_LOGIN') AS imported_activity_count,
  0
FROM public.audit_logs
UNION ALL
SELECT 
  'temporary_coverages' AS table_name, count(*) AS total_rows,
  count(*) FILTER (WHERE owner_therapist_id IS NOT NULL) AS backfilled_owner_count,
  count(*) FILTER (WHERE status = 'active') AS active_count
FROM public.temporary_coverages;
*/

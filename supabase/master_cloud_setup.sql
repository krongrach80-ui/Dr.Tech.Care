-- ============================================================================
-- DR.TECH.CARE: Master Cloud Database Setup Script
-- Project: https://supabase.com/dashboard/project/gdsgsnklmrmnhniykxau
-- Description: รันคำสั่งนี้ครั้งเดียวใน Supabase SQL Editor เพื่อสร้างตารางทั้งหมด,
--              ระบบสิทธิ์ RLS, Storage Buckets, และข้อมูลตั้งต้นสำหรับระบบ StrongCare
-- ============================================================================

-- 1. เปิด Extensions ที่จำเป็น
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. สร้าง Sequence สำหรับสร้างรหัสคนไข้ HN อัตโนมัติ (P-####)
CREATE SEQUENCE IF NOT EXISTS public.patient_hn_seq START WITH 1001;

-- ============================================================================
-- 3. ตาราง PROFILES (บัญชีเจ้าหน้าที่ แพทย์ แอดมิน)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'therapist', 'patient')),
  phone text,
  email text,
  avatar_url text,
  must_change_password boolean NOT NULL DEFAULT false,
  is_active boolean DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 4. ตาราง PATIENTS (เวชระเบียนคนไข้, ข้อมูลทางคลินิก และเวกเตอร์ใบหน้า)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  patient_code text,
  hn text,
  full_name text NOT NULL,
  age int,
  gender text,
  phone text,
  pin_hash text,
  face_vector jsonb,
  photo text,
  avatar_url text,
  face_registered boolean NOT NULL DEFAULT false,
  face_enrolled_at timestamptz,
  chief_complaint text,
  medical_history text,
  treatment_outcome text,
  therapist_notes text,
  underlying_diseases text NOT NULL DEFAULT '-',
  drug_allergies text NOT NULL DEFAULT '-',
  responsible_therapist_id uuid REFERENCES public.profiles(id),
  assigned_therapist_id uuid REFERENCES public.profiles(id),
  started_at date DEFAULT current_date,
  admission_date date DEFAULT current_date,
  status text DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'discharged', 'pending_info')),
  treatment_status text NOT NULL DEFAULT 'active' CHECK (treatment_status IN ('active', 'discharged')),
  progress_pct numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- เพิ่มคอลัมน์สำคัญหากตารางถูกสร้างไว้ก่อนแล้ว
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS hn text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS patient_code text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS pin_hash text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS face_vector jsonb;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS photo text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS face_registered boolean NOT NULL DEFAULT false;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS face_enrolled_at timestamptz;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS underlying_diseases text NOT NULL DEFAULT '-';
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS drug_allergies text NOT NULL DEFAULT '-';
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS admission_date date DEFAULT current_date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS assigned_therapist_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS treatment_status text NOT NULL DEFAULT 'active';
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS progress_pct numeric NOT NULL DEFAULT 0;

-- Trigger ซิงค์รหัสคนไข้ระหว่าง hn และ patient_code
CREATE OR REPLACE FUNCTION public.trg_sync_patient_hn_and_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.hn IS NULL AND NEW.patient_code IS NOT NULL THEN
    NEW.hn := NEW.patient_code;
  ELSIF NEW.patient_code IS NULL AND NEW.hn IS NOT NULL THEN
    NEW.patient_code := NEW.hn;
  ELSIF NEW.hn IS NULL AND NEW.patient_code IS NULL THEN
    NEW.hn := 'P-' || lpad(nextval('public.patient_hn_seq')::text, 4, '0');
    NEW.patient_code := NEW.hn;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_patients_sync_hn_code ON public.patients;
CREATE TRIGGER trg_patients_sync_hn_code
BEFORE INSERT OR UPDATE ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_patient_hn_and_code();

-- ============================================================================
-- 5. ตาราง THERAPISTS (ทำเนียบนักกายภาพบำบัด)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.therapists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  code text UNIQUE,
  name text,
  license_no text,
  specialty text,
  bio text,
  phone text,
  email text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'on_leave', 'suspended', 'leave')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- เพิ่มคอลัมน์สำคัญหากตาราง therapists ถูกสร้างไว้ก่อนแล้ว
ALTER TABLE public.therapists ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.therapists ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.therapists ADD COLUMN IF NOT EXISTS license_no text;
ALTER TABLE public.therapists ADD COLUMN IF NOT EXISTS specialty text;
ALTER TABLE public.therapists ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE public.therapists ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.therapists ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.therapists ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'therapists_code_unique'
  ) THEN
    ALTER TABLE public.therapists ADD CONSTRAINT therapists_code_unique UNIQUE (code);
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ============================================================================
-- 6. ตาราง EXERCISES (คลังท่ากายภาพบำบัดและมินิเกม)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,
  slug text UNIQUE,
  name_th text NOT NULL,
  name_en text,
  category text,
  kind text NOT NULL DEFAULT 'single' CHECK (kind IN ('single', 'preset')),
  is_minigame boolean NOT NULL DEFAULT false,
  difficulty text CHECK (difficulty IN ('easy', 'medium', 'hard')),
  target_angle numeric,
  hold_seconds int DEFAULT 20,
  reps int DEFAULT 1,
  sets int DEFAULT 1,
  default_reps int DEFAULT 10,
  default_sets int DEFAULT 3,
  rest_seconds int DEFAULT 30,
  target_joint text,
  instructions text,
  caution text,
  contraindication text,
  benefits text,
  media_path text,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- เพิ่มคอลัมน์สำคัญหากตาราง exercises ถูกสร้างไว้ก่อนแล้ว
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS name_th text;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'single';
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS is_minigame boolean NOT NULL DEFAULT false;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS difficulty text;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS target_angle numeric;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS hold_seconds int DEFAULT 20;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS default_reps int DEFAULT 10;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS default_sets int DEFAULT 3;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS rest_seconds int DEFAULT 30;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS instructions text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exercises_code_unique'
  ) THEN
    ALTER TABLE public.exercises ADD CONSTRAINT exercises_code_unique UNIQUE (code);
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ============================================================================
-- 7. ตาราง APPOINTMENTS (ปฏิทินและตารางนัดหมายกายภาพ)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  date date NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'missed', 'rescheduled')),
  original_date date,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 8. ตาราง ROUTINE_ITEMS (รายการท่าฝึกประจำวันในตารางนัดหมาย)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.routine_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  difficulty text DEFAULT 'beginner' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  reps int NOT NULL DEFAULT 10,
  sets int NOT NULL DEFAULT 3,
  rest_seconds int NOT NULL DEFAULT 30,
  instructions text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 9. ตาราง MEDICAL_NOTES (บันทึกความก้าวหน้าทางคลินิก, ROM, คำแนะนำ กภ.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.medical_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  note_type text NOT NULL CHECK (note_type IN ('progress', 'outcome_rom', 'pt_advice')),
  body text NOT NULL,
  author_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  author_name text NOT NULL,
  author_role text,
  formatted_date text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 10. ตาราง TEMPORARY_COVERAGES (การมอบหมายการดูแลเคสชั่วคราว)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.temporary_coverages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  owner_therapist_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  cover_therapist_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text DEFAULT '-',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 11. ตาราง FACE_TEMPLATES (เวกเตอร์ใบหน้า 128 มิติ สำหรับสแกนหน้าตู้ Kiosk)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.face_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  pose text NOT NULL DEFAULT 'straight',
  yaw numeric,
  pitch numeric,
  quality numeric,
  embedding vector(128) NOT NULL,
  frame_path text,
  is_average boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 12. ตาราง TREATMENT_SESSIONS & SESSION_LOGS (ประวัติการทำกายภาพ)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.treatment_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE,
  patient_code text,
  exercise_name text NOT NULL,
  reps_completed int DEFAULT 0,
  target_reps int DEFAULT 10,
  accuracy numeric DEFAULT 0,
  max_rom numeric DEFAULT 0,
  avg_rom numeric DEFAULT 0,
  duration_seconds int DEFAULT 0,
  status text DEFAULT 'completed',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.session_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  exercise_id uuid REFERENCES public.exercises(id) ON DELETE SET NULL,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'partial', 'placeholder')),
  correct int DEFAULT 0,
  incorrect int DEFAULT 0,
  score numeric DEFAULT 0,
  accuracy numeric DEFAULT 0,
  assisted boolean NOT NULL DEFAULT false,
  device_id text,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 13. ตาราง MINIGAME_RESULTS (ผลคะแนนมินิเกมฟื้นฟูสมองและการเคลื่อนไหว)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.minigame_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE,
  patient_code text,
  game_type text NOT NULL,
  score int DEFAULT 0,
  accuracy numeric DEFAULT 0,
  reaction_time_ms numeric DEFAULT 0,
  duration_seconds int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 14. ตาราง SYSTEM_SETTINGS, ACTIVITY_LOGS, BANNED_IPS, BANNED_DEVICES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_name text,
  role text,
  category text,
  action text NOT NULL,
  detail text,
  device_info text,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.banned_ips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  reason text,
  banned_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.banned_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_fingerprint text NOT NULL,
  reason text,
  banned_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 15. ROW LEVEL SECURITY (RLS) & POLICIES เพื่อให้ Web & Kiosk อ่านเขียนได้ราบรื่น
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routine_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.temporary_coverages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minigame_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banned_ips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banned_devices ENABLE ROW LEVEL SECURITY;

-- Allow anon & authenticated full access for hospital kiosk and web operation
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'profiles', 'patients', 'therapists', 'exercises', 'appointments', 
    'routine_items', 'medical_notes', 'temporary_coverages', 'face_templates', 
    'treatment_sessions', 'session_logs', 'minigame_results', 'system_settings', 
    'activity_logs', 'banned_ips', 'banned_devices'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "anon_full_access_%I" ON public.%I', tbl, tbl);
    EXECUTE format('CREATE POLICY "anon_full_access_%I" ON public.%I FOR ALL TO public USING (true) WITH CHECK (true)', tbl, tbl);
  END LOOP;
END $$;

-- ============================================================================
-- 16. STORAGE BUCKETS (สำหรับเก็บรูปคนไข้และสื่อท่าฝึก)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('face-photos', 'face-photos', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('exercise-media', 'exercise-media', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'video/mp4', 'video/webm'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "public_storage_select" ON storage.objects;
CREATE POLICY "public_storage_select" ON storage.objects FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "public_storage_insert" ON storage.objects;
CREATE POLICY "public_storage_insert" ON storage.objects FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "public_storage_update" ON storage.objects;
CREATE POLICY "public_storage_update" ON storage.objects FOR UPDATE TO public USING (true);

-- ============================================================================
-- 17. REALTIME REPLICATION (เปิดให้ซิงค์ Realtime ระหว่างตู้และหน้าเว็บ)
-- ============================================================================
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE 
      public.patients, 
      public.appointments, 
      public.treatment_sessions, 
      public.temporary_coverages, 
      public.system_settings,
      public.activity_logs;
  EXCEPTION WHEN OTHERS THEN
    -- In case some tables were already added to publication
    NULL;
  END;
END $$;

-- ============================================================================
-- 18. ข้อมูลตั้งต้น (SEED DATA) คนไข้, นักกายภาพ, ท่าฝึก, และการตั้งค่า
-- ============================================================================

-- เสริมโครงสร้างคอลัมน์และ Constraints ให้พร้อมรับ Seed Data เสมอ (ป้องกันกรณีที่ก๊อปปี้เฉพาะส่วน Seed Data มารัน)
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS hn text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS patient_code text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS pin_hash text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS treatment_status text NOT NULL DEFAULT 'active';

ALTER TABLE public.therapists ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.therapists ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.therapists ADD COLUMN IF NOT EXISTS specialty text;
ALTER TABLE public.therapists ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE public.therapists ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.therapists ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.therapists ADD COLUMN IF NOT EXISTS license_no text;
ALTER TABLE public.therapists ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS name_th text;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS difficulty text;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS target_angle numeric;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS hold_seconds int DEFAULT 20;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS reps int DEFAULT 1;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS sets int DEFAULT 1;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS target_joint text;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS instructions text;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS benefits text;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'therapists_code_unique') THEN
    ALTER TABLE public.therapists ADD CONSTRAINT therapists_code_unique UNIQUE (code);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patients_patient_code_unique') THEN
    ALTER TABLE public.patients ADD CONSTRAINT patients_patient_code_unique UNIQUE (patient_code);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exercises_code_unique') THEN
    ALTER TABLE public.exercises ADD CONSTRAINT exercises_code_unique UNIQUE (code);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- นักกายภาพบำบัด
INSERT INTO public.therapists (code, name, specialty, bio, phone, email, license_no, status)
VALUES
  ('T-003', 'กภ. ธนากร วงศ์สวัสดิ์', 'กายภาพบำบัดระบบกล้ามเนื้อและกระดูก (Orthopedic PT)', 'วุฒิบัตรกายภาพบำบัดระบบกล้ามเนื้อและกระดูก จุฬาลงกรณ์มหาวิทยาลัย ประสบการณ์คลินิก 8 ปี', '081-456-7890', 'thanakorn.w@strongcare.hospital', 'กภ.12458', 'active'),
  ('T-007', 'กภ. พิมพ์ชนก สุขเกษม', 'กายภาพบำบัดระบบประสาทและผู้สูงอายุ (Neurological & Geriatric PT)', 'ปริญญาโทกายภาพบำบัดระบบประสาท มหาวิทยาลัยมหิดล เชี่ยวชาญการฟื้นฟูหลอดเลือดสมอง', '089-765-4321', 'pimchanok.s@strongcare.hospital', 'กภ.15890', 'active'),
  ('T-012', 'กภ. วรัญญู รัตนเวช', 'ฟื้นฟูสมรรถภาพหัวใจและปอด (Cardiopulmonary PT)', 'กายภาพบำบัดฟื้นฟูสมรรถภาพหัวใจและปอด มหาวิทยาลัยเชียงใหม่ ประสบการณ์ 5 ปี', '086-112-3344', 'waranyoo.r@strongcare.hospital', 'กภ.18902', 'active'),
  ('T-6512', 'pjj', 'กายภาพบำบัดฟื้นฟูเฉพาะทาง', 'กายภาพบำบัดฟื้นฟูเฉพาะทาง ประสบการณ์คลินิก', '0632531669', 'pjj@drtechcare.hospital', 'ภก. 5110', 'active')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  specialty = EXCLUDED.specialty,
  bio = EXCLUDED.bio,
  phone = EXCLUDED.phone,
  email = EXCLUDED.email;

-- คนไข้เริ่มต้น (รวมทั้งคนไข้จากหน้าจอตัวอย่าง Pz67 และ pj)
INSERT INTO public.patients (
  patient_code, hn, full_name, age, gender, phone, chief_complaint, medical_history, treatment_outcome, therapist_notes, pin_hash, status, treatment_status
)
VALUES
  ('P-0012', 'P-0012', 'นายสมชาย ใจดี', 68, 'ชาย', '081-234-5678', 'ปวดไหล่ขวาเรื้อรัง ยกแขนไม่สุด ปวดแปลบตอนเอื้อมหยิบของสูงมา 1 เดือน', 'ความดันโลหิตสูง ควบคุมได้ดีด้วยยา', 'ROM กางแขนข้างลำตัวเพิ่มจาก 65° เป็น 88° อาการปวดลดลง', 'แนะนำให้รักษาระดับการยืดแขนอย่างนุ่มนวล หลีกเลี่ยงยกของหนัก', encode(digest('1234', 'sha256'), 'hex'), 'active', 'active'),
  ('P-0013', 'P-0013', 'นางมาลี รักสุข', 72, 'หญิง', '089-876-5432', 'ข้อเข่าเสื่อมระยะที่ 2 และกล้ามเนื้อต้นขาอ่อนแรง ยืนนานปวดตึง', 'เบาหวานชนิดที่ 2 ไม่มีแผลเรื้อรัง', 'ลุกยืนจากเก้าอี้ได้มั่นคงขึ้น อาการเสียวข้อเข่าลดลง', 'ฝึกย่อเข่าแบบมีเก้าอี้พยุงอย่างระมัดระวัง เข่าต้องไม่เลยปลายเท้า', encode(digest('1234', 'sha256'), 'hex'), 'active', 'active'),
  ('P-0021', 'P-0021', 'นายวิชัย แก้วมณี', 64, 'ชาย', '086-345-6789', 'กล้ามเนื้อแขนขาซีกขวาอ่อนแรงระยะฟื้นฟูจากโรคหลอดเลือดสมอง', 'หลอดเลือดสมองตีบ พ้นระยะเฉียบพลัน 4 เดือน', 'การควบคุมทิศทางการเคลื่อนไหวแขนขวาแม่นยำขึ้น', 'แนะนำให้ทำมินิเกมฝึกความสัมพันธ์ของสายตาและมือ', encode(digest('1234', 'sha256'), 'hex'), 'active', 'active'),
  ('P-1425', 'P-1425', 'Pz67', 65, 'ชาย', '3342342342', '4232434233', 'โรคประจำตัว: 434232, ประวัติแพ้ยา: 423432432', 'เริ่มต้นโปรแกรมการรักษา', 'เริ่มกายภาพท่าพื้นฐานตามโปรแกรม', encode(digest('1234', 'sha256'), 'hex'), 'active', 'active'),
  ('P-1940', 'P-1940', 'pj', 5, 'ชาย', '1234567890', 'ตรวจประเมินกายภาพบำบัด', 'โรคประจำตัว: -, ประวัติแพ้ยา: -', 'เริ่มต้นโปรแกรมการรักษา', 'เริ่มกายภาพท่าพื้นฐานตามโปรแกรม', encode(digest('1234', 'sha256'), 'hex'), 'active', 'active')
ON CONFLICT (patient_code) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  age = EXCLUDED.age,
  gender = EXCLUDED.gender,
  phone = EXCLUDED.phone,
  chief_complaint = EXCLUDED.chief_complaint,
  medical_history = EXCLUDED.medical_history,
  treatment_outcome = EXCLUDED.treatment_outcome,
  therapist_notes = EXCLUDED.therapist_notes;

-- ท่ากายภาพบำบัดเริ่มต้น
INSERT INTO public.exercises (code, slug, name_th, name_en, category, difficulty, target_angle, hold_seconds, reps, sets, target_joint, instructions, benefits, is_active)
VALUES
  ('EX-01', 'shoulder_abduction', 'กางแขนยกด้านข้าง', 'Shoulder Abduction', 'ฟื้นฟูข้อไหล่และแขน', 'medium', 90, 5, 10, 3, 'ข้อไหล่สองข้าง', 'ยืนตรง กางแขนทั้งสองข้างขึ้นขนานกับพื้น ค้างไว้ 5 วินาที', 'เพิ่มองศาการกางหัวไหล่และฟื้นฟูกล้ามเนื้อ Deltoid', true),
  ('EX-02', 'neck_lateral_stretch', 'ยืดกล้ามเนื้อคอด้านข้าง', 'Cervical Lateral Stretch', 'ฟื้นฟูกล้ามเนื้อคอบ่า', 'easy', 25, 15, 5, 2, 'กระดูกคอ', 'เอียงศีรษะให้หูเข้าหาหัวไหล่ช้าๆ จนรู้สึกตึงสบาย ค้างไว้ 15 วินาที', 'ลดอาการเกร็งตึงกล้ามเนื้อคอบ่าและไมเกรน', true),
  ('EX-03', 'forward_arm_raise', 'ยกแขนไปข้างหน้า', 'Forward Arm Raise', 'ฟื้นฟูข้อไหล่และแขน', 'medium', 90, 5, 10, 3, 'ข้อไหล่', 'ยกแขนตรงไปข้างหน้าจนถึงระดับหัวไหล่ ค้างไว้ 5 วินาทีแล้วผ่อนลง', 'เสริมสร้างกล้ามเนื้อไหล่ด้านหน้าและหลังส่วนบน', true),
  ('EX-04', 'cross_body_stretch', 'ยืดข้อไหล่ข้ามอก', 'Cross-Body Shoulder Stretch', 'ฟื้นฟูข้อไหล่และแขน', 'easy', 80, 15, 5, 2, 'ข้อไหล่ด้านหลัง', 'ยกแขนข้ามหน้าอก ใช้มืออีกข้างดึงข้อศอกเข้าหาลำตัว', 'คลายกล้ามเนื้อสะบักและไหล่ด้านหลัง', true),
  ('EX-05', 'chair_squat', 'ย่อเข่าเก้าอี้พยุงตัว', 'Chair Partial Squat', 'ฟื้นฟูข้อเข่าและขา', 'medium', 85, 5, 10, 3, 'ข้อเข่าและสะโพก', 'ยืนแยกเท้าเท่าช่วงไหล่ ย่อสะโพกคล้ายนั่งเก้าอี้ เข่าไม่ล้ำปลายเท้า', 'เพิ่มความแข็งแรงกล้ามเนื้อหน้าขาและข้อเข่า', true)
ON CONFLICT (code) DO UPDATE SET
  name_th = EXCLUDED.name_th,
  name_en = EXCLUDED.name_en,
  category = EXCLUDED.category,
  instructions = EXCLUDED.instructions;

-- การตั้งค่าระบบเริ่มต้น
INSERT INTO public.system_settings (key, value)
VALUES 
  ('ai_settings', '{
    "similarityThreshold": 0.80,
    "marginThreshold": 0.08,
    "minVisibilityThreshold": 0.55,
    "poseConfidenceThreshold": 0.65,
    "maxTrunkLeanAngle": 22.0,
    "soundEnabled": true,
    "voiceGuidanceEnabled": true,
    "cloudSyncEnabled": true
  }'::jsonb),
  ('treatment_plans', '[
    {
      "id": "TP-001",
      "patientId": "P-0012",
      "patientName": "นายสมชาย ใจดี",
      "exerciseId": "EX-01",
      "exerciseName": "กางแขนยกด้านข้าง",
      "targetReps": 10,
      "targetSets": 3,
      "frequency": "วันละ 2 ครั้ง",
      "status": "active"
    }
  ]'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- บันทึก Log เริ่มต้น
INSERT INTO public.activity_logs (actor_name, role, category, action, detail, device_info, ip_address)
VALUES ('System Initializer', 'admin', 'SYSTEM', 'DATABASE_INIT', 'ตั้งค่าฐานข้อมูล Dr.Tech.Care บน Supabase Cloud ครบถ้วนทุกตารางและสิทธิ์ RLS', 'Supabase Cloud PostgreSQL', 'Cloud');

-- ============================================================================
-- DR.TECH.CARE: Isolated Development & Staging Seed Data
-- Loaded ONLY in dev/staging. Never in production.
-- ============================================================================

-- 1. System Settings & Feature Flags
INSERT INTO public.system_settings (key, value)
VALUES
  ('FEATURE_PT_POSE_EXERCISES', 'false'::jsonb),
  ('FACE_THRESHOLD', '0.5'::jsonb),
  ('FACE_MARGIN', '0.1'::jsonb),
  ('PLACEHOLDER_SECONDS', '4'::jsonb),
  ('KIOSK_SESSION_TIMEOUT_SECONDS', '90'::jsonb),
  ('features', '{"pt_pose_exercises": false, "voice_guidance": true, "realtime_pose": false}'::jsonb)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = now();

-- 2. Core Mini-Games (MG-01 "Balloon Pop", MG-02 "Reach & Catch")
INSERT INTO public.exercises (code, slug, name_th, name_en, category, kind, is_minigame, difficulty, default_reps, default_sets, rest_seconds, instructions, benefits, is_active)
VALUES
  (
    'MG-01',
    'mg-balloon-pop',
    'Balloon Pop (เกมเป่าลูกโป่ง)',
    'Balloon Pop Minigame',
    'มินิเกมฝึกประสานสายตาและมือ',
    'single',
    true,
    'easy',
    10,
    3,
    30,
    'ยกแขนแตะลูกโป่งที่ลอยขึ้นมาให้แตกตามสีที่กำหนด',
    'ฝึกการตอบสนองของระบบประสาทสั่งการและการเคลื่อนไหวข้อไหล่',
    true
  ),
  (
    'MG-02',
    'mg-reach-and-catch',
    'Reach & Catch (เกมเอื้อมจับดาว)',
    'Reach & Catch Minigame',
    'มินิเกมฝึกการทรงตัวและการเอื้อม',
    'single',
    true,
    'medium',
    10,
    3,
    30,
    'เอื้อมมือซ้าย-ขวาตามดาวที่ปรากฏบนหน้าจอเพื่อทำคะแนน',
    'เพิ่มช่วงการเคลื่อนไหวของข้อต่อและกล้ามเนื้อแกนกลางลำตัว',
    true
  ),
  (
    'EX-01',
    'ex-shoulder-abduction',
    'กางแขนยกด้านข้าง',
    'Shoulder Abduction / Raise',
    'ฟื้นฟูข้อไหล่และแขน',
    'single',
    false,
    'medium',
    10,
    3,
    30,
    'ยืนหรือนั่งหลังตรง ยกแขนทั้งสองข้างกางออกด้านข้างลำตัวจนถึงระดับระนาบหัวไหล่',
    'เสริมสร้างกล้ามเนื้อ Deltoid และเพิ่มองศาการกางหัวไหล่',
    true
  ),
  (
    'EX-02',
    'ex-neck-lateral-stretch',
    'ยืดคอด้านข้าง',
    'Neck Lateral Stretch',
    'ฟื้นฟูกล้ามเนื้อคอบ่า',
    'single',
    false,
    'easy',
    5,
    3,
    20,
    'นั่งหลังตรง เอียงศีรษะไปด้านข้างช้าๆ ค้างไว้ 15-20 วินาทีสลับซ้าย-ขวา',
    'ลดอาการเกร็งตึงของกล้ามเนื้อ Trapezius และบรรเทาอาการปวดต้นคอ',
    true
  )
ON CONFLICT (code) DO UPDATE SET
  name_th = EXCLUDED.name_th,
  name_en = EXCLUDED.name_en,
  category = EXCLUDED.category,
  kind = EXCLUDED.kind,
  is_minigame = EXCLUDED.is_minigame,
  instructions = EXCLUDED.instructions,
  benefits = EXCLUDED.benefits;

-- 3. Staging Kiosk Device (for local / kiosk terminal testing)
INSERT INTO public.kiosk_devices (id, name, key_hash, is_active, settings)
VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    'Kiosk Terminal Floor 1 (Rehab Center)',
    -- sha256 of 'kiosk_staging_device_key_2026'
    encode(digest('kiosk_staging_device_key_2026', 'sha256'), 'hex'),
    true,
    '{"rotation": 0, "mirror": true}'::jsonb
  )
ON CONFLICT (key_hash) DO NOTHING;

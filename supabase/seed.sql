-- ============================================================================
-- STRONG CARE - Complete Seed Data for Supabase
-- AI-assisted Rehabilitation Monitoring Platform
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. SEED SYSTEM SETTINGS
INSERT INTO public.system_settings (key, value)
VALUES 
    ('ai_settings', '{
        "similarityThreshold": 0.80,
        "marginThreshold": 0.08,
        "minVisibilityThreshold": 0.55,
        "poseConfidenceThreshold": 0.65,
        "maxTrunkLeanAngle": 22.0,
        "maxVelocityDegPerSec": 220.0,
        "holdConfidenceSeconds": 0.50,
        "soundEnabled": true,
        "voiceGuidanceEnabled": true,
        "cloudSyncEnabled": true
    }'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- 2. SEED 16 CLINICAL BIOMECHANICAL EXERCISES
INSERT INTO public.exercises (
    slug, name_th, name_en, category, difficulty, target_angle, hold_seconds, reps, sets, target_joint, instructions, caution, contraindication, is_active
)
VALUES
    ('shoulder_raise', 'กางแขนยกไหล่ระดับขนาน', 'Bilateral Shoulder Abduction', 'ฟื้นฟูข้อไหล่และแขน', 'medium', 90, 5, 10, 3, 'ข้อไหล่สองข้าง (Shoulders)', 'ยืนตรง กางแขนทั้งสองข้างขึ้นขนานกับพื้น รักษาระดับไหล่ไม่ให้ยกเกร็ง ค้างไว้ตามเวลาที่กำหนด', 'อย่าเกร็งยกสะบักหรือเอียงตัว', 'ห้ามทำในผู้ป่วยที่มีภาวะข้อไหล่หลุดเฉียบพลัน', true),
    ('bicep_curl', 'งอข้อศอกบริหารต้นแขน', 'Bicep Curl', 'ฟื้นฟูข้อไหล่และแขน', 'easy', 45, 3, 12, 3, 'ข้อศอก (Elbows)', 'แนบต้นแขนชิดลำตัว งอข้อศอกยกขึ้นเข้าหาหัวไหล่ช้าๆ แล้วค่อยๆ เหยียดลง', 'อย่าเหวี่ยงลำตัวหรือโยกสะโพก', NULL, true),
    ('elbow_extension', 'เหยียดข้อศอกฟื้นฟูแขนท่อนบน', 'Elbow Extension', 'ฟื้นฟูข้อไหล่และแขน', 'easy', 170, 3, 10, 3, 'ข้อศอก (Elbow)', 'เหยียดข้อศอกออกตรงช้าๆ จนสุดช่วงการเคลื่อนไหวที่ปลอดภัย', 'ไม่ควรเหยียดกระแทกข้อศอกแรงเกินไป', NULL, true),
    ('knee_squat', 'ย่อเข่าเก้าอี้กึ่งสควอท', 'Chair Partial Squat', 'ฟื้นฟูข้อเข่าและขา', 'medium', 85, 5, 10, 3, 'ข้อเข่าและสะโพก (Knees & Hips)', 'ยืนแยกเท้าเท่าช่วงไหล่ ย่อสะโพกไปด้านหลังคล้ายนั่งเก้าอี้ หัวเข่าไม่ล้ำปลายเท้า', 'หัวเข่าห้ามบิดเข้าด้านใน', 'ห้ามทำในผู้ป่วยที่มีการอักเสบเฉียบพลันของข้อเข่า', true),
    ('alternating-knee-raise', 'ยกเข่าสูงสลับข้าง', 'Alternating Knee Raise', 'ฟื้นฟูข้อเข่าและขา', 'medium', 90, 3, 10, 3, 'ข้อสะโพกและข้อเข่า (Hips & Knees)', 'ยืนตรงหรือจับพนักเก้าอี้ ยกเข่าขึ้นทีละข้างให้ต้นขาขนานพื้น สลับซ้าย-ขวา', 'เกร็งหน้าท้อง ลำตัวตรง ไม่เอนหลัง', NULL, true),
    ('stretch_neck_lateral', 'ยืดกล้ามเนื้อคอด้านข้าง', 'Cervical Lateral Flexion', 'ฟื้นฟูข้อไหล่และแขน', 'easy', 25, 15, 5, 2, 'กระดูกคอ (Cervical Spine)', 'นั่งหรือยืนตรง เอียงศีรษะให้หูเข้าหาหัวไหล่ช้าๆ จนรู้สึกตึงสบาย ไหล่ผ่อนคลาย', 'อย่าเกร็งยกหัวไหล่ขึ้นมารับศีรษะ', 'ห้ามดัดคอเร็วหรือกระตุก', true),
    ('stretch_neck_flexion', 'ก้มคอยืดกล้ามเนื้อท้ายทอย', 'Cervical Flexion', 'ฟื้นฟูข้อไหล่และแขน', 'easy', 35, 15, 5, 2, 'กระดูกคอด้านหลัง (Upper Trapezius)', 'ก้มศีรษะลงช้าๆ นำคางชิดหน้าอกเบาๆ ผ่อนคลายหัวไหล่', 'ไม่ก้มจนหลังค่อม', NULL, true),
    ('stretch_shoulder_cross', 'ยืดข้อไหล่ข้ามลำตัว', 'Cross-Body Shoulder Stretch', 'ฟื้นฟูข้อไหล่และแขน', 'easy', 80, 15, 5, 2, 'ข้อไหล่ด้านหลัง (Posterior Deltoid)', 'ยกแขนข้ามหน้าอก ใช้มืออีกข้างดึงข้อศอกเข้าหาลำตัวจนรู้สึกตึงสบาย', 'ไม่หมุนลำตัวตามแขน', NULL, true),
    ('stretch_triceps_overhead', 'ยืดยกต้นแขนเหนือศีรษะ', 'Overhead Triceps Stretch', 'ฟื้นฟูข้อไหล่และแขน', 'medium', 150, 15, 5, 2, 'ต้นแขนด้านหลัง (Triceps)', 'ยกแขนงอศอกไปด้านหลังศีรษะ ใช้มืออีกข้างประคองศอกกดเบาๆ', 'ไม่แอ่นหลังหรือเอียงศีรษะ', NULL, true),
    ('stretch_chest_open', 'กางแขนเปิดหน้าอกสะบัก', 'Chest & Pec Stretch', 'ฟื้นฟูข้อไหล่และแขน', 'easy', 110, 15, 5, 2, 'กล้ามเนื้อหน้าอก (Pectoralis)', 'กางแขนระดับอก บีบสะบักเข้าหากัน ยืดอกเปิดกว้าง หายใจเข้าลึกๆ', 'อย่าแอ่นหลังล่างเกินไป', NULL, true),
    ('stretch_side_bend', 'เอียงตัวยืดสีข้างลำตัว', 'Standing Lateral Trunk Lean', 'ฟื้นฟูข้อสะโพกและหลัง', 'medium', 20, 12, 6, 2, 'กล้ามเนื้อลำตัวด้านข้าง (Quadratus Lumborum)', 'ยืนตรง กางแขนเอียงลำตัวไปด้านข้างช้าๆ จนตึงบริเวณสีข้าง', 'สะโพกนิ่ง ลำตัวไม่งุ้มไปด้านหน้า', NULL, true),
    ('stretch_torso_twist', 'หมุนลำตัวฟื้นฟูแนวกระดูกสันหลัง', 'Seated Trunk Rotation', 'ฟื้นฟูข้อสะโพกและหลัง', 'easy', 30, 10, 6, 2, 'กระดูกสันหลังช่วงอก (Thoracic Spine)', 'นั่งตัวตรง หมุนช่วงบนลำตัวไปทางซ้ายและขวาช้าๆ ค้างไว้ข้างละ 10 วินาที', 'ห้ามกระชากหรือบิดตัวรุนแรง', NULL, true),
    ('stretch_quadriceps', 'พับเข่ายืดกล้ามเนื้อหน้าขา', 'Standing Quadriceps Stretch', 'ฟื้นฟูข้อเข่าและขา', 'medium', 120, 15, 5, 2, 'กล้ามเนื้อหน้าขา (Quadriceps)', 'ยืนจับเก้าอี้ พับเข่าไปด้านหลัง ใช้มือจับข้อเท้าดึงเบาๆ ให้ตึงหน้าขา', 'เข่าสองข้างชิดกัน ลำตัวไม่แอ่น', NULL, true),
    ('stretch_hamstrings', 'ก้มแตะยืดกล้ามเนื้อต้นขาด้านหลัง', 'Hamstring Stretch', 'ฟื้นฟูข้อเข่าและขา', 'medium', 45, 15, 5, 2, 'ต้นขาด้านหลัง (Hamstrings)', 'ยื่นขาข้างหนึ่งไปด้านหน้า เปิดปลายเท้า ก้มลำตัวจากข้อสะโพกลงช้าๆ', 'หลังตรง ไม่งอหลัง', NULL, true),
    ('stretch_calf', 'ก้าวขายืดกล้ามเนื้อน่อง', 'Calf Stretch (Gastrocnemius)', 'ฟื้นฟูข้อเท้าและขา', 'easy', 75, 15, 5, 2, 'กล้ามเนื้อน่อง (Calf)', 'ก้าวขาข้างหนึ่งไปด้านหลัง ส้นเท้าติดพื้น ขาหลังเหยียดตรง โน้มตัวไปข้างหน้า', 'ส้นเท้าหลังห้ามลอย', NULL, true),
    ('stretch_piriformis_seated', 'นั่งไขว่ห้างยืดกล้ามเนื้อสะโพก', 'Seated Piriformis Stretch', 'ฟื้นฟูข้อสะโพกและหลัง', 'medium', 30, 15, 5, 2, 'กล้ามเนื้อก้นลึก (Piriformis)', 'นั่งบนเก้าอี้ ยกข้อเท้าวางบนเข่าอีกข้าง แล้วโน้มตัวตรงไปข้างหน้าช้าๆ', 'รักษากระดูกสันหลังให้ตรง', NULL, true)
ON CONFLICT (slug) DO UPDATE SET
    name_th = EXCLUDED.name_th,
    name_en = EXCLUDED.name_en,
    category = EXCLUDED.category,
    difficulty = EXCLUDED.difficulty,
    target_angle = EXCLUDED.target_angle,
    hold_seconds = EXCLUDED.hold_seconds,
    reps = EXCLUDED.reps,
    sets = EXCLUDED.sets,
    target_joint = EXCLUDED.target_joint,
    instructions = EXCLUDED.instructions,
    caution = EXCLUDED.caution,
    updated_at = now();

-- ============================================================================
-- 3. SEED USERS & PROFILES (ADMIN, THERAPISTS & DEMO PATIENTS)
-- ============================================================================

-- Function ช่วยสร้าง Auth User และ Profile พร้อมกัน (ปลอดภัยและทำงานได้ทั้งบน Local และ Supabase Cloud)
DO $$
DECLARE
    admin_uid UUID := 'a0000000-0000-0000-0000-000000000001'::uuid;
    pt1_uid   UUID := 'b0000000-0000-0000-0000-000000000002'::uuid;
    pt2_uid   UUID := 'b0000000-0000-0000-0000-000000000003'::uuid;
    p1_uid    UUID := 'c0000000-0000-0000-0000-000000000004'::uuid;
    p2_uid    UUID := 'c0000000-0000-0000-0000-000000000005'::uuid;
    p3_uid    UUID := 'c0000000-0000-0000-0000-000000000006'::uuid;
    encrypted_pass TEXT := crypt('1234', gen_salt('bf'));
    pin1234_hash   TEXT := encode(digest('1234', 'sha256'), 'hex');
BEGIN
    -- 3.1 สร้างใน auth.users (ถ้ายังไม่มี)
    -- Admin
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = admin_uid OR email = 'director@strongcare.hospital') THEN
        INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
        VALUES (
            admin_uid,
            '00000000-0000-0000-0000-000000000000',
            'director@strongcare.hospital',
            encrypted_pass,
            now(),
            '{"provider":"email","providers":["email"]}',
            '{"username":"admin","full_name":"นพ. วรชัย อมรเวช","role":"admin"}',
            now(),
            now(),
            'authenticated',
            'authenticated'
        );
    END IF;

    -- PT 1: Thanakorn
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = pt1_uid OR email = 'thanakorn.w@strongcare.hospital') THEN
        INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
        VALUES (
            pt1_uid,
            '00000000-0000-0000-0000-000000000000',
            'thanakorn.w@strongcare.hospital',
            encrypted_pass,
            now(),
            '{"provider":"email","providers":["email"]}',
            '{"username":"pt_thanakorn","full_name":"กภ. ธนากร วงศ์สวัสดิ์","role":"therapist"}',
            now(),
            now(),
            'authenticated',
            'authenticated'
        );
    END IF;

    -- PT 2: Pimchanok
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = pt2_uid OR email = 'pimchanok.s@strongcare.hospital') THEN
        INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
        VALUES (
            pt2_uid,
            '00000000-0000-0000-0000-000000000000',
            'pimchanok.s@strongcare.hospital',
            encrypted_pass,
            now(),
            '{"provider":"email","providers":["email"]}',
            '{"username":"pt_pimchanok","full_name":"กภ. พิมพ์ชนก สุขเกษม","role":"therapist"}',
            now(),
            now(),
            'authenticated',
            'authenticated'
        );
    END IF;

    -- 3.2 บันทึกข้อมูลลงตาราง public.profiles
    INSERT INTO public.profiles (id, username, full_name, role, phone, email, is_active)
    VALUES 
        (admin_uid, 'admin', 'นพ. วรชัย อมรเวช (ผู้อำนวยการ รพ.)', 'admin', '02-555-0199', 'director@strongcare.hospital', true),
        (pt1_uid, 'pt_thanakorn', 'กภ. ธนากร วงศ์สวัสดิ์', 'therapist', '081-456-7890', 'thanakorn.w@strongcare.hospital', true),
        (pt2_uid, 'pt_pimchanok', 'กภ. พิมพ์ชนก สุขเกษม', 'therapist', '089-765-4321', 'pimchanok.s@strongcare.hospital', true)
    ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email;

    -- 3.3 บันทึกข้อมูลลงตาราง public.therapists
    INSERT INTO public.therapists (profile_id, code, license_no, specialty, bio, phone, email, status)
    VALUES
        (pt1_uid, 'T-003', 'กภ.12458', 'กายภาพบำบัดระบบกล้ามเนื้อและกระดูก (Orthopedic PT)', 'วุฒิบัตรกายภาพบำบัดระบบกล้ามเนื้อและกระดูก จุฬาลงกรณ์มหาวิทยาลัย ประสบการณ์คลินิก 8 ปี', '081-456-7890', 'thanakorn.w@strongcare.hospital', 'active'),
        (pt2_uid, 'T-007', 'กภ.15890', 'กายภาพบำบัดระบบประสาทและผู้สูงอายุ (Neurological & Geriatric PT)', 'ปริญญาโทกายภาพบำบัดระบบประสาท มหาวิทยาลัยมหิดล เชี่ยวชาญการฟื้นฟูผู้ป่วยหลอดเลือดสมอง ประสบการณ์ 6 ปี', '089-765-4321', 'pimchanok.s@strongcare.hospital', 'active')
    ON CONFLICT (profile_id) DO UPDATE SET
        code = EXCLUDED.code,
        license_no = EXCLUDED.license_no,
        specialty = EXCLUDED.specialty,
        bio = EXCLUDED.bio,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email;

    -- 3.4 บันทึกข้อมูลคนไข้เริ่มต้น public.patients
    INSERT INTO public.patients (
        patient_code, full_name, age, gender, phone, chief_complaint, medical_history, treatment_outcome, therapist_notes, responsible_therapist_id, status, pin_hash
    )
    VALUES
        ('P-0012', 'นายสมชาย ใจดี', 68, 'male', '081-234-5678', 'ปวดและขยับข้อไหล่ติดขัด ยกแขนได้ไม่สุด 3 สัปดาห์', 'ความดันโลหิตสูง ควบคุมได้ดีด้วยยา', 'องศาการกางแขนดีขึ้นจาก 65° เป็น 85°', 'ให้เน้นฝึกท่ายืดข้ามลำตัวและกางแขนขนานพื้นต่อเนื่อง', pt1_uid, 'active', pin1234_hash),
        ('P-0013', 'นางมาลี รักสุข', 72, 'female', '089-876-5432', 'ข้อเข่าฝืดตึงเวลาลุกยืน หลังผ่าตัดเปลี่ยนข้อเข่าเทียม 2 เดือน', 'เบาหวานชนิดที่ 2 ไม่มีแผลเรื้อรัง', 'กล้ามเนื้อหน้าขาแข็งแรงขึ้น ทรงตัวได้มั่นคงขึ้น', 'ระวังไม่ให้ย่อเข่าลึกเกิน 85 องศา', pt1_uid, 'active', pin1234_hash),
        ('P-0021', 'นายวิชัย แก้วมณี', 64, 'male', '086-345-6789', 'กล้ามเนื้อแขนขาซีกขวาอ่อนแรงระยะฟื้นฟูจากโรคหลอดเลือดสมอง', 'หลอดเลือดสมองตีบ พ้นระยะเฉียบพลัน 4 เดือน', 'การควบคุมทิศทางการเคลื่อนไหวแขนขวาแม่นยำขึ้น', 'แนะนำให้ทำมินิเกมฝึกความสัมพันธ์ของสายตาและมือ', pt2_uid, 'active', pin1234_hash)
    ON CONFLICT (patient_code) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        age = EXCLUDED.age,
        gender = EXCLUDED.gender,
        phone = EXCLUDED.phone,
        chief_complaint = EXCLUDED.chief_complaint,
        medical_history = EXCLUDED.medical_history,
        treatment_outcome = EXCLUDED.treatment_outcome,
        therapist_notes = EXCLUDED.therapist_notes,
        responsible_therapist_id = EXCLUDED.responsible_therapist_id,
        pin_hash = EXCLUDED.pin_hash;

    -- 3.5 บันทึก Activity Logs เริ่มต้น
    INSERT INTO public.activity_logs (actor_name, role, category, action, detail, device_info, ip_address)
    VALUES
        ('System Initializer', 'system', 'SYSTEM', 'DATABASE_SEED', 'เริ่มต้นฐานข้อมูล Supabase สำเร็จพร้อมตารางและ RLS', 'Supabase PostgreSQL Cloud', '127.0.0.1');

END $$;

-- ==============================================================================
-- Moh Tech Care — Production Seed Data
-- ==============================================================================

SET NAMES utf8mb4;
SET time_zone = '+07:00';
SET FOREIGN_KEY_CHECKS = 0;

-- Clean existing data
TRUNCATE TABLE session_logs;
TRUNCATE TABLE routine_items;
TRUNCATE TABLE appointments;
TRUNCATE TABLE preset_items;
TRUNCATE TABLE exercises;
TRUNCATE TABLE temporary_coverages;
TRUNCATE TABLE medical_notes;
TRUNCATE TABLE face_templates;
TRUNCATE TABLE auth_sessions;
TRUNCATE TABLE banned_ips;
TRUNCATE TABLE audit_logs;
TRUNCATE TABLE pt_profiles;
TRUNCATE TABLE patient_profiles;
TRUNCATE TABLE users;

-- ------------------------------------------------------------------------------
-- 1. USERS
-- Default passwords: 'password123'
-- Hash: $2y$10$wT0l72W2a0oM6pYf1JzG/OQp7lJt04b9J4B3j97H5c6Q1fF1NqD0S
-- ------------------------------------------------------------------------------
INSERT INTO users (id, full_name, username, password_hash, role, phone, email, status, must_change_password) VALUES
('A-001', 'นพ. วรชัย ศิริวงศ์ (Dr. Worachai S.)', 'admin', '$2y$10$wT0l72W2a0oM6pYf1JzG/OQp7lJt04b9J4B3j97H5c6Q1fF1NqD0S', 'admin', '081-555-0101', 'director@mohtechcare.local', 'active', 0),
('A-002', 'พญ. พรรณวลัย จิตดี (Dr. Panwalai J.)', 'admin.panwalai', '$2y$10$wT0l72W2a0oM6pYf1JzG/OQp7lJt04b9J4B3j97H5c6Q1fF1NqD0S', 'admin', '081-555-0102', 'panwalai@mohtechcare.local', 'active', 0),

('T-001', 'กภ. วริศรา นามสมมติ (PT Varisara N.)', 'pt.varisara', '$2y$10$wT0l72W2a0oM6pYf1JzG/OQp7lJt04b9J4B3j97H5c6Q1fF1NqD0S', 'pt', '089-111-2233', 'varisara.pt@mohtechcare.local', 'active', 0),
('T-002', 'กภ. สมพงษ์ ใจอารีย์ (PT Sompong J.)', 'pt.sompong', '$2y$10$wT0l72W2a0oM6pYf1JzG/OQp7lJt04b9J4B3j97H5c6Q1fF1NqD0S', 'pt', '089-222-3344', 'sompong.pt@mohtechcare.local', 'active', 0),
('T-003', 'กภ. ภาวิณี สุขสวัสดิ์ (PT Phawinee S.)', 'pt.phawinee', '$2y$10$wT0l72W2a0oM6pYf1JzG/OQp7lJt04b9J4B3j97H5c6Q1fF1NqD0S', 'pt', '089-333-4455', 'phawinee.pt@mohtechcare.local', 'active', 0),

('P-1001', 'นายสมชาย มีสุข (Somchai Meesook)', 'somchai.m', '$2y$10$wT0l72W2a0oM6pYf1JzG/OQp7lJt04b9J4B3j97H5c6Q1fF1NqD0S', 'patient', '086-123-4567', '-', 'active', 0),
('P-1002', 'นางวิภาดา รัตนกุล (Wiphada Rattanakul)', 'wiphada.r', '$2y$10$wT0l72W2a0oM6pYf1JzG/OQp7lJt04b9J4B3j97H5c6Q1fF1NqD0S', 'patient', '084-234-5678', '-', 'active', 0),
('P-1003', 'นายประสิทธิ์ รุ่งโรจน์ (Prasit Rungroj)', 'prasit.r', '$2y$10$wT0l72W2a0oM6pYf1JzG/OQp7lJt04b9J4B3j97H5c6Q1fF1NqD0S', 'patient', '085-345-6789', '-', 'active', 0),
('P-1004', 'นางสาวกัลยาณี เจริญพร (Kalyanee C.)', 'kalyanee.c', '$2y$10$wT0l72W2a0oM6pYf1JzG/OQp7lJt04b9J4B3j97H5c6Q1fF1NqD0S', 'patient', '087-456-7890', '-', 'active', 0);

-- ------------------------------------------------------------------------------
-- 2. PT PROFILES
-- ------------------------------------------------------------------------------
INSERT INTO pt_profiles (pt_id, license_number, department, bio) VALUES
('T-001', 'PT-4921', 'Musculoskeletal', 'ผู้เชี่ยวชาญด้านระบบกระดูกและกล้ามเนื้อ ฟื้นฟูข้อไหล่และข้อเข่า ประสบการณ์ 9 ปี'),
('T-002', 'PT-5102', 'Neurological', 'ผู้เชี่ยวชาญการฟื้นฟูผู้ป่วยระบบประสาทและหลอดเลือดสมอง (Stroke & Neurological Rehab) ประสบการณ์ 7 ปี'),
('T-003', 'PT-6234', 'Geriatric', 'ผู้เชี่ยวชาญกายภาพบำบัดผู้สูงอายุ การป้องกันการหกล้ม และเพิ่มกำลังกล้ามเนื้อ ประสบการณ์ 5 ปี');

-- ------------------------------------------------------------------------------
-- 3. PATIENT PROFILES
-- ------------------------------------------------------------------------------
INSERT INTO patient_profiles (patient_id, age, gender, admission_date, assigned_pt_id, treatment_status, initial_symptoms, underlying_diseases, drug_allergies) VALUES
('P-1001', 68, 'male', '2026-10-01', 'T-001', 'active', 'ฟื้นฟูกล้ามเนื้อไหล่และข้อศอกหลังผ่าตัด เอ็นหัวไหล่อักเสบ (Rotator Cuff Tear Post-op)', 'ความดันโลหิตสูง (HT)', 'Penicillin'),
('P-1002', 62, 'female', '2026-09-25', 'T-001', 'active', 'กายภาพบำบัดฟื้นฟูข้อเข่าเสื่อมระยะแรก ต้องการเพิ่มความแข็งแรงของ Quadriceps', '-', '-'),
('P-1003', 71, 'male', '2026-10-08', 'T-002', 'active', 'ผู้ป่วยหลังสโตรก (Stroke Rehab) ฟื้นฟูการควบคุมแขนและข้อศอกข้างขวา การทรงตัว', 'เบาหวาน (DM)', '-'),
('P-1004', 45, 'female', '2026-10-12', 'T-002', 'active', 'ออฟฟิศซินโดรม ไหล่ห่อ ปวดสะบักและคอบ่า Range of Motion หัวไหล่จำกัด', '-', 'Aspirin');

-- ------------------------------------------------------------------------------
-- 4. EXERCISES & PRESET PACKAGES
-- Mini-games playable now; Single pose exercises gated by FEATURE_PT_POSE_EXERCISES
-- ------------------------------------------------------------------------------
INSERT INTO exercises (id, name_th, name_en, category, type, default_reps, default_sets, default_rest_seconds, instructions, benefits, media_path, is_active, created_by) VALUES
('MG-01', 'เกมเป่าลูกโป่งเอื้อมจับ', 'Balloon Pop', 'Minigame', 'single', 10, 3, 20, 'ยกมือขึ้นเอื้อมสัมผัสลูกโป่งที่ลอยขึ้นมาให้แตก เพื่อฝึกการเคลื่อนไหวของข้อไหล่และกล้ามเนื้อแขน', 'เพิ่ม Range of Motion หัวไหล่ และความเร็วในการตอบสนองของระบบกล้ามเนื้อ', '/exercise-media/mini-games/MG-01/cover_image.png', 1, 'A-001'),
('MG-02', 'เกมจับดาวนำวิถี', 'Reach & Catch', 'Minigame', 'single', 12, 3, 25, 'เอื้อมมือสัมผัสกลุ่มดาวตามตำแหน่งที่ระบุบนหน้าจอ เพื่อฝึกการทรงตัวและการประสานงานสายตา-มือ', 'ฟื้นฟู Coordination และความมั่นคงในการเอื้อมของแขนสองข้าง', '/exercise-media/mini-games/MG-02/cover_image.png', 1, 'A-001'),
('EX-01', 'กางแขนยกด้านข้าง', 'Shoulder Raise', 'Shoulder', 'single', 10, 3, 30, 'ยืนหรือนั่งหลังตรง กางแขนออกด้านข้างช้าๆ จนถึงระดับไหล่ (ประมาณ 90-120 องศา) ค้างไว้ 2 วินาที', 'เพิ่มกำลังกล้ามเนื้อ Deltoid และ Supraspinatus', '/exercise-media/poses/shoulder_raise.png', 1, 'A-001'),
('EX-02', 'งอข้อศอกฟื้นฟูกำลังแขน', 'Elbow Flexion', 'Arm', 'single', 10, 3, 30, 'แนบข้อศอกชิดลำตัว งอข้อศอกยกมือขึ้นช้าๆ ค้างไว้ 1 วินาที แล้วคลายลงสุด', 'ฟื้นฟูกำลังกล้ามเนื้อ Biceps และการเคลื่อนไหวของข้อศอก', '/exercise-media/poses/elbow_flexion.png', 1, 'T-001'),
('EX-03', 'เหยียดเข่าขณะนั่ง', 'Knee Extension', 'Leg', 'single', 10, 3, 30, 'นั่งเก้าอี้หลังพิงพนัก เท้าแตะพื้น ค่อยๆ เตะขาเหยียดตรงขนานพื้น ค้างไว้ 2 วินาที แล้ววางลงช้าๆ', 'เพิ่มกำลังกล้ามเนื้อต้นขาด้านหน้า (Quadriceps) ลดอาการปวดข้อเข่า', '/exercise-media/poses/knee_extension.png', 1, 'T-001'),
('PS-01', 'ชุดฟื้นฟูข้อไหล่และแขนพื้นฐาน', 'Upper Body Starter Preset', 'Shoulder', 'preset', 10, 3, 30, 'โปรแกรมรวมแบบฝึกหัดฟื้นฟูช่วงแขนและหัวไหล่สำหรับผู้ป่วยระยะแรก', 'ช่วยฟื้นฟูการเคลื่อนไหวแบบองค์รวมอย่างปลอดภัย', NULL, 1, 'A-001');

INSERT INTO preset_items (preset_id, exercise_id, order_index, reps, sets, rest_seconds) VALUES
('PS-01', 'MG-01', 1, 10, 3, 20),
('PS-01', 'MG-02', 2, 10, 3, 25);

-- ------------------------------------------------------------------------------
-- 5. APPOINTMENTS & ROUTINE ITEMS
-- ------------------------------------------------------------------------------
INSERT INTO appointments (id, patient_id, pt_id, appointment_date, status, notes, created_by) VALUES
(1, 'P-1001', 'T-001', '2026-10-14', 'completed', 'ฝึกกายภาพรอบบ่าย ผู้ป่วยทำได้ครบทุกเซ็ต', 'T-001'),
(2, 'P-1001', 'T-001', '2026-10-15', 'scheduled', 'นัดหมายกายภาพประจำวัน (Kiosk Session)', 'T-001'),
(3, 'P-1002', 'T-001', '2026-10-15', 'scheduled', 'ฝึกกล้ามเนื้อและประสาทการเคลื่อนไหว', 'T-001'),
(4, 'P-1003', 'T-002', '2026-10-15', 'scheduled', 'ฝึกเอื้อมแขนขวาและจับดาว', 'T-002'),
(5, 'P-1004', 'T-002', '2026-10-16', 'scheduled', 'นัดตรวจอาการคอบ่าและปรับตารางฝึก', 'T-002');

INSERT INTO routine_items (id, appointment_id, exercise_id, order_index, reps, sets, rest_seconds, custom_instructions, status) VALUES
(1, 1, 'MG-01', 1, 10, 3, 20, 'เน้นเอื้อมแขนข้างขวาอย่างช้าๆ ไม่ต้องเกร็งคอ', 'completed'),
(2, 1, 'MG-02', 2, 10, 3, 25, 'จับดาวระดับอกและเหนือศีรษะ', 'completed'),
(3, 2, 'MG-01', 1, 10, 3, 20, 'ฝึกเอื้อมแขนต่อเนื่อง รักษาความเร็วสม่ำเสมอ', 'pending'),
(4, 2, 'MG-02', 2, 12, 3, 25, 'พยายามเหยียดแขนให้สุดก่อนแตะดวงดาว', 'pending'),
(5, 3, 'MG-01', 1, 10, 3, 20, 'ฝึกเพื่อกระตุ้นการทรงตัวและการขยับข้อไหล่', 'pending'),
(6, 4, 'MG-02', 1, 8, 3, 30, 'จับดาวช้าๆ ป้องกันอาการล้าของกล้ามเนื้อแขนขวา', 'pending');

-- ------------------------------------------------------------------------------
-- 6. SESSION LOGS (Historical Data for Analytics & Dots)
-- ------------------------------------------------------------------------------
INSERT INTO session_logs (appointment_id, patient_id, exercise_id, routine_item_id, started_at, ended_at, correct_reps, incorrect_reps, accuracy_percent, score, duration_seconds, status) VALUES
(1, 'P-1001', 'MG-01', 1, '2026-10-14 10:15:00', '2026-10-14 10:20:00', 28, 2, 93.33, 280, 300, 'completed'),
(1, 'P-1001', 'MG-02', 2, '2026-10-14 10:22:00', '2026-10-14 10:28:00', 27, 3, 90.00, 270, 360, 'completed');

-- ------------------------------------------------------------------------------
-- 7. MEDICAL NOTES (Append-only records with stamped headers)
-- ------------------------------------------------------------------------------
INSERT INTO medical_notes (patient_id, author_id, author_role, author_name, header_stamp, note_content, referenced_note_id) VALUES
('P-1001', 'T-001', 'pt', 'กภ. วริศรา นามสมมติ', '[01/10/2026 09:30 - Logged by PT: กภ. วริศรา นามสมมติ]', 'รับเคสผู้ป่วยหลังผ่าตัดเย็บซ่อมเอ็นหัวไหล่ (Rotator Cuff Repair) สัปดาห์ที่ 4 ยังคงมีอาการตึงข้อไหล่เล็กน้อย ช่วงการเคลื่อนไหวยกแขนด้านหน้าได้ 100 องศา', NULL),
('P-1001', 'T-001', 'pt', 'กภ. วริศรา นามสมมติ', '[14/10/2026 11:00 - Logged by PT: กภ. วริศรา นามสมมติ]', 'ผู้ป่วยฝึกมินิเกมผ่าน Kiosk ได้อย่างต่อเนื่อง ไม่บ่นเจ็บ ฟอร์มการเอื้อมแขนดีขึ้น ความแม่นยำเฉลี่ยมากกว่า 90% แนะนำเพิ่มจำนวนครั้งในเซ็ตถัดไป', NULL),
('P-1002', 'T-001', 'pt', 'กภ. วริศรา นามสมมติ', '[25/09/2026 14:00 - Logged by PT: กภ. วริศรา นามสมมติ]', 'ตรวจประเมินข้อเข่า พบ Crepitus เล็กน้อย กำลังกล้ามเนื้อ Quadriceps Grade 4 แนะนำโปรแกรมบริหารข้อเข่าและการเคลื่อนไหวทั่วไป', NULL);

-- ------------------------------------------------------------------------------
-- 8. TEMPORARY CASE DELEGATION
-- T-001 delegates P-1001 to T-002 during conference leave
-- ------------------------------------------------------------------------------
INSERT INTO temporary_coverages (patient_id, owner_pt_id, cover_pt_id, start_date, end_date, reason, status, created_by) VALUES
('P-1001', 'T-001', 'T-002', '2026-10-15', '2026-10-18', 'นักกายภาพบำบัดเจ้าของไข้ติดอบรมวิชาการประจำปี ฝากดูแลการฝึกและปรับตารางทาง Kiosk', 'active', 'T-001');

-- ------------------------------------------------------------------------------
-- 9. AUDIT LOGS
-- ------------------------------------------------------------------------------
INSERT INTO audit_logs (user_id, user_name, user_role, ip_address, device_type, action, details, security_status) VALUES
('A-001', 'นพ. วรชัย ศิริวงศ์', 'admin', '127.0.0.1', 'Desktop', 'SYSTEM_INIT', 'ระบบ Moh Tech Care เริ่มต้นทำงานและโหลดโครงสร้างฐานข้อมูล SSOT สมบูรณ์', 'Normal'),
('T-001', 'กภ. วริศรา นามสมมติ', 'pt', '192.168.1.45', 'Desktop', 'TEMPORARY_COVERAGE_CREATE', 'ฝากเคสผู้ป่วย P-1001 ให้แก่ กภ. สมพงษ์ ใจอารีย์ (T-002)', 'Normal'),
('P-1001', 'นายสมชาย มีสุข', 'patient', '192.168.1.100', 'Kiosk', 'KIOSK_SESSION_COMPLETE', 'ผู้ป่วยทำแบบฝึกหัด MG-01 และ MG-02 ครบถ้วนผ่าน Kiosk Terminal', 'Normal');

SET FOREIGN_KEY_CHECKS = 1;

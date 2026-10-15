# Moh Tech Care — Complete End-to-End Verification & Quality Audit Checklist

ระบบบริหารจัดการกายภาพบำบัดอัจฉริยะ (Moh Tech Care) ได้รับการพัฒนาและตรวจสอบครบถ้วนทุก Phase ตามข้อกำหนดสถาปัตยกรรม Single Source of Truth, Role-Based Access Control (RBAC) ระดับ Server-Side และมาตรฐานความปลอดภัยเวชระเบียนสากล

---

## 1. Phase 1: Database Architecture & Single Source of Truth
- [x] **14 ตารางหลักสมบูรณ์ (InnoDB, utf8mb4):**
  - `users`: จัดเก็บข้อมูลบัญชีผู้ใช้ บทบาท และสถานะ
  - `biometric_profiles`: การลงทะเบียนใบหน้า 10-Frame Vector และความพร้อมใช้งาน
  - `face_vectors`: เวกเตอร์ 128 มิติ สำหรับ Cosine Similarity Face Matching
  - `user_identities`: รหัสประจำตัว รหัสผู้ป่วย (HN) และใบประกอบวิชาชีพ
  - `medical_notes`: บันทึกเวชระเบียนทางการแพทย์ (Append-Only)
  - `exercises`: คลังแบบฝึกหัดกายภาพ (Mini-Game & Pose Detection)
  - `exercise_presets`: ชุดแบบฝึกหัดมาตรฐาน (Rehab Presets)
  - `preset_exercises`: ความสัมพันธ์ชุดแบบฝึกหัดกับท่ากายภาพ
  - `daily_routines`: แผนการรักษาประจำวันของผู้ป่วย
  - `daily_routine_items`: รายการแบบฝึกหัดในแต่ละการนัดหมาย
  - `therapy_sessions`: ประวัติการฝึกจริงที่ตู้ Kiosk
  - `therapy_session_exercises`: ผลคะแนน จำนวน Reps และสถิติการเล่น
  - `pt_temporary_coverage`: การมอบหมายเคสดูแลแทนชั่วคราว
  - `audit_logs`: บันทึก Audit Trail ทุกการกระทำที่สำคัญ
  - `auth_sessions`: ตาราง Active Tokens สำหรับตรวจจับ Force Logout
  - `banned_ips`: บัญชีดำ IP สำหรับระบบรักษาความปลอดภัยระดับ Gateway
- [x] **Append-Only Triggers:**
  - สร้าง MySQL Trigger `trg_medical_notes_no_update` (บล็อกการ `UPDATE` ทุกกรณี โดย Raise SQLSTATE '45000')
  - สร้าง MySQL Trigger `trg_medical_notes_no_delete` (บล็อกการ `DELETE` ทุกกรณี โดย Raise SQLSTATE '45000')
- [x] **Seed Data พร้อมใช้งาน:**
  - `A-001` (Super Admin), `T-001` (PT สมชาย), `P-1001` (ผู้ป่วยสมศักดิ์)
  - มินิเกม `MG-01` (Balloon Pop), `MG-02` (Reach & Catch), ท่ากายภาพ `EX-01`, และ Preset `PS-01`

---

## 2. Phase 2: Authentication, Security & RBAC Engine
- [x] **Rate Limiting & Brute-Force Protection:**
  - ดักจับการล็อกอินล้มเหลวเกิน 5 ครั้ง ภายใน 10 นาที บันทึกสถานะ `RATE_LIMITED`
- [x] **IP Banning Middleware:**
  - ตรวจสอบตาราง `banned_ips` ทุก Request หากถูกแบน ส่งคืน HTTP 403 Forbidden ทันที
- [x] **Token Revocation & Force Logout:**
  - ตรวจสอบ `revoked_at` ใน `auth_sessions` ทุก Request เมื่อ Admin กด Force Logout Token จะถูก Revoke และส่งคืน 401 Unauthorized
  - Client-side ดักจับ 401 และสั่ง Redirect ผู้ใช้กลับไปยังหน้าจอเริ่มต้นทันที
- [x] **Password Masking:**
  - API ทุกตัวส่งคืนรหัสผ่านในรูปแบบ `Hashed ●●●●` เสมอ ห้ามเปิดเผย Raw Hash ใน JSON Response
- [x] **Server-side RBAC Enforcement:**
  - `RbacMiddleware` ตรวจสอบ Role ทุก Endpoint (Super Admin, Physiotherapist, Patient) ป้องกันการเข้าถึงโดยมิชอบแม้ผู้ใช้จะ Bypass UI

---

## 3. Phase 3: Module M1 User Management & Biometrics Enrollment
- [x] **2-Step Wizard สำหรับสร้างผู้ใช้ใหม่:**
  - Step 1: กรอกข้อมูลส่วนตัว บทบาท (Admin, PT, Patient) และรหัสผ่านเริ่มต้น
  - Step 2: ระบบตรวจจับและลงทะเบียนใบหน้าอัตโนมัติ (10-Frame Snapshot Capture พร้อมเสียงแนะนำภาษาไทย)
- [x] **ระบบบริหารจัดการบัญชี:**
  - อัปเดตข้อมูลผู้ใช้ แก้ไขเบอร์โทร/ข้อมูลติดต่อ
  - รีเซ็ตรหัสผ่านเป็นรหัสผ่านชั่วคราว (บังคับเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรก)
  - รีเซ็ตและลงทะเบียน Biometrics ใหม่

---

## 4. Phase 4: Module M2 All Patient Records
- [x] **Tab 1: Personal Information:**
  - แสดงข้อมูลทั่วไป, โรคประจำตัว, ประวัติการแพ้ยา, และ PT ผู้ดูแลหลัก
  - อนุญาตให้ Super Admin และ PT ที่ดูแลเคสเท่านั้นทำการแก้ไข
- [x] **Tab 2: Medical Notes (Append-Only):**
  - ไม่สามารถแก้ไขหรือลบข้อความเดิมได้
  - ทุกโน้ตที่เพิ่มใหม่ จะได้รับการประทับตรา (Stamp) อัตโนมัติ: วันเวลา (`DD/MM/YYYY HH:mm`), ชื่อ-นามสกุล PT, เลขที่ใบอนุญาต PT
- [x] **Tab 3: Performance Analytics:**
  - กราฟและจุดแสดงความถี่การฝึก (Frequency Dots) 30 วันย้อนหลัง
  - คำนวณ Adherence Rate (%), Completion Rate, และสถิติแนวโน้มคะแนนความเจ็บปวด (Pain Score)

---

## 5. Phase 5: Module M3 Therapy Schedule & Routine Planner
- [x] **Master Schedule Calendar:**
  - แสดงปฏิทินนัดหมายแบบเลือกมุมมองวัน/สัปดาห์/เดือน
  - คัดกรองมุมมอง: เคสของฉัน (My Cases), เคสดูแลแทน (Covered Cases), และทั้งหมด (All Cases - Admin Only)
- [x] **Routine Assignment & Pose Gating:**
  - สามารถกำหนดชุดแบบฝึกหัดประจำวันให้ผู้ป่วย
  - ล็อกแบบฝึกหัดกล้องประเภท Pose Tracking ด้วยป้าย `"อยู่ระหว่างพัฒนา"` ตาม Flag `FEATURE_PT_POSE_EXERCISES = false`
  - อนุญาตให้มอบหมาย Mini-Games (MG-01, MG-02) ได้อย่างสมบูรณ์
- [x] **Move / Reschedule Appointment:**
  - ตรวจสอบสิทธิ์การย้ายนัดหมาย บันทึกประวัติการเปลี่ยนวันลงใน Audit Log

---

## 6. Phase 6: Module M4 PT Directory & PT Workspace
- [x] **Super Admin Surface (PT Directory):**
  - แสดงรายชื่อนักกายภาพบำบัด ภาระงานปัจจุบัน (Workload) และสถิติเคสที่ดูแล
  - ฟังก์ชัน Case Transfer โอนย้ายเคสผู้ป่วยระหว่าง PT พร้อมบันทึกเหตุผลลงใน Audit Trail
- [x] **Physiotherapist Surface (PT Workspace):**
  - แสดงโปรไฟล์ส่วนตัวและรายการเคสที่รับผิดชอบ
  - ระบบ Temporary Coverage Delegation มอบหมายเพื่อนร่วมงานดูแลแทนตามช่วงวันที่กำหนด พร้อมปุ่มเพิกถอนสิทธิ์ (Revoke) ได้ทันที

---

## 7. Phase 7: Module M5 Exercise Library & Module M6 Audit & Security
- [x] **M5: Exercise Library:**
  - คลังแบบฝึกหัดและ Preset Packages
  - แยกแท็ก System Presets และ PT-Created Presets
  - PT สามารถสร้าง/แก้ไข/ลบเฉพาะแบบฝึกหัดของตนเอง, Super Admin จัดการได้ทั้งหมด
- [x] **M6: Audit Logs & Security Control (Admin Surface Only):**
  - บันทึกการกระทำสำคัญ: Login, Logout, Force Logout, IP Ban, Case Transfer, Note Append
  - ไฮไลท์ Suspicious Events (เข้าสู่ระบบผิดพลาดซ้ำ, เข้าถึงนอกเวลา)
  - ควบคุม Active Sessions และปุ่ม Force Logout รายบุคคล
  - ระบบแบนและปลดแบน IP (IP Blacklist Management)
  - บล็อกสิทธิ์ PT ไม่ให้เข้าถึงหน้านี้ (ส่งคืน HTTP 403 Forbidden และซ่อนเมนู)

---

## 8. Phase 8: Patient Kiosk Terminal & Production Hardening
- [x] **10-State Machine Kiosk Flow:**
  - `IDLE_ATTRACT` -> `APPROACHING` -> `FACE_SCANNING` -> `FACE_MATCHED` -> `ROUTINE_DISPLAY` -> `PRE_EXERCISE_GUIDE` -> `EXERCISE_RUNNING` -> `POST_EXERCISE_FEEDBACK` -> `SESSION_SUMMARY`
  - มีช่องทาง `STAFF_FALLBACK` สำหรับเจ้าหน้าที่เข้าสู่ระบบด้วยรหัสผ่านหรือเลือกผู้ป่วยกรณีสแกนไม่ติด
- [x] **On-Device Motion & Face Matching:**
  - Frame Differencing Motion Detection ปลุกหน้าจอจากโหมดสแตนด์บายเมื่อมีผู้ป่วยเดินเข้ามา
  - Cosine Similarity Matching Threshold `0.78` พร้อม Margin `0.08` ป้องกัน False Positive
- [x] **Playable Mini-Games:**
  - `MG-01` Balloon Pop: บอลลูนลอยขึ้น สัมผัสเพื่อทำลาย นับคะแนนและ Reps
  - `MG-02` Reach & Catch: เอื้อมจับผลไม้ตามทิศทาง นับรอบและความเร็ว
  - นาฬิกานับเวลาพักระหว่างเซ็ต (Rest Countdown) และเสียงแนะนำภาษาไทยตามข้อกำหนด
- [x] **Session Logging:**
  - สรุปผลการฝึก บันทึกคะแนนและ Reps ส่งเข้าฐานข้อมูล `/api/kiosk/session-logs` ทันที
- [x] **Production Deployment Scripts:**
  - `launch_kiosk.bat`: สคริปต์เปิด Google Chrome โหมด Kiosk แนวตั้ง (1080×1920) ปิด Pinch Zoom
  - `launch_system.bat`: สคริปต์เปิดระบบ Full-Stack แบบรวมศูนย์ (Backend + Frontend)
  - `backend/cron/auto_reschedule.php`: ระบบยกยอดการนัดหมายและตารางฝึกอัตโนมัติประจำวัน
  - `docs/APACHE_VHOST.conf` และ `docs/XAMPP_DEPLOYMENT_GUIDE.md`: คู่มือการติดตั้งสำหรับ Apache และ XAMPP

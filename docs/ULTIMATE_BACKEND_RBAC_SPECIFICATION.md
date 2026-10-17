# 📑 เอกสารข้อกำหนดและสเปกระบบเชิงลึกแบบครบถ้วนสมบูรณ์ 100%
## Ultimate Backend & RBAC Functional Specification (DrTech.Care)

คู่มือหลักในการพัฒนาโค้ด โครงสร้างฐานข้อมูล Supabase และการออกแบบสถาปัตยกรรม UI/UX สำหรับ 2 บทบาทหลัก: **ผู้อำนวยการโรงพยาบาล (Super Admin / Hospital Director)** และ **นักกายภาพบำบัด (Physiotherapist)**

---

## 🏛️ สถาปัตยกรรมข้อมูลกลาง (Shared Single Source of Truth - SSOT)

ระบบ DrTech.Care ยึดหลัก **Single Source of Truth** โดยใช้ฐานข้อมูล **Supabase PostgreSQL** ทำงานร่วมกับ **Zustand State Store** ([`hospitalStore.ts`](file:///c:/Users/Devops/Desktop/Dr%20Tech%20care/Dr%20Tech%20care/frontend/src/store/hospitalStore.ts)):

1. **Zero Redundancy**: ข้อมูลที่ถูกป้อนหรือแก้ไขในโมดูลใด จะส่งผ่าน (Propagate) ไปยังโมดูลที่เกี่ยวข้องอัตโนมัติแบบ Real-time CDC (Change Data Capture)
2. **Defaulting to `"-"`**: ฟิลด์ทางเลือกใดที่ไม่มีการระบุข้อมูล จะถูกบันทึกและแสดงผลเป็น `"-"` เสมอ ผ่านฟังก์ชัน [`defaultDash()`](file:///c:/Users/Devops/Desktop/Dr%20Tech%20care/Dr%20Tech%20care/frontend/src/utils/dashboardUtils.ts)
3. **Super Admin Governance Override**: สิทธิ์ Super Admin มีอำนาจสูงสุดในการ Override ข้อมูลทุกรายการในระบบ รวมถึงการควบคุมเซสชันและความปลอดภัยระดับ IP/เครื่อง

---

## 👑 ส่วนที่ 1: บทบาทผู้ดูแลระบบสูงสุด / ผู้อำนวยการโรงพยาบาล (Super Admin / Hospital Director)

**ขอบเขตสิทธิ์:** ควบคุมและจัดการระบบได้ทั้งหมด 100% ทุกโมดูล (Full Access / Unrestricted CRUD) มีอำนาจสูงสุดในการจัดการผู้ใช้ โครงสร้างข้อมูล และความปลอดภัย

```
[Super Admin Dashboard: 6 โมดูลเต็ม]
  ├── 1. จัดการบัญชีผู้ใช้ (User Management)
  ├── 2. ข้อมูลคนไข้ทั้งหมด (All Patient Records)
  ├── 3. ตารางและกำหนดการกายภาพ (Therapy Schedule Planner)
  ├── 4. ข้อมูลนักกายภาพ (PT Directory & Governance)
  ├── 5. คลังท่ากายภาพ (Exercise & Preset Library)
  └── 6. ประวัติและความปลอดภัย (Audit Logs & Security Control)
```

### 1. 👤 โมดูลจัดการบัญชีผู้ใช้ (User Management)
* **หน้าแสดงผลหลัก (Main View):**
  * ตารางแสดงรายชื่อผู้ใช้ทุกคนในระบบ: รูปหน้า (Avatar / Face Preview), ชื่อ-นามสกุล, Username, Role Badge (`Super Admin`, `Physiotherapist`, `Patient`), Unique ID / HN (`P-xxxx`, `T-xxx`, `ADM-xx` ตรวจสอบความซ้ำซ้อนอย่างเข้มงวด), รหัสผ่านแฮช SHA-256 (`sha256_••••••••`), สถานะ Face ID (`Registered 🟢` / `Pending ⏳`), และสถานะบัญชี (`Active 🟢` / `Disabled 🔴`)
  * ช่องค้นหา (Global Search Bar) และแท็บตัวกรอง Role (`ทั้งหมด`, `คนไข้`, `นักกายภาพ`, `Super Admin`)
* **ปุ่มสั่งการหลัก:** `+ Add New User` / `+ เพิ่มผู้ใช้ใหม่` เปิด Pop-up Wizard 2 ขั้นตอน ([`AddUserModal.tsx`](file:///c:/Users/Devops/Desktop/Dr%20Tech%20care/Dr%20Tech%20care/frontend/src/components/Hospital/AddUserModal.tsx)):
  * **ขั้นตอนที่ 1 (กรอกข้อมูลบัญชีและบทบาท):**
    * เลือก Role ได้อิสระ: `Super Admin`, `Physiotherapist`, `Patient`
    * กรอกข้อมูลทั่วไป: ชื่อ-นามสกุล, Username (พร้อมปุ่มสุ่ม/สร้างอัตโนมัติ), รหัสประจำตัว (HN/Staff ID), รหัสผ่านชั่วคราว (พร้อมปุ่มเปิด/ปิดตา และปุ่มสุ่มรหัสผ่านปลอดภัย), เบอร์โทร, อีเมล
    * *หากเลือก Role = คนไข้:* เปิดฟิลด์เวชระเบียน (อายุ, เพศ, วันเริ่มรักษา, PT ผู้ดูแล ดึงจากไดเรกทอรี PT, อาการเบื้องต้น, โรคประจำตัว default `"-"`, แพ้ยา default `"-"`) ➔ ข้อมูลส่งเข้าหน้าข้อมูลคนไข้ (Module 2) อัตโนมัติ
    * *หากเลือก Role = นักกายภาพ:* เปิดฟิลด์วิชาชีพ (รหัสใบอนุญาตแพทย์, แผนก/ความเชี่ยวชาญ, ประวัติย่อ, เคสเริ่มต้น) ➔ ข้อมูลส่งเข้าหน้าไดเรกทอรี PT (Module 4) อัตโนมัติ
    * การนำทาง: `[ยกเลิก]` และ `[ถัดไป: สแกนใบหน้า Face ID ➔]`
  * **ขั้นตอนที่ 2 (ลงทะเบียนใบหน้า Biometric Face ID):**
    * กล้อง Live View พร้อมกรอบวงรี (Oval Face Guide Frame) และไฟสถานะ LED
    * ระบบแนะนำลำดับการสแกน 10 เฟรม 3 มิติ (Real-time Audio & Prompts): 1) มองตรง ➔ 2) หันซ้าย ➔ 3) หันขวา ➔ 4) ผงกศีรษะ (Liveness Check)
    * คำนวณเวกเตอร์ใบหน้า 128 มิติ (10-Snap Multi-Angle Averaged Embedding) สำหรับตู้ Kiosk ทันที
* **การจัดการบัญชีรายแถว:**
  * ปุ่ม `Edit / แก้ไขบัญชี` ([`EditUserModal.tsx`](file:///c:/Users/Devops/Desktop/Dr%20Tech%20care/Dr%20Tech%20care/frontend/src/components/Hospital/EditUserModal.tsx)): แก้ไขชื่อ, เปลี่ยน Role, รีเซ็ตรหัสผ่าน, และสวิตช์เปิด/ปิดสถานะบัญชี (`Active` / `Disabled`)
  * ปุ่ม `Biometric Reset / จัดการข้อมูลใบหน้า` ([`BiometricResetModal.tsx`](file:///c:/Users/Devops/Desktop/Dr%20Tech%20care/Dr%20Tech%20care/frontend/src/components/Hospital/BiometricResetModal.tsx)): แสดง Thumbnail เวกเตอร์เดิม พร้อมปุ่ม `[ลบข้อมูลใบหน้า]` และเปิดกล้องสแกนหน้าใหม่ 10 ช็อต

---

### 2. 📋 โมดูลข้อมูลคนไข้ทั้งหมด (All Patient Records)
* **หน้าแสดงผลหลัก:** ตารางรายชื่อคนไข้ทุกคนในโรงพยาบาล พร้อมปุ่ม `ดูและแก้ไขข้อมูล / View Profile & Dashboard`
* **รายละเอียด Pop-up** ([`EditPatientModal.tsx`](file:///c:/Users/Devops/Desktop/Dr%20Tech%20care/Dr%20Tech%20care/frontend/src/components/Hospital/EditPatientModal.tsx)):
  * **แท็บ 1 (ประวัติส่วนตัว - Editable):** แก้ไขชื่อ, อายุ, เพศ, เบอร์โทร, PT ผู้รับผิดชอบ (จัดสรรเคสใหม่ได้), อาการหลัก, โรคประจำตัว, แพ้ยา
  * **แท็บ 2 (ประวัติการรักษา - Super Admin Unrestricted Edit):** วันเริ่มรักษา (Admission Date), % พัฒนาการโดยรวม, และสิทธิ์พิเศษของ ผอ. ในการ **พิมพ์แก้ไขหรือลบประวัติบันทึกทางการแพทย์ย้อนหลังได้ทุกรายการ**
  * **แท็บ 3 (แดชบอร์ดสถิติ Kiosk - Read-Only):** กราฟสรุปจำนวนรอบ Reps ถูก/ผิด รายท่า, Accuracy Rate %, ช่วงเวลา (`1w`, `1m`, `custom`), และปฏิทินแสดงจุดความถี่การเข้าฝึกจริงจากตู้ Kiosk
* **ข้อกำหนดทางสถาปัตยกรรม:** แยกขาดจากการจัดตารางฝึก (ห้ามใส่ฟังก์ชันนัดหมายหรือแก้ไขรูทีนในโมดูลนี้)

---

### 3. 📅 โมดูลตารางและกำหนดการกายภาพ (Therapy Schedule Planner)
* **หน้าแสดงผลหลัก:** ปฏิทินและตาราง Timetable รวมของโรงพยาบาล แบ่งตามสถานี/ตู้ Kiosk (`ตู้ Kiosk 1`, `ตู้ Kiosk 2`, `ตู้ Kiosk 3`, `เตียงฝึก 1`) และเวลา
* **การจัดการนัดหมาย:**
  * คลิกคนไข้เพื่อเปิด Pop-up **ปฏิทินส่วนบุคคล** ([`PatientCalendarModal.tsx`](file:///c:/Users/Devops/Desktop/Dr%20Tech%20care/Dr%20Tech%20care/frontend/src/components/Hospital/PatientCalendarModal.tsx)): แสดงจุดสีสถานะ เขียว (ฝึกเสร็จ), น้ำเงิน (มีนัด), แดง (ขาดนัด/เลื่อนอัตโนมัติ) เพิ่ม/เลื่อน/ลบวันนัดได้อิสระ
  * คลิกวันที่บนปฏิทินเพื่อเปิด Pop-up **กำหนดแผนฝึกประจำวัน** ([`DailyRoutineAssignmentModal.tsx`](file:///c:/Users/Devops/Desktop/Dr%20Tech%20care/Dr%20Tech%20care/frontend/src/components/Hospital/DailyRoutineAssignmentModal.tsx)): เลือกท่าฝึก/มินิเกมจากคลัง, ตั้ง Reps, Sets, เวลาพัก, และคำแนะนำแพทย์
* **ระบบ Auto-Reschedule:** ระบบตรวจสอบพื้นหลังอัตโนมัติ หากคนไข้ไม่มาสแกนหน้าเข้าตู้ตามวันที่นัด ➔ บันทึกสถานะ "ขาดการรักษา (Missed Session)" พร้อมเลื่อนวันนัดและยกยอดตารางฝึกไปวันถัดไปให้อัตโนมัติ

---

### 4. 🩺 โมดูลข้อมูลนักกายภาพ (PT Directory)
* **หน้าแสดงผลหลัก:** การ์ดหรือตารางแสดงนักกายภาพบำบัดทุกคน พร้อมเลขที่ใบอนุญาต (`กภ. xxxxx`), แผนก, เบอร์โทร, อีเมล, และจำนวนเคสที่ดูแล
* **การจัดการข้อมูล:**
  * ปุ่ม `Edit Details / แก้ไขข้อมูลนักกายภาพ` ([`EditTherapistModal.tsx`](file:///c:/Users/Devops/Desktop/Dr%20Tech%20care/Dr%20Tech%20care/frontend/src/components/Hospital/EditTherapistModal.tsx)): อัปเดตรูป, เบอร์โทร, อีเมล, รหัสใบแพทย์, แผนก/ความเชี่ยวชาญ, ประวัติย่อ
  * ปุ่ม `Assigned Patients / เคสในดูแล` ([`PtAssignedPatientsModal.tsx`](file:///c:/Users/Devops/Desktop/Dr%20Tech%20care/Dr%20Tech%20care/frontend/src/components/Hospital/PtAssignedPatientsModal.tsx)): แสดงรายชื่อคนไข้ในความดูแล พร้อม Dropdown **โอนย้ายเคส (Transfer Case)** ไปให้ PT ท่านอื่นดูแลแทนได้ทันที
  * **การกำกับดูแลการฝากเคส (Delegation Oversight):** ผอ. มีแผงตรวจสอบรายการฝากเคสชั่วคราวทั้งหมดของโรงพยาบาล พร้อมปุ่มยกเลิกหรือดึงเคสกลับได้ทันที

---

### 5. 🏋️ โมดูลคลังท่ากายภาพ (Exercise & Preset Library)
* **หน้าแสดงผลหลัก:** แท็บสลับระหว่าง "ท่าฝึกเดี่ยว (Single Exercises)" และ "ชุดโปรแกรมประจำวัน (Modpacks / Presets)"
* **การจัดการข้อมูล** ([`AddExerciseModal.tsx`](file:///c:/Users/Devops/Desktop/Dr%20Tech%20care/Dr%20Tech%20care/frontend/src/components/Hospital/AddExerciseModal.tsx), [`EditExerciseModal.tsx`](file:///c:/Users/Devops/Desktop/Dr%20Tech%20care/Dr%20Tech%20care/frontend/src/components/Hospital/EditExerciseModal.tsx)):
  * กรอกชื่อท่า (ไทย/อังกฤษ), หมวดหมู่, ชนิด (เดี่ยว/ชุด), มุมเป้าหมายชีวกลศาสตร์ (Min/Max Angle), Reps, Sets, เวลาค้างท่า (Hold Seconds), ขั้นตอนการฝึก, ประโยชน์, ข้อห้าม, ข้อควรระวัง, และอัปโหลดรูปภาพ PNG/JPG หรือวิดีโอ MP4
  * **สิทธิ์:** ผอ. มีสิทธิ์ **สร้าง, แก้ไข, และลบท่าฝึกหรือชุดโปรแกรมทุกรายการในระบบ (Full Unrestricted CRUD)**

---

### 6. 🔒 โมดูลประวัติการเข้าใช้งานและความปลอดภัย (Audit Logs & Security Control)
* **หน้าแสดงผลหลัก:** ตารางบันทึก Security Audit Trail (Timestamp, Username/Role/ID, IP Address, Device/OS Type แยก Desktop/Kiosk, Action Performed, และ Security Status `Normal` / `Suspicious`)
* **การควบคุมความปลอดภัย** ([`SecurityControlModal.tsx`](file:///c:/Users/Devops/Desktop/Dr%20Tech%20care/Dr%20Tech%20care/frontend/src/components/Hospital/SecurityControlModal.tsx), [`BannedManagementModal.tsx`](file:///c:/Users/Devops/Desktop/Dr%20Tech%20care/Dr%20Tech%20care/frontend/src/components/Hospital/BannedManagementModal.tsx)):
  * ปุ่ม `Force Logout (เตะออก)`: สั่งตัดเซสชันและบังคับออกจากระบบทันที
  * สวิตช์ Toggle `Ban IP / Unban IP`: บล็อกหรือปลดล็อกการเข้าใช้งานตามหมายเลข IP Address
  * ฟังก์ชัน `Ban Device`: แบนเครื่องตาม Device Fingerprint ทันทีเมื่อตรวจพบพฤติกรรมผิดปกติ

---

## 🩺 ส่วนที่ 2: บทบาทนักกายภาพบำบัด (Physiotherapist)

**ขอบเขตสิทธิ์:** เน้นการดูแลคนไข้เชิงคลินิก สิทธิ์จัดการบัญชีจำกัดเฉพาะคนไข้ สิทธิ์ตารางนัดจำกัดเฉพาะเคสตนเองและเคสรับฝาก และมีระบบความปลอดภัยพิเศษป้องกันการทับซ้อนของข้อมูล

```
[Physiotherapist Dashboard: 4 โมดูลคลินิกที่ได้รับอนุญาต]
  ├── 1. จัดการผู้ใช้งาน (User Management - คนไข้เท่านั้น)
  ├── 2. ข้อมูลคนไข้ทั้งหมด (All Patient Records - โน้ตแบบต่อท้ายถาวร)
  ├── 3. ตารางฝึกกายภาพ (Schedule Planner - สิทธิ์ตามเคส & เคสรับฝาก)
  ├── 4. ข้อมูลส่วนตัว & เคสในดูแล (PT Workspace & Case Delegation)
  ├── 5. ท่าทางกายภาพ (Exercise Library - สิทธิ์ตามความเป็นเจ้าของ)
  └── 6. ประวัติ & ตั้งค่า ⛔ (Strictly Hidden / 403 Forbidden)
```

### 1. 👤 โมดูลจัดการบัญชีผู้ใช้ (User Management - จำกัดสิทธิ์เฉพาะคนไข้)
* **หน้าแสดงผลหลัก:** ตารางแสดงรายชื่อผู้ใช้ทั้งหมดในระบบเพื่อความสะดวกในการตรวจสอบ
* **การจำกัดสิทธิ์ปุ่มสั่งการ (Permission Constraints):**
  * ปุ่มหลักบนแถบ: แสดงข้อความ **`+ เพิ่มบัญชีคนไข้ใหม่ (+ Add New Patient)`** (**ล็อก Role เป็น "Patient" ถาวร** พร้อมป้ายแจ้งเตือนสีเขียว ไม่อนุญาตให้เลือกสร้าง PT หรือ ผอ. ได้)
  * **แถบบัญชีคนไข้ (Role = Patient):** ปุ่ม `แก้ไขบัญชี`, `เปลี่ยนรหัสผ่าน`, และ `จัดการข้อมูลใบหน้า` กดใช้งานได้ปกติ
  * **แถบบัญชี PT ท่านอื่น หรือ ผอ.รพ.:** ปุ่มแก้ไขจะถูกแสดงเป็น **`🔒 Read-Only`** ไม่สามารถแก้ไขหรือรีเซ็ตรหัสผ่านได้
* **Pop-up A (`+ เพิ่มบัญชีคนไข้ใหม่`):**
  * ขั้นตอนที่ 1 กรอกข้อมูลส่วนตัวและเวชระเบียนคนไข้ ➔ ซิงค์เข้าหน้าข้อมูลคนไข้ (Module 2) อัตโนมัติ
  * ขั้นตอนที่ 2 สแกนใบหน้า Face ID 10 เฟรม 3 มิติ สำหรับใช้ล็อกอินหน้าตู้ Kiosk

---

### 2. 📋 โมดูลข้อมูลคนไข้ทั้งหมด (All Patient Records - ระบบโน้ตแบบต่อท้าย)
* **หน้าแสดงผลหลัก:** ตารางรายชื่อคนไข้ทุกคน + ปุ่ม `ดูและแก้ไขข้อมูล / View Profile & Dashboard` (PT สามารถเปิดดูโปรไฟล์คนไข้ได้ทุกคนในโรงพยาบาล)
* **รายละเอียด Pop-up:**
  * **แท็บ 1 (ประวัติส่วนตัว - Editable):** แก้ไขข้อมูลพื้นฐาน, อาการ, โรคประจำตัว, แพ้ยา ได้
  * 🌟 **แท็บ 2 (ประวัติการรักษา - Append-Only Notes):**
    * *กฎเหล็กความปลอดภัย:* **ห้ามแก้ไขหรือลบข้อความโน้ตเก่าเด็ดขาด** (ไม่มีปุ่มแก้ไข/ลบ สำหรับ PT)
    * วิธีใช้งาน: พิมพ์โน้ตใหม่ในกล่องข้อความ แล้วกดปุ่ม `+ เพิ่มบันทึกความก้าวหน้า (Append Medical Note)`
    * ระบบจะประทับตราเวลาและผู้บันทึกอัตโนมัติในรูปแบบ:
      ```text
      [DD/MM/YYYY HH:mm - Logged by PT: กภ. ธนากร วงศ์สวัสดิ์] <ข้อความบันทึก>
      ```
  * **แท็บ 3 (แดชบอร์ดสถิติ Kiosk - Read-Only):** ดึงกราฟผลการฝึกซ้อม, ความแม่นยำ %, และความถี่การเข้าฝึกจริงจากตู้ Kiosk มาแสดงผล

---

### 3. 📅 โมดูลตารางและกำหนดการกายภาพ (Therapy Schedule Planner - สิทธิ์ตามเคสและเคสรับฝาก)
* **หน้าแสดงผลหลัก:** แถบตัวกรองการแสดงผล (Filter Bar):
  * `[คนไข้ของฉัน (My Patients)]` [ค่าเริ่มต้น Default]
  * `[เคสรับฝากชั่วคราว (Temporary Covered Cases)]`
  * `[คนไข้ทั้งหมด (All Patients)]`
* **สิทธิ์การจัดการตารางฝึก:**
  * **เคสของตนเอง & เคสรับฝากชั่วคราว:** มี **สิทธิ์เขียนเต็มรูปแบบ (Full Write Access)** สามารถเพิ่มวันนัด, เลื่อนวันนัด, และกำหนดแผนฝึกประจำวัน (เลือกท่าฝึก, ตั้ง Reps, Sets, เวลาพัก, คำแนะนำ) ส่งตรงไปตู้ Kiosk
  * **เคสของ PT ท่านอื่น (ที่ไม่ได้ฝากไว้):** แสดงผลแบบ **Read-Only** (สามารถกดดูปฏิทินและแผนฝึกได้ แต่ปุ่มเพิ่ม/แก้/ลบ จะถูกปิดใช้งานพร้อมแจ้งเตือนสิทธิ์)
* **ระบบ Auto-Reschedule:** ทำงานอัตโนมัติ เลื่อนนัดและยกยอดตารางฝึกไปวันถัดไปเมื่อคนไข้ขาดนัด

---

### 4. 🩺 โมดูลข้อมูลส่วนตัวและเคสในดูแล (PT Workspace & Case Management)
> *โมดูลนี้ปรับเปลี่ยนจาก PT Directory ของ ผอ. ให้กลายเป็น "แดชบอร์ดการทำงานส่วนบุคคลของนักกายภาพ"*

* **ส่วนที่ 1: การ์ดโปรไฟล์ส่วนตัว (My Profile Card):**
  * แสดงรูปโปรไฟล์, ชื่อ-นามสกุล, รหัสใบแพทย์ (Read-Only e.g., `กภ. 12458`), แผนก/ความเชี่ยวชาญ (Read-Only), เบอร์โทร, อีเมล, ประวัติย่อ
  * ปุ่ม `แก้ไขโปรไฟล์ส่วนตัว` ([`EditMyProfileModal.tsx`](file:///c:/Users/Devops/Desktop/Dr%20Tech%20care/Dr%20Tech%20care/frontend/src/components/Hospital/EditMyProfileModal.tsx)): อัปโหลดรูปใหม่, แก้ไขเบอร์โทร, อีเมล, และประวัติย่อของตนเองได้
* **ส่วนที่ 2: แดชบอร์ดเคสในดูแลและการฝากเคส (My Cases & Delegation):**
  * การ์ดสรุปจำนวนเคสในความดูแลหลัก
  * 🌟 **ปุ่ม `+ ฝากเคสชั่วคราว (Assign Temporary Coverage)`:**
    * เปิด Pop-up ([`TemporaryCaseDelegationModal.tsx`](file:///c:/Users/Devops/Desktop/Dr%20Tech%20care/Dr%20Tech%20care/frontend/src/components/Hospital/TemporaryCaseDelegationModal.tsx)) ➔ เลือกคนไข้ในดูแล ➔ เลือก PT ผู้รับฝาก ➔ กำหนดช่วงวันที่เริ่มต้นและสิ้นสุด ➔ บันทึก
    * *ผลลัพธ์ในระบบ:* มอบสิทธิ์ชั่วคราวให้ PT ผู้รับฝากสามารถเข้ามาจัดตารางฝึกให้คนไข้รายนี้ใน Module 3 ได้ตามช่วงเวลาที่กำหนด (ผอ. จะเห็นป้าย "Covering" บนแดชบอร์ด และสามารถกดเพิกถอนได้ตลอดเวลา)
  * ตารางรายชื่อคนไข้ในดูแล พร้อมปุ่มทางลัด: `จัดแผนฝึก/วันนัด` (เปิด Module 3) และ `ดูประวัติการรักษา` (เปิด Module 2)

---

### 5. 🏋️ โมดูลคลังท่ากายภาพ (Exercise Library - สิทธิ์ตามความเป็นเจ้าของ)
* **หน้าแสดงผลหลัก:** แท็บสลับระหว่าง "ท่าฝึกเดี่ยว" และ "ชุดโปรแกรมประจำวัน"
* 🌟 **กฎการจำกัดสิทธิ์ความเป็นเจ้าของ (Ownership & Permission Rules):**
  * 🛡️ **ท่าฝึกมาตรฐาน / ท่าที่ ผอ.รพ. สร้างไว้:** PT ทุกคนมีสิทธิ์เป็น **Read-Only** แสดงป้าย `🔒 มาตรฐาน รพ. (Read-Only)` (สามารถกดดูรายละเอียดและดึงไปจัดตารางฝึกให้คนไข้ได้ แต่ **ปุ่มแก้ไขและปุ่มลบจะถูกซ่อน**)
  * ✏️ **ท่าฝึกที่ PT สร้างขึ้นเอง:** PT มีสิทธิ์ **CRUD เต็มรูปแบบ** สามารถกด `แก้ไข` หรือ `ลบ` ได้เฉพาะท่าฝึกหรือชุดโปรแกรมที่ตนเองเป็นผู้สร้างขึ้นมาเท่านั้น
* **Pop-up เพิ่ม/แก้ไขท่า:** ฟิลด์ `ผู้สร้าง (Created By)` ล็อกค่าเป็นชื่อนักกายภาพที่กำลังล็อกอินอยู่โดยอัตโนมัติ

---

### 6. 🔒 โมดูลประวัติการเข้าใช้งานและความปลอดภัย (Audit Logs & Security Control)
* **ระดับการมองเห็น:** **ซ่อนเมนูนี้ออกจาก Sidebar / Navigation Bar ของนักกายภาพโดยสิ้นเชิง**
* **ระบบความปลอดภัย (Security Gate):** หากมีความพยายามเข้าถึงผ่าน URL ตรง ระบบจะตรวจจับและสั่ง Redirect กลับมายังหน้า PT Workspace ทันที (403 Forbidden Protection)

---

## 📊 ตารางสรุปเปรียบเทียบสิทธิ์ (RBAC Matrix)

| ฟังก์ชันการทำงาน (Functionality) | ผู้อำนวยการ รพ. (Super Admin) | นักกายภาพบำบัด (Physiotherapist) |
|---|:---:|:---:|
| **สร้างบัญชีผู้ใช้ใหม่ (User Creation)** | ทุก Role (ผอ., PT, คนไข้) | **เฉพาะคนไข้ (Patient) เท่านั้น** |
| **แก้ไข/รีเซ็ตรหัสผ่านบัญชีคนอื่น** | แก้ไขได้ทุกคน | **เฉพาะคนไข้เท่านั้น** (ล็อกสิทธิ์เพื่อนร่วมงานและผอ.) |
| **สแกนใบหน้าชีวมิติ (Face Biometrics)** | คนไข้และเจ้าหน้าที่ทุกคน | **เฉพาะคนไข้** |
| **ดูประวัติเวชระเบียนคนไข้ทั้งหมด** | ดูได้ทุกคน | ดูได้ทุกคน |
| **แก้ไขข้อมูลเวชระเบียนพื้นฐาน** | แก้ไขได้ทุกคน | แก้ไขได้ทุกคน |
| **แก้ไขโน้ตการรักษาย้อนหลัง (History Notes)** | **มีสิทธิ์แก้ไข/ลบ ย้อนหลังได้** | ⛔ **ห้ามแก้ไขโน้ตเดิมเด็ดขาด** (Append-Only) |
| **จัดตารางนัดหมาย & รูทีนกายภาพ** | ทุกคนในโรงพยาบาล | **เฉพาะเคสตนเอง & เคสที่ได้รับฝากชั่วคราว** |
| **ฝากเคสคนไข้ให้เพื่อนร่วมงานดูแลแทน** | อนุมัติ / เพิกถอน ได้ทุกเคส | **ฝากได้เฉพาะเคสที่ตนเองดูแลหลัก** |
| **โอนย้ายเคสคนไข้ถาวร (Transfer Case)** | โอนย้ายได้ทุกเคส | — |
| **แก้ไขข้อมูลโปรไฟล์นักกายภาพ** | แก้ไขได้ทุกคน | **แก้ไขได้เฉพาะโปรไฟล์ของตนเอง** |
| **แก้ไข/ลบท่ากายภาพมาตรฐานของ รพ.** | **แก้ไข/ลบ ได้ทุกท่า** | ⛔ **Read-Only** (ดึงไปใช้ได้ แต่แก้/ลบไม่ได้) |
| **แก้ไข/ลบท่ากายภาพที่ตนเองสร้าง** | ทำได้ | **ทำได้** (Full CRUD ท่าตนเอง) |
| **ดู Security Audit Logs & เตะเซสชัน** | **ทำได้เต็มรูปแบบ** | ⛔ **ซ่อนเมนูเด็ดขาด (403)** |
| **แบน IP และแบนเครื่อง (Hardware ID)** | **ทำได้เต็มรูปแบบ** | ⛔ **ซ่อนเมนูเด็ดขาด (403)** |

---

## 🌐 บัญชีสำหรับทดสอบระบบ (Test Credentials)

| บทบาท (Role) | บัญชี (Username) | รหัสผ่าน (Password / PIN) | การแสดงผลในระบบ |
|---|---|---|---|
| **ผู้อำนวยการ / แอดมินใหญ่ (Admin)** | `admin` | `1234` | ครบ 6 เมนูหลัก: สิทธิ์สูงสุด Unrestricted CRUD ทุกโมดูล |
| **นักกายภาพบำบัด 1 (PT 1)** | `pt_thanakorn` | `1234` | กภ. ธนากร เจริญสุข — ดูแลเคสหลัก 14 คน, ฝากเคสชั่วคราว, บันทึก Append-only |
| **นักกายภาพบำบัด 2 (PT 2)** | `pt_pimchanok` | `1234` | กภ. พิมพ์ชนก สิทธิสาร — ดูแลเคสหลัก 18 คน, รับเคสฝากชั่วคราว, แก้ไขโปรไฟล์ตนเอง |
| **คนไข้หน้าตู้ Kiosk** | สแกนใบหน้า หรือ HN | `1234` | โหมดกายภาพตรวจจับชีวกลศาสตร์ และโหมดมินิเกมตอบคำถาม |

* **Live Demo Website (GitHub Pages)**: [https://krongrach80-ui.github.io/Dr.Tech.Care/](https://krongrach80-ui.github.io/Dr.Tech.Care/)
* **GitHub Repository**: [https://github.com/krongrach80-ui/Dr.Tech.Care](https://github.com/krongrach80-ui/Dr.Tech.Care)

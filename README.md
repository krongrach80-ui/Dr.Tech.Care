# Dr.Tech.Care

## AI-assisted Rehabilitation Monitoring Platform
### ระบบช่วยติดตามและวิเคราะห์การฝึกกายภาพด้วย AI
**“เพื่อการฝึกที่ปลอดภัย เหมาะสมกับผู้ใช้แต่ละราย และคำนึงถึงความเป็นส่วนตัว”**

- 🌐 **ทดลองใช้งานจริงออนไลน์ (Live Demo)**: [https://krongrach80-ui.github.io/Strong-Care/](https://krongrach80-ui.github.io/Strong-Care/)
- 📖 **เอกสารเกี่ยวกับระบบ (About)**: [ABOUT.md](ABOUT.md)

> **Master Pitch:**
> “Dr.Tech.Care — แพลตฟอร์ม AI ช่วยติดตามและวิเคราะห์การฝึกกายภาพ เพื่อการฝึกที่ปลอดภัย เหมาะสมกับผู้ใช้แต่ละราย และคำนึงถึงความเป็นส่วนตัว”
> 
> “Dr.Tech.Care is an AI-assisted rehabilitation monitoring platform that combines facial identity verification, liveness detection, pose and biomechanical analysis, real-time safety monitoring, adaptive recommendations, and human approval within a privacy-conscious offline-first architecture.”

### 🌟 ฟีเจอร์เด่นใหม่ (Production-Ready Architecture):
1. **Single Primary Entrance & Senior Mode Default ON**: ซ่อนปุ่มสลับภาพและปุ่มเดโมใน Production Mode (เปิดดูด้วย `?demo=1`) พร้อมเปิดโหมดผู้สูงอายุเป็นค่าเริ่มต้น (ปุ่มสัมผัสขนาดใหญ่ $\ge 48$px ตัวอักษรคมชัด คอนทราสต์สูง ลดการกระตุ้นประสาทตา)
2. **Vertical Fullscreen Smart-Mirror**: กล้องแนวตั้งเต็มจอสไตล์ Smart Rehab Mirror แบบ Zero-Scroll ขอสิทธิ์และเปิดกล้องอัตโนมัติทันที
3. **Picture-in-Picture (PiP) Doctor Demo Video**: วิดีโอคุณหมอสาธิต (นพ. กฤติณห์ / DeDoctor) ฝังเป็น PiP ในกล้อง สลับมุมซ้าย-ขวาได้ ไม่บังสเกเลตันตรวจจับ
4. **11 Clinical Stretch Programs Library**: คลังโปรแกรมยืดเหยียด 11 ท่าตามหลักกายภาพ พร้อมระบบปรับเวลาค้างท่าอิสระ (10-60 วินาที) ก่อนเริ่มฝึก
5. **Tangible Safety Watchdog & Manual Emergency Stop**: ตรวจจับมุมข้อต่อผิดรูปและ Compensations พร้อมเสียงแจ้งเตือนภาษาไทย (SpeechSynthesis/Web Audio) และปุ่ม `🛑 หยุดฉุกเฉิน` ที่บันทึกเหตุการณ์ลง IndexedDB ทันที
6. **Therapist Approval Gate (Human-in-the-Loop)**: ปัญญาประดิษฐ์เสนอแนะการปรับโปรแกรมหลังจบเซสชัน แต่ต้องผ่านการอนุมัติ (Approve / Adjust / Reject) โดยนักกายภาพบำบัดใน Hospital Portal เท่านั้น
7. **Offline-First Resilience**: ใช้งานบน GitHub Pages ได้สมบูรณ์ 100% โดยบันทึกลง IndexedDB (`StrongCareDB`) และจัดเข้าคิวซิงก์อัตโนมัติเมื่อออนไลน์

---

## 1. CORE PRINCIPLE: HUMAN-IN-THE-LOOP CLINICAL GOVERNANCE

```text
AI วิเคราะห์ (Pose & Biomechanics)
     ↓
AI เสนอ (Adaptive Recommendation)
     ↓
มนุษย์ตรวจสอบ (Therapist / Caregiver Review)
     ↓
มนุษย์อนุมัติ (Approval Gate: อนุมัติ / ปรับแก้ / ปฏิเสธ)
     ↓
ระบบจึงเปลี่ยนแผน (Updated Configuration & Audit Trail)
```

> **ข้อกำหนดเด็ดขาด:** ห้าม AI เปลี่ยนแปลง Prescription เองโดยตรงเด็ดขาด! ทุกการปรับระดับต้องผ่าน Therapist / Caregiver Approval Gate เท่านั้น

---

## 2. MASTER ARCHITECTURE

```text
                         STRONG CARE
               AI-assisted Rehabilitation
                  Monitoring Platform
                              │
            ┌─────────────────┴─────────────────┐
            │                                   │
        IDENTIFY                             VERIFY
     Face Recognition                    Liveness Detection
     128-D Embedding                       EAR / Head Turn
            │                                   │
            └─────────────────┬─────────────────┘
                              ▼
                         CALIBRATE
                   5-Point Readiness Engine
              Light / Distance / Body / Stability
                              │
                              ▼
                           ANALYZE
                 Pose AI + Biomechanics Engine
                              │
                ┌─────────────┴─────────────┐
                ▼                           ▼
             PROTECT                    EXERCISE
          Safety Engine                Rep / ROM
                │                           │
                └─────────────┬─────────────┘
                              ▼
                           IMPROVE
                       Progress Tracking
                   ΔReps / ΔROM / ΔAccuracy
                              │
                              ▼
                            ADAPT
                      AI Recommendation
                              │
                              ▼
                           APPROVE
                  Therapist / Caregiver Gate
                              │
                              ▼
                         NEW CONFIG
                    Updated Exercise Plan
                              │
                              ▼
                 IndexedDB / Sync Queue (StrongCareDB)
                              │
                              ▼
                    PHP REST API / MySQL (SQLite Fallback)
```

---

## 3. สถาปัตยกรรม 4 จอหลักของตู้ KIOSK และพอร์ทัลโรงพยาบาล

ระบบ Strong Care แบ่งการทำงานเป็น 2 ส่วนหลัก: **ตู้ Kiosk สำหรับคนไข้ (4 จอ)** และ **Hospital Management Portal สำหรับบุคลากรทางการแพทย์**

### 1. หน้าจอหลักของตู้ (Kiosk 4-Screen Flow)
1. **Screen 1: หน้าแรก (Home)**
   - นาฬิกาไทยเรียลไทม์ พร้อมวันเดือนปี พ.ศ. สำหรับผู้สูงอายุ
   - ทางเข้าคนไข้หลักทางเดียว (Single Primary Entrance)
   - ข้อมูลนวัตกรรมระบบ (About Modal) และทางเข้าบุคลากรโรงพยาบาล
2. **Screen 2: เข้าสู่ระบบ (Identity & Authentication)**
   - เลือกโปรไฟล์ผู้ป่วยและยืนยันตัวตนด้วยรหัส PIN (หรือระบบสแกนใบหน้าชีวมิติ AI)
   - ระบบต้อนรับ & ลงทะเบียนคนไข้ใหม่ (Reception Onboarding 2 ขั้นตอน: กรอกประวัติคนไข้ ➔ สแกนใบหน้า 128-D Feature Extraction)
3. **Screen 3: เมนูผู้ใช้ & ตั้งค่าโปรแกรม (User Menu & Config)**
   - แสดงข้อมูลผู้ป่วยและแผนการฟื้นฟูเฉพาะบุคคลแบบไดนามิก
   - เมนูเลือกทำกายภาพ (Physical Therapy), มินิเกมกายภาพ (Gamified Rehab Challenge), หรือปรับแต่งเวลาค้างท่าและเลือกท่าฝึก
4. **Screen 4: หน้าฝึกกายภาพ (Smart Mirror Exercise & AI Engine)**
   - Fullscreen Vertical Smart Rehab Mirror ล็อกจอ Zero-Scroll กล้องเปิดทำงานอัตโนมัติ
   - Picture-in-Picture (PiP) คลิปวิดีโอคุณหมอสาธิต (Dr. Fame) ฝังในหน้าจอกล้องโดยตรง สลับมุมซ้าย-ขวาได้ ไม่บังการเคลื่อนไหว
   - Real-Time MediaPipe Skeleton Tracker + Safety Engine เฝ้าระวังมุมหัก/การบาดเจ็บพร้อมเสียงเตือนภาษาไทย
   - ปุ่มส่งผลการฝึกให้นักกายภาพบำบัด (Clinical Report Submission)

### 2. ระบบบริหารจัดการโรงพยาบาล (Hospital Management Portal)
- ป้องกันด้วย **Staff Security Gate** (PIN บุคลากร พร้อม Demo Quick-Pass `1234` สำหรับการนำเสนอ)
- **Role-Based Access Control (RBAC)**: ผู้อำนวยการโรงพยาบาล (Admin), นักกายภาพบำบัด (Physical Therapist), คนไข้ (Patient)
- **10 โมดูลบริหารการแพทย์**: ภาพรวมระบบ, จัดการผู้ใช้งาน, ข้อมูลคนไข้, ข้อมูลนักกายภาพ, เคสและแผนการรักษา (Prescriptions), คลังท่ากายภาพ, ผลการรักษา & AI วิเคราะห์, บันทึกการใช้งาน (Audit Trail), สถานะอุปกรณ์ตู้ Kiosk, และตั้งค่าความปลอดภัย AI

---

## 4. TECHNOLOGY STACK

- **Frontend**: React 18, TypeScript 5, Vite 5, Tailwind CSS, Zustand, Recharts, Lucide Icons
- **Edge AI & Computer Vision**: MediaPipe Pose Landmarker, MediaPipe Face Mesh, WebAssembly (WASM), Web Audio API, Client-Side Biomechanics Algorithms
- **Backend API**: PHP 8.2 (REST API, PDO, MVC Controllers, JSON Output, CORS Middleware)
- **Database**: MySQL / MariaDB (XAMPP) พร้อม SQLite 3 Fallback อัตโนมัติ (รับประกัน 100% Uptime)
- **Local Storage**: IndexedDB (`StrongCareDB`), Offline FIFO Sync Queue
- **Design System**: Palette (#1E8A4C Primary, #6FD67F Mint, #0B2B2B Dark Green, #F4FBF7 Light Bg), Noto Sans Thai + Inter

---

## 5. REST API ENDPOINTS

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | ตรวจสอบสถานะเซิร์ฟเวอร์และไดรเวอร์ฐานข้อมูล (MySQL/SQLite) |
| `POST` | `/api/auth/enroll` | ลงทะเบียนเวกเตอร์ใบหน้า 128-D แบบเข้ารหัส (ไม่มีภาพดิบ) |
| `POST` | `/api/auth/face-login` | เข้าสู่ระบบด้วยใบหน้าผ่านการคำนวณ Cosine Similarity |
| `POST` | `/api/auth/logout` | ออกจากระบบ |
| `GET` | `/api/patients` | รายชื่อผู้ป่วยทั้งหมดในการดูแล |
| `GET` | `/api/patients/{id}` | ข้อมูลรายละเอียดของผู้ป่วย |
| `GET` | `/api/patients/{id}/history` | ประวัติการฝึกกายภาพทั้งหมดของผู้ป่วย |
| `GET` | `/api/exercises` | โปรแกรมท่ากายภาพบำบัดทั้งหมด |
| `GET` | `/api/exercises/{id}` | รายละเอียดท่าและการตั้งค่าองศาความปลอดภัย |
| `POST` | `/api/sessions` | บันทึกผลการฝึกเซสชันใหม่ พร้อมผลรายรอบและเหตุการณ์ความปลอดภัย |
| `POST` | `/api/sessions/{id}/results` | บันทึกผลลัพธ์ราย Repetition (Rep-by-Rep Trail) |
| `POST` | `/api/sessions/{id}/safety-events` | บันทึกเหตุการณ์หยุดฉุกเฉินและคำเตือนทางการแพทย์ |
| `GET` | `/api/reports/{id}` | ข้อมูลรายงานสรุปทางการแพทย์ (Clinical Session Audit) |
| `GET` | `/api/adaptive/recommendations/{id}` | ดึงคำแนะนำการปรับระดับของ AI สำหรับผู้ป่วย |
| `POST` | `/api/adaptive/approval` | บันทึกการอนุมัติ/ปรับแก้แผนของนักกายภาพบำบัด (Clinical Audit Trail) |
| `POST` | `/api/sync` | ซิงค์ข้อมูลจาก IndexedDB Offline Queue เข้าสู่เซิร์ฟเวอร์ |

---

## 6. QUICK START & RUNNING LOCALLY

### 1. วิธีเริ่มระบบด้วย Batch File (คลิกเดียว)

รันไฟล์ `run_strongcare.bat` ในโฟลเดอร์โปรเจกต์:
```cmd
run_strongcare.bat
```
ระบบจะเปิด:
- **Backend API**: `http://127.0.0.1:8000/api`
- **Frontend App**: `http://127.0.0.1:5173`

### 2. รันด้วยตนเองผ่าน Command Line

**เปิด PHP Backend:**
```powershell
php -S 127.0.0.1:8000 -t StrongCare/backend StrongCare/backend/index.php
```

**เปิด Frontend Vite:**
```powershell
cd StrongCare/frontend
npm run dev
```

---

## 7. COMPETITION DEMO RUNBOOK (3-5 MINUTES)

1. **① KIOSK START (00:00 - 00:20)**: แสดงหน้าแรกตู้ Kiosk นาฬิกาไทยเรียลไทม์ กดปุ่ม **"เริ่มต้นการใช้งานตู้"**
2. **② IDENTITY & RECEPTION (00:20 - 01:00)**: แสดงการเข้าสู่ระบบแบบ Senior-Friendly โชว์ฟังก์ชัน **"ลงทะเบียนคนไข้ใหม่ (Reception Onboarding)"** กรอกข้อมูลคนไข้แล้วสแกนใบหน้า 128-D Biometric Extraction
3. **③ PATIENT PROFILE & CONFIG (01:00 - 01:40)**: เข้าสู่หน้าเมนูผู้ใช้ แสดงโรค/อาการเฉพาะบุคคล เลือกระหว่างการฝึกกายภาพทั่วไป หรือ **"เริ่มกายภาพแบบมินิเกม"**
4. **④ SMART MIRROR EXERCISE (01:40 - 02:40)**: กล้องเปิดอัตโนมัติ แสดง PiP วิดีโอคุณหมอสาธิต AI วัดมุมข้อต่อแบบเรียลไทม์ พร้อม Live Accuracy และคำแนะนำความปลอดภัย
5. **⑤ CLINICAL REPORT (02:40 - 03:10)**: กดปุ่ม **"ส่งผลให้นักกายภาพ"** แสดงโมดอลสรุปผลและส่งข้อมูลเข้าฐานข้อมูลคลินิก
6. **⑥ HOSPITAL PORTAL (03:10 - 04:30)**: เข้าสู่ **"ระบบบุคลากร / รพ."** ผ่าน Staff Security Gate โชว์ระบบจัดการผู้ใช้, กำหนดนักกายภาพผู้รับผิดชอบ, บันทึก Prescription และสิทธิ์ RBAC ครบวงจร

---

## 8. CLINICAL GOVERNANCE STATEMENT

> **Strong Care ไม่ใช่เครื่องมือวินิจฉัยโรคทางการแพทย์** แต่เป็นระบบช่วยติดตามและวิเคราะห์การฝึกกายภาพด้วย AI เพื่อสนับสนุนผู้ป่วย ผู้ดูแล และนักกายภาพบำบัดให้ได้รับข้อมูลการฝึกที่แม่นยำ ปลอดภัย และโปร่งใสตรวจสอบได้ ภายใต้การควบคุมและตัดสินใจของมนุษย์เสมอ (Human-in-the-Loop)

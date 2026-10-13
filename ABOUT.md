# เกี่ยวกับ Dr.Tech.Care (About Dr.Tech.Care)

## AI-assisted Rehabilitation Monitoring Platform
**แพลตฟอร์มช่วยติดตามและวิเคราะห์การฝึกกายภาพบำบัดด้วย AI อัจฉริยะ**
*“เพื่อการฟื้นฟูสมรรถภาพร่างกายที่ปลอดภัย ถูกต้องตามหลักชีวกลศาสตร์ และเข้าถึงง่ายสำหรับผู้สูงอายุและสถานพยาบาล”*

---

### 🌐 ลิงก์ระบบออนไลน์ (Live Deployment)
- **GitHub Pages (Live Demo)**: [https://krongrach80-ui.github.io/Strong-Care/](https://krongrach80-ui.github.io/Strong-Care/)
- **GitHub Repository**: [https://github.com/krongrach80-ui/Strong-Care](https://github.com/krongrach80-ui/Strong-Care)

---

### 🔑 ตารางบัญชีเข้าใช้งานระบบ (Demo Credentials)

ระบบ Dr.Tech.Care ใช้ระบบยืนยันตัวตนจริงด้วย **Username + Password** สำหรับบุคลากรทางการแพทย์ และ **Face Biometrics / PIN** สำหรับคนไข้หน้าตู้ Kiosk (ยกเลิกระบบ Demo Switcher แบบปุ่มลอยปนกันโดยสิ้นเชิง):

| ระบบ / บทบาท | Username | Password / PIN | จำนวนหน้า | สิทธิ์การเข้าถึงและความรับผิดชอบ |
|---|---|---|---|---|
| **ผู้อำนวยการ / แอดมินใหญ่ (Admin)** | `admin` | `1234` | **6 หน้าเต็ม** | สิทธิ์สูงสุด ดูแลผู้ใช้งานทุกคน, คนไข้ทุกคน, นักกายภาพทุกคน, ท่ากายภาพ, เตะเซสชัน/แบนเครื่อง/แบน IP, และตั้งค่า AI ทั้งระบบ |
| **นักกายภาพบำบัด (Physiotherapist)** | `pt_thanakorn` | `1234` | **4 หน้า** | กภ. ธนากร เจริญสุข — ดูแลคนไข้ที่รับผิดชอบ, แก้ไขโปรไฟล์ตนเอง, จัดการท่ากายภาพ (ซ่อนหน้า Logs และ Settings เด็ดขาด) |
| **นักกายภาพบำบัด (Physiotherapist)** | `pt_pimchanok` | `1234` | **4 หน้า** | กภ. พิมพ์ชนก สิทธิสาร — ดูแลคนไข้ที่รับผิดชอบ, แก้ไขโปรไฟล์ตนเอง, จัดการท่ากายภาพ (ซ่อนหน้า Logs และ Settings เด็ดขาด) |
| **คนไข้หน้าตู้ Kiosk (Patient)** | สแกนใบหน้า หรือ HN | PIN `1234` | **2 โหมดอิสระ** | สแกนใบหน้า 128 มิติ หรือใส่ PIN เพื่อเข้าสู่หน้าเมนูคนไข้: เลือกฝึกท่า Pose หรือเล่นมินิเกมตอบคำถาม |

---

### 🏛️ สถาปัตยกรรม 3 ระบบแยกขาดจากกัน (3 Isolated Systems Architecture)

```
                    ┌────────────────────────────────────────────────────────┐
                    │               DR.TECH.CARE PLATFORM                    │
                    └────────────────────────────────┬───────────────────────┘
                                                     │
         ┌───────────────────────────────────────────┼───────────────────────────────────────────┐
         ▼                                           ▼                                           ▼
┌─────────────────────────────────┐ ┌─────────────────────────────────┐ ┌─────────────────────────────────┐
│     ระบบ A: ผู้อำนวยการ/แอดมิน    │ │      ระบบ B: นักกายภาพบำบัด       │ │      ระบบ C: ตู้ Kiosk คนไข้     │
│       (Super Admin / Dir)       │ │        (Physiotherapist)        │ │         (Patient Kiosk)         │
├─────────────────────────────────┤ ├─────────────────────────────────┤ ├─────────────────────────────────┤
│ • ล็อกอิน: Username + Password   │ │ • ล็อกอิน: Username + Password   │ │ • ล็อกอิน: Face Scan / PIN 1234 │
│ • แสดงผล: 6 เมนูเต็ม             │ │ • แสดงผล: 4 เมนูจำกัดสิทธิ์      │ │ • แยก 2 ระบบอิสระจากกัน 100%:   │
│   1. จัดการผู้ใช้งาน            │ │   1. ผู้ใช้งาน (เพิ่มได้เฉพาะคนไข้) │ │   [1] เริ่มกายภาพ (Pose 16 ท่า) │
│   2. ข้อมูลคนไข้ทั้งหมด          │ │   2. คนไข้ (เฉพาะที่ฉันดูแล/ทั้งหมด)│ │   [2] เริ่มมินิเกม (ตอบคำถาม 99 ข้อ)│
│   3. ข้อมูลนักกายภาพทั้งหมด      │ │   3. ข้อมูลตนเอง (แก้ได้เฉพาะตนเอง) │ │ • ปิดรายชื่อสาธารณะ (PDPA)      │
│   4. ท่าทางกายภาพ               │ │   4. ท่าทางกายภาพ               │ │ • Zero-Scroll Smart Mirror     │
│   5. ประวัติการใช้งาน & ความปลอดภัย│ ├─────────────────────────────────┤ └─────────────────────────────────┘
│   6. ตั้งค่าระบบ & AI ชีวมิติ    │ │ ⛔ ปิดกั้น Logs และ Settings เด็ดขาด│
└─────────────────────────────────┘ └─────────────────────────────────┘
```

#### 1. ระบบ A: ผู้อำนวยการ / แอดมินใหญ่ (Admin / Hospital Director)
- **การเข้าใช้งาน**: ผ่านหน้า "ระบบบุคลากร / รพ." ล็อกอินด้วย `admin` / `1234`
- **ขอบเขตหน้าที่ 6 หน้าสมบูรณ์**:
  1. **จัดการผู้ใช้งาน (User Management)**: ดูบัญชีทั้งหมด, เพิ่มบัญชีใหม่ (ทั้งคนไข้และนักกายภาพ), แก้ไขข้อมูล, รีเซ็ตรหัสผ่าน/PIN, เปลี่ยนสิทธิ์, ระงับหรือเปิดใช้งานบัญชี
  2. **ข้อมูลคนไข้ (Patient Directory)**: ดูและแก้ไขข้อมูลคนไข้ทุกคนในโรงพยาบาล, จัดสรรนักกายภาพผู้รับผิดชอบ, แก้ไข Chief Complaint, ROM, ผลการรักษา
  3. **ข้อมูลนักกายภาพ (Physiotherapist Directory)**: ดูข้อมูลนักกายภาพทุกคน, แก้ไขเลขที่ใบประกอบวิชาชีพ, ความเชี่ยวชาญ, มอบหมายหรือถอดถอนเคสคนไข้ในความดูแล
  4. **ท่าทางกายภาพ (Exercise Management)**: เพิ่ม, แก้ไข, ลบท่ากายภาพชีวกลศาสตร์ในคลังกลาง (ROM, Reps, Sets, Hold seconds, Safe limits)
  5. **ประวัติการใช้งาน & ความปลอดภัย (Security Logs)**: ตรวจสอบ Audit Trail ทุกกิจกรรม, เตะเซสชัน (Kick), แบนเครื่อง (Device Fingerprint), แบน IP Address
  6. **ตั้งค่าระบบ & AI ชีวมิติ (System Settings)**: ปรับจูน Cosine Similarity, Face Liveness, องศาเอียงลำตัว, ขีดจำกัดความเร็ว, ระบบเสียง, การสำรองข้อมูล

#### 2. ระบบ B: นักกายภาพบำบัด (Physiotherapist)
- **การเข้าใช้งาน**: ผ่านหน้า "ระบบบุคลากร / รพ." ล็อกอินด้วย `pt_thanakorn` / `1234` หรือ `pt_pimchanok` / `1234`
- **ขอบเขตหน้าที่ 4 หน้าที่ได้รับอนุญาต**:
  1. **ผู้ใช้งาน (Restricted Users)**: ดูรายชื่อผู้ใช้, เพิ่มได้เฉพาะ "บัญชีคนไข้", ไม่สามารถแก้ไขหรือรีเซ็ตรหัสผ่านของแอดมินหรือนักกายภาพท่านอื่นได้
  2. **ข้อมูลคนไข้ (Assigned Patients)**:
     - แถบสลับตัวกรอง `[เฉพาะที่ฉันดูแล]` (ค่าเริ่มต้น) และ `[คนไข้ทั้งหมด]`
     - แก้ไขได้เฉพาะคนไข้ที่อยู่ในความดูแลของตนเอง
     - หากเป็นคนไข้ของนักกายภาพท่านอื่น จะเปิดเป็นโหมด **อ่านอย่างเดียว (Read-Only)** พร้อมแถบเตือนแจ้งสิทธิ์
  3. **ข้อมูลนักกายภาพ (PT Profile)**: ดูข้อมูลและแก้ไขได้เฉพาะโปรไฟล์ของตนเองเท่านั้น
  4. **ท่าทางกายภาพ (Exercises)**: ดูและใช้งานท่ากายภาพในระบบ
- **การควบคุมความปลอดภัย (Strict RBAC Isolation)**:
  - **ซ่อนเมนู 5 (ประวัติการใช้งาน) และเมนู 6 (ตั้งค่าระบบ) ออกจากแถบเมนูด้านข้างอย่างเด็ดขาด**
  - มีระบบ Auto-Redirect ทันทีหากตรวจพบความพยายามเข้าสู่แท็บที่ไม่ได้รับอนุญาต

#### 3. ระบบ C: ตู้ Kiosk คนไข้ (Patient Kiosk)
- **การเข้าใช้งาน**: ยืนยันตัวตนผ่านสแกนใบหน้า AI (Face Biometrics 128 มิติ) หรือใส่ PIN 4 หลัก (`1234`)
- **มาตรฐานความเป็นส่วนตัว (PDPA / HIPAA Compliant)**: ปิดการแสดงรายชื่อคนไข้สาธารณะหน้าตู้ และปิดปุ่มสมัครเองที่หน้าตู้ ป้องกันการสวมสิทธิ์
- **แยก 2 ระบบออกจากกันอย่างเป็นอิสระ 100%**:
  - **A) ปุ่ม「เริ่มกายภาพ」**:
    - เข้าสู่หน้าฝึกท่ากายภาพบำบัดแบบ Fullscreen Smart Mirror
    - ตรวจจับโครงกระดูก 33 จุด (MediaPipe Pose Landmarker Full)
    - วัดมุมข้อต่อชีวกลศาสตร์ (ROM Angles) แบบเรียลไทม์ พร้อม 8-Frame EMA Smoothing
    - นับรอบด้วย 5-State Machine และ Hold Gate ป้องกันการโกงท่า
    - มีคลิปหมอสาธิต PiP สลับมุมซ้าย-ขวาได้
    - **ไม่มีปุ่มมินิเกมมาปะปนให้สับสน**
  - **B) ปุ่ม「เริ่มกายภาพแบบมินิเกม」**:
    - เข้าสู่เกมตอบคำถาม ใช่ / ไม่ โดยตรง
    - ยกมือขวา = ตอบ "ใช่" (สีเขียว ฝั่งขวาของจอตามมุมมองกระจกเงา) / ยกมือซ้าย = ตอบ "ไม่" (สีแดง ฝั่งซ้ายของจอตามมุมมองกระจกเงา)
    - ตรวจจับความสูงข้อมือเทียบระดับไหล่ พร้อมแถบ Hold Duration ป้องกันการแกว่งมือ
    - คลังคำถาม 99 ข้อ พร้อมเสียงสังเคราะห์ Web Audio API
    - **ไม่มีหน้าวัดองศาหรือท่ายืดคอมาปะปน**

---

### 💡 จุดเด่นและนวัตกรรมหลัก (Key Innovations)

#### 1. 🏥 ระบบต้อนรับคนไข้ใหม่ (Receptionist & PT Patient Onboarding Flow)
- **กรอกข้อมูลก่อน แล้วค่อยไปสแกนหน้าเพื่อเปิดใช้งานตู้ (Fill Details First ➔ Biometric Face Scan)**:
  - ออกแบบสำหรับจุดต้อนรับ (Reception) โดยนักกายภาพบำบัดหรือเจ้าหน้าที่ต้อนรับสามารถกรอกข้อมูลเวชระเบียนคนไข้เบื้องต้นได้อย่างสะดวกรวดเร็ว:
    - รหัสคนไข้ (HN / Patient Code): สร้างให้อัตโนมัติ เช่น `P-0036`
    - ชื่อ-นามสกุล, อายุ, เพศ, เบอร์โทรศัพท์ติดต่อ
    - **กำหนดนักกายภาพผู้รับผิดชอบ (Assigned Physical Therapist)**: มอบหมายเคสได้ทันที
    - การวินิจฉัยโรค / อาการเบื้องต้น (Clinical Diagnosis)
    - รหัส PIN สำรอง 4 หลัก
    - ความยินยอมการจัดเก็บข้อมูลชีวมิติ (PDPA Biometric Consent)
  - **สแกนใบหน้าชีวมิติจริง (Real Biometric Enrollment)**:
    - สแกนใบหน้า 3 มุม: มองตรง (Center), หันซ้าย (Left ~15°), หันขวา (Right ~15°) พร้อมตรวจจับการกะพริบตา (Liveness Blink)
    - สกัดเวกเตอร์ ResNet-34 128 มิติ ผูกกับโปรไฟล์คนไข้ทันที
    - คนไข้สามารถเดินไปที่ตู้ Dr.Tech.Care Kiosk แล้วสแกนหน้าหรือใส่ PIN เพื่อล็อกอินเข้าสู่ระบบได้ทันที

#### 2. 🪞 Vertical Fullscreen Smart-Mirror (กล้องกายภาพแนวตั้งเต็มจอ)
- หน้าจอกล้องจำลองกระจกกายภาพบำบัดอัจฉริยะ (Smart Rehab Mirror) แบบแนวตั้งเต็มจอ 100dvh
- แสดงโครงร่างกระดูก AI (MediaPipe WASM 33 จุด) แบบเรียลไทม์ ชัดเจนตั้งแต่ศีรษะถึงเท้า
- ล็อกความสูงพอดี 1 จอ 100% (**Zero-Scroll Design**) ผู้สูงอายุไม่ต้องเดินมาเลื่อนเมาส์หรือปัดหน้าจอขึ้นลงระหว่างฝึก

#### 3. 👨‍⚕️ Picture-in-Picture (PiP) Doctor's Guidance (คลิปวิดีโอคุณหมอสาธิตในกล้อง)
- ฝังคลิปวิดีโอสาธิตท่าทางของคุณหมอ (นพ. กฤติณห์ / หมอเฟม จากหมอชวนฟิต DeDoctor) ซ้อนอยู่ในหน้าจอกล้องโดยตรง
- ผู้ป่วยสามารถมองเห็นต้นแบบที่ถูกต้องไปพร้อมกับส่องท่าทางของตนเองในกระจกได้พร้อมกัน
- **สลับมุมซ้าย-ขวา (`⇄`) ได้ทันที**: ป้องกันไม่ให้คลิปวิดีโอบดบังแขนหรือข้อต่อข้างที่กำลังยกฝึก
- **ปุ่มย่อ-ขยาย (`—`)**: ย่อคลิปเป็นปุ่มลอยเพื่อดูกระจกเต็มจอ หรือขยายกลับมาได้ตลอดเวลา

#### 4. 🧘‍♂️ คลังท่ากายภาพบำบัดชีวกลศาสตร์ 16 ท่ามาตรฐาน (16 Kinematic Clinical Exercises)
- **โมเดลความแม่นยำสูง**: ใช้ **`pose_landmarker_full.task`** พร้อมค่าความเชื่อมั่น `minPoseDetectionConfidence: 0.6`
- **การวาดโครงกระดูกอัจฉริยะ**: กรองวาดเส้น Skeleton และจุดข้อต่อเฉพาะจุดที่มี `visibility >= 0.6` ป้องกันเส้นโครงกระดูกกระตุกหลอน
- **การคำนวณมุมและ 8-Frame Exponential Moving Average (EMA)**:
  - คำนวณมุมข้อต่อ (ไหล่/ศอก/เข่า/คอ/ลำตัว/สะโพก) พร้อมทำ EMA Smoothing ย้อนหลัง 8 เฟรม ($\alpha = 2/9 \approx 0.222$) ช่วยให้มุมนิ่งสนิทและแม่นยำ
  - แสดงมุมปัจจุบันบนหน้าจอแบบเรียลไทม์ เช่น `"มุมไหล่: 72° / เป้าหมาย 90°"`
- **เงื่อนไขผ่านท่า (Clinical Hold Gate)**: มุมต้องอยู่ในช่วงเป้าหมาย $\pm 10^\circ$ ติดต่อกันอย่างน้อย 0.5 วินาที ก่อนเริ่มนับเวลาค้างท่า
- **3-Tier UX Status Indicator**:
  - 🔴 **สีแดง**: ยังไม่เข้าท่า (อยู่นอกเป้าหมาย $> 25^\circ$ หรืออยู่นอกเฟรม)
  - 🟡 **สีเหลือง**: ใกล้แล้ว (อยู่ในช่วง $\pm 25^\circ$ หรืออยู่ในช่วง $\pm 10^\circ$ กำลังค้างให้ครบ 0.5 วิ)
  - 🟢 **สีเขียว**: ถูกต้อง กำลังนับเวลา (อยู่ในช่วง $\pm 10^\circ$ ต่อเนื่อง $\ge 0.5$ วิ)
- ควบคุมด้วยสมการตรีโกณมิติ **Aspect-Ratio Invariant** และ **3D Euclidean Metric Vector**
- ระบบนับรอบอัตโนมัติ **5-State Repetition Automaton (READY ➔ UP ➔ HOLD ➔ DOWN ➔ COMPLETE)**

#### 5. 🎮 ระบบกายภาพแบบมินิเกมตอบคำถาม (Decoupled Cognitive & Physical Therapy Mini-Game)
- **แนวคิดเกม (Cognitive & Motor Coordination Game)**:
  - แยกหน้าอิสระ 100% จากหน้าฝึกท่ากายภาพ เข้าผ่านปุ่ม **"เริ่มกายภาพแบบมินิเกม"**
  - เกมตอบคำถาม ใช่ / ไม่ โดยใช้ท่าทางมือ เพื่อฝึกการตัดสินใจของสมองควบคู่กับการเคลื่อนไหวแขนและหัวไหล่:
    - **ยกมือขวา** = ตอบ **"ใช่"** (สีเขียวมรกต ฝั่งขวาของจอกระจกเงา)
    - **ยกมือซ้าย** = ตอบ **"ไม่"** (สีแดงอ่อน ฝั่งซ้ายของจอกระจกเงา)
- **การตรวจจับท่าทางด้วย MediaPipe AI เรียลไทม์**:
  - ตรวจจับตำแหน่งข้อมือเทียบกับระดับหัวไหล่ (`wrist.y < shoulder.y - 0.07`)
  - แสดงภาพสะท้อนแบบกระจกเงา (Mirrored View) พร้อมเส้นโครงกระดูกและวงแหวนเรืองแสงสีเขียว/แดงบนข้อมือ
  - **ระบบป้องกันการสั่น (Hold Duration Engine)**: ยกมือค้างไว้ 0.6–0.8 วินาที พร้อมแถบสีเติมจนเต็ม 100% เพื่อยืนยันคำตอบ
  - **ระบบ Fail-Safe**: หากตรวจพบการยกมือพร้อมกันทั้งสองข้าง จะแจ้งเตือน *"ตรวจพบทั้งสองมือพร้อมกัน — กรุณายกมือเพียงข้างเดียว"* และไม่นับเป็นคำตอบผิด
  - **โหมดสัมผัสสำรอง (Touch Mode)**: หากกล้องใช้งานไม่ได้ สามารถแตะปุ่ม "ใช่" / "ไม่" บนหน้าจอเพื่อตอบได้ทันที
- **คลังคำถามสมบูรณ์ 99 ข้อ (Comprehensive 99-Question Bank)**:
  - สุ่ม 10 ข้อ (หรือ 5 / 15 ข้อตามตั้งค่า) ไม่ซ้ำกันในแต่ละรอบ
  - ครอบคลุม 8 หมวดหมู่: ผลไม้และอาหาร, สิ่งของเครื่องใช้, สัตว์, การนับจำนวน, กิจวัตรประจำวันและความปลอดภัย, สีและรูปทรง, เวลา, มิติสัมพันธ์
- **ระบบเสียงและสรุปผลคะแนน**:
  - เสียงสังเคราะห์ Chime / Buzzer / Fanfare ผ่าน Web Audio API
  - หน้าสรุปคะแนนพร้อมระดับดาว (Stars Rating) และคำชมให้กำลังใจ
  - ปุ่ม **"ส่งผลให้นักกายภาพ"** บันทึกสถิติลงประวัติการรักษาของคนไข้
- **โมดอลตั้งค่ามินิเกม (Mini Game Settings)**:
  - กดปุ่มไอคอนเฟือง ⚙️ เพื่อเลือกจำนวนข้อต่อรอบ, โหมดรับคำตอบ (กล้อง AI / สัมผัส), เวลาค้างท่า, และเปิด/ปิดเสียง

#### 6. 🔐 ระบบยืนยันตัวตนชีวมิติอัจฉริยะ (Smart Biometric Authentication & Liveness Detection)
- **สแกนใบหน้าอัจฉริยะ (Face Login & Enrollment)**:
  - ขับเคลื่อนด้วย **ResNet-34 Deep Feature Embeddings (128 มิติ)** + **MediaPipe FaceLandmarker (478 Facial Mesh Landmarks)**
  - ตรวจเช็คคุณภาพเฟรม: กึ่งกลางกรอบวงรี, สัดส่วน 20% – 68%, แสงสว่างเหมาะสม, ภาพไม่เบลอ, ศีรษะตรง ($|Yaw| \le 22^\circ$)
  - ตรวจความมีชีวิตจริง (Liveness Blink EAR & Head Turn) ป้องกันการใช้ภาพถ่ายนิ่ง
  - คำนวณ Cosine Similarity Threshold มาตรฐาน $0.80$ รัดกุม ปลอดภัย ไม่สับสนระหว่างบุคคล
  - จัดเก็บเฉพาะ 128-D vector ไม่เก็บภาพถ่ายดิบตามมาตรฐาน PDPA
- **รหัส PIN ตัวเลข (Senior PIN Mode)**: ใช้งานง่าย สำหรับผู้สูงอายุ

#### 7. 🛡️ ระบบความปลอดภัยทางคลินิก (Clinical Safety Watchdog)
- ตรวจจับภาวะอันตรายระหว่างการฝึกแบบเรียลไทม์:
  - มุมข้อต่อเกินช่วงปลอดภัย (Over-ROM)
  - ลำตัวเอียงชดเชยรุนแรง (Spine Lean $> 22^\circ$)
  - การยกบ่าเกร็งกล้ามเนื้อ (Shoulder Hike $> 18^\circ$)
  - การเคลื่อนไหวกระตุกเร็วผิดปกติ (Erratic Velocity $> 220^\circ$/s)
- **Smart Pause & Auto-Resume**: หยุดนับรอบชั่วคราวเมื่อหลุดเฟรม และเริ่มนับต่อทันทีเมื่อกลับมาอยู่ในตำแหน่งที่ถูกต้อง

#### 8. 💾 Resilient Offline-First Architecture
- ทำงานได้ทั้งแบบมีเซิร์ฟเวอร์ และแบบ Static บน GitHub Pages ผ่านระบบ Fallback อัตโนมัติ
- จัดเก็บข้อมูลลง IndexedDB (`StrongCareDB`) ครบทุกรอบ และแคชสรุปย่อใน `localStorage`
- คิวซิงก์เดี่ยวอัตโนมัติ (Single Sync Queue) เมื่อเซิร์ฟเวอร์กลับมาออนไลน์

---

### 🗄️ สถาปัตยกรรมฐานข้อมูลจริงด้วย Supabase (PostgreSQL + RLS + Real Auth)

ระบบ Dr.Tech.Care ได้รับการอัปเกรดจากระบบ Demo / localStorage ให้เป็นระบบใช้งานจริงในระดับ Production โดยเชื่อมต่อกับ **Supabase (Managed PostgreSQL)** เป็น Backend หลัก:

```
                                    ┌───────────────────────────────────┐
                                    │      SUPABASE CLOUD / POSTGRES    │
                                    │     (Row Level Security Enabled)  │
                                    └─────────────────┬─────────────────┘
                                                      │
                    ┌─────────────────────────────────┼─────────────────────────────────┐
                    ▼                                 ▼                                 ▼
         ┌─────────────────────┐           ┌─────────────────────┐           ┌─────────────────────┐
         │     auth.users      │           │      profiles       │           │   patients/therapists│
         │  (Supabase Auth)    │◀─────────▶│ (id, role, username)│◀─────────▶│(Clinical Records &  │
         │  Admin / PT Logins  │           │   Admin/PT/Patient  │           │ Responsible PT Link)│
         └─────────────────────┘           └─────────────────────┘           └─────────────────────┘
                    │                                 │                                 │
                    ▼                                 ▼                                 ▼
         ┌─────────────────────┐           ┌─────────────────────┐           ┌─────────────────────┐
         │      exercises      │           │ treatment_sessions  │           │   minigame_results  │
         │  (16 Clinical Poses)│           │  & Real ROM History │           │  (99-Q Quiz Scores) │
         └─────────────────────┘           └─────────────────────┘           └─────────────────────┘
                    │                                 │                                 │
                    ▼                                 ▼                                 ▼
         ┌─────────────────────┐           ┌─────────────────────┐           ┌─────────────────────┐
         │    activity_logs    │           │   banned_devices    │           │   system_settings   │
         │ (Audit Trail Logs)  │           │    & banned_ips     │           │   & face_embeddings │
         └─────────────────────┘           └─────────────────────┘           └─────────────────────┘
```

#### 1. โครงสร้าง 11 ตารางฐานข้อมูล (Database Schema)
1. **`profiles`**: จัดเก็บข้อมูลผู้ใช้งานทุกคน (`id` UUID เชื่อม `auth.users`, `username` unique, `full_name`, `role: 'admin'|'therapist'|'patient'`, `phone`, `email`, `is_active`, `created_at`, `updated_at`)
2. **`patients`**: ทะเบียนคนไข้เวชระเบียน (`id` UUID, `profile_id` FK profiles, `patient_code` unique เช่น `P-0012`, `full_name`, `age`, `gender`, `phone`, `chief_complaint`, `medical_history`, `treatment_outcome`, `therapist_notes`, `responsible_therapist_id` FK profiles, `pin_hash` แฮช SHA-256, `started_at`, `status`)
3. **`therapists`**: ทะเบียนนักกายภาพบำบัด (`id` UUID, `profile_id` FK profiles, `license_no`, `specialty`, `bio`, `phone`, `email`, `status: 'active'|'on_leave'|'suspended'`)
4. **`exercises`**: คลังท่าทางกายภาพบำบัดชีวกลศาสตร์ (`id` UUID, `slug`, `name_th`, `name_en`, `category`, `difficulty`, `target_angle`, `hold_seconds`, `reps`, `sets`, `target_joint`, `instructions`, `caution`, `contraindication`, `is_active`)
5. **`treatment_sessions`**: ประวัติการฝึกกายภาพบำบัดจริง (`id` UUID, `patient_id` FK, `exercise_id` FK, `therapist_id` FK, `score`, `avg_angle`, `hold_completed_seconds`, `accuracy_percent`, `total_reps`, `correct_reps`, `notes`, `mode: 'therapy'|'minigame'`, `created_at`)
6. **`minigame_results`**: ผลลัพธ์และสถิติกายภาพแบบมินิเกม (`id` UUID, `patient_id` FK, `score`, `total_questions`, `correct_count`, `stars`, `duration_seconds`, `created_at`)
7. **`activity_logs`**: บันทึก Audit Trail ความปลอดภัย (`id` UUID, `actor_id` FK profiles, `actor_name`, `action`, `detail`, `category`, `device_info`, `ip_address`, `created_at`)
8. **`banned_devices`**: ทะเบียนอุปกรณ์ที่ถูกแบน (`id` UUID, `value`, `reason`, `banned_by`, `created_at`)
9. **`banned_ips`**: ทะเบียน IP Address ที่ถูกแบน (`id` UUID, `value`, `reason`, `banned_by`, `created_at`)
10. **`system_settings`**: การตั้งค่าพารามิเตอร์ AI และระบบ (`key` text PK, `value` jsonb, `updated_at`)
11. **`face_embeddings`**: เวกเตอร์ชีวมิติใบหน้า 128 มิติ (`id` UUID, `patient_id` FK patients, `embedding` jsonb, `created_at`)

#### 2. นโยบายความปลอดภัยระดับแถว (Row Level Security - RLS)
- **Admin**: สิทธิ์เต็มรูปแบบ (Full Read/Write/Delete) บนทุกตาราง
- **Physiotherapist**:
  - `profiles`: ดูได้ทั้งหมด, เพิ่มได้เฉพาะบทบาท `'patient'`
  - `patients`: เพิ่มคนไข้ใหม่ได้, แก้ไขได้เฉพาะคนไข้ที่ตนเองรับผิดชอบ (`responsible_therapist_id = current_user_id()`), อ่านข้อมูลคนไข้คนอื่นในโหมด Read-Only
  - `therapists`: แก้ไขได้เฉพาะโปรไฟล์ของตนเอง
  - `exercises`: ดูและจัดการท่าทางกายภาพได้
  - `activity_logs` & `system_settings`: **ปิดกั้นการเข้าถึง 100%**
- **Patient**:
  - อ่านเฉพาะข้อมูลเวชระเบียนของตนเอง (`id = patient_id`)
  - บันทึกผลการฝึก `treatment_sessions` และ `minigame_results` ของตนเองได้
  - **ห้ามมองเห็นหรือเข้าถึงข้อมูลของผู้ป่วยท่านอื่นอย่างเด็ดขาด**

#### 3. การเชื่อมต่อและระบบความปลอดภัยฝั่ง Frontend
- **Singleton Client**: ไฟล์ [`frontend/src/lib/supabase.ts`](file:///frontend/src/lib/supabase.ts) ใช้ `@supabase/supabase-js` ผ่านตัวแปรสภาพแวดล้อม:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  *(ไม่มีการ hardcode service role key ฝั่ง frontend อย่างเด็ดขาด)*
- **PIN Cryptographic Hashing**: รหัส PIN คนไข้หน้าตู้ Kiosk ถูกเข้ารหัสด้วย Web Crypto API **SHA-256** ก่อนบันทึกหรือเทียบเคียงเสมอ (ไม่มีการเก็บ Plaintext PIN ในฐานข้อมูล)
- **Data Persistence**: ข้อมูลทุกส่วนคงอยู่ถาวร แม้รีเฟรชหน้าเว็บหรือเปิดจากอุปกรณ์อื่น
- **Resilient Fallback**: มีกลไกตรวจจับการเชื่อมต่อฐานข้อมูล หากเครือข่ายขัดข้องจะสลับเข้าสู่โหมด Offline Storage อัตโนมัติโดยที่ระบบไม่แครช

---

### 🧪 การทดสอบระบบอัตโนมัติ (Automated Test Suite: 31/31 Passed)

ระบบครอบคลุมชุดทดสอบอัตโนมัติระดับ Production ผ่านครบ 100% ทั้ง 31 กรณีทดสอบ (`npm test`):

1. **Biomechanical & Clinical Safety Tests (21 Tests)**:
   - ตรวจสอบความถูกต้องของโมเดลชีวกลศาสตร์ (Hold Gate, Over-ROM, Trunk Lean, 8-Frame EMA Smoothing, 5-State Automaton, Aspect-Ratio Invariance)
2. **RBAC & Isolation Security Tests (10 Tests)**:
   - `Admin Full Privileges`: ตรวจสอบ 6 เมนูหลักของ Admin และสิทธิ์การจัดการบัญชี
   - `Physiotherapist Restricted Navigation`: ตรวจสอบ 4 เมนูของนักกายภาพ และปิดกั้นหน้า Logs/Settings
   - `Patient Kiosk Isolation`: ตรวจสอบการแยก Kiosk กับ Staff Portal
   - `Authentication Protection`: ปฏิเสธรหัสผ่านผิด และห้ามสวมสิทธิ์
   - `Patient-PT Boundary Security`: กั้นสิทธิ์การแก้ไขข้อมูลข้ามผู้รับผิดชอบ

---

### 🛠️ เทคโนโลยีที่ใช้ (Tech Stack)
- **Frontend**: React 18, TypeScript 5, Vite 5, Tailwind CSS, Lucide Icons, Canvas-Confetti, Zustand, Recharts
- **Database & Backend**: Supabase (PostgreSQL 15), Supabase Auth, Row Level Security (RLS), Web Crypto SHA-256
- **Computer Vision & AI**: Google MediaPipe Pose Landmarker Full (WASM 0.10.35), MediaPipe FaceLandmarker (478 Dense Landmarks), ResNet-34 128-D Feature Embeddings
- **Design System**: Dr.Tech.Care Mint Aesthetic (`#1E8A4C`, `#2FB39A`, `#E8FAF3`, `#0B2B2B`), Hospital Dark Slate (`#0F2F2B`), WCAG AAA High Contrast
- **Offline & Fallback**: IndexedDB (`StrongCareDB`), LocalStorage Preference Caching, Auto-sync Queue
- **Hosting & CI/CD**: GitHub Pages Static SPA Deployment, Supabase Cloud Database

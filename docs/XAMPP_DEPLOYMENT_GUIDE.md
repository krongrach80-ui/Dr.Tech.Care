# คู่มือการติดตั้งและใช้งานระบบ Moh Tech Care (XAMPP & Production Guide)

ระบบบริหารจัดการกายภาพบำบัดอัจฉริยะ (Intelligent Physical Therapy Kiosk System) เชื่อมต่อ 3 หน้าจอทำงานบนฐานข้อมูลเดียวกัน (Single Source of Truth):
1. **Patient Kiosk Terminal** (`/kiosk`) - หน้าจอตู้กายภาพบำบัดแนวตั้ง (1080×1920) ควบคุมด้วยกล้อง AI
2. **Super Admin Dashboard** (`/admin`) - แดชบอร์ดผู้อำนวยการโรงพยาบาล/หัวหน้าฝ่าย (6 โมดูลหลัก)
3. **Physiotherapist Workspace** (`/pt`) - หน้าจอทำงานนักกายภาพบำบัด (แยกสิทธิ์การเข้าถึงระดับ Server-side)

---

## 1. ข้อกำหนดของระบบ (System Requirements)
- **Web Server:** Apache 2.4+ (เปิดใช้งานโมดูล `mod_rewrite` และ `mod_headers`)
- **PHP Version:** PHP 8.1, 8.2 หรือ 8.3
  - ส่วนขยายที่จำเป็น: `pdo_mysql`, `mbstring`, `openssl`, `json`, `fileinfo`
- **Database:** MySQL 8.0+ หรือ MariaDB 10.4+ (InnoDB, Collation: `utf8mb4_unicode_ci`)
- **Client/Kiosk Browser:** Google Chrome หรือ Microsoft Edge (Chromium) พร้อม Webcam ความละเอียดขั้นต่ำ 720p 30fps
- **Timezone:** Asia/Bangkok (`+07:00`)

---

## 2. ขั้นตอนการติดตั้งฐานข้อมูล (Database Setup)
1. เปิดโปรแกรม **XAMPP Control Panel** แล้วกด **Start** ที่โมดูล **Apache** และ **MySQL**
2. เปิดเบราว์เซอร์ไปที่ phpMyAdmin: `http://localhost/phpmyadmin`
3. สร้างฐานข้อมูลใหม่ชื่อ: `moh_tech_care` (ตั้ง Collation เป็น `utf8mb4_unicode_ci`)
4. นำเข้า (Import) ไฟล์ SQL ตามลำดับดังนี้:
   - นำเข้าไฟล์: `database/schema.sql` (สร้าง 14 ตารางหลัก, Foreign Keys, Indexes และ MySQL Trigger ป้องกันการแก้ไข Medical Notes)
   - นำเข้าไฟล์: `database/seed.sql` (ชุดข้อมูลเริ่มต้น พร้อมบัญชี Super Admin, PT, ผู้ป่วย, แบบฝึกหัด, และการนัดหมาย)

หรือนำเข้าผ่าน Command Line:
```bash
mysql -u root -p moh_tech_care < "database/schema.sql"
mysql -u root -p moh_tech_care < "database/seed.sql"
```

---

## 3. การตั้งค่าระบบ Backend (PHP REST API)
ตรวจสอบไฟล์ `backend/config/config.php`:
```php
'database' => [
    'host' => '127.0.0.1',
    'port' => 3306,
    'database' => 'moh_tech_care',
    'username' => 'root',
    'password' => '',
    'charset' => 'utf8mb4',
],
```
*หมายเหตุ: หากระบบไม่พบ MySQL หรือยังไม่ได้ Start MySQL เซิร์ฟเวอร์จะสลับไปใช้ระบบ SQLite สำรองแบบออฟไลน์โดยอัตโนมัติเพื่อป้องกันระบบ Kiosk หยุดทำงาน*

---

## 4. การคอมไพล์ Frontend สำหรับ Production
ในโฟลเดอร์ `frontend`:
```bash
cd frontend
npm install
npm run build
```
ผลลัพธ์การ Build จะถูกสร้างไว้ในโฟลเดอร์ `frontend/dist/` พร้อมไฟล์ `.htaccess` สำหรับ Single Page Application (SPA)

---

## 5. การตั้งค่า Apache (XAMPP httpd-vhosts.conf)
คัดลอกการตั้งค่าจากไฟล์ `docs/APACHE_VHOST.conf` ไปวางไว้ที่:
`C:\xampp\apache\conf\extra\httpd-vhosts.conf`
หรือตั้ง Alias ใน Apache เพื่อให้ชี้ไปยังโฟลเดอร์ `frontend/dist` และ `backend/public`

---

## 6. การเปิดใช้งานตู้ Kiosk แนวตั้ง (1080×1920 Kiosk Mode)
ระบบถูกออกแบบมาสำหรับหน้าจอแนวตั้ง (Portrait Mode) สัดส่วน 9:16:
1. หมุนการแสดงผลหน้าจอ Windows เป็น Portrait (1080x1920) ใน Display Settings
2. ดับเบิ้ลคลิกไฟล์ `launch_kiosk.bat` ที่โฟลเดอร์หลักของโปรเจกต์
3. Chrome จะเปิดขึ้นมาในโหมด Fullscreen Kiosk ปิดระบบสัมผัสขยายหน้าจอ (Disable Pinch) และเข้าสู่ระบบสแกนใบหน้าอัตโนมัติ

---

## 7. การตั้งค่า Daily Auto-Reschedule Cron Job
ระบบมี Script สำหรับตรวจสอบและยกยอดการนัดหมายที่ขาดนัดอัตโนมัติ (`backend/cron/auto_reschedule.php`)
1. เปิด **Task Scheduler** ใน Windows
2. เลือก **Create Basic Task...**
3. ตั้งชื่อ: `MohTechCare_AutoReschedule`
4. ตั้งความถี่: **Daily** เวลา **00:05:00** ทุกวัน
5. Action: **Start a program** -> เลือกไฟล์ `backend/cron/run_cron.bat`
6. บันทึกงาน เพื่อให้ระบบอัปเดตสถานะ Missed Appointment และยกยอดแบบฝึกหัดเข้าสู่วันถัดไปอย่างสม่ำเสมอ

---

## 8. บัญชีผู้ใช้งานเริ่มต้นสำหรับการทดสอบ (Default Seed Accounts)

| บทบาท (Role) | รหัสผู้ใช้ / Username | รหัสผ่านเริ่มต้น | วัตถุประสงค์การทดสอบ |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `admin` | `admin1234` | บริหารจัดการผู้ใช้ทุกระดับ, ปลดล็อกสิทธิ์, ดู Audit Log, สั่ง Force Logout, แบน IP |
| **Physiotherapist** | `pt_somchai` | `pt123456` | หน้าจอ PT Workspace, บันทึกเวชระเบียน, มอบหมายงานแทน (Temporary Coverage) |
| **Physiotherapist** | `pt_kanok` | `pt123456` | ทดสอบการรับเคสรักษาและการคุ้มครองผู้ป่วยแทน |
| **Patient** | `P-1001` (นายสมศักดิ์ มีสุข) | สแกนใบหน้า (Biometrics) หรือ Staff Fallback | ตู้ Kiosk สแกนใบหน้า, เล่นมินิเกม Balloon Pop, Reach & Catch |

---

## 9. การล็อกระบบตู้ Kiosk ขั้นสูง (Enterprise Lockdown Guide per v2.1)

เพื่อป้องกันไม่ให้ผู้ป่วยออกจากแอปพลิเคชันหรือเปิดเว็บไซต์อื่นบนตู้คีออสจริง:

### 9.1 นโยบายเบราว์เซอร์ Google Chrome (Chrome Enterprise Policies)
สร้างหรือแก้ไข Registry ใน Windows (`HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome`):
1. **DeveloperToolsAvailability = 2**
   - ปิดการใช้งาน DevTools (F12, Inspect Element) 100%
2. **URLBlocklist = ["*"]**
   - บล็อกการเข้าถึง URL ทั้งหมดบนอินเทอร์เน็ต
3. **URLAllowlist = ["http://localhost*", "http://127.0.0.1*", "https://krongrach80-ui.github.io*"]**
   - อนุญาตเฉพาะโดเมนของระบบ Moh Tech Care เท่านั้น
4. **VideoCaptureAllowedUrls = ["http://localhost*", "http://127.0.0.1*", "https://krongrach80-ui.github.io*"]**
   - อนุญาตสิทธิ์การเข้าถึงกล้อง Webcam อัตโนมัติ โดยไม่ต้องให้ผู้ป่วยกดยืนยัน

### 9.2 นโยบายระบบปฏิบัติการ Windows (Windows Assigned Access)
1. ติดตั้งแอปในบัญชี Windows Standard User (ไม่ใช่ Admin)
2. เปิดใช้งาน **Assigned Access (โหมดคีออสของ Windows)** โดยกำหนดให้รันสคริปต์ `launch_kiosk.bat`
3. ตั้งค่านโยบาย Local Group Policy เพื่อปิดปุ่ม `Alt+F4`, `Windows Key`, และ `Ctrl+Alt+Del`
4. ไม่ต่อแป้นพิมพ์ภายนอก (No Physical Keyboard) ให้ใช้งานผ่านหน้าจอสัมผัสและการตรวจจับใบหน้า/ท่าทางเท่านั้น
5. หาก Chrome ปิดตัวลงหรือแครช สคริปต์ `launch_kiosk.bat` จะเปิด Chrome ขึ้นมาใหม่ภายใน 2 วินาทีโดยอัตโนมัติ

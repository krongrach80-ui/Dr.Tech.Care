<?php
/**
 * Moh Tech Care - Database Connection (PDO)
 * Strict PDO prepared statements, InnoDB utf8mb4, Asia/Bangkok (+07:00)
 */

class Database {
    private static ?PDO $instance = null;
    private static string $activeDriver = 'mysql';

    public static function getConnection(): PDO {
        if (self::$instance === null) {
            $config = require __DIR__ . '/config.php';
            $dbConfig = $config['database'];

            // Ensure storage directories exist
            self::ensureStorageDirectories($config['storage'] ?? []);

            // Attempt MySQL connection first
            try {
                $dsn = "mysql:host={$dbConfig['host']};port={$dbConfig['port']};dbname={$dbConfig['database']};charset={$dbConfig['charset']}";
                $pdo = new PDO($dsn, $dbConfig['username'], $dbConfig['password'], [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                    PDO::ATTR_TIMEOUT => 2
                ]);
                $pdo->exec("SET time_zone = '+07:00'");
                self::$instance = $pdo;
                self::$activeDriver = 'mysql';
            } catch (PDOException $e) {
                // If MySQL is not running or DB does not exist, use SQLite fallback for 100% offline uptime
                $sqlitePath = $dbConfig['sqlite_path'];
                $dir = dirname($sqlitePath);
                if (!is_dir($dir)) {
                    mkdir($dir, 0777, true);
                }
                
                $isNewDb = !file_exists($sqlitePath);
                $pdo = new PDO("sqlite:" . $sqlitePath, null, null, [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                ]);
                $pdo->exec("PRAGMA foreign_keys = ON;");
                self::$instance = $pdo;
                self::$activeDriver = 'sqlite';

                if ($isNewDb) {
                    self::bootstrapSqliteDatabase($pdo);
                }
            }
        }

        return self::$instance;
    }

    public static function getDriver(): string {
        return self::$activeDriver;
    }

    private static function ensureStorageDirectories(array $storage): void {
        foreach ($storage as $key => $dir) {
            if ($dir && !is_dir($dir)) {
                @mkdir($dir, 0775, true);
            }
        }
    }

    private static function bootstrapSqliteDatabase(PDO $pdo): void {
        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    full_name TEXT NOT NULL,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL,
                    phone TEXT DEFAULT '-',
                    email TEXT DEFAULT '-',
                    status TEXT DEFAULT 'active',
                    must_change_password INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS patient_profiles (
                    patient_id TEXT PRIMARY KEY,
                    age INTEGER NOT NULL,
                    gender TEXT DEFAULT 'male',
                    admission_date DATE NOT NULL,
                    assigned_pt_id TEXT,
                    treatment_status TEXT DEFAULT 'active',
                    initial_symptoms TEXT,
                    underlying_diseases TEXT DEFAULT '-',
                    drug_allergies TEXT DEFAULT '-',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (assigned_pt_id) REFERENCES users(id) ON DELETE SET NULL
                );

                CREATE TABLE IF NOT EXISTS pt_profiles (
                    pt_id TEXT PRIMARY KEY,
                    license_number TEXT NOT NULL,
                    department TEXT DEFAULT 'Musculoskeletal',
                    bio TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (pt_id) REFERENCES users(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS face_templates (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    template_type TEXT DEFAULT 'average',
                    frame_index INTEGER DEFAULT 0,
                    embedding TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS auth_sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    ip_address TEXT NOT NULL,
                    user_agent TEXT NOT NULL,
                    device_type TEXT DEFAULT 'Desktop',
                    last_activity DATETIME NOT NULL,
                    expires_at DATETIME NOT NULL,
                    is_revoked INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS exercises (
                    id TEXT PRIMARY KEY,
                    name_th TEXT NOT NULL,
                    name_en TEXT NOT NULL,
                    category TEXT NOT NULL,
                    type TEXT DEFAULT 'single',
                    default_reps INTEGER DEFAULT 10,
                    default_sets INTEGER DEFAULT 3,
                    default_rest_seconds INTEGER DEFAULT 30,
                    instructions TEXT,
                    benefits TEXT,
                    media_path TEXT,
                    is_active INTEGER DEFAULT 1,
                    created_by TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (created_by) REFERENCES users(id)
                );

                CREATE TABLE IF NOT EXISTS preset_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    preset_id TEXT NOT NULL,
                    exercise_id TEXT NOT NULL,
                    order_index INTEGER DEFAULT 0,
                    reps INTEGER DEFAULT 10,
                    sets INTEGER DEFAULT 3,
                    rest_seconds INTEGER DEFAULT 30,
                    FOREIGN KEY (preset_id) REFERENCES exercises(id) ON DELETE CASCADE,
                    FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS appointments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    patient_id TEXT NOT NULL,
                    pt_id TEXT,
                    appointment_date DATE NOT NULL,
                    status TEXT DEFAULT 'scheduled',
                    notes TEXT,
                    created_by TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (pt_id) REFERENCES users(id) ON DELETE SET NULL
                );

                CREATE TABLE IF NOT EXISTS routine_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    appointment_id INTEGER NOT NULL,
                    exercise_id TEXT NOT NULL,
                    order_index INTEGER DEFAULT 0,
                    reps INTEGER DEFAULT 10,
                    sets INTEGER DEFAULT 3,
                    rest_seconds INTEGER DEFAULT 30,
                    custom_instructions TEXT,
                    status TEXT DEFAULT 'pending',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
                    FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS session_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    appointment_id INTEGER,
                    patient_id TEXT NOT NULL,
                    exercise_id TEXT NOT NULL,
                    routine_item_id INTEGER,
                    started_at DATETIME NOT NULL,
                    ended_at DATETIME NOT NULL,
                    correct_reps INTEGER DEFAULT 0,
                    incorrect_reps INTEGER DEFAULT 0,
                    accuracy_percent REAL DEFAULT 0.0,
                    score INTEGER DEFAULT 0,
                    duration_seconds INTEGER DEFAULT 0,
                    status TEXT DEFAULT 'completed',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
                    FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS medical_notes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    patient_id TEXT NOT NULL,
                    author_id TEXT NOT NULL,
                    author_role TEXT NOT NULL,
                    author_name TEXT NOT NULL,
                    header_stamp TEXT NOT NULL,
                    note_content TEXT NOT NULL,
                    referenced_note_id INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (author_id) REFERENCES users(id)
                );

                CREATE TABLE IF NOT EXISTS temporary_coverages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    patient_id TEXT NOT NULL,
                    owner_pt_id TEXT NOT NULL,
                    cover_pt_id TEXT NOT NULL,
                    start_date DATE NOT NULL,
                    end_date DATE NOT NULL,
                    reason TEXT,
                    status TEXT DEFAULT 'active',
                    created_by TEXT NOT NULL,
                    revoked_by TEXT,
                    revoked_at DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (owner_pt_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (cover_pt_id) REFERENCES users(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT,
                    user_name TEXT,
                    user_role TEXT,
                    ip_address TEXT NOT NULL,
                    device_type TEXT DEFAULT 'Desktop',
                    action TEXT NOT NULL,
                    details TEXT,
                    security_status TEXT DEFAULT 'Normal',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS banned_ips (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ip_address TEXT NOT NULL UNIQUE,
                    reason TEXT NOT NULL,
                    banned_by TEXT NOT NULL,
                    banned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    is_active INTEGER DEFAULT 1
                );
            ");

            // Seed initial data
            $pdo->exec("
                INSERT OR IGNORE INTO users (id, full_name, username, password_hash, role, phone, email, status, must_change_password) VALUES
                ('A-001', 'นพ. วรชัย ศิริวงศ์ (Dr. Worachai S.)', 'admin', '$2y$10$wT0l72W2a0oM6pYf1JzG/OQp7lJt04b9J4B3j97H5c6Q1fF1NqD0S', 'admin', '081-555-0101', 'director@mohtechcare.local', 'active', 0),
                ('T-001', 'กภ. วริศรา นามสมมติ (PT Varisara N.)', 'pt.varisara', '$2y$10$wT0l72W2a0oM6pYf1JzG/OQp7lJt04b9J4B3j97H5c6Q1fF1NqD0S', 'pt', '089-111-2233', 'varisara.pt@mohtechcare.local', 'active', 0),
                ('T-002', 'กภ. สมพงษ์ ใจอารีย์ (PT Sompong J.)', 'pt.sompong', '$2y$10$wT0l72W2a0oM6pYf1JzG/OQp7lJt04b9J4B3j97H5c6Q1fF1NqD0S', 'pt', '089-222-3344', 'sompong.pt@mohtechcare.local', 'active', 0),
                ('P-1001', 'นายสมชาย มีสุข (Somchai Meesook)', 'somchai.m', '$2y$10$wT0l72W2a0oM6pYf1JzG/OQp7lJt04b9J4B3j97H5c6Q1fF1NqD0S', 'patient', '086-123-4567', '-', 'active', 0),
                ('P-1002', 'นางวิภาดา รัตนกุล (Wiphada Rattanakul)', 'wiphada.r', '$2y$10$wT0l72W2a0oM6pYf1JzG/OQp7lJt04b9J4B3j97H5c6Q1fF1NqD0S', 'patient', '084-234-5678', '-', 'active', 0);

                INSERT OR IGNORE INTO pt_profiles (pt_id, license_number, department, bio) VALUES
                ('T-001', 'PT-4921', 'Musculoskeletal', 'ผู้เชี่ยวชาญด้านระบบกระดูกและกล้ามเนื้อ ฟื้นฟูข้อไหล่และข้อเข่า ประสบการณ์ 9 ปี'),
                ('T-002', 'PT-5102', 'Neurological', 'ผู้เชี่ยวชาญการฟื้นฟูผู้ป่วยระบบประสาทและหลอดเลือดสมอง (Stroke Rehab) ประสบการณ์ 7 ปี');

                INSERT OR IGNORE INTO patient_profiles (patient_id, age, gender, admission_date, assigned_pt_id, treatment_status, initial_symptoms, underlying_diseases, drug_allergies) VALUES
                ('P-1001', 68, 'male', '2026-10-01', 'T-001', 'active', 'ฟื้นฟูกล้ามเนื้อไหล่และข้อศอกหลังผ่าตัด เอ็นหัวไหล่อักเสบ', 'ความดันโลหิตสูง', 'Penicillin'),
                ('P-1002', 62, 'female', '2026-09-25', 'T-001', 'active', 'กายภาพบำบัดฟื้นฟูข้อเข่าเสื่อมระยะแรก', '-', '-');

                INSERT OR IGNORE INTO exercises (id, name_th, name_en, category, type, default_reps, default_sets, default_rest_seconds, instructions, benefits, media_path, is_active, created_by) VALUES
                ('MG-01', 'เกมเป่าลูกโป่งเอื้อมจับ', 'Balloon Pop', 'Minigame', 'single', 10, 3, 20, 'ยกมือขึ้นเอื้อมสัมผัสลูกโป่งที่ลอยขึ้นมาให้แตก', 'เพิ่ม Range of Motion หัวไหล่ และความเร็วในการตอบสนอง', '/exercise-media/mini-games/MG-01/cover_image.png', 1, 'A-001'),
                ('MG-02', 'เกมจับดาวนำวิถี', 'Reach & Catch', 'Minigame', 'single', 12, 3, 25, 'เอื้อมมือสัมผัสกลุ่มดาวตามตำแหน่งที่ระบุบนหน้าจอ', 'ฟื้นฟู Coordination และความมั่นคงในการเอื้อมของแขนสองข้าง', '/exercise-media/mini-games/MG-02/cover_image.png', 1, 'A-001'),
                ('EX-01', 'กางแขนยกด้านข้าง', 'Shoulder Raise', 'Shoulder', 'single', 10, 3, 30, 'กางแขนออกด้านข้างช้าๆ จนถึงระดับไหล่', 'เพิ่มกำลังกล้ามเนื้อ Deltoid', '/exercise-media/poses/shoulder_raise.png', 1, 'A-001');

                INSERT OR IGNORE INTO appointments (id, patient_id, pt_id, appointment_date, status, notes, created_by) VALUES
                (1, 'P-1001', 'T-001', '2026-10-15', 'scheduled', 'นัดหมายกายภาพประจำวัน (Kiosk Session)', 'T-001');

                INSERT OR IGNORE INTO routine_items (id, appointment_id, exercise_id, order_index, reps, sets, rest_seconds, custom_instructions, status) VALUES
                (1, 1, 'MG-01', 1, 10, 3, 20, 'ฝึกเอื้อมแขนต่อเนื่อง รักษาความเร็วสม่ำเสมอ', 'pending'),
                (2, 1, 'MG-02', 2, 12, 3, 25, 'พยายามเหยียดแขนให้สุดก่อนแตะดวงดาว', 'pending');

                INSERT OR IGNORE INTO audit_logs (user_id, user_name, user_role, ip_address, device_type, action, details, security_status) VALUES
                ('A-001', 'นพ. วรชัย ศิริวงศ์', 'admin', '127.0.0.1', 'Desktop', 'SYSTEM_INIT', 'ระบบ Moh Tech Care เริ่มต้นทำงานและโหลดโครงสร้างฐานข้อมูล SSOT สมบูรณ์', 'Normal');
            ");
        } catch (Exception $e) {
            error_log('Database SQLite bootstrap error: ' . $e->getMessage());
        }
    }
}

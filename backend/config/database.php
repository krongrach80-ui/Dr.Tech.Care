<?php
/**
 * Strong Care - Database Connection (PDO)
 * Supports MySQL / MariaDB (XAMPP) with SQLite auto-fallback
 */

class Database {
    private static ?PDO $instance = null;
    private static string $activeDriver = 'mysql';

    public static function getConnection(): PDO {
        if (self::$instance === null) {
            $config = require __DIR__ . '/config.php';
            $dbConfig = $config['database'];

            // Attempt MySQL connection first
            try {
                $dsn = "mysql:host={$dbConfig['host']};port={$dbConfig['port']};dbname={$dbConfig['database']};charset={$dbConfig['charset']}";
                $pdo = new PDO($dsn, $dbConfig['username'], $dbConfig['password'], [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                    PDO::ATTR_TIMEOUT => 2
                ]);
                self::$instance = $pdo;
                self::$activeDriver = 'mysql';
                self::ensureTables($pdo);
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
                self::$instance = $pdo;
                self::$activeDriver = 'sqlite';

                self::ensureTables($pdo);
                if ($isNewDb) {
                    self::seedInitialData($pdo);
                }
            }
        }

        return self::$instance;
    }

    public static function getDriver(): string {
        return self::$activeDriver;
    }

    private static function ensureTables(PDO $pdo): void {
        try {
            if (self::$activeDriver === 'mysql') {
                $pdo->exec("
                    CREATE TABLE IF NOT EXISTS users (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        name VARCHAR(150) NOT NULL,
                        role ENUM('patient', 'caregiver', 'therapist', 'admin') DEFAULT 'patient',
                        status ENUM('active', 'inactive') DEFAULT 'active',
                        patient_id INT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

                    CREATE TABLE IF NOT EXISTS patients (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        user_id INT NULL,
                        patient_code VARCHAR(50) NOT NULL UNIQUE,
                        name VARCHAR(150) NOT NULL,
                        age INT NOT NULL,
                        gender ENUM('male', 'female', 'other') DEFAULT 'male',
                        notes TEXT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

                    CREATE TABLE IF NOT EXISTS face_embeddings (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        user_id INT NULL,
                        patient_id INT NOT NULL,
                        embedding MEDIUMTEXT NOT NULL,
                        angle_tag VARCHAR(50) DEFAULT 'center',
                        quality_score DECIMAL(5,2) DEFAULT 100.00,
                        model_version VARCHAR(50) DEFAULT 'StrongCare-FaceMesh-128D-v1.0',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

                    CREATE TABLE IF NOT EXISTS exercises (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        name VARCHAR(150) NOT NULL,
                        slug VARCHAR(100) NOT NULL UNIQUE,
                        category VARCHAR(100) DEFAULT 'Upper Body',
                        description TEXT NOT NULL,
                        target_joint VARCHAR(100) NOT NULL,
                        target_angle DECIMAL(5,2) NOT NULL,
                        min_angle DECIMAL(5,2) NOT NULL,
                        max_angle DECIMAL(5,2) NOT NULL,
                        target_reps INT NOT NULL DEFAULT 10,
                        difficulty ENUM('beginner', 'intermediate', 'advanced') DEFAULT 'beginner',
                        instructions TEXT,
                        configuration TEXT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

                    CREATE TABLE IF NOT EXISTS sessions (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        patient_id INT NOT NULL,
                        exercise_id INT NOT NULL,
                        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        ended_at TIMESTAMP NULL,
                        total_reps INT NOT NULL DEFAULT 0,
                        correct_reps INT NOT NULL DEFAULT 0,
                        accuracy DECIMAL(5,2) NOT NULL DEFAULT 0.00,
                        avg_duration_per_rep DECIMAL(6,2) DEFAULT 0.00,
                        max_angle DECIMAL(5,2) DEFAULT 0.00,
                        avg_angle DECIMAL(5,2) DEFAULT 0.00,
                        rom DECIMAL(5,2) DEFAULT 0.00,
                        duration INT DEFAULT 0,
                        status ENUM('in_progress', 'completed', 'cancelled') DEFAULT 'completed',
                        notes TEXT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

                    CREATE TABLE IF NOT EXISTS session_results (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        session_id INT NOT NULL,
                        rep_number INT NOT NULL,
                        angle DECIMAL(5,2) NOT NULL,
                        accuracy DECIMAL(5,2) NOT NULL,
                        rom DECIMAL(5,2) DEFAULT 0.00,
                        duration DECIMAL(6,2) NOT NULL DEFAULT 0.00,
                        is_correct TINYINT(1) NOT NULL DEFAULT 1,
                        feedback VARCHAR(255) DEFAULT 'Good form',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

                    CREATE TABLE IF NOT EXISTS safety_events (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        session_id INT NOT NULL,
                        event_type VARCHAR(100) NOT NULL,
                        severity ENUM('NORMAL', 'CAUTION', 'CRITICAL_STOP') NOT NULL,
                        message TEXT NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

                    CREATE TABLE IF NOT EXISTS adaptive_recommendations (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        patient_id INT NOT NULL,
                        session_id INT NULL,
                        previous_config TEXT NOT NULL,
                        proposed_config TEXT NOT NULL,
                        status VARCHAR(50) DEFAULT 'pending',
                        model_version VARCHAR(100) DEFAULT 'StrongCare-Biomechanics-v1.0',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

                    CREATE TABLE IF NOT EXISTS approval_audits (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        recommendation_id VARCHAR(100) NOT NULL,
                        approved_by VARCHAR(150) NOT NULL,
                        decision ENUM('APPROVED', 'MODIFIED', 'REJECTED') NOT NULL,
                        previous_config TEXT NOT NULL,
                        final_config TEXT NOT NULL,
                        audit_note TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

                    CREATE TABLE IF NOT EXISTS auth_tokens (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        token_hash VARCHAR(64) NOT NULL UNIQUE,
                        patient_id INT NULL,
                        role VARCHAR(50) DEFAULT 'patient',
                        expires_at DATETIME NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

                    CREATE TABLE IF NOT EXISTS appointments (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        patient_id INT NOT NULL,
                        therapist_id INT NULL,
                        appointment_date DATE NOT NULL,
                        time_slot VARCHAR(50) DEFAULT '09:30 - 10:30',
                        station VARCHAR(100) DEFAULT 'ตู้ Kiosk 1',
                        training_modes JSON NULL,
                        notes TEXT NULL,
                        status VARCHAR(50) DEFAULT 'scheduled',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                ");
            } else {
                $pdo->exec("
                    CREATE TABLE IF NOT EXISTS users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        role TEXT DEFAULT 'patient',
                        status TEXT DEFAULT 'active',
                        patient_id INTEGER,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS patients (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER,
                        patient_code TEXT NOT NULL UNIQUE,
                        name TEXT NOT NULL,
                        age INTEGER NOT NULL,
                        gender TEXT DEFAULT 'male',
                        notes TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS face_embeddings (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER,
                        patient_id INTEGER NOT NULL,
                        embedding TEXT NOT NULL,
                        angle_tag TEXT DEFAULT 'center',
                        quality_score REAL DEFAULT 100.0,
                        model_version TEXT DEFAULT 'StrongCare-FaceMesh-128D-v1.0',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS exercises (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        slug TEXT NOT NULL UNIQUE,
                        category TEXT DEFAULT 'Upper Body',
                        description TEXT NOT NULL,
                        target_joint TEXT NOT NULL,
                        target_angle REAL NOT NULL,
                        min_angle REAL NOT NULL,
                        max_angle REAL NOT NULL,
                        target_reps INTEGER NOT NULL DEFAULT 10,
                        difficulty TEXT DEFAULT 'beginner',
                        instructions TEXT,
                        configuration TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS sessions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        patient_id INTEGER NOT NULL,
                        exercise_id INTEGER NOT NULL,
                        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        ended_at DATETIME,
                        total_reps INTEGER NOT NULL DEFAULT 0,
                        correct_reps INTEGER NOT NULL DEFAULT 0,
                        accuracy REAL NOT NULL DEFAULT 0.0,
                        avg_duration_per_rep REAL DEFAULT 0.0,
                        max_angle REAL DEFAULT 0.0,
                        avg_angle REAL DEFAULT 0.0,
                        rom REAL DEFAULT 0.0,
                        duration INTEGER DEFAULT 0,
                        status TEXT DEFAULT 'completed',
                        notes TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS session_results (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id INTEGER NOT NULL,
                        rep_number INTEGER NOT NULL,
                        angle REAL NOT NULL,
                        accuracy REAL NOT NULL,
                        rom REAL DEFAULT 0.0,
                        duration REAL NOT NULL DEFAULT 0.0,
                        is_correct INTEGER NOT NULL DEFAULT 1,
                        feedback TEXT DEFAULT 'Good form',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS safety_events (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id INTEGER NOT NULL,
                        event_type TEXT NOT NULL,
                        severity TEXT NOT NULL,
                        message TEXT NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS adaptive_recommendations (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        patient_id INTEGER NOT NULL,
                        session_id INTEGER,
                        previous_config TEXT NOT NULL,
                        proposed_config TEXT NOT NULL,
                        status TEXT DEFAULT 'pending',
                        model_version TEXT DEFAULT 'StrongCare-Biomechanics-v1.0',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS approval_audits (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        recommendation_id TEXT NOT NULL,
                        approved_by TEXT NOT NULL,
                        decision TEXT NOT NULL,
                        previous_config TEXT NOT NULL,
                        final_config TEXT NOT NULL,
                        audit_note TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS auth_tokens (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        token_hash TEXT NOT NULL UNIQUE,
                        patient_id INTEGER,
                        role TEXT DEFAULT 'patient',
                        expires_at DATETIME NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS appointments (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        patient_id INTEGER NOT NULL,
                        therapist_id INTEGER,
                        appointment_date TEXT NOT NULL,
                        time_slot TEXT DEFAULT '09:30 - 10:30',
                        station TEXT DEFAULT 'ตู้ Kiosk 1',
                        training_modes TEXT,
                        notes TEXT,
                        status TEXT DEFAULT 'scheduled',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    );
                ");
            }
        } catch (Exception $e) {
            error_log('Database ensure tables error: ' . $e->getMessage());
        }
    }

    private static function seedInitialData(PDO $pdo): void {
        try {
            $pdo->exec("
                INSERT INTO users (name, role, status, patient_id) VALUES
                ('คุณสมชาย มีสุข', 'patient', 'active', 1),
                ('คุณวิภาดา รัตนกุล', 'patient', 'active', 2),
                ('กภ. วริศรา นามสมมติ', 'therapist', 'active', NULL),
                ('คุณวิภา ผู้ดูแล', 'caregiver', 'active', 1);

                INSERT INTO patients (patient_code, name, age, gender, notes) VALUES
                ('PT-2026-001', 'คุณสมชาย มีสุข (Somchai M.)', 68, 'male', 'ฟื้นฟูกล้ามเนื้อไหล่และข้อศอกหลังผ่าตัด เอ็นหัวไหล่อักเสบ (Rotator Cuff) - โหมดผู้สูงอายุ'),
                ('PT-2026-002', 'คุณวิภาดา รัตนกุล (Wiphada R.)', 62, 'female', 'กายภาพบำบัดฟื้นฟูข้อเข่าเสื่อมระยะแรก ต้องการเพิ่มความแข็งแรงของ Quad'),
                ('PT-2026-003', 'คุณประสิทธิ์ รุ่งโรจน์ (Prasit R.)', 71, 'male', 'ผู้ป่วยหลังสโตรก (Stroke Rehab) ฟื้นฟูการควบคุมแขนและข้อศอกข้างขวา'),
                ('PT-2026-004', 'คุณกัลยาณี เจริญพร (Kalyanee C.)', 59, 'female', 'ออฟฟิศซินโดรม ไหล่ห่อ ปวดคอบ่า ฟื้นฟู Range of Motion หัวไหล่');

                INSERT INTO exercises (name, slug, category, description, target_joint, target_angle, min_angle, max_angle, target_reps, difficulty, instructions) VALUES
                ('Shoulder Raise (กางแขนยกด้านข้าง)', 'shoulder_raise', 'Upper Body', 'กางแขนยกขึ้นด้านข้างระดับไหล่ ช่วยเพิ่มช่วงการเคลื่อนไหวข้อไหล่และความแข็งแรงของกล้ามเนื้อเดลทอยด์', 'Right Shoulder', 120.00, 20.00, 130.00, 10, 'beginner', 'ยืนหรือนั่งหลังตรง กางแขนออกด้านข้างช้าๆ จนถึงระดับไหล่ (ประมาณ 120 องศา) ค้างไว้ 2 วินาที แล้วค่อยๆ ลดแขนลง'),
                ('Elbow Flexion (งอข้อศอก)', 'elbow_flexion', 'Upper Body', 'พับงอข้อศอกขึ้นและเหยียดตรง ช่วยฟื้นฟูกำลังแขนท่อนบนและข้อศอก', 'Right Elbow', 140.00, 30.00, 150.00, 10, 'beginner', 'แนบข้อศอกชิดลำตัว งอข้อศอกยกมือขึ้นช้าๆ ค้างไว้ 1 วินาที แล้วคลายลงสุด'),
                ('Knee Extension (เหยียดเข่าขณะนั่ง)', 'knee_extension', 'Lower Body', 'นั่งบนเก้าอี้แล้วเหยียดเข่าตรงไปข้างหน้า ช่วยเพิ่มกำลังกล้ามเนื้อต้นขาด้านหน้า (Quadriceps)', 'Right Knee', 160.00, 80.00, 175.00, 10, 'beginner', 'นั่งเก้าอี้หลังพิงพนัก เท้าแตะพื้น ค่อยๆ เตะขาเหยียดตรงขนานพื้น ค้างไว้ 2 วินาที แล้ววางลงช้าๆ'),
                ('Chair Squat (ลุกนั่งเก้าอี้)', 'chair_squat', 'Lower Body', 'ฝึกการลุกและนั่งลงบนเก้าอี้อย่างถูกวิธี เพื่อเพิ่มกำลังขาและการทรงตัวสำหรับผู้สูงอายุ', 'Hip & Knee', 90.00, 70.00, 110.00, 8, 'intermediate', 'ยืนหน้าเก้าอี้ ย่อเข่าและสะโพกลงเหมือนจะนั่งจนแตะเบาะเก้าอี้เบาๆ ค้างไว้ 2 วินาที แล้วดันตัวยืนขึ้นตรง');

                INSERT INTO sessions (patient_id, exercise_id, started_at, ended_at, total_reps, correct_reps, accuracy, avg_duration_per_rep, max_angle, avg_angle, rom, duration, status, notes) VALUES
                (1, 1, datetime('now', '-2 days'), datetime('now', '-2 days', '+4 minutes'), 10, 9, 90.00, 3.2, 118.5, 112.0, 98.5, 240, 'completed', 'ผู้ป่วยทำท่าได้ดี มีอาการล้าเล็กน้อยในช่วง 2 ครั้งสุดท้าย'),
                (1, 1, datetime('now', '-1 day'), datetime('now', '-1 day', '+4 minutes'), 10, 10, 95.00, 3.1, 122.0, 116.8, 102.0, 245, 'completed', 'การควบคุมความเร็วสม่ำเสมอ ฟอร์มสวยงาม ไม่ยกไหล่เกร็ง');

                INSERT INTO session_results (session_id, rep_number, angle, accuracy, rom, duration, is_correct, feedback) VALUES
                (2, 1, 121.5, 96.0, 101.5, 3.0, 1, 'ยอดเยี่ยม มุมถูกต้องและจังหวะดี'),
                (2, 2, 122.0, 98.0, 102.0, 3.1, 1, 'ยอดเยี่ยม มุมถูกต้องและจังหวะดี'),
                (2, 3, 120.0, 99.0, 100.0, 2.9, 1, 'ยอดเยี่ยม ฟอร์มสมบูรณ์แบบ');

                INSERT INTO safety_events (session_id, event_type, severity, message) VALUES
                (1, 'TRUNK_LEAN', 'CAUTION', 'ตรวจพบลำตัวเอียง 14° ขณะยกแขนครั้งที่ 8 แจ้งเตือนด้วยเสียงเรียบร้อย');

                INSERT INTO adaptive_recommendations (patient_id, session_id, previous_config, proposed_config, status, model_version) VALUES
                (1, 2, '{\"target_angle\": 110, \"target_reps\": 8}', '{\"target_angle\": 120, \"target_reps\": 10}', 'approved', 'StrongCare-Biomechanics-v1.0');

                INSERT INTO approval_audits (recommendation_id, approved_by, decision, previous_config, final_config, audit_note) VALUES
                ('REC-2026-001', 'กภ. วริศรา (นักกายภาพบำบัดประจำตัว)', 'APPROVED', '{\"target_angle\": 110, \"target_reps\": 8}', '{\"target_angle\": 120, \"target_reps\": 10}', 'ผู้ป่วยทำผลงานได้ดีเยี่ยม ความแม่นยำ 95% อนุมัติปรับเพิ่มเป้าหมาย');
            ");
        } catch (Exception $e) {
            error_log('Database seed error: ' . $e->getMessage());
        }
    }
}

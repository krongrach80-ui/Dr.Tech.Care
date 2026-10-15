-- ==============================================================================
-- Moh Tech Care — Production Schema
-- Single Source of Truth (SSOT) for Kiosk, Super Admin, and PT Workspace
-- Timezone: Asia/Bangkok (+07:00) | Charset: utf8mb4 | Engine: InnoDB
-- ==============================================================================

SET NAMES utf8mb4;
SET time_zone = '+07:00';
SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------------------------
-- 1. USERS TABLE
-- IDs: Admin A-###, PT T-###, Patient P-####
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS users;
CREATE TABLE users (
    id VARCHAR(50) NOT NULL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'pt', 'patient') NOT NULL,
    phone VARCHAR(50) NOT NULL DEFAULT '-',
    email VARCHAR(150) NOT NULL DEFAULT '-',
    status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
    must_change_password TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_users_role (role),
    INDEX idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 2. PATIENT PROFILES
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS patient_profiles;
CREATE TABLE patient_profiles (
    patient_id VARCHAR(50) NOT NULL PRIMARY KEY,
    age INT NOT NULL,
    gender ENUM('male', 'female', 'other') NOT NULL DEFAULT 'male',
    admission_date DATE NOT NULL,
    assigned_pt_id VARCHAR(50) NULL,
    treatment_status ENUM('active', 'discharged') NOT NULL DEFAULT 'active',
    initial_symptoms TEXT NULL,
    underlying_diseases VARCHAR(255) NOT NULL DEFAULT '-',
    drug_allergies VARCHAR(255) NOT NULL DEFAULT '-',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_patient_user FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_pt FOREIGN KEY (assigned_pt_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_patient_assigned_pt (assigned_pt_id),
    INDEX idx_patient_treatment_status (treatment_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 3. PT PROFILES
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS pt_profiles;
CREATE TABLE pt_profiles (
    pt_id VARCHAR(50) NOT NULL PRIMARY KEY,
    license_number VARCHAR(100) NOT NULL,
    department ENUM('Musculoskeletal', 'Neurological', 'Geriatric', 'Sports PT') NOT NULL DEFAULT 'Musculoskeletal',
    bio TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_pt_user FOREIGN KEY (pt_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_pt_department (department)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 4. FACE TEMPLATES
-- Storing 10-snap embeddings & computed average template (128D/512D JSON array)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS face_templates;
CREATE TABLE face_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    template_type ENUM('average', 'frame') NOT NULL DEFAULT 'average',
    frame_index INT NOT NULL DEFAULT 0,
    embedding MEDIUMTEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_face_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_face_user (user_id),
    INDEX idx_face_type (template_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 5. AUTH SESSIONS (Server-side Session Storage for Force Logout)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS auth_sessions;
CREATE TABLE auth_sessions (
    id VARCHAR(128) NOT NULL PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    role VARCHAR(50) NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT NOT NULL,
    device_type ENUM('Desktop', 'Kiosk', 'Mobile') NOT NULL DEFAULT 'Desktop',
    last_activity DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    is_revoked TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_session_user (user_id),
    INDEX idx_session_active (is_revoked, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 6. EXERCISES & PRESETS
-- IDs: MG-## (Mini-games), PS-## (Presets), EX-## (Pose/Single Exercises)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS exercises;
CREATE TABLE exercises (
    id VARCHAR(50) NOT NULL PRIMARY KEY,
    name_th VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    category ENUM('Neck', 'Shoulder', 'Back', 'Arm', 'Leg', 'Minigame') NOT NULL,
    type ENUM('single', 'preset') NOT NULL DEFAULT 'single',
    default_reps INT NOT NULL DEFAULT 10,
    default_sets INT NOT NULL DEFAULT 3,
    default_rest_seconds INT NOT NULL DEFAULT 30,
    instructions TEXT NULL,
    benefits TEXT NULL,
    media_path VARCHAR(255) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_by VARCHAR(50) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_exercise_creator FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_exercise_category (category),
    INDEX idx_exercise_type (type),
    INDEX idx_exercise_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 7. PRESET ITEMS
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS preset_items;
CREATE TABLE preset_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    preset_id VARCHAR(50) NOT NULL,
    exercise_id VARCHAR(50) NOT NULL,
    order_index INT NOT NULL DEFAULT 0,
    reps INT NOT NULL DEFAULT 10,
    sets INT NOT NULL DEFAULT 3,
    rest_seconds INT NOT NULL DEFAULT 30,
    CONSTRAINT fk_preset_parent FOREIGN KEY (preset_id) REFERENCES exercises(id) ON DELETE CASCADE,
    CONSTRAINT fk_preset_item FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE,
    INDEX idx_preset_lookup (preset_id, order_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 8. APPOINTMENTS
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS appointments;
CREATE TABLE appointments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id VARCHAR(50) NOT NULL,
    pt_id VARCHAR(50) NULL,
    appointment_date DATE NOT NULL,
    status ENUM('scheduled', 'completed', 'missed', 'cancelled') NOT NULL DEFAULT 'scheduled',
    notes TEXT NULL,
    created_by VARCHAR(50) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_appointment_patient FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_appointment_pt FOREIGN KEY (pt_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_appointment_schedule (patient_id, appointment_date),
    INDEX idx_appointment_date_status (appointment_date, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 9. ROUTINE ITEMS
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS routine_items;
CREATE TABLE routine_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    appointment_id INT NOT NULL,
    exercise_id VARCHAR(50) NOT NULL,
    order_index INT NOT NULL DEFAULT 0,
    reps INT NOT NULL DEFAULT 10,
    sets INT NOT NULL DEFAULT 3,
    rest_seconds INT NOT NULL DEFAULT 30,
    custom_instructions TEXT NULL,
    status ENUM('pending', 'completed', 'skipped') NOT NULL DEFAULT 'pending',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_routine_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
    CONSTRAINT fk_routine_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE,
    INDEX idx_routine_order (appointment_id, order_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 10. SESSION LOGS (Feeds Kiosk Summary, Analytics, Calendar Dots)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS session_logs;
CREATE TABLE session_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    appointment_id INT NULL,
    patient_id VARCHAR(50) NOT NULL,
    exercise_id VARCHAR(50) NOT NULL,
    routine_item_id INT NULL,
    started_at DATETIME NOT NULL,
    ended_at DATETIME NOT NULL,
    correct_reps INT NOT NULL DEFAULT 0,
    incorrect_reps INT NOT NULL DEFAULT 0,
    accuracy_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    score INT NOT NULL DEFAULT 0,
    duration_seconds INT NOT NULL DEFAULT 0,
    status ENUM('completed', 'partial') NOT NULL DEFAULT 'completed',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_log_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
    CONSTRAINT fk_log_patient FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_log_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE,
    INDEX idx_log_patient_date (patient_id, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 11. MEDICAL NOTES (Strictly Append-Only via Triggers)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS medical_notes;
CREATE TABLE medical_notes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id VARCHAR(50) NOT NULL,
    author_id VARCHAR(50) NOT NULL,
    author_role ENUM('admin', 'pt') NOT NULL,
    author_name VARCHAR(150) NOT NULL,
    header_stamp VARCHAR(255) NOT NULL,
    note_content TEXT NOT NULL,
    referenced_note_id INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_note_patient FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_note_author FOREIGN KEY (author_id) REFERENCES users(id),
    CONSTRAINT fk_note_referenced FOREIGN KEY (referenced_note_id) REFERENCES medical_notes(id) ON DELETE SET NULL,
    INDEX idx_note_patient (patient_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- IMMUTABLE TRIGGERS FOR MEDICAL NOTES
DROP TRIGGER IF EXISTS trg_medical_notes_no_update;
DELIMITER $$
CREATE TRIGGER trg_medical_notes_no_update
BEFORE UPDATE ON medical_notes
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Medical notes are strictly append-only and cannot be updated.';
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_medical_notes_no_delete;
DELIMITER $$
CREATE TRIGGER trg_medical_notes_no_delete
BEFORE DELETE ON medical_notes
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Medical notes are strictly append-only and cannot be deleted.';
END$$
DELIMITER ;

-- ------------------------------------------------------------------------------
-- 12. TEMPORARY CASE DELEGATION
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS temporary_coverages;
CREATE TABLE temporary_coverages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id VARCHAR(50) NOT NULL,
    owner_pt_id VARCHAR(50) NOT NULL,
    cover_pt_id VARCHAR(50) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT NULL,
    status ENUM('active', 'revoked', 'expired') NOT NULL DEFAULT 'active',
    created_by VARCHAR(50) NOT NULL,
    revoked_by VARCHAR(50) NULL,
    revoked_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_cov_patient FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_cov_owner FOREIGN KEY (owner_pt_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_cov_cover FOREIGN KEY (cover_pt_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_cov_lookup (patient_id, cover_pt_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 13. AUDIT LOGS
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS audit_logs;
CREATE TABLE audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(50) NULL,
    user_name VARCHAR(150) NULL,
    user_role VARCHAR(50) NULL,
    ip_address VARCHAR(45) NOT NULL,
    device_type ENUM('Desktop', 'Kiosk', 'Mobile') NOT NULL DEFAULT 'Desktop',
    action VARCHAR(100) NOT NULL,
    details TEXT NULL,
    security_status ENUM('Normal', 'Suspicious') NOT NULL DEFAULT 'Normal',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_time (created_at),
    INDEX idx_audit_ip (ip_address),
    INDEX idx_audit_security (security_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 14. BANNED IPS
-- Checked in middleware on every request (Kiosk included)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS banned_ips;
CREATE TABLE banned_ips (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ip_address VARCHAR(45) NOT NULL UNIQUE,
    reason VARCHAR(255) NOT NULL,
    banned_by VARCHAR(50) NOT NULL,
    banned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    INDEX idx_banned_ip_lookup (ip_address, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

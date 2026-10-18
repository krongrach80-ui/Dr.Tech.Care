-- Strong Care Database Schema
-- Compatible with MySQL / MariaDB (XAMPP) & SQLite

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    role ENUM('patient', 'caregiver', 'therapist', 'admin') DEFAULT 'patient',
    status ENUM('active', 'inactive') DEFAULT 'active',
    patient_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS face_embeddings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    patient_id INT NOT NULL,
    embedding MEDIUMTEXT NOT NULL,
    angle_tag VARCHAR(50) DEFAULT 'center',
    quality_score DECIMAL(5,2) DEFAULT 100.00,
    model_version VARCHAR(50) DEFAULT 'StrongCare-FaceMesh-128D-v1.0',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS safety_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    severity ENUM('NORMAL', 'CAUTION', 'CRITICAL_STOP') NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS adaptive_recommendations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    session_id INT NULL,
    previous_config TEXT NOT NULL,
    proposed_config TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    model_version VARCHAR(100) DEFAULT 'StrongCare-Biomechanics-v1.0',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS approval_audits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    recommendation_id VARCHAR(100) NOT NULL,
    approved_by VARCHAR(150) NOT NULL,
    decision ENUM('APPROVED', 'MODIFIED', 'REJECTED') NOT NULL,
    previous_config TEXT NOT NULL,
    final_config TEXT NOT NULL,
    audit_note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    patient_id INT NULL,
    role VARCHAR(50) DEFAULT 'patient',
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS appointments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    therapist_id INT NULL,
    appointment_date DATE NOT NULL,
    time_slot VARCHAR(50) DEFAULT '09:30 - 10:30',
    station VARCHAR(100) DEFAULT 'ตู้ Kiosk 1',
    training_modes JSON NULL, -- { "rom": { "enabled": true, "type": "pack", "packId": "...", "poseIds": [] }, "minigame": { "enabled": true, "questionCount": 20 } }
    notes TEXT NULL,
    status VARCHAR(50) DEFAULT 'scheduled',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_sessions_patient ON sessions(patient_id);
CREATE INDEX idx_sessions_exercise ON sessions(exercise_id);
CREATE INDEX idx_session_results_session ON session_results(session_id);
CREATE INDEX idx_safety_events_session ON safety_events(session_id);
CREATE INDEX idx_face_embeddings_patient ON face_embeddings(patient_id);
CREATE INDEX idx_auth_tokens_hash ON auth_tokens(token_hash);
CREATE INDEX idx_appointments_patient ON appointments(patient_id);
CREATE INDEX idx_appointments_date ON appointments(appointment_date);

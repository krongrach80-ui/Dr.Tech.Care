<?php
/**
 * Moh Tech Care - Patient Records Controller (Module 2)
 * Handles Tab 1 (Personal Info), Tab 2 (Append-Only Medical Notes), and Tab 3 (Analytics)
 */

require_once __DIR__ . '/../Repositories/UserRepository.php';
require_once __DIR__ . '/../Repositories/AuditRepository.php';
require_once __DIR__ . '/../Middleware/AuthMiddleware.php';
require_once __DIR__ . '/../Middleware/RbacMiddleware.php';
require_once __DIR__ . '/../../config/Database.php';

class PatientController {
    private UserRepository $userRepo;
    private AuditRepository $auditRepo;
    private PDO $db;

    public function __construct() {
        $this->userRepo = new UserRepository();
        $this->auditRepo = new AuditRepository();
        $this->db = Database::getConnection();
    }

    public function listPatients(): void {
        AuthMiddleware::check();
        $search = $_GET['search'] ?? null;
        $patients = $this->userRepo->getAllUsers('patient', $search);

        echo json_encode([
            'status' => 'success',
            'patients' => $patients
        ], JSON_UNESCAPED_UNICODE);
    }

    public function getPatient(string $id): void {
        AuthMiddleware::check();
        $patient = $this->userRepo->findById($id);

        if (!$patient || $patient['role'] !== 'patient') {
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => 'Patient record not found'], JSON_UNESCAPED_UNICODE);
            return;
        }

        echo json_encode([
            'status' => 'success',
            'patient' => $patient
        ], JSON_UNESCAPED_UNICODE);
    }

    public function updatePersonal(string $id): void {
        AuthMiddleware::check();
        $actor = AuthMiddleware::getUser();
        $patient = $this->userRepo->findById($id);

        if (!$patient || $patient['role'] !== 'patient') {
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => 'Patient record not found'], JSON_UNESCAPED_UNICODE);
            return;
        }

        $body = json_decode(file_get_contents('php://input'), true) ?? [];

        $fullName = trim($body['full_name'] ?? $patient['full_name']);
        $age = isset($body['age']) ? (int)$body['age'] : $patient['age'];
        $gender = $body['gender'] ?? $patient['gender'];
        $phone = trim($body['phone'] ?? $patient['phone']) ?: '-';
        $symptoms = $body['initial_symptoms'] ?? $patient['initial_symptoms'];
        $underlying = trim($body['underlying_diseases'] ?? $patient['underlying_diseases']) ?: '-';
        $allergies = trim($body['drug_allergies'] ?? $patient['drug_allergies']) ?: '-';
        $treatmentStatus = $body['treatment_status'] ?? ($patient['treatment_status'] ?? 'active');

        // RBAC Rule: PT may change Assigned PT ONLY on own patients!
        $assignedPtId = $patient['assigned_pt_id'];
        if ($actor['role'] === 'admin') {
            if (array_key_exists('assigned_pt_id', $body)) {
                $assignedPtId = $body['assigned_pt_id'] ?: null;
            }
        } elseif ($actor['role'] === 'pt') {
            if ($patient['assigned_pt_id'] === $actor['user_id'] && array_key_exists('assigned_pt_id', $body)) {
                $assignedPtId = $body['assigned_pt_id'] ?: null;
            }
        }

        $this->db->beginTransaction();
        try {
            // Update users table
            $uStmt = $this->db->prepare("
                UPDATE users
                SET full_name = :name, phone = :phone, updated_at = :upd
                WHERE id = :id
            ");
            $uStmt->execute([
                ':name' => $fullName,
                ':phone' => $phone,
                ':upd' => date('Y-m-d H:i:s'),
                ':id' => $id
            ]);

            // Update patient_profiles table
            $pStmt = $this->db->prepare("
                UPDATE patient_profiles
                SET age = :age, gender = :gender, assigned_pt_id = :pt_id,
                    treatment_status = :t_status, initial_symptoms = :sym,
                    underlying_diseases = :und, drug_allergies = :allg, updated_at = :upd
                WHERE patient_id = :id
            ");
            $pStmt->execute([
                ':age' => $age,
                ':gender' => $gender,
                ':pt_id' => $assignedPtId,
                ':t_status' => $treatmentStatus,
                ':sym' => $symptoms,
                ':und' => $underlying,
                ':allg' => $allergies,
                ':upd' => date('Y-m-d H:i:s'),
                ':id' => $id
            ]);

            $this->db->commit();

            $this->auditRepo->log(
                $actor['user_id'],
                $actor['full_name'],
                $actor['role'],
                BannedIpMiddleware::getClientIp(),
                'Desktop',
                'PATIENT_UPDATE_TAB1',
                "Updated personal record for patient {$id}",
                'Normal'
            );

            $updated = $this->userRepo->findById($id);
            echo json_encode(['status' => 'success', 'patient' => $updated], JSON_UNESCAPED_UNICODE);
        } catch (Exception $e) {
            $this->db->rollBack();
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
        }
    }

    public function getNotes(string $patientId): void {
        AuthMiddleware::check();
        $stmt = $this->db->prepare("
            SELECT * FROM medical_notes
            WHERE patient_id = :pid
            ORDER BY created_at DESC
        ");
        $stmt->execute([':pid' => $patientId]);
        $notes = $stmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'status' => 'success',
            'notes' => $notes
        ], JSON_UNESCAPED_UNICODE);
    }

    public function appendNote(string $patientId): void {
        AuthMiddleware::check();
        $actor = AuthMiddleware::getUser();
        $body = json_decode(file_get_contents('php://input'), true) ?? [];

        $content = trim($body['note_content'] ?? '');
        $refId = !empty($body['referenced_note_id']) ? (int)$body['referenced_note_id'] : null;

        if (!$content) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Note content cannot be empty'], JSON_UNESCAPED_UNICODE);
            return;
        }

        // Server-generated timestamp in DD/MM/YYYY HH:mm
        $now = date('d/m/Y H:i');
        $authorRoleText = $actor['role'] === 'admin' ? 'Admin' : 'PT';
        $headerStamp = "[{$now} - Logged by {$authorRoleText}: {$actor['full_name']}]";

        $stmt = $this->db->prepare("
            INSERT INTO medical_notes (patient_id, author_id, author_role, author_name, header_stamp, note_content, referenced_note_id)
            VALUES (:pid, :aid, :role, :name, :header, :content, :ref)
        ");
        $stmt->execute([
            ':pid' => $patientId,
            ':aid' => $actor['user_id'],
            ':role' => $actor['role'],
            ':name' => $actor['full_name'],
            ':header' => $headerStamp,
            ':content' => $content,
            ':ref' => $refId
        ]);

        $noteId = (int)$this->db->lastInsertId();

        $this->auditRepo->log(
            $actor['user_id'],
            $actor['full_name'],
            $actor['role'],
            BannedIpMiddleware::getClientIp(),
            'Desktop',
            'MEDICAL_NOTE_APPEND',
            "Appended medical note #{$noteId} for patient {$patientId}",
            'Normal'
        );

        $getStmt = $this->db->prepare("SELECT * FROM medical_notes WHERE id = :id");
        $getStmt->execute([':id' => $noteId]);
        $createdNote = $getStmt->fetch(PDO::FETCH_ASSOC);

        http_response_code(201);
        echo json_encode([
            'status' => 'success',
            'note' => $createdNote
        ], JSON_UNESCAPED_UNICODE);
    }

    public function getAnalytics(string $patientId): void {
        AuthMiddleware::check();
        $range = $_GET['range'] ?? '1month';

        $sinceDate = null;
        if ($range === '1week') {
            $sinceDate = date('Y-m-d H:i:s', strtotime('-7 days'));
        } elseif ($range === '1month') {
            $sinceDate = date('Y-m-d H:i:s', strtotime('-30 days'));
        }

        $sql = "
            SELECT sl.*, e.name_th as exercise_name_th, e.name_en as exercise_name_en
            FROM session_logs sl
            JOIN exercises e ON sl.exercise_id = e.id
            WHERE sl.patient_id = :pid
        ";
        $params = [':pid' => $patientId];

        if ($sinceDate) {
            $sql .= " AND sl.started_at >= :since";
            $params[':since'] = $sinceDate;
        }

        $sql .= " ORDER BY sl.started_at DESC";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $totalCorrect = 0;
        $totalIncorrect = 0;
        $totalScore = 0;

        foreach ($logs as $l) {
            $totalCorrect += (int)$l['correct_reps'];
            $totalIncorrect += (int)$l['incorrect_reps'];
            $totalScore += (int)$l['score'];
        }

        $totalReps = $totalCorrect + $totalIncorrect;
        $overallAccuracy = $totalReps > 0 ? round(($totalCorrect / $totalReps) * 100, 2) : 0;

        // Fetch frequency calendar dots (Green = completed, Red = missed)
        $calStmt = $this->db->prepare("
            SELECT appointment_date, status
            FROM appointments
            WHERE patient_id = :pid
            ORDER BY appointment_date ASC
        ");
        $calStmt->execute([':pid' => $patientId]);
        $apptRows = $calStmt->fetchAll(PDO::FETCH_ASSOC);

        $calendarDots = [];
        foreach ($apptRows as $row) {
            $date = $row['appointment_date'];
            if ($row['status'] === 'completed') {
                $calendarDots[$date] = 'completed';
            } elseif ($row['status'] === 'missed') {
                $calendarDots[$date] = 'missed';
            } elseif ($row['status'] === 'scheduled') {
                $calendarDots[$date] = 'scheduled';
            }
        }

        echo json_encode([
            'status' => 'success',
            'logs' => $logs,
            'accuracy_percent' => $overallAccuracy,
            'total_correct' => $totalCorrect,
            'total_incorrect' => $totalIncorrect,
            'total_score' => $totalScore,
            'frequency_calendar' => $calendarDots
        ], JSON_UNESCAPED_UNICODE);
    }
}

<?php
/**
 * Moh Tech Care - Patient Kiosk Controller (v2.1)
 * Handles Facial Recognition Matching, Today's Routine Sync,
 * Next Appointment (Date Only), Session Reset, and Session Logging (including 'placeholder' & 'assisted')
 */

require_once __DIR__ . '/../Repositories/UserRepository.php';
require_once __DIR__ . '/../Repositories/SessionRepository.php';
require_once __DIR__ . '/../Repositories/AuditRepository.php';
require_once __DIR__ . '/../Middleware/BannedIpMiddleware.php';
require_once __DIR__ . '/../Middleware/AuthMiddleware.php';
require_once __DIR__ . '/../../config/Database.php';

class KioskController {
    private UserRepository $userRepo;
    private SessionRepository $sessionRepo;
    private AuditRepository $auditRepo;
    private PDO $db;
    private array $config;

    public function __construct() {
        $this->userRepo = new UserRepository();
        $this->sessionRepo = new SessionRepository();
        $this->auditRepo = new AuditRepository();
        $this->db = Database::getConnection();
        $this->config = require __DIR__ . '/../../config/config.php';
    }

    /**
     * Automatic Face ID login by straight-face scan
     * Issues short-lived scoped kiosk token (role: 'kiosk')
     */
    public function faceLogin(): void {
        $ip = BannedIpMiddleware::getClientIp();
        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $queryEmbedding = $body['embedding'] ?? null;

        if (!$queryEmbedding || !is_array($queryEmbedding)) {
            http_response_code(400);
            echo json_encode([
                'status' => 'error',
                'match' => false,
                'message' => 'Valid facial embedding vector is required'
            ], JSON_UNESCAPED_UNICODE);
            return;
        }

        // Fetch all registered face templates for active patients
        $stmt = $this->db->prepare("
            SELECT ft.user_id, ft.embedding, u.full_name, u.role, u.status
            FROM face_templates ft
            JOIN users u ON ft.user_id = u.id
            WHERE ft.template_type = 'average' AND u.status = 'active'
        ");
        $stmt->execute();
        $templates = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $threshold = (float)($this->config['face_auth']['similarity_threshold'] ?? 0.78);
        $margin = (float)($this->config['face_auth']['margin_threshold'] ?? 0.08);

        $bestScore = -1.0;
        $secondBestScore = -1.0;
        $bestMatch = null;

        foreach ($templates as $tmpl) {
            $savedVector = json_decode($tmpl['embedding'], true);
            if (!is_array($savedVector)) continue;

            $similarity = $this->computeCosineSimilarity($queryEmbedding, $savedVector);

            if ($similarity > $bestScore) {
                $secondBestScore = $bestScore;
                $bestScore = $similarity;
                $bestMatch = $tmpl;
            } elseif ($similarity > $secondBestScore) {
                $secondBestScore = $similarity;
            }
        }

        // Match criteria: bestScore >= threshold AND margin between best and second best
        $hasMargin = ($bestScore - $secondBestScore) >= $margin || $secondBestScore < 0.5;

        if ($bestMatch && $bestScore >= $threshold && $hasMargin) {
            $patientId = $bestMatch['user_id'];
            $fullPatient = $this->userRepo->findById($patientId);

            // Generate short-lived kiosk-scoped session token (role = 'kiosk')
            $token = 'kiosk_' . bin2hex(random_bytes(24));
            $lifetime = 1800; // 30 minutes short TTL

            $this->sessionRepo->createSession(
                $token,
                $patientId,
                'kiosk', // Scoped role
                $ip,
                $_SERVER['HTTP_USER_AGENT'] ?? 'Kiosk Terminal',
                'Kiosk',
                $lifetime
            );

            $this->auditRepo->log(
                $patientId,
                $bestMatch['full_name'],
                'patient',
                $ip,
                'Kiosk',
                'KIOSK_FACE_LOGIN_SUCCESS',
                "Facial match confidence: " . round($bestScore * 100, 2) . "%",
                'Normal'
            );

            echo json_encode([
                'status' => 'success',
                'match' => true,
                'similarity' => round($bestScore, 4),
                'token' => $token,
                'patient' => $fullPatient
            ], JSON_UNESCAPED_UNICODE);
        } else {
            $this->auditRepo->log(
                null,
                'Unknown Kiosk Face',
                'patient',
                $ip,
                'Kiosk',
                'KIOSK_FACE_LOGIN_FAILED',
                "Best score: " . ($bestScore > 0 ? round($bestScore * 100, 2) . "%" : "none"),
                'Normal'
            );

            http_response_code(404);
            echo json_encode([
                'status' => 'error',
                'match' => false,
                'similarity' => round($bestScore, 4),
                'message' => 'ไม่พบบัญชี โปรดติดต่อเจ้าหน้าที่ หรือลองสแกนอีกครั้ง'
            ], JSON_UNESCAPED_UNICODE);
        }
    }

    /**
     * Fetch today's routine for authenticated patient
     * Enforces that kiosk token can only read OWN routine for TODAY
     */
    public function getTodayRoutine(): void {
        AuthMiddleware::check();
        $caller = AuthMiddleware::getUser();
        $callerRole = strtolower($caller['role'] ?? '');
        $requestedPatientId = $_GET['patient_id'] ?? null;

        // If called by kiosk token, MUST match caller's user_id
        if ($callerRole === 'kiosk') {
            $patientId = $caller['user_id'];
            if ($requestedPatientId && $requestedPatientId !== $patientId) {
                http_response_code(403);
                echo json_encode(['status' => 'error', 'message' => 'Forbidden: Kiosk token cannot access other patients\' data'], JSON_UNESCAPED_UNICODE);
                return;
            }
        } else {
            $patientId = $requestedPatientId ?: $caller['user_id'];
        }

        if (!$patientId) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Patient ID is required'], JSON_UNESCAPED_UNICODE);
            return;
        }

        $today = date('Y-m-d');

        // Look for today's appointment
        $stmt = $this->db->prepare("
            SELECT a.*, u.full_name as pt_name
            FROM appointments a
            LEFT JOIN users u ON a.pt_id = u.id
            WHERE a.patient_id = :pid AND a.appointment_date = :today
            LIMIT 1
        ");
        $stmt->execute([':pid' => $patientId, ':today' => $today]);
        $appt = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($appt) {
            // Fetch routine items with exercise details
            $rStmt = $this->db->prepare("
                SELECT ri.*, e.name_th, e.name_en, e.category, e.exercise_type, e.instructions, e.benefits, e.media_path
                FROM routine_items ri
                JOIN exercises e ON ri.exercise_id = e.id
                WHERE ri.appointment_id = :aid
                ORDER BY ri.order_index ASC
            ");
            $rStmt->execute([':aid' => $appt['id']]);
            $items = $rStmt->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode([
                'status' => 'success',
                'has_routine' => count($items) > 0,
                'appointment' => $appt,
                'items' => $items
            ], JSON_UNESCAPED_UNICODE);
        } else {
            // Find next appointment date (date only!)
            $nextDate = $this->fetchNextAppointmentDateOnly($patientId);

            echo json_encode([
                'status' => 'success',
                'has_routine' => false,
                'items' => [],
                'next_appointment_date' => $nextDate
            ], JSON_UNESCAPED_UNICODE);
        }
    }

    /**
     * GET /api/kiosk/next-appointment
     * Returns next appointment DATE ONLY (formatted as DD/MM/YYYY)
     */
    public function getNextAppointment(): void {
        AuthMiddleware::check();
        $caller = AuthMiddleware::getUser();
        $callerRole = strtolower($caller['role'] ?? '');

        $patientId = ($callerRole === 'kiosk') ? $caller['user_id'] : ($_GET['patient_id'] ?? $caller['user_id']);
        if (!$patientId) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Patient ID is required'], JSON_UNESCAPED_UNICODE);
            return;
        }

        $nextDateFormatted = $this->fetchNextAppointmentDateOnly($patientId);

        echo json_encode([
            'status' => 'success',
            'next_appointment_date' => $nextDateFormatted
        ], JSON_UNESCAPED_UNICODE);
    }

    /**
     * POST /api/kiosk/reset
     * Revokes the kiosk token immediately from auth_sessions
     */
    public function resetKioskSession(): void {
        $token = AuthMiddleware::getToken();
        if ($token) {
            $this->sessionRepo->revokeSession($token);
        }

        echo json_encode([
            'status' => 'success',
            'message' => 'Kiosk session reset and token revoked'
        ], JSON_UNESCAPED_UNICODE);
    }

    /**
     * POST /api/kiosk/session-logs
     * Logs session result (including 'placeholder' & 'assisted')
     */
    public function logSession(): void {
        AuthMiddleware::check();
        $caller = AuthMiddleware::getUser();
        $callerRole = strtolower($caller['role'] ?? '');

        $body = json_decode(file_get_contents('php://input'), true) ?? [];

        // If called by kiosk token, ensure patient_id matches
        $patientId = ($callerRole === 'kiosk') ? $caller['user_id'] : trim($body['patient_id'] ?? '');
        $exerciseId = trim($body['exercise_id'] ?? '');
        $apptId = !empty($body['appointment_id']) ? (int)$body['appointment_id'] : null;
        $routineItemId = !empty($body['routine_item_id']) ? (int)$body['routine_item_id'] : null;

        $startedAt = $body['started_at'] ?? date('Y-m-d H:i:s', time() - 300);
        $endedAt = $body['ended_at'] ?? date('Y-m-d H:i:s');
        $correctReps = (int)($body['correct_reps'] ?? 0);
        $incorrectReps = (int)($body['incorrect_reps'] ?? 0);
        $accuracy = (float)($body['accuracy_percent'] ?? 0.0);
        $score = (int)($body['score'] ?? 0);
        $duration = (int)($body['duration_seconds'] ?? 0);
        $status = strtolower($body['status'] ?? 'completed'); // 'completed', 'partial', 'placeholder'
        $assisted = !empty($body['assisted']) ? 1 : 0;
        $staffId = $body['staff_id'] ?? null;

        if (!$patientId || !$exerciseId) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Patient ID and Exercise ID are required'], JSON_UNESCAPED_UNICODE);
            return;
        }

        $this->db->beginTransaction();
        try {
            // Ensure assisted column exists
            $stmt = $this->db->prepare("
                INSERT INTO session_logs (appointment_id, patient_id, exercise_id, routine_item_id, started_at, ended_at, correct_reps, incorrect_reps, accuracy_percent, score, duration_seconds, status, assisted)
                VALUES (:aid, :pid, :exid, :riid, :started, :ended, :creps, :ireps, :acc, :score, :dur, :status, :assisted)
            ");
            $stmt->execute([
                ':aid' => $apptId,
                ':pid' => $patientId,
                ':exid' => $exerciseId,
                ':riid' => $routineItemId,
                ':started' => $startedAt,
                ':ended' => $endedAt,
                ':creps' => $correctReps,
                ':ireps' => $incorrectReps,
                ':acc' => $accuracy,
                ':score' => $score,
                ':dur' => $duration,
                ':status' => $status,
                ':assisted' => $assisted
            ]);

            $logId = (int)$this->db->lastInsertId();

            // Mark routine item as completed
            if ($routineItemId) {
                $updRi = $this->db->prepare("UPDATE routine_items SET status = 'completed' WHERE id = :id");
                $updRi->execute([':id' => $routineItemId]);
            }

            // Check if all items in appointment are completed
            if ($apptId) {
                $checkPending = $this->db->prepare("
                    SELECT COUNT(*) as pending_count
                    FROM routine_items
                    WHERE appointment_id = :aid AND status = 'pending'
                ");
                $checkPending->execute([':aid' => $apptId]);
                $pendingRow = $checkPending->fetch(PDO::FETCH_ASSOC);

                if ((int)$pendingRow['pending_count'] === 0) {
                    $updAppt = $this->db->prepare("UPDATE appointments SET status = 'completed', updated_at = :upd WHERE id = :aid");
                    $updAppt->execute([':upd' => date('Y-m-d H:i:s'), ':aid' => $apptId]);
                }
            }

            $this->db->commit();

            // Audit log (with staff_id if assisted)
            $auditAction = $assisted ? 'KIOSK_ASSISTED_SESSION_LOG' : 'KIOSK_SESSION_LOG';
            $auditDetails = "Logged exercise {$exerciseId} status={$status} reps={$correctReps}/{$incorrectReps}";
            if ($assisted && $staffId) {
                $auditDetails .= " (Staff Assisted by {$staffId})";
            }

            $this->auditRepo->log(
                $staffId ?: $patientId,
                $staffId ? "Staff {$staffId}" : 'Patient via Kiosk',
                $staffId ? 'staff' : 'patient',
                BannedIpMiddleware::getClientIp(),
                'Kiosk',
                $auditAction,
                $auditDetails,
                'Normal'
            );

            echo json_encode([
                'status' => 'success',
                'log_id' => $logId
            ], JSON_UNESCAPED_UNICODE);
        } catch (Exception $e) {
            $this->db->rollBack();
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
        }
    }

    private function fetchNextAppointmentDateOnly(string $patientId): ?string {
        $today = date('Y-m-d');
        $stmt = $this->db->prepare("
            SELECT appointment_date
            FROM appointments
            WHERE patient_id = :pid AND appointment_date > :today AND status = 'scheduled'
            ORDER BY appointment_date ASC
            LIMIT 1
        ");
        $stmt->execute([':pid' => $patientId, ':today' => $today]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($row && !empty($row['appointment_date'])) {
            $time = strtotime($row['appointment_date']);
            return date('d/m/Y', $time);
        }

        return null;
    }

    private function computeCosineSimilarity(array $vecA, array $vecB): float {
        $count = count($vecA);
        if ($count !== count($vecB) || $count === 0) return 0.0;

        $dotProduct = 0.0;
        $normA = 0.0;
        $normB = 0.0;

        for ($i = 0; $i < $count; $i++) {
            $a = (float)$vecA[$i];
            $b = (float)$vecB[$i];
            $dotProduct += $a * $b;
            $normA += $a * $a;
            $normB += $b * $b;
        }

        if ($normA <= 0.0 || $normB <= 0.0) return 0.0;

        return $dotProduct / (sqrt($normA) * sqrt($normB));
    }
}

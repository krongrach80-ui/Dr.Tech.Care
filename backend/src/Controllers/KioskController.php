<?php
/**
 * Moh Tech Care - Patient Kiosk Controller
 * Handles Facial Recognition Matching, Today's Routine Sync, and Session Logging
 */

require_once __DIR__ . '/../Repositories/UserRepository.php';
require_once __DIR__ . '/../Repositories/SessionRepository.php';
require_once __DIR__ . '/../Repositories/AuditRepository.php';
require_once __DIR__ . '/../Middleware/BannedIpMiddleware.php';
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

        // Fetch all registered face templates
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

            // Generate kiosk-scoped session token
            $token = bin2hex(random_bytes(32));
            $lifetime = (int)($this->config['security']['kiosk_session_lifetime_seconds'] ?? 3600);

            $this->sessionRepo->createSession(
                $token,
                $patientId,
                $bestMatch['role'],
                $ip,
                $_SERVER['HTTP_USER_AGENT'] ?? 'Kiosk Terminal',
                'Kiosk',
                $lifetime
            );

            $this->auditRepo->log(
                $patientId,
                $bestMatch['full_name'],
                $bestMatch['role'],
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

    public function getTodayRoutine(): void {
        $patientId = $_GET['patient_id'] ?? null;

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
                SELECT ri.*, e.name_th, e.name_en, e.category, e.instructions, e.benefits, e.media_path
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
            // Find next appointment date
            $nextStmt = $this->db->prepare("
                SELECT appointment_date
                FROM appointments
                WHERE patient_id = :pid AND appointment_date > :today
                ORDER BY appointment_date ASC
                LIMIT 1
            ");
            $nextStmt->execute([':pid' => $patientId, ':today' => $today]);
            $nextRow = $nextStmt->fetch(PDO::FETCH_ASSOC);

            echo json_encode([
                'status' => 'success',
                'has_routine' => false,
                'items' => [],
                'next_appointment_date' => $nextRow['appointment_date'] ?? null
            ], JSON_UNESCAPED_UNICODE);
        }
    }

    public function logSession(): void {
        $body = json_decode(file_get_contents('php://input'), true) ?? [];

        $patientId = trim($body['patient_id'] ?? '');
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
        $status = $body['status'] ?? 'completed';

        if (!$patientId || !$exerciseId) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Patient ID and Exercise ID are required'], JSON_UNESCAPED_UNICODE);
            return;
        }

        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare("
                INSERT INTO session_logs (appointment_id, patient_id, exercise_id, routine_item_id, started_at, ended_at, correct_reps, incorrect_reps, accuracy_percent, score, duration_seconds, status)
                VALUES (:aid, :pid, :exid, :riid, :started, :ended, :creps, :ireps, :acc, :score, :dur, :status)
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
                ':status' => $status
            ]);

            $logId = (int)$this->db->lastInsertId();

            // If routine item exists, mark as completed
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

            $this->auditRepo->log(
                $patientId,
                'Patient via Kiosk',
                'patient',
                BannedIpMiddleware::getClientIp(),
                'Kiosk',
                'KIOSK_SESSION_LOG',
                "Logged exercise {$exerciseId} status={$status} reps={$correctReps}/{$incorrectReps} acc={$accuracy}%",
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

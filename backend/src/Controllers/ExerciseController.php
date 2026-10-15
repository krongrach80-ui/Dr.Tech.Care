<?php
/**
 * Moh Tech Care - Exercise & Preset Library Controller (Module 5)
 * Handles Single Exercises, Preset Packages, and RBAC Ownership Rules
 */

require_once __DIR__ . '/../Repositories/AuditRepository.php';
require_once __DIR__ . '/../Middleware/AuthMiddleware.php';
require_once __DIR__ . '/../Middleware/RbacMiddleware.php';
require_once __DIR__ . '/../../config/Database.php';

class ExerciseController {
    private AuditRepository $auditRepo;
    private PDO $db;

    public function __construct() {
        $this->auditRepo = new AuditRepository();
        $this->db = Database::getConnection();
    }

    public function listExercises(): void {
        AuthMiddleware::check();
        $category = $_GET['category'] ?? null;

        $sql = "
            SELECT e.*, u.full_name as created_by_name
            FROM exercises e
            JOIN users u ON e.created_by = u.id
            WHERE e.is_active = 1
        ";
        $params = [];

        if ($category && $category !== 'all') {
            $sql .= " AND e.category = :cat";
            $params[':cat'] = $category;
        }

        $sql .= " ORDER BY e.category ASC, e.name_th ASC";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $exercises = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Fetch preset items for presets
        foreach ($exercises as &$ex) {
            if ($ex['type'] === 'preset') {
                $pStmt = $this->db->prepare("
                    SELECT pi.*, sub_e.name_th as exercise_name_th, sub_e.name_en as exercise_name_en
                    FROM preset_items pi
                    JOIN exercises sub_e ON pi.exercise_id = sub_e.id
                    WHERE pi.preset_id = :pid
                    ORDER BY pi.order_index ASC
                ");
                $pStmt->execute([':pid' => $ex['id']]);
                $ex['preset_items'] = $pStmt->fetchAll(PDO::FETCH_ASSOC);
            }
        }

        echo json_encode([
            'status' => 'success',
            'exercises' => $exercises
        ], JSON_UNESCAPED_UNICODE);
    }

    public function getExercise(string $id): void {
        AuthMiddleware::check();
        $stmt = $this->db->prepare("
            SELECT e.*, u.full_name as created_by_name
            FROM exercises e
            JOIN users u ON e.created_by = u.id
            WHERE e.id = :id
            LIMIT 1
        ");
        $stmt->execute([':id' => $id]);
        $exercise = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$exercise) {
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => 'Exercise not found'], JSON_UNESCAPED_UNICODE);
            return;
        }

        if ($exercise['type'] === 'preset') {
            $pStmt = $this->db->prepare("
                SELECT pi.*, sub_e.name_th as exercise_name_th, sub_e.name_en as exercise_name_en
                FROM preset_items pi
                JOIN exercises sub_e ON pi.exercise_id = sub_e.id
                WHERE pi.preset_id = :pid
                ORDER BY pi.order_index ASC
            ");
            $pStmt->execute([':pid' => $exercise['id']]);
            $exercise['preset_items'] = $pStmt->fetchAll(PDO::FETCH_ASSOC);
        }

        echo json_encode(['status' => 'success', 'exercise' => $exercise], JSON_UNESCAPED_UNICODE);
    }

    public function createExercise(): void {
        AuthMiddleware::check();
        $actor = AuthMiddleware::getUser();
        $body = json_decode(file_get_contents('php://input'), true) ?? [];

        $type = $body['type'] ?? 'single';
        $prefix = $type === 'preset' ? 'PS-' : ($body['category'] === 'Minigame' ? 'MG-' : 'EX-');
        $id = trim($body['id'] ?? '') ?: ($prefix . rand(10, 99));
        $nameTh = trim($body['name_th'] ?? '');
        $nameEn = trim($body['name_en'] ?? '');
        $category = $body['category'] ?? 'Shoulder';
        $reps = (int)($body['default_reps'] ?? 10);
        $sets = (int)($body['default_sets'] ?? 3);
        $rest = (int)($body['default_rest_seconds'] ?? 30);
        $instructions = $body['instructions'] ?? null;
        $benefits = $body['benefits'] ?? null;
        $mediaPath = $body['media_path'] ?? null;

        if (!$nameTh || !$nameEn) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Both Thai and English names are required'], JSON_UNESCAPED_UNICODE);
            return;
        }

        $this->db->beginTransaction();
        try {
            $stmt = $this->db->prepare("
                INSERT INTO exercises (id, name_th, name_en, category, type, default_reps, default_sets, default_rest_seconds, instructions, benefits, media_path, is_active, created_by)
                VALUES (:id, :nth, :nen, :cat, :type, :reps, :sets, :rest, :inst, :bene, :media, 1, :creator)
            ");
            $stmt->execute([
                ':id' => $id,
                ':nth' => $nameTh,
                ':nen' => $nameEn,
                ':cat' => $category,
                ':type' => $type,
                ':reps' => $reps,
                ':sets' => $sets,
                ':rest' => $rest,
                ':inst' => $instructions,
                ':bene' => $benefits,
                ':media' => $mediaPath,
                ':creator' => $actor['user_id']
            ]);

            // If preset, insert preset_items
            if ($type === 'preset' && !empty($body['items']) && is_array($body['items'])) {
                $piStmt = $this->db->prepare("
                    INSERT INTO preset_items (preset_id, exercise_id, order_index, reps, sets, rest_seconds)
                    VALUES (:pid, :exid, :idx, :reps, :sets, :rest)
                ");
                foreach ($body['items'] as $idx => $item) {
                    $piStmt->execute([
                        ':pid' => $id,
                        ':exid' => $item['exercise_id'],
                        ':idx' => $idx + 1,
                        ':reps' => (int)($item['reps'] ?? 10),
                        ':sets' => (int)($item['sets'] ?? 3),
                        ':rest' => (int)($item['rest_seconds'] ?? 30)
                    ]);
                }
            }

            $this->db->commit();

            $this->auditRepo->log(
                $actor['user_id'],
                $actor['full_name'],
                $actor['role'],
                BannedIpMiddleware::getClientIp(),
                'Desktop',
                'EXERCISE_CREATE',
                "Created exercise {$id} ({$nameTh})",
                'Normal'
            );

            $created = $this->db->query("SELECT * FROM exercises WHERE id = '{$id}'")->fetch(PDO::FETCH_ASSOC);

            http_response_code(201);
            echo json_encode(['status' => 'success', 'exercise' => $created], JSON_UNESCAPED_UNICODE);
        } catch (Exception $e) {
            $this->db->rollBack();
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
        }
    }

    public function updateExercise(string $id): void {
        AuthMiddleware::check();
        $actor = AuthMiddleware::getUser();

        $stmt = $this->db->prepare("SELECT * FROM exercises WHERE id = :id");
        $stmt->execute([':id' => $id]);
        $target = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$target) {
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => 'Exercise not found'], JSON_UNESCAPED_UNICODE);
            return;
        }

        // RBAC Rule: PT can only edit items where created_by = self!
        if ($actor['role'] === 'pt' && $target['created_by'] !== $actor['user_id']) {
            http_response_code(403);
            echo json_encode(['status' => 'error', 'message' => 'Forbidden: PT can only edit self-created exercises'], JSON_UNESCAPED_UNICODE);
            return;
        }

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $nameTh = trim($body['name_th'] ?? $target['name_th']);
        $nameEn = trim($body['name_en'] ?? $target['name_en']);
        $reps = isset($body['default_reps']) ? (int)$body['default_reps'] : $target['default_reps'];
        $sets = isset($body['default_sets']) ? (int)$body['default_sets'] : $target['default_sets'];
        $rest = isset($body['default_rest_seconds']) ? (int)$body['default_rest_seconds'] : $target['default_rest_seconds'];
        $instructions = $body['instructions'] ?? $target['instructions'];
        $benefits = $body['benefits'] ?? $target['benefits'];

        $upd = $this->db->prepare("
            UPDATE exercises
            SET name_th = :nth, name_en = :nen, default_reps = :reps, default_sets = :sets,
                default_rest_seconds = :rest, instructions = :inst, benefits = :bene, updated_at = :upd
            WHERE id = :id
        ");
        $upd->execute([
            ':nth' => $nameTh,
            ':nen' => $nameEn,
            ':reps' => $reps,
            ':sets' => $sets,
            ':rest' => $rest,
            ':inst' => $instructions,
            ':bene' => $benefits,
            ':upd' => date('Y-m-d H:i:s'),
            ':id' => $id
        ]);

        $this->auditRepo->log(
            $actor['user_id'],
            $actor['full_name'],
            $actor['role'],
            BannedIpMiddleware::getClientIp(),
            'Desktop',
            'EXERCISE_UPDATE',
            "Updated exercise {$id}",
            'Normal'
        );

        echo json_encode(['status' => 'success', 'message' => 'Exercise updated successfully'], JSON_UNESCAPED_UNICODE);
    }

    public function deleteExercise(string $id): void {
        AuthMiddleware::check();
        $actor = AuthMiddleware::getUser();

        $stmt = $this->db->prepare("SELECT * FROM exercises WHERE id = :id");
        $stmt->execute([':id' => $id]);
        $target = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$target) {
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => 'Exercise not found'], JSON_UNESCAPED_UNICODE);
            return;
        }

        // RBAC Rule: PT can only delete items where created_by = self!
        if ($actor['role'] === 'pt' && $target['created_by'] !== $actor['user_id']) {
            http_response_code(403);
            echo json_encode(['status' => 'error', 'message' => 'Forbidden: PT can only delete self-created exercises'], JSON_UNESCAPED_UNICODE);
            return;
        }

        $upd = $this->db->prepare("UPDATE exercises SET is_active = 0, updated_at = :upd WHERE id = :id");
        $upd->execute([':upd' => date('Y-m-d H:i:s'), ':id' => $id]);

        $this->auditRepo->log(
            $actor['user_id'],
            $actor['full_name'],
            $actor['role'],
            BannedIpMiddleware::getClientIp(),
            'Desktop',
            'EXERCISE_DELETE',
            "Deactivated exercise {$id}",
            'Normal'
        );

        echo json_encode(['status' => 'success', 'message' => 'Exercise removed successfully'], JSON_UNESCAPED_UNICODE);
    }
}

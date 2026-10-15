<?php
/**
 * Moh Tech Care - RBAC Middleware
 * Strict Server-Side Role-Based Access Control and Authorization Guards.
 */

require_once __DIR__ . '/AuthMiddleware.php';
require_once __DIR__ . '/../../config/Database.php';

class RbacMiddleware {
    /**
     * Require one of the specified roles, otherwise return 403
     */
    public static function requireRole(array $allowedRoles): void {
        AuthMiddleware::check();
        $user = AuthMiddleware::getUser();
        $role = $user['role'] ?? '';

        if (!in_array($role, $allowedRoles, true)) {
            http_response_code(403);
            echo json_encode([
                'status' => 'error',
                'code' => 'FORBIDDEN',
                'message' => 'Forbidden: Your role does not have permission to access this resource',
                'allowed_roles' => $allowedRoles
            ], JSON_UNESCAPED_UNICODE);
            exit();
        }
    }

    /**
     * Check if the authenticated user has write permission to a patient's schedule (M3)
     * Admin: has write permission to all patients
     * PT: only has write permission if owner PT or active covering PT
     */
    public static function canWriteSchedule(string $patientId): bool {
        AuthMiddleware::check();
        $user = AuthMiddleware::getUser();
        $userId = $user['user_id'];
        $role = $user['role'];

        if ($role === 'admin') {
            return true;
        }

        if ($role !== 'pt') {
            return false;
        }

        $db = Database::getConnection();

        // 1. Check if PT is the primary assigned PT
        $stmt = $db->prepare("SELECT assigned_pt_id FROM patient_profiles WHERE patient_id = :pid LIMIT 1");
        $stmt->execute([':pid' => $patientId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($row && $row['assigned_pt_id'] === $userId) {
            return true;
        }

        // 2. Check if PT has an ACTIVE temporary coverage today
        $today = date('Y-m-d');
        $covStmt = $db->prepare("
            SELECT id FROM temporary_coverages
            WHERE patient_id = :pid
              AND cover_pt_id = :pt_id
              AND status = 'active'
              AND :today BETWEEN start_date AND end_date
            LIMIT 1
        ");
        $covStmt->execute([':pid' => $patientId, ':pt_id' => $userId, ':today' => $today]);

        return (bool)$covStmt->fetch();
    }

    /**
     * Guard write access to patient schedule: aborts with 403 if user cannot write
     */
    public static function requireScheduleWrite(string $patientId): void {
        if (!self::canWriteSchedule($patientId)) {
            http_response_code(403);
            echo json_encode([
                'status' => 'error',
                'code' => 'SCHEDULE_WRITE_FORBIDDEN',
                'message' => 'Forbidden: You only have read-only access to this patient\'s schedule planner'
            ], JSON_UNESCAPED_UNICODE);
            exit();
        }
    }
}

<?php
/**
 * Moh Tech Care - RBAC Middleware (v2.1)
 * Strict Server-Side Role-Based Access Control and Authorization Guards.
 * Delegates to PolicyEngine with automatic 403 audit logging.
 */

require_once __DIR__ . '/AuthMiddleware.php';
require_once __DIR__ . '/../Services/PolicyEngine.php';
require_once __DIR__ . '/../../config/Database.php';

class RbacMiddleware {
    /**
     * Require one of the specified roles, otherwise return 403 and write audit_logs
     */
    public static function requireRole(array $allowedRoles): void {
        AuthMiddleware::check();
        $user = AuthMiddleware::getUser();
        $role = strtolower($user['role'] ?? '');

        if (!in_array($role, array_map('strtolower', $allowedRoles), true)) {
            PolicyEngine::auditDenial(
                ['id' => $user['user_id'] ?? $user['id'] ?? 'UNKNOWN', 'role' => $role],
                'ROLE_PERMISSION_DENIED',
                "Role '{$role}' not in allowed roles: " . implode(', ', $allowedRoles)
            );

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
     */
    public static function canWriteSchedule(string $patientId, ?array $routineItems = null): array {
        AuthMiddleware::check();
        $user = AuthMiddleware::getUser();
        $actor = [
            'id' => $user['user_id'] ?? $user['id'] ?? '',
            'role' => $user['role'] ?? ''
        ];

        return PolicyEngine::canWriteSchedule($actor, $patientId, $routineItems);
    }

    /**
     * Guard write access to patient schedule: aborts with 403 / 422 if user cannot write
     */
    public static function requireScheduleWrite(string $patientId, ?array $routineItems = null): void {
        $result = self::canWriteSchedule($patientId, $routineItems);
        if (!$result['allowed']) {
            http_response_code($result['statusCode'] ?? 403);
            echo json_encode([
                'status' => 'error',
                'code' => $result['statusCode'] === 422 ? 'POSE_EXERCISES_DISABLED' : 'SCHEDULE_WRITE_FORBIDDEN',
                'message' => $result['message']
            ], JSON_UNESCAPED_UNICODE);
            exit();
        }
    }

    /**
     * Guard Audit Logs access (Admin only)
     */
    public static function requireAuditAccess(): void {
        AuthMiddleware::check();
        $user = AuthMiddleware::getUser();
        $actor = [
            'id' => $user['user_id'] ?? $user['id'] ?? '',
            'role' => $user['role'] ?? ''
        ];

        if (!PolicyEngine::canViewAudit($actor)) {
            http_response_code(403);
            echo json_encode([
                'status' => 'error',
                'code' => 'AUDIT_FORBIDDEN',
                'message' => 'Forbidden: Audit logs and security controls are restricted to Super Admin.'
            ], JSON_UNESCAPED_UNICODE);
            exit();
        }
    }
}

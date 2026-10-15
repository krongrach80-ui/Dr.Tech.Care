<?php
/**
 * Moh Tech Care - Central Policy Engine (v2.1)
 * Enforces Deny-By-Default server-side authorization across all roles:
 * - Super Admin: Full CRUD, soft-delete users, append-only notes
 * - Physiotherapist: Own + Covered patients, own exercises, M6 blocked
 * - Kiosk: Scoped token, 4 endpoints only, zero data edit
 * Automatic Audit Logging on 403 / 422 denials
 */

require_once __DIR__ . '/../Repositories/AuditRepository.php';
require_once __DIR__ . '/../../config/Database.php';

class PolicyEngine {

    /**
     * Audit access denial to audit_logs
     */
    public static function auditDenial(?array $actor, string $event, string $details): void {
        try {
            $actorId = $actor['id'] ?? $actor['username'] ?? 'ANONYMOUS';
            $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
            $endpoint = $_SERVER['REQUEST_URI'] ?? '/api';
            $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

            $auditRepo = new AuditRepository();
            $auditRepo->log(
                $actorId,
                $event,
                'SECURITY_POLICY',
                "DENIED {$method} {$endpoint} | {$details} | IP: {$ip}"
            );
        } catch (\Throwable $e) {
            error_log("Failed to log audit denial: " . $e->getMessage());
        }
    }

    /**
     * Policy: User Management (Create, Edit, Soft-Delete, Password/Biometrics Reset)
     * - Admin: Full access across all roles
     * - PT: Patient accounts only. CANNOT create/edit/reset Admin or PT accounts.
     *       PT can NEVER change own role or delete any user.
     * - Others: Denied
     */
    public static function canEditUser(array $actor, ?array $targetUser, string $action, ?string $targetRoleToCreate = null): bool {
        $actorRole = strtolower($actor['role'] ?? '');

        // 1. Super Admin has full CRUD
        if ($actorRole === 'admin') {
            return true;
        }

        // 2. Physiotherapist
        if ($actorRole === 'pt') {
            // Cannot delete any user
            if ($action === 'delete') {
                self::auditDenial($actor, 'USER_DELETE_DENIED', "PT {$actor['id']} attempted to delete user " . ($targetUser['id'] ?? 'unknown'));
                return false;
            }

            // Creating new user: ONLY 'patient' role allowed
            if ($action === 'create') {
                if (strtolower($targetRoleToCreate ?? '') === 'patient') {
                    return true;
                }
                self::auditDenial($actor, 'USER_CREATE_DENIED', "PT {$actor['id']} attempted to create account with role '{$targetRoleToCreate}'");
                return false;
            }

            // Updating / Resetting: Target MUST exist and MUST be 'patient'
            if ($targetUser) {
                $targetRole = strtolower($targetUser['role'] ?? '');
                if ($targetRole === 'patient') {
                    return true;
                }
                self::auditDenial($actor, 'USER_EDIT_DENIED', "PT {$actor['id']} attempted {$action} on {$targetRole} account ({$targetUser['id']})");
                return false;
            }

            self::auditDenial($actor, 'USER_ACTION_DENIED', "PT {$actor['id']} attempted unauthorized action '{$action}'");
            return false;
        }

        // 3. Deny by default for any other role
        self::auditDenial($actor, 'UNAUTHORIZED_USER_ACTION', "Role '{$actorRole}' attempted {$action} on user");
        return false;
    }

    /**
     * Policy: Schedule & Routine Management
     * - Admin: Can view and manage all schedules (subject to pose feature flag)
     * - PT: Can manage schedules of OWN patients and ACTIVE temporary-covered cases
     * - Pose exercises check: If FEATURE_PT_POSE_EXERCISES = false, reject with 422
     */
    public static function canWriteSchedule(array $actor, string $patientId, ?array $routineItems = null): array {
        $actorRole = strtolower($actor['role'] ?? '');
        $actorId = $actor['id'] ?? '';
        $today = date('Y-m-d');

        // Check Pose Exercise Feature Flag (v2.1: reject with 422 for Admin and PT alike)
        $poseCheck = self::checkPoseExercisesGating($routineItems);
        if (!$poseCheck['allowed']) {
            return $poseCheck;
        }

        // 1. Super Admin allowed for all patients
        if ($actorRole === 'admin') {
            return ['allowed' => true, 'statusCode' => 200, 'message' => 'OK'];
        }

        // 2. PT: Check ownership or active temporary coverage
        if ($actorRole === 'pt') {
            $db = Database::getConnection();

            // Check if patient's assigned PT is this actor
            $stmt = $db->prepare("
                SELECT assigned_pt_id FROM patient_profiles WHERE patient_id = :pid
                UNION
                SELECT pt_id as assigned_pt_id FROM appointments WHERE patient_id = :pid LIMIT 1
            ");
            $stmt->execute([':pid' => $patientId]);
            $assignedPt = $stmt->fetchColumn();

            if ($assignedPt === $actorId) {
                return ['allowed' => true, 'statusCode' => 200, 'message' => 'OK'];
            }

            // Check if there is an ACTIVE temporary coverage delegation
            // start_date <= today <= end_date AND revoked_at IS NULL
            $covStmt = $db->prepare("
                SELECT id FROM temporary_coverages
                WHERE patient_id = :pid
                  AND cover_pt_id = :actor_id
                  AND start_date <= :today
                  AND end_date >= :today
                  AND revoked_at IS NULL
                LIMIT 1
            ");
            $covStmt->execute([
                ':pid' => $patientId,
                ':actor_id' => $actorId,
                ':today' => $today
            ]);
            if ($covStmt->fetch()) {
                return ['allowed' => true, 'statusCode' => 200, 'message' => 'OK (Active Temporary Coverage)'];
            }

            // Otherwise DENIED
            self::auditDenial($actor, 'SCHEDULE_WRITE_DENIED', "PT {$actorId} attempted to write schedule for non-assigned patient {$patientId}");
            return [
                'allowed' => false,
                'statusCode' => 403,
                'message' => 'Permission denied: Patient is not in your assigned caseload and has no active temporary coverage.'
            ];
        }

        // 3. Deny by default
        self::auditDenial($actor, 'SCHEDULE_WRITE_DENIED', "Actor {$actorId} with role {$actorRole} attempted to write schedule");
        return [
            'allowed' => false,
            'statusCode' => 403,
            'message' => 'Forbidden: You do not have permission to manage therapy schedules.'
        ];
    }

    /**
     * Check if routine items contain any pose exercises while FEATURE_PT_POSE_EXERCISES = false
     */
    private static function checkPoseExercisesGating(?array $routineItems): array {
        if (empty($routineItems)) {
            return ['allowed' => true, 'statusCode' => 200, 'message' => 'OK'];
        }

        $config = require __DIR__ . '/../../config/config.php';
        $featurePoseEnabled = $config['features']['pt_pose_exercises'] ?? false;

        if ($featurePoseEnabled) {
            return ['allowed' => true, 'statusCode' => 200, 'message' => 'OK'];
        }

        // Query exercises in DB to check their type
        $exerciseIds = [];
        foreach ($routineItems as $item) {
            if (!empty($item['exercise_id'])) {
                $exerciseIds[] = $item['exercise_id'];
            }
        }

        if (empty($exerciseIds)) {
            return ['allowed' => true, 'statusCode' => 200, 'message' => 'OK'];
        }

        $db = Database::getConnection();
        $placeholders = implode(',', array_fill(0, count($exerciseIds), '?'));
        $stmt = $db->prepare("
            SELECT id, name, category, exercise_type 
            FROM exercises 
            WHERE id IN ($placeholders)
        ");
        $stmt->execute($exerciseIds);
        $exercises = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($exercises as $ex) {
            $type = strtolower($ex['exercise_type'] ?? $ex['category'] ?? '');
            if ($type === 'pose' || str_contains($type, 'pose')) {
                return [
                    'allowed' => false,
                    'statusCode' => 422,
                    'message' => "Pose exercises are currently locked (FEATURE_PT_POSE_EXERCISES = false). Cannot assign pose exercise '{$ex['name']}' ({$ex['id']})."
                ];
            }
        }

        return ['allowed' => true, 'statusCode' => 200, 'message' => 'OK'];
    }

    /**
     * Policy: Exercise Library (Create, Update, Delete)
     * - Admin: Add / edit / delete all exercises, presets and mini-games
     * - PT: Create, and edit/delete ONLY items where created_by = self. Central/Admin items are read-only.
     */
    public static function canEditExercise(array $actor, ?array $exercise, string $action): bool {
        $actorRole = strtolower($actor['role'] ?? '');
        $actorId = $actor['id'] ?? '';

        // 1. Admin has full CRUD
        if ($actorRole === 'admin') {
            return true;
        }

        // 2. PT can create exercises
        if ($actorRole === 'pt') {
            if ($action === 'create') {
                return true;
            }

            // Edit / Delete: must be created by self
            if ($exercise) {
                $createdBy = $exercise['created_by'] ?? '';
                if ($createdBy === $actorId) {
                    return true;
                }
                self::auditDenial($actor, 'EXERCISE_EDIT_DENIED', "PT {$actorId} attempted to {$action} central/other exercise " . ($exercise['id'] ?? 'unknown'));
                return false;
            }

            return false;
        }

        // 3. Deny by default
        self::auditDenial($actor, 'EXERCISE_ACTION_DENIED', "Actor {$actorId} role {$actorRole} attempted {$action} on exercise");
        return false;
    }

    /**
     * Policy: Audit Logs & Security Controls
     * - Admin: 100% access
     * - PT & others: Strictly 100% blocked (HTTP 403)
     */
    public static function canViewAudit(array $actor): bool {
        $actorRole = strtolower($actor['role'] ?? '');
        if ($actorRole === 'admin') {
            return true;
        }

        self::auditDenial($actor, 'AUDIT_VIEW_DENIED', "Role '{$actorRole}' attempted to access audit logs");
        return false;
    }

    /**
     * Policy: Medical Notes (Append-Only)
     * - APPEND: Admin & assigned/covered PT
     * - UPDATE / DELETE: DENIED for ALL roles (including Super Admin)
     */
    public static function canWriteMedicalNotes(array $actor, string $patientId, string $action): bool {
        // Any edit or delete is strictly prohibited for everyone
        if ($action === 'update' || $action === 'delete') {
            self::auditDenial($actor, 'MEDICAL_NOTE_MUTATION_DENIED', "Illegal {$action} attempted on medical note for patient {$patientId}");
            return false;
        }

        $actorRole = strtolower($actor['role'] ?? '');
        if ($actorRole === 'admin') {
            return true;
        }

        if ($actorRole === 'pt') {
            // Check ownership or active coverage
            $res = self::canWriteSchedule($actor, $patientId);
            return $res['allowed'];
        }

        return false;
    }

    /**
     * Policy: Kiosk Token Endpoint Allowlist
     * Kiosk Token carries role = 'kiosk' and patient_id.
     * Allowed endpoints:
     * 1. GET /api/kiosk/routine (for own patient_id and TODAY only)
     * 2. POST /api/kiosk/session-logs (for own patient_id)
     * 3. GET /api/kiosk/next-appointment (for own patient_id)
     * 4. POST /api/kiosk/reset (revokes token)
     * All others -> 403 Forbidden!
     */
    public static function isKioskTokenAllowed(array $tokenData, string $method, string $uri): array {
        $patientId = $tokenData['patient_id'] ?? '';
        $normalizedUri = preg_replace('#^/api/#', '', ltrim($uri, '/'));

        // 1. GET kiosk/routine
        if ($method === 'GET' && str_starts_with($normalizedUri, 'kiosk/routine')) {
            return ['allowed' => true, 'statusCode' => 200];
        }

        // 2. POST kiosk/session-logs
        if ($method === 'POST' && str_starts_with($normalizedUri, 'kiosk/session-logs')) {
            return ['allowed' => true, 'statusCode' => 200];
        }

        // 3. GET kiosk/next-appointment
        if ($method === 'GET' && str_starts_with($normalizedUri, 'kiosk/next-appointment')) {
            return ['allowed' => true, 'statusCode' => 200];
        }

        // 4. POST kiosk/reset
        if ($method === 'POST' && str_starts_with($normalizedUri, 'kiosk/reset')) {
            return ['allowed' => true, 'statusCode' => 200];
        }

        self::auditDenial(
            ['id' => "kiosk:{$patientId}", 'role' => 'kiosk'],
            'KIOSK_TOKEN_VIOLATION',
            "Kiosk token attempted unauthorized call: {$method} {$uri}"
        );

        return [
            'allowed' => false,
            'statusCode' => 403,
            'message' => 'Forbidden: Kiosk token is restricted to interactive session endpoints only.'
        ];
    }
}

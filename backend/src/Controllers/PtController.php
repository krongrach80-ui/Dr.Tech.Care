<?php
/**
 * Moh Tech Care - PT Directory & PT Workspace Controller (Module 4)
 * Handles PT Directory, Profile Updates, Case Transfer, and Temporary Case Delegation
 */

require_once __DIR__ . '/../Repositories/UserRepository.php';
require_once __DIR__ . '/../Repositories/AuditRepository.php';
require_once __DIR__ . '/../Middleware/AuthMiddleware.php';
require_once __DIR__ . '/../Middleware/RbacMiddleware.php';
require_once __DIR__ . '/../../config/Database.php';

class PtController {
    private UserRepository $userRepo;
    private AuditRepository $auditRepo;
    private PDO $db;

    public function __construct() {
        $this->userRepo = new UserRepository();
        $this->auditRepo = new AuditRepository();
        $this->db = Database::getConnection();
    }

    public function listTherapists(): void {
        AuthMiddleware::check();

        $stmt = $this->db->prepare("
            SELECT u.id, u.full_name, u.username, u.role, u.phone, u.email, u.status, u.created_at,
                   ptp.license_number, ptp.department, ptp.bio,
                   COUNT(pp.patient_id) as active_case_count,
                   (CASE WHEN EXISTS (
                       SELECT 1 FROM temporary_coverages tc
                       WHERE tc.cover_pt_id = u.id AND tc.status = 'active'
                         AND CURRENT_DATE BETWEEN tc.start_date AND tc.end_date
                   ) THEN 1 ELSE 0 END) as is_covering
            FROM users u
            JOIN pt_profiles ptp ON u.id = ptp.pt_id
            LEFT JOIN patient_profiles pp ON u.id = pp.assigned_pt_id AND pp.treatment_status = 'active'
            WHERE u.role = 'pt'
            GROUP BY u.id
            ORDER BY u.full_name ASC
        ");
        $stmt->execute();
        $therapists = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($therapists as &$t) {
            $t['active_case_count'] = (int)$t['active_case_count'];
            $t['is_covering'] = (bool)$t['is_covering'];
            $t['password_hash'] = 'Hashed ●●●●';
        }

        echo json_encode([
            'status' => 'success',
            'therapists' => $therapists
        ], JSON_UNESCAPED_UNICODE);
    }

    public function updateProfile(string $id): void {
        AuthMiddleware::check();
        $actor = AuthMiddleware::getUser();

        // RBAC: PT can edit ONLY own profile!
        if ($actor['role'] === 'pt' && $actor['user_id'] !== $id) {
            http_response_code(403);
            echo json_encode(['status' => 'error', 'message' => 'Forbidden: You can only edit your own PT profile'], JSON_UNESCAPED_UNICODE);
            return;
        }

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $phone = trim($body['phone'] ?? '-') ?: '-';
        $email = trim($body['email'] ?? '-') ?: '-';
        $bio = $body['bio'] ?? null;

        $this->db->beginTransaction();
        try {
            $uStmt = $this->db->prepare("UPDATE users SET phone = :phone, email = :email, updated_at = :upd WHERE id = :id");
            $uStmt->execute([':phone' => $phone, ':email' => $email, ':upd' => date('Y-m-d H:i:s'), ':id' => $id]);

            // If Admin, allowed to edit license and department as well
            if ($actor['role'] === 'admin') {
                $license = trim($body['license_number'] ?? '');
                $dept = trim($body['department'] ?? '');
                $ptStmt = $this->db->prepare("
                    UPDATE pt_profiles
                    SET license_number = COALESCE(NULLIF(:lic, ''), license_number),
                        department = COALESCE(NULLIF(:dept, ''), department),
                        bio = :bio, updated_at = :upd
                    WHERE pt_id = :id
                ");
                $ptStmt->execute([':lic' => $license, ':dept' => $dept, ':bio' => $bio, ':upd' => date('Y-m-d H:i:s'), ':id' => $id]);
            } else {
                // PT edits bio only (license & department are read-only)
                $ptStmt = $this->db->prepare("UPDATE pt_profiles SET bio = :bio, updated_at = :upd WHERE pt_id = :id");
                $ptStmt->execute([':bio' => $bio, ':upd' => date('Y-m-d H:i:s'), ':id' => $id]);
            }

            $this->db->commit();

            $this->auditRepo->log(
                $actor['user_id'],
                $actor['full_name'],
                $actor['role'],
                BannedIpMiddleware::getClientIp(),
                'Desktop',
                'PT_UPDATE_PROFILE',
                "Updated PT profile {$id}",
                'Normal'
            );

            $updated = $this->userRepo->findById($id);
            echo json_encode(['status' => 'success', 'therapist' => $updated], JSON_UNESCAPED_UNICODE);
        } catch (Exception $e) {
            $this->db->rollBack();
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
        }
    }

    public function transferCase(): void {
        AuthMiddleware::check();
        $actor = AuthMiddleware::getUser();
        $body = json_decode(file_get_contents('php://input'), true) ?? [];

        $patientId = trim($body['patient_id'] ?? '');
        $newPtId = trim($body['new_pt_id'] ?? '');

        if (!$patientId || !$newPtId) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Patient ID and new PT ID are required'], JSON_UNESCAPED_UNICODE);
            return;
        }

        // Check patient
        $pStmt = $this->db->prepare("SELECT assigned_pt_id FROM patient_profiles WHERE patient_id = :pid");
        $pStmt->execute([':pid' => $patientId]);
        $patient = $pStmt->fetch(PDO::FETCH_ASSOC);

        if (!$patient) {
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => 'Patient not found'], JSON_UNESCAPED_UNICODE);
            return;
        }

        // PT can only transfer own patients; Admin can transfer any patient
        if ($actor['role'] === 'pt' && $patient['assigned_pt_id'] !== $actor['user_id']) {
            http_response_code(403);
            echo json_encode(['status' => 'error', 'message' => 'Forbidden: You can only reassign your own assigned patients'], JSON_UNESCAPED_UNICODE);
            return;
        }

        $upd = $this->db->prepare("
            UPDATE patient_profiles
            SET assigned_pt_id = :new_pt, updated_at = :upd
            WHERE patient_id = :pid
        ");
        $upd->execute([':new_pt' => $newPtId, ':upd' => date('Y-m-d H:i:s'), ':pid' => $patientId]);

        $this->auditRepo->log(
            $actor['user_id'],
            $actor['full_name'],
            $actor['role'],
            BannedIpMiddleware::getClientIp(),
            'Desktop',
            'CASE_TRANSFER',
            "Reassigned patient {$patientId} to PT {$newPtId}",
            'Normal'
        );

        echo json_encode(['status' => 'success', 'message' => 'Case reassigned successfully'], JSON_UNESCAPED_UNICODE);
    }

    public function createCoverage(): void {
        AuthMiddleware::check();
        $actor = AuthMiddleware::getUser();
        $body = json_decode(file_get_contents('php://input'), true) ?? [];

        $patientId = trim($body['patient_id'] ?? '');
        $coverPtId = trim($body['cover_pt_id'] ?? '');
        $startDate = trim($body['start_date'] ?? '');
        $endDate = trim($body['end_date'] ?? '');
        $reason = trim($body['reason'] ?? '') ?: null;

        if (!$patientId || !$coverPtId || !$startDate || !$endDate) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Patient, Cover PT, Start Date, and End Date are required'], JSON_UNESCAPED_UNICODE);
            return;
        }

        // Validation 1: end_date >= start_date
        if (strtotime($endDate) < strtotime($startDate)) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'End date must be greater than or equal to start date'], JSON_UNESCAPED_UNICODE);
            return;
        }

        // Find patient's primary PT
        $pStmt = $this->db->prepare("SELECT assigned_pt_id FROM patient_profiles WHERE patient_id = :pid");
        $pStmt->execute([':pid' => $patientId]);
        $pRow = $pStmt->fetch(PDO::FETCH_ASSOC);

        if (!$pRow) {
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => 'Patient not found'], JSON_UNESCAPED_UNICODE);
            return;
        }

        $ownerPtId = $pRow['assigned_pt_id'];

        // Validation 2: Only owner PT or Super Admin can create delegation!
        if ($actor['role'] === 'pt' && $actor['user_id'] !== $ownerPtId) {
            http_response_code(403);
            echo json_encode(['status' => 'error', 'message' => 'Forbidden: Only the primary assigned PT or Super Admin can delegate this case'], JSON_UNESCAPED_UNICODE);
            return;
        }

        // Validation 3: cover PT is not the owner
        if ($coverPtId === $ownerPtId) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Covering PT cannot be the primary owner PT'], JSON_UNESCAPED_UNICODE);
            return;
        }

        // Validation 4: No overlapping active coverage for the same patient
        $overlapStmt = $this->db->prepare("
            SELECT id FROM temporary_coverages
            WHERE patient_id = :pid AND status = 'active'
              AND NOT (end_date < :start OR start_date > :end)
            LIMIT 1
        ");
        $overlapStmt->execute([':pid' => $patientId, ':start' => $startDate, ':end' => $endDate]);
        if ($overlapStmt->fetch()) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'An active temporary coverage already exists for this patient in the selected date range'], JSON_UNESCAPED_UNICODE);
            return;
        }

        $ins = $this->db->prepare("
            INSERT INTO temporary_coverages (patient_id, owner_pt_id, cover_pt_id, start_date, end_date, reason, status, created_by)
            VALUES (:pid, :owner, :cover, :start, :end, :reason, 'active', :creator)
        ");
        $ins->execute([
            ':pid' => $patientId,
            ':owner' => $ownerPtId,
            ':cover' => $coverPtId,
            ':start' => $startDate,
            ':end' => $endDate,
            ':reason' => $reason,
            ':creator' => $actor['user_id']
        ]);

        $coverageId = (int)$this->db->lastInsertId();

        $this->auditRepo->log(
            $actor['user_id'],
            $actor['full_name'],
            $actor['role'],
            BannedIpMiddleware::getClientIp(),
            'Desktop',
            'TEMPORARY_COVERAGE_CREATE',
            "Delegated patient {$patientId} to PT {$coverPtId} ({$startDate} to {$endDate})",
            'Normal'
        );

        echo json_encode([
            'status' => 'success',
            'message' => 'Temporary case delegation created successfully',
            'coverage_id' => $coverageId
        ], JSON_UNESCAPED_UNICODE);
    }

    public function revokeCoverage(int $id): void {
        AuthMiddleware::check();
        $actor = AuthMiddleware::getUser();

        $stmt = $this->db->prepare("SELECT * FROM temporary_coverages WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $id]);
        $cov = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$cov) {
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => 'Coverage record not found'], JSON_UNESCAPED_UNICODE);
            return;
        }

        // Only owner PT or Super Admin can revoke
        if ($actor['role'] === 'pt' && $cov['owner_pt_id'] !== $actor['user_id']) {
            http_response_code(403);
            echo json_encode(['status' => 'error', 'message' => 'Forbidden: Only the owner PT or Super Admin can revoke this coverage'], JSON_UNESCAPED_UNICODE);
            return;
        }

        $upd = $this->db->prepare("
            UPDATE temporary_coverages
            SET status = 'revoked', revoked_by = :actor, revoked_at = :now, updated_at = :now
            WHERE id = :id
        ");
        $now = date('Y-m-d H:i:s');
        $upd->execute([':actor' => $actor['user_id'], ':now' => $now, ':id' => $id]);

        $this->auditRepo->log(
            $actor['user_id'],
            $actor['full_name'],
            $actor['role'],
            BannedIpMiddleware::getClientIp(),
            'Desktop',
            'TEMPORARY_COVERAGE_REVOKE',
            "Revoked coverage #{$id} for patient {$cov['patient_id']}",
            'Normal'
        );

        echo json_encode(['status' => 'success', 'message' => 'Coverage revoked successfully'], JSON_UNESCAPED_UNICODE);
    }

    public function listCoverages(): void {
        AuthMiddleware::check();
        $ptId = $_GET['pt_id'] ?? null;

        $sql = "
            SELECT tc.*,
                   u_patient.full_name as patient_name,
                   u_owner.full_name as owner_pt_name,
                   u_cover.full_name as cover_pt_name
            FROM temporary_coverages tc
            JOIN users u_patient ON tc.patient_id = u_patient.id
            JOIN users u_owner ON tc.owner_pt_id = u_owner.id
            JOIN users u_cover ON tc.cover_pt_id = u_cover.id
            WHERE 1=1
        ";
        $params = [];

        if ($ptId) {
            $sql .= " AND (tc.owner_pt_id = :ptid1 OR tc.cover_pt_id = :ptid2)";
            $params[':ptid1'] = $ptId;
            $params[':ptid2'] = $ptId;
        }

        $sql .= " ORDER BY tc.created_at DESC";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $coverages = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Update expired statuses server-side
        $today = date('Y-m-d');
        foreach ($coverages as &$cov) {
            if ($cov['status'] === 'active' && $cov['end_date'] < $today) {
                $cov['status'] = 'expired';
            }
        }

        echo json_encode([
            'status' => 'success',
            'coverages' => $coverages
        ], JSON_UNESCAPED_UNICODE);
    }
}

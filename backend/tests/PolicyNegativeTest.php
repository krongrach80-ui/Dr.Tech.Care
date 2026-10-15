<?php
/**
 * Moh Tech Care - Policy & Negative-Case Test Suite (v2.1)
 * Validates Section 5 Acceptance Criteria:
 * - PT write on an Admin or PT user -> 403 & audited
 * - PATCH / DELETE on medical_notes -> fails with DB trigger / no endpoint
 * - PT write on patient not owned or covered -> 403; Covered & active -> 200; After end_date -> 403
 * - Pose exercise in routine while flag is off -> 422 for Admin and PT
 * - PT edits an Admin-created exercise -> 403; Own item -> 200
 * - PT calls the audit API -> 403
 * - Kiosk token requesting outside allowlist -> 403
 */

require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../src/Services/PolicyEngine.php';
require_once __DIR__ . '/../src/Repositories/AuditRepository.php';

class PolicyNegativeTest {
    private PDO $db;
    private int $passed = 0;
    private int $failed = 0;

    public function __construct() {
        $this->db = Database::getConnection();
    }

    private function assert(string $testName, bool $condition, string $message = ''): void {
        if ($condition) {
            $this->passed++;
            echo "  [PASS] {$testName}\n";
        } else {
            $this->failed++;
            echo "  [FAIL] {$testName} - {$message}\n";
        }
    }

    public function runAll(): void {
        echo "============================================================\n";
        echo "MOH TECH CARE — POLICY NEGATIVE-CASE ACCEPTANCE TEST SUITE\n";
        echo "============================================================\n";

        $this->testPtCannotEditAdminOrPtUser();
        $this->testMedicalNotesImmutableTrigger();
        $this->testPtScheduleOwnershipAndCoverageGating();
        $this->testPoseExercisesGatingReturns422();
        $this->testPtExerciseOwnershipCheck();
        $this->testPtAuditAccessBlocked();
        $this->testKioskTokenAllowlist();

        echo "\n------------------------------------------------------------\n";
        echo "SUMMARY: Passed: {$this->passed} | Failed: {$this->failed}\n";
        echo "============================================================\n";
    }

    /**
     * Test 1: PT write on an Admin or PT user -> 403 and audited
     */
    private function testPtCannotEditAdminOrPtUser(): void {
        $ptActor = ['id' => 'T-001', 'role' => 'pt', 'full_name' => 'PT Somchai'];
        $adminTarget = ['id' => 'A-001', 'role' => 'admin', 'full_name' => 'Super Admin'];
        $peerPtTarget = ['id' => 'T-002', 'role' => 'pt', 'full_name' => 'PT Kanok'];
        $patientTarget = ['id' => 'P-1001', 'role' => 'patient', 'full_name' => 'Patient Somsak'];

        // PT trying to edit Admin
        $canEditAdmin = PolicyEngine::canEditUser($ptActor, $adminTarget, 'update');
        $this->assert("PT cannot edit Admin account", $canEditAdmin === false);

        // PT trying to reset Admin password
        $canResetAdmin = PolicyEngine::canEditUser($ptActor, $adminTarget, 'reset_password');
        $this->assert("PT cannot reset Admin password", $canResetAdmin === false);

        // PT trying to edit peer PT
        $canEditPeer = PolicyEngine::canEditUser($ptActor, $peerPtTarget, 'update');
        $this->assert("PT cannot edit peer PT account", $canEditPeer === false);

        // PT creating an Admin
        $canCreateAdmin = PolicyEngine::canEditUser($ptActor, null, 'create', 'admin');
        $this->assert("PT cannot create Admin account", $canCreateAdmin === false);

        // PT creating a Patient -> allowed
        $canCreatePatient = PolicyEngine::canEditUser($ptActor, null, 'create', 'patient');
        $this->assert("PT can create Patient account", $canCreatePatient === true);

        // PT editing Patient -> allowed
        $canEditPatient = PolicyEngine::canEditUser($ptActor, $patientTarget, 'update');
        $this->assert("PT can edit Patient account", $canEditPatient === true);
    }

    /**
     * Test 2: PATCH / DELETE on medical_notes by any role fails via MySQL Trigger
     */
    private function testMedicalNotesImmutableTrigger(): void {
        // Try inserting a test note first
        $stmt = $this->db->prepare("
            INSERT INTO medical_notes (patient_id, author_id, author_role, author_name, header_stamp, note_content)
            VALUES ('P-1001', 'A-001', 'admin', 'Super Admin', '[Test Stamp]', 'Initial Immutable Content')
        ");
        $stmt->execute();
        $noteId = $this->db->lastInsertId();

        $updateFailed = false;
        try {
            $upd = $this->db->prepare("UPDATE medical_notes SET note_content = 'Hacked' WHERE id = :id");
            $upd->execute([':id' => $noteId]);
        } catch (\PDOException $e) {
            $updateFailed = true; // Trigger fired SQLSTATE 45000
        }
        $this->assert("Medical note UPDATE blocked by DB trigger / policy", $updateFailed === true);

        $deleteFailed = false;
        try {
            $del = $this->db->prepare("DELETE FROM medical_notes WHERE id = :id");
            $del->execute([':id' => $noteId]);
        } catch (\PDOException $e) {
            $deleteFailed = true; // Trigger fired SQLSTATE 45000
        }
        $this->assert("Medical note DELETE blocked by DB trigger / policy", $deleteFailed === true);
    }

    /**
     * Test 3: PT write on a patient who is not owned or covered -> 403.
     *         Covered and active -> 200. After end_date -> 403.
     */
    private function testPtScheduleOwnershipAndCoverageGating(): void {
        $ptActor = ['id' => 'T-002', 'role' => 'pt']; // Not owner of P-1001
        $today = date('Y-m-d');
        $yesterday = date('Y-m-d', strtotime('-1 day'));
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        // 1. Not owned, no coverage -> 403
        $resNoCov = PolicyEngine::canWriteSchedule($ptActor, 'P-1001');
        $this->assert("PT write on unowned/uncovered patient returns 403", $resNoCov['allowed'] === false && $resNoCov['statusCode'] === 403);

        // 2. Insert ACTIVE temporary coverage (today between start and end)
        $insCov = $this->db->prepare("
            INSERT INTO temporary_coverages (patient_id, owner_pt_id, cover_pt_id, start_date, end_date, status)
            VALUES ('P-1001', 'T-001', 'T-002', :today, :tomorrow, 'active')
        ");
        $insCov->execute([':today' => $today, ':tomorrow' => $tomorrow]);
        $activeCovId = $this->db->lastInsertId();

        $resActive = PolicyEngine::canWriteSchedule($ptActor, 'P-1001');
        $this->assert("PT write with ACTIVE coverage returns 200", $resActive['allowed'] === true && $resActive['statusCode'] === 200);

        // 3. Expired coverage (end_date was yesterday)
        $expStmt = $this->db->prepare("
            UPDATE temporary_coverages
            SET start_date = '2026-01-01', end_date = :yesterday
            WHERE id = :id
        ");
        $expStmt->execute([':yesterday' => $yesterday, ':id' => $activeCovId]);

        $resExpired = PolicyEngine::canWriteSchedule($ptActor, 'P-1001');
        $this->assert("PT write AFTER coverage end_date returns 403", $resExpired['allowed'] === false && $resExpired['statusCode'] === 403);

        // Clean up test coverage
        $this->db->exec("DELETE FROM temporary_coverages WHERE id = {$activeCovId}");
    }

    /**
     * Test 4: Pose exercise in routine while flag is off -> 422 for Admin and PT
     */
    private function testPoseExercisesGatingReturns422(): void {
        $admin = ['id' => 'A-001', 'role' => 'admin'];
        $pt = ['id' => 'T-001', 'role' => 'pt'];

        // Routine with pose exercise EX-01
        $routineWithPose = [
            ['exercise_id' => 'MG-01'],
            ['exercise_id' => 'EX-01'] // Pose exercise
        ];

        // Routine with mini-game only
        $routineWithMinigameOnly = [
            ['exercise_id' => 'MG-01'],
            ['exercise_id' => 'MG-02']
        ];

        // Admin attempting pose routine -> 422
        $adminPoseRes = PolicyEngine::canWriteSchedule($admin, 'P-1001', $routineWithPose);
        $this->assert("Pose exercise in routine returns 422 for Admin", $adminPoseRes['allowed'] === false && $adminPoseRes['statusCode'] === 422);

        // PT attempting pose routine -> 422
        $ptPoseRes = PolicyEngine::canWriteSchedule($pt, 'P-1001', $routineWithPose);
        $this->assert("Pose exercise in routine returns 422 for PT", $ptPoseRes['allowed'] === false && $ptPoseRes['statusCode'] === 422);

        // Routine with only mini-games -> 200
        $minigameRes = PolicyEngine::canWriteSchedule($admin, 'P-1001', $routineWithMinigameOnly);
        $this->assert("Mini-game only routine returns 200", $minigameRes['allowed'] === true && $minigameRes['statusCode'] === 200);
    }

    /**
     * Test 5: PT edits an Admin-created exercise -> 403. Own item -> 200
     */
    private function testPtExerciseOwnershipCheck(): void {
        $ptActor = ['id' => 'T-001', 'role' => 'pt'];
        $adminExercise = ['id' => 'EX-01', 'created_by' => 'A-001', 'category' => 'Shoulder'];
        $ownExercise = ['id' => 'EX-CUSTOM-01', 'created_by' => 'T-001', 'category' => 'Custom'];

        $canEditAdminEx = PolicyEngine::canEditExercise($ptActor, $adminExercise, 'update');
        $this->assert("PT editing Admin exercise returns 403", $canEditAdminEx === false);

        $canDeleteAdminEx = PolicyEngine::canEditExercise($ptActor, $adminExercise, 'delete');
        $this->assert("PT deleting Admin exercise returns 403", $canDeleteAdminEx === false);

        $canEditOwnEx = PolicyEngine::canEditExercise($ptActor, $ownExercise, 'update');
        $this->assert("PT editing own exercise returns 200 (allowed)", $canEditOwnEx === true);
    }

    /**
     * Test 6: PT calls the audit API -> 403
     */
    private function testPtAuditAccessBlocked(): void {
        $adminActor = ['id' => 'A-001', 'role' => 'admin'];
        $ptActor = ['id' => 'T-001', 'role' => 'pt'];

        $adminAudit = PolicyEngine::canViewAudit($adminActor);
        $this->assert("Admin can view audit logs", $adminAudit === true);

        $ptAudit = PolicyEngine::canViewAudit($ptActor);
        $this->assert("PT accessing audit logs returns 403", $ptAudit === false);
    }

    /**
     * Test 7: Kiosk token requesting another patient's routine or outside allowlist -> 403
     */
    private function testKioskTokenAllowlist(): void {
        $kioskToken = ['role' => 'kiosk', 'patient_id' => 'P-1001'];

        // Allowed: GET /api/kiosk/routine
        $callRoutine = PolicyEngine::isKioskTokenAllowed($kioskToken, 'GET', '/api/kiosk/routine');
        $this->assert("Kiosk token GET /api/kiosk/routine allowed", $callRoutine['allowed'] === true);

        // Allowed: POST /api/kiosk/session-logs
        $callLogs = PolicyEngine::isKioskTokenAllowed($kioskToken, 'POST', '/api/kiosk/session-logs');
        $this->assert("Kiosk token POST /api/kiosk/session-logs allowed", $callLogs['allowed'] === true);

        // Allowed: GET /api/kiosk/next-appointment
        $callNext = PolicyEngine::isKioskTokenAllowed($kioskToken, 'GET', '/api/kiosk/next-appointment');
        $this->assert("Kiosk token GET /api/kiosk/next-appointment allowed", $callNext['allowed'] === true);

        // FORBIDDEN: GET /api/users
        $callUsers = PolicyEngine::isKioskTokenAllowed($kioskToken, 'GET', '/api/users');
        $this->assert("Kiosk token GET /api/users returns 403", $callUsers['allowed'] === false && $callUsers['statusCode'] === 403);

        // FORBIDDEN: POST /api/patients
        $callPatients = PolicyEngine::isKioskTokenAllowed($kioskToken, 'POST', '/api/patients');
        $this->assert("Kiosk token POST /api/patients returns 403", $callPatients['allowed'] === false && $callPatients['statusCode'] === 403);
    }
}

// If run directly via CLI
if (php_sapi_name() === 'cli' && basename(__FILE__) === basename($_SERVER['SCRIPT_FILENAME'] ?? '')) {
    $tester = new PolicyNegativeTest();
    $tester->runAll();
}

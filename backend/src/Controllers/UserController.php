<?php
/**
 * Moh Tech Care - User Controller
 * Handles User Management, 2-Step Registration Wizard, and Biometric Storage
 */

require_once __DIR__ . '/../Repositories/UserRepository.php';
require_once __DIR__ . '/../Repositories/AuditRepository.php';
require_once __DIR__ . '/../Middleware/AuthMiddleware.php';
require_once __DIR__ . '/../Middleware/RbacMiddleware.php';
require_once __DIR__ . '/../../config/Database.php';

class UserController {
    private UserRepository $userRepo;
    private AuditRepository $auditRepo;

    public function __construct() {
        $this->userRepo = new UserRepository();
        $this->auditRepo = new AuditRepository();
    }

    public function listUsers(): void {
        AuthMiddleware::check();
        $role = AuthMiddleware::getRole();
        if ($role !== 'admin' && $role !== 'pt') {
            http_response_code(403);
            echo json_encode(['status' => 'error', 'message' => 'Forbidden'], JSON_UNESCAPED_UNICODE);
            return;
        }

        $roleFilter = $_GET['role'] ?? null;
        $search = $_GET['search'] ?? null;

        $users = $this->userRepo->getAllUsers($roleFilter, $search);

        echo json_encode([
            'status' => 'success',
            'users' => $users
        ], JSON_UNESCAPED_UNICODE);
    }

    public function getUser(string $id): void {
        AuthMiddleware::check();
        $user = $this->userRepo->findById($id);

        if (!$user) {
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => 'User not found'], JSON_UNESCAPED_UNICODE);
            return;
        }

        echo json_encode([
            'status' => 'success',
            'user' => $user
        ], JSON_UNESCAPED_UNICODE);
    }

    public function createUser(): void {
        AuthMiddleware::check();
        $actor = AuthMiddleware::getUser();
        $actorRole = $actor['role'];

        $body = json_decode(file_get_contents('php://input'), true) ?? [];

        $role = $body['role'] ?? 'patient';
        // PT is restricted to creating patients only!
        if ($actorRole === 'pt' && $role !== 'patient') {
            http_response_code(403);
            echo json_encode(['status' => 'error', 'message' => 'Physiotherapists can create Patient accounts only'], JSON_UNESCAPED_UNICODE);
            return;
        }

        $id = trim($body['id'] ?? '');
        $fullName = trim($body['full_name'] ?? '');
        $username = trim($body['username'] ?? '');
        $password = $body['password'] ?? 'password123';
        $phone = trim($body['phone'] ?? '-') ?: '-';
        $email = trim($body['email'] ?? '-') ?: '-';

        if (!$id || !$fullName || !$username) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'ID, Full Name, and Username are required'], JSON_UNESCAPED_UNICODE);
            return;
        }

        // Validate strictly unique ID and Username
        $existingId = $this->userRepo->findById($id);
        if ($existingId) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => "User ID '{$id}' is already in use"], JSON_UNESCAPED_UNICODE);
            return;
        }

        $existingUsername = $this->userRepo->findByUsername($username);
        if ($existingUsername) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => "Username '{$username}' is already in use"], JSON_UNESCAPED_UNICODE);
            return;
        }

        $db = Database::getConnection();
        $db->beginTransaction();

        try {
            $passwordHash = password_hash($password, PASSWORD_BCRYPT);
            $stmt = $db->prepare("
                INSERT INTO users (id, full_name, username, password_hash, role, phone, email, status, must_change_password)
                VALUES (:id, :name, :username, :hash, :role, :phone, :email, 'active', 1)
            ");
            $stmt->execute([
                ':id' => $id,
                ':name' => $fullName,
                ':username' => $username,
                ':hash' => $passwordHash,
                ':role' => $role,
                ':phone' => $phone,
                ':email' => $email
            ]);

            if ($role === 'patient') {
                $age = (int)($body['age'] ?? 50);
                $gender = $body['gender'] ?? 'male';
                $admissionDate = $body['admission_date'] ?? date('Y-m-d');
                $assignedPtId = $actorRole === 'pt' ? $actor['user_id'] : ($body['assigned_pt_id'] ?? null);
                $initialSymptoms = $body['initial_symptoms'] ?? null;
                $underlying = trim($body['underlying_diseases'] ?? '-') ?: '-';
                $allergies = trim($body['drug_allergies'] ?? '-') ?: '-';

                $pStmt = $db->prepare("
                    INSERT INTO patient_profiles (patient_id, age, gender, admission_date, assigned_pt_id, treatment_status, initial_symptoms, underlying_diseases, drug_allergies)
                    VALUES (:pid, :age, :gender, :ad_date, :pt_id, 'active', :sym, :und, :allg)
                ");
                $pStmt->execute([
                    ':pid' => $id,
                    ':age' => $age,
                    ':gender' => $gender,
                    ':ad_date' => $admissionDate,
                    ':pt_id' => $assignedPtId ?: null,
                    ':sym' => $initialSymptoms,
                    ':und' => $underlying,
                    ':allg' => $allergies
                ]);
            } elseif ($role === 'pt') {
                $license = trim($body['license_number'] ?? 'PT-' . rand(1000, 9999));
                $department = $body['department'] ?? 'Musculoskeletal';
                $bio = $body['bio'] ?? null;

                $ptStmt = $db->prepare("
                    INSERT INTO pt_profiles (pt_id, license_number, department, bio)
                    VALUES (:pt_id, :lic, :dept, :bio)
                ");
                $ptStmt->execute([
                    ':pt_id' => $id,
                    ':lic' => $license,
                    ':dept' => $department,
                    ':bio' => $bio
                ]);
            }

            $db->commit();

            $this->auditRepo->log(
                $actor['user_id'],
                $actor['full_name'],
                $actorRole,
                BannedIpMiddleware::getClientIp(),
                'Desktop',
                'USER_CREATE',
                "Created user {$id} ({$fullName}) with role {$role}",
                'Normal'
            );

            $createdUser = $this->userRepo->findById($id);

            http_response_code(201);
            echo json_encode([
                'status' => 'success',
                'user' => $createdUser
            ], JSON_UNESCAPED_UNICODE);
        } catch (Exception $e) {
            $db->rollBack();
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
        }
    }

    public function updateUser(string $id): void {
        AuthMiddleware::check();
        $actor = AuthMiddleware::getUser();
        $target = $this->userRepo->findById($id);

        if (!$target) {
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => 'User not found'], JSON_UNESCAPED_UNICODE);
            return;
        }

        // PT can only edit Patient accounts!
        if ($actor['role'] === 'pt' && $target['role'] !== 'patient') {
            http_response_code(403);
            echo json_encode(['status' => 'error', 'message' => 'Forbidden: PT can only edit Patient accounts'], JSON_UNESCAPED_UNICODE);
            return;
        }

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $fullName = trim($body['full_name'] ?? $target['full_name']);
        $phone = trim($body['phone'] ?? $target['phone']) ?: '-';
        $email = trim($body['email'] ?? $target['email']) ?: '-';
        $status = $body['status'] ?? $target['status'];

        $db = Database::getConnection();
        $stmt = $db->prepare("
            UPDATE users
            SET full_name = :name, phone = :phone, email = :email, status = :status, updated_at = :upd
            WHERE id = :id
        ");
        $stmt->execute([
            ':name' => $fullName,
            ':phone' => $phone,
            ':email' => $email,
            ':status' => $status,
            ':upd' => date('Y-m-d H:i:s'),
            ':id' => $id
        ]);

        $this->auditRepo->log(
            $actor['user_id'],
            $actor['full_name'],
            $actor['role'],
            BannedIpMiddleware::getClientIp(),
            'Desktop',
            'USER_UPDATE',
            "Updated user {$id} status={$status}",
            'Normal'
        );

        $updated = $this->userRepo->findById($id);
        echo json_encode(['status' => 'success', 'user' => $updated], JSON_UNESCAPED_UNICODE);
    }

    public function resetPassword(string $id): void {
        AuthMiddleware::check();
        $actor = AuthMiddleware::getUser();
        $target = $this->userRepo->findById($id);

        if (!$target) {
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => 'User not found'], JSON_UNESCAPED_UNICODE);
            return;
        }

        if ($actor['role'] === 'pt' && $target['role'] !== 'patient') {
            http_response_code(403);
            echo json_encode(['status' => 'error', 'message' => 'PT can only reset passwords for Patients'], JSON_UNESCAPED_UNICODE);
            return;
        }

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $tempPass = !empty($body['password']) ? $body['password'] : 'Temp#' . rand(100000, 999999);

        $newHash = password_hash($tempPass, PASSWORD_BCRYPT);
        $this->userRepo->updatePassword($id, $newHash, false); // must_change_password = 1

        $this->auditRepo->log(
            $actor['user_id'],
            $actor['full_name'],
            $actor['role'],
            BannedIpMiddleware::getClientIp(),
            'Desktop',
            'PASSWORD_RESET',
            "Reset temporary password for user {$id}",
            'Normal'
        );

        echo json_encode([
            'status' => 'success',
            'message' => 'Temporary password set successfully',
            'temporary_password' => $tempPass
        ], JSON_UNESCAPED_UNICODE);
    }

    public function resetBiometrics(string $id): void {
        AuthMiddleware::check();
        $actor = AuthMiddleware::getUser();
        $target = $this->userRepo->findById($id);

        if (!$target) {
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => 'User not found'], JSON_UNESCAPED_UNICODE);
            return;
        }

        if ($actor['role'] === 'pt' && $target['role'] !== 'patient') {
            http_response_code(403);
            echo json_encode(['status' => 'error', 'message' => 'PT can only reset biometrics for Patients'], JSON_UNESCAPED_UNICODE);
            return;
        }

        $db = Database::getConnection();
        $stmt = $db->prepare("DELETE FROM face_templates WHERE user_id = :uid");
        $stmt->execute([':uid' => $id]);

        $this->auditRepo->log(
            $actor['user_id'],
            $actor['full_name'],
            $actor['role'],
            BannedIpMiddleware::getClientIp(),
            'Desktop',
            'BIOMETRIC_RESET',
            "Deleted face embeddings for user {$id}",
            'Normal'
        );

        echo json_encode([
            'status' => 'success',
            'message' => 'Biometric templates removed successfully'
        ], JSON_UNESCAPED_UNICODE);
    }

    public function saveBiometrics(string $id): void {
        AuthMiddleware::check();
        $actor = AuthMiddleware::getUser();
        $body = json_decode(file_get_contents('php://input'), true) ?? [];

        $embedding = $body['embedding'] ?? [];
        $frames = $body['frames'] ?? []; // base64 frames 1..10

        if (empty($embedding) || !is_array($embedding)) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Average embedding vector is required'], JSON_UNESCAPED_UNICODE);
            return;
        }

        $db = Database::getConnection();

        // Remove old templates
        $del = $db->prepare("DELETE FROM face_templates WHERE user_id = :uid");
        $del->execute([':uid' => $id]);

        // Insert average embedding
        $stmt = $db->prepare("
            INSERT INTO face_templates (user_id, template_type, frame_index, embedding)
            VALUES (:uid, 'average', 0, :emb)
        ");
        $stmt->execute([
            ':uid' => $id,
            ':emb' => json_encode($embedding)
        ]);

        // Save frames to strictly isolated storage directory
        $config = require __DIR__ . '/../../config/config.php';
        $user = $this->userRepo->findById($id);
        $role = $user['role'] ?? 'patient';
        $userStorageDir = "{$config['storage']['biometric']}/{$role}/{$id}/face_frames";

        if (!is_dir($userStorageDir)) {
            @mkdir($userStorageDir, 0775, true);
        }

        foreach ($frames as $idx => $base64Data) {
            if (preg_match('#^data:image/\w+;base64,#i', $base64Data)) {
                $base64Data = substr($base64Data, strpos($base64Data, ',') + 1);
            }
            $imgData = base64_decode($base64Data);
            if ($imgData !== false) {
                $frameNum = $idx + 1;
                @file_put_contents("{$userStorageDir}/frame_{$frameNum}.jpg", $imgData);
            }
        }

        $this->auditRepo->log(
            $actor['user_id'],
            $actor['full_name'],
            $actor['role'],
            BannedIpMiddleware::getClientIp(),
            'Desktop',
            'BIOMETRIC_REGISTER',
            "Enrolled 10-snap biometrics for user {$id}",
            'Normal'
        );

        echo json_encode([
            'status' => 'success',
            'message' => 'Biometric registration completed successfully'
        ], JSON_UNESCAPED_UNICODE);
    }
}

<?php
/**
 * Moh Tech Care - User Repository
 * Single Source of Truth for Users, Profiles, and Credentials.
 * CRITICAL RULE: API NEVER returns real password hashes.
 */

require_once __DIR__ . '/../../config/Database.php';

class UserRepository {
    private PDO $db;
    private string $passwordMask;

    public function __construct() {
        $this->db = Database::getConnection();
        $config = require __DIR__ . '/../../config/config.php';
        $this->passwordMask = $config['security']['password_mask'] ?? 'Hashed ●●●●';
    }

    public function findById(string $id, bool $includeRawHash = false): ?array {
        $stmt = $this->db->prepare("
            SELECT u.*,
                   pp.age, pp.gender, pp.admission_date, pp.assigned_pt_id, pp.treatment_status,
                   pp.initial_symptoms, pp.underlying_diseases, pp.drug_allergies,
                   assigned_pt.full_name as assigned_pt_name,
                   ptp.license_number, ptp.department, ptp.bio
            FROM users u
            LEFT JOIN patient_profiles pp ON u.id = pp.patient_id
            LEFT JOIN users assigned_pt ON pp.assigned_pt_id = assigned_pt.id
            LEFT JOIN pt_profiles ptp ON u.id = ptp.pt_id
            WHERE u.id = :id
            LIMIT 1
        ");
        $stmt->execute([':id' => $id]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            return null;
        }

        return $this->formatUserOutput($user, $includeRawHash);
    }

    public function findByUsername(string $username, bool $includeRawHash = false): ?array {
        $stmt = $this->db->prepare("
            SELECT u.*,
                   pp.age, pp.gender, pp.admission_date, pp.assigned_pt_id, pp.treatment_status,
                   pp.initial_symptoms, pp.underlying_diseases, pp.drug_allergies,
                   assigned_pt.full_name as assigned_pt_name,
                   ptp.license_number, ptp.department, ptp.bio
            FROM users u
            LEFT JOIN patient_profiles pp ON u.id = pp.patient_id
            LEFT JOIN users assigned_pt ON pp.assigned_pt_id = assigned_pt.id
            LEFT JOIN pt_profiles ptp ON u.id = ptp.pt_id
            WHERE u.username = :username
            LIMIT 1
        ");
        $stmt->execute([':username' => $username]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            return null;
        }

        return $this->formatUserOutput($user, $includeRawHash);
    }

    public function updatePassword(string $userId, string $newPasswordHash, bool $clearMustChange = true): bool {
        $mustChangeVal = $clearMustChange ? 0 : 1;
        $stmt = $this->db->prepare("
            UPDATE users
            SET password_hash = :hash, must_change_password = :must_change, updated_at = :updated_at
            WHERE id = :id
        ");
        return $stmt->execute([
            ':hash' => $newPasswordHash,
            ':must_change' => $mustChangeVal,
            ':updated_at' => date('Y-m-d H:i:s'),
            ':id' => $userId
        ]);
    }

    public function getAllUsers(?string $roleFilter = null, ?string $search = null): array {
        $sql = "
            SELECT u.id, u.full_name, u.username, u.role, u.phone, u.email, u.status,
                   u.must_change_password, u.created_at, u.updated_at,
                   pp.age, pp.gender, pp.admission_date, pp.assigned_pt_id, pp.treatment_status,
                   assigned_pt.full_name as assigned_pt_name,
                   ptp.license_number, ptp.department,
                   (CASE WHEN ft.id IS NOT NULL THEN 'Registered' ELSE 'Pending' END) as face_id_status
            FROM users u
            LEFT JOIN patient_profiles pp ON u.id = pp.patient_id
            LEFT JOIN users assigned_pt ON pp.assigned_pt_id = assigned_pt.id
            LEFT JOIN pt_profiles ptp ON u.id = ptp.pt_id
            LEFT JOIN (SELECT DISTINCT user_id, id FROM face_templates WHERE template_type = 'average') ft ON u.id = ft.user_id
            WHERE 1=1
        ";
        $params = [];

        if ($roleFilter) {
            $sql .= " AND u.role = :role";
            $params[':role'] = $roleFilter;
        }
        if ($search) {
            $sql .= " AND (u.full_name LIKE :s1 OR u.username LIKE :s2 OR u.id LIKE :s3)";
            $params[':s1'] = "%{$search}%";
            $params[':s2'] = "%{$search}%";
            $params[':s3'] = "%{$search}%";
        }

        $sql .= " ORDER BY u.created_at DESC";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return array_map(function($r) {
            $r['password_hash'] = $this->passwordMask;
            return $r;
        }, $rows);
    }

    private function formatUserOutput(array $user, bool $includeRawHash): array {
        if (!$includeRawHash) {
            $user['raw_password_hash'] = null;
            $user['password_hash'] = $this->passwordMask;
        } else {
            $user['raw_password_hash'] = $user['password_hash'];
            $user['password_hash'] = $this->passwordMask;
        }
        return $user;
    }
}

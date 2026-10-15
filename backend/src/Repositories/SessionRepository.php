<?php
/**
 * Moh Tech Care - Session Repository
 * Manages database-backed sessions in `auth_sessions` for stateful tracking & Force Logout
 */

require_once __DIR__ . '/../../config/Database.php';

class SessionRepository {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getConnection();
    }

    public function createSession(string $token, string $userId, string $role, string $ip, string $userAgent, string $deviceType, int $lifetimeSeconds): bool {
        $now = date('Y-m-d H:i:s');
        $expiresAt = date('Y-m-d H:i:s', time() + $lifetimeSeconds);

        $stmt = $this->db->prepare("
            INSERT INTO auth_sessions (id, user_id, role, ip_address, user_agent, device_type, last_activity, expires_at, is_revoked)
            VALUES (:id, :user_id, :role, :ip, :user_agent, :device_type, :last_activity, :expires_at, 0)
        ");

        return $stmt->execute([
            ':id' => $token,
            ':user_id' => $userId,
            ':role' => $role,
            ':ip' => $ip,
            ':user_agent' => substr($userAgent, 0, 500),
            ':device_type' => $deviceType,
            ':last_activity' => $now,
            ':expires_at' => $expiresAt
        ]);
    }

    public function getActiveSession(string $token): ?array {
        $now = date('Y-m-d H:i:s');
        $stmt = $this->db->prepare("
            SELECT s.*, u.full_name, u.username, u.status as user_status, u.must_change_password
            FROM auth_sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.id = :id AND s.is_revoked = 0 AND s.expires_at > :now
            LIMIT 1
        ");
        $stmt->execute([':id' => $token, ':now' => $now]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($row) {
            // Update last_activity asynchronously
            $upd = $this->db->prepare("UPDATE auth_sessions SET last_activity = :now WHERE id = :id");
            $upd->execute([':now' => $now, ':id' => $token]);
        }

        return $row ?: null;
    }

    public function revokeSession(string $token): bool {
        $stmt = $this->db->prepare("UPDATE auth_sessions SET is_revoked = 1 WHERE id = :id");
        return $stmt->execute([':id' => $token]);
    }

    public function revokeAllUserSessions(string $userId): int {
        $stmt = $this->db->prepare("UPDATE auth_sessions SET is_revoked = 1 WHERE user_id = :user_id AND is_revoked = 0");
        $stmt->execute([':user_id' => $userId]);
        return $stmt->rowCount();
    }

    public function revokeAllSessionsByIp(string $ip): int {
        $stmt = $this->db->prepare("UPDATE auth_sessions SET is_revoked = 1 WHERE ip_address = :ip AND is_revoked = 0");
        $stmt->execute([':ip' => $ip]);
        return $stmt->rowCount();
    }

    public function getActiveSessionsForUser(string $userId): array {
        $now = date('Y-m-d H:i:s');
        $stmt = $this->db->prepare("
            SELECT id, ip_address, device_type, user_agent, last_activity, expires_at, created_at
            FROM auth_sessions
            WHERE user_id = :user_id AND is_revoked = 0 AND expires_at > :now
            ORDER BY last_activity DESC
        ");
        $stmt->execute([':user_id' => $userId, ':now' => $now]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
}

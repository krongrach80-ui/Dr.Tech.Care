<?php
/**
 * Moh Tech Care - Audit Repository
 * Handles system audit logging, security event detection, and anomaly flagging
 */

require_once __DIR__ . '/../../config/Database.php';

class AuditRepository {
    private PDO $db;

    public function __construct() {
        $this->db = Database::getConnection();
    }

    public function log(
        ?string $userId,
        ?string $userName,
        ?string $userRole,
        string $ipAddress,
        string $deviceType,
        string $action,
        ?string $details = null,
        string $securityStatus = 'Normal'
    ): int {
        $stmt = $this->db->prepare("
            INSERT INTO audit_logs (user_id, user_name, user_role, ip_address, device_type, action, details, security_status, created_at)
            VALUES (:user_id, :user_name, :user_role, :ip, :device_type, :action, :details, :security_status, :created_at)
        ");

        $stmt->execute([
            ':user_id' => $userId,
            ':user_name' => $userName,
            ':user_role' => $userRole,
            ':ip' => $ipAddress,
            ':device_type' => $deviceType,
            ':action' => $action,
            ':details' => $details,
            ':security_status' => $securityStatus,
            ':created_at' => date('Y-m-d H:i:s')
        ]);

        return (int)$this->db->lastInsertId();
    }

    public function getRecentFailedLogins(string $ipAddress, int $minutes = 10): int {
        $since = date('Y-m-d H:i:s', time() - ($minutes * 60));
        $stmt = $this->db->prepare("
            SELECT COUNT(*) as failed_count
            FROM audit_logs
            WHERE ip_address = :ip
              AND action = 'LOGIN_FAILED'
              AND created_at >= :since
        ");
        $stmt->execute([':ip' => $ipAddress, ':since' => $since]);
        $res = $stmt->fetch(PDO::FETCH_ASSOC);
        return (int)($res['failed_count'] ?? 0);
    }

    public function getAll(int $limit = 100, int $offset = 0, ?string $filterAction = null, ?string $filterSecurity = null): array {
        $sql = "SELECT * FROM audit_logs WHERE 1=1";
        $params = [];

        if ($filterAction) {
            $sql .= " AND action LIKE :action";
            $params[':action'] = "%{$filterAction}%";
        }
        if ($filterSecurity) {
            $sql .= " AND security_status = :security";
            $params[':security'] = $filterSecurity;
        }

        $sql .= " ORDER BY created_at DESC LIMIT :limit OFFSET :offset";
        $stmt = $this->db->prepare($sql);
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function getTotalCount(?string $filterAction = null, ?string $filterSecurity = null): int {
        $sql = "SELECT COUNT(*) as total FROM audit_logs WHERE 1=1";
        $params = [];

        if ($filterAction) {
            $sql .= " AND action LIKE :action";
            $params[':action'] = "%{$filterAction}%";
        }
        if ($filterSecurity) {
            $sql .= " AND security_status = :security";
            $params[':security'] = $filterSecurity;
        }

        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        $res = $stmt->fetch(PDO::FETCH_ASSOC);
        return (int)($res['total'] ?? 0);
    }
}

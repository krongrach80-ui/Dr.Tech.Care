<?php
/**
 * Moh Tech Care - Audit & Security Control Controller (Module 6)
 * Handles Audit Logging, Suspicious Detection, and IP Ban/Unban Management
 */

require_once __DIR__ . '/../Repositories/AuditRepository.php';
require_once __DIR__ . '/../Repositories/SessionRepository.php';
require_once __DIR__ . '/../Middleware/AuthMiddleware.php';
require_once __DIR__ . '/../Middleware/RbacMiddleware.php';
require_once __DIR__ . '/../../config/Database.php';

class AuditController {
    private AuditRepository $auditRepo;
    private SessionRepository $sessionRepo;
    private PDO $db;

    public function __construct() {
        $this->auditRepo = new AuditRepository();
        $this->sessionRepo = new SessionRepository();
        $this->db = Database::getConnection();
    }

    public function listAuditLogs(): void {
        RbacMiddleware::requireRole(['admin']);

        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 100;
        $offset = isset($_GET['offset']) ? (int)$_GET['offset'] : 0;
        $action = $_GET['action'] ?? null;
        $security = $_GET['security'] ?? null;

        $logs = $this->auditRepo->getAll($limit, $offset, $action, $security);
        $total = $this->auditRepo->getTotalCount($action, $security);

        echo json_encode([
            'status' => 'success',
            'logs' => $logs,
            'total' => $total
        ], JSON_UNESCAPED_UNICODE);
    }

    public function getBannedIps(): void {
        RbacMiddleware::requireRole(['admin']);

        $stmt = $this->db->prepare("
            SELECT b.*, u.full_name as banned_by_name
            FROM banned_ips b
            JOIN users u ON b.banned_by = u.id
            ORDER BY b.banned_at DESC
        ");
        $stmt->execute();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'status' => 'success',
            'banned_ips' => $rows
        ], JSON_UNESCAPED_UNICODE);
    }

    public function banIp(): void {
        RbacMiddleware::requireRole(['admin']);
        $actor = AuthMiddleware::getUser();
        $body = json_decode(file_get_contents('php://input'), true) ?? [];

        $ip = trim($body['ip_address'] ?? '');
        $reason = trim($body['reason'] ?? 'Suspicious administrative intervention') ?: 'Suspicious administrative intervention';

        if (!$ip) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'IP address is required'], JSON_UNESCAPED_UNICODE);
            return;
        }

        $stmt = $this->db->prepare("
            INSERT INTO banned_ips (ip_address, reason, banned_by, banned_at, is_active)
            VALUES (:ip, :reason, :actor, :now, 1)
            ON DUPLICATE KEY UPDATE reason = :reason_upd, is_active = 1, banned_at = :now_upd
        ");
        $now = date('Y-m-d H:i:s');
        $stmt->execute([
            ':ip' => $ip,
            ':reason' => $reason,
            ':actor' => $actor['user_id'],
            ':now' => $now,
            ':reason_upd' => $reason,
            ':now_upd' => $now
        ]);

        // Immediately revoke all active sessions originating from this IP
        $revokedSessions = $this->sessionRepo->revokeAllSessionsByIp($ip);

        $this->auditRepo->log(
            $actor['user_id'],
            $actor['full_name'],
            $actor['role'],
            BannedIpMiddleware::getClientIp(),
            'Desktop',
            'IP_BANNED',
            "Banned IP {$ip} (Reason: {$reason}). Revoked {$revokedSessions} active sessions.",
            'Suspicious'
        );

        echo json_encode([
            'status' => 'success',
            'message' => "IP {$ip} has been banned. {$revokedSessions} sessions terminated.",
            'revoked_sessions' => $revokedSessions
        ], JSON_UNESCAPED_UNICODE);
    }

    public function unbanIp(): void {
        RbacMiddleware::requireRole(['admin']);
        $actor = AuthMiddleware::getUser();
        $body = json_decode(file_get_contents('php://input'), true) ?? [];

        $ip = trim($body['ip_address'] ?? '');

        if (!$ip) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'IP address is required'], JSON_UNESCAPED_UNICODE);
            return;
        }

        $stmt = $this->db->prepare("UPDATE banned_ips SET is_active = 0 WHERE ip_address = :ip");
        $stmt->execute([':ip' => $ip]);

        $this->auditRepo->log(
            $actor['user_id'],
            $actor['full_name'],
            $actor['role'],
            BannedIpMiddleware::getClientIp(),
            'Desktop',
            'IP_UNBANNED',
            "Unbanned IP {$ip}",
            'Normal'
        );

        echo json_encode([
            'status' => 'success',
            'message' => "IP {$ip} unbanned successfully"
        ], JSON_UNESCAPED_UNICODE);
    }
}

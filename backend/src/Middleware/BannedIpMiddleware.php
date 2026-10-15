<?php
/**
 * Moh Tech Care - Banned IP Middleware
 * Enforces IP bans checked on every incoming request, including Kiosk.
 */

require_once __DIR__ . '/../../config/Database.php';

class BannedIpMiddleware {
    public static function check(): void {
        $ip = self::getClientIp();
        $db = Database::getConnection();

        $stmt = $db->prepare("SELECT id, reason FROM banned_ips WHERE ip_address = :ip AND is_active = 1 LIMIT 1");
        $stmt->execute([':ip' => $ip]);
        $banned = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($banned) {
            http_response_code(403);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode([
                'status' => 'error',
                'code' => 'IP_BANNED',
                'message' => 'Access Denied: Your IP address has been suspended by hospital administration.',
                'reason' => $banned['reason']
            ], JSON_UNESCAPED_UNICODE);
            exit();
        }
    }

    public static function getClientIp(): string {
        if (!empty($_SERVER['HTTP_CF_CONNECTING_IP'])) {
            return $_SERVER['HTTP_CF_CONNECTING_IP'];
        }
        if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
            $parts = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
            return trim($parts[0]);
        }
        return $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
    }
}

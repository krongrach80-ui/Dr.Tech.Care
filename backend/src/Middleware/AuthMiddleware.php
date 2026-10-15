<?php
/**
 * Moh Tech Care - Auth Middleware (v2.1)
 * Validates DB-backed session tokens from auth_sessions.
 * Enforces Force Logout, Session Expiry, and Kiosk Token Scoped Allowlist.
 */

require_once __DIR__ . '/../Repositories/SessionRepository.php';
require_once __DIR__ . '/../Services/PolicyEngine.php';

class AuthMiddleware {
    private static ?array $currentUser = null;
    private static ?string $currentToken = null;

    public static function check(): bool {
        $token = self::extractToken();

        if (!$token) {
            http_response_code(401);
            echo json_encode([
                'status' => 'error',
                'code' => 'UNAUTHORIZED',
                'message' => 'Unauthorized: Missing session token'
            ], JSON_UNESCAPED_UNICODE);
            exit();
        }

        $sessionRepo = new SessionRepository();
        $session = $sessionRepo->getActiveSession($token);

        if (!$session) {
            http_response_code(401);
            echo json_encode([
                'status' => 'error',
                'code' => 'SESSION_INVALID_OR_REVOKED',
                'message' => 'Unauthorized: Session is expired or has been revoked by administration'
            ], JSON_UNESCAPED_UNICODE);
            exit();
        }

        if (($session['user_status'] ?? 'active') !== 'active') {
            http_response_code(403);
            echo json_encode([
                'status' => 'error',
                'code' => 'ACCOUNT_DISABLED',
                'message' => 'Access Denied: Your account has been disabled'
            ], JSON_UNESCAPED_UNICODE);
            exit();
        }

        // Kiosk Scoped Token Security Check (v2.1)
        // Kiosk tokens (role = 'kiosk') are restricted to allowlisted endpoints only
        $role = strtolower($session['role'] ?? '');
        if ($role === 'kiosk') {
            $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
            $uri = $_SERVER['REQUEST_URI'] ?? '';
            $check = PolicyEngine::isKioskTokenAllowed($session, $method, $uri);

            if (!$check['allowed']) {
                http_response_code($check['statusCode'] ?? 403);
                echo json_encode([
                    'status' => 'error',
                    'code' => 'KIOSK_TOKEN_FORBIDDEN',
                    'message' => $check['message'] ?? 'Forbidden: Kiosk token is restricted to interactive session endpoints only'
                ], JSON_UNESCAPED_UNICODE);
                exit();
            }
        }

        self::$currentUser = $session;
        self::$currentToken = $token;
        return true;
    }

    public static function getUser(): ?array {
        return self::$currentUser;
    }

    public static function getUserId(): ?string {
        return self::$currentUser['user_id'] ?? null;
    }

    public static function getRole(): ?string {
        return self::$currentUser['role'] ?? null;
    }

    public static function getToken(): ?string {
        return self::$currentToken;
    }

    private static function extractToken(): ?string {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION']
            ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
            ?? (function_exists('apache_request_headers') ? (apache_request_headers()['Authorization'] ?? null) : null);

        if ($authHeader && preg_match('/Bearer\s+(\S+)/i', $authHeader, $matches)) {
            return trim($matches[1]);
        }

        if (!empty($_SERVER['HTTP_X_AUTH_TOKEN'])) {
            return trim($_SERVER['HTTP_X_AUTH_TOKEN']);
        }

        if (!empty($_COOKIE['moh_session'])) {
            return trim($_COOKIE['moh_session']);
        }

        return null;
    }
}

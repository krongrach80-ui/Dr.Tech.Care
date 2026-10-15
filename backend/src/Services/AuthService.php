<?php
/**
 * Moh Tech Care - Auth Service
 * Business logic for authentication, rate limiting, session generation, and audit logging.
 */

require_once __DIR__ . '/../Repositories/UserRepository.php';
require_once __DIR__ . '/../Repositories/SessionRepository.php';
require_once __DIR__ . '/../Repositories/AuditRepository.php';
require_once __DIR__ . '/../Middleware/BannedIpMiddleware.php';

class AuthService {
    private UserRepository $userRepo;
    private SessionRepository $sessionRepo;
    private AuditRepository $auditRepo;
    private array $config;

    public function __construct() {
        $this->userRepo = new UserRepository();
        $this->sessionRepo = new SessionRepository();
        $this->auditRepo = new AuditRepository();
        $this->config = require __DIR__ . '/../../config/config.php';
    }

    public function login(string $username, string $password, string $deviceType = 'Desktop'): array {
        $ip = BannedIpMiddleware::getClientIp();
        $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown';

        // 1. Rate Limiting Check
        $maxAttempts = (int)($this->config['security']['max_login_attempts_per_window'] ?? 5);
        $windowMinutes = (int)($this->config['security']['login_rate_window_minutes'] ?? 10);
        $recentFailures = $this->auditRepo->getRecentFailedLogins($ip, $windowMinutes);

        if ($recentFailures >= $maxAttempts) {
            $this->auditRepo->log(
                null,
                $username,
                null,
                $ip,
                $deviceType,
                'LOGIN_RATE_LIMITED',
                "Rate limit exceeded: {$recentFailures} failures in {$windowMinutes}m",
                'Suspicious'
            );
            return [
                'success' => false,
                'status_code' => 429,
                'error' => 'Too many failed login attempts. Please wait 10 minutes or contact hospital IT.'
            ];
        }

        // 2. Fetch User by Username
        $user = $this->userRepo->findByUsername($username, true);

        if (!$user || !isset($user['raw_password_hash'])) {
            $this->auditRepo->log(
                null,
                $username,
                null,
                $ip,
                $deviceType,
                'LOGIN_FAILED',
                "Non-existent username attempt: {$username}",
                ($recentFailures + 1 >= 3) ? 'Suspicious' : 'Normal'
            );
            return [
                'success' => false,
                'status_code' => 401,
                'error' => 'Invalid username or password'
            ];
        }

        // Check Account Status
        if ($user['status'] === 'disabled') {
            $this->auditRepo->log(
                $user['id'],
                $user['full_name'],
                $user['role'],
                $ip,
                $deviceType,
                'LOGIN_BLOCKED_DISABLED',
                "Disabled account attempted login",
                'Suspicious'
            );
            return [
                'success' => false,
                'status_code' => 403,
                'error' => 'This account has been deactivated. Please contact the administrator.'
            ];
        }

        // 3. Verify Password
        if (!password_verify($password, $user['raw_password_hash'])) {
            $this->auditRepo->log(
                $user['id'],
                $user['full_name'],
                $user['role'],
                $ip,
                $deviceType,
                'LOGIN_FAILED',
                "Incorrect password for user ID: {$user['id']}",
                ($recentFailures + 1 >= 3) ? 'Suspicious' : 'Normal'
            );
            return [
                'success' => false,
                'status_code' => 401,
                'error' => 'Invalid username or password'
            ];
        }

        // 4. Generate Session Token
        $token = bin2hex(random_bytes(32));
        $lifetime = ($user['role'] === 'patient' || $deviceType === 'Kiosk')
            ? (int)($this->config['security']['kiosk_session_lifetime_seconds'] ?? 3600)
            : (int)($this->config['security']['session_lifetime_seconds'] ?? 86400);

        $this->sessionRepo->createSession(
            $token,
            $user['id'],
            $user['role'],
            $ip,
            $userAgent,
            $deviceType,
            $lifetime
        );

        // 5. Audit Log Success
        $this->auditRepo->log(
            $user['id'],
            $user['full_name'],
            $user['role'],
            $ip,
            $deviceType,
            'LOGIN_SUCCESS',
            "Logged in successfully via {$deviceType}",
            'Normal'
        );

        // 6. Strip Raw Password Hash
        unset($user['raw_password_hash']);

        return [
            'success' => true,
            'status_code' => 200,
            'token' => $token,
            'user' => $user,
            'must_change_password' => (bool)($user['must_change_password'] ?? 0)
        ];
    }

    public function logout(string $token): bool {
        $session = $this->sessionRepo->getActiveSession($token);
        if ($session) {
            $ip = BannedIpMiddleware::getClientIp();
            $this->auditRepo->log(
                $session['user_id'],
                $session['full_name'],
                $session['role'],
                $ip,
                $session['device_type'] ?? 'Desktop',
                'LOGOUT',
                'User logged out and session terminated',
                'Normal'
            );
        }
        return $this->sessionRepo->revokeSession($token);
    }

    public function changePassword(string $userId, string $oldPassword, string $newPassword): array {
        $user = $this->userRepo->findById($userId, true);
        if (!$user) {
            return ['success' => false, 'error' => 'User not found'];
        }

        if (!password_verify($oldPassword, $user['raw_password_hash'])) {
            return ['success' => false, 'error' => 'Current password is incorrect'];
        }

        if (strlen($newPassword) < 6) {
            return ['success' => false, 'error' => 'New password must be at least 6 characters'];
        }

        $newHash = password_hash($newPassword, PASSWORD_BCRYPT);
        $this->userRepo->updatePassword($userId, $newHash, true);

        $ip = BannedIpMiddleware::getClientIp();
        $this->auditRepo->log(
            $userId,
            $user['full_name'],
            $user['role'],
            $ip,
            'Desktop',
            'PASSWORD_CHANGE',
            'User updated their account password',
            'Normal'
        );

        return ['success' => true];
    }

    public function forceLogoutUser(string $targetUserId, string $actorId, string $actorName, string $actorRole): int {
        $count = $this->sessionRepo->revokeAllUserSessions($targetUserId);
        $ip = BannedIpMiddleware::getClientIp();

        $this->auditRepo->log(
            $actorId,
            $actorName,
            $actorRole,
            $ip,
            'Desktop',
            'FORCE_LOGOUT',
            "Force logged out user {$targetUserId} ({$count} active sessions terminated)",
            'Normal'
        );

        return $count;
    }
}

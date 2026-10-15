<?php
/**
 * Moh Tech Care - Auth Controller
 * REST API Endpoints for user authentication and session management
 */

require_once __DIR__ . '/../Services/AuthService.php';
require_once __DIR__ . '/../Middleware/AuthMiddleware.php';
require_once __DIR__ . '/../Middleware/RbacMiddleware.php';

class AuthController {
    private AuthService $authService;

    public function __construct() {
        $this->authService = new AuthService();
    }

    public function login(): void {
        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $username = trim($body['username'] ?? '');
        $password = $body['password'] ?? '';
        $deviceType = $body['device_type'] ?? 'Desktop';

        if (!$username || !$password) {
            http_response_code(400);
            echo json_encode([
                'status' => 'error',
                'message' => 'Username and password are required'
            ], JSON_UNESCAPED_UNICODE);
            return;
        }

        $result = $this->authService->login($username, $password, $deviceType);

        http_response_code($result['status_code']);
        if (!$result['success']) {
            echo json_encode([
                'status' => 'error',
                'message' => $result['error']
            ], JSON_UNESCAPED_UNICODE);
            return;
        }

        echo json_encode([
            'status' => 'success',
            'token' => $result['token'],
            'user' => $result['user'],
            'must_change_password' => $result['must_change_password']
        ], JSON_UNESCAPED_UNICODE);
    }

    public function logout(): void {
        AuthMiddleware::check();
        $token = AuthMiddleware::getToken();

        if ($token) {
            $this->authService->logout($token);
        }

        http_response_code(200);
        echo json_encode([
            'status' => 'success',
            'message' => 'Successfully logged out'
        ], JSON_UNESCAPED_UNICODE);
    }

    public function me(): void {
        AuthMiddleware::check();
        $user = AuthMiddleware::getUser();

        // Refresh user profile from repository
        $userRepo = new UserRepository();
        $fullUser = $userRepo->findById($user['user_id']);

        if (!$fullUser) {
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => 'User not found'], JSON_UNESCAPED_UNICODE);
            return;
        }

        http_response_code(200);
        echo json_encode([
            'status' => 'success',
            'user' => $fullUser
        ], JSON_UNESCAPED_UNICODE);
    }

    public function changePassword(): void {
        AuthMiddleware::check();
        $userId = AuthMiddleware::getUserId();
        $body = json_decode(file_get_contents('php://input'), true) ?? [];

        $oldPassword = $body['old_password'] ?? '';
        $newPassword = $body['new_password'] ?? '';

        if (!$oldPassword || !$newPassword) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Both old and new passwords are required'], JSON_UNESCAPED_UNICODE);
            return;
        }

        $res = $this->authService->changePassword($userId, $oldPassword, $newPassword);

        if (!$res['success']) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => $res['error']], JSON_UNESCAPED_UNICODE);
            return;
        }

        http_response_code(200);
        echo json_encode(['status' => 'success', 'message' => 'Password updated successfully'], JSON_UNESCAPED_UNICODE);
    }

    public function forceLogout(): void {
        RbacMiddleware::requireRole(['admin']);
        $actor = AuthMiddleware::getUser();

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $targetUserId = trim($body['target_user_id'] ?? '');

        if (!$targetUserId) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Target user ID is required'], JSON_UNESCAPED_UNICODE);
            return;
        }

        $count = $this->authService->forceLogoutUser(
            $targetUserId,
            $actor['user_id'],
            $actor['full_name'],
            $actor['role']
        );

        http_response_code(200);
        echo json_encode([
            'status' => 'success',
            'message' => "Force logout executed successfully. {$count} sessions revoked.",
            'revoked_count' => $count
        ], JSON_UNESCAPED_UNICODE);
    }
}

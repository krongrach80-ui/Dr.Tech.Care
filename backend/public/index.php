<?php
/**
 * Moh Tech Care - Front Controller & REST API Router
 * Dispatches API requests with CORS, Banned IP checks, and JSON I/O
 */

require_once __DIR__ . '/../src/Middleware/CorsMiddleware.php';
require_once __DIR__ . '/../src/Middleware/BannedIpMiddleware.php';
require_once __DIR__ . '/../src/Controllers/AuthController.php';
require_once __DIR__ . '/../src/Controllers/UserController.php';
require_once __DIR__ . '/../src/Controllers/PatientController.php';
require_once __DIR__ . '/../src/Controllers/ScheduleController.php';
require_once __DIR__ . '/../src/Controllers/PtController.php';
require_once __DIR__ . '/../src/Controllers/ExerciseController.php';
require_once __DIR__ . '/../src/Controllers/KioskController.php';
require_once __DIR__ . '/../src/Controllers/AuditController.php';

// Buffer output for exact Content-Length & fast connection closure
ob_start();
register_shutdown_function(function() {
    $content = ob_get_clean();
    if (!headers_sent()) {
        header("Content-Length: " . strlen($content));
        header("Connection: close");
    }
    echo $content;
});

// Handle CORS
CorsMiddleware::handle();

// Check if client IP is banned
BannedIpMiddleware::check();

// Parse requested URI & method
$requestUri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

// Normalize path: strip folder prefixes (e.g. /backend/public, /backend, or XAMPP subdirectories)
$uri = preg_replace('#^.*?/api/#', '/api/', $requestUri);
if (!str_starts_with($uri, '/api/')) {
    $uri = '/api/' . ltrim($requestUri, '/');
}

// -----------------------------------------------------------------------------
// 1. SYSTEM HEALTH CHECK
// -----------------------------------------------------------------------------
if ($uri === '/api/health' || $uri === '/api/') {
    if ($method !== 'GET') {
        http_response_code(405);
        echo json_encode(['status' => 'error', 'message' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
        exit();
    }
    echo json_encode([
        'status' => 'online',
        'service' => 'Moh Tech Care REST API',
        'version' => '1.0.0',
        'timezone' => date_default_timezone_get(),
        'db_driver' => Database::getDriver(),
        'timestamp' => date('Y-m-d H:i:s')
    ], JSON_UNESCAPED_UNICODE);
    exit();
}

// -----------------------------------------------------------------------------
// 2. AUTHENTICATION & SESSIONS
// -----------------------------------------------------------------------------
if ($uri === '/api/auth/login' && $method === 'POST') {
    (new AuthController())->login();
    exit();
}
if ($uri === '/api/auth/logout' && $method === 'POST') {
    (new AuthController())->logout();
    exit();
}
if ($uri === '/api/auth/me' && $method === 'GET') {
    (new AuthController())->me();
    exit();
}
if ($uri === '/api/auth/change-password' && $method === 'POST') {
    (new AuthController())->changePassword();
    exit();
}
if ($uri === '/api/auth/force-logout' && $method === 'POST') {
    (new AuthController())->forceLogout();
    exit();
}

// -----------------------------------------------------------------------------
// 3. M1: USER MANAGEMENT & BIOMETRICS
// -----------------------------------------------------------------------------
if ($uri === '/api/users' && $method === 'GET') {
    (new UserController())->listUsers();
    exit();
}
if ($uri === '/api/users' && $method === 'POST') {
    (new UserController())->createUser();
    exit();
}
if (preg_match('#^/api/users/([^/]+)/reset-password$#', $uri, $m) && $method === 'POST') {
    (new UserController())->resetPassword($m[1]);
    exit();
}
if (preg_match('#^/api/users/([^/]+)/reset-biometrics$#', $uri, $m) && $method === 'POST') {
    (new UserController())->resetBiometrics($m[1]);
    exit();
}
if (preg_match('#^/api/users/([^/]+)/biometrics$#', $uri, $m) && $method === 'POST') {
    (new UserController())->saveBiometrics($m[1]);
    exit();
}
if (preg_match('#^/api/users/([^/]+)$#', $uri, $m)) {
    if ($method === 'GET') {
        (new UserController())->getUser($m[1]);
        exit();
    }
    if ($method === 'PUT') {
        (new UserController())->updateUser($m[1]);
        exit();
    }
    if ($method === 'DELETE') {
        (new UserController())->deleteUser($m[1]);
        exit();
    }
}

// -----------------------------------------------------------------------------
// 4. M2: ALL PATIENT RECORDS
// -----------------------------------------------------------------------------
if ($uri === '/api/patients' && $method === 'GET') {
    (new PatientController())->listPatients();
    exit();
}
if ($uri === '/api/patients/transfer-case' && $method === 'POST') {
    (new PtController())->transferCase();
    exit();
}
if (preg_match('#^/api/patients/([^/]+)/personal$#', $uri, $m) && $method === 'PUT') {
    (new PatientController())->updatePersonal($m[1]);
    exit();
}
if (preg_match('#^/api/patients/([^/]+)/notes$#', $uri, $m)) {
    if ($method === 'GET') {
        (new PatientController())->getNotes($m[1]);
        exit();
    }
    if ($method === 'POST') {
        (new PatientController())->appendNote($m[1]);
        exit();
    }
}
if (preg_match('#^/api/patients/([^/]+)/analytics$#', $uri, $m) && $method === 'GET') {
    (new PatientController())->getAnalytics($m[1]);
    exit();
}
if (preg_match('#^/api/patients/([^/]+)$#', $uri, $m) && $method === 'GET') {
    (new PatientController())->getPatient($m[1]);
    exit();
}

// -----------------------------------------------------------------------------
// 5. M3: THERAPY SCHEDULE & ROUTINE PLANNER
// -----------------------------------------------------------------------------
if ($uri === '/api/appointments' && $method === 'GET') {
    (new ScheduleController())->getAppointments();
    exit();
}
if ($uri === '/api/appointments/routine' && $method === 'POST') {
    (new ScheduleController())->assignRoutine();
    exit();
}
if (preg_match('#^/api/appointments/(\d+)/move$#', $uri, $m) && $method === 'POST') {
    (new ScheduleController())->moveAppointment((int)$m[1]);
    exit();
}

// -----------------------------------------------------------------------------
// 6. M4: PT DIRECTORY & PT WORKSPACE
// -----------------------------------------------------------------------------
if ($uri === '/api/therapists' && $method === 'GET') {
    (new PtController())->listTherapists();
    exit();
}
if (preg_match('#^/api/therapists/([^/]+)$#', $uri, $m) && $method === 'PUT') {
    (new PtController())->updateProfile($m[1]);
    exit();
}
if ($uri === '/api/temporary-coverages' && $method === 'GET') {
    (new PtController())->listCoverages();
    exit();
}
if ($uri === '/api/temporary-coverages' && $method === 'POST') {
    (new PtController())->createCoverage();
    exit();
}
if (preg_match('#^/api/temporary-coverages/(\d+)/revoke$#', $uri, $m) && $method === 'POST') {
    (new PtController())->revokeCoverage((int)$m[1]);
    exit();
}

// -----------------------------------------------------------------------------
// 7. M5: EXERCISES & PRESET PACKAGES
// -----------------------------------------------------------------------------
if ($uri === '/api/exercises' && $method === 'GET') {
    (new ExerciseController())->listExercises();
    exit();
}
if ($uri === '/api/exercises' && $method === 'POST') {
    (new ExerciseController())->createExercise();
    exit();
}
if (preg_match('#^/api/exercises/([^/]+)$#', $uri, $m)) {
    if ($method === 'GET') {
        (new ExerciseController())->getExercise($m[1]);
        exit();
    }
    if ($method === 'PUT') {
        (new ExerciseController())->updateExercise($m[1]);
        exit();
    }
    if ($method === 'DELETE') {
        (new ExerciseController())->deleteExercise($m[1]);
        exit();
    }
}

// -----------------------------------------------------------------------------
// 8. PATIENT KIOSK TERMINAL
// -----------------------------------------------------------------------------
if ($uri === '/api/kiosk/face-login' && $method === 'POST') {
    (new KioskController())->faceLogin();
    exit();
}
if ($uri === '/api/kiosk/routine' && $method === 'GET') {
    (new KioskController())->getTodayRoutine();
    exit();
}
if ($uri === '/api/kiosk/next-appointment' && $method === 'GET') {
    (new KioskController())->getNextAppointment();
    exit();
}
if ($uri === '/api/kiosk/session-logs' && $method === 'POST') {
    (new KioskController())->logSession();
    exit();
}
if ($uri === '/api/kiosk/reset' && $method === 'POST') {
    (new KioskController())->resetKioskSession();
    exit();
}

// -----------------------------------------------------------------------------
// 9. M6: AUDIT LOGS & SECURITY CONTROL
// -----------------------------------------------------------------------------
if ($uri === '/api/audit' && $method === 'GET') {
    (new AuditController())->listAuditLogs();
    exit();
}
if ($uri === '/api/audit/banned-ips' && $method === 'GET') {
    (new AuditController())->getBannedIps();
    exit();
}
if ($uri === '/api/audit/ban-ip' && $method === 'POST') {
    (new AuditController())->banIp();
    exit();
}
if ($uri === '/api/audit/unban-ip' && $method === 'POST') {
    (new AuditController())->unbanIp();
    exit();
}

// -----------------------------------------------------------------------------
// 404 NOT FOUND
// -----------------------------------------------------------------------------
http_response_code(404);
echo json_encode([
    'status' => 'error',
    'code' => 'NOT_FOUND',
    'message' => "Endpoint not found: {$method} {$uri}"
], JSON_UNESCAPED_UNICODE);

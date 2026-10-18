<?php
/**
 * Strong Care - Main API Router & Front Controller
 * AI-assisted Rehabilitation Monitoring Platform REST API
 * Supports Apache/XAMPP with mod_rewrite AND PHP Built-in Server
 */

require_once __DIR__ . '/middleware/CorsMiddleware.php';
require_once __DIR__ . '/middleware/AuthMiddleware.php';
require_once __DIR__ . '/controllers/PatientController.php';
require_once __DIR__ . '/controllers/ExerciseController.php';
require_once __DIR__ . '/controllers/SessionController.php';
require_once __DIR__ . '/controllers/ReportController.php';
require_once __DIR__ . '/controllers/FaceController.php';
require_once __DIR__ . '/controllers/AuthController.php';
require_once __DIR__ . '/controllers/AdaptiveController.php';
require_once __DIR__ . '/controllers/SyncController.php';
require_once __DIR__ . '/controllers/AppointmentController.php';

// Buffer output to send exact Content-Length & Connection: close so Vite proxy and browsers do not hang
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

// Helper to return 405 Method Not Allowed
function sendMethodNotAllowed(string $allowedMethods): void {
    http_response_code(405);
    header("Allow: {$allowedMethods}");
    echo json_encode([
        'status' => 'error',
        'message' => 'Method not allowed'
    ]);
    exit();
}

try {
    // Parse requested URI
    $requestUri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    $method = $_SERVER['REQUEST_METHOD'];

    // Normalize path: strip folder prefixes (e.g. /physiovision/backend, /strongcare/backend or /backend)
    $uri = preg_replace('#^.*?/api/#', '/api/', $requestUri);

    // If running in root directory or via direct script
    if (!str_starts_with($uri, '/api/')) {
        $uri = '/api/' . ltrim($requestUri, '/');
    }

    // Router matching: Health check
    if ($uri === '/api/health' || $uri === '/api/') {
        if ($method !== 'GET') {
            sendMethodNotAllowed('GET');
        }
        echo json_encode([
            'status' => 'online',
            'service' => 'Strong Care REST API',
            'tagline' => 'AI-assisted Rehabilitation Monitoring Platform',
            'version' => '1.0.0',
            'db_driver' => Database::getDriver(),
            'timestamp' => date('Y-m-d H:i:s')
        ]);
        exit();
    }

    // ==========================================
    // 1. PUBLIC AUTHENTICATION & BIOMETRIC LIVENESS
    // ==========================================

    // POST /api/auth/enroll
    if ($uri === '/api/auth/enroll') {
        if ($method !== 'POST') {
            sendMethodNotAllowed('POST');
        }
        $controller = new AuthController();
        $controller->enroll();
        exit();
    }

    // POST /api/auth/face-login
    if ($uri === '/api/auth/face-login') {
        if ($method !== 'POST') {
            sendMethodNotAllowed('POST');
        }
        $controller = new AuthController();
        $controller->faceLogin();
        exit();
    }

    // POST /api/auth/login
    if ($uri === '/api/auth/login') {
        if ($method !== 'POST') {
            sendMethodNotAllowed('POST');
        }
        $controller = new AuthController();
        $controller->login();
        exit();
    }

    // POST /api/auth/logout
    if ($uri === '/api/auth/logout') {
        if ($method !== 'POST') {
            sendMethodNotAllowed('POST');
        }
        $controller = new AuthController();
        $controller->logout();
        exit();
    }

    // Legacy /api/face routes backward compatibility
    if ($uri === '/api/face/enroll') {
        if ($method !== 'POST') {
            sendMethodNotAllowed('POST');
        }
        $controller = new FaceController();
        $controller->enroll();
        exit();
    }

    if ($uri === '/api/face/verify') {
        if ($method !== 'POST') {
            sendMethodNotAllowed('POST');
        }
        $controller = new FaceController();
        $controller->verify();
        exit();
    }

    if ($uri === '/api/face/status') {
        if ($method !== 'GET') {
            sendMethodNotAllowed('GET');
        }
        $controller = new FaceController();
        $controller->status();
        exit();
    }

    if ($uri === '/api/face/reset') {
        if ($method !== 'POST') {
            sendMethodNotAllowed('POST');
        }
        $controller = new FaceController();
        $controller->resetAll();
        exit();
    }

    // ==========================================
    // 2. TTS (THAI TEXT-TO-SPEECH PROXY CACHE)
    // ==========================================

    if ($uri === '/api/tts') {
        if ($method !== 'GET') {
            sendMethodNotAllowed('GET');
        }

        $text = trim($_GET['text'] ?? '');
        if ($text === '') {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Missing text parameter']);
            exit();
        }

        if (mb_strlen($text, 'UTF-8') > 300) {
            http_response_code(400);
            echo json_encode([
                'status' => 'error',
                'message' => 'ข้อความมีความยาวเกินกำหนด (จำกัดไม่เกิน 300 ตัวอักษร)'
            ]);
            exit();
        }

        $cacheDir = __DIR__ . '/cache/tts';
        if (!is_dir($cacheDir)) {
            mkdir($cacheDir, 0755, true);
        }

        // Cache file count & size limit: Keep max 50 recent files
        $cachedFiles = glob($cacheDir . '/*.mp3');
        if ($cachedFiles && count($cachedFiles) > 50) {
            usort($cachedFiles, fn($a, $b) => filemtime($a) - filemtime($b));
            $removeCount = count($cachedFiles) - 40;
            for ($i = 0; $i < $removeCount; $i++) {
                @unlink($cachedFiles[$i]);
            }
        }

        $hash = md5($text);
        $cacheFile = $cacheDir . '/' . $hash . '.mp3';

        if (!file_exists($cacheFile) || filesize($cacheFile) < 100) {
            $encoded = urlencode($text);
            $url = "https://translate.google.com/translate_tts?ie=UTF-8&q={$encoded}&tl=th&client=tw-ob";

            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
            curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
            curl_setopt($ch, CURLOPT_TIMEOUT, 6);
            $audioData = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($audioData && $httpCode === 200 && strlen($audioData) > 500) {
                file_put_contents($cacheFile, $audioData);
            }
        }

        if (file_exists($cacheFile) && filesize($cacheFile) > 100) {
            header('Content-Type: audio/mpeg');
            header('Content-Length: ' . filesize($cacheFile));
            header('Cache-Control: public, max-age=86400');
            readfile($cacheFile);
        } else {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'Could not synthesize audio']);
        }
        exit();
    }

    // ==========================================
    // SECURED ROUTES: REQUIRE AUTH TOKEN
    // ==========================================
    AuthMiddleware::check();

    // ==========================================
    // 3. PATIENTS
    // ==========================================

    // /api/patients
    if ($uri === '/api/patients') {
        if ($method === 'GET') {
            // Restrict directory listing to staff
            AuthMiddleware::requireStaff();
            $controller = new PatientController();
            $controller->index();
        } elseif ($method === 'POST') {
            $controller = new PatientController();
            $controller->store();
        } else {
            sendMethodNotAllowed('GET, POST');
        }
        exit();
    }

    // /api/patients/{id}/history
    if (preg_match('#^/api/patients/(\d+)/history$#', $uri, $matches)) {
        if ($method !== 'GET') {
            sendMethodNotAllowed('GET');
        }
        $patientId = (int)$matches[1];
        AuthMiddleware::authorizePatient($patientId);
        $controller = new PatientController();
        $controller->history($patientId);
        exit();
    }

    // /api/patients/{id}/purge
    if (preg_match('#^/api/patients/(\d+)/purge$#', $uri, $matches)) {
        if ($method !== 'DELETE') {
            sendMethodNotAllowed('DELETE');
        }
        $patientId = (int)$matches[1];
        AuthMiddleware::authorizePatient($patientId);
        $controller = new PatientController();
        $controller->purge($patientId);
        exit();
    }

    // /api/patients/{id}
    if (preg_match('#^/api/patients/(\d+)$#', $uri, $matches)) {
        if ($method !== 'GET') {
            sendMethodNotAllowed('GET');
        }
        $patientId = (int)$matches[1];
        AuthMiddleware::authorizePatient($patientId);
        $controller = new PatientController();
        $controller->show($patientId);
        exit();
    }

    // ==========================================
    // 3.1 APPOINTMENTS (SCHEDULED COURSES & MODES)
    // ==========================================

    // /api/appointments
    if ($uri === '/api/appointments') {
        $controller = new AppointmentController();
        if ($method === 'GET') {
            $controller->index();
        } elseif ($method === 'POST') {
            $controller->store();
        } else {
            sendMethodNotAllowed('GET, POST');
        }
        exit();
    }

    // /api/appointments/{id}
    if (preg_match('#^/api/appointments/(\d+)$#', $uri, $matches)) {
        $appointmentId = (int)$matches[1];
        $controller = new AppointmentController();
        if ($method === 'GET') {
            $controller->show($appointmentId);
        } elseif ($method === 'PUT' || $method === 'PATCH') {
            $controller->update($appointmentId);
        } elseif ($method === 'DELETE') {
            $controller->destroy($appointmentId);
        } else {
            sendMethodNotAllowed('GET, PUT, PATCH, DELETE');
        }
        exit();
    }

    // ==========================================
    // 4. EXERCISES
    // ==========================================

    // /api/exercises
    if ($uri === '/api/exercises') {
        if ($method !== 'GET') {
            sendMethodNotAllowed('GET');
        }
        $controller = new ExerciseController();
        $controller->index();
        exit();
    }

    // /api/exercises/{id}
    if (preg_match('#^/api/exercises/(\d+)$#', $uri, $matches)) {
        if ($method !== 'GET') {
            sendMethodNotAllowed('GET');
        }
        $exerciseId = (int)$matches[1];
        $controller = new ExerciseController();
        $controller->show($exerciseId);
        exit();
    }

    // ==========================================
    // 5. SESSIONS & RESULTS
    // ==========================================

    // /api/sessions
    if ($uri === '/api/sessions') {
        $controller = new SessionController();
        if ($method === 'GET') {
            $controller->index();
        } elseif ($method === 'POST') {
            $controller->store();
        } else {
            sendMethodNotAllowed('GET, POST');
        }
        exit();
    }

    // /api/sessions/{id}/results
    if (preg_match('#^/api/sessions/(\d+)/results$#', $uri, $matches)) {
        if ($method !== 'POST') {
            sendMethodNotAllowed('POST');
        }
        $sessionId = (int)$matches[1];
        $controller = new SessionController();
        $controller->storeResults($sessionId);
        exit();
    }

    // /api/sessions/{id}/safety-events
    if (preg_match('#^/api/sessions/(\d+)/safety-events$#', $uri, $matches)) {
        if ($method !== 'POST') {
            sendMethodNotAllowed('POST');
        }
        $sessionId = (int)$matches[1];
        $controller = new SessionController();
        $controller->storeSafetyEvents($sessionId);
        exit();
    }

    // /api/sessions/{id}
    if (preg_match('#^/api/sessions/(\d+)$#', $uri, $matches)) {
        if ($method !== 'GET') {
            sendMethodNotAllowed('GET');
        }
        $sessionId = (int)$matches[1];
        $controller = new SessionController();
        $controller->show($sessionId);
        exit();
    }

    // ==========================================
    // 6. REPORTS
    // ==========================================

    // /api/reports/{id}
    if (preg_match('#^/api/reports/(\d+)$#', $uri, $matches)) {
        if ($method !== 'GET') {
            sendMethodNotAllowed('GET');
        }
        $sessionId = (int)$matches[1];
        $controller = new ReportController();
        $controller->show($sessionId);
        exit();
    }

    // ==========================================
    // 7. ADAPTIVE REHABILITATION & APPROVAL
    // ==========================================

    // GET /api/adaptive/recommendations/{patientId}
    if (preg_match('#^/api/adaptive/recommendations/(\d+)$#', $uri, $matches)) {
        if ($method !== 'GET') {
            sendMethodNotAllowed('GET');
        }
        $patientId = (int)$matches[1];
        AuthMiddleware::authorizePatient($patientId);
        $controller = new AdaptiveController();
        $controller->getRecommendations($patientId);
        exit();
    }

    // POST /api/adaptive/approval
    if ($uri === '/api/adaptive/approval') {
        if ($method !== 'POST') {
            sendMethodNotAllowed('POST');
        }
        AuthMiddleware::requireStaff();
        $controller = new AdaptiveController();
        $controller->submitApproval();
        exit();
    }

    // ==========================================
    // 8. OFFLINE SYNC
    // ==========================================

    // POST /api/sync
    if ($uri === '/api/sync') {
        if ($method !== 'POST') {
            sendMethodNotAllowed('POST');
        }
        $controller = new SyncController();
        $controller->syncBatch();
        exit();
    }

    // Route not found
    http_response_code(404);
    echo json_encode([
        'status' => 'error',
        'message' => 'API endpoint not found',
        'requested_uri' => $uri,
        'method' => $method
    ]);

} catch (Throwable $e) {
    error_log("Unhandled API Error [{$method} {$uri}]: " . $e->getMessage() . "\n" . $e->getTraceAsString());
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Internal server error'
    ]);
    exit();
}

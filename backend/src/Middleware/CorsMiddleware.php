<?php
/**
 * Moh Tech Care - CORS Middleware
 */

class CorsMiddleware {
    public static function handle(): void {
        $config = require __DIR__ . '/../../config/config.php';
        $allowedOrigins = $config['cors']['allowed_origins'] ?? ['*'];

        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        if ($origin && (in_array($origin, $allowedOrigins, true) || in_array('*', $allowedOrigins, true))) {
            header("Access-Control-Allow-Origin: {$origin}");
            header("Access-Control-Allow-Credentials: true");
        } else {
            header("Access-Control-Allow-Origin: *");
        }

        $allowedMethods = implode(', ', $config['cors']['allowed_methods'] ?? ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']);
        $allowedHeaders = implode(', ', $config['cors']['allowed_headers'] ?? ['Content-Type', 'Authorization', 'X-Requested-With']);

        header("Access-Control-Allow-Methods: {$allowedMethods}");
        header("Access-Control-Allow-Headers: {$allowedHeaders}");
        header("Access-Control-Max-Age: 86400");
        header("Content-Type: application/json; charset=utf-8");

        // Handle preflight OPTIONS request
        if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
            http_response_code(204);
            exit();
        }
    }
}

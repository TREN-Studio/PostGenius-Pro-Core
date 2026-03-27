<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';
require_once __DIR__ . '/review_generator_lib.php';

ensure_automation_tables($conn);
require_automation_access($conn);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response([
        'success' => false,
        'error' => 'Method not allowed',
    ], 405);
}

$rawBody = file_get_contents('php://input');
$body = json_decode($rawBody ?: '', true);
if (!is_array($body)) {
    $body = [];
}

try {
    $result = review_generator_process_job($conn, $body);
    json_response($result);
} catch (Throwable $e) {
    json_response([
        'success' => false,
        'error' => $e->getMessage(),
    ], 500);
}

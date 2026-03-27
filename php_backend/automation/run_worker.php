<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';
require_once __DIR__ . '/worker_lib.php';

ensure_automation_tables($conn);
$access = require_automation_access($conn);

$force = isset($_GET['force']) && (string)$_GET['force'] === '1';
$mode = (string)($access['mode'] ?? 'cron');
$user = $access['user'] ?? null;

$workerId = $mode === 'cron'
    ? 'cron-worker'
    : 'admin-worker-' . ((string)($user['id'] ?? 'unknown'));

$result = automation_process_next_job($conn, [
    'force' => $force,
    'worker_id' => $workerId,
]);

json_response([
    'success' => (bool)($result['success'] ?? false),
    'worker' => $result,
    'mode' => $mode,
]);


<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';

// Security note:
// Setup endpoint is intentionally token-protected if token already exists.
// First run (no token file) is allowed and will create a token.
$existingToken = get_stored_cron_token();
if ($existingToken !== '') {
    require_cron_auth();
}

ensure_automation_tables($conn);

$tokenPath = __DIR__ . '/.cron_token';
$token = trim((string)$existingToken);
if ($token === '') {
    $token = bin2hex(random_bytes(24));
    if (@file_put_contents($tokenPath, $token) === false) {
        json_response([
            'success' => false,
            'error' => 'Failed to persist cron token file.'
        ], 500);
    }
    @chmod($tokenPath, 0600);
}

$host = trim((string)($_SERVER['HTTP_HOST'] ?? 'postgeniuspro.com'));
if ($host === '') {
    $host = 'postgeniuspro.com';
}
$scheme = 'https';
$generateEndpoint = $scheme . '://' . $host . '/api/automation/generate-review';
$workerUrl = $scheme . '://' . $host . '/api/automation/run-worker?token=' . $token . '&force=1';
$agentUrl = $scheme . '://' . $host . '/api/automation/agent-brain?token=' . $token;
$publishUrl = $scheme . '://' . $host . '/api/automation/hourly-autopublish?token=' . $token;

$settingsStmt = $conn->prepare("
    UPDATE automation_settings
    SET generate_endpoint = :generate_endpoint,
        updated_at = NOW()
    WHERE id = 1
");
$settingsStmt->execute([
    ':generate_endpoint' => $generateEndpoint,
]);

$sitemapInfo = write_dynamic_sitemap($conn);

json_response([
    'success' => true,
    'message' => 'Automation setup completed.',
    'cronToken' => $token,
    'generateEndpoint' => $generateEndpoint,
    'recommendedAgentUrl' => $agentUrl,
    'recommendedAgentSchedule' => '0 * * * *',
    'recommendedWorkerUrl' => $workerUrl,
    'recommendedWorkerSchedule' => '*/15 * * * *',
    'recommendedCronUrl' => $agentUrl,
    'recommendedCronSchedule' => '0 * * * *',
    'legacyPublishUrl' => $publishUrl,
    'sitemap' => $sitemapInfo
]);

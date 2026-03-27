<?php

declare(strict_types=1);

require_once __DIR__ . '/../../_shared/config.php';

pgp_apply_cors(['GET', 'OPTIONS']);
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    pgp_send_json(['error' => 'Method not allowed'], 405);
}

$config = pgp_load_runtime_config();
$clientId = trim((string) ($config['PINTEREST_CLIENT_ID'] ?? ''));
$redirectUri = trim((string) ($config['PINTEREST_REDIRECT_URI'] ?? ''));

if ($clientId === '' || $redirectUri === '') {
    pgp_send_json(['error' => 'Pinterest OAuth config is missing on server'], 500);
}

$requiredScopes = ['pins:write', 'boards:write', 'user_accounts:read'];
$state = bin2hex(random_bytes(16));

$authUrl = 'https://www.pinterest.com/oauth/?'
    . http_build_query([
        'client_id' => $clientId,
        'redirect_uri' => $redirectUri,
        'response_type' => 'code',
        'scope' => implode(',', $requiredScopes),
        'state' => $state,
    ]);

pgp_send_json([
    'authUrl' => $authUrl,
    'clientId' => $clientId,
    'redirectUri' => $redirectUri,
    'requiredScopes' => $requiredScopes,
]);


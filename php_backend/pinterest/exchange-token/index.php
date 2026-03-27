<?php

declare(strict_types=1);

require_once __DIR__ . '/../../_shared/config.php';

pgp_apply_cors(['POST', 'OPTIONS']);
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    pgp_send_json(['error' => 'Method not allowed'], 405);
}

$config = pgp_load_runtime_config();
$clientId = trim((string) ($config['PINTEREST_CLIENT_ID'] ?? ''));
$clientSecret = trim((string) ($config['PINTEREST_CLIENT_SECRET'] ?? ''));
$redirectUri = trim((string) ($config['PINTEREST_REDIRECT_URI'] ?? ''));

if ($clientId === '' || $clientSecret === '' || $redirectUri === '') {
    pgp_send_json(['error' => 'Pinterest credentials are not configured on server'], 500);
}

$input = pgp_read_json_body();
$code = trim((string) ($input['code'] ?? ''));
if ($code === '') {
    pgp_send_json(['error' => 'Missing authorization code'], 400);
}

$ch = curl_init('https://api.pinterest.com/v5/oauth/token');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 60);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Basic ' . base64_encode($clientId . ':' . $clientSecret),
    'Content-Type: application/x-www-form-urlencoded',
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
    'grant_type' => 'authorization_code',
    'code' => $code,
    'redirect_uri' => $redirectUri,
]));

$body = curl_exec($ch);
$status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

if ($body === false || $error !== '') {
    pgp_send_json(['error' => 'Pinterest token exchange failed', 'details' => $error], 502);
}

$decoded = json_decode((string) $body, true);
if ($status < 200 || $status >= 300 || !is_array($decoded)) {
    pgp_send_json([
        'error' => 'Pinterest token exchange rejected',
        'status' => $status,
        'details' => substr((string) $body, 0, 500),
    ], 502);
}

if (empty($decoded['access_token'])) {
    pgp_send_json(['error' => 'Pinterest did not return access_token'], 502);
}

$vault = pgp_get_settings_vault();
$vault['app_id'] = $clientId;
$vault['app_secret'] = $clientSecret;
$vault['pinterest_token'] = (string) $decoded['access_token'];
$vault['refresh_token'] = (string) ($decoded['refresh_token'] ?? ($vault['refresh_token'] ?? ''));
$vault['token_expires_at'] = time() + (int) ($decoded['expires_in'] ?? 0);
if (isset($decoded['refresh_token_expires_in'])) {
    $vault['refresh_token_expires_at'] = time() + (int) $decoded['refresh_token_expires_in'];
}
if (isset($decoded['scope'])) {
    $vault['pinterest_username'] = (string) $decoded['scope'];
}
pgp_save_settings_vault($vault);

pgp_send_json([
    'success' => true,
    'accessToken' => (string) $decoded['access_token'],
    'expiresIn' => (int) ($decoded['expires_in'] ?? 0),
    'message' => 'Token stored securely. Ready for automated pin creation.',
]);


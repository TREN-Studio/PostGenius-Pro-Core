<?php

declare(strict_types=1);

require_once __DIR__ . '/../../_shared/config.php';
require_once __DIR__ . '/../../db.php';

pgp_apply_cors(['POST', 'OPTIONS']);
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    pgp_send_json(['error' => 'Method not allowed'], 405);
}

function pgp_get_auth_token(): string
{
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if ($auth === '' && function_exists('getallheaders')) {
        $headers = getallheaders();
        if (is_array($headers)) {
            $auth = (string) ($headers['Authorization'] ?? $headers['authorization'] ?? '');
        }
    }

    $auth = trim($auth);
    if ($auth === '') {
        return '';
    }
    if (stripos($auth, 'Bearer ') === 0) {
        return trim(substr($auth, 7));
    }
    return $auth;
}

function pgp_require_admin(PDO $conn): void
{
    $token = pgp_get_auth_token();
    if ($token === '') {
        pgp_send_json(['error' => 'Unauthorized'], 401);
    }

    $stmt = $conn->prepare(
        'SELECT p.role, u.email FROM profiles p INNER JOIN users u ON u.id = p.id WHERE p.id = :id LIMIT 1'
    );
    $stmt->execute([':id' => $token]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!is_array($row)) {
        pgp_send_json(['error' => 'Unauthorized'], 401);
    }

    $email = strtolower((string) ($row['email'] ?? ''));
    if ($email !== 'larbilife@gmail.com') {
        pgp_send_json(['error' => 'Forbidden'], 403);
    }
}

pgp_require_admin($conn);

$config = pgp_load_runtime_config();
$apiKey = trim((string) ($config['NVIDIA_API_KEY'] ?? ''));
if ($apiKey === '') {
    pgp_send_json(['error' => 'NVIDIA_API_KEY is not configured on server'], 500);
}

$input = pgp_read_json_body();
$description = trim((string) ($input['description'] ?? ''));
if ($description === '') {
    pgp_send_json(['error' => 'Missing required field: description'], 400);
}

$payload = [
    'description' => $description,
    'file_extension_include' => (string) ($input['file_extension_include'] ?? 'usd*'),
    'return_images' => (string) ($input['return_images'] ?? 'true'),
    'return_metadata' => (string) ($input['return_metadata'] ?? 'true'),
    'return_vision_generated_metadata' => (string) ($input['return_vision_generated_metadata'] ?? 'true'),
    'cutoff_threshold' => (string) ($input['cutoff_threshold'] ?? '1.05'),
    'limit' => (string) ($input['limit'] ?? '50'),
];

$ch = curl_init('https://ai.api.nvidia.com/v1/omniverse/nvidia/usdsearch');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'POST');
curl_setopt($ch, CURLOPT_TIMEOUT, 20);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Bearer ' . $apiKey,
    'Accept: application/json',
    'Content-Type: application/json',
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
$body = curl_exec($ch);
$status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);
$response = [
    'status' => $status,
    'body' => is_string($body) ? $body : '',
    'error' => $error,
];

if ($response['status'] < 200 || $response['status'] >= 300) {
    pgp_send_json([
        'error' => 'NVIDIA USD search request failed',
        'status' => $response['status'],
        'details' => substr((string) $response['body'], 0, 600),
        'transportError' => (string) ($response['error'] ?? ''),
    ], 502);
}

$decoded = json_decode((string) $response['body'], true);
if (!is_array($decoded)) {
    pgp_send_json(['error' => 'Invalid response from NVIDIA USD search API'], 502);
}

pgp_send_json([
    'success' => true,
    'results' => $decoded,
]);

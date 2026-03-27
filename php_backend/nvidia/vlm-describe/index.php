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
$imageBase64 = trim((string) ($input['imageBase64'] ?? ''));
$imageMime = trim((string) ($input['imageMime'] ?? 'image/jpeg'));
$prompt = trim((string) ($input['prompt'] ?? 'Describe the image in detail.'));
$mode = strtolower(trim((string) ($input['mode'] ?? 'paligemma')));

if ($imageBase64 === '') {
    pgp_send_json(['error' => 'Missing required field: imageBase64'], 400);
}

if (!in_array($mode, ['paligemma', 'cached'], true)) {
    $mode = 'paligemma';
}

$callNvidia = static function (string $url, array $payload, string $apiKey): array {
    $ch = curl_init($url);
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
    return [
        'status' => $status,
        'body' => is_string($body) ? $body : '',
        'error' => $error,
    ];
};

if ($mode === 'cached') {
    $response = $callNvidia(
        'https://ai.api.nvidia.com/v1/cv/university-at-buffalo/cached',
        [
            'messages' => [
                [
                    'content' => [
                        [
                            'type' => 'image_url',
                            'image_url' => [
                                'url' => 'data:' . $imageMime . ';base64,' . $imageBase64,
                            ],
                        ],
                    ],
                ],
            ],
        ],
        $apiKey
    );
} else {
    $model = trim((string) ($config['NVIDIA_PALIGEMMA_MODEL_ID'] ?? 'google/paligemma'));
    if ($model === '') {
        $model = 'google/paligemma';
    }

    $response = $callNvidia(
        'https://ai.api.nvidia.com/v1/vlm/google/paligemma',
        [
            'messages' => [
                [
                    'role' => 'user',
                    'content' => $prompt . ' <img src="data:' . $imageMime . ';base64,' . $imageBase64 . '" />',
                ],
            ],
            'max_tokens' => max(32, min(2048, (int) ($input['max_tokens'] ?? 512))),
            'temperature' => max(0.0, min(2.0, (float) ($input['temperature'] ?? 1.0))),
            'top_p' => max(0.1, min(1.0, (float) ($input['top_p'] ?? 0.7))),
            'stream' => false,
            'model' => $model,
        ],
        $apiKey
    );
}

if ($response['status'] < 200 || $response['status'] >= 300) {
    pgp_send_json([
        'error' => 'NVIDIA VLM describe request failed',
        'status' => $response['status'],
        'details' => substr((string) $response['body'], 0, 600),
        'transportError' => (string) ($response['error'] ?? ''),
    ], 502);
}

$decoded = json_decode((string) $response['body'], true);
if (!is_array($decoded)) {
    pgp_send_json(['error' => 'Invalid response from NVIDIA VLM API'], 502);
}

$content = $decoded['choices'][0]['message']['content'] ?? ($decoded['message']['content'] ?? null);
if (is_array($content)) {
    $tmp = '';
    foreach ($content as $part) {
        if (is_array($part) && isset($part['text']) && is_string($part['text'])) {
            $tmp .= $part['text'];
        }
    }
    $content = $tmp;
}

pgp_send_json([
    'success' => true,
    'mode' => $mode,
    'content' => is_string($content) ? $content : null,
    'raw' => $decoded,
]);

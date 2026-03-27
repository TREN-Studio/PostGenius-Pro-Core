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

require_once __DIR__ . '/../../db.php';

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

    try {
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
    } catch (Throwable $e) {
        pgp_send_json(['error' => 'Authorization check failed'], 500);
    }
}

pgp_require_admin($conn);

$config = pgp_load_runtime_config();
if (($config['NVIDIA_API_KEY'] ?? '') === '') {
    pgp_send_json(['error' => 'NVIDIA_API_KEY is not configured on server'], 500);
}

$input = pgp_read_json_body();
$imageBase64 = trim((string) ($input['imageBase64'] ?? ''));
$productName = trim((string) ($input['productName'] ?? ''));
$productDescription = trim((string) ($input['productDescription'] ?? ''));

if ($imageBase64 === '' || $productName === '') {
    pgp_send_json(['error' => 'Missing required fields: imageBase64 and productName'], 400);
}

$visionPrompt = "Analyze this product image and provide a concise quality assessment.\n\n"
    . "Product Name: {$productName}\n"
    . "Product Description: {$productDescription}\n\n"
    . "Return strict JSON with fields: "
    . "matchesProduct(boolean), visualQuality(excellent|good|poor), "
    . "professionalLevel(high|medium|low), defects(array), recommendations(array), overallScore(number 0-100).";

$modelId = trim((string) ($config['NVIDIA_CHAT_MODEL_ID'] ?? $config['QWEN_VLM_MODEL_ID'] ?? ''));
if ($modelId !== '' && strpos($modelId, '/') === false) {
    // Backward compatibility with un-prefixed model IDs in older configs.
    $modelId = 'qwen/' . $modelId;
}
if ($modelId === '') {
    $modelId = 'qwen/qwen3.5-397b-a17b';
}

$requestBody = [
    'model' => $modelId,
    'messages' => [
        [
            'role' => 'user',
            'content' => [
                [
                    'type' => 'image_url',
                    'image_url' => [
                        'url' => 'data:image/png;base64,' . $imageBase64,
                    ],
                ],
                [
                    'type' => 'text',
                    'text' => $visionPrompt,
                ],
            ],
        ],
    ],
    'temperature' => 0.2,
    'max_tokens' => 500,
];

$response = pgp_http_json(
    'https://integrate.api.nvidia.com/v1/chat/completions',
    'POST',
    [
        'Authorization: Bearer ' . $config['NVIDIA_API_KEY'],
        'Accept: application/json',
    ],
    $requestBody
);

if ($response['status'] < 200 || $response['status'] >= 300) {
    pgp_send_json([
        'error' => 'NVIDIA validation request failed',
        'status' => $response['status'],
        'details' => substr((string) $response['body'], 0, 600),
    ], 502);
}

$decoded = json_decode((string) $response['body'], true);
if (!is_array($decoded)) {
    pgp_send_json(['error' => 'Invalid response from NVIDIA validation API'], 502);
}

$content = $decoded['choices'][0]['message']['content'] ?? '';
if (is_array($content)) {
    $tmp = '';
    foreach ($content as $part) {
        if (is_array($part) && isset($part['text']) && is_string($part['text'])) {
            $tmp .= $part['text'];
        }
    }
    $content = $tmp;
}
$content = is_string($content) ? $content : '';

$analysis = null;
if (preg_match('/\{[\s\S]*\}/', $content, $matches) === 1) {
    $parsed = json_decode($matches[0], true);
    if (is_array($parsed)) {
        $analysis = $parsed;
    }
}

if (!is_array($analysis)) {
    pgp_send_json([
        'success' => true,
        'isValid' => false,
        'confidence' => 0.5,
        'feedback' => 'Validation response could not be parsed reliably. Manual review recommended.',
        'analysis' => null,
    ]);
}

$matchesProduct = (bool) ($analysis['matchesProduct'] ?? false);
$visualQuality = (string) ($analysis['visualQuality'] ?? 'poor');
$professionalLevel = (string) ($analysis['professionalLevel'] ?? 'low');
$defects = $analysis['defects'] ?? [];
if (!is_array($defects)) {
    $defects = [];
}
$overallScore = (float) ($analysis['overallScore'] ?? 0);
$confidence = max(0, min(1, $overallScore / 100));

$isValid = $matchesProduct
    && in_array($visualQuality, ['excellent', 'good'], true)
    && in_array($professionalLevel, ['high', 'medium'], true)
    && count($defects) === 0;

$feedback = $isValid
    ? 'Image passes quality validation and is ready for publication.'
    : 'Image requires review due to quality/relevance issues.';

pgp_send_json([
    'success' => true,
    'isValid' => $isValid,
    'confidence' => $confidence,
    'feedback' => $feedback,
    'analysis' => $analysis,
]);

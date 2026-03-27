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
$model = trim((string) ($input['model'] ?? $config['NVIDIA_CHAT_MODEL_ID'] ?? 'qwen/qwen3.5-397b-a17b'));
if ($model === '') {
    $model = 'qwen/qwen3.5-397b-a17b';
}
if (strpos($model, '/') === false) {
    $model = 'qwen/' . $model;
}

$messages = $input['messages'] ?? null;
$prompt = trim((string) ($input['prompt'] ?? ''));
if (!is_array($messages)) {
    if ($prompt === '') {
        pgp_send_json(['error' => 'Missing required field: messages or prompt'], 400);
    }
    $messages = [['role' => 'user', 'content' => $prompt]];
}

$chatTemplateKwargs = $input['chat_template_kwargs'] ?? [];
if (!is_array($chatTemplateKwargs)) {
    $chatTemplateKwargs = [];
}

$enableThinking = true;
if (array_key_exists('enable_thinking', $input)) {
    $enableThinking = (bool) $input['enable_thinking'];
} elseif (array_key_exists('thinking', $input)) {
    $enableThinking = (bool) $input['thinking'];
} elseif (array_key_exists('enable_thinking', $chatTemplateKwargs)) {
    $enableThinking = (bool) $chatTemplateKwargs['enable_thinking'];
} elseif (array_key_exists('thinking', $chatTemplateKwargs)) {
    $enableThinking = (bool) $chatTemplateKwargs['thinking'];
}

$payload = [
    'model' => $model,
    'messages' => $messages,
    'max_tokens' => max(1, min(32768, (int) ($input['max_tokens'] ?? 16384))),
    'temperature' => max(0.0, min(2.0, (float) ($input['temperature'] ?? 0.6))),
    'top_p' => max(0.1, min(1.0, (float) ($input['top_p'] ?? 0.95))),
    'top_k' => max(1, min(100, (int) ($input['top_k'] ?? 20))),
    'presence_penalty' => (float) ($input['presence_penalty'] ?? 0),
    'repetition_penalty' => (float) ($input['repetition_penalty'] ?? 1),
    'stream' => false,
    'chat_template_kwargs' => [
        'enable_thinking' => $enableThinking,
        'thinking' => $enableThinking,
    ],
];

$ch = curl_init('https://integrate.api.nvidia.com/v1/chat/completions');
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
        'error' => 'NVIDIA chat completion request failed',
        'status' => $response['status'],
        'details' => substr((string) $response['body'], 0, 600),
        'transportError' => (string) ($response['error'] ?? ''),
    ], 502);
}

$decoded = json_decode((string) $response['body'], true);
if (!is_array($decoded)) {
    pgp_send_json(['error' => 'Invalid response from NVIDIA chat API'], 502);
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

pgp_send_json([
    'success' => true,
    'model' => $model,
    'content' => (string) $content,
    'usage' => $decoded['usage'] ?? null,
    'raw' => $decoded,
]);

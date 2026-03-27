<?php

declare(strict_types=1);

require_once __DIR__ . '/../../_shared/config.php';

pgp_apply_cors(['GET', 'POST', 'OPTIONS']);
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
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

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $config = pgp_load_runtime_config();
    pgp_send_json([
        'success' => true,
        'hasNvidiaKey' => trim((string) ($config['NVIDIA_API_KEY'] ?? '')) !== '',
        'stableDiffusionModelId' => (string) ($config['STABLE_DIFFUSION_MODEL_ID'] ?? ''),
        'qwenVlmModelId' => (string) ($config['QWEN_VLM_MODEL_ID'] ?? ''),
        'chatModelId' => (string) ($config['NVIDIA_CHAT_MODEL_ID'] ?? ''),
        'paligemmaModelId' => (string) ($config['NVIDIA_PALIGEMMA_MODEL_ID'] ?? ''),
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    pgp_send_json(['error' => 'Method not allowed'], 405);
}

$input = pgp_read_json_body();
$settings = pgp_get_settings_vault();

$newApiKey = trim((string) ($input['nvidiaApiKey'] ?? ''));
$newSdModel = trim((string) ($input['stableDiffusionModelId'] ?? ''));
$newQwenModel = trim((string) ($input['qwenVlmModelId'] ?? ''));
$newChatModel = trim((string) ($input['chatModelId'] ?? ''));
$newPaligemmaModel = trim((string) ($input['paligemmaModelId'] ?? ''));

if ($newApiKey !== '') {
    $settings['nvidia_api_key'] = $newApiKey;
}

if ($newSdModel !== '') {
    $settings['stable_diffusion_model_id'] = $newSdModel;
}

if ($newQwenModel !== '') {
    $settings['qwen_vlm_model_id'] = $newQwenModel;
}
if ($newChatModel !== '') {
    $settings['nvidia_chat_model_id'] = $newChatModel;
}
if ($newPaligemmaModel !== '') {
    $settings['nvidia_paligemma_model_id'] = $newPaligemmaModel;
}

$settings['nvidia_updated_at'] = gmdate('c');

if (!pgp_save_settings_vault($settings)) {
    pgp_send_json(['error' => 'Failed to save NVIDIA configuration'], 500);
}

$config = pgp_load_runtime_config();
pgp_send_json([
    'success' => true,
    'message' => 'NVIDIA configuration saved.',
    'hasNvidiaKey' => trim((string) ($config['NVIDIA_API_KEY'] ?? '')) !== '',
    'stableDiffusionModelId' => (string) ($config['STABLE_DIFFUSION_MODEL_ID'] ?? ''),
    'qwenVlmModelId' => (string) ($config['QWEN_VLM_MODEL_ID'] ?? ''),
    'chatModelId' => (string) ($config['NVIDIA_CHAT_MODEL_ID'] ?? ''),
    'paligemmaModelId' => (string) ($config['NVIDIA_PALIGEMMA_MODEL_ID'] ?? ''),
]);

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

pgp_send_json([
    'success' => true,
    'hasNvidiaKey' => trim((string) ($config['NVIDIA_API_KEY'] ?? '')) !== '',
    'stableDiffusionModelId' => (string) ($config['STABLE_DIFFUSION_MODEL_ID'] ?? ''),
    'qwenVlmModelId' => (string) ($config['QWEN_VLM_MODEL_ID'] ?? ''),
    'chatModelId' => (string) ($config['NVIDIA_CHAT_MODEL_ID'] ?? ''),
    'paligemmaModelId' => (string) ($config['NVIDIA_PALIGEMMA_MODEL_ID'] ?? ''),
]);

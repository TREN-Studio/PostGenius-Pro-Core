<?php

declare(strict_types=1);

function pgp_send_json(array $data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode($data);
    exit;
}

function pgp_read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function pgp_apply_cors(array $methods = ['GET', 'POST', 'OPTIONS']): void
{
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: ' . implode(', ', $methods));
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
}

function pgp_parse_env_file(string $envPath): array
{
    if (!is_file($envPath)) {
        return [];
    }

    $result = [];
    $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        return [];
    }

    foreach ($lines as $line) {
        $trimmed = trim($line);
        if ($trimmed === '' || str_starts_with($trimmed, '#')) {
            continue;
        }

        $parts = explode('=', $trimmed, 2);
        if (count($parts) !== 2) {
            continue;
        }

        $key = trim($parts[0]);
        $value = trim($parts[1]);
        $value = trim($value, "\"'");
        $result[$key] = $value;
    }

    return $result;
}

function pgp_get_settings_vault(): array
{
    $vaultPath = dirname(__DIR__) . '/secure_vault/settings.json';
    if (!is_file($vaultPath)) {
        return [];
    }

    $raw = file_get_contents($vaultPath);
    if ($raw === false || $raw === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function pgp_save_settings_vault(array $settings): bool
{
    $vaultDir = dirname(__DIR__) . '/secure_vault';
    if (!is_dir($vaultDir) && !mkdir($vaultDir, 0755, true) && !is_dir($vaultDir)) {
        return false;
    }

    $vaultPath = $vaultDir . '/settings.json';
    return file_put_contents($vaultPath, json_encode($settings, JSON_UNESCAPED_SLASHES)) !== false;
}

function pgp_first_non_empty(array $values, string $fallback = ''): string
{
    foreach ($values as $value) {
        if (!is_string($value)) {
            continue;
        }
        $trimmed = trim($value);
        if ($trimmed !== '') {
            return $trimmed;
        }
    }

    return $fallback;
}

function pgp_load_runtime_config(): array
{
    $env = pgp_parse_env_file(dirname(__DIR__, 2) . '/.env');
    $vault = pgp_get_settings_vault();

    return [
        'NVIDIA_API_KEY' => pgp_first_non_empty([
            $vault['nvidia_api_key'] ?? '',
            $vault['NVIDIA_API_KEY'] ?? '',
            $env['NVIDIA_API_KEY'] ?? '',
            getenv('NVIDIA_API_KEY') ?: '',
        ]),
        'STABLE_DIFFUSION_MODEL_ID' => pgp_first_non_empty([
            $vault['stable_diffusion_model_id'] ?? '',
            $vault['STABLE_DIFFUSION_MODEL_ID'] ?? '',
            $env['STABLE_DIFFUSION_MODEL_ID'] ?? '',
        ], 'stable-diffusion-3-medium'),
        'NVIDIA_CHAT_MODEL_ID' => pgp_first_non_empty([
            $vault['nvidia_chat_model_id'] ?? '',
            $vault['NVIDIA_CHAT_MODEL_ID'] ?? '',
            $env['NVIDIA_CHAT_MODEL_ID'] ?? '',
            $vault['qwen_vlm_model_id'] ?? '',
            $vault['QWEN_VLM_MODEL_ID'] ?? '',
            $env['QWEN_VLM_MODEL_ID'] ?? '',
        ], 'qwen/qwen3.5-397b-a17b'),
        'QWEN_VLM_MODEL_ID' => pgp_first_non_empty([
            $vault['qwen_vlm_model_id'] ?? '',
            $vault['QWEN_VLM_MODEL_ID'] ?? '',
            $env['QWEN_VLM_MODEL_ID'] ?? '',
        ], 'qwen/qwen3.5-397b-a17b'),
        'NVIDIA_PALIGEMMA_MODEL_ID' => pgp_first_non_empty([
            $vault['nvidia_paligemma_model_id'] ?? '',
            $vault['NVIDIA_PALIGEMMA_MODEL_ID'] ?? '',
            $env['NVIDIA_PALIGEMMA_MODEL_ID'] ?? '',
        ], 'google/paligemma'),
        'PINTEREST_CLIENT_ID' => pgp_first_non_empty([
            $env['PINTEREST_CLIENT_ID'] ?? '',
            $vault['app_id'] ?? '',
        ]),
        'PINTEREST_CLIENT_SECRET' => pgp_first_non_empty([
            $env['PINTEREST_CLIENT_SECRET'] ?? '',
            $vault['app_secret'] ?? '',
        ]),
        'PINTEREST_REDIRECT_URI' => pgp_first_non_empty([
            $env['PINTEREST_REDIRECT_URI'] ?? '',
        ], 'https://postgeniuspro.com/api/pinterest_auth.php'),
        'AMAZON_ASSOCIATE_TAG' => pgp_first_non_empty([
            $vault['amazon_associate_tag'] ?? '',
            $vault['AMAZON_ASSOCIATE_TAG'] ?? '',
            $env['AMAZON_ASSOCIATE_TAG'] ?? '',
        ]),
        'AMAZON_PAAPI_ACCESS_KEY' => pgp_first_non_empty([
            $vault['amazon_paapi_access_key'] ?? '',
            $vault['AMAZON_PAAPI_ACCESS_KEY'] ?? '',
            $env['AMAZON_PAAPI_ACCESS_KEY'] ?? '',
        ]),
        'AMAZON_PAAPI_SECRET_KEY' => pgp_first_non_empty([
            $vault['amazon_paapi_secret_key'] ?? '',
            $vault['AMAZON_PAAPI_SECRET_KEY'] ?? '',
            $env['AMAZON_PAAPI_SECRET_KEY'] ?? '',
        ]),
        'AMAZON_CREATORS_CREDENTIAL_ID' => pgp_first_non_empty([
            $vault['amazon_creators_credential_id'] ?? '',
            $vault['AMAZON_CREATORS_CREDENTIAL_ID'] ?? '',
            $env['AMAZON_CREATORS_CREDENTIAL_ID'] ?? '',
        ]),
        'AMAZON_CREATORS_SECRET' => pgp_first_non_empty([
            $vault['amazon_creators_secret'] ?? '',
            $vault['AMAZON_CREATORS_SECRET'] ?? '',
            $env['AMAZON_CREATORS_SECRET'] ?? '',
        ]),
    ];
}

function pgp_http_json(
    string $url,
    string $method,
    array $headers = [],
    ?array $payload = null
): array {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, strtoupper($method));
    curl_setopt($ch, CURLOPT_TIMEOUT, 120);

    if ($payload !== null) {
        $json = json_encode($payload);
        $headers[] = 'Content-Type: application/json';
        curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
    }

    if (!empty($headers)) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    }

    $body = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    return [
        'status' => $status,
        'body' => is_string($body) ? $body : '',
        'error' => $error,
    ];
}

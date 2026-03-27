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
$productName = trim((string) ($input['productName'] ?? ''));
$productDescription = trim((string) ($input['productDescription'] ?? ''));
$usageContext = trim((string) ($input['usageContext'] ?? ''));
$requestedCount = (int) ($input['imageCount'] ?? 3);
$requestedCount = max(1, min(6, $requestedCount));
$cfgScale = (float) ($input['cfgScale'] ?? 5.0);
$steps = (int) ($input['steps'] ?? 50);
$seedOverride = isset($input['seed']) ? (int) $input['seed'] : null;
$negativePrompt = trim((string) ($input['negativePrompt'] ?? ''));
$enhancePrompt = !array_key_exists('enhancePrompt', $input) || (bool) $input['enhancePrompt'];
$thinking = !array_key_exists('enableThinking', $input) || (bool) $input['enableThinking'];
$chatTemperature = (float) ($input['chatTemperature'] ?? 0.6);
$chatTopP = (float) ($input['chatTopP'] ?? 0.95);
$chatTopK = (int) ($input['chatTopK'] ?? 20);

$cfgScale = max(1.0, min(20.0, $cfgScale));
$steps = max(10, min(80, $steps));
$chatTemperature = max(0.0, min(2.0, $chatTemperature));
$chatTopP = max(0.1, min(1.0, $chatTopP));
$chatTopK = max(1, min(100, $chatTopK));

if ($productName === '' || $productDescription === '') {
    pgp_send_json(['error' => 'Missing required fields: productName and productDescription'], 400);
}

$allowedAspectRatios = [
    '1:1' => ['width' => 1024, 'height' => 1024],
    '16:9' => ['width' => 1344, 'height' => 768],
    '9:16' => ['width' => 768, 'height' => 1344],
    '4:3' => ['width' => 1152, 'height' => 864],
    '3:4' => ['width' => 864, 'height' => 1152],
    '21:9' => ['width' => 1536, 'height' => 640],
];

$normalizeAspectRatio = static function ($rawAspectRatio) use ($allowedAspectRatios): string {
    $candidate = strtolower(trim((string) $rawAspectRatio));
    $normalized = str_replace([' ', 'x'], ['', ':'], $candidate);
    return array_key_exists($normalized, $allowedAspectRatios) ? $normalized : '1:1';
};

$defaultAspectRatio = $normalizeAspectRatio($input['aspectRatio'] ?? '1:1');
$imageSpecs = [];
$rawSpecs = $input['imageSpecs'] ?? null;
if (is_array($rawSpecs)) {
    foreach ($rawSpecs as $spec) {
        if (!is_array($spec)) {
            continue;
        }
        $imageSpecs[] = [
            'role' => trim((string) ($spec['role'] ?? 'image')),
            'aspectRatio' => $normalizeAspectRatio($spec['aspectRatio'] ?? $defaultAspectRatio),
        ];
    }
}

if (count($imageSpecs) === 0) {
    for ($i = 0; $i < $requestedCount; $i++) {
        $imageSpecs[] = [
            'role' => 'image',
            'aspectRatio' => $defaultAspectRatio,
        ];
    }
} else {
    $imageSpecs = array_slice($imageSpecs, 0, 6);
}

$isStepScene = false;
foreach ($imageSpecs as $imageSpec) {
    if (strtolower((string) ($imageSpec['role'] ?? '')) === 'step') {
        $isStepScene = true;
        break;
    }
}

if ($isStepScene) {
    $prompt = 'Recipe step documentation photo. ';
    $prompt .= "Exact step instructions: {$productDescription}. ";
    if ($usageContext !== '') {
        $prompt .= "Context: {$usageContext}. ";
    }
    $prompt .= 'Style requirements: photorealistic, process-accurate, truthful kitchen scene, natural lighting, single in-progress action, no collage. ';
    $prompt .= 'Critical compliance: for prep/mix/form steps, never show final plated dish or fully cooked patties.';
    if ($negativePrompt === '') {
        $negativePrompt = 'cartoon, anime, illustration, CGI render, blurry, watermark, text, logo, final plated dish, fully cooked patties, hero food styling';
    }
    // Prompt rewriting for recipe steps tends to drift into plated "hero" dishes; keep raw prompt locked.
    $enhancePrompt = false;
} else {
    $prompt = "High-end commercial product photography of {$productName}. ";
    $prompt .= "Core scene details: {$productDescription}. ";
    if ($usageContext !== '') {
        $prompt .= "Usage context: {$usageContext}. ";
    }
    $prompt .= 'Style requirements: photorealistic, premium editorial ad campaign look, 8k, highly detailed texture, micro-contrast, realistic materials, natural color grading, studio lighting, sharp focus, depth of field, clean composition. ';
    $prompt .= 'Strictly avoid: cartoon style, illustration style, CGI render look, plastic texture, distorted anatomy, blurry output.';
    if ($negativePrompt === '') {
        $negativePrompt = 'cartoon, anime, illustration, CGI render, plastic skin, low resolution, blurry, watermark, text, logo, distorted anatomy';
    }
}

$finalPrompt = $prompt;
$promptEnhancement = null;
$chatModelId = trim((string) ($config['NVIDIA_CHAT_MODEL_ID'] ?? 'qwen/qwen3.5-397b-a17b'));
if ($chatModelId !== '' && strpos($chatModelId, '/') === false) {
    $chatModelId = 'qwen/' . $chatModelId;
}

if ($enhancePrompt && $chatModelId !== '') {
    $enhancerHttp = static function (array $payload, string $apiKey): array {
        $ch = curl_init('https://integrate.api.nvidia.com/v1/chat/completions');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'POST');
        curl_setopt($ch, CURLOPT_TIMEOUT, 12);
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

    $enhancerInstructions = "You are an elite commercial image prompt engineer. Rewrite the user prompt into one concise production-ready prompt for a photorealistic ad image. "
        . "Keep product identity exact, improve material/lighting/composition realism, and avoid artistic/cartoon styles. "
        . "Return ONLY the final prompt text with no JSON or markdown.";

    $enhancerResponse = $enhancerHttp(
        [
            'model' => $chatModelId,
            'messages' => [
                ['role' => 'system', 'content' => $enhancerInstructions],
                ['role' => 'user', 'content' => $prompt],
            ],
            'max_tokens' => 1024,
            'temperature' => $chatTemperature,
            'top_p' => $chatTopP,
            'top_k' => $chatTopK,
            'presence_penalty' => 0,
            'repetition_penalty' => 1,
            'stream' => false,
            'chat_template_kwargs' => ['enable_thinking' => $thinking],
        ],
        $config['NVIDIA_API_KEY']
    );

    if ($enhancerResponse['status'] >= 200 && $enhancerResponse['status'] < 300) {
        $enhancerDecoded = json_decode((string) $enhancerResponse['body'], true);
        if (is_array($enhancerDecoded)) {
            $content = $enhancerDecoded['choices'][0]['message']['content'] ?? '';
            if (is_array($content)) {
                $tmp = '';
                foreach ($content as $part) {
                    if (is_array($part) && isset($part['text']) && is_string($part['text'])) {
                        $tmp .= $part['text'];
                    }
                }
                $content = $tmp;
            }
            $content = trim((string) $content);
            if ($content !== '') {
                $finalPrompt = $content;
                $promptEnhancement = [
                    'used' => true,
                    'model' => $chatModelId,
                ];
            }
        }
    }
}

$configuredModel = trim((string) ($config['STABLE_DIFFUSION_MODEL_ID'] ?? ''));
$modelCandidates = array_values(array_unique(array_filter([
    $configuredModel,
    'stable-diffusion-3.5-large',
    'stable-diffusion-3-medium', // Known working fallback on NVIDIA hosted API
])));

$images = [];
$lastError = ['status' => 0, 'details' => 'No model candidates available'];

$tryIntegrateApi = static function (
    string $modelId,
    string $promptText,
    string $apiKey,
    string $aspectRatio,
    array $dimensions
) use ($seedOverride, $cfgScale, $steps, $negativePrompt): array {
    $payload = [
        'model' => $modelId,
        'prompt' => $promptText,
        'response_format' => 'b64_json',
        'seed' => $seedOverride ?? random_int(1, 1000000),
        'size' => $dimensions['width'] . 'x' . $dimensions['height'],
        'aspect_ratio' => $aspectRatio,
        'cfg_scale' => $cfgScale,
        'steps' => $steps,
        'negative_prompt' => $negativePrompt,
    ];

    $response = pgp_http_json(
        'https://integrate.api.nvidia.com/v1/images/generations',
        'POST',
        [
            'Authorization: Bearer ' . $apiKey,
            'Accept: application/json',
        ],
        $payload
    );

    // Retry with minimal payload because some model variants reject size/aspect fields.
    if ($response['status'] < 200 || $response['status'] >= 300) {
        $retryPayload = [
            'model' => $modelId,
            'prompt' => $promptText,
            'response_format' => 'b64_json',
        ];
        $response = pgp_http_json(
            'https://integrate.api.nvidia.com/v1/images/generations',
            'POST',
            [
                'Authorization: Bearer ' . $apiKey,
                'Accept: application/json',
            ],
            $retryPayload
        );
    }

    if ($response['status'] < 200 || $response['status'] >= 300) {
        return [
            'success' => false,
            'error' => [
                'status' => $response['status'],
                'details' => substr((string) $response['body'], 0, 600),
            ],
        ];
    }

    $decoded = json_decode((string) $response['body'], true);
    if (!is_array($decoded)) {
        return [
            'success' => false,
            'error' => ['status' => 502, 'details' => 'Invalid JSON response from NVIDIA integrate API'],
        ];
    }

    $first = $decoded['data'][0] ?? [];
    $base64 = (string) ($first['b64_json'] ?? $decoded['b64_json'] ?? $decoded['image'] ?? $decoded['base64'] ?? '');
    $url = (string) ($first['url'] ?? $decoded['url'] ?? '');
    if ($base64 === '' && $url === '') {
        return [
            'success' => false,
            'error' => ['status' => 502, 'details' => 'NVIDIA integrate API returned no image payload'],
        ];
    }

    return [
        'success' => true,
        'image' => [
            'base64' => $base64,
            'url' => $url !== '' ? $url : null,
            'provider' => 'integrate',
        ],
    ];
};

$tryLegacyApi = static function (
    string $modelId,
    string $promptText,
    string $apiKey,
    string $aspectRatio,
    array $dimensions
) use ($seedOverride, $cfgScale, $steps, $negativePrompt): array {
    $primaryPayload = [
        'prompt' => $promptText,
        'seed' => $seedOverride ?? random_int(1, 1000000),
        'aspect_ratio' => $aspectRatio,
        'width' => $dimensions['width'],
        'height' => $dimensions['height'],
        'cfg_scale' => $cfgScale,
        'steps' => $steps,
        'negative_prompt' => $negativePrompt,
    ];

    $response = pgp_http_json(
        'https://ai.api.nvidia.com/v1/genai/stabilityai/' . rawurlencode($modelId),
        'POST',
        [
            'Authorization: Bearer ' . $apiKey,
            'Accept: application/json',
        ],
        $primaryPayload
    );

    if ($response['status'] < 200 || $response['status'] >= 300) {
        $retryPayload = [
            'prompt' => $promptText,
            'seed' => random_int(1, 1000000),
            'aspect_ratio' => $aspectRatio,
        ];
        $response = pgp_http_json(
            'https://ai.api.nvidia.com/v1/genai/stabilityai/' . rawurlencode($modelId),
            'POST',
            [
                'Authorization: Bearer ' . $apiKey,
                'Accept: application/json',
            ],
            $retryPayload
        );
    }

    if ($response['status'] < 200 || $response['status'] >= 300) {
        return [
            'success' => false,
            'error' => [
                'status' => $response['status'],
                'details' => substr((string) $response['body'], 0, 600),
            ],
        ];
    }

    $decoded = json_decode((string) $response['body'], true);
    if (!is_array($decoded)) {
        return [
            'success' => false,
            'error' => ['status' => 502, 'details' => 'Invalid JSON response from NVIDIA legacy API'],
        ];
    }

    $base64 = (string) ($decoded['image'] ?? $decoded['b64_json'] ?? $decoded['base64'] ?? '');
    $url = (string) ($decoded['url'] ?? '');
    if ($base64 === '' && $url === '') {
        return [
            'success' => false,
            'error' => ['status' => 502, 'details' => 'NVIDIA legacy API returned no image payload'],
        ];
    }

    return [
        'success' => true,
        'image' => [
            'base64' => $base64,
            'url' => $url !== '' ? $url : null,
            'provider' => 'legacy',
        ],
    ];
};

foreach ($modelCandidates as $modelId) {
    foreach ($imageSpecs as $index => $imageSpec) {
        $aspectRatio = $imageSpec['aspectRatio'];
        $dimensions = $allowedAspectRatios[$aspectRatio] ?? $allowedAspectRatios['1:1'];

        $attempt = $tryIntegrateApi(
            $modelId,
            $finalPrompt,
            $config['NVIDIA_API_KEY'],
            $aspectRatio,
            $dimensions
        );

        if (!$attempt['success']) {
            $lastError = $attempt['error'] ?? ['status' => 502, 'details' => 'Unknown integrate API error'];
            $legacyAttempt = $tryLegacyApi(
                $modelId,
                $finalPrompt,
                $config['NVIDIA_API_KEY'],
                $aspectRatio,
                $dimensions
            );

            if (!$legacyAttempt['success']) {
                $lastError = $legacyAttempt['error'] ?? $lastError;

                // If model path is missing on both endpoints, try next model candidate immediately.
                if (($lastError['status'] ?? 0) === 404) {
                    break;
                }
                continue;
            }

            $attempt = $legacyAttempt;
        }

        $imagePayload = $attempt['image'] ?? null;
        if (!is_array($imagePayload)) {
            $lastError = ['status' => 502, 'details' => 'NVIDIA generation produced invalid image payload'];
            continue;
        }

        $images[] = [
            'base64' => (string) ($imagePayload['base64'] ?? ''),
            'url' => $imagePayload['url'] ?? null,
            'provider' => (string) ($imagePayload['provider'] ?? 'unknown'),
            'model' => $modelId,
            'prompt' => $finalPrompt,
            'role' => $imageSpec['role'],
            'aspectRatio' => $aspectRatio,
            'width' => $dimensions['width'],
            'height' => $dimensions['height'],
            'timestamp' => (int) round(microtime(true) * 1000),
        ];

        if (count($images) >= count($imageSpecs)) {
            break 2;
        }
    }
}

if (count($images) === 0) {
    pgp_send_json([
        'error' => 'NVIDIA generation request failed',
        'status' => $lastError['status'],
        'details' => $lastError['details'],
    ], 502);
}

pgp_send_json([
    'success' => true,
    'images' => $images,
    'requestedImageCount' => count($imageSpecs),
    'prompt' => $finalPrompt,
    'sourcePrompt' => $prompt,
    'promptEnhancement' => $promptEnhancement ?: ['used' => false],
    'generationSettings' => [
        'cfgScale' => $cfgScale,
        'steps' => $steps,
        'negativePrompt' => $negativePrompt,
    ],
]);

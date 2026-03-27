<?php
/**
 * regenerate-image.php
 *
 * Lightweight endpoint for regenerating a single image without reloading the page.
 * Expected request body:
 * {
 *   "type": "product" | "article" | "comparison" | "hero" | "step",
 *   "id": "item_id",
 *   "sectionIndex": 0,
 *   "prompt": "optional custom prompt",
 *   "forceNewKey": false
 * }
 */

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        "success" => false,
        "error" => "Method not allowed. Use POST."
    ]);
    exit;
}

$body = json_decode(file_get_contents('php://input'), true);
if (!$body || !is_array($body)) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error" => "Invalid JSON body."
    ]);
    exit;
}

$type = isset($body['type']) ? strtolower(trim((string)$body['type'])) : '';
$id = isset($body['id']) ? trim((string)$body['id']) : '';
$sectionIndex = isset($body['sectionIndex']) ? (int)$body['sectionIndex'] : null;
$prompt = isset($body['prompt']) ? trim((string)$body['prompt']) : '';
$forceNewKey = !empty($body['forceNewKey']);

if ($type === '') {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error" => "Missing required field: type."
    ]);
    exit;
}

if ($id === '' && $type !== 'hero') {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error" => "Missing required field: id."
    ]);
    exit;
}

// Build a deterministic fallback prompt if custom prompt is not provided.
if ($prompt === '') {
    if ($type === 'product' || $type === 'comparison') {
        $prompt = "Professional product photography for product ID " . $id;
    } elseif ($type === 'article' || $type === 'step') {
        $prompt = "Article section illustration for item " . $id;
        if ($sectionIndex !== null) {
            $prompt .= ", section " . $sectionIndex;
        }
    } else {
        $prompt = "Professional blog hero image";
    }
}

$style = "realistic";
if ($type === 'product' || $type === 'comparison') {
    $style = "commercial";
}

$width = ($type === 'product' || $type === 'comparison') ? 1024 : 1200;
$height = ($type === 'product' || $type === 'comparison') ? 1024 : 628;
$seed = $forceNewKey ? ("&seed=" . time()) : '';

$gatewayUrl = "https://postgenius-ai-gateway.larbilife.workers.dev?prompt=" . urlencode($prompt)
    . "&style=" . urlencode($style)
    . "&width=" . $width
    . "&height=" . $height
    . $seed;

$ch = curl_init($gatewayUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 60);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "User-Agent: PostGeniusPro-Regenerate/1.0"
]);

$binary = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
$curlError = curl_error($ch);
curl_close($ch);

if ($binary === false || $httpCode >= 400) {
    http_response_code(502);
    echo json_encode([
        "success" => false,
        "error" => "Image generation gateway failed.",
        "details" => $curlError ?: ("HTTP " . $httpCode)
    ]);
    exit;
}

if (!$contentType || strpos($contentType, "image/") !== 0) {
    $contentType = "image/png";
}

$dataUri = "data:" . $contentType . ";base64," . base64_encode($binary);

echo json_encode([
    "success" => true,
    "newImageUrl" => $dataUri,
    "keyUsed" => "master-worker",
    "cached" => false
]);
?>

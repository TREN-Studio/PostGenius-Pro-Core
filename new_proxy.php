<?php
/**
 * PostGenius Pro - Robust CORS Proxy
 * Handles image processing and external API requests securely.
 */

// Allow from any origin
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Max-Age: 86400');    // cache for 1 day
}

// Access-Control headers are received during OPTIONS requests
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_METHOD']))
        header("Access-Control-Allow-Methods: GET, POST, OPTIONS");         

    if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']))
        header("Access-Control-Allow-Headers: {$_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']}");

    exit(0);
}

// Set JSON content type if returning errors, otherwise dynamic
// header('Content-Type: application/json'); // Don't enforce JSON, we might return binaries

$url = $_GET['url'] ?? '';

if (empty($url)) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing URL parameter']);
    exit;
}

// Basic security: Ensure URL is valid
if (!filter_var($url, FILTER_VALIDATE_URL)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid URL']);
    exit;
}

// Initialize cURL
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // Be careful with this in stricter environments
curl_setopt($ch, CURLOPT_USERAGENT, 'PostGeniusPro-Proxy/1.0');

// Prepare headers to forward
$headers = [];
$incoming_headers = getallheaders();
foreach ($incoming_headers as $key => $value) {
    if (strtolower($key) != 'host' && strtolower($key) != 'content-length') {
        $headers[] = "$key: $value";
    }
}
// Add explicit Authorization if passed (sometimes getallheaders misses it)
if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
    $headers[] = "Authorization: " . $_SERVER['HTTP_AUTHORIZATION'];
}

curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

// Forward POST data if present
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    curl_setopt($ch, CURLOPT_POST, true);
    $input = file_get_contents('php://input');
    curl_setopt($ch, CURLOPT_POSTFIELDS, $input);
}

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);

if (curl_errno($ch)) {
    http_response_code(500);
    echo json_encode(['error' => 'Proxy Error: ' . curl_error($ch)]);
} else {
    // Forward the Content-Type header from the destination
    header("Content-Type: $contentType");
    http_response_code($httpCode);
    echo $response;
}

curl_close($ch);
?>

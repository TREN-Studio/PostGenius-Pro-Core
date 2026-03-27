<?php
ini_set('display_errors', '0');
error_reporting(0);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-API-KEY, x-api-key, x-picsart-api-key, X-Prodia-Key, apikey, X-Amz-Target, X-Amz-Date, Content-Encoding, Accept, Accept-Language, Cache-Control');
header('Vary: Origin');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

function json_error(int $status, string $message, array $extra = []): void {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode(array_merge(['error' => $message], $extra), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function get_target_host(string $url): string {
    return strtolower((string) parse_url($url, PHP_URL_HOST));
}

function is_amazon_html_host(string $host): bool {
    return in_array($host, ['amazon.com', 'www.amazon.com'], true);
}

function is_amazon_image_host(string $host): bool {
    return in_array($host, ['m.media-amazon.com', 'images-na.ssl-images-amazon.com'], true);
}

function looks_like_amazon_captcha(string $body): bool {
    return (bool) preg_match('/Type the characters you see below|captchacharacters|Robot Check/i', $body);
}

function normalize_target_url(string $url): string {
    $normalized = trim($url);
    if (!preg_match('/^https?:\\/\\//i', $normalized) && strpos($normalized, '%3A%2F%2F') !== false) {
        $normalized = urldecode($normalized);
    }
    if (preg_match('/\\s/', $normalized)) {
        $normalized = preg_replace('/\\s+/', '%20', $normalized);
    }
    return $normalized;
}

function build_request_headers(string $url, bool $isAmazonHtml, bool $isAmazonImage): array {
    if ($isAmazonHtml) {
        return [
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language: en-US,en;q=0.9',
            'Cache-Control: no-cache',
            'Pragma: no-cache',
            'Referer: https://www.amazon.com/',
            'Upgrade-Insecure-Requests: 1',
        ];
    }

    if ($isAmazonImage) {
        return [
            'Accept: image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            'Accept-Language: en-US,en;q=0.9',
            'Cache-Control: no-cache',
            'Pragma: no-cache',
            'Referer: https://www.amazon.com/',
        ];
    }

    $clientHeaders = function_exists('getallheaders') ? getallheaders() : [];
    $forwardHeaders = [];
    $blocked = ['host', 'content-length', 'origin', 'referer', 'accept-encoding', 'connection'];

    foreach ($clientHeaders as $key => $value) {
        $normalizedKey = strtolower(str_replace('_', '-', (string) $key));
        if (in_array($normalizedKey, $blocked, true)) {
            continue;
        }
        if ($value === '') {
            continue;
        }
        $forwardHeaders[] = $key . ': ' . $value;
    }

    if (empty($forwardHeaders)) {
        $forwardHeaders[] = 'Accept: */*';
    }

    return $forwardHeaders;
}

function execute_proxy_request(string $url, bool $isAmazonHtml, bool $isAmazonImage): array {
    $attempts = ($isAmazonHtml || $isAmazonImage) ? 3 : 1;
    $requestBody = $_SERVER['REQUEST_METHOD'] === 'POST' ? file_get_contents('php://input') : null;
    $lastError = '';
    $lastStatus = 0;
    $lastContentType = '';
    $lastBody = '';

    for ($attempt = 1; $attempt <= $attempts; $attempt++) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 60);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 15);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
        curl_setopt($ch, CURLOPT_ENCODING, '');
        curl_setopt($ch, CURLOPT_AUTOREFERER, true);
        curl_setopt($ch, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_1_1);
        curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36');
        curl_setopt($ch, CURLOPT_HTTPHEADER, build_request_headers($url, $isAmazonHtml, $isAmazonImage));

        if ($requestBody !== null && $_SERVER['REQUEST_METHOD'] === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $requestBody);
        }

        $response = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $contentType = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        $curlError = curl_error($ch);
        curl_close($ch);

        $lastError = $curlError ?: '';
        $lastStatus = $status;
        $lastContentType = $contentType;
        $lastBody = is_string($response) ? $response : '';

        if ($response === false) {
            if ($attempt < $attempts) {
                usleep(250000 * $attempt);
                continue;
            }
            return [null, 500, 'application/json', $lastError ?: 'Proxy request failed'];
        }

        if ($isAmazonHtml) {
            $shouldRetry = in_array($status, [429, 500, 502, 503, 504], true)
                || ($status === 200 && (strlen(trim($lastBody)) < 800 || looks_like_amazon_captcha($lastBody)));
            if ($shouldRetry && $attempt < $attempts) {
                usleep(250000 * $attempt);
                continue;
            }
        }

        if ($isAmazonImage && in_array($status, [429, 500, 502, 503, 504], true) && $attempt < $attempts) {
            usleep(250000 * $attempt);
            continue;
        }

        return [$lastBody, $status > 0 ? $status : 200, $lastContentType, ''];
    }

    return [$lastBody, $lastStatus > 0 ? $lastStatus : 500, $lastContentType, $lastError ?: 'Proxy request failed'];
}

$url = normalize_target_url((string) ($_GET['url'] ?? ''));
if ($url === '') {
    json_error(400, 'Missing URL parameter');
}

if (!filter_var($url, FILTER_VALIDATE_URL)) {
    json_error(400, 'Invalid URL');
}

if (preg_match('/(localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0)/i', $url)) {
    json_error(403, 'Restricted Access');
}

$host = get_target_host($url);
$isAmazonHtml = is_amazon_html_host($host);
$isAmazonImage = is_amazon_image_host($host);

[$response, $httpCode, $contentType, $errorMessage] = execute_proxy_request($url, $isAmazonHtml, $isAmazonImage);

if ($response === null) {
    json_error(500, 'Proxy failed', ['details' => $errorMessage ?: 'Unknown cURL error']);
}

if ($isAmazonHtml) {
    if ($httpCode >= 500) {
        json_error(503, 'Amazon HTML fetch failed', ['status' => $httpCode]);
    }

    if ($httpCode === 200 && strlen(trim($response)) < 800) {
        json_error(503, 'Amazon HTML response too short');
    }

    if (looks_like_amazon_captcha($response)) {
        json_error(503, 'Amazon CAPTCHA detected');
    }
}

if ($isAmazonImage) {
    $normalizedType = strtolower((string) $contentType);
    if (strpos($normalizedType, 'image/') !== 0 || strpos($normalizedType, 'svg') !== false || strpos($normalizedType, 'gif') !== false) {
        json_error(422, 'Invalid Amazon image response', ['contentType' => $contentType]);
    }

    if (strlen($response) < 4096) {
        json_error(422, 'Amazon image too small');
    }

    if (function_exists('getimagesizefromstring')) {
        $imageInfo = @getimagesizefromstring($response);
        if (!$imageInfo || !isset($imageInfo[0], $imageInfo[1]) || (int) $imageInfo[0] < 220 || (int) $imageInfo[1] < 220) {
            json_error(422, 'Amazon image dimensions too small');
        }
    }
}

if (!empty($contentType)) {
    header('Content-Type: ' . $contentType);
}

http_response_code($httpCode > 0 ? $httpCode : 200);
echo $response;

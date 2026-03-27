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

pgp_send_json([
    'success' => true,
    'associateTag' => (string) ($config['AMAZON_ASSOCIATE_TAG'] ?? ''),
    'paapiAccessKey' => (string) ($config['AMAZON_PAAPI_ACCESS_KEY'] ?? ''),
    'paapiSecretKey' => (string) ($config['AMAZON_PAAPI_SECRET_KEY'] ?? ''),
    'creatorsClientId' => (string) ($config['AMAZON_CREATORS_CREDENTIAL_ID'] ?? ''),
    'creatorsClientSecret' => (string) ($config['AMAZON_CREATORS_SECRET'] ?? ''),
    'hasPaapiKeys' => trim((string) ($config['AMAZON_PAAPI_ACCESS_KEY'] ?? '')) !== '' &&
        trim((string) ($config['AMAZON_PAAPI_SECRET_KEY'] ?? '')) !== '',
]);

<?php
// Disable Error Reporting for Production (Prevents JSON output corruption)
ini_set('display_errors', 0);
ini_set('display_startup_errors', 0);
error_reporting(E_ALL);

require 'db.php';

$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true);
if (!is_array($data)) {
    $data = [];
}
$action = $_GET['action'] ?? '';

function pgp_send_json($payload, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($payload);
    exit;
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

function pgp_require_user(PDO $conn): array
{
    $token = pgp_get_auth_token();
    if ($token === '') {
        pgp_send_json(["error" => "Unauthorized"], 401);
    }

    try {
        $stmt = $conn->prepare("SELECT id, email FROM users WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $token]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$user) {
            pgp_send_json(["error" => "Unauthorized"], 401);
        }
        return $user;
    } catch (Throwable $e) {
        pgp_send_json(["error" => "Authorization check failed"], 500);
    }
}

function pgp_column_exists(PDO $conn, string $table, string $column): bool
{
    $stmt = $conn->prepare("SHOW COLUMNS FROM `$table` LIKE :column");
    $stmt->execute([':column' => $column]);
    return (bool)$stmt->fetch(PDO::FETCH_ASSOC);
}

function pgp_ensure_member_schema(PDO $conn): void
{
    $conn->exec("
        CREATE TABLE IF NOT EXISTS user_collections (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            user_id VARCHAR(36) NOT NULL,
            article_id VARCHAR(36) NULL,
            article_slug VARCHAR(255) NOT NULL,
            article_title VARCHAR(255) NOT NULL,
            image_url VARCHAR(500) NULL,
            saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_user_article_slug (user_id, article_slug),
            INDEX idx_user_collections_user_saved (user_id, saved_at),
            CONSTRAINT fk_user_collections_user
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ");

    $conn->exec("
        CREATE TABLE IF NOT EXISTS tracked_products (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            user_id VARCHAR(36) NOT NULL,
            product_title VARCHAR(255) NOT NULL,
            product_url TEXT NOT NULL,
            url_hash CHAR(64) NOT NULL,
            tracked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_user_product_hash (user_id, url_hash),
            INDEX idx_tracked_products_user_tracked (user_id, tracked_at),
            CONSTRAINT fk_tracked_products_user
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ");

    if (!pgp_column_exists($conn, 'users', 'newsletter_enabled')) {
        $conn->exec("ALTER TABLE users ADD COLUMN newsletter_enabled TINYINT(1) NOT NULL DEFAULT 1");
    }
}

function pgp_normalize_url(string $value): string
{
    $raw = trim($value);
    if ($raw === '') return '';

    $parts = parse_url($raw);
    if ($parts === false) return $raw;

    if (!isset($parts['scheme']) || !isset($parts['host'])) {
        return $raw;
    }

    $scheme = strtolower((string)$parts['scheme']);
    $host = strtolower((string)$parts['host']);
    $port = isset($parts['port']) ? ':' . (int)$parts['port'] : '';
    $path = isset($parts['path']) ? (string)$parts['path'] : '';
    $query = isset($parts['query']) ? '?' . (string)$parts['query'] : '';

    return $scheme . '://' . $host . $port . $path . $query;
}

function pgp_get_saved_reviews(PDO $conn, string $userId): array
{
    $stmt = $conn->prepare("
        SELECT article_id, article_slug, article_title, image_url, saved_at
        FROM user_collections
        WHERE user_id = :user_id
        ORDER BY saved_at DESC
    ");
    $stmt->execute([':user_id' => $userId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    return array_map(function ($row) {
        return [
            'id' => (string)($row['article_id'] ?? $row['article_slug'] ?? ''),
            'slug' => (string)($row['article_slug'] ?? ''),
            'title' => (string)($row['article_title'] ?? 'Saved Review'),
            'imageUrl' => $row['image_url'] !== null ? (string)$row['image_url'] : null,
            'savedAt' => (string)($row['saved_at'] ?? ''),
        ];
    }, $rows);
}

function pgp_get_tracked_products(PDO $conn, string $userId): array
{
    $stmt = $conn->prepare("
        SELECT product_title, product_url, tracked_at
        FROM tracked_products
        WHERE user_id = :user_id
        ORDER BY tracked_at DESC
    ");
    $stmt->execute([':user_id' => $userId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    return array_map(function ($row) {
        return [
            'title' => (string)($row['product_title'] ?? 'Tracked Product'),
            'url' => (string)($row['product_url'] ?? ''),
            'trackedAt' => (string)($row['tracked_at'] ?? ''),
        ];
    }, $rows);
}

function pgp_get_newsletter_enabled(PDO $conn, string $userId): bool
{
    $stmt = $conn->prepare("SELECT newsletter_enabled FROM users WHERE id = :id LIMIT 1");
    $stmt->execute([':id' => $userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) return true;
    return (int)($row['newsletter_enabled'] ?? 1) === 1;
}

function pgp_parse_enabled($value): bool
{
    if (is_bool($value)) return $value;
    if (is_int($value) || is_float($value)) return ((int)$value) === 1;
    $normalized = strtolower(trim((string)$value));
    return in_array($normalized, ['1', 'true', 'yes', 'on'], true);
}

try {
    pgp_ensure_member_schema($conn);
    $user = pgp_require_user($conn);
    $userId = (string)$user['id'];

    switch ($action) {
        case 'get_state':
            pgp_send_json([
                'savedReviews' => pgp_get_saved_reviews($conn, $userId),
                'trackedProducts' => pgp_get_tracked_products($conn, $userId),
                'newsletterEnabled' => pgp_get_newsletter_enabled($conn, $userId),
            ]);
            break;

        case 'get_saved_reviews':
            pgp_send_json([
                'savedReviews' => pgp_get_saved_reviews($conn, $userId),
            ]);
            break;

        case 'toggle_saved_review':
            $slug = trim((string)($data['slug'] ?? ''));
            if ($slug === '') {
                pgp_send_json(['error' => 'Article slug is required'], 400);
            }

            $check = $conn->prepare("SELECT id FROM user_collections WHERE user_id = :user_id AND article_slug = :slug LIMIT 1");
            $check->execute([':user_id' => $userId, ':slug' => $slug]);
            $existing = $check->fetch(PDO::FETCH_ASSOC);

            $saved = false;
            if ($existing) {
                $del = $conn->prepare("DELETE FROM user_collections WHERE user_id = :user_id AND article_slug = :slug");
                $del->execute([':user_id' => $userId, ':slug' => $slug]);
                $saved = false;
            } else {
                $articleId = trim((string)($data['article_id'] ?? $data['id'] ?? ''));
                $title = trim((string)($data['title'] ?? 'Saved Review'));
                $imageUrl = trim((string)($data['image_url'] ?? ''));

                $insert = $conn->prepare("
                    INSERT INTO user_collections (user_id, article_id, article_slug, article_title, image_url)
                    VALUES (:user_id, :article_id, :article_slug, :article_title, :image_url)
                ");
                $insert->execute([
                    ':user_id' => $userId,
                    ':article_id' => $articleId !== '' ? $articleId : null,
                    ':article_slug' => $slug,
                    ':article_title' => $title !== '' ? $title : 'Saved Review',
                    ':image_url' => $imageUrl !== '' ? $imageUrl : null,
                ]);
                $saved = true;
            }

            pgp_send_json([
                'saved' => $saved,
                'savedReviews' => pgp_get_saved_reviews($conn, $userId),
            ]);
            break;

        case 'remove_saved_review':
            $slug = trim((string)($data['slug'] ?? ''));
            if ($slug === '') {
                pgp_send_json(['error' => 'Article slug is required'], 400);
            }
            $del = $conn->prepare("DELETE FROM user_collections WHERE user_id = :user_id AND article_slug = :slug");
            $del->execute([':user_id' => $userId, ':slug' => $slug]);
            pgp_send_json([
                'ok' => true,
                'savedReviews' => pgp_get_saved_reviews($conn, $userId),
            ]);
            break;

        case 'get_tracked_products':
            pgp_send_json([
                'trackedProducts' => pgp_get_tracked_products($conn, $userId),
            ]);
            break;

        case 'toggle_tracked_product':
            $title = trim((string)($data['title'] ?? 'Tracked Product'));
            $url = trim((string)($data['url'] ?? ''));
            $normalizedUrl = pgp_normalize_url($url);
            if ($normalizedUrl === '') {
                pgp_send_json(['error' => 'Product URL is required'], 400);
            }
            $urlHash = hash('sha256', $normalizedUrl);

            $check = $conn->prepare("SELECT id FROM tracked_products WHERE user_id = :user_id AND url_hash = :url_hash LIMIT 1");
            $check->execute([':user_id' => $userId, ':url_hash' => $urlHash]);
            $existing = $check->fetch(PDO::FETCH_ASSOC);

            $tracked = false;
            if ($existing) {
                $del = $conn->prepare("DELETE FROM tracked_products WHERE user_id = :user_id AND url_hash = :url_hash");
                $del->execute([':user_id' => $userId, ':url_hash' => $urlHash]);
                $tracked = false;
            } else {
                $insert = $conn->prepare("
                    INSERT INTO tracked_products (user_id, product_title, product_url, url_hash)
                    VALUES (:user_id, :product_title, :product_url, :url_hash)
                ");
                $insert->execute([
                    ':user_id' => $userId,
                    ':product_title' => $title !== '' ? $title : 'Tracked Product',
                    ':product_url' => $normalizedUrl,
                    ':url_hash' => $urlHash,
                ]);
                $tracked = true;
            }

            pgp_send_json([
                'tracked' => $tracked,
                'trackedProducts' => pgp_get_tracked_products($conn, $userId),
            ]);
            break;

        case 'get_newsletter':
            pgp_send_json([
                'newsletterEnabled' => pgp_get_newsletter_enabled($conn, $userId),
            ]);
            break;

        case 'set_newsletter':
            $enabled = pgp_parse_enabled($data['enabled'] ?? false) ? 1 : 0;
            $update = $conn->prepare("UPDATE users SET newsletter_enabled = :enabled WHERE id = :id");
            $update->execute([
                ':enabled' => $enabled,
                ':id' => $userId,
            ]);

            pgp_send_json([
                'ok' => true,
                'newsletterEnabled' => $enabled === 1,
            ]);
            break;

        default:
            pgp_send_json(["error" => "Invalid action"], 400);
            break;
    }
} catch (Throwable $e) {
    pgp_send_json(["error" => "Member data request failed"], 500);
}
?>

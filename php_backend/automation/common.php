<?php
declare(strict_types=1);

require_once __DIR__ . '/../db.php';

const OWNER_EMAIL = 'larbilife@gmail.com';

if (!headers_sent()) {
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

function json_response(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function get_request_token(): string
{
    $token = trim((string)($_GET['token'] ?? ''));
    if ($token !== '') return $token;

    $headers = function_exists('getallheaders') ? getallheaders() : [];
    foreach ($headers as $key => $value) {
        if (strtolower((string)$key) === 'x-cron-token') {
            return trim((string)$value);
        }
    }

    return '';
}

function get_stored_cron_token(): string
{
    $fromEnv = getenv('PGP_AUTOPUBLISH_CRON_TOKEN');
    if ($fromEnv !== false && trim((string)$fromEnv) !== '') {
        return trim((string)$fromEnv);
    }

    $tokenPath = __DIR__ . '/.cron_token';
    if (is_file($tokenPath)) {
        $raw = trim((string)file_get_contents($tokenPath));
        if ($raw !== '') return $raw;
    }

    return '';
}

function get_authorization_token(): string
{
    $auth = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? '');
    if ($auth === '' && function_exists('getallheaders')) {
        $headers = getallheaders();
        if (is_array($headers)) {
            $auth = (string)($headers['Authorization'] ?? $headers['authorization'] ?? '');
        }
    }

    $auth = trim($auth);
    if ($auth === '') return '';
    if (stripos($auth, 'Bearer ') === 0) {
        return trim(substr($auth, 7));
    }
    return $auth;
}

function get_authenticated_user(PDO $conn): ?array
{
    $token = get_authorization_token();
    if ($token === '') return null;

    $stmt = $conn->prepare("
        SELECT u.id, u.email, COALESCE(p.role, 'user') AS role
        FROM users u
        LEFT JOIN profiles p ON p.id = u.id
        WHERE u.id = :id
        LIMIT 1
    ");
    $stmt->execute([':id' => $token]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    return $user ?: null;
}

function is_admin_user(array $user): bool
{
    $email = strtolower(trim((string)($user['email'] ?? '')));
    $role = strtolower(trim((string)($user['role'] ?? '')));
    return $role === 'admin' || $email === OWNER_EMAIL;
}

function is_valid_cron_token(): bool
{
    $provided = get_request_token();
    $expected = get_stored_cron_token();
    if ($expected === '' || $provided === '') return false;
    return hash_equals($expected, $provided);
}

function require_automation_access(PDO $conn): array
{
    if (is_valid_cron_token()) {
        return ['mode' => 'cron', 'user' => null];
    }

    $user = get_authenticated_user($conn);
    if (!$user || !is_admin_user($user)) {
        json_response([
            'success' => false,
            'error' => 'Unauthorized'
        ], 401);
    }

    return ['mode' => 'admin', 'user' => $user];
}

function require_cron_auth(): void
{
    $provided = get_request_token();
    $expected = get_stored_cron_token();

    if ($expected === '') {
        json_response([
            'success' => false,
            'error' => 'Cron token is not configured. Run /api/automation/setup first.'
        ], 500);
    }

    if ($provided === '' || !hash_equals($expected, $provided)) {
        json_response([
            'success' => false,
            'error' => 'Unauthorized'
        ], 401);
    }
}

function ensure_automation_tables(PDO $conn): void
{
    $conn->exec("
        CREATE TABLE IF NOT EXISTS automation_state (
            id TINYINT PRIMARY KEY,
            last_blueprint VARCHAR(50) NULL,
            last_run_at TIMESTAMP NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    ");

    $conn->exec("
        CREATE TABLE IF NOT EXISTS automation_runs (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            run_type VARCHAR(50) NOT NULL,
            picked_article_id VARCHAR(36) NULL,
            picked_blueprint VARCHAR(50) NULL,
            status VARCHAR(20) NOT NULL,
            details TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ");

    $conn->exec("
        CREATE TABLE IF NOT EXISTS content_jobs (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            input_type VARCHAR(20) NOT NULL,
            input_value TEXT NOT NULL,
            blueprint_type VARCHAR(50) NOT NULL DEFAULT 'review',
            niche_tag VARCHAR(100) NULL,
            priority INT NOT NULL DEFAULT 100,
            status VARCHAR(20) NOT NULL DEFAULT 'queued',
            payload_json JSON NULL,
            result_json JSON NULL,
            error_message TEXT NULL,
            attempt_count INT NOT NULL DEFAULT 0,
            max_attempts INT NOT NULL DEFAULT 3,
            locked_by VARCHAR(120) NULL,
            locked_at TIMESTAMP NULL,
            started_at TIMESTAMP NULL,
            completed_at TIMESTAMP NULL,
            created_by VARCHAR(36) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_content_jobs_status_priority (status, priority, id),
            INDEX idx_content_jobs_created_at (created_at),
            CONSTRAINT fk_content_jobs_user
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )
    ");

    $conn->exec("
        CREATE TABLE IF NOT EXISTS automation_settings (
            id TINYINT PRIMARY KEY,
            auto_trigger TINYINT(1) NOT NULL DEFAULT 0,
            worker_interval_seconds INT NOT NULL DEFAULT 60,
            generate_endpoint VARCHAR(500) NULL,
            enabled_niches_json JSON NULL,
            last_worker_run_at TIMESTAMP NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    ");

    $conn->exec("
        CREATE TABLE IF NOT EXISTS automation_events (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            event_type VARCHAR(40) NOT NULL,
            message VARCHAR(255) NOT NULL,
            job_id BIGINT NULL,
            payload_json JSON NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_automation_events_created_at (created_at)
        )
    ");

    $conn->exec("
        CREATE TABLE IF NOT EXISTS automation_daily_targets (
            target_date DATE PRIMARY KEY,
            publish_target INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    ");

    $conn->exec("
        CREATE TABLE IF NOT EXISTS automation_asin_history (
            asin VARCHAR(10) PRIMARY KEY,
            source_keyword VARCHAR(160) NULL,
            last_job_id BIGINT NULL,
            last_article_id VARCHAR(36) NULL,
            last_queued_at TIMESTAMP NULL,
            last_published_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_automation_asin_last_queued_at (last_queued_at),
            INDEX idx_automation_asin_last_published_at (last_published_at)
        )
    ");

    $stmt = $conn->prepare("SELECT id FROM automation_state WHERE id = 1 LIMIT 1");
    $stmt->execute();
    $exists = $stmt->fetchColumn();
    if (!$exists) {
        $insert = $conn->prepare("INSERT INTO automation_state (id, last_blueprint, last_run_at) VALUES (1, NULL, NULL)");
        $insert->execute();
    }

    $settingsStmt = $conn->prepare("SELECT id FROM automation_settings WHERE id = 1 LIMIT 1");
    $settingsStmt->execute();
    $settingsExists = $settingsStmt->fetchColumn();
    if (!$settingsExists) {
        $insertSettings = $conn->prepare("
            INSERT INTO automation_settings (id, auto_trigger, worker_interval_seconds, generate_endpoint, enabled_niches_json)
            VALUES (1, 0, 60, NULL, :enabled_niches_json)
        ");
        $insertSettings->execute([
            ':enabled_niches_json' => json_encode([
                'amazon-master' => true,
                'kitchen' => true,
                'electronics' => true,
                'home' => true
            ], JSON_UNESCAPED_SLASHES)
        ]);
    }
}

function automation_decode_json($value, $fallback = [])
{
    if ($value === null || $value === '') return $fallback;
    if (is_array($value)) return $value;
    $decoded = json_decode((string)$value, true);
    return is_array($decoded) ? $decoded : $fallback;
}

function automation_log_event(PDO $conn, string $type, string $message, ?int $jobId = null, ?array $payload = null): void
{
    try {
        $stmt = $conn->prepare("
            INSERT INTO automation_events (event_type, message, job_id, payload_json)
            VALUES (:event_type, :message, :job_id, :payload_json)
        ");
        $stmt->execute([
            ':event_type' => $type,
            ':message' => $message,
            ':job_id' => $jobId,
            ':payload_json' => $payload ? json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) : null,
        ]);
    } catch (Throwable $e) {
        // Non-blocking log helper.
    }
}

function slugify_title(string $title): string
{
    $slug = strtolower(trim($title));
    $slug = preg_replace('/[^\p{L}\p{N}\s-]+/u', '', $slug) ?? '';
    $slug = preg_replace('/[\s-]+/', '-', $slug) ?? '';
    $slug = trim($slug, '-');
    if ($slug === '') {
        $slug = 'post';
    }
    return substr($slug, 0, 80);
}

function generate_unique_slug(PDO $conn, string $title, string $articleId): string
{
    $base = slugify_title($title);
    $candidate = $base;
    $suffix = 1;

    $query = $conn->prepare("SELECT id FROM articles WHERE slug = :slug AND id <> :id LIMIT 1");
    while (true) {
        $query->execute([':slug' => $candidate, ':id' => $articleId]);
        $exists = $query->fetchColumn();
        if (!$exists) break;
        $suffix++;
        $candidate = substr($base, 0, max(1, 80 - strlen((string)$suffix) - 1)) . '-' . $suffix;
    }

    return $candidate;
}

function xml_escape(string $value): string
{
    return htmlspecialchars($value, ENT_XML1 | ENT_QUOTES, 'UTF-8');
}

function write_dynamic_sitemap(PDO $conn): array
{
    $siteUrl = 'https://postgeniuspro.com';
    $staticUrls = [
        ['loc' => '/', 'changefreq' => 'weekly', 'priority' => '1.0'],
        ['loc' => '/features', 'changefreq' => 'monthly', 'priority' => '0.9'],
        ['loc' => '/pricing', 'changefreq' => 'monthly', 'priority' => '0.9'],
        ['loc' => '/about', 'changefreq' => 'monthly', 'priority' => '0.7'],
        ['loc' => '/editorial-team', 'changefreq' => 'monthly', 'priority' => '0.8'],
        ['loc' => '/blog', 'changefreq' => 'daily', 'priority' => '0.9'],
        ['loc' => '/contact', 'changefreq' => 'yearly', 'priority' => '0.6'],
        ['loc' => '/faq', 'changefreq' => 'monthly', 'priority' => '0.7'],
        ['loc' => '/privacy-policy', 'changefreq' => 'yearly', 'priority' => '0.3'],
        ['loc' => '/terms', 'changefreq' => 'yearly', 'priority' => '0.3'],
        ['loc' => '/affiliate-disclosure', 'changefreq' => 'yearly', 'priority' => '0.3'],
    ];

    $stmt = $conn->prepare("
        SELECT slug, COALESCE(published_at, updated_at, created_at) AS updated_at
        FROM articles
        WHERE status = 'Published' AND slug IS NOT NULL AND slug <> ''
        ORDER BY COALESCE(published_at, updated_at, created_at) DESC
        LIMIT 2000
    ");
    $stmt->execute();
    $published = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $lines = [];
    $lines[] = '<?xml version="1.0" encoding="UTF-8"?>';
    $lines[] = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';

    $today = gmdate('Y-m-d');
    foreach ($staticUrls as $entry) {
        $loc = $siteUrl . $entry['loc'];
        $lines[] = '  <url>';
        $lines[] = '    <loc>' . xml_escape($loc) . '</loc>';
        $lines[] = '    <lastmod>' . $today . '</lastmod>';
        $lines[] = '    <changefreq>' . $entry['changefreq'] . '</changefreq>';
        $lines[] = '    <priority>' . $entry['priority'] . '</priority>';
        $lines[] = '  </url>';
    }

    foreach ($published as $row) {
        $slug = trim((string)($row['slug'] ?? ''));
        if ($slug === '') continue;

        $lastmodRaw = (string)($row['updated_at'] ?? '');
        $lastmod = $today;
        if ($lastmodRaw !== '') {
            $ts = strtotime($lastmodRaw);
            if ($ts !== false) $lastmod = gmdate('Y-m-d', $ts);
        }

        $lines[] = '  <url>';
        $lines[] = '    <loc>' . xml_escape($siteUrl . '/blog/' . $slug) . '</loc>';
        $lines[] = '    <lastmod>' . $lastmod . '</lastmod>';
        $lines[] = '    <changefreq>weekly</changefreq>';
        $lines[] = '    <priority>0.8</priority>';
        $lines[] = '  </url>';
    }

    $lines[] = '</urlset>';
    $xml = implode("\n", $lines) . "\n";

    $rootPath = dirname(__DIR__, 2);
    $candidates = [
        $rootPath . '/sitemap.xml',
        $rootPath . '/public/sitemap.xml',
    ];

    $writtenTo = null;
    foreach ($candidates as $filePath) {
        $dir = dirname($filePath);
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        if (@file_put_contents($filePath, $xml) !== false) {
            $writtenTo = $filePath;
            break;
        }
    }

    if ($writtenTo === null) {
        throw new RuntimeException('Failed to write sitemap.xml');
    }

    return [
        'path' => $writtenTo,
        'publishedUrlCount' => count($published),
        'totalUrlCount' => count($published) + count($staticUrls),
        'sitemapUrl' => 'https://postgeniuspro.com/sitemap.xml'
    ];
}

function ping_search_engines(string $sitemapUrl): array
{
    $targets = [
        'google' => 'https://www.google.com/ping?sitemap=' . urlencode($sitemapUrl),
        'bing' => 'https://www.bing.com/ping?sitemap=' . urlencode($sitemapUrl),
    ];

    $results = [];
    foreach ($targets as $name => $url) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 20);
        $body = curl_exec($ch);
        $err = curl_error($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $results[$name] = [
            'url' => $url,
            'httpCode' => $code,
            'ok' => ($err === '' && $code >= 200 && $code < 400),
            'error' => $err ?: null,
            'responseSnippet' => $body ? substr((string)$body, 0, 180) : null,
        ];
    }

    return $results;
}

<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';
require_once __DIR__ . '/../_shared/config.php';

const REVIEW_GENERATOR_MAX_PRODUCTS = 5;
const REVIEW_GENERATOR_REQUIRED_PRODUCT_IMAGES = 3;
const REVIEW_GENERATOR_REQUIRED_LIFESTYLE_IMAGES = 3;
const REVIEW_GENERATOR_MIN_PRODUCT_IMAGE_DIMENSION = 280;

function review_generator_process_job(PDO $conn, array $request): array
{
    $inputType = strtolower(trim((string)($request['inputType'] ?? 'asin')));
    $inputValue = trim((string)($request['inputValue'] ?? ''));
    $blueprintType = strtolower(trim((string)($request['blueprintType'] ?? 'review')));
    $payload = is_array($request['payload'] ?? null) ? $request['payload'] : [];
    $jobId = isset($request['jobId']) ? (int)$request['jobId'] : null;

    if ($blueprintType !== 'review') {
        throw new RuntimeException('This generator only supports Amazon Multi-ASIN Master jobs.');
    }

    if (!in_array($inputType, ['asin', 'url', 'keyword'], true)) {
        throw new RuntimeException('Invalid input type for Amazon Multi-ASIN Master.');
    }

    if ($inputValue === '') {
        throw new RuntimeException('Input value is required.');
    }

    $config = pgp_load_runtime_config();
    $associateTag = review_generator_affiliate_tag($config);

    $products = review_generator_resolve_products($inputType, $inputValue, $payload, $config);
    if (count($products) === 0) {
        throw new RuntimeException('No Amazon products could be resolved from the provided job input.');
    }

    $articlePlan = review_generator_build_article_plan($products, $inputType, $inputValue, $payload, $config);
    $conn = review_generator_refresh_connection($conn);
    $ownerId = review_generator_get_owner_user_id($conn);
    $articleRecord = review_generator_build_article_record($conn, $ownerId, $products, $articlePlan, $associateTag, $config);

    if (!empty($payload['skipSave'])) {
        return [
            'success' => true,
            'jobId' => $jobId,
            'previewOnly' => true,
            'title' => $articleRecord['title'],
            'slug' => $articleRecord['slug'],
            'blueprintType' => 'review',
            'productCount' => count($products),
            'generatedHtmlPreview' => review_generator_truncate($articleRecord['generated_html'], 1800),
        ];
    }

    review_generator_insert_article($conn, $articleRecord);

    $result = [
        'success' => true,
        'jobId' => $jobId,
        'articleId' => $articleRecord['id'],
        'title' => $articleRecord['title'],
        'slug' => $articleRecord['slug'],
        'status' => $articleRecord['status'],
        'blueprintType' => 'review',
        'productCount' => count($products),
        'url' => 'https://postgeniuspro.com/blog/' . $articleRecord['slug'],
    ];

    automation_log_event($conn, 'review_generated', 'Server-side Amazon review draft created.', $jobId, [
        'articleId' => $articleRecord['id'],
        'slug' => $articleRecord['slug'],
        'productCount' => count($products),
    ]);

    return $result;
}

function review_generator_json_string($value): string
{
    $json = json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if ($json !== false) {
        return $json;
    }

    $clean = review_generator_utf8_clean($value);
    $json = json_encode($clean, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if ($json === false) {
        throw new RuntimeException('Failed to encode generator payload as JSON.');
    }

    return $json;
}

function review_generator_utf8_clean($value)
{
    if (is_array($value)) {
        $clean = [];
        foreach ($value as $key => $item) {
            $clean[$key] = review_generator_utf8_clean($item);
        }
        return $clean;
    }

    if (!is_string($value)) {
        return $value;
    }

    if (function_exists('mb_convert_encoding')) {
        return mb_convert_encoding($value, 'UTF-8', 'UTF-8');
    }

    if (function_exists('iconv')) {
        $converted = iconv('UTF-8', 'UTF-8//IGNORE', $value);
        if ($converted !== false) {
            return $converted;
        }
    }

    return preg_replace('/[^\x09\x0A\x0D\x20-\x7E]/', '', $value) ?? $value;
}

function review_generator_refresh_connection(PDO $conn): PDO
{
    try {
        $conn->query('SELECT 1');
        return $conn;
    } catch (Throwable $e) {
        global $host, $db_name, $username, $password;

        if (!isset($host, $db_name, $username, $password)) {
            throw new RuntimeException('Database connection could not be refreshed.');
        }

        $fresh = new PDO('mysql:host=' . $host . ';dbname=' . $db_name, $username, $password);
        $fresh->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        return $fresh;
    }
}

function review_generator_get_owner_user_id(PDO $conn): string
{
    $stmt = $conn->prepare("
        SELECT u.id
        FROM users u
        LEFT JOIN profiles p ON p.id = u.id
        WHERE LOWER(u.email) = :email
        LIMIT 1
    ");
    $stmt->execute([':email' => OWNER_EMAIL]);
    $userId = $stmt->fetchColumn();
    if (!is_string($userId) || trim($userId) === '') {
        throw new RuntimeException('Owner account could not be resolved for automation publishing.');
    }
    return trim($userId);
}

function review_generator_normalize_family_text(string $value): string
{
    $value = preg_replace('#\bhttps?://\S+#i', ' ', $value) ?? $value;
    $value = preg_replace('#\bwww\.[^\s]+#i', ' ', $value) ?? $value;
    $value = preg_replace('#\bamazon\.[a-z.]+\S*#i', ' ', $value) ?? $value;
    $value = preg_replace('/[^a-z0-9]+/i', ' ', $value) ?? $value;
    $value = strtolower(trim(preg_replace('/\s+/', ' ', $value) ?? ''));
    return $value;
}

function review_generator_family_tokens(string $value): array
{
    static $stopwords = [
        'a' => true, 'an' => true, 'and' => true, 'at' => true, 'by' => true, 'for' => true, 'from' => true,
        'in' => true, 'into' => true, 'of' => true, 'on' => true, 'or' => true, 'the' => true, 'to' => true, 'with' => true,
        'best' => true, 'overall' => true, 'runner' => true, 'runnerup' => true, 'value' => true, 'top' => true,
        'review' => true, 'reviews' => true, 'comparison' => true, 'comparisons' => true, 'buying' => true, 'guide' => true,
        'guides' => true, 'versus' => true, 'vs' => true, 'side' => true, 'format' => true, 'trusted' => true,
        'story' => true, 'stories' => true, 'amazon' => true, 'www' => true, 'com' => true, 'https' => true,
        'http' => true, 'dp' => true, 'gp' => true, 'product' => true, 'products' => true, 'source' => true, 'url' => true,
        'featured' => true, 'choice' => true, 'pick' => true, 'picks' => true, 'our' => true, 'this' => true,
        'that' => true, 'these' => true, 'those' => true, 'edition' => true, 'model' => true, 'series' => true,
        'pack' => true, 'set' => true, 'piece' => true, 'pcs' => true,
    ];

    $tokens = preg_split('/\s+/', review_generator_normalize_family_text($value)) ?: [];
    $filtered = [];
    foreach ($tokens as $token) {
        $token = trim((string)$token);
        if ($token === '' || strlen($token) < 3 || isset($stopwords[$token]) || preg_match('/^\d+$/', $token)) {
            continue;
        }
        $filtered[] = $token;
    }
    return array_values(array_unique($filtered));
}

function review_generator_family_phrases(array $tokens): array
{
    $phrases = [];
    $count = count($tokens);
    for ($i = 0; $i < $count - 1; $i++) {
        $phrases[] = $tokens[$i] . ' ' . $tokens[$i + 1];
    }
    for ($i = 0; $i < $count - 2; $i++) {
        $phrases[] = $tokens[$i] . ' ' . $tokens[$i + 1] . ' ' . $tokens[$i + 2];
    }
    return array_values(array_unique($phrases));
}

function review_generator_count_intersection(array $left, array $right): int
{
    if (!$left || !$right) {
        return 0;
    }
    return count(array_intersect($left, $right));
}

function review_generator_collect_dominant_family_tokens(array $values): array
{
    $counts = [];
    foreach ($values as $value) {
        foreach (array_unique(review_generator_family_tokens((string)$value)) as $token) {
            $counts[$token] = (int)($counts[$token] ?? 0) + 1;
        }
    }

    arsort($counts);
    return array_values(array_keys(array_filter($counts, static fn($count) => (int)$count >= 2)));
}

function review_generator_titles_share_family(string $candidateText, string $referenceText, string $articleTitle = '', array $dominantTokens = []): bool
{
    $candidateTokens = review_generator_family_tokens($candidateText);
    $referenceTokens = review_generator_family_tokens($referenceText);
    if (!$candidateTokens || !$referenceTokens) {
        return false;
    }

    $candidatePhrases = review_generator_family_phrases($candidateTokens);
    $referencePhrases = review_generator_family_phrases($referenceTokens);
    $articleTokens = review_generator_family_tokens($articleTitle);

    $phraseOverlap = review_generator_count_intersection($candidatePhrases, $referencePhrases);
    $tokenOverlap = review_generator_count_intersection($candidateTokens, $referenceTokens);
    $articleOverlap = review_generator_count_intersection($candidateTokens, $articleTokens);
    $dominantOverlap = review_generator_count_intersection($candidateTokens, array_map('strtolower', $dominantTokens));

    return $phraseOverlap >= 1
        || $tokenOverlap >= 2
        || ($tokenOverlap >= 1 && $dominantOverlap >= 1)
        || $articleOverlap >= 2;
}

function review_generator_filter_products_by_family(array $products, string $articleTitle = ''): array
{
    $products = array_values(array_filter($products, 'is_array'));
    if (count($products) <= 1) {
        return [
            'filtered' => $products,
            'rejected' => [],
            'dominantTokens' => review_generator_collect_dominant_family_tokens(array_merge([$articleTitle], array_map(
                static fn(array $product): string => (string)($product['productName'] ?? ''),
                $products
            ))),
        ];
    }

    $dominantTokens = review_generator_collect_dominant_family_tokens(array_merge([$articleTitle], array_map(
        static fn(array $product): string => (string)($product['productName'] ?? ''),
        $products
    )));

    $adjacency = array_fill(0, count($products), []);
    $bestIndex = 0;
    $bestScore = -1;

    foreach ($products as $index => $product) {
        $score = review_generator_count_intersection(
            review_generator_family_tokens((string)($product['productName'] ?? '')),
            review_generator_family_tokens($articleTitle)
        );

        foreach ($products as $candidateIndex => $candidate) {
            if ($index === $candidateIndex) {
                continue;
            }
            if (review_generator_titles_share_family(
                (string)($product['productName'] ?? ''),
                (string)($candidate['productName'] ?? ''),
                $articleTitle,
                $dominantTokens
            )) {
                $adjacency[$index][] = $candidateIndex;
                $score += 3;
            }
        }

        if ($score > $bestScore) {
            $bestScore = $score;
            $bestIndex = $index;
        }
    }

    $visited = [];
    $stack = [$bestIndex];
    while ($stack) {
        $current = array_pop($stack);
        if (isset($visited[$current])) {
            continue;
        }
        $visited[$current] = true;
        foreach ($adjacency[$current] ?? [] as $next) {
            if (!isset($visited[$next])) {
                $stack[] = $next;
            }
        }
    }

    $filtered = [];
    $rejected = [];
    foreach ($products as $index => $product) {
        if (isset($visited[$index])) {
            $filtered[] = $product;
        } else {
            $rejected[] = $product;
        }
    }

    return [
        'filtered' => $filtered ?: array_slice($products, 0, 1),
        'rejected' => $rejected,
        'dominantTokens' => $dominantTokens,
    ];
}

function review_generator_resolve_products(string $inputType, string $inputValue, array $payload, array $config): array
{
    $asins = [];

    if ($inputType === 'asin') {
        $asins = review_generator_extract_asins_from_text($inputValue);
    } elseif ($inputType === 'url') {
        $parts = review_generator_split_input($inputValue);
        foreach ($parts as $part) {
            $asin = review_generator_extract_asin_from_url($part);
            if ($asin !== null) {
                $asins[] = $asin;
            }
        }
        if (!$asins) {
            $asins = review_generator_extract_asins_from_text($inputValue);
        }
    } elseif ($inputType === 'keyword') {
        $asins = review_generator_search_keyword_asins($inputValue);
    }

    $asins = array_values(array_unique(array_slice($asins, 0, REVIEW_GENERATOR_MAX_PRODUCTS)));
    $products = [];

    if ($asins) {
        foreach ($asins as $index => $asin) {
            $details = review_generator_fetch_product_details($asin, $config);
            if ($details === null) {
                continue;
            }
            $details['id'] = $index + 1;
            $details['isPrimary'] = $index === 0;
            $products[] = $details;
        }
    }

    if (!$products && $inputType === 'keyword') {
        $products = review_generator_search_keyword_products($inputValue, $config);
    }

    if (!$products && $inputType === 'url') {
        $parts = review_generator_split_input($inputValue);
        foreach ($parts as $index => $part) {
            $details = review_generator_scrape_product_page($part, null, review_generator_affiliate_tag($config));
            if ($details === null) {
                continue;
            }
            $details['id'] = $index + 1;
            $details['isPrimary'] = $index === 0;
            $products[] = $details;
        }
    }

    $normalized = [];
    foreach (array_values(array_slice($products, 0, REVIEW_GENERATOR_MAX_PRODUCTS)) as $index => $product) {
        if (!is_array($product)) {
            continue;
        }
        $product['id'] = (int)($product['id'] ?? ($index + 1));
        $product['isPrimary'] = (bool)($product['isPrimary'] ?? ($index === 0));
        $normalized[] = review_generator_repair_product_record($product, $config);
    }

    $articleTitle = trim((string)($payload['title'] ?? $payload['articleTitle'] ?? $payload['sourceKeyword'] ?? $inputValue));
    $family = review_generator_filter_products_by_family($normalized, $articleTitle);
    $filtered = array_values($family['filtered'] ?? []);

    if ($normalized && count($filtered) < min(3, count($normalized))) {
        throw new RuntimeException('Resolved Amazon products do not belong to the same product family.');
    }

    return $filtered;
}

function review_generator_product_name_looks_like_url(string $value): bool
{
    $value = trim($value);
    if ($value === '') {
        return true;
    }

    return (bool)preg_match('#^(?:URL\s*Source:\s*)?https?://#i', $value)
        || (bool)preg_match('#^(?:URL\s*Source:\s*)?www\.#i', $value)
        || stripos($value, 'amazon.com/dp/') !== false;
}

function review_generator_repair_product_record(array $product, array $config): array
{
    $productName = trim((string)($product['productName'] ?? ''));
    $asin = strtoupper(trim((string)($product['asin'] ?? '')));
    if ($asin === '' && !empty($product['url'])) {
        $asin = strtoupper(trim((string)(review_generator_extract_asin_from_url((string)$product['url']) ?? '')));
        if ($asin !== '') {
            $product['asin'] = $asin;
        }
    }

    $needsRepair = review_generator_product_name_looks_like_url($productName)
        || trim((string)($product['imageUrl'] ?? '')) === ''
        || empty($product['features']);

    if ($needsRepair && $asin !== '') {
        $refetched = review_generator_fetch_product_details($asin, $config);
        if (is_array($refetched)) {
            $refetched['id'] = (int)($product['id'] ?? ($refetched['id'] ?? 0));
            $refetched['isPrimary'] = (bool)($product['isPrimary'] ?? ($refetched['isPrimary'] ?? false));
            if (empty($refetched['url'])) {
                $refetched['url'] = review_generator_affiliate_url($asin, review_generator_affiliate_tag($config));
            }
            $product = array_merge($product, $refetched);
        }
    }

    $product['productName'] = review_generator_clean_title(trim((string)($product['productName'] ?? 'Amazon Product')));
    $product['imageUrl'] = review_generator_resolve_product_image_url($product);

    return $product;
}

function review_generator_split_input(string $inputValue): array
{
    $parts = preg_split('/[\r\n,]+/', $inputValue) ?: [];
    $clean = [];
    foreach ($parts as $part) {
        $value = trim((string)$part);
        if ($value !== '') {
            $clean[] = $value;
        }
    }
    return $clean;
}

function review_generator_extract_asins_from_text(string $input): array
{
    preg_match_all('/(?:^|[^A-Z0-9])([A-Z0-9]{10})(?=$|[^A-Z0-9])/i', strtoupper($input), $matches);
    $asins = array_map('trim', $matches[1] ?? []);
    return array_values(array_unique(array_filter($asins, static fn($asin) => strlen($asin) === 10)));
}

function review_generator_extract_asin_from_url(string $url): ?string
{
    $patterns = [
        '/\/dp\/([A-Z0-9]{10})(?:[\/?]|$)/i',
        '/\/gp\/product\/([A-Z0-9]{10})(?:[\/?]|$)/i',
        '/\/product\/([A-Z0-9]{10})(?:[\/?]|$)/i',
        '/(?:[?&](?:ASIN|asin)=)([A-Z0-9]{10})(?:[&#]|$)/i',
    ];

    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $url, $match)) {
            return strtoupper((string)$match[1]);
        }
    }

    $fallback = review_generator_extract_asins_from_text($url);
    return $fallback[0] ?? null;
}

function review_generator_search_keyword_asins(string $keyword): array
{
    $viaJina = review_generator_search_keyword_asins_via_jina($keyword);
    if ($viaJina) {
        return $viaJina;
    }

    $searchUrl = 'https://www.amazon.com/s?k=' . rawurlencode($keyword);
    $response = review_generator_http_get($searchUrl);
    $html = (string)($response['body'] ?? '');
    if ($html === '') {
        return [];
    }

    preg_match_all('/data-asin="([A-Z0-9]{10})"/i', $html, $matches);
    $asins = [];
    foreach ($matches[1] ?? [] as $asin) {
        $asin = strtoupper(trim((string)$asin));
        if ($asin !== '' && !in_array($asin, $asins, true)) {
            $asins[] = $asin;
        }
        if (count($asins) >= REVIEW_GENERATOR_MAX_PRODUCTS) {
            break;
        }
    }

    if (!$asins) {
        preg_match_all('/\/dp\/([A-Z0-9]{10})(?:[\/?]|$)/i', $html, $matches);
        foreach ($matches[1] ?? [] as $asin) {
            $asin = strtoupper(trim((string)$asin));
            if ($asin !== '' && !in_array($asin, $asins, true)) {
                $asins[] = $asin;
            }
            if (count($asins) >= REVIEW_GENERATOR_MAX_PRODUCTS) {
                break;
            }
        }
    }

    return $asins;
}

function review_generator_search_keyword_asins_via_jina(string $keyword): array
{
    $url = 'https://r.jina.ai/http://https://www.amazon.com/s?k=' . rawurlencode($keyword);
    $response = review_generator_http_request($url, 'GET', ['Accept: text/plain']);
    $body = (string)($response['body'] ?? '');
    if ($body === '') {
        return [];
    }

    preg_match_all('/\/dp\/([A-Z0-9]{10})/i', $body, $matches);
    $asins = [];
    foreach ($matches[1] ?? [] as $asin) {
        $asin = strtoupper(trim((string)$asin));
        if ($asin !== '' && !in_array($asin, $asins, true)) {
            $asins[] = $asin;
        }
        if (count($asins) >= REVIEW_GENERATOR_MAX_PRODUCTS) {
            break;
        }
    }

    return $asins;
}

function review_generator_search_keyword_products(string $keyword, array $config): array
{
    $asins = review_generator_search_keyword_asins($keyword);
    $products = [];
    foreach ($asins as $index => $asin) {
        $details = review_generator_fetch_product_details($asin, $config);
        if ($details === null) {
            continue;
        }
        $details['id'] = $index + 1;
        $details['isPrimary'] = $index === 0;
        $products[] = $details;
    }
    return $products;
}

function review_generator_fetch_product_details(string $asin, array $config): ?array
{
    $associateTag = review_generator_affiliate_tag($config);

    try {
        $fromPaapi = review_generator_fetch_product_via_paapi($asin, $config);
        if ($fromPaapi !== null) {
            $fromPaapi['asin'] = $asin;
            $fromPaapi['url'] = review_generator_affiliate_url($asin, $associateTag);
            return $fromPaapi;
        }
    } catch (Throwable $e) {
        // Fall through to scraping; invalid or expired keys should not block generation.
    }

    $fromJina = review_generator_fetch_product_via_jina($asin, $associateTag);
    if ($fromJina !== null) {
        return $fromJina;
    }

    return review_generator_scrape_product_page(
        review_generator_affiliate_url($asin, $associateTag),
        $asin,
        $associateTag
    );
}

function review_generator_fetch_product_via_jina(string $asin, string $associateTag): ?array
{
    $url = 'https://r.jina.ai/http://https://www.amazon.com/dp/' . rawurlencode($asin);
    $response = review_generator_http_request($url, 'GET', ['Accept: text/plain']);
    $body = trim((string)($response['body'] ?? ''));
    if ($body === '' || stripos($body, 'Title:') === false) {
        return null;
    }

    $title = '';
    if (preg_match('/^Title:\s*(.+)$/mi', $body, $match)) {
        $title = trim((string)$match[1]);
    }
    $title = review_generator_clean_title($title);
    if ($title === '' || strcasecmp($title, 'Amazon.com') === 0) {
        return null;
    }

    $features = review_generator_extract_jina_features($body);
    $price = review_generator_extract_jina_price($body);
    $imageUrl = review_generator_extract_jina_image($body);

    $specs = [];
    foreach (array_slice($features, 0, 6) as $feature) {
        $spec = review_generator_spec_from_line($feature);
        if ($spec !== null) {
            $specs[] = $spec;
        }
    }

    return [
        'asin' => $asin,
        'productName' => $title,
        'price' => $price,
        'features' => $features,
        'description' => implode(' ', array_slice($features, 0, 3)),
        'imageUrl' => $imageUrl,
        'variantImages' => [],
        'specs' => $specs,
        'url' => review_generator_affiliate_url($asin, $associateTag),
    ];
}

function review_generator_extract_jina_features(string $body): array
{
    $lines = preg_split('/\r?\n/', $body) ?: [];
    $capturing = false;
    $features = [];

    foreach ($lines as $line) {
        $trimmed = trim($line);
        if ($trimmed === 'About this item') {
            $capturing = true;
            continue;
        }

        if (!$capturing) {
            continue;
        }

        if ($trimmed === '' || preg_match('/^(Customers who viewed|Videos for similar products|Product information|Important information|Customer reviews)/i', $trimmed)) {
            if ($features) {
                break;
            }
            continue;
        }

        if (preg_match('/^\*\s+(.*)$/', $trimmed, $match)) {
            $feature = trim((string)$match[1]);
            $feature = preg_replace('/\[[^\]]+\]\([^)]+\)/', '', $feature) ?? $feature;
            $feature = preg_replace('/\s+/', ' ', $feature) ?? $feature;
            $feature = trim($feature, " \t\n\r\0\x0B•");
            if ($feature !== '' && stripos($feature, 'See more product details') === false) {
                $features[] = $feature;
            }
        } elseif ($features) {
            break;
        }
    }

    return array_values(array_slice($features, 0, 6));
}

function review_generator_extract_jina_price(string $body): string
{
    if (preg_match('/Price[^\n]*\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/i', $body, $match)) {
        return '$' . trim((string)$match[1]);
    }

    if (preg_match('/\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/', $body, $match)) {
        return '$' . trim((string)$match[1]);
    }

    return '';
}

function review_generator_extract_jina_image(string $body): string
{
    preg_match_all('/https:\/\/m\.media-amazon\.com\/images\/I\/[^)\s]+/i', $body, $matches);
    $urls = $matches[0] ?? [];
    foreach ($urls as $url) {
        $candidate = trim((string)$url);
        if ($candidate !== '' && stripos($candidate, '_AC_') !== false) {
            return $candidate;
        }
    }
    foreach ($urls as $url) {
        $candidate = trim((string)$url);
        if ($candidate !== '') {
            return $candidate;
        }
    }
    return '';
}

function review_generator_clean_title(string $title): string
{
    $title = trim($title);
    $title = preg_replace('/^Amazon\.com:\s*/i', '', $title) ?? $title;
    $title = preg_replace('/^Amazon\.com\s*-\s*/i', '', $title) ?? $title;
    $title = preg_replace('/^URL\s*Source:\s*/i', '', $title) ?? $title;
    $title = preg_replace('/\s+-\s+Amazon.*$/i', '', $title) ?? $title;
    $title = preg_replace('/:\s*(Home\s*&\s*Kitchen|Electronics|Kitchen\s*&\s*Dining|Tools\s*&\s*Home\s*Improvement|Sports\s*&\s*Outdoors|Health\s*&\s*Household|Office\s*Products|Industrial\s*&\s*Scientific)\s*$/i', '', $title) ?? $title;
    return trim($title);
}

function review_generator_affiliate_tag(array $config): string
{
    $tag = trim((string)($config['AMAZON_ASSOCIATE_TAG'] ?? ''));
    return $tag !== '' ? $tag : 'postgeniuspro-20';
}

function review_generator_affiliate_url(string $asin, string $associateTag): string
{
    $url = 'https://www.amazon.com/dp/' . rawurlencode($asin);
    if ($associateTag !== '') {
        $url .= '?tag=' . rawurlencode($associateTag);
    }
    return $url;
}

function review_generator_fetch_product_via_paapi(string $asin, array $config): ?array
{
    $accessKey = trim((string)($config['AMAZON_PAAPI_ACCESS_KEY'] ?? ''));
    $secretKey = trim((string)($config['AMAZON_PAAPI_SECRET_KEY'] ?? ''));
    $associateTag = review_generator_affiliate_tag($config);
    if ($accessKey === '' || $secretKey === '' || $associateTag === '') {
        return null;
    }

    $host = 'webservices.amazon.com';
    $region = 'us-east-1';
    $service = 'ProductAdvertisingAPI';
    $path = '/paapi5/getitems';
    $target = 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems';
    $amzDate = gmdate('Ymd\THis\Z');
    $dateStamp = gmdate('Ymd');

    $payload = [
        'ItemIds' => [$asin],
        'PartnerTag' => $associateTag,
        'PartnerType' => 'Associates',
        'Resources' => [
            'ItemInfo.Title',
            'ItemInfo.Features',
            'ItemInfo.ProductInfo',
            'ItemInfo.ByLineInfo',
            'Offers.Listings.Price',
            'Images.Primary.Large',
            'Images.Variants.Large',
        ],
        'Marketplace' => 'www.amazon.com',
    ];
    $payloadJson = json_encode($payload, JSON_UNESCAPED_SLASHES);

    $canonicalHeaders = "host:$host\nx-amz-date:$amzDate\nx-amz-target:$target\n";
    $signedHeaders = 'host;x-amz-date;x-amz-target';
    $canonicalRequest = "POST\n$path\n\n$canonicalHeaders\n$signedHeaders\n" . hash('sha256', $payloadJson);
    $credentialScope = "$dateStamp/$region/$service/aws4_request";
    $stringToSign = "AWS4-HMAC-SHA256\n$amzDate\n$credentialScope\n" . hash('sha256', $canonicalRequest);
    $signingKey = review_generator_aws_signing_key($secretKey, $dateStamp, $region, $service);
    $signature = hash_hmac('sha256', $stringToSign, $signingKey);
    $authorization = 'AWS4-HMAC-SHA256 Credential=' . $accessKey . '/' . $credentialScope
        . ', SignedHeaders=' . $signedHeaders
        . ', Signature=' . $signature;

    $response = review_generator_http_request('https://' . $host . $path, 'POST', [
        'Content-Type: application/json; charset=utf-8',
        'X-Amz-Date: ' . $amzDate,
        'X-Amz-Target: ' . $target,
        'Authorization: ' . $authorization,
    ], $payloadJson);

    $status = (int)($response['status'] ?? 0);
    if ($status < 200 || $status >= 300) {
        return null;
    }

    $decoded = json_decode((string)($response['body'] ?? ''), true);
    $item = $decoded['ItemsResult']['Items'][0] ?? null;
    if (!is_array($item)) {
        return null;
    }

    $features = array_values(array_filter(array_map('trim', $item['ItemInfo']['Features']['DisplayValues'] ?? [])));
    $image = $item['Images']['Primary']['Large']['URL'] ?? null;
    $variants = [];
    foreach ($item['Images']['Variants'] ?? [] as $variant) {
        $url = $variant['Large']['URL'] ?? null;
        if (is_string($url) && trim($url) !== '') {
            $variants[] = trim($url);
        }
    }

    $specs = [];
    foreach ($features as $feature) {
        $spec = review_generator_spec_from_line($feature);
        if ($spec !== null) {
            $specs[] = $spec;
        }
        if (count($specs) >= 5) {
            break;
        }
    }

    $descriptionParts = [];
    $brand = trim((string)($item['ItemInfo']['ByLineInfo']['Brand']['DisplayValue'] ?? ''));
    if ($brand !== '') {
        $descriptionParts[] = 'Brand: ' . $brand;
    }
    foreach (array_slice($features, 0, 3) as $feature) {
        $descriptionParts[] = $feature;
    }

    return [
        'asin' => $asin,
        'productName' => review_generator_clean_title(trim((string)($item['ItemInfo']['Title']['DisplayValue'] ?? 'Amazon Product'))),
        'price' => trim((string)($item['Offers']['Listings'][0]['Price']['DisplayAmount'] ?? '')),
        'features' => $features,
        'description' => implode(' ', $descriptionParts),
        'imageUrl' => is_string($image) ? trim($image) : '',
        'variantImages' => $variants,
        'specs' => $specs,
    ];
}

function review_generator_aws_signing_key(string $secretKey, string $dateStamp, string $region, string $service): string
{
    $kDate = hash_hmac('sha256', $dateStamp, 'AWS4' . $secretKey, true);
    $kRegion = hash_hmac('sha256', $region, $kDate, true);
    $kService = hash_hmac('sha256', $service, $kRegion, true);
    return hash_hmac('sha256', 'aws4_request', $kService, true);
}

function review_generator_scrape_product_page(string $url, ?string $asin, string $associateTag): ?array
{
    $response = review_generator_http_get($url);
    $html = (string)($response['body'] ?? '');
    if (trim($html) === '' || strlen($html) < 800) {
        return null;
    }

    $title = review_generator_dom_text($html, [
        '//*[@id="productTitle"]',
        '//meta[@property="og:title"]/@content',
        '//title',
    ]);
    $title = review_generator_clean_title($title);
    if ($title === '') {
        return null;
    }

    $price = review_generator_dom_text($html, [
        '//*[@id="corePriceDisplay_desktop_feature_div"]//span[contains(@class,"a-offscreen")]',
        '//*[@id="corePrice_feature_div"]//span[contains(@class,"a-offscreen")]',
        '//*[@id="priceblock_ourprice"]',
        '//*[@id="priceblock_dealprice"]',
    ]);

    $features = review_generator_dom_text_list($html, [
        '//*[@id="feature-bullets"]//li//span[contains(@class,"a-list-item")]',
        '//*[@id="productFactsDesktopExpander"]//li',
    ]);
    $features = array_values(array_filter(array_map(static function ($line) {
        $line = preg_replace('/\s+/', ' ', trim((string)$line)) ?? '';
        if ($line === '' || stripos($line, 'make sure this fits') !== false) {
            return null;
        }
        return $line;
    }, $features)));

    $imageUrl = review_generator_dom_text($html, ['//meta[@property="og:image"]/@content']);
    if ($imageUrl === '') {
        if (preg_match('/data-old-hires="([^"]+)"/i', $html, $match)) {
            $imageUrl = html_entity_decode((string)$match[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
        } elseif (preg_match('/"hiRes":"([^"]+)"/i', $html, $match)) {
            $imageUrl = stripcslashes((string)$match[1]);
        } elseif (preg_match('/"large":"([^"]+)"/i', $html, $match)) {
            $imageUrl = stripcslashes((string)$match[1]);
        }
    }
    $imageUrl = str_replace('\u002F', '/', trim((string)$imageUrl));

    $inferredAsin = $asin ?: review_generator_extract_asin_from_url($url);
    $specs = [];
    foreach (array_slice($features, 0, 6) as $feature) {
        $spec = review_generator_spec_from_line($feature);
        if ($spec !== null) {
            $specs[] = $spec;
        }
    }

    return [
        'asin' => $inferredAsin,
        'productName' => $title,
        'price' => trim((string)$price),
        'features' => $features,
        'description' => implode(' ', array_slice($features, 0, 3)),
        'imageUrl' => $imageUrl,
        'variantImages' => [],
        'specs' => $specs,
        'url' => $inferredAsin ? review_generator_affiliate_url($inferredAsin, $associateTag) : $url,
    ];
}

function review_generator_http_get(string $url): array
{
    return review_generator_http_request($url, 'GET', [
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language: en-US,en;q=0.9',
        'Cache-Control: no-cache',
        'Pragma: no-cache',
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    ]);
}

function review_generator_http_request(string $url, string $method, array $headers = [], ?string $body = null): array
{
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 40);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, strtoupper($method));
    curl_setopt($ch, CURLOPT_ENCODING, '');
    if ($headers) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    }
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }

    $rawBody = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    return [
        'status' => $status,
        'body' => is_string($rawBody) ? $rawBody : '',
        'error' => $error,
    ];
}

function review_generator_dom_text(string $html, array $queries): string
{
    if (!class_exists(DOMDocument::class)) {
        return '';
    }

    $dom = new DOMDocument();
    libxml_use_internal_errors(true);
    $loaded = $dom->loadHTML($html);
    libxml_clear_errors();
    if (!$loaded) {
        return '';
    }

    $xpath = new DOMXPath($dom);
    foreach ($queries as $query) {
        $nodes = $xpath->query($query);
        if (!$nodes || $nodes->length === 0) {
            continue;
        }
        $value = trim((string)$nodes->item(0)->textContent);
        if ($value !== '') {
            return preg_replace('/\s+/', ' ', $value) ?? $value;
        }
    }

    return '';
}

function review_generator_dom_text_list(string $html, array $queries): array
{
    if (!class_exists(DOMDocument::class)) {
        return [];
    }

    $dom = new DOMDocument();
    libxml_use_internal_errors(true);
    $loaded = $dom->loadHTML($html);
    libxml_clear_errors();
    if (!$loaded) {
        return [];
    }

    $xpath = new DOMXPath($dom);
    foreach ($queries as $query) {
        $nodes = $xpath->query($query);
        if (!$nodes || $nodes->length === 0) {
            continue;
        }
        $items = [];
        foreach ($nodes as $node) {
            $value = trim((string)$node->textContent);
            if ($value !== '') {
                $items[] = preg_replace('/\s+/', ' ', $value) ?? $value;
            }
        }
        if ($items) {
            return $items;
        }
    }

    return [];
}

function review_generator_spec_from_line(string $line): ?array
{
    $line = trim($line);
    if ($line === '') {
        return null;
    }

    if (strpos($line, ':') !== false) {
        [$key, $value] = array_map('trim', explode(':', $line, 2));
        if ($key !== '' && $value !== '') {
            return ['key' => $key, 'value' => $value];
        }
    }

    return null;
}

function review_generator_build_article_plan(array $products, string $inputType, string $inputValue, array $payload, array $config): array
{
    $fallback = review_generator_fallback_plan($products, $inputType, $inputValue, $payload);
    $apiKey = trim((string)($config['NVIDIA_API_KEY'] ?? ''));
    if ($apiKey === '') {
        return $fallback;
    }

    $model = trim((string)($config['NVIDIA_CHAT_MODEL_ID'] ?? 'qwen/qwen3.5-397b-a17b'));
    if ($model !== '' && strpos($model, '/') === false) {
        $model = 'qwen/' . $model;
    }

    $prompt = review_generator_plan_prompt($products, $inputType, $inputValue, $fallback);
    $response = review_generator_http_request('https://integrate.api.nvidia.com/v1/chat/completions', 'POST', [
        'Authorization: Bearer ' . $apiKey,
        'Accept: application/json',
        'Content-Type: application/json',
    ], json_encode([
        'model' => $model,
        'messages' => [
            [
                'role' => 'system',
                'content' => 'You are the lead affiliate editor for Postgenius Pro. Return only valid JSON with the exact shape requested by the user prompt. Do not wrap the JSON in markdown.',
            ],
            [
                'role' => 'user',
                'content' => $prompt,
            ],
        ],
        'max_tokens' => 4096,
        'temperature' => 0.5,
        'top_p' => 0.9,
        'stream' => false,
    ], JSON_UNESCAPED_SLASHES));

    $status = (int)($response['status'] ?? 0);
    if ($status < 200 || $status >= 300) {
        return $fallback;
    }

    $decoded = json_decode((string)($response['body'] ?? ''), true);
    $content = $decoded['choices'][0]['message']['content'] ?? '';
    if (is_array($content)) {
        $content = '';
    }
    $parsed = review_generator_decode_json_block((string)$content);
    if (!is_array($parsed)) {
        return $fallback;
    }

    return review_generator_merge_plan_with_fallback($parsed, $fallback, count($products));
}

function review_generator_plan_prompt(array $products, string $inputType, string $inputValue, array $fallback): string
{
    $productLines = [];
    foreach ($products as $index => $product) {
        $productLines[] = [
            'productIndex' => $index + 1,
            'title' => $product['productName'] ?? '',
            'price' => $product['price'] ?? '',
            'features' => array_slice($product['features'] ?? [], 0, 5),
        ];
    }

    return review_generator_json_string([
        'task' => 'Create a structured Amazon Multi-ASIN Master article plan for Postgenius Pro.',
        'inputType' => $inputType,
        'inputValue' => $inputValue,
        'products' => $productLines,
        'fallbackTitle' => $fallback['title'],
        'returnShape' => [
            'title' => 'string',
            'category' => 'string',
            'focusKeyphrase' => 'string',
            'metaTitle' => 'string',
            'metaDescription' => 'string',
            'introduction' => ['paragraph 1', 'paragraph 2'],
            'whyChoose' => ['paragraph 1', 'paragraph 2'],
            'howToChoose' => ['paragraph 1', 'paragraph 2'],
            'productReviews' => [[
                'productIndex' => 1,
                'summary' => '2-4 sentence review summary',
                'pros' => ['item 1', 'item 2', 'item 3'],
                'cons' => ['item 1', 'item 2'],
                'tradeoff' => 'single sentence tradeoff',
                'badge' => 'Best Overall',
            ]],
            'faq' => [[
                'question' => 'string',
                'answer' => 'string',
            ]],
            'conclusion' => ['paragraph 1', 'paragraph 2'],
            'tags' => ['tag-1', 'tag-2', 'tag-3'],
        ],
        'rules' => [
            'Write for a premium review magazine, not for an AI tool.',
            'Stay aligned to the provided Amazon products only.',
            'Use factual phrasing and avoid fake testing claims.',
            'Return valid JSON only with no commentary.',
        ],
    ]);
}

function review_generator_decode_json_block(string $content): ?array
{
    $content = trim($content);
    if ($content === '') {
        return null;
    }

    $decoded = json_decode($content, true);
    if (is_array($decoded)) {
        return $decoded;
    }

    $start = strpos($content, '{');
    $end = strrpos($content, '}');
    if ($start === false || $end === false || $end <= $start) {
        return null;
    }

    $snippet = substr($content, $start, $end - $start + 1);
    $decoded = json_decode($snippet, true);
    return is_array($decoded) ? $decoded : null;
}

function review_generator_merge_plan_with_fallback(array $plan, array $fallback, int $productCount): array
{
    $merged = $fallback;
    foreach (['title', 'category', 'focusKeyphrase', 'metaTitle', 'metaDescription'] as $field) {
        $value = trim((string)($plan[$field] ?? ''));
        if ($value !== '') {
            $merged[$field] = $value;
        }
    }

    foreach (['introduction', 'whyChoose', 'howToChoose', 'conclusion', 'tags'] as $field) {
        if (!empty($plan[$field]) && is_array($plan[$field])) {
            $merged[$field] = array_values(array_filter(array_map(static function ($item) {
                return trim((string)$item);
            }, $plan[$field])));
        }
    }

    if (!empty($plan['faq']) && is_array($plan['faq'])) {
        $faq = [];
        foreach ($plan['faq'] as $item) {
            if (!is_array($item)) {
                continue;
            }
            $question = trim((string)($item['question'] ?? ''));
            $answer = trim((string)($item['answer'] ?? ''));
            if ($question !== '' && $answer !== '') {
                $faq[] = ['question' => $question, 'answer' => $answer];
            }
        }
        if ($faq) {
            $merged['faq'] = $faq;
        }
    }

    if (!empty($plan['productReviews']) && is_array($plan['productReviews'])) {
        $reviews = [];
        foreach ($plan['productReviews'] as $item) {
            if (!is_array($item)) {
                continue;
            }
            $index = max(1, min($productCount, (int)($item['productIndex'] ?? 0)));
            if ($index <= 0) {
                continue;
            }
            $reviews[$index] = [
                'summary' => trim((string)($item['summary'] ?? '')),
                'pros' => array_values(array_filter(array_map('trim', $item['pros'] ?? []))),
                'cons' => array_values(array_filter(array_map('trim', $item['cons'] ?? []))),
                'tradeoff' => trim((string)($item['tradeoff'] ?? '')),
                'badge' => trim((string)($item['badge'] ?? '')),
            ];
        }
        if ($reviews) {
            $merged['productReviews'] = $reviews;
        }
    }

    return $merged;
}

function review_generator_fallback_plan(array $products, string $inputType, string $inputValue, array $payload): array
{
    $category = review_generator_guess_category($products, $inputValue, $payload);
    $focus = review_generator_focus_keyphrase($products, $inputValue);
    $title = review_generator_default_title($products, $focus);

    $productNames = array_map(static fn($p) => trim((string)($p['productName'] ?? '')), $products);
    $joinedNames = implode(', ', array_slice($productNames, 0, 3));

    $reviews = [];
    foreach ($products as $index => $product) {
        $features = array_slice($product['features'] ?? [], 0, 4);
        $pros = $features ?: ['Reliable everyday performance', 'Strong value for the feature set'];
        $cons = [];
        if (count($features) > 2) {
            $cons[] = 'Feature overlap with other options in this comparison';
        }
        $cons[] = 'Best fit depends on your budget and preferred feature mix';

        $reviews[$index + 1] = [
            'summary' => review_generator_default_summary($product, $index),
            'pros' => array_slice($pros, 0, 3),
            'cons' => array_slice($cons, 0, 2),
            'tradeoff' => 'The right choice depends on whether you want the most features, the strongest value, or the simplest setup.',
            'badge' => review_generator_rank_label($index),
        ];
    }

    return [
        'title' => $title,
        'category' => $category,
        'focusKeyphrase' => $focus,
        'metaTitle' => review_generator_truncate($title . ' | Postgenius Pro', 60),
        'metaDescription' => review_generator_truncate(
            'Compare ' . $joinedNames . ' with a fast buyer-focused breakdown of features, price, and value so you can choose the right fit.',
            155
        ),
        'introduction' => [
            'This comparison looks at the most relevant options for ' . strtolower($focus) . ' so buyers can quickly understand the tradeoffs before purchasing.',
            'We focus on practical value, standout features, and the differences that matter most when narrowing down the right pick.',
        ],
        'whyChoose' => [
            'Reviewing products side by side makes it easier to spot where one option delivers better value, stronger convenience, or a more focused feature set.',
            'Instead of chasing every specification, the goal is to identify which product best matches the way you will actually use it.',
        ],
        'howToChoose' => [
            'Start by defining your must-have features, then remove options that do not cover those basics before comparing price.',
            'After that, look at the strongest differentiators such as capacity, ease of use, build quality, and how confidently each product fits your routine.',
        ],
        'productReviews' => $reviews,
        'faq' => [
            [
                'question' => 'Which option is best for most buyers?',
                'answer' => 'The best overall pick is usually the product with the most balanced mix of performance, ease of use, and day-to-day value.',
            ],
            [
                'question' => 'Should price decide the purchase by itself?',
                'answer' => 'Price matters, but it should only be compared after you confirm the product covers your must-have features and use case.',
            ],
            [
                'question' => 'How often should I re-check pricing before buying?',
                'answer' => 'Amazon pricing can change quickly, so it is smart to re-check the listing right before you place the order.',
            ],
        ],
        'conclusion' => [
            'The best pick in this comparison depends on whether you prioritize top-end features, stronger value, or the simplest ownership experience.',
            'If you start with your real use case and budget, the right choice becomes much easier to spot.',
        ],
        'tags' => array_values(array_unique(array_filter([
            strtolower(str_replace(' ', '-', $category)),
            strtolower(str_replace(' ', '-', $focus)),
            'amazon-review',
            'buying-guide',
        ]))),
    ];
}

function review_generator_guess_category(array $products, string $inputValue, array $payload): string
{
    $source = strtolower(trim((string)($payload['nicheTag'] ?? '')));
    if ($source === '') {
        $source = strtolower($inputValue . ' ' . implode(' ', array_map(static fn($p) => (string)($p['productName'] ?? ''), $products)));
    }

    if (preg_match('/air fryer|coffee|kitchen|blender|cook|mixer|grill|toaster|espresso|fryer|oven|vacuum sealer/', $source)) {
        return 'Kitchen Gear';
    }
    if (preg_match('/camera|speaker|headphone|earbud|monitor|laptop|smart|tv|router|security|microphone|charger/', $source)) {
        return 'Electronics';
    }
    if (preg_match('/mattress|humidifier|vacuum|cleaner|lamp|bedding|storage|home|chair|desk/', $source)) {
        return 'Home Essentials';
    }
    return 'Best Deals';
}

function review_generator_focus_keyphrase(array $products, string $inputValue): string
{
    $inputValue = trim($inputValue);
    $looksLikeUrl = (bool)preg_match('#^(https?:)?//#i', $inputValue)
        || stripos($inputValue, 'www.') === 0
        || stripos($inputValue, 'amazon.com/') !== false
        || stripos($inputValue, '/dp/') !== false;
    if ($inputValue !== '' && !$looksLikeUrl && !preg_match('/^[A-Z0-9,\s-]{10,}$/i', $inputValue)) {
        return review_generator_truncate($inputValue, 55);
    }

    $first = trim((string)($products[0]['productName'] ?? 'Amazon product comparison'));
    $first = preg_replace('/^URL\s*Source:\s*/i', '', $first) ?? $first;
    $first = preg_replace('/^Amazon\.com\s*-\s*/i', '', $first) ?? $first;
    $first = preg_replace('/\b(?:review|comparison|amazon|edition)\b/i', '', $first) ?? $first;
    return review_generator_truncate(trim($first), 55);
}

function review_generator_default_title(array $products, string $focus): string
{
    if (count($products) > 1) {
        return 'Best ' . $focus . ': Side-by-Side Comparison and Buying Guide';
    }
    return $products[0]['productName'] . ' Review: What Buyers Need to Know';
}

function review_generator_default_summary(array $product, int $index): string
{
    $name = trim((string)($product['productName'] ?? 'This option'));
    $features = array_slice($product['features'] ?? [], 0, 2);
    $featureLine = $features ? implode(' ', $features) : 'It stands out for buyers who want a dependable option with a practical feature set.';
    return $name . ' is our ' . strtolower(review_generator_rank_label($index)) . ' pick because ' . review_generator_truncate($featureLine, 180);
}

function review_generator_rank_label(int $index): string
{
    if ($index === 0) return 'Best Overall';
    if ($index === 1) return 'Runner-Up';
    if ($index === 2) return 'Best Value';
    return 'Top Pick';
}

function review_generator_truncate(string $value, int $max): string
{
    $value = trim($value);
    if ($value === '') {
        return '';
    }

    if (function_exists('mb_strlen') && function_exists('mb_substr')) {
        if (mb_strlen($value) <= $max) {
            return $value;
        }
        return rtrim(mb_substr($value, 0, $max - 1)) . '…';
    }

    if (strlen($value) <= $max) {
        return $value;
    }
    return rtrim(substr($value, 0, $max - 1)) . '…';
}

function review_generator_build_article_record(PDO $conn, string $ownerId, array $products, array $plan, string $associateTag, array $config): array
{
    $articleId = review_generator_uuid_v4();
    $slug = generate_unique_slug($conn, (string)$plan['title'], $articleId);
    $heroPrompt = review_generator_build_hero_prompt($products, $plan);
    $heroImage = review_generator_generate_hero_image($articleId, $heroPrompt, $config);
    $lifestyleImages = review_generator_generate_lifestyle_images($articleId, $products, $plan, $config);
    $products = review_generator_host_product_images($articleId, $products, $config);
    if ($heroImage === null || trim($heroImage) === '') {
        $heroImage = trim((string)($lifestyleImages[0]['url'] ?? ''));
    }
    review_generator_assert_required_review_assets($heroImage, $lifestyleImages, $products);
    $generatedHtml = review_generator_build_html($products, $plan, $heroImage, $associateTag);
    $content = review_generator_build_content_payload($products, $plan, $generatedHtml, $heroImage, $heroPrompt, $lifestyleImages);
    $imageSource = 'placeholder';
    if ($heroImage) {
        $imageSource = stripos($heroImage, '/api/uploads/') !== false ? 'ai_editorial' : 'amazon_paapi';
    }

    return [
        'id' => $articleId,
        'user_id' => $ownerId,
        'title' => (string)$plan['title'],
        'slug' => $slug,
        'blueprint_type' => 'review',
        'content' => review_generator_json_string($content),
        'generated_html' => $generatedHtml,
        'image_url' => $heroImage,
        'image_prompt' => $heroPrompt,
        'image_source' => $imageSource,
        'category' => (string)$plan['category'],
        'tags' => review_generator_json_string(array_values(array_unique(array_filter(array_map('strval', $plan['tags'] ?? []))))),
        'seo' => review_generator_json_string([
            'metaTitle' => (string)$plan['metaTitle'],
            'metaDescription' => (string)$plan['metaDescription'],
            'focusKeyphrase' => (string)$plan['focusKeyphrase'],
        ]),
        'status' => 'Awaiting Admin Review',
        'style_config' => null,
    ];
}

function review_generator_pick_hero_image(array $products): ?string
{
    foreach ($products as $product) {
        $image = review_generator_resolve_product_image_url($product);
        if ($image !== '') {
            return $image;
        }
    }
    return null;
}

function review_generator_build_hero_prompt(array $products, array $plan): string
{
    $primary = $products[0] ?? [];
    $primaryName = trim((string)($primary['productName'] ?? ($plan['focusKeyphrase'] ?? 'Amazon product')));
    $category = trim((string)($plan['category'] ?? 'Product Reviews'));
    $title = trim((string)($plan['title'] ?? $primaryName));

    return trim(
        'Premium editorial lifestyle product photography of ' . $primaryName . '. ' .
        'Scene: a refined modern home setting aligned with ' . $category . ', soft natural light, realistic materials, clean styling, luxury magazine composition. ' .
        'The product is the clear hero subject, centered with balanced negative space, no text, no collage, no people, no hands. ' .
        'Designed as a high-end blog cover image for the article "' . $title . '".'
    );
}

function review_generator_generate_editorial_image(string $articleId, string $prompt, array $config, string $filenamePrefix = 'hero'): ?string
{
    $prompt = trim($prompt);
    if ($prompt === '') {
        return null;
    }

    $gatewayBase = trim((string)($config['IMAGE_GATEWAY_URL'] ?? ''));
    if ($gatewayBase === '') {
        $gatewayBase = 'https://postgenius-ai-gateway.larbilife.workers.dev';
    }

    $gatewayUrl = $gatewayBase
        . '?prompt=' . rawurlencode($prompt)
        . '&style=' . rawurlencode('commercial')
        . '&width=1600&height=900';

    $response = review_generator_http_request($gatewayUrl, 'GET', [
        'Accept: image/*,*/*;q=0.8',
        'User-Agent: PostGeniusPro-Automation/1.0',
    ]);

    $status = (int)($response['status'] ?? 0);
    $body = (string)($response['body'] ?? '');
    if ($status >= 200 && $status < 300 && $body !== '' && !review_generator_response_looks_like_html($body)) {
        return review_generator_store_generated_image($articleId, $body, $filenamePrefix . '_' . substr(sha1($prompt), 0, 12) . '.png');
    }

    $binary = review_generator_generate_hero_image_via_nvidia($prompt, $config);
    if ($binary === null || $binary === '') {
        return null;
    }

    return review_generator_store_generated_image($articleId, $binary, $filenamePrefix . '_' . substr(sha1($prompt), 0, 12) . '.png');
}

function review_generator_generate_hero_image(string $articleId, string $prompt, array $config): ?string
{
    return review_generator_generate_editorial_image($articleId, $prompt, $config, 'hero');
}

function review_generator_generate_lifestyle_images(string $articleId, array $products, array $plan, array $config): array
{
    $images = [];
    foreach (array_slice($products, 0, 3) as $index => $product) {
        $prompt = review_generator_build_lifestyle_prompt($product, $plan, $index);
        $imageUrl = review_generator_generate_editorial_image($articleId, $prompt, $config, 'lifestyle_' . ($index + 1));
        if ($imageUrl === null || trim($imageUrl) === '') {
            continue;
        }

        $images[] = [
            'url' => $imageUrl,
            'productId' => (int)($product['id'] ?? ($index + 1)),
            'rank' => $index + 1,
            'title' => (string)($product['productName'] ?? ('Product ' . ($index + 1))),
        ];
    }

    return $images;
}

function review_generator_build_lifestyle_prompt(array $product, array $plan, int $index): string
{
    $productName = trim((string)($product['productName'] ?? ('Amazon product ' . ($index + 1))));
    $category = trim((string)($plan['category'] ?? 'Product Reviews'));
    $title = trim((string)($plan['title'] ?? $productName));
    $featureBits = array_slice(array_values(array_filter(array_map('strval', $product['features'] ?? []))), 0, 2);
    $featureContext = $featureBits !== [] ? ('Key context: ' . implode('; ', $featureBits) . '. ') : '';

    return trim(
        'Premium editorial lifestyle photography of ' . $productName . '. ' .
        'Scene: realistic ' . $category . ' environment with the product naturally styled in use, soft natural light, premium magazine composition, clean negative space. ' .
        $featureContext .
        'Designed for the article "' . $title . '". ' .
        'Photorealistic, no text, no watermark, no collage, no logos, no packaging close-up dominance.'
    );
}

function review_generator_response_looks_like_html(string $body): bool
{
    $sample = ltrim(substr($body, 0, 256));
    return $sample !== '' && (
        stripos($sample, '<!DOCTYPE html') === 0 ||
        stripos($sample, '<html') === 0 ||
        stripos($sample, '<head') === 0 ||
        stripos($sample, '<body') === 0
    );
}

function review_generator_generate_hero_image_via_nvidia(string $prompt, array $config): ?string
{
    $apiKey = trim((string)($config['NVIDIA_API_KEY'] ?? ''));
    if ($apiKey === '') {
        return null;
    }

    $prompt = trim($prompt);
    if ($prompt === '') {
        return null;
    }

    $negativePrompt = 'cartoon, anime, illustration, cgi, render, plastic texture, distorted anatomy, blurry, watermark, text, logo, collage';
    $modelCandidates = array_values(array_unique(array_filter([
        trim((string)($config['STABLE_DIFFUSION_MODEL_ID'] ?? '')),
        'stable-diffusion-3.5-large',
        'stable-diffusion-3-medium',
    ])));

    foreach ($modelCandidates as $modelId) {
        $integrate = review_generator_nvidia_integrate_image_attempt($modelId, $prompt, $apiKey, $negativePrompt);
        if ($integrate !== null) {
            return $integrate;
        }

        $legacy = review_generator_nvidia_legacy_image_attempt($modelId, $prompt, $apiKey, $negativePrompt);
        if ($legacy !== null) {
            return $legacy;
        }
    }

    return null;
}

function review_generator_nvidia_integrate_image_attempt(string $modelId, string $prompt, string $apiKey, string $negativePrompt): ?string
{
    $payload = [
        'model' => $modelId,
        'prompt' => $prompt,
        'response_format' => 'b64_json',
        'size' => '1344x768',
        'aspect_ratio' => '16:9',
        'cfg_scale' => 5,
        'steps' => 40,
        'negative_prompt' => $negativePrompt,
    ];

    $response = review_generator_http_request('https://integrate.api.nvidia.com/v1/images/generations', 'POST', [
        'Authorization: Bearer ' . $apiKey,
        'Accept: application/json',
        'Content-Type: application/json',
    ], json_encode($payload, JSON_UNESCAPED_SLASHES));

    $status = (int)($response['status'] ?? 0);
    if ($status < 200 || $status >= 300) {
        $response = review_generator_http_request('https://integrate.api.nvidia.com/v1/images/generations', 'POST', [
            'Authorization: Bearer ' . $apiKey,
            'Accept: application/json',
            'Content-Type: application/json',
        ], json_encode([
            'model' => $modelId,
            'prompt' => $prompt,
            'response_format' => 'b64_json',
        ], JSON_UNESCAPED_SLASHES));
        $status = (int)($response['status'] ?? 0);
        if ($status < 200 || $status >= 300) {
            return null;
        }
    }

    return review_generator_decode_nvidia_image_response((string)($response['body'] ?? ''));
}

function review_generator_nvidia_legacy_image_attempt(string $modelId, string $prompt, string $apiKey, string $negativePrompt): ?string
{
    $payload = [
        'prompt' => $prompt,
        'aspect_ratio' => '16:9',
        'width' => 1344,
        'height' => 768,
        'cfg_scale' => 5,
        'steps' => 40,
        'negative_prompt' => $negativePrompt,
    ];

    $response = review_generator_http_request(
        'https://ai.api.nvidia.com/v1/genai/stabilityai/' . rawurlencode($modelId),
        'POST',
        [
            'Authorization: Bearer ' . $apiKey,
            'Accept: application/json',
            'Content-Type: application/json',
        ],
        json_encode($payload, JSON_UNESCAPED_SLASHES)
    );

    $status = (int)($response['status'] ?? 0);
    if ($status < 200 || $status >= 300) {
        $response = review_generator_http_request(
            'https://ai.api.nvidia.com/v1/genai/stabilityai/' . rawurlencode($modelId),
            'POST',
            [
                'Authorization: Bearer ' . $apiKey,
                'Accept: application/json',
                'Content-Type: application/json',
            ],
            json_encode([
                'prompt' => $prompt,
                'aspect_ratio' => '16:9',
            ], JSON_UNESCAPED_SLASHES)
        );
        $status = (int)($response['status'] ?? 0);
        if ($status < 200 || $status >= 300) {
            return null;
        }
    }

    return review_generator_decode_nvidia_image_response((string)($response['body'] ?? ''));
}

function review_generator_decode_nvidia_image_response(string $body): ?string
{
    if ($body === '') {
        return null;
    }

    $decoded = json_decode($body, true);
    if (!is_array($decoded)) {
        return null;
    }

    $first = is_array($decoded['data'][0] ?? null) ? $decoded['data'][0] : [];
    $base64 = trim((string)($first['b64_json'] ?? $decoded['b64_json'] ?? $decoded['image'] ?? $decoded['base64'] ?? ''));
    if ($base64 !== '') {
        $binary = base64_decode($base64, true);
        if ($binary !== false && $binary !== '') {
            return $binary;
        }
    }

    $url = trim((string)($first['url'] ?? $decoded['url'] ?? ''));
    if ($url === '') {
        return null;
    }

    $response = review_generator_http_request($url, 'GET', [
        'Accept: image/*,*/*;q=0.8',
        'User-Agent: PostGeniusPro-Automation/1.0',
    ]);
    $status = (int)($response['status'] ?? 0);
    $binary = (string)($response['body'] ?? '');
    if ($status < 200 || $status >= 300 || $binary === '' || review_generator_response_looks_like_html($binary)) {
        return null;
    }

    return $binary;
}

function review_generator_store_generated_image(string $articleId, string $binary, string $filename): ?string
{
    $safeArticleId = preg_replace('/[^a-zA-Z0-9_-]/', '', $articleId) ?: 'automation';
    $uploadsRoot = dirname(__DIR__) . '/uploads/';
    $targetDir = $uploadsRoot . $safeArticleId . '/';

    if (!is_dir($targetDir) && !@mkdir($targetDir, 0755, true) && !is_dir($targetDir)) {
        return null;
    }

    $safeFilename = preg_replace('/[^a-zA-Z0-9._-]/', '', $filename) ?: ('hero_' . time() . '.png');
    $targetFile = $targetDir . $safeFilename;
    if (@file_put_contents($targetFile, $binary) === false) {
        return null;
    }

    return 'https://www.postgeniuspro.com/api/uploads/' . rawurlencode($safeArticleId) . '/' . rawurlencode($safeFilename);
}

function review_generator_is_platform_hosted_image(string $url): bool
{
    $url = trim($url);
    if ($url === '') {
        return false;
    }

    if (strpos($url, '/api/uploads/') === 0) {
        return true;
    }

    $host = strtolower((string)parse_url($url, PHP_URL_HOST));
    $path = (string)parse_url($url, PHP_URL_PATH);
    return $host === 'www.postgeniuspro.com' && strpos($path, '/api/uploads/') === 0;
}

function review_generator_is_amazon_hosted_image(string $url): bool
{
    if ($url === '') {
        return false;
    }

    $host = strtolower((string)parse_url($url, PHP_URL_HOST));
    return $host !== '' && (
        strpos($host, 'media-amazon.com') !== false ||
        strpos($host, 'ssl-images-amazon.com') !== false ||
        strpos($host, 'images-amazon.com') !== false ||
        strpos($host, 'amazonaws.com') !== false
    );
}

function review_generator_upgrade_amazon_image_url(string $url): string
{
    $url = html_entity_decode(trim($url), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $url = str_replace('\u002F', '/', $url);
    if ($url === '' || !review_generator_is_amazon_hosted_image($url)) {
        return '';
    }

    if (preg_match('/\._[^\/]+_\./', $url)) {
        return (string)(preg_replace('/\._[^\/]+_\./', '._AC_SL1500_.', $url, 1) ?? $url);
    }

    return $url;
}

function review_generator_expand_real_amazon_image_candidates(string $url): array
{
    $url = review_generator_upgrade_amazon_image_url($url);
    if ($url === '') {
        return [];
    }

    $candidates = [$url];
    foreach (['._AC_SL1500_.', '._AC_SX1500_.', '._AC_SY1500_.', '._SL1500_.'] as $replacement) {
        if (preg_match('/\._[^\/]+_\./', $url)) {
            $variant = (string)(preg_replace('/\._[^\/]+_\./', $replacement, $url, 1) ?? '');
            if ($variant !== '') {
                $candidates[] = $variant;
            }
        }
    }

    return array_values(array_unique(array_filter($candidates)));
}

function review_generator_collect_product_image_candidates(array $product): array
{
    $candidates = [];
    $raw = [];

    $current = trim((string)($product['imageUrl'] ?? ''));
    if ($current !== '') {
        $raw[] = $current;
    }

    foreach ((array)($product['variantImages'] ?? []) as $variant) {
        $variant = trim((string)$variant);
        if ($variant !== '') {
            $raw[] = $variant;
        }
    }

    foreach ($raw as $candidate) {
        if (review_generator_is_platform_hosted_image($candidate)) {
            $candidates[] = $candidate;
            continue;
        }

        foreach (review_generator_expand_real_amazon_image_candidates($candidate) as $expanded) {
            $candidates[] = $expanded;
        }
    }

    return array_values(array_unique(array_filter($candidates)));
}

function review_generator_image_extension_from_mime(string $mime): string
{
    $mime = strtolower(trim($mime));
    return match ($mime) {
        'image/png' => 'png',
        'image/webp' => 'webp',
        default => 'jpg',
    };
}

function review_generator_fetch_valid_image_binary(string $url, int $minDimension = REVIEW_GENERATOR_MIN_PRODUCT_IMAGE_DIMENSION): ?array
{
    $response = review_generator_http_request($url, 'GET', [
        'Accept: image/*,*/*;q=0.8',
        'User-Agent: PostGeniusPro-Automation/1.0',
        'Referer: https://www.amazon.com/',
    ]);

    $status = (int)($response['status'] ?? 0);
    $binary = (string)($response['body'] ?? '');
    if ($status < 200 || $status >= 300 || $binary === '' || review_generator_response_looks_like_html($binary)) {
        return null;
    }

    $size = @getimagesizefromstring($binary);
    if (!is_array($size)) {
        return null;
    }

    $width = (int)($size[0] ?? 0);
    $height = (int)($size[1] ?? 0);
    $mime = strtolower((string)($size['mime'] ?? ''));

    if ($width < $minDimension || $height < $minDimension) {
        return null;
    }

    if ($mime === '' || strpos($mime, 'svg') !== false || strpos($mime, 'gif') !== false) {
        return null;
    }

    return [
        'binary' => $binary,
        'width' => $width,
        'height' => $height,
        'mime' => $mime,
    ];
}

function review_generator_host_product_images(string $articleId, array $products, array $config): array
{
    $associateTag = review_generator_affiliate_tag($config);

    foreach ($products as $index => $product) {
        $slot = $index + 1;
        $sourceImageUrl = '';
        $hostedImageUrl = '';
        $candidates = review_generator_collect_product_image_candidates($product);

        $asin = strtoupper(trim((string)($product['asin'] ?? '')));
        if ($asin === '' && !empty($product['url'])) {
            $asin = strtoupper(trim((string)(review_generator_extract_asin_from_url((string)$product['url']) ?? '')));
        }

        if ($asin !== '') {
            $refetched = review_generator_fetch_product_details($asin, $config);
            if (is_array($refetched)) {
                if (empty($product['features']) && !empty($refetched['features'])) {
                    $product['features'] = $refetched['features'];
                }
                if (empty($product['specs']) && !empty($refetched['specs'])) {
                    $product['specs'] = $refetched['specs'];
                }
                if (trim((string)($product['price'] ?? '')) === '' && trim((string)($refetched['price'] ?? '')) !== '') {
                    $product['price'] = $refetched['price'];
                }
                $candidates = array_values(array_unique(array_merge($candidates, review_generator_collect_product_image_candidates($refetched))));
            }

            $scraped = review_generator_scrape_product_page(review_generator_affiliate_url($asin, $associateTag), $asin, $associateTag);
            if (is_array($scraped)) {
                $candidates = array_values(array_unique(array_merge($candidates, review_generator_collect_product_image_candidates($scraped))));
            }
        }

        foreach ($candidates as $candidate) {
            if (review_generator_is_platform_hosted_image($candidate)) {
                $hostedImageUrl = strpos($candidate, '/api/uploads/') === 0
                    ? 'https://www.postgeniuspro.com' . $candidate
                    : $candidate;
                $sourceImageUrl = $hostedImageUrl;
                break;
            }

            $download = review_generator_fetch_valid_image_binary($candidate);
            if ($download === null) {
                continue;
            }

            $filename = 'product_' . $slot . '.' . review_generator_image_extension_from_mime((string)$download['mime']);
            $storedUrl = review_generator_store_generated_image($articleId, (string)$download['binary'], $filename);
            if ($storedUrl === null || trim($storedUrl) === '') {
                continue;
            }

            $sourceImageUrl = $candidate;
            $hostedImageUrl = $storedUrl;
            break;
        }

        $products[$index]['amazonImageUrl'] = $sourceImageUrl;
        $products[$index]['imageUrl'] = $hostedImageUrl;
        $products[$index]['hostedImageUrl'] = $hostedImageUrl;
    }

    return $products;
}

function review_generator_filter_hosted_lifestyle_images(array $lifestyleImages): array
{
    $filtered = [];
    foreach ($lifestyleImages as $index => $image) {
        $url = is_array($image) ? trim((string)($image['url'] ?? '')) : trim((string)$image);
        if ($url === '' || !review_generator_is_platform_hosted_image($url)) {
            continue;
        }

        $filtered[] = is_array($image)
            ? array_merge($image, ['url' => $url])
            : [
                'url' => $url,
                'productId' => $index + 1,
                'rank' => $index + 1,
                'title' => 'Lifestyle Image ' . ($index + 1),
            ];
    }

    return array_values($filtered);
}

function review_generator_assert_required_review_assets(?string $heroImage, array $lifestyleImages, array $products): void
{
    $heroImage = trim((string)$heroImage);
    $lifestyleImages = review_generator_filter_hosted_lifestyle_images($lifestyleImages);
    $hostedProductImages = 0;

    foreach (array_slice($products, 0, REVIEW_GENERATOR_REQUIRED_PRODUCT_IMAGES) as $product) {
        if (review_generator_is_platform_hosted_image((string)($product['imageUrl'] ?? ''))) {
            $hostedProductImages++;
        }
    }

    if (!review_generator_is_platform_hosted_image($heroImage)) {
        throw new RuntimeException('Automation refused to create a review draft without a hosted hero image.');
    }

    if (count($lifestyleImages) < REVIEW_GENERATOR_REQUIRED_LIFESTYLE_IMAGES) {
        throw new RuntimeException('Automation refused to create a review draft because fewer than 3 lifestyle images were generated.');
    }

    if ($hostedProductImages < REVIEW_GENERATOR_REQUIRED_PRODUCT_IMAGES) {
        throw new RuntimeException('Automation refused to create a review draft because fewer than 3 hosted Amazon product images were available.');
    }
}

function review_generator_resolve_product_image_url(array $product): string
{
    $current = trim((string)($product['imageUrl'] ?? ''));
    if (review_generator_is_platform_hosted_image($current)) {
        return strpos($current, '/api/uploads/') === 0 ? 'https://www.postgeniuspro.com' . $current : $current;
    }

    $candidates = review_generator_collect_product_image_candidates($product);
    foreach ($candidates as $candidate) {
        if (review_generator_is_platform_hosted_image($candidate) || review_generator_is_amazon_hosted_image($candidate)) {
            return $candidate;
        }
    }

    return '';
}

function review_generator_review_styles_block(): string
{
    return <<<'HTML'
<!-- wp:html --><style>
.amazon-reviews-section {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    margin: 1.5rem 0 2.75rem;
}
.amazon-review-card {
    display: flex;
    flex-direction: column;
    gap: 1.05rem;
    border: 1px solid #e5dccd;
    border-top: 3px solid #f7b733;
    border-radius: 0;
    padding: 1.2rem 1.2rem 1.45rem;
    background: #fffdf9;
    box-shadow: none;
}
.amazon-review-heading-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.85rem;
    margin-bottom: 0.25rem;
}
.amazon-review-image-wrap {
    border-radius: 0;
    overflow: hidden;
    background: #f7f2ea;
    border: 1px solid #e8dece;
    aspect-ratio: 16 / 10;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
}
.amazon-review-image-wrap img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    border-radius: 0;
    background: #ffffff;
}
.amazon-review-title {
    margin: 0;
    color: #111827;
    font-size: 1.28rem;
    line-height: 1.32;
    font-weight: 800;
    display: flex;
    align-items: center;
    gap: 0.6rem;
}
.amazon-review-title-accent {
    display: inline-block;
    width: 3px;
    min-width: 3px;
    align-self: stretch;
    border-radius: 999px;
    background: #f59e0b;
}
.amazon-review-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.26rem 0.62rem;
    border-radius: 999px;
    background: #fff4d6;
    color: #8a5a00;
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    border: 1px solid #f6d48c;
    white-space: nowrap;
}
.amazon-review-body {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
}
.amazon-review-summary {
    margin: 0;
    color: #475569;
    font-size: 1rem;
    line-height: 1.84;
}
.amazon-review-price {
    color: #b45309;
    font-weight: 900;
    font-size: 1rem;
    margin: 0;
}
.amazon-key-features {
    margin: 0;
    background: #fffaf0;
    border: 1px solid #f3e2bb;
    border-radius: 0;
    padding: 0.9rem 1rem;
}
.amazon-key-features h4 {
    margin: 0 0 0.45rem 0;
    color: #7c2d12;
    font-size: 0.92rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}
.amazon-key-features ul {
    margin: 0;
    padding-left: 1.1rem;
    color: #475569;
}
.amazon-key-features li {
    margin-bottom: 0.28rem;
    line-height: 1.65;
}
.pros-cons-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.85rem;
    margin: 0;
}
.pros-box, .cons-box {
    border: 1px solid #ece2d5;
    border-radius: 0;
    padding: 0.9rem 1rem;
}
.pros-box {
    background: #f8fbf6;
    border-color: #d7e5cf;
}
.cons-box {
    background: #fcf8f4;
    border-color: #ecd9c9;
}
.pros-box h4, .cons-box h4 {
    margin: 0 0 0.45rem 0;
    color: #111827;
    font-size: 0.92rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}
.pros-box ul, .cons-box ul {
    list-style: none;
    margin: 0;
    padding-left: 0;
}
.pros-box li, .cons-box li {
    margin-bottom: 0.34rem;
    position: relative;
    padding-left: 1.2rem;
    color: #475569;
    line-height: 1.65;
}
.pros-box li::before {
    content: "\2713";
    color: #16a34a;
    position: absolute;
    left: 0;
    top: 0;
    font-weight: 700;
}
.cons-box li::before {
    content: "\2715";
    color: #dc2626;
    position: absolute;
    left: 0;
    top: 0;
    font-weight: 700;
}
.amazon-review-tradeoff {
    margin: 0;
    color: #475569;
    font-size: 0.96rem;
    line-height: 1.75;
}
.amazon-review-tradeoff strong {
    color: #111827;
}
.amazon-review-cta-wrap {
    display: flex;
    justify-content: center;
    padding-top: 0.2rem;
}
.amazon-review-cta-wrap .amazon-cta-button-full {
    width: auto;
    min-width: 196px;
    padding-left: 1.2rem;
    padding-right: 1.2rem;
}
.amazon-comparison-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1.05rem;
    margin: 1.25rem 0 2rem;
    padding-bottom: 0.6rem;
    align-items: stretch;
}
.amazon-compare-card {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.45rem;
    text-align: left;
    border: 1px solid #dfd6c8;
    border-top: 3px solid #f7b733;
    border-radius: 0;
    padding: 0.95rem 0.9rem;
    background: #fffdf8;
    height: 100%;
    position: relative;
    box-shadow: none;
}
.amazon-compare-badge {
    position: static;
    align-self: flex-start;
    padding: 0.18rem 0.45rem;
    border-radius: 999px;
    background: #fff4d6;
    color: #8a5a00;
    border: 1px solid #f6d48c;
    font-size: 0.64rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin-bottom: 0.15rem;
}
.amazon-compare-image-box {
    background: #f7f2ea;
    border: 1px solid #e8dece;
    border-radius: 0;
    width: 100%;
    aspect-ratio: 1 / 1;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 0.35rem;
    overflow: hidden;
}
.amazon-comparison-grid .comparison-thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 0;
    background: transparent;
    border: 0;
    margin-bottom: 0;
    max-height: 100%;
}
.amazon-compare-title {
    margin: 0;
    color: #1e293b;
    font-size: .92rem;
    font-weight: 800;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    min-height: 2.8em;
    position: relative;
    padding-left: 0.55rem;
}
.amazon-compare-title::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0.1rem;
    width: 3px;
    height: 1.1rem;
    border-radius: 999px;
    background: #f59e0b;
}
.amazon-compare-price {
    margin: 0;
    color: #b45309;
    font-size: 1rem;
    font-weight: 900;
}
.amazon-compare-features {
    margin: 0.1rem 0 0.25rem;
    padding-left: 1rem;
    color: #64748b;
    font-size: 0.76rem;
    line-height: 1.42;
    min-height: 3.25rem;
}
.amazon-compare-features li {
    margin-bottom: 0.18rem;
}
.amazon-compare-rating {
    margin: 0 0 .5rem 0;
    font-size: .85rem;
    color: #475569;
}
.amazon-table-cta-button,
.amazon-cta-button-full {
    display: inline-block;
    width: 100%;
    text-align: center;
    padding: .7rem .9rem;
    border-radius: 6px;
    color: #111827 !important;
    text-decoration: none !important;
    background: #f7b733;
    border: 1px solid #df9e1a;
    font-weight: 800;
    font-size: .84rem;
    white-space: nowrap;
    transition: all .2s ease;
    margin-top: auto;
}
.amazon-table-cta-button:hover,
.amazon-cta-button-full:hover {
    background: #f3ab19;
    transform: translateY(-1px);
}
.postgenius-faq-section {
    margin: 2rem 0;
    background: #f5f7fb;
    border-radius: 8px;
    padding: 1.25rem;
    border: 1px solid #d9dee8;
}
.postgenius-faq-section h2 {
    text-align: center;
    margin-bottom: 1.25rem !important;
    color: #1f2937;
    font-size: 1.35rem;
    position: relative;
    display: inline-block;
    left: 50%;
    transform: translateX(-50%);
}
.postgenius-faq-section h2::after {
    content: '';
    display: block;
    width: 38px;
    height: 2px;
    background-color: #fdc754;
    margin: 8px auto 0;
    border-radius: 2px;
}
.faq-item {
    margin-bottom: 0.65rem;
    background: #fff;
    border-radius: 6px;
    padding: 0.8rem 0.9rem;
    border: 1px solid #d6dbe4;
    box-shadow: none;
    transition: background-color .2s ease, border-color .2s ease, box-shadow .2s ease;
}
.faq-item:hover {
    border-color: #c8d0dd;
}
.faq-item[open] {
    background: #fff8e8;
    border-color: #fdc754;
    box-shadow: 0 0 0 1px rgba(253, 199, 84, .2) inset;
}
.faq-item:last-child {
    margin-bottom: 0;
}
.faq-item summary {
    list-style: none;
    cursor: pointer;
    user-select: none;
    outline: none;
}
.faq-item summary::-webkit-details-marker {
    display: none;
}
.faq-question {
    font-weight: 700;
    font-size: 1.06rem;
    color: #1f2937;
    margin-bottom: 0;
    line-height: 1.55;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
}
.faq-question::after {
    content: '+';
    color: #fdc754;
    font-size: 1rem;
    font-weight: 900;
    flex-shrink: 0;
}
.faq-item[open] .faq-question::after {
    content: '−';
}
.faq-answer {
    color: #334155;
    font-size: 0.98rem;
    line-height: 1.75;
    margin-top: 0.6rem;
}
.mag-content .amazon-review-card,
.mag-content .amazon-compare-card,
.mag-content .postgenius-faq-section,
.mag-content .faq-item,
.mag-content .amazon-key-features,
.mag-content .pros-box,
.mag-content .cons-box {
    background: #fffdf9 !important;
    border-color: #e5dccd !important;
    color: #374151 !important;
    box-shadow: none !important;
}
.mag-content .amazon-review-card p,
.mag-content .amazon-review-card li,
.mag-content .amazon-review-summary,
.mag-content .amazon-review-price,
.mag-content .amazon-review-tradeoff,
.mag-content .amazon-compare-card p,
.mag-content .amazon-compare-card li,
.mag-content .amazon-compare-price,
.mag-content .amazon-compare-features,
.mag-content .faq-answer,
.mag-content .faq-answer p,
.mag-content .amazon-key-features li,
.mag-content .pros-box li,
.mag-content .cons-box li {
    color: #475569 !important;
}
.mag-content .amazon-review-title,
.mag-content .amazon-compare-title,
.mag-content .faq-question,
.mag-content .amazon-key-features h4,
.mag-content .pros-box h4,
.mag-content .cons-box h4 {
    color: #111827 !important;
}
.mag-content .amazon-review-image-wrap,
.mag-content .amazon-compare-image-box {
    background: #f7f2ea !important;
    border-color: #e8dece !important;
}
.mag-content .amazon-review-card img,
.mag-content .amazon-compare-card img {
    border-radius: 0 !important;
    border-color: #e4d8c5 !important;
    box-shadow: none !important;
}
.mag-content .amazon-table-cta-button,
.mag-content .amazon-cta-button-full,
.mag-content .amazon-cta-button {
    background: #f7b733 !important;
    color: #111827 !important;
    border-color: #df9e1a !important;
    font-family: Manrope, sans-serif !important;
    font-weight: 800 !important;
}
@media (min-width: 768px) {
    .pros-cons-grid {
        grid-template-columns: 1fr 1fr;
    }
    .amazon-comparison-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 1.25rem;
    }
    .amazon-review-title {
        font-size: 1.34rem;
    }
}
@media (max-width: 767px) {
    .amazon-review-heading-row {
        flex-direction: column;
        align-items: flex-start;
    }
    .amazon-review-card {
        padding: 1rem;
    }
}
</style><!-- /wp:html -->
HTML;
}

function review_generator_build_content_payload(array $products, array $plan, string $generatedHtml, ?string $heroImage, string $heroPrompt, array $lifestyleImages = []): array
{
    $lifestyleImages = review_generator_filter_hosted_lifestyle_images($lifestyleImages);
    $productData = [];
    $productImageUrls = [];
    foreach ($products as $index => $product) {
        $productId = (int)($product['id'] ?? ($index + 1));
        $resolvedImageUrl = review_generator_resolve_product_image_url($product);
        $productData[] = [
            'id' => $productId,
            'productName' => (string)($product['productName'] ?? 'Amazon Product'),
            'isPrimary' => $index === 0,
            'price' => (string)($product['price'] ?? ''),
            'specs' => $product['specs'] ?? [],
            'imageUrl' => $resolvedImageUrl,
            'amazonImageUrl' => (string)($product['amazonImageUrl'] ?? ''),
            'url' => (string)($product['url'] ?? ''),
        ];
        if ($resolvedImageUrl !== '') {
            $productImageUrls[(string)$productId] = $resolvedImageUrl;
        }
    }

    $productReviews = [];
    foreach ($plan['productReviews'] ?? [] as $index => $review) {
        $productReviews[] = [
            'productId' => (int)$index + 1,
            'reviewText' => (string)($review['summary'] ?? ''),
        ];
    }

    $sectionImages = [];
    foreach (array_slice($lifestyleImages, 0, 3) as $index => $image) {
        $url = trim((string)($image['url'] ?? ''));
        if ($url !== '') {
            $sectionImages['section_' . ($index + 1)] = $url;
        }
    }

    return [
        'blogPostData' => [
            'niche' => 'review',
            'title' => (string)$plan['title'],
            'category' => (string)$plan['category'],
            'heroImage' => $heroPrompt,
            'heroImageMetadata' => [
                'alt' => (string)$plan['title'],
                'title' => (string)$plan['title'],
                'caption' => (string)$plan['metaDescription'],
                'description' => (string)$plan['metaDescription'],
            ],
            'contentSections' => [
                ['id' => 1, 'title' => 'Introduction', 'text' => implode("\n\n", $plan['introduction'] ?? []), 'image' => review_generator_section_prompt((string)$plan['title'], 'Introduction'), 'imageUrl' => $sectionImages['section_1'] ?? ''],
                ['id' => 2, 'title' => 'Why Choose This Selection?', 'text' => implode("\n\n", $plan['whyChoose'] ?? []), 'image' => review_generator_section_prompt((string)$plan['title'], 'Why Choose This Selection?'), 'imageUrl' => $sectionImages['section_2'] ?? ''],
                ['id' => 3, 'title' => 'How to Choose', 'text' => implode("\n\n", $plan['howToChoose'] ?? []), 'image' => review_generator_section_prompt((string)$plan['title'], 'How to Choose'), 'imageUrl' => $sectionImages['section_3'] ?? ''],
            ],
            'tags' => [
                'course' => [],
                'cuisine' => [],
                'keywords' => array_values(array_unique(array_filter(array_map('strval', $plan['tags'] ?? [])))),
            ],
            'seo' => [
                'metaTitle' => (string)$plan['metaTitle'],
                'metaDescription' => (string)$plan['metaDescription'],
                'focusKeyphrase' => (string)$plan['focusKeyphrase'],
            ],
            'faq' => $plan['faq'] ?? [],
            'htmlContent' => $generatedHtml,
            'productReviews' => $productReviews,
            'ai_lifestyle_images' => $lifestyleImages,
        ],
        'productData' => $productData,
        'stepImageUrls' => $sectionImages,
        'productImageUrls' => $productImageUrls,
        'heroImageUrl' => $heroImage,
        'ai_lifestyle_images' => $lifestyleImages,
    ];
}

function review_generator_section_prompt(string $title, string $sectionTitle): string
{
    $title = trim($title);
    $sectionTitle = trim($sectionTitle);
    return trim(
        'Premium editorial lifestyle still life for "' . $sectionTitle . '" in the article "' . $title . '". ' .
        'Show the product family in a clean home environment, realistic materials, soft natural light, no people, no hands, no text.'
    );
}

function review_generator_build_html(array $products, array $plan, ?string $heroImage, string $associateTag): string
{
    $html = [];
    $html[] = review_generator_review_styles_block();
    $html[] = '<h2>Introduction</h2>';
    $html[] = review_generator_paragraph_block($plan['introduction'] ?? []);

    $html[] = '<h2>Why Choose This Selection?</h2>';
    $html[] = review_generator_paragraph_block($plan['whyChoose'] ?? []);

    $html[] = '<h2>How to Choose</h2>';
    $html[] = review_generator_paragraph_block($plan['howToChoose'] ?? []);

    $html[] = review_generator_build_review_cards_html($products, $plan['productReviews'] ?? [], $associateTag);
    $html[] = review_generator_build_comparison_cards_html($products, $associateTag);
    $html[] = review_generator_build_faq_html($plan['faq'] ?? []);

    $html[] = '<h2>Conclusion</h2>';
    $html[] = review_generator_paragraph_block($plan['conclusion'] ?? []);

    return implode("\n\n", array_filter($html));
}

function review_generator_paragraph_block(array $paragraphs): string
{
    $parts = [];
    foreach ($paragraphs as $paragraph) {
        $text = trim((string)$paragraph);
        if ($text !== '') {
            $parts[] = '<p>' . review_generator_escape_html($text) . '</p>';
        }
    }
    return implode("\n", $parts);
}

function review_generator_build_review_cards_html(array $products, array $reviewMap, string $associateTag): string
{
    $cards = [];
    $cardStyle = 'background:#fffdf9 !important;border:1px solid #e5dccd !important;border-top:3px solid #f7b733 !important;color:#374151 !important;box-shadow:none !important;';
    $titleStyle = 'color:#111827 !important;';
    $badgeStyle = 'background:#fff4d6 !important;color:#8a5a00 !important;border:1px solid #f6d48c !important;';
    $imageWrapStyle = 'background:#f7f2ea !important;border:1px solid #e8dece !important;';
    $bodyTextStyle = 'color:#475569 !important;';
    $priceStyle = 'color:#8a5a00 !important;font-weight:800 !important;';
    $boxStyle = 'background:#fffaf0 !important;border:1px solid #f3e2bb !important;color:#374151 !important;';
    $boxHeadingStyle = 'color:#7c2d12 !important;';
    $ctaStyle = 'background:#f7b733 !important;color:#111827 !important;border:1px solid #df9e1a !important;font-family:Manrope,sans-serif !important;font-weight:800 !important;text-decoration:none !important;';
    $renderListItems = static fn(array $items, string $style) => implode('', array_map(static fn($item) => '<li style="' . $style . '">' . review_generator_escape_html((string)$item) . '</li>', $items));

    foreach ($products as $index => $product) {
        $productId = (int)($product['id'] ?? ($index + 1));
        $review = $reviewMap[$index + 1] ?? [];
        $imageUrl = review_generator_resolve_product_image_url($product);
        $title = trim((string)($product['productName'] ?? 'Amazon Product'));
        $price = trim((string)($product['price'] ?? 'Price unavailable'));
        $badge = trim((string)($review['badge'] ?? review_generator_rank_label($index)));
        $summary = trim((string)($review['summary'] ?? review_generator_default_summary($product, $index)));
        $pros = array_values(array_filter(array_map('trim', $review['pros'] ?? [])));
        $cons = array_values(array_filter(array_map('trim', $review['cons'] ?? [])));
        $tradeoff = trim((string)($review['tradeoff'] ?? 'The best fit depends on the features you care about most.'));
        $features = array_slice($product['features'] ?? [], 0, 4);
        $link = trim((string)($product['url'] ?? ''));
        if ($link === '') {
            $asin = trim((string)($product['asin'] ?? ''));
            $link = $asin !== '' ? review_generator_affiliate_url($asin, $associateTag) : '#';
        }

        $cards[] = trim('
<article class="amazon-review-card" data-product-id="' . $productId . '" style="' . $cardStyle . '">
    <div class="amazon-review-heading-row">
        <h3 class="amazon-review-title" style="' . $titleStyle . '">
            <span class="amazon-review-title-accent" aria-hidden="true"></span>
            <span>' . review_generator_escape_html($title) . '</span>
        </h3>
        <span class="amazon-review-badge" style="' . $badgeStyle . '">' . review_generator_escape_html($badge) . '</span>
    </div>
    ' . ($imageUrl !== '' ? '<div class="amazon-review-image-wrap" style="' . $imageWrapStyle . '"><img src="' . review_generator_escape_html($imageUrl) . '" alt="' . review_generator_escape_html($title) . '" loading="lazy" style="border-radius:0 !important;border:1px solid #e4d8c5 !important;box-shadow:none !important;" /></div>' : '') . '
    <div class="amazon-review-body">
        <p class="amazon-review-summary" style="' . $bodyTextStyle . '">' . review_generator_escape_html($summary) . '</p>
        <p class="amazon-review-price" style="' . $priceStyle . '">' . review_generator_escape_html($price) . '</p>
        <div class="amazon-key-features amazon-review-features" style="' . $boxStyle . '">
            <h4 style="' . $boxHeadingStyle . '">Highlights</h4>
            <ul>' . $renderListItems($features, $bodyTextStyle) . '</ul>
        </div>
        <div class="pros-cons-grid amazon-review-columns">
            <div class="pros-box amazon-review-list" style="' . $boxStyle . '">
                <h4 style="' . $boxHeadingStyle . '">Pros</h4>
                <ul>' . $renderListItems($pros, $bodyTextStyle) . '</ul>
            </div>
            <div class="cons-box amazon-review-list" style="' . $boxStyle . '">
                <h4 style="' . $boxHeadingStyle . '">Cons</h4>
                <ul>' . $renderListItems($cons, $bodyTextStyle) . '</ul>
            </div>
        </div>
        <p class="amazon-review-tradeoff" style="' . $bodyTextStyle . '"><strong style="color:#111827 !important;">Tradeoff:</strong> ' . review_generator_escape_html($tradeoff) . '</p>
        <div class="amazon-review-cta-wrap">
            <a href="' . review_generator_escape_html($link) . '" class="amazon-cta-button amazon-cta-button-full" style="' . $ctaStyle . '" target="_blank" rel="noopener noreferrer sponsored">Check Price on Amazon</a>
        </div>
    </div>
</article>');
    }

    return "<h2>Product Reviews</h2>\n<!-- wp:html --><section class=\"amazon-reviews-section\">\n" . implode("\n\n", $cards) . "\n</section><!-- /wp:html -->";
}

function review_generator_build_comparison_cards_html(array $products, string $associateTag): string
{
    $cards = [];
    $cardStyle = 'background:#fffdf8 !important;border:1px solid #dfd6c8 !important;border-top:3px solid #f7b733 !important;color:#374151 !important;box-shadow:none !important;';
    $badgeStyle = 'background:#fff5de !important;color:#8a5a00 !important;border:1px solid #f2d699 !important;';
    $titleStyle = 'color:#111827 !important;';
    $textStyle = 'color:#475569 !important;';
    $priceStyle = 'color:#8a5a00 !important;font-weight:800 !important;';
    $imageBoxStyle = 'background:#faf5ea !important;border:1px solid #e5d8c8 !important;';
    $ctaStyle = 'background:#f7b733 !important;color:#111827 !important;border:1px solid #df9e1a !important;font-family:Manrope,sans-serif !important;font-weight:800 !important;text-decoration:none !important;';
    $renderListItems = static fn(array $items, string $style) => implode('', array_map(static fn($item) => '<li style="' . $style . '">' . review_generator_escape_html((string)$item) . '</li>', $items));

    foreach (array_slice($products, 0, 3) as $index => $product) {
        $title = trim((string)($product['productName'] ?? 'Amazon Product'));
        $price = trim((string)($product['price'] ?? 'N/A'));
        $imageUrl = review_generator_resolve_product_image_url($product);
        $features = array_slice($product['features'] ?? [], 0, 3);
        $asin = trim((string)($product['asin'] ?? ''));
        $link = trim((string)($product['url'] ?? ''));
        if ($link === '') {
            $link = $asin !== '' ? review_generator_affiliate_url($asin, $associateTag) : '#';
        }

        $cards[] = trim('
<article class="amazon-compare-card" data-product-id="' . (int)($product['id'] ?? ($index + 1)) . '" style="' . $cardStyle . '">
    <span class="amazon-compare-badge" style="' . $badgeStyle . '">' . review_generator_escape_html(review_generator_rank_label($index)) . '</span>
    ' . ($imageUrl !== '' ? '<div class="amazon-compare-image-box" style="' . $imageBoxStyle . '"><img src="' . review_generator_escape_html($imageUrl) . '" alt="' . review_generator_escape_html($title) . '" class="comparison-thumb" loading="lazy" style="border-radius:0 !important;border:0 !important;box-shadow:none !important;" /></div>' : '') . '
    <h3 class="amazon-compare-title" style="' . $titleStyle . '">' . review_generator_escape_html($title) . '</h3>
    <p class="amazon-compare-price" style="' . $priceStyle . '">' . review_generator_escape_html($price) . '</p>
    <ul class="amazon-compare-features">' . $renderListItems($features, $textStyle) . '</ul>
    <a href="' . review_generator_escape_html($link) . '" class="amazon-table-cta-button" style="' . $ctaStyle . '" target="_blank" rel="noopener noreferrer sponsored">View on Amazon</a>
</article>');
    }

    return "<h2>Amazon Product Comparison</h2>\n<!-- wp:html --><div class=\"amazon-comparison-grid\" data-layout=\"three-column\">\n" . implode("\n", $cards) . "\n</div><!-- /wp:html -->";
}

function review_generator_build_faq_html(array $faqItems): string
{
    $items = [];
    $sectionStyle = 'background:#f5f7fb !important;border:1px solid #d9dee8 !important;color:#1f2937 !important;';
    $itemStyle = 'background:#fff !important;border:1px solid #e3e8f0 !important;';
    $questionStyle = 'color:#111827 !important;';
    $answerStyle = 'color:#475569 !important;';
    foreach ($faqItems as $item) {
        if (!is_array($item)) {
            continue;
        }
        $question = trim((string)($item['question'] ?? ''));
        $answer = trim((string)($item['answer'] ?? ''));
        if ($question === '' || $answer === '') {
            continue;
        }
        $items[] = '
    <details class="faq-item" style="' . $itemStyle . '">
        <summary class="faq-question" style="' . $questionStyle . '">' . review_generator_escape_html($question) . '</summary>
        <div class="faq-answer" style="' . $answerStyle . '">' . review_generator_escape_html($answer) . '</div>
    </details>';
    }

    return "<!-- wp:html --><div class=\"postgenius-faq-section\" style=\"" . $sectionStyle . "\">\n    <h2 style=\"color:#111827 !important;\">FAQ Section</h2>\n" . implode("\n", $items) . "\n</div><!-- /wp:html -->";
}

function review_generator_escape_html(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function review_generator_insert_article(PDO $conn, array $article): void
{
    $stmt = $conn->prepare("
        INSERT INTO articles (
            id, user_id, title, slug, blueprint_type, content, generated_html,
            image_url, image_prompt, image_source, category, tags, seo, status, style_config,
            created_at, updated_at
        ) VALUES (
            :id, :user_id, :title, :slug, :blueprint_type, :content, :generated_html,
            :image_url, :image_prompt, :image_source, :category, :tags, :seo, :status, :style_config,
            NOW(), NOW()
        )
    ");

    $stmt->execute([
        ':id' => $article['id'],
        ':user_id' => $article['user_id'],
        ':title' => $article['title'],
        ':slug' => $article['slug'],
        ':blueprint_type' => $article['blueprint_type'],
        ':content' => $article['content'],
        ':generated_html' => $article['generated_html'],
        ':image_url' => $article['image_url'],
        ':image_prompt' => $article['image_prompt'],
        ':image_source' => $article['image_source'],
        ':category' => $article['category'],
        ':tags' => $article['tags'],
        ':seo' => $article['seo'],
        ':status' => $article['status'],
        ':style_config' => $article['style_config'],
    ]);
}

function review_generator_uuid_v4(): string
{
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
    $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

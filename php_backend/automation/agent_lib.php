<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';
require_once __DIR__ . '/worker_lib.php';
require_once __DIR__ . '/review_generator_lib.php';

const AGENT_TIMEZONE = 'Africa/Casablanca';
const AGENT_DAILY_PUBLISH_MIN = 10;
const AGENT_DAILY_PUBLISH_MAX = 10;
const AGENT_MAX_JOBS_PER_TICK = 4;
const AGENT_MAX_WORKER_RUNS_PER_TICK = 3;
const AGENT_MAX_PUBLISHES_PER_TICK = 1;
const AGENT_MIN_DRAFT_BUFFER = 4;
const AGENT_MAX_BACKLOG_BUFFER = 8;
const AGENT_ASIN_COOLDOWN_DAYS = 45;
const AGENT_TRENDING_SOURCE_URL = 'https://www.amazon.com/b?node=120697190011&ref=CG_ac_dyk_240424_Inspiration_TrendingCU';
const AGENT_TRENDING_NODE_ID = '120697190011';
const AGENT_REQUIRED_LIFESTYLE_IMAGES = 3;
const AGENT_REQUIRED_PRODUCT_IMAGES = 3;

function agent_now(): DateTimeImmutable
{
    return new DateTimeImmutable('now', new DateTimeZone(AGENT_TIMEZONE));
}

function agent_default_keyword_map(): array
{
    return [
        'kitchen' => [
            'best air fryer',
            'espresso machine',
            'coffee grinder',
            'rice cooker',
            'vacuum sealer',
            'blender for smoothies',
            'stand mixer',
            'electric kettle',
            'knife set kitchen',
            'food processor',
        ],
        'electronics' => [
            'smart home security camera',
            'portable bluetooth speaker',
            'noise cancelling earbuds',
            'portable projector',
            'smartwatch for fitness',
            'streaming device',
            'webcam for streaming',
            'mechanical keyboard',
            'wireless gaming mouse',
            'computer monitor',
        ],
        'home' => [
            'robot vacuum',
            'air purifier',
            'humidifier bedroom',
            'dehumidifier',
            'mattress topper',
            'office chair ergonomic',
            'bedding set queen',
            'storage organizer bins',
            'portable carpet cleaner',
            'standing desk',
        ],
        'amazon-master' => [
            'amazon basics home products',
            'best seller kitchen gadget',
            'top rated home appliance',
            'best value electronic accessory',
        ],
    ];
}

function agent_enabled_keywords(PDO $conn): array
{
    $stmt = $conn->prepare("
        SELECT enabled_niches_json
        FROM automation_settings
        WHERE id = 1
        LIMIT 1
    ");
    $stmt->execute();
    $settings = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
    $enabledNiches = automation_decode_json($settings['enabled_niches_json'] ?? null, []);

    $keywordMap = agent_default_keyword_map();
    $pool = [];

    foreach ($keywordMap as $niche => $keywords) {
        $enabled = !array_key_exists($niche, $enabledNiches) || !empty($enabledNiches[$niche]);
        if ($enabled) {
            $pool = array_merge($pool, $keywords);
        }
    }

    if (!$pool) {
        foreach ($keywordMap as $keywords) {
            $pool = array_merge($pool, $keywords);
        }
    }

    shuffle($pool);
    return array_values(array_unique($pool));
}

function agent_get_daily_target(PDO $conn, DateTimeImmutable $now): int
{
    $targetDate = $now->format('Y-m-d');

    $stmt = $conn->prepare("
        SELECT publish_target
        FROM automation_daily_targets
        WHERE target_date = :target_date
        LIMIT 1
    ");
    $stmt->execute([':target_date' => $targetDate]);
    $existing = $stmt->fetchColumn();
    if ($existing !== false) {
        return max(AGENT_DAILY_PUBLISH_MIN, min(AGENT_DAILY_PUBLISH_MAX, (int)$existing));
    }

    $target = random_int(AGENT_DAILY_PUBLISH_MIN, AGENT_DAILY_PUBLISH_MAX);
    $insert = $conn->prepare("
        INSERT INTO automation_daily_targets (target_date, publish_target)
        VALUES (:target_date, :publish_target)
    ");
    $insert->execute([
        ':target_date' => $targetDate,
        ':publish_target' => $target,
    ]);

    automation_log_event($conn, 'agent_target_created', 'Agent selected today\'s publish target.', null, [
        'targetDate' => $targetDate,
        'publishTarget' => $target,
    ]);

    return $target;
}

function agent_today_range(DateTimeImmutable $now): array
{
    $start = $now->setTime(0, 0, 0);
    $end = $start->modify('+1 day');
    return [
        'start' => $start->format('Y-m-d H:i:s'),
        'end' => $end->format('Y-m-d H:i:s'),
        'date' => $start->format('Y-m-d'),
    ];
}

function agent_count_published_today(PDO $conn, DateTimeImmutable $now): int
{
    $range = agent_today_range($now);
    $stmt = $conn->prepare("
        SELECT COUNT(*)
        FROM articles
        WHERE blueprint_type = 'review'
          AND status = 'Published'
          AND published_at >= :start_at
          AND published_at < :end_at
    ");
    $stmt->execute([
        ':start_at' => $range['start'],
        ':end_at' => $range['end'],
    ]);
    return (int)$stmt->fetchColumn();
}

function agent_backlog_snapshot(PDO $conn): array
{
    $jobStmt = $conn->prepare("
        SELECT status, COUNT(*) AS total
        FROM content_jobs
        WHERE blueprint_type = 'review'
          AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.source')) = 'agent_brain'
          AND status IN ('queued', 'processing')
        GROUP BY status
    ");
    $jobStmt->execute();
    $jobCounts = [
        'queued' => 0,
        'processing' => 0,
    ];
    foreach ($jobStmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
        $jobCounts[(string)$row['status']] = (int)$row['total'];
    }

    $draftStmt = $conn->prepare("
        SELECT a.status, COUNT(*) AS total
        FROM articles a
        INNER JOIN content_jobs j
            ON JSON_UNQUOTE(JSON_EXTRACT(j.result_json, '$.articleId')) = a.id
        WHERE a.blueprint_type = 'review'
          AND a.status IN ('Draft', 'Awaiting Admin Review')
          AND JSON_UNQUOTE(JSON_EXTRACT(j.payload_json, '$.source')) = 'agent_brain'
        GROUP BY status
    ");
    $draftStmt->execute();
    $draftCounts = [
        'Draft' => 0,
        'Awaiting Admin Review' => 0,
    ];
    foreach ($draftStmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
        $draftCounts[(string)$row['status']] = (int)$row['total'];
    }

    return [
        'queuedJobs' => $jobCounts['queued'],
        'processingJobs' => $jobCounts['processing'],
        'drafts' => $draftCounts['Draft'],
        'awaitingReview' => $draftCounts['Awaiting Admin Review'],
        'pendingDrafts' => $draftCounts['Draft'] + $draftCounts['Awaiting Admin Review'],
        'pendingTotal' => $jobCounts['queued'] + $jobCounts['processing'] + $draftCounts['Draft'] + $draftCounts['Awaiting Admin Review'],
    ];
}

function agent_recently_used_asins(PDO $conn, array $asins, int $days = AGENT_ASIN_COOLDOWN_DAYS): array
{
    $asins = array_values(array_unique(array_map('strtoupper', array_filter($asins))));
    if (!$asins) {
        return [];
    }

    $params = [];
    $placeholders = [];
    foreach ($asins as $index => $asin) {
        $key = ':asin_' . $index;
        $placeholders[] = $key;
        $params[$key] = $asin;
    }

    $cutoff = agent_now()->modify('-' . max(1, $days) . ' days')->format('Y-m-d H:i:s');
    $params[':cutoff'] = $cutoff;

    $sql = "
        SELECT asin
        FROM automation_asin_history
        WHERE asin IN (" . implode(', ', $placeholders) . ")
          AND (
            (last_published_at IS NOT NULL AND last_published_at >= :cutoff)
            OR
            (last_published_at IS NULL AND last_queued_at IS NOT NULL AND last_queued_at >= :cutoff)
          )
    ";

    $stmt = $conn->prepare($sql);
    $stmt->execute($params);

    return array_map('strtoupper', array_column($stmt->fetchAll(PDO::FETCH_ASSOC) ?: [], 'asin'));
}

function agent_select_asin_groups(PDO $conn, array $keywords, int $desiredJobs): array
{
    $groups = [];
    $reservedAsins = [];
    foreach (agent_trending_feed_definitions() as $feed) {
        if (count($groups) >= $desiredJobs) {
            break;
        }

        $discovered = agent_fetch_trending_feed_asins((string)$feed['url']);
        if (count($discovered) < 3) {
            continue;
        }

        $blocked = agent_recently_used_asins($conn, $discovered);
        $available = array_values(array_filter(
            array_map('strtoupper', $discovered),
            static fn(string $asin): bool => !in_array($asin, $blocked, true) && !in_array($asin, $reservedAsins, true)
        ));

        while (count($available) >= 3 && count($groups) < $desiredJobs) {
            $picked = array_slice($available, 0, 3);
            $available = array_slice($available, 3);
            $reservedAsins = array_values(array_unique(array_merge($reservedAsins, $picked)));

            $groups[] = [
                'keyword' => 'Trending Now',
                'asins' => $picked,
                'sourceUrl' => AGENT_TRENDING_SOURCE_URL,
                'feedUrl' => (string)$feed['url'],
                'feedLabel' => (string)$feed['label'],
                'sourceNode' => AGENT_TRENDING_NODE_ID,
            ];
        }
    }

    return $groups;
}

function agent_trending_feed_definitions(): array
{
    $node = rawurlencode(AGENT_TRENDING_NODE_ID);
    return [
        [
            'label' => 'Trending Now Movers & Shakers',
            'url' => 'https://www.amazon.com/gp/movers-and-shakers/?ie=UTF8&node=' . $node,
        ],
        [
            'label' => 'Trending Now New Releases',
            'url' => 'https://www.amazon.com/gp/new-releases/?ie=UTF8&node=' . $node,
        ],
        [
            'label' => 'Trending Now Best Sellers',
            'url' => 'https://www.amazon.com/gp/bestsellers/?ie=UTF8&node=' . $node,
        ],
    ];
}

function agent_extract_asins_from_markup(string $body): array
{
    if (trim($body) === '') {
        return [];
    }

    $asins = [];
    preg_match_all('/data-asin="([A-Z0-9]{10})"/i', $body, $dataMatches);
    preg_match_all('/\/dp\/([A-Z0-9]{10})(?:[\/?]|$)/i', $body, $dpMatches);

    foreach (array_merge($dataMatches[1] ?? [], $dpMatches[1] ?? []) as $asin) {
        $asin = strtoupper(trim((string)$asin));
        if ($asin !== '' && !in_array($asin, $asins, true)) {
            $asins[] = $asin;
        }
    }

    return $asins;
}

function agent_fetch_trending_feed_asins(string $url): array
{
    $asins = [];

    $direct = review_generator_http_get($url);
    $asins = array_merge($asins, agent_extract_asins_from_markup((string)($direct['body'] ?? '')));

    $jinaUrl = 'https://r.jina.ai/http://' . preg_replace('#^https?://#i', '', $url);
    $jina = review_generator_http_request($jinaUrl, 'GET', ['Accept: text/plain']);
    $asins = array_merge($asins, agent_extract_asins_from_markup((string)($jina['body'] ?? '')));

    return array_values(array_unique(array_filter(array_map('strtoupper', $asins))));
}

function agent_queue_discovered_job(PDO $conn, array $group): int
{
    $keyword = trim((string)($group['keyword'] ?? ''));
    $asins = array_values(array_unique(array_map('strtoupper', (array)($group['asins'] ?? []))));
    if ($keyword === '' || count($asins) < 3) {
        throw new RuntimeException('Agent could not queue an invalid ASIN group.');
    }

    $payload = [
        'source' => 'agent_brain',
        'sourceKeyword' => $keyword,
        'sourceLabel' => trim((string)($group['feedLabel'] ?? 'Trending Now')),
        'sourceUrl' => trim((string)($group['sourceUrl'] ?? AGENT_TRENDING_SOURCE_URL)),
        'feedUrl' => trim((string)($group['feedUrl'] ?? '')),
        'sourceNode' => trim((string)($group['sourceNode'] ?? AGENT_TRENDING_NODE_ID)),
        'discoveredAsins' => $asins,
        'queuedAt' => agent_now()->format(DateTimeInterface::ATOM),
    ];

    $stmt = $conn->prepare("
        INSERT INTO content_jobs (
            input_type, input_value, blueprint_type, niche_tag, priority, status,
            payload_json, max_attempts, created_by
        )
        VALUES (
            'asin', :input_value, 'review', :niche_tag, 40, 'queued',
            :payload_json, 3, NULL
        )
    ");
    $stmt->execute([
        ':input_value' => implode(',', $asins),
        ':niche_tag' => $keyword,
        ':payload_json' => json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
    ]);

    $jobId = (int)$conn->lastInsertId();

    foreach ($asins as $asin) {
        $upsert = $conn->prepare("
            INSERT INTO automation_asin_history (
                asin, source_keyword, last_job_id, last_queued_at
            )
            VALUES (
                :asin, :source_keyword, :last_job_id, NOW()
            )
            ON DUPLICATE KEY UPDATE
                source_keyword = VALUES(source_keyword),
                last_job_id = VALUES(last_job_id),
                last_queued_at = VALUES(last_queued_at),
                updated_at = NOW()
        ");
        $upsert->execute([
            ':asin' => $asin,
            ':source_keyword' => $keyword,
            ':last_job_id' => $jobId,
        ]);
    }

    automation_log_event($conn, 'agent_seeded_job', 'Agent queued a new Amazon ASIN review job.', $jobId, [
        'keyword' => $keyword,
        'asins' => $asins,
    ]);

    return $jobId;
}

function agent_seed_queue(PDO $conn, int $desiredJobs): array
{
    if ($desiredJobs <= 0) {
        return [];
    }

    $keywords = agent_enabled_keywords($conn);
    $groups = agent_select_asin_groups($conn, $keywords, min(AGENT_MAX_JOBS_PER_TICK, $desiredJobs));
    $created = [];

    foreach ($groups as $group) {
        $created[] = [
            'jobId' => agent_queue_discovered_job($conn, $group),
            'keyword' => $group['keyword'],
            'asins' => $group['asins'],
        ];
    }

    return $created;
}

function agent_publish_expected_count(int $dailyTarget, DateTimeImmutable $now): int
{
    $hourIndex = (int)$now->format('G') + 1;
    return (int)floor(($hourIndex / 24) * $dailyTarget);
}

function agent_publish_quota_now(int $dailyTarget, int $publishedToday, DateTimeImmutable $now): int
{
    $expected = agent_publish_expected_count($dailyTarget, $now);
    return max(0, min(AGENT_MAX_PUBLISHES_PER_TICK, $expected - $publishedToday));
}

function agent_find_source_job_for_article(PDO $conn, string $articleId): ?array
{
    try {
        $stmt = $conn->prepare("
            SELECT id, payload_json
            FROM content_jobs
            WHERE JSON_UNQUOTE(JSON_EXTRACT(result_json, '$.articleId')) = :article_id
            ORDER BY id DESC
            LIMIT 1
        ");
        $stmt->execute([':article_id' => $articleId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    } catch (Throwable $e) {
        return null;
    }
}

function agent_mark_asins_published(PDO $conn, string $articleId): void
{
    $sourceJob = agent_find_source_job_for_article($conn, $articleId);
    if (!$sourceJob) {
        return;
    }

    $payload = automation_decode_json($sourceJob['payload_json'] ?? null, []);
    $asins = array_values(array_unique(array_map('strtoupper', (array)($payload['discoveredAsins'] ?? []))));
    if (!$asins) {
        return;
    }

    foreach ($asins as $asin) {
        $stmt = $conn->prepare("
            UPDATE automation_asin_history
            SET last_article_id = :article_id,
                last_published_at = NOW(),
                updated_at = NOW()
            WHERE asin = :asin
        ");
        $stmt->execute([
            ':article_id' => $articleId,
            ':asin' => $asin,
        ]);
    }
}

function agent_is_platform_hosted_image(string $url): bool
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

function agent_extract_hosted_lifestyle_images(array $content): array
{
    $images = [];
    $buckets = [
        $content['ai_lifestyle_images'] ?? [],
        $content['blogPostData']['ai_lifestyle_images'] ?? [],
    ];

    foreach ($buckets as $bucket) {
        if (!is_array($bucket)) {
            continue;
        }
        foreach ($bucket as $item) {
            $url = is_array($item) ? trim((string)($item['url'] ?? '')) : trim((string)$item);
            if ($url !== '' && agent_is_platform_hosted_image($url) && !in_array($url, $images, true)) {
                $images[] = $url;
            }
        }
    }

    return $images;
}

function agent_extract_hosted_product_images(array $content): array
{
    $images = [];
    $sources = [
        $content['productImageUrls'] ?? [],
        $content['productData'] ?? [],
    ];

    foreach ($sources as $source) {
        if (!is_array($source)) {
            continue;
        }
        foreach ($source as $item) {
            $url = is_array($item) ? trim((string)($item['imageUrl'] ?? '')) : trim((string)$item);
            if ($url !== '' && agent_is_platform_hosted_image($url) && !in_array($url, $images, true)) {
                $images[] = $url;
            }
        }
    }

    return $images;
}

function agent_review_article_publish_audit(array $article): array
{
    $content = automation_decode_json($article['content'] ?? null, []);
    $heroImage = trim((string)($content['heroImageUrl'] ?? ($article['image_url'] ?? '')));
    $lifestyleImages = agent_extract_hosted_lifestyle_images($content);
    $productImages = agent_extract_hosted_product_images($content);

    $reasons = [];
    if (!agent_is_platform_hosted_image($heroImage)) {
        $reasons[] = 'hero image is missing or not hosted locally';
    }
    if (count($lifestyleImages) < AGENT_REQUIRED_LIFESTYLE_IMAGES) {
        $reasons[] = 'lifestyle images are incomplete';
    }
    if (count($productImages) < AGENT_REQUIRED_PRODUCT_IMAGES) {
        $reasons[] = 'product images are incomplete';
    }

    return [
        'ok' => $reasons === [],
        'heroImage' => $heroImage,
        'lifestyleCount' => count($lifestyleImages),
        'productCount' => count($productImages),
        'reasons' => $reasons,
    ];
}

function agent_publish_next_review_article(PDO $conn): array
{
    $conn = automation_refresh_connection($conn);
    try {
        $stmt = $conn->prepare("
            SELECT a.id, a.title, a.slug, a.blueprint_type, a.content, a.image_url
            FROM articles a
            INNER JOIN content_jobs j
                ON JSON_UNQUOTE(JSON_EXTRACT(j.result_json, '$.articleId')) = a.id
            WHERE a.blueprint_type = 'review'
              AND a.status IN ('Draft', 'Awaiting Admin Review')
              AND JSON_UNQUOTE(JSON_EXTRACT(j.payload_json, '$.source')) = 'agent_brain'
            ORDER BY a.created_at ASC
            LIMIT 20
        ");
        $stmt->execute();
        $candidates = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        if (!$candidates) {
            return [
                'success' => true,
                'status' => 'empty',
                'message' => 'No review draft is available for publishing.',
            ];
        }

        foreach ($candidates as $article) {
            $audit = agent_review_article_publish_audit($article);
            if (!$audit['ok']) {
                automation_log_event($conn, 'agent_publish_skipped_incomplete', 'Agent skipped a draft because required images are missing.', null, [
                    'articleId' => (string)($article['id'] ?? ''),
                    'reasons' => $audit['reasons'],
                    'heroImage' => $audit['heroImage'],
                    'lifestyleCount' => $audit['lifestyleCount'],
                    'productCount' => $audit['productCount'],
                ]);
                continue;
            }

            $conn->beginTransaction();
            try {
                $articleId = (string)$article['id'];
                $title = (string)($article['title'] ?? 'Postgenius Review');
                $slug = trim((string)($article['slug'] ?? ''));
                if ($slug === '') {
                    $slug = generate_unique_slug($conn, $title, $articleId);
                }

                $publishStmt = $conn->prepare("
                    UPDATE articles
                    SET slug = :slug,
                        status = 'Published',
                        published_at = COALESCE(published_at, NOW()),
                        updated_at = NOW()
                    WHERE id = :id
                      AND status IN ('Draft', 'Awaiting Admin Review')
                ");
                $publishStmt->execute([
                    ':slug' => $slug,
                    ':id' => $articleId,
                ]);

                if ($publishStmt->rowCount() === 0) {
                    $conn->rollBack();
                    continue;
                }

                $runStmt = $conn->prepare("
                    INSERT INTO automation_runs (run_type, picked_article_id, picked_blueprint, status, details)
                    VALUES ('agent_autopublish', :article_id, 'review', 'published', :details)
                ");
                $runStmt->execute([
                    ':article_id' => $articleId,
                    ':details' => 'Agent published review article ' . $slug,
                ]);

                $conn->commit();

                $conn = automation_refresh_connection($conn);
                agent_mark_asins_published($conn, $articleId);

                return [
                    'success' => true,
                    'status' => 'published',
                    'articleId' => $articleId,
                    'slug' => $slug,
                    'title' => $title,
                    'url' => 'https://postgeniuspro.com/blog/' . $slug,
                ];
            } catch (Throwable $publishError) {
                if ($conn->inTransaction()) {
                    $conn->rollBack();
                }
                throw $publishError;
            }
        }

        return [
            'success' => true,
            'status' => 'blocked',
            'message' => 'No review draft passed the image completeness gate.',
        ];
    } catch (Throwable $e) {
        if ($conn->inTransaction()) {
            $conn->rollBack();
        }

        return [
            'success' => false,
            'status' => 'failed',
            'error' => $e->getMessage(),
        ];
    }
}

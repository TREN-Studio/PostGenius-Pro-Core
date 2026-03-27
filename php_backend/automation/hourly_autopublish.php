<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';
require_cron_auth();

ensure_automation_tables($conn);

$targetBlueprint = 'review';

$stateStmt = $conn->prepare("SELECT last_blueprint, last_run_at FROM automation_state WHERE id = 1 LIMIT 1");
$stateStmt->execute();
$state = $stateStmt->fetch(PDO::FETCH_ASSOC) ?: ['last_blueprint' => null, 'last_run_at' => null];

$lastBlueprint = strtolower(trim((string)($state['last_blueprint'] ?? '')));

// Prevent accidental rapid repeated execution in the same minute.
$lastRunAt = (string)($state['last_run_at'] ?? '');
if ($lastRunAt !== '') {
    $lastTs = strtotime($lastRunAt);
    if ($lastTs !== false && (time() - $lastTs) < 45) {
        json_response([
            'success' => true,
            'status' => 'skipped',
            'reason' => 'Run executed recently, skipping duplicate trigger.',
            'lastRunAt' => $lastRunAt
        ]);
    }
}

$conn->beginTransaction();
try {
    $pickStmt = $conn->prepare("
        SELECT id, user_id, title, slug, blueprint_type, status
        FROM articles
        WHERE status IN ('Draft', 'Awaiting Admin Review')
          AND blueprint_type = :bp
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE
    ");
    $pickStmt->execute([':bp' => $targetBlueprint]);
    $article = $pickStmt->fetch(PDO::FETCH_ASSOC);

    if (!$article) {
        $updateStateStmt = $conn->prepare("
            UPDATE automation_state
            SET last_blueprint = :bp, last_run_at = NOW()
            WHERE id = 1
        ");
        $updateStateStmt->execute([':bp' => $targetBlueprint]);

        $runStmt = $conn->prepare("
            INSERT INTO automation_runs (run_type, picked_article_id, picked_blueprint, status, details)
            VALUES ('hourly_autopublish', NULL, :bp, 'empty', :details)
        ");
        $runStmt->execute([
            ':bp' => $targetBlueprint,
            ':details' => 'No pending Amazon Multi-ASIN Master draft found.'
        ]);

        $conn->commit();

        $sitemapInfo = write_dynamic_sitemap($conn);
        $indexing = ping_search_engines($sitemapInfo['sitemapUrl']);

        json_response([
            'success' => true,
            'status' => 'empty',
            'message' => 'No Amazon Multi-ASIN Master draft is available for auto-publish.',
            'nextBlueprintAttempted' => $targetBlueprint,
            'sitemap' => $sitemapInfo,
            'indexing' => $indexing
        ]);
    }

    $articleId = (string)$article['id'];
    $articleTitle = (string)($article['title'] ?? 'Postgenius Article');
    $articleSlug = trim((string)($article['slug'] ?? ''));
    $articleBlueprint = (string)($article['blueprint_type'] ?? '');

    if ($articleSlug === '') {
        $articleSlug = generate_unique_slug($conn, $articleTitle, $articleId);
    }

    $publishStmt = $conn->prepare("
        UPDATE articles
        SET slug = :slug,
            status = 'Published',
            published_at = COALESCE(published_at, NOW()),
            updated_at = NOW()
        WHERE id = :id
    ");
    $publishStmt->execute([
        ':slug' => $articleSlug,
        ':id' => $articleId
    ]);

    $updateStateStmt = $conn->prepare("
        UPDATE automation_state
        SET last_blueprint = :bp, last_run_at = NOW()
        WHERE id = 1
    ");
    $updateStateStmt->execute([':bp' => $articleBlueprint !== '' ? $articleBlueprint : $targetBlueprint]);

    $details = sprintf(
        'Published article %s (%s) in blueprint %s',
        $articleId,
        $articleSlug,
        $articleBlueprint !== '' ? $articleBlueprint : 'unknown'
    );
    $runStmt = $conn->prepare("
        INSERT INTO automation_runs (run_type, picked_article_id, picked_blueprint, status, details)
        VALUES ('hourly_autopublish', :article_id, :bp, 'published', :details)
    ");
    $runStmt->execute([
        ':article_id' => $articleId,
        ':bp' => $articleBlueprint !== '' ? $articleBlueprint : $targetBlueprint,
        ':details' => $details
    ]);

    $conn->commit();

    $sitemapInfo = write_dynamic_sitemap($conn);
    $indexing = ping_search_engines($sitemapInfo['sitemapUrl']);

    json_response([
        'success' => true,
        'status' => 'published',
        'publishedArticle' => [
            'id' => $articleId,
            'slug' => $articleSlug,
            'title' => $articleTitle,
            'blueprint' => $articleBlueprint,
            'url' => 'https://postgeniuspro.com/blog/' . $articleSlug
        ],
        'rotation' => [
            'previousBlueprint' => $lastBlueprint ?: null,
            'attemptedNextBlueprint' => $targetBlueprint,
            'effectivePublishedBlueprint' => $articleBlueprint !== '' ? $articleBlueprint : $targetBlueprint
        ],
        'sitemap' => $sitemapInfo,
        'indexing' => $indexing
    ]);
} catch (Throwable $e) {
    if ($conn->inTransaction()) {
        $conn->rollBack();
    }

    // Best effort run log.
    try {
        $runStmt = $conn->prepare("
            INSERT INTO automation_runs (run_type, picked_article_id, picked_blueprint, status, details)
            VALUES ('hourly_autopublish', NULL, :bp, 'failed', :details)
        ");
        $runStmt->execute([
            ':bp' => $targetBlueprint,
            ':details' => $e->getMessage()
        ]);
    } catch (Throwable $logError) {
        // Ignore secondary logging error.
    }

    json_response([
        'success' => false,
        'error' => 'Auto-publish run failed.',
        'details' => $e->getMessage()
    ], 500);
}

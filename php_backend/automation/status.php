<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';
require_once __DIR__ . '/agent_lib.php';
require_cron_auth();

ensure_automation_tables($conn);

$stateStmt = $conn->prepare("SELECT id, last_blueprint, last_run_at, updated_at FROM automation_state WHERE id = 1 LIMIT 1");
$stateStmt->execute();
$state = $stateStmt->fetch(PDO::FETCH_ASSOC) ?: null;

$draftCountStmt = $conn->prepare("SELECT COUNT(*) FROM articles WHERE status IN ('Draft', 'Awaiting Admin Review')");
$draftCountStmt->execute();
$draftCount = (int)$draftCountStmt->fetchColumn();

$publishedCountStmt = $conn->prepare("SELECT COUNT(*) FROM articles WHERE status = 'Published'");
$publishedCountStmt->execute();
$publishedCount = (int)$publishedCountStmt->fetchColumn();

$now = agent_now();
$dailyTarget = agent_get_daily_target($conn, $now);
$publishedToday = agent_count_published_today($conn, $now);
$backlog = agent_backlog_snapshot($conn);

$lastRunStmt = $conn->prepare("
    SELECT id, run_type, picked_article_id, picked_blueprint, status, details, created_at
    FROM automation_runs
    ORDER BY id DESC
    LIMIT 10
");
$lastRunStmt->execute();
$recentRuns = $lastRunStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

json_response([
    'success' => true,
    'state' => $state,
    'counts' => [
        'draft' => $draftCount,
        'published' => $publishedCount,
        'publishedToday' => $publishedToday
    ],
    'agent' => [
        'timezone' => AGENT_TIMEZONE,
        'dailyTarget' => $dailyTarget,
        'publishedToday' => $publishedToday,
        'backlog' => $backlog,
    ],
    'recentRuns' => $recentRuns
]);

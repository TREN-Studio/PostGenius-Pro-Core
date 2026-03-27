<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';
require_once __DIR__ . '/agent_brain_lib.php';

ensure_automation_tables($conn);
require_automation_access($conn);

function automation_latest_event(PDO $conn, array $eventTypes): ?array
{
    if (!$eventTypes) {
        return null;
    }

    $placeholders = implode(', ', array_fill(0, count($eventTypes), '?'));
    $stmt = $conn->prepare("
        SELECT id, event_type, message, payload_json, created_at
        FROM automation_events
        WHERE event_type IN ($placeholders)
        ORDER BY id DESC
        LIMIT 1
    ");
    $stmt->execute(array_values($eventTypes));
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return null;
    }

    return [
        'id' => (int)$row['id'],
        'eventType' => (string)$row['event_type'],
        'message' => (string)$row['message'],
        'payload' => automation_decode_json($row['payload_json'] ?? null, []),
        'createdAt' => $row['created_at'] ?? null,
    ];
}

function automation_age_minutes(?string $value): ?int
{
    if (!$value) {
        return null;
    }

    $timestamp = strtotime($value);
    if ($timestamp === false) {
        return null;
    }

    return max(0, (int)floor((time() - $timestamp) / 60));
}

function automation_more_recent(?string $left, ?string $right): ?string
{
    if (!$left) return $right;
    if (!$right) return $left;

    $leftTs = strtotime($left);
    $rightTs = strtotime($right);
    if ($leftTs === false) return $right;
    if ($rightTs === false) return $left;

    return $leftTs >= $rightTs ? $left : $right;
}

$settingsStmt = $conn->prepare("
    SELECT auto_trigger, worker_interval_seconds, generate_endpoint, enabled_niches_json, last_worker_run_at, updated_at
    FROM automation_settings
    WHERE id = 1
    LIMIT 1
");
$settingsStmt->execute();
$settingsRow = $settingsStmt->fetch(PDO::FETCH_ASSOC) ?: [];

$now = agent_now();
$dailyTarget = agent_get_daily_target($conn, $now);
$publishedToday = agent_count_published_today($conn, $now);
$backlog = agent_backlog_snapshot($conn);

$draftCountStmt = $conn->prepare("
    SELECT COUNT(*)
    FROM articles
    WHERE blueprint_type = 'review'
      AND status IN ('Draft', 'Awaiting Admin Review')
");
$draftCountStmt->execute();
$draftCount = (int)$draftCountStmt->fetchColumn();

$publishedCountStmt = $conn->prepare("
    SELECT COUNT(*)
    FROM articles
    WHERE blueprint_type = 'review'
      AND status = 'Published'
");
$publishedCountStmt->execute();
$publishedCount = (int)$publishedCountStmt->fetchColumn();

$recentRunsStmt = $conn->prepare("
    SELECT id, run_type, picked_article_id, picked_blueprint, status, details, created_at
    FROM automation_runs
    ORDER BY id DESC
    LIMIT 8
");
$recentRunsStmt->execute();
$recentRuns = $recentRunsStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

$recentEventsStmt = $conn->prepare("
    SELECT id, event_type, message, created_at
    FROM automation_events
    ORDER BY id DESC
    LIMIT 10
");
$recentEventsStmt->execute();
$recentEvents = $recentEventsStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

$latestPublishedStmt = $conn->prepare("
    SELECT id, title, slug, published_at, updated_at, created_at
    FROM articles
    WHERE blueprint_type = 'review'
      AND status = 'Published'
    ORDER BY COALESCE(published_at, updated_at, created_at) DESC
    LIMIT 1
");
$latestPublishedStmt->execute();
$latestPublished = $latestPublishedStmt->fetch(PDO::FETCH_ASSOC) ?: null;

$latestAgentSuccess = automation_latest_event($conn, ['agent_tick', 'agent_admin_tick']);
$latestAgentFailure = automation_latest_event($conn, ['agent_tick_failed', 'agent_admin_tick_failed']);
$latestAgentEvent = automation_latest_event($conn, ['agent_tick', 'agent_admin_tick', 'agent_tick_failed', 'agent_admin_tick_failed']);

$workerLastRunAt = $settingsRow['last_worker_run_at'] ?? null;
$agentLastRunAt = $latestAgentEvent['createdAt'] ?? null;
$agentLastSuccessAt = $latestAgentSuccess['createdAt'] ?? null;
$agentLastFailureAt = $latestAgentFailure['createdAt'] ?? null;
$overallLastRunAt = automation_more_recent($agentLastRunAt, $workerLastRunAt);

$workerIntervalSeconds = max(60, (int)($settingsRow['worker_interval_seconds'] ?? 900));
$workerHealthyWindowMinutes = max(20, (int)ceil(($workerIntervalSeconds * 3) / 60));
$agentHealthyWindowMinutes = 95;

$agentAgeMinutes = automation_age_minutes($agentLastRunAt);
$workerAgeMinutes = automation_age_minutes($workerLastRunAt);
$agentFresh = $agentAgeMinutes !== null && $agentAgeMinutes <= $agentHealthyWindowMinutes;
$workerFresh = $workerAgeMinutes !== null && $workerAgeMinutes <= $workerHealthyWindowMinutes;
$failureAfterSuccess = $agentLastFailureAt !== null
    && ($agentLastSuccessAt === null || strtotime($agentLastFailureAt) >= strtotime($agentLastSuccessAt));

$lambdaStatus = 'offline';
$lambdaLabel = 'Offline';
$lambdaSummary = 'No recent automation activity detected yet.';

if ($agentFresh && $workerFresh) {
    $lambdaStatus = 'healthy';
    $lambdaLabel = 'Healthy';
    $lambdaSummary = 'AWS automation is checking in on schedule.';
} elseif ($agentFresh || $workerFresh) {
    $lambdaStatus = 'warning';
    $lambdaLabel = 'Delayed';
    $lambdaSummary = 'Automation is partially active, but one scheduler is behind.';
}

if ($failureAfterSuccess) {
    $lambdaStatus = $workerFresh || $agentFresh ? 'warning' : 'offline';
    $lambdaLabel = $lambdaStatus === 'offline' ? 'Attention' : 'Warning';
    $lambdaSummary = (string)($latestAgentFailure['message'] ?? 'Recent AWS agent failure detected.');
}

$pendingTotal = (int)($backlog['pendingTotal'] ?? 0);
$queuedJobs = (int)($backlog['queuedJobs'] ?? 0);
$processingJobs = (int)($backlog['processingJobs'] ?? 0);
$pendingDrafts = (int)($backlog['pendingDrafts'] ?? 0);

json_response([
    'success' => true,
    'settings' => [
        'autoTrigger' => (int)($settingsRow['auto_trigger'] ?? 0) === 1,
        'workerIntervalSeconds' => (int)($settingsRow['worker_interval_seconds'] ?? 60),
        'generateEndpoint' => (string)($settingsRow['generate_endpoint'] ?? ''),
        'enabledNiches' => automation_decode_json($settingsRow['enabled_niches_json'] ?? null, []),
        'lastWorkerRunAt' => $settingsRow['last_worker_run_at'] ?? null,
        'updatedAt' => $settingsRow['updated_at'] ?? null,
    ],
    'counts' => [
        'draft' => $draftCount,
        'published' => $publishedCount,
        'publishedToday' => $publishedToday,
    ],
    'agent' => [
        'timezone' => AGENT_TIMEZONE,
        'dailyTarget' => $dailyTarget,
        'publishedToday' => $publishedToday,
        'dailyMin' => AGENT_DAILY_PUBLISH_MIN,
        'dailyMax' => AGENT_DAILY_PUBLISH_MAX,
        'backlog' => $backlog,
    ],
    'lambda' => [
        'status' => $lambdaStatus,
        'label' => $lambdaLabel,
        'summary' => $lambdaSummary,
        'lastRunAt' => $overallLastRunAt,
        'agentLastRunAt' => $agentLastRunAt,
        'agentLastSuccessAt' => $agentLastSuccessAt,
        'agentLastFailureAt' => $agentLastFailureAt,
        'workerLastRunAt' => $workerLastRunAt,
        'agentAgeMinutes' => $agentAgeMinutes,
        'workerAgeMinutes' => $workerAgeMinutes,
        'agentFresh' => $agentFresh,
        'workerFresh' => $workerFresh,
        'workerHealthyWindowMinutes' => $workerHealthyWindowMinutes,
        'agentHealthyWindowMinutes' => $agentHealthyWindowMinutes,
    ],
    'queue' => [
        'pendingTotal' => $pendingTotal,
        'queuedJobs' => $queuedJobs,
        'processingJobs' => $processingJobs,
        'pendingDrafts' => $pendingDrafts,
        'awaitingReview' => (int)($backlog['awaitingReview'] ?? 0),
        'drafts' => (int)($backlog['drafts'] ?? 0),
    ],
    'latestPublished' => $latestPublished ? [
        'id' => (string)$latestPublished['id'],
        'title' => (string)$latestPublished['title'],
        'slug' => (string)($latestPublished['slug'] ?? ''),
        'publishedAt' => $latestPublished['published_at'] ?? $latestPublished['updated_at'] ?? $latestPublished['created_at'] ?? null,
    ] : null,
    'recentRuns' => $recentRuns,
    'recentEvents' => $recentEvents,
]);

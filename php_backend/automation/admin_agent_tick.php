<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';
require_once __DIR__ . '/agent_brain_lib.php';

ensure_automation_tables($conn);
require_automation_access($conn);

$rawBody = file_get_contents('php://input');
$body = json_decode($rawBody ?: '', true);
if (!is_array($body)) {
    $body = [];
}

$dryRun = !empty($body['dryRun']) || (isset($_GET['dryRun']) && (string)$_GET['dryRun'] === '1');

try {
    $now = agent_now();
    $dailyTarget = agent_get_daily_target($conn, $now);
    $publishedTodayBefore = agent_count_published_today($conn, $now);
    $backlogBefore = agent_backlog_snapshot($conn);

    $desiredBacklog = max(
        AGENT_MIN_DRAFT_BUFFER,
        min(AGENT_MAX_BACKLOG_BUFFER, ($dailyTarget - $publishedTodayBefore) + 2)
    );
    $jobsNeeded = max(0, $desiredBacklog - $backlogBefore['pendingTotal']);

    $queuedJobs = [];
    if (!$dryRun && $jobsNeeded > 0) {
        $queuedJobs = agent_seed_queue($conn, $jobsNeeded);
    }

    $workerRuns = [];
    if (!$dryRun) {
        $conn = automation_refresh_connection($conn);
        $backlogMid = agent_backlog_snapshot($conn);
        $draftGap = max(0, AGENT_MIN_DRAFT_BUFFER - $backlogMid['pendingDrafts']);
        $runsToExecute = min(AGENT_MAX_WORKER_RUNS_PER_TICK, max($draftGap, count($queuedJobs) > 0 ? 1 : 0));

        for ($i = 0; $i < $runsToExecute; $i++) {
            $workerRuns[] = automation_process_next_job($conn, [
                'force' => true,
                'worker_id' => 'admin-agent-panel',
            ]);
        }
    }

    $publishedNow = [];
    if (!$dryRun) {
        $conn = automation_refresh_connection($conn);
        $publishedTodayMid = agent_count_published_today($conn, $now);
        $publishQuota = agent_publish_quota_now($dailyTarget, $publishedTodayMid, $now);

        for ($i = 0; $i < $publishQuota; $i++) {
            $publishResult = agent_publish_next_review_article($conn);
            $publishedNow[] = $publishResult;
            if (($publishResult['status'] ?? '') !== 'published') {
                break;
            }
        }
    }

    $conn = automation_refresh_connection($conn);
    $backlogAfter = agent_backlog_snapshot($conn);
    $publishedTodayAfter = agent_count_published_today($conn, $now);

    $sitemapInfo = null;
    $indexing = null;
    if (
        !$dryRun &&
        count(array_filter($publishedNow, static fn(array $item): bool => ($item['status'] ?? '') === 'published')) > 0
    ) {
        $conn = automation_refresh_connection($conn);
        $sitemapInfo = write_dynamic_sitemap($conn);
        $indexing = ping_search_engines($sitemapInfo['sitemapUrl']);
    }

    $conn = automation_refresh_connection($conn);
    automation_log_event($conn, 'agent_admin_tick', $dryRun ? 'Admin agent dry run executed.' : 'Admin agent run executed.', null, [
        'dryRun' => $dryRun,
        'dailyTarget' => $dailyTarget,
        'publishedTodayBefore' => $publishedTodayBefore,
        'publishedTodayAfter' => $publishedTodayAfter,
        'queuedJobsCreated' => count($queuedJobs),
        'workerRuns' => count($workerRuns),
        'publishedNow' => count(array_filter($publishedNow, static fn(array $item): bool => ($item['status'] ?? '') === 'published')),
    ]);

    json_response([
        'success' => true,
        'mode' => $dryRun ? 'dry-run' : 'live',
        'agent' => [
            'timezone' => AGENT_TIMEZONE,
            'now' => $now->format(DateTimeInterface::ATOM),
            'dailyTarget' => $dailyTarget,
            'publishedToday' => $publishedTodayAfter,
            'dailyMin' => AGENT_DAILY_PUBLISH_MIN,
            'dailyMax' => AGENT_DAILY_PUBLISH_MAX,
            'desiredBacklog' => $desiredBacklog,
        ],
        'backlogBefore' => $backlogBefore,
        'queuedJobs' => $queuedJobs,
        'workerRuns' => $workerRuns,
        'publishedNow' => $publishedNow,
        'backlogAfter' => $backlogAfter,
        'sitemap' => $sitemapInfo,
        'indexing' => $indexing,
    ]);
} catch (Throwable $e) {
    $conn = automation_refresh_connection($conn);
    automation_log_event($conn, 'agent_admin_tick_failed', 'Admin agent run failed.', null, [
        'message' => $e->getMessage(),
    ]);

    json_response([
        'success' => false,
        'error' => $e->getMessage(),
    ], 500);
}

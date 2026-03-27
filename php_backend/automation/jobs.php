<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';
require_once __DIR__ . '/worker_lib.php';

ensure_automation_tables($conn);
$access = require_automation_access($conn);
$actorUser = $access['user'] ?? null;

$rawBody = file_get_contents('php://input');
$body = json_decode($rawBody ?: '', true);
if (!is_array($body)) $body = [];

$action = strtolower(trim((string)($_GET['action'] ?? 'list')));

function automation_get_settings(PDO $conn): array
{
    $stmt = $conn->prepare("
        SELECT auto_trigger, worker_interval_seconds, generate_endpoint, enabled_niches_json, last_worker_run_at, updated_at
        FROM automation_settings
        WHERE id = 1
        LIMIT 1
    ");
    $stmt->execute();
    $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];

    return [
        'autoTrigger' => (int)($row['auto_trigger'] ?? 0) === 1,
        'workerIntervalSeconds' => (int)($row['worker_interval_seconds'] ?? 60),
        'generateEndpoint' => (string)($row['generate_endpoint'] ?? ''),
        'enabledNiches' => automation_decode_json($row['enabled_niches_json'] ?? null, []),
        'lastWorkerRunAt' => $row['last_worker_run_at'] ?? null,
        'updatedAt' => $row['updated_at'] ?? null,
    ];
}

function automation_get_queue_snapshot(PDO $conn, int $limitJobs = 100, int $limitEvents = 20): array
{
    $jobsStmt = $conn->prepare("
        SELECT id, input_type, input_value, blueprint_type, niche_tag, priority, status, payload_json, result_json,
               error_message, attempt_count, max_attempts, locked_by, locked_at, started_at, completed_at, created_by,
               created_at, updated_at
        FROM content_jobs
        ORDER BY
            CASE status
                WHEN 'processing' THEN 0
                WHEN 'queued' THEN 1
                WHEN 'failed' THEN 2
                WHEN 'completed' THEN 3
                ELSE 4
            END,
            priority ASC,
            id DESC
        LIMIT :limit_jobs
    ");
    $jobsStmt->bindValue(':limit_jobs', max(1, min(300, $limitJobs)), PDO::PARAM_INT);
    $jobsStmt->execute();
    $jobs = $jobsStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $jobs = array_map(function (array $job): array {
        return [
            'id' => (int)$job['id'],
            'inputType' => (string)$job['input_type'],
            'inputValue' => (string)$job['input_value'],
            'blueprintType' => (string)$job['blueprint_type'],
            'nicheTag' => $job['niche_tag'] !== null ? (string)$job['niche_tag'] : null,
            'priority' => (int)$job['priority'],
            'status' => (string)$job['status'],
            'payload' => automation_decode_json($job['payload_json'] ?? null, []),
            'result' => automation_decode_json($job['result_json'] ?? null, []),
            'errorMessage' => $job['error_message'] !== null ? (string)$job['error_message'] : null,
            'attemptCount' => (int)$job['attempt_count'],
            'maxAttempts' => (int)$job['max_attempts'],
            'lockedBy' => $job['locked_by'] !== null ? (string)$job['locked_by'] : null,
            'lockedAt' => $job['locked_at'] ?? null,
            'startedAt' => $job['started_at'] ?? null,
            'completedAt' => $job['completed_at'] ?? null,
            'createdBy' => $job['created_by'] !== null ? (string)$job['created_by'] : null,
            'createdAt' => $job['created_at'] ?? null,
            'updatedAt' => $job['updated_at'] ?? null,
        ];
    }, $jobs);

    $countStmt = $conn->prepare("
        SELECT status, COUNT(*) AS total
        FROM content_jobs
        GROUP BY status
    ");
    $countStmt->execute();
    $countRows = $countStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $counts = [
        'queued' => 0,
        'processing' => 0,
        'completed' => 0,
        'failed' => 0,
        'cancelled' => 0,
    ];
    foreach ($countRows as $row) {
        $status = strtolower((string)($row['status'] ?? ''));
        if (!array_key_exists($status, $counts)) {
            $counts[$status] = 0;
        }
        $counts[$status] = (int)($row['total'] ?? 0);
    }

    $eventsStmt = $conn->prepare("
        SELECT id, event_type, message, job_id, payload_json, created_at
        FROM automation_events
        ORDER BY id DESC
        LIMIT :limit_events
    ");
    $eventsStmt->bindValue(':limit_events', max(1, min(80, $limitEvents)), PDO::PARAM_INT);
    $eventsStmt->execute();
    $events = $eventsStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $events = array_map(function (array $event): array {
        return [
            'id' => (int)$event['id'],
            'eventType' => (string)$event['event_type'],
            'message' => (string)$event['message'],
            'jobId' => $event['job_id'] !== null ? (int)$event['job_id'] : null,
            'payload' => automation_decode_json($event['payload_json'] ?? null, []),
            'createdAt' => $event['created_at'] ?? null,
        ];
    }, $events);

    return [
        'counts' => $counts,
        'jobs' => $jobs,
        'events' => $events,
    ];
}

switch ($action) {
    case 'list':
        $snapshot = automation_get_queue_snapshot($conn);
        json_response([
            'success' => true,
            'settings' => automation_get_settings($conn),
            'snapshot' => $snapshot,
        ]);
        break;

    case 'create':
        if (!$actorUser) {
            json_response(['success' => false, 'error' => 'Unauthorized'], 401);
        }

        $inputType = strtolower(trim((string)($body['inputType'] ?? 'keyword')));
        $allowedInputTypes = ['keyword', 'asin', 'url'];
        if (!in_array($inputType, $allowedInputTypes, true)) {
            json_response(['success' => false, 'error' => 'Invalid input type.'], 400);
        }

        $inputValue = trim((string)($body['inputValue'] ?? ''));
        if ($inputValue === '') {
            json_response(['success' => false, 'error' => 'Input value is required.'], 400);
        }

        // Automation is intentionally locked to Amazon Multi-ASIN Master only.
        $blueprintType = 'review';

        $nicheTag = trim((string)($body['nicheTag'] ?? ''));
        $priority = (int)($body['priority'] ?? 100);
        if ($priority < 1) $priority = 1;
        if ($priority > 999) $priority = 999;

        $maxAttempts = (int)($body['maxAttempts'] ?? 3);
        if ($maxAttempts < 1) $maxAttempts = 1;
        if ($maxAttempts > 10) $maxAttempts = 10;

        $payload = is_array($body['payload'] ?? null) ? $body['payload'] : [];

        $insertStmt = $conn->prepare("
            INSERT INTO content_jobs (
                input_type, input_value, blueprint_type, niche_tag, priority, status,
                payload_json, max_attempts, created_by
            )
            VALUES (
                :input_type, :input_value, :blueprint_type, :niche_tag, :priority, 'queued',
                :payload_json, :max_attempts, :created_by
            )
        ");
        $insertStmt->execute([
            ':input_type' => $inputType,
            ':input_value' => $inputValue,
            ':blueprint_type' => $blueprintType,
            ':niche_tag' => $nicheTag !== '' ? $nicheTag : null,
            ':priority' => $priority,
            ':payload_json' => json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            ':max_attempts' => $maxAttempts,
            ':created_by' => (string)$actorUser['id'],
        ]);

        $jobId = (int)$conn->lastInsertId();
        automation_log_event($conn, 'job_created', 'A new content job was queued.', $jobId, [
            'inputType' => $inputType,
            'blueprintType' => $blueprintType,
            'nicheTag' => $nicheTag,
        ]);

        $snapshot = automation_get_queue_snapshot($conn);
        json_response([
            'success' => true,
            'jobId' => $jobId,
            'settings' => automation_get_settings($conn),
            'snapshot' => $snapshot,
        ]);
        break;

    case 'toggle_auto':
        $enabled = !empty($body['enabled']) ? 1 : 0;
        $updateStmt = $conn->prepare("UPDATE automation_settings SET auto_trigger = :enabled, updated_at = NOW() WHERE id = 1");
        $updateStmt->execute([':enabled' => $enabled]);
        automation_log_event($conn, 'auto_toggle', $enabled ? 'Auto-trigger enabled.' : 'Auto-trigger disabled.');

        json_response([
            'success' => true,
            'settings' => automation_get_settings($conn),
            'snapshot' => automation_get_queue_snapshot($conn),
        ]);
        break;

    case 'set_endpoint':
        $endpoint = trim((string)($body['generateEndpoint'] ?? ''));
        $updateStmt = $conn->prepare("UPDATE automation_settings SET generate_endpoint = :endpoint, updated_at = NOW() WHERE id = 1");
        $updateStmt->execute([':endpoint' => $endpoint !== '' ? $endpoint : null]);
        automation_log_event($conn, 'endpoint_updated', 'Generator endpoint updated.');

        json_response([
            'success' => true,
            'settings' => automation_get_settings($conn),
            'snapshot' => automation_get_queue_snapshot($conn),
        ]);
        break;

    case 'set_niches':
        $niches = is_array($body['enabledNiches'] ?? null) ? $body['enabledNiches'] : [];
        $updateStmt = $conn->prepare("UPDATE automation_settings SET enabled_niches_json = :niches, updated_at = NOW() WHERE id = 1");
        $updateStmt->execute([
            ':niches' => json_encode($niches, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        ]);
        automation_log_event($conn, 'niches_updated', 'Automation niche toggles were updated.');

        json_response([
            'success' => true,
            'settings' => automation_get_settings($conn),
            'snapshot' => automation_get_queue_snapshot($conn),
        ]);
        break;

    case 'cancel_job':
        $jobId = (int)($body['jobId'] ?? 0);
        if ($jobId <= 0) {
            json_response(['success' => false, 'error' => 'Invalid job id.'], 400);
        }
        $stmt = $conn->prepare("
            UPDATE content_jobs
            SET status = 'cancelled',
                locked_by = NULL,
                locked_at = NULL,
                updated_at = NOW(),
                completed_at = CASE WHEN completed_at IS NULL THEN NOW() ELSE completed_at END
            WHERE id = :id AND status IN ('queued', 'processing', 'failed')
        ");
        $stmt->execute([':id' => $jobId]);
        automation_log_event($conn, 'job_cancelled', 'A content job was cancelled.', $jobId);

        json_response([
            'success' => true,
            'settings' => automation_get_settings($conn),
            'snapshot' => automation_get_queue_snapshot($conn),
        ]);
        break;

    case 'retry_job':
        $jobId = (int)($body['jobId'] ?? 0);
        if ($jobId <= 0) {
            json_response(['success' => false, 'error' => 'Invalid job id.'], 400);
        }
        $stmt = $conn->prepare("
            UPDATE content_jobs
            SET status = 'queued',
                error_message = NULL,
                locked_by = NULL,
                locked_at = NULL,
                completed_at = NULL,
                updated_at = NOW()
            WHERE id = :id
        ");
        $stmt->execute([':id' => $jobId]);
        automation_log_event($conn, 'job_requeued', 'A content job was re-queued.', $jobId);

        json_response([
            'success' => true,
            'settings' => automation_get_settings($conn),
            'snapshot' => automation_get_queue_snapshot($conn),
        ]);
        break;

    case 'run_next':
        $result = automation_process_next_job($conn, [
            'force' => true,
            'worker_id' => 'dashboard-manual-run',
        ]);

        json_response([
            'success' => (bool)($result['success'] ?? false),
            'worker' => $result,
            'settings' => automation_get_settings($conn),
            'snapshot' => automation_get_queue_snapshot($conn),
        ]);
        break;

    default:
        json_response([
            'success' => false,
            'error' => 'Unknown action.'
        ], 400);
        break;
}

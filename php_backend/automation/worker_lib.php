<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';
require_once __DIR__ . '/../_shared/config.php';

const AUTOMATION_STALE_JOB_SECONDS = 300;

function automation_refresh_connection(PDO $conn): PDO
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

function automation_safe_json_value($value)
{
    if (is_array($value)) {
        $clean = [];
        foreach ($value as $key => $item) {
            $clean[$key] = automation_safe_json_value($item);
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

function automation_recover_stale_jobs(PDO $conn, int $staleSeconds = AUTOMATION_STALE_JOB_SECONDS): int
{
    $threshold = date('Y-m-d H:i:s', time() - max(60, $staleSeconds));

    $stmt = $conn->prepare("
        UPDATE content_jobs
        SET status = 'queued',
            locked_by = NULL,
            locked_at = NULL,
            started_at = NULL,
            error_message = CASE
                WHEN error_message IS NULL OR error_message = '' THEN 'Recovered from stale processing state.'
                ELSE CONCAT(error_message, ' | Recovered from stale processing state.')
            END,
            updated_at = NOW()
        WHERE status = 'processing'
          AND locked_at IS NOT NULL
          AND locked_at < :threshold
          AND attempt_count < max_attempts
    ");
    $stmt->execute([':threshold' => $threshold]);
    return $stmt->rowCount();
}

function automation_pick_next_job(PDO $conn, string $workerId): ?array
{
    $conn->beginTransaction();
    try {
        $pickStmt = $conn->prepare("
            SELECT *
            FROM content_jobs
            WHERE status = 'queued'
              AND blueprint_type = 'review'
            ORDER BY priority ASC, id ASC
            LIMIT 1
            FOR UPDATE
        ");
        $pickStmt->execute();
        $job = $pickStmt->fetch(PDO::FETCH_ASSOC);

        if (!$job) {
            $conn->commit();
            return null;
        }

        $lockStmt = $conn->prepare("
            UPDATE content_jobs
            SET status = 'processing',
                attempt_count = attempt_count + 1,
                started_at = NOW(),
                locked_by = :worker_id,
                locked_at = NOW(),
                updated_at = NOW()
            WHERE id = :id
        ");
        $lockStmt->execute([
            ':worker_id' => $workerId,
            ':id' => (int)$job['id'],
        ]);

        $refreshStmt = $conn->prepare("SELECT * FROM content_jobs WHERE id = :id LIMIT 1");
        $refreshStmt->execute([':id' => (int)$job['id']]);
        $lockedJob = $refreshStmt->fetch(PDO::FETCH_ASSOC);

        $conn->commit();
        return $lockedJob ?: null;
    } catch (Throwable $e) {
        if ($conn->inTransaction()) {
            $conn->rollBack();
        }
        throw $e;
    }
}

function automation_update_last_worker_run(PDO $conn): void
{
    $stmt = $conn->prepare("UPDATE automation_settings SET last_worker_run_at = NOW() WHERE id = 1");
    $stmt->execute();
}

function automation_mark_job_success(PDO $conn, int $jobId, array $resultPayload): void
{
    $stmt = $conn->prepare("
        UPDATE content_jobs
        SET status = 'completed',
            result_json = :result_json,
            error_message = NULL,
            locked_by = NULL,
            locked_at = NULL,
            completed_at = NOW(),
            updated_at = NOW()
        WHERE id = :id
    ");
    $encoded = json_encode(automation_safe_json_value($resultPayload), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($encoded === false) {
        $encoded = json_encode([
            'success' => true,
            'warning' => 'Failed to encode full result payload; stored fallback metadata instead.',
            'jobId' => $jobId,
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }
    $stmt->execute([
        ':result_json' => $encoded,
        ':id' => $jobId,
    ]);
}

function automation_mark_job_failure(PDO $conn, array $job, string $errorMessage): array
{
    $jobId = (int)$job['id'];
    $attempts = (int)($job['attempt_count'] ?? 1);
    $maxAttempts = max(1, (int)($job['max_attempts'] ?? 3));
    $isFinal = $attempts >= $maxAttempts;
    $nextStatus = $isFinal ? 'failed' : 'queued';

    $stmt = $conn->prepare("
        UPDATE content_jobs
        SET status = :status,
            error_message = :error_message,
            locked_by = NULL,
            locked_at = NULL,
            completed_at = CASE WHEN :is_final = 1 THEN NOW() ELSE NULL END,
            updated_at = NOW()
        WHERE id = :id
    ");
    $stmt->execute([
        ':status' => $nextStatus,
        ':error_message' => mb_substr($errorMessage, 0, 500),
        ':is_final' => $isFinal ? 1 : 0,
        ':id' => $jobId,
    ]);

    return [
        'status' => $nextStatus,
        'attempts' => $attempts,
        'maxAttempts' => $maxAttempts,
        'isFinal' => $isFinal,
    ];
}

function automation_process_next_job(PDO $conn, array $options = []): array
{
    $conn = automation_refresh_connection($conn);
    ensure_automation_tables($conn);

    $force = !empty($options['force']);
    $workerId = trim((string)($options['worker_id'] ?? 'automation-worker'));
    if ($workerId === '') $workerId = 'automation-worker';

    $settingsStmt = $conn->prepare("
        SELECT auto_trigger, worker_interval_seconds, generate_endpoint, enabled_niches_json, last_worker_run_at
        FROM automation_settings
        WHERE id = 1
        LIMIT 1
    ");
    $settingsStmt->execute();
    $settings = $settingsStmt->fetch(PDO::FETCH_ASSOC) ?: [
        'auto_trigger' => 0,
        'worker_interval_seconds' => 60,
        'generate_endpoint' => null,
        'enabled_niches_json' => null,
        'last_worker_run_at' => null,
    ];

    $autoTrigger = (int)($settings['auto_trigger'] ?? 0) === 1;
    if (!$force && !$autoTrigger) {
        $conn = automation_refresh_connection($conn);
        automation_update_last_worker_run($conn);
        return [
            'success' => true,
            'status' => 'idle',
            'message' => 'Auto-trigger is disabled.',
            'autoTrigger' => false,
        ];
    }

    $conn = automation_refresh_connection($conn);
    $recoveredCount = automation_recover_stale_jobs($conn);
    if ($recoveredCount > 0) {
        automation_log_event($conn, 'job_recovered', 'Recovered stale processing jobs.', null, [
            'count' => $recoveredCount,
        ]);
    }

    $job = automation_pick_next_job($conn, $workerId);
    if (!$job) {
        $conn = automation_refresh_connection($conn);
        automation_update_last_worker_run($conn);
        return [
            'success' => true,
            'status' => 'empty',
            'message' => 'No queued jobs.',
            'autoTrigger' => $autoTrigger,
        ];
    }

    $jobId = (int)$job['id'];
    $endpointFromSettings = trim((string)($settings['generate_endpoint'] ?? ''));
    $endpointFromEnv = trim((string)(getenv('PGP_AUTOMATION_GENERATE_ENDPOINT') ?: ''));
    $generateEndpoint = $endpointFromSettings !== '' ? $endpointFromSettings : $endpointFromEnv;

    if ($generateEndpoint === '') {
        $conn = automation_refresh_connection($conn);
        $failMeta = automation_mark_job_failure($conn, $job, 'Generator endpoint is not configured. Set automation_settings.generate_endpoint.');
        automation_log_event($conn, 'job_failed', 'Job failed: generator endpoint is missing.', $jobId, $failMeta);
        automation_update_last_worker_run($conn);

        return [
            'success' => false,
            'status' => $failMeta['status'],
            'jobId' => $jobId,
            'error' => 'Generator endpoint is not configured.',
            'attempts' => $failMeta['attempts'],
            'maxAttempts' => $failMeta['maxAttempts'],
            'autoTrigger' => $autoTrigger,
        ];
    }

    $payload = [
        'jobId' => $jobId,
        'inputType' => (string)$job['input_type'],
        'inputValue' => (string)$job['input_value'],
        'blueprintType' => (string)$job['blueprint_type'],
        'nicheTag' => $job['niche_tag'] !== null ? (string)$job['niche_tag'] : null,
        'payload' => automation_decode_json($job['payload_json'] ?? null, []),
        'triggerSource' => 'automation_worker',
    ];

    $headers = ['Content-Type: application/json'];
    $cronToken = get_stored_cron_token();
    if ($cronToken !== '') {
        $headers[] = 'X-Cron-Token: ' . $cronToken;
    }

    $response = pgp_http_json($generateEndpoint, 'POST', $headers, $payload);
    $statusCode = (int)($response['status'] ?? 0);
    $bodyRaw = (string)($response['body'] ?? '');
    $transportError = trim((string)($response['error'] ?? ''));

    if ($transportError !== '') {
        $conn = automation_refresh_connection($conn);
        $failMeta = automation_mark_job_failure($conn, $job, 'Generator request failed: ' . $transportError);
        automation_log_event($conn, 'job_failed', 'Job failed during generator request.', $jobId, [
            'transportError' => $transportError,
            'httpStatus' => $statusCode,
        ]);
        automation_update_last_worker_run($conn);

        return [
            'success' => false,
            'status' => $failMeta['status'],
            'jobId' => $jobId,
            'error' => $transportError,
            'attempts' => $failMeta['attempts'],
            'maxAttempts' => $failMeta['maxAttempts'],
            'autoTrigger' => $autoTrigger,
        ];
    }

    $decoded = json_decode($bodyRaw, true);
    $generatorOk = ($statusCode >= 200 && $statusCode < 300) && (is_array($decoded) ? (!array_key_exists('success', $decoded) || (bool)$decoded['success'] === true) : true);

    if ($generatorOk) {
        $conn = automation_refresh_connection($conn);
        $resultPayload = is_array($decoded) ? $decoded : ['raw' => mb_substr($bodyRaw, 0, 8000)];
        automation_mark_job_success($conn, $jobId, $resultPayload);
        automation_log_event($conn, 'job_completed', 'Job completed successfully.', $jobId, [
            'httpStatus' => $statusCode,
        ]);
        automation_update_last_worker_run($conn);

        return [
            'success' => true,
            'status' => 'completed',
            'jobId' => $jobId,
            'httpStatus' => $statusCode,
            'autoTrigger' => $autoTrigger,
        ];
    }

    $errorMessage = 'Generator responded with an error.';
    if (is_array($decoded) && isset($decoded['error'])) {
        $errorMessage = (string)$decoded['error'];
    } elseif ($bodyRaw !== '') {
        $errorMessage = mb_substr($bodyRaw, 0, 500);
    }

    $conn = automation_refresh_connection($conn);
    $failMeta = automation_mark_job_failure($conn, $job, $errorMessage);
    automation_log_event($conn, 'job_failed', 'Job failed after generator response.', $jobId, [
        'httpStatus' => $statusCode,
        'error' => $errorMessage,
        'isFinal' => $failMeta['isFinal'],
    ]);
    automation_update_last_worker_run($conn);

    return [
        'success' => false,
        'status' => $failMeta['status'],
        'jobId' => $jobId,
        'httpStatus' => $statusCode,
        'error' => $errorMessage,
        'attempts' => $failMeta['attempts'],
        'maxAttempts' => $failMeta['maxAttempts'],
        'autoTrigger' => $autoTrigger,
    ];
}

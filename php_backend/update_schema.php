<?php
header("Content-Type: text/html; charset=utf-8");
require 'db.php';

echo "<h2>Database Schema Update</h2>";

function addColumn($table, $column, $definition) {
    global $conn;
    try {
        $conn->exec("ALTER TABLE $table ADD COLUMN $column $definition");
        echo "<div style='color:green'>✅ Added <strong>$column</strong> to <strong>$table</strong>.</div><br>";
    } catch (PDOException $e) {
        // SQLSTATE[42S21]: Column already exists
        if ($e->getCode() == '42S21' || strpos($e->getMessage(), 'Duplicate column') !== false) {
             echo "<div style='color:gray'>ℹ️  Column <strong>$column</strong> already exists in <strong>$table</strong>.</div><br>";
        } else {
             echo "<div style='color:red'>❌ Error adding <strong>$column</strong> to <strong>$table</strong>: " . $e->getMessage() . "</div><br>";
        }
    }
}

function ensureTable($sql, $label) {
    global $conn;
    try {
        $conn->exec($sql);
        echo "<div style='color:green'>Created or verified table <strong>$label</strong>.</div><br>";
    } catch (PDOException $e) {
        echo "<div style='color:red'>Failed ensuring table <strong>$label</strong>: " . $e->getMessage() . "</div><br>";
    }
}

echo "<h3>Ensuring Member Data Tables...</h3>";
ensureTable("
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
", "user_collections");

ensureTable("
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
", "tracked_products");

ensureTable("
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
", "content_jobs");

ensureTable("
    CREATE TABLE IF NOT EXISTS automation_settings (
        id TINYINT PRIMARY KEY,
        auto_trigger TINYINT(1) NOT NULL DEFAULT 0,
        worker_interval_seconds INT NOT NULL DEFAULT 60,
        generate_endpoint VARCHAR(500) NULL,
        enabled_niches_json JSON NULL,
        last_worker_run_at TIMESTAMP NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
", "automation_settings");

ensureTable("
    CREATE TABLE IF NOT EXISTS automation_events (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        event_type VARCHAR(40) NOT NULL,
        message VARCHAR(255) NOT NULL,
        job_id BIGINT NULL,
        payload_json JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_automation_events_created_at (created_at)
    )
", "automation_events");

echo "<h3>Updating Articles Table...</h3>";
addColumn('articles', 'style_config', 'JSON');
addColumn('articles', 'image_source', 'VARCHAR(255)');
addColumn('articles', 'published_at', 'TIMESTAMP NULL');

echo "<h3>Updating Profiles Table...</h3>";
addColumn('profiles', 'style_config', 'JSON');
addColumn('profiles', 'subscription_tier', "VARCHAR(50) DEFAULT 'free'");

echo "<h3>Updating Users Table...</h3>";
addColumn('users', 'newsletter_enabled', "TINYINT(1) NOT NULL DEFAULT 1");

echo "<h3>Seeding Automation Defaults...</h3>";
try {
    $defaultNiches = json_encode([
        'nike' => true,
        'kitchen' => true,
        'skincare' => false
    ]);
    $conn->exec("INSERT IGNORE INTO automation_settings (id, auto_trigger, worker_interval_seconds, enabled_niches_json) VALUES (1, 0, 60, " . $conn->quote($defaultNiches) . ")");
    echo "<div style='color:green'>✅ Seeded default automation settings.</div><br>";
} catch (PDOException $e) {
    echo "<div style='color:red'>❌ Failed to seed automation settings: " . $e->getMessage() . "</div><br>";
}

echo "<h3>Done.</h3>";
echo "<a href='/'>Return to Home</a>";
?>

<?php
require 'db.php';

try {
    // Users Table
    $conn->exec("CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    // Profiles Table
    $conn->exec("CREATE TABLE IF NOT EXISTS profiles (
        id VARCHAR(36) PRIMARY KEY,
        full_name VARCHAR(255),
        avatar_url VARCHAR(255),
        role VARCHAR(50) DEFAULT 'user',
        subscription_tier VARCHAR(50) DEFAULT 'free',
        bio TEXT,
        country VARCHAR(100),
        style_config JSON,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE
    )");

    // Saved Reviews (Member Collections)
    $conn->exec("CREATE TABLE IF NOT EXISTS user_collections (
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
    )");

    // Tracked Amazon Products
    $conn->exec("CREATE TABLE IF NOT EXISTS tracked_products (
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
    )");

    // Content Automation Jobs Queue
    $conn->exec("CREATE TABLE IF NOT EXISTS content_jobs (
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
    )");

    // Automation runtime settings
    $conn->exec("CREATE TABLE IF NOT EXISTS automation_settings (
        id TINYINT PRIMARY KEY,
        auto_trigger TINYINT(1) NOT NULL DEFAULT 0,
        worker_interval_seconds INT NOT NULL DEFAULT 60,
        generate_endpoint VARCHAR(500) NULL,
        enabled_niches_json JSON NULL,
        last_worker_run_at TIMESTAMP NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )");

    // Automation event feed
    $conn->exec("CREATE TABLE IF NOT EXISTS automation_events (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        event_type VARCHAR(40) NOT NULL,
        message VARCHAR(255) NOT NULL,
        job_id BIGINT NULL,
        payload_json JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_automation_events_created_at (created_at)
    )");

    // Articles Table
    $conn->exec("CREATE TABLE IF NOT EXISTS articles (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        title VARCHAR(255),
        slug VARCHAR(255) UNIQUE,
        blueprint_type VARCHAR(50),
        content JSON,
        generated_html LONGTEXT,
        image_url VARCHAR(255),
        image_prompt TEXT,
        image_source VARCHAR(255),
        category VARCHAR(100),
        tags JSON,
        seo JSON,
        status VARCHAR(50) DEFAULT 'Draft',
        style_config JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        published_at TIMESTAMP NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )");

    // --- Schema Updates / Migrations (Add missing columns if table exists) ---

    // Function to check and add column
    function checkAndAddColumn($conn, $table, $column, $definition) {
        try {
            $stmt = $conn->prepare("SHOW COLUMNS FROM $table LIKE :col");
            $stmt->execute([':col' => $column]);
            if ($stmt->rowCount() == 0) {
                $conn->exec("ALTER TABLE $table ADD COLUMN $column $definition");
                echo "Added column '$column' to '$table'.<br>";
            }
        } catch (Exception $e) {
            // Ignore if fails, or log
        }
    }

    // Update Articles Table
    checkAndAddColumn($conn, 'articles', 'style_config', 'JSON');
    checkAndAddColumn($conn, 'articles', 'image_source', 'VARCHAR(255)');
    checkAndAddColumn($conn, 'articles', 'published_at', 'TIMESTAMP NULL');

    // Update Profiles Table
    checkAndAddColumn($conn, 'profiles', 'style_config', 'JSON');
    checkAndAddColumn($conn, 'profiles', 'subscription_tier', "VARCHAR(50) DEFAULT 'free'");

    // Update Users Table
    checkAndAddColumn($conn, 'users', 'newsletter_enabled', "TINYINT(1) NOT NULL DEFAULT 1");

    // Seed default automation settings row
    $settingsExists = $conn->query("SELECT id FROM automation_settings WHERE id = 1 LIMIT 1")->fetchColumn();
    if (!$settingsExists) {
        $defaultNiches = json_encode([
            'nike' => true,
            'kitchen' => true,
            'skincare' => false
        ]);
        $stmt = $conn->prepare("INSERT INTO automation_settings (id, auto_trigger, worker_interval_seconds, enabled_niches_json) VALUES (1, 0, 60, :niches)");
        $stmt->execute([':niches' => $defaultNiches]);
    }


    echo json_encode(["message" => "Database tables created successfully!"]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["error" => "Setup failed: " . $e->getMessage()]);
}
?>

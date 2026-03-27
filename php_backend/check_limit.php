<?php
require 'db.php';

// Get User ID from Header
$headers = getallheaders();
$userId = $headers['Authorization'] ?? $headers['authorization'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? null;

if (!$userId) {
    http_response_code(401);
    echo json_encode(["error" => "Unauthorized: No token provided"]);
    exit;
}

try {
    // 1. Get User Profile & Subscription Status
    // We check the profiles table. If no profile, assume free user if valid ID (or error).
    $stmt = $conn->prepare("SELECT role, subscription_tier FROM profiles WHERE id = :id");
    $stmt->execute([':id' => $userId]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        // Validate against users table to see if it's a valid ID at all
        $checkUser = $conn->prepare("SELECT id FROM users WHERE id = :id");
        $checkUser->execute([':id' => $userId]);
        if (!$checkUser->fetch()) {
            http_response_code(401);
            echo json_encode(["error" => "Invalid User Token"]);
            exit;
        }
        // User exists but no profile? Treat as free user.
        $role = 'user';
        $tier = 'free';
    } else {
        $role = $user['role'] ?? 'user';
        $tier = $user['subscription_tier'] ?? 'free';
    }

    // 2. Logic for Non-Free Users (Pro, Premium, Admin)
    // "not subscribed to any of our packages" -> means 'free' tier.
    $isSubscribed = ($tier === 'pro' || $tier === 'premium');
    $isAdmin = ($role === 'admin');

    if ($isAdmin || $isSubscribed) {
        echo json_encode([
            "allowed" => true,
            "limit" => -1, // Unlimited
            "used" => 0,
            "remaining" => 9999,
            "tier" => $tier
        ]);
        exit;
    }

    // 3. Logic for Free Users
    $limit = 10;
    
    // Count articles created in current month of current year
    // Note: status != 'Rejected' might be good, but prompt says "creating 10 articles", usually implies creation attempts or drafts.
    // We count ALL rows in 'articles' table for this user for this month.
    $query = "SELECT COUNT(*) as count FROM articles 
              WHERE user_id = :id 
              AND MONTH(created_at) = MONTH(CURRENT_DATE()) 
              AND YEAR(created_at) = YEAR(CURRENT_DATE())";
              
    $stmt = $conn->prepare($query);
    $stmt->execute([':id' => $userId]);
    $result = $stmt->fetch(PDO::FETCH_ASSOC);
    $used = (int)($result['count'] ?? 0);
    
    $remaining = max(0, $limit - $used);
    $allowed = ($used < $limit);

    echo json_encode([
        "allowed" => $allowed,
        "limit" => $limit,
        "used" => $used,
        "remaining" => $remaining,
        "tier" => $tier,
        "message" => $allowed ? "You have $remaining of $limit free articles remaining this month." : "Monthly Limit Reached. Upgrade to continue."
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["error" => "Database error: " . $e->getMessage()]);
}
?>

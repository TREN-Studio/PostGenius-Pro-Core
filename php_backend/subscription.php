<?php
// Disable Error Reporting for Production (Prevents JSON errors)
ini_set('display_errors', 0);
ini_set('display_startup_errors', 0);
error_reporting(E_ALL);

require 'db.php';

$data = json_decode(file_get_contents("php://input"));
$action = $_GET['action'] ?? '';

if ($action == 'update_tier') {
    $userId = $data->user_id ?? '';
    $newTier = $data->subscription_tier ?? '';
    
    if (!$userId || !$newTier) {
        http_response_code(400);
        echo json_encode(["error" => "User ID and subscription tier are required"]);
        exit;
    }
    
    // Validate tier
    $validTiers = ['free', 'pro', 'premium'];
    if (!in_array($newTier, $validTiers)) {
        http_response_code(400);
        echo json_encode(["error" => "Invalid subscription tier. Must be: free, pro, or premium"]);
        exit;
    }
    
    try {
        $conn->beginTransaction();

        // Update Profile Tier
        $stmt = $conn->prepare("UPDATE profiles SET subscription_tier = :tier WHERE id = :id");
        $stmt->execute([':tier' => $newTier, ':id' => $userId]);

        $conn->commit();
        
        echo json_encode([
            "status" => "success",
            "message" => "Subscription updated",
            "user_id" => $userId,
            "subscription_tier" => $newTier
        ]);
    } catch (Exception $e) {
        if ($conn->inTransaction()) $conn->rollBack();
        http_response_code(500);
        echo json_encode(["error" => "Failed to update subscription: " . $e->getMessage()]);
    }
}

if ($action == 'get_tier') {
    $userId = $_GET['user_id'] ?? '';
    
    if (!$userId) {
        http_response_code(400);
        echo json_encode(["error" => "User ID is required"]);
        exit;
    }
    
    try {
        $stmt = $conn->prepare("SELECT subscription_tier FROM profiles WHERE id = :id");
        $stmt->execute([':id' => $userId]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($result) {
            echo json_encode([
                "user_id" => $userId,
                "subscription_tier" => $result['subscription_tier']
            ]);
        } else {
            http_response_code(404);
            echo json_encode(["error" => "User not found"]);
        }
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(["error" => "Failed to get tier: " . $e->getMessage()]);
    }
}
?>

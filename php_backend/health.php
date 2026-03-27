<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

echo json_encode([
    "success" => true,
    "message" => "Image Upload API is running",
    "timestamp" => date('c'),
    "server" => "Hostinger Shared Hosting"
]);
?>

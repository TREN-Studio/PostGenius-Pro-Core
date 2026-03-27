<?php
// Disable Error Reporting for Production (Prevents JSON errors)
ini_set('display_errors', 0);
ini_set('display_startup_errors', 0);
error_reporting(E_ALL);

require 'db.php';

$data = json_decode(file_get_contents("php://input"));
$action = $_GET['action'] ?? '';
const OWNER_EMAIL = 'larbilife@gmail.com';

function normalize_email($email) {
    return strtolower(trim((string)$email));
}

function is_owner_email($email) {
    return normalize_email($email) === OWNER_EMAIL;
}

// Helper to generate UUID v4
function guidv4($data = null) {
    $data = $data ?? random_bytes(16);
    assert(strlen($data) == 16);
    $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
    $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

if ($action == 'register') {
    if (!isset($data->email) || !isset($data->password)) {
        http_response_code(400);
        echo json_encode(["error" => "Email and password are required"]);
        exit;
    }

    $id = guidv4();
    $email = normalize_email($data->email ?? '');
    $password = password_hash($data->password, PASSWORD_BCRYPT);
    $fullName = $data->full_name ?? null;

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(["error" => "Please provide a valid email address"]);
        exit;
    }

    try {
        // Check if user exists
        $stmt = $conn->prepare("SELECT id FROM users WHERE email = :email");
        $stmt->execute([':email' => $email]);
        if ($stmt->fetch()) {
            http_response_code(409);
            echo json_encode(["error" => "User already exists"]);
            exit;
        }

        // Insert User
        $query = "INSERT INTO users (id, email, password_hash) VALUES (:id, :email, :password)";
        $stmt = $conn->prepare($query);
        $stmt->execute([':id' => $id, ':email' => $email, ':password' => $password]);
        
        // Create Profile
        $role = is_owner_email($email) ? 'admin' : 'user';
        $subscriptionTier = is_owner_email($email) ? 'premium' : 'free';
        
        $conn->prepare("INSERT INTO profiles (id, role, full_name, subscription_tier) VALUES (:id, :role, :full_name, :subscription_tier)")
            ->execute([':id' => $id, ':role' => $role, ':full_name' => $fullName, ':subscription_tier' => $subscriptionTier]);

        // Return user object (excluding password)
        echo json_encode([
            "message" => "User registered", 
            "user" => ["id" => $id, "email" => $email, "role" => $role, "full_name" => $fullName],
            "token" => $id // Simple token (User ID) for now
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(["error" => "Registration failed: " . $e->getMessage()]);
    }
}

if ($action == 'login') {
    $email = normalize_email($data->email ?? '');
    $password = $data->password ?? '';

    if (!$email || !$password) {
        http_response_code(400);
        echo json_encode(["error" => "Email and password are required"]);
        exit;
    }

    $stmt = $conn->prepare("SELECT u.id, u.email, u.password_hash, p.role, p.full_name, p.avatar_url FROM users u LEFT JOIN profiles p ON u.id = p.id WHERE u.email = :email");
    $stmt->execute([':email' => $email]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($user && password_verify($password, $user['password_hash'])) {
        unset($user['password_hash']); // Remove hash from response
        echo json_encode(["token" => $user['id'], "user" => $user]);
    } else {
        http_response_code(401);
        echo json_encode(["error" => "Invalid credentials"]);
    }
}

if ($action == 'getProfile') {
    $id = $_GET['id'] ?? null;
    if (!$id) {
        http_response_code(400);
        echo json_encode(["error" => "ID required"]);
        exit;
    }

    $stmt = $conn->prepare("SELECT * FROM profiles WHERE id = :id");
    $stmt->execute([':id' => $id]);
    $profile = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($profile) {
        // Parse JSON fields
        if (isset($profile['style_config'])) $profile['style_config'] = json_decode($profile['style_config']);
        echo json_encode($profile);
    } else {
        http_response_code(404);
        echo json_encode(["error" => "Profile not found"]);
    }
}

if ($action == 'updateProfile') {
    $id = $data->id ?? null;
    if (!$id) {
        http_response_code(400);
        echo json_encode(["error" => "ID required"]);
        exit;
    }

    // Build dynamic update query
    $fields = [];
    $params = [':id' => $id];
    
    if (isset($data->full_name)) { $fields[] = "full_name = :full_name"; $params[':full_name'] = $data->full_name; }
    if (isset($data->avatar_url)) { $fields[] = "avatar_url = :avatar_url"; $params[':avatar_url'] = $data->avatar_url; }
    if (isset($data->bio)) { $fields[] = "bio = :bio"; $params[':bio'] = $data->bio; }
    if (isset($data->country)) { $fields[] = "country = :country"; $params[':country'] = $data->country; }
    if (isset($data->style_config)) { $fields[] = "style_config = :style_config"; $params[':style_config'] = json_encode($data->style_config); }

    if (empty($fields)) {
        echo json_encode(["message" => "No changes"]);
        exit;
    }

    $sql = "UPDATE profiles SET " . implode(", ", $fields) . " WHERE id = :id";
    $stmt = $conn->prepare($sql);
    $stmt->execute($params);

    // Return updated profile
    $stmt = $conn->prepare("SELECT * FROM profiles WHERE id = :id");
    $stmt->execute([':id' => $id]);
    $profile = $stmt->fetch(PDO::FETCH_ASSOC);
    if (isset($profile['style_config'])) $profile['style_config'] = json_decode($profile['style_config']);
    
    echo json_encode($profile);
}

if ($action == 'google_login') {
    $id_token = $data->id_token ?? '';
    
    if (!$id_token) {
        http_response_code(400);
        echo json_encode(["error" => "ID Token required"]);
        exit;
    }

    // Verify token with Google using cURL (More robust than file_get_contents)
    $verify_url = "https://oauth2.googleapis.com/tokeninfo?id_token=" . $id_token;
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $verify_url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // Fix for shared hosting SSL issues
    
    $response = curl_exec($ch);
    $curl_errno = curl_errno($ch);
    $curl_error = curl_error($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($curl_errno) {
        http_response_code(500);
        echo json_encode(["error" => "Server cURL Error ($curl_errno): $curl_error"]);
        exit;
    }
    
    if ($http_code !== 200 || !$response) {
        http_response_code(401);
        // Log the response for debugging (be careful not to expose sensitive info in production)
        echo json_encode(["error" => "Google Verification Failed. HTTP Code: $http_code. Response: $response"]);
        exit;
    }

    $payload = json_decode($response);
    if (isset($payload->error_description)) {
        http_response_code(401);
        echo json_encode(["error" => "Token verification error: " . $payload->error_description]);
        exit;
    }

    $email = normalize_email($payload->email ?? '');
    $google_sub = $payload->sub; // Google's unique user ID
    $picture = $payload->picture ?? '';
    $name = $payload->name ?? '';

    try {
        // Check if user exists
        $stmt = $conn->prepare("SELECT u.id, u.email, p.role, p.full_name, p.avatar_url FROM users u LEFT JOIN profiles p ON u.id = p.id WHERE u.email = :email");
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($user) {
            if (is_owner_email($email) && strtolower((string)($user['role'] ?? '')) !== 'admin') {
                $conn->prepare("UPDATE profiles SET role = 'admin', subscription_tier = 'premium' WHERE id = :id")
                    ->execute([':id' => $user['id']]);
                $user['role'] = 'admin';
            }
            // User exists - Login
            echo json_encode(["token" => $user['id'], "user" => $user]);
        } else {
            // User does not exist - Register
            $id = guidv4();
            $dummy_password = password_hash(bin2hex(random_bytes(16)), PASSWORD_BCRYPT);

            $query = "INSERT INTO users (id, email, password_hash) VALUES (:id, :email, :password)";
            $stmt = $conn->prepare($query);
            $stmt->execute([':id' => $id, ':email' => $email, ':password' => $dummy_password]);
            
            // Create Profile
            $role = is_owner_email($email) ? 'admin' : 'user';
            $subscriptionTier = is_owner_email($email) ? 'premium' : 'free';
            
            $conn->prepare("INSERT INTO profiles (id, role, full_name, avatar_url, subscription_tier) VALUES (:id, :role, :full_name, :avatar_url, :subscription_tier)")
                 ->execute([':id' => $id, ':role' => $role, ':full_name' => $name, ':avatar_url' => $picture, ':subscription_tier' => $subscriptionTier]);

            echo json_encode([
                "message" => "User registered via Google", 
                "user" => ["id" => $id, "email" => $email, "role" => $role, "full_name" => $name, "avatar_url" => $picture],
                "token" => $id
            ]);
        }
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(["error" => "Google Login failed: " . $e->getMessage()]);
    }
}
?>

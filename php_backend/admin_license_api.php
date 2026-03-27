<?php
header('Content-Type: application/json');
http_response_code(410);
echo json_encode([
    'error' => 'License system has been removed from this platform.',
]);
?>

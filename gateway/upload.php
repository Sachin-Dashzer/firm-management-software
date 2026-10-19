<?php
/**
 * PHMG file gateway — upload (spec section 14).
 *
 * The browser sends the file straight here rather than through the app,
 * which keeps Vercel's ~4.5 MB request limit out of the way. The ticket says
 * where the file may be written, how big it may be and what type it may be;
 * this script enforces all three, encrypts the bytes with AES-256-GCM and
 * returns a checksum the app stores alongside the document record.
 */

declare(strict_types=1);

require __DIR__ . '/verify.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    $config = gateway_config();
    header('Access-Control-Allow-Origin: ' . $config['allowed_origin']);
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Max-Age: 600');
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    gateway_fail(405, 'POST only');
}

$ticket = gateway_ticket('put');

if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
    gateway_fail(400, 'No file');
}
$file = $_FILES['file'];

if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    // the commonest one by far is a file larger than PHP itself allows
    gateway_fail(400, 'Upload failed (code ' . (int) $file['error'] . ')');
}

$size = (int) ($file['size'] ?? 0);
$maxBytes = (int) ($ticket['max'] ?? 0);
if ($size <= 0) {
    gateway_fail(400, 'Empty file');
}
if ($maxBytes > 0 && $size > $maxBytes) {
    gateway_fail(413, 'File is larger than the ticket allows');
}

$temp = $file['tmp_name'] ?? '';
if (!is_uploaded_file($temp)) {
    gateway_fail(400, 'Not an uploaded file');
}

// trust the bytes, not the name the browser sent
$finfo = new finfo(FILEINFO_MIME_TYPE);
$detected = (string) $finfo->file($temp);
$allowed = $ticket['types'] ?? [];
if (is_array($allowed) && count($allowed) > 0 && !in_array($detected, $allowed, true)) {
    gateway_fail(415, 'That kind of file is not allowed: ' . $detected);
}

$plain = file_get_contents($temp);
if ($plain === false) {
    gateway_fail(500, 'Could not read the upload');
}

$checksum = hash('sha256', $plain);

$iv = random_bytes(12);
$tag = '';
$cipher = openssl_encrypt(
    $plain,
    'aes-256-gcm',
    gateway_encryption_key(),
    OPENSSL_RAW_DATA,
    $iv,
    $tag,
    (string) $ticket['k'],
    16
);
if ($cipher === false) {
    gateway_fail(500, 'Could not encrypt the file');
}

$destination = gateway_path((string) $ticket['k']);
$directory = dirname($destination);
if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
    gateway_fail(500, 'Could not create the folder');
}

// write beside the target and move into place, so a half-written file is
// never readable as the real one
$temporary = $destination . '.part';
if (file_put_contents($temporary, $iv . $tag . $cipher, LOCK_EX) === false) {
    gateway_fail(500, 'Could not store the file');
}
@chmod($temporary, 0600);
if (!rename($temporary, $destination)) {
    @unlink($temporary);
    gateway_fail(500, 'Could not finish storing the file');
}

gateway_log('stored', [
    'key' => $ticket['k'],
    'bytes' => $size,
    'mime' => $detected,
]);

header('Content-Type: application/json');
echo json_encode([
    'ok' => true,
    'key' => $ticket['k'],
    'size' => $size,
    'mime' => $detected,
    'checksum' => $checksum,
]);

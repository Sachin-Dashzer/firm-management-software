<?php
/**
 * PHMG file gateway — download (spec section 14).
 *
 * The app has already checked that this person may see this file and written
 * the audit entry; the link it issued is good for five minutes. This script
 * only decrypts and streams.
 */

declare(strict_types=1);

require __DIR__ . '/verify.php';

if (!in_array($_SERVER['REQUEST_METHOD'] ?? '', ['GET', 'HEAD'], true)) {
    gateway_fail(405, 'GET only');
}

$ticket = gateway_ticket('get');
$path = gateway_path((string) $ticket['k']);

if (!is_file($path)) {
    gateway_fail(404, 'No such file');
}

$raw = file_get_contents($path);
if ($raw === false || strlen($raw) < 29) {
    gateway_fail(500, 'Could not read the file');
}

$iv = substr($raw, 0, 12);
$tag = substr($raw, 12, 16);
$cipher = substr($raw, 28);

$plain = openssl_decrypt(
    $cipher,
    'aes-256-gcm',
    gateway_encryption_key(),
    OPENSSL_RAW_DATA,
    $iv,
    $tag,
    (string) $ticket['k']
);
if ($plain === false) {
    // a failed tag check means the file or its key has been tampered with
    gateway_fail(500, 'File could not be decrypted');
}

$name = (string) ($ticket['name'] ?? basename((string) $ticket['k']));
$name = preg_replace('/[^A-Za-z0-9 ._()-]/', '_', $name) ?: 'document';
$mime = (string) ($ticket['mime'] ?? 'application/octet-stream');
// only ever render these in the browser; everything else downloads
$inlineTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];
$inline = !empty($ticket['inline']) && in_array($mime, $inlineTypes, true);

gateway_log('served', ['key' => $ticket['k'], 'inline' => $inline]);

header('Content-Type: ' . ($inline ? $mime : 'application/octet-stream'));
header('Content-Length: ' . strlen($plain));
header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . '; filename="' . $name . '"');
header('Cache-Control: private, no-store');
header('X-Content-Type-Options: nosniff');
// a stored file must never run as a page, whatever its type claims
header("Content-Security-Policy: default-src 'none'; img-src 'self'; object-src 'none'; sandbox");

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'HEAD') {
    exit;
}

echo $plain;

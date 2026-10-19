<?php
/**
 * PHMG file gateway — delete and restore (spec sections 6 and 14).
 *
 * Nothing is erased here. A delete moves the encrypted file into a recycle
 * folder beside the vault, where it stays for 90 days; the purge job is the
 * only thing that removes it, and only a Partner can trigger that from the
 * app.
 */

declare(strict_types=1);

require __DIR__ . '/verify.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    gateway_fail(405, 'POST only');
}

$ticket = gateway_ticket('del');
$key = (string) $ticket['k'];
$restore = !empty($ticket['restore']);
$purge = !empty($ticket['purge']);

$live = gateway_path($key);
$binned = gateway_path($key, true);

$from = $restore ? $binned : $live;
$to = $restore ? $live : $binned;

if ($purge) {
    // the 90-day purge: the only path that actually erases anything
    if (is_file($binned)) {
        @unlink($binned);
        gateway_log('purged', ['key' => $key]);
    }
    header('Content-Type: application/json');
    echo json_encode(['ok' => true, 'purged' => true]);
    exit;
}

if (!is_file($from)) {
    // already where the app wants it; say so rather than failing
    header('Content-Type: application/json');
    echo json_encode(['ok' => true, 'moved' => false]);
    exit;
}

$directory = dirname($to);
if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
    gateway_fail(500, 'Could not create the folder');
}

if (!rename($from, $to)) {
    gateway_fail(500, 'Could not move the file');
}

gateway_log($restore ? 'restored' : 'binned', ['key' => $key]);

header('Content-Type: application/json');
echo json_encode(['ok' => true, 'moved' => true]);

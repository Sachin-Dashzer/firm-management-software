<?php
/**
 * PHMG file gateway — shared ticket checking (spec section 14).
 *
 * Nothing here trusts the caller. Every request carries a ticket the Next.js
 * app signed with a secret only Vercel and this server know; without a valid
 * signature, an unexpired ticket and an operation that matches the script
 * being called, the request is refused before a single byte is read.
 *
 * Deploy this folder to the web root of files.phmgindia.com. The files
 * themselves and the encryption key live OUTSIDE that folder.
 */

declare(strict_types=1);

/** Configuration from a file kept outside the web root. */
function gateway_config(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }

    // one level above the web root: /home/<user>/phmg-gateway-config.php
    $path = dirname(__DIR__) . '/phmg-gateway-config.php';
    if (!is_readable($path)) {
        gateway_fail(500, 'Gateway is not configured');
    }

    /** @var array $config */
    $config = require $path;

    foreach (['shared_secret', 'encryption_key', 'vault_dir', 'allowed_origin'] as $key) {
        if (empty($config[$key])) {
            gateway_fail(500, 'Gateway configuration is incomplete');
        }
    }

    return $config;
}

/** Stop with a status code and a one-line reason. Never leaks detail. */
function gateway_fail(int $status, string $reason): void
{
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode(['error' => $reason]);
    gateway_log('refused', ['status' => $status, 'reason' => $reason]);
    exit;
}

/** One line per request, kept outside the web root. */
function gateway_log(string $event, array $extra = []): void
{
    $config = $GLOBALS['__phmg_config'] ?? null;
    $dir = $config['log_dir'] ?? (dirname(__DIR__) . '/phmg-logs');
    if (!is_dir($dir)) {
        @mkdir($dir, 0700, true);
    }
    $line = json_encode(array_merge([
        'at' => gmdate('c'),
        'event' => $event,
        'ip' => $_SERVER['REMOTE_ADDR'] ?? '',
        'script' => basename($_SERVER['SCRIPT_NAME'] ?? ''),
    ], $extra));
    @file_put_contents($dir . '/gateway-' . gmdate('Y-m') . '.log', $line . "\n", FILE_APPEND | LOCK_EX);
}

/** base64url, so a ticket survives being a query parameter. */
function gateway_b64url_decode(string $value): string
{
    $padded = strtr($value, '-_', '+/');
    $remainder = strlen($padded) % 4;
    if ($remainder) {
        $padded .= str_repeat('=', 4 - $remainder);
    }
    $decoded = base64_decode($padded, true);
    return $decoded === false ? '' : $decoded;
}

/**
 * Check the ticket on this request and return it.
 *
 * @param string $operation "put", "get" or "del"
 */
function gateway_ticket(string $operation): array
{
    $config = gateway_config();
    $GLOBALS['__phmg_config'] = $config;

    // the app's domain is the only origin allowed to call this from a browser
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '' && $origin !== $config['allowed_origin']) {
        gateway_fail(403, 'Origin not allowed');
    }
    header('Access-Control-Allow-Origin: ' . $config['allowed_origin']);
    header('Vary: Origin');
    header('X-Content-Type-Options: nosniff');

    $payload = $_GET['t'] ?? '';
    $signature = $_GET['s'] ?? '';
    if (!is_string($payload) || !is_string($signature) || $payload === '' || $signature === '') {
        gateway_fail(401, 'Missing ticket');
    }

    $expected = hash_hmac('sha256', $payload, $config['shared_secret']);
    if (!hash_equals($expected, $signature)) {
        gateway_fail(401, 'Bad signature');
    }

    $ticket = json_decode(gateway_b64url_decode($payload), true);
    if (!is_array($ticket)) {
        gateway_fail(400, 'Unreadable ticket');
    }

    if (($ticket['op'] ?? '') !== $operation) {
        gateway_fail(403, 'Ticket is not for this operation');
    }

    if ((int) ($ticket['exp'] ?? 0) < time()) {
        gateway_fail(401, 'Ticket has expired');
    }

    $key = $ticket['k'] ?? '';
    if (!is_string($key) || !gateway_key_is_safe($key)) {
        gateway_fail(400, 'Bad file key');
    }

    return $ticket;
}

/**
 * A file key is a relative path we built ourselves. Anything that could climb
 * out of the vault, hide behind a null byte or start at the filesystem root
 * is refused outright rather than normalised.
 */
function gateway_key_is_safe(string $key): bool
{
    if ($key === '' || strlen($key) > 400) {
        return false;
    }
    if (strpos($key, "\0") !== false) {
        return false;
    }
    if ($key[0] === '/' || $key[0] === '.') {
        return false;
    }
    if (strpos($key, '..') !== false) {
        return false;
    }
    return (bool) preg_match('#^[A-Za-z0-9][A-Za-z0-9._/\-]*$#', $key);
}

/** The absolute path a file key points at inside the vault. */
function gateway_path(string $key, bool $recycled = false): string
{
    $config = gateway_config();
    $base = rtrim($config['vault_dir'], '/') . ($recycled ? '/.recycle' : '/files');
    return $base . '/' . $key;
}

/** The 32-byte encryption key, read from outside the web root. */
function gateway_encryption_key(): string
{
    $config = gateway_config();
    $raw = base64_decode($config['encryption_key'], true);
    if ($raw === false || strlen($raw) !== 32) {
        gateway_fail(500, 'Encryption key is not 32 bytes');
    }
    return $raw;
}

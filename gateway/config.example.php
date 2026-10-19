<?php
/**
 * PHMG file gateway configuration.
 *
 * Upload this file to ONE LEVEL ABOVE the gateway's web folder and rename it
 * to `phmg-gateway-config.php`, e.g.
 *
 *     /home/<cpanel-user>/phmg-gateway-config.php          <- this file
 *     /home/<cpanel-user>/files.phmgindia.com/upload.php   <- the gateway
 *     /home/<cpanel-user>/phmg-vault/files/                <- the documents
 *
 * It must never sit inside the web folder: anything in there can be fetched
 * by URL, and this file holds both secrets.
 */

return [
    // Must match STORAGE_SHARED_SECRET in the Vercel environment, exactly.
    'shared_secret' => 'PASTE_THE_SHARED_SECRET_HERE',

    // 32 random bytes, base64-encoded. LOSING THIS MAKES EVERY STORED FILE
    // UNREADABLE FOREVER. Keep a copy in the firm's password manager.
    //   openssl rand -base64 32
    'encryption_key' => 'PASTE_THE_ENCRYPTION_KEY_HERE',

    // Where the documents live. Outside public_html, created by hand,
    // permissions 0700.
    'vault_dir' => '/home/CPANEL_USER/phmg-vault',

    // The only origin a browser may call the gateway from.
    'allowed_origin' => 'https://crm.phmgindia.com',

    // Request log, also outside the web folder.
    'log_dir' => '/home/CPANEL_USER/phmg-logs',
];

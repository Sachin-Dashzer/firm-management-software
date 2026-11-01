# The file gateway on BigRock

The gateway is the small PHP service that holds the firm's documents. The
CRM never stores a file itself: it signs a short-lived ticket and the
browser talks to the gateway directly. That is why the firm's documents can
live on BigRock hosting while the app runs on Vercel.

This document is for the person installing it. Follow it top to bottom.

---

## What you should know before starting

**It has now been run and tested.** Until this round it never had — there is
no PHP on the machine the app is built on, so BigRock was going to be its
first execution ever, with the firm's real documents as the test data. It
has since been run against PHP 8.1.34 and passes 26 checks, including the
encryption round trip, eight path-traversal attempts, ticket forgery, and
the delete/restore/purge lifecycle. See "Testing it before you trust it".

**Two secrets must match exactly** between Vercel and the gateway's config
file, or nothing works:

| Secret | Vercel env var | Gateway config key |
| --- | --- | --- |
| Ticket signing | `STORAGE_SHARED_SECRET` | `shared_secret` |
| File encryption | `STORAGE_ENCRYPTION_KEY` | `encryption_key` |

**Losing `encryption_key` makes every stored document unreadable forever.**
There is no recovery, by design — the files on disk are AES-256-GCM
ciphertext and the key is the only way in. Put it in the firm's password
manager before you use it anywhere.

---

## 1. Create the subdomain

1. Sign in to cPanel.
2. **Domains → Create A New Domain**.
3. Domain: `files.phmgindia.com`.
4. **Untick** "Share document root". Set the document root to
   `files.phmgindia.com` (not inside `public_html`).
5. Create. Note the document root it reports, e.g.
   `/home/phmgindi/files.phmgindia.com`.

## 2. Make the folders

In **File Manager**, in your home folder (one level *above* the document
root), create:

```
/home/<user>/phmg-vault/          the documents themselves
/home/<user>/phmg-vault/files/    live files
/home/<user>/phmg-vault/.recycle/ deleted files, kept 90 days
/home/<user>/phmg-logs/           one line per request
```

Set permissions on `phmg-vault` and `phmg-logs` to **0700** (File Manager →
right-click → Change Permissions → tick only the three "User" boxes).

**Neither folder may be inside the document root.** Anything in there can be
fetched by URL. The vault holds the firm's documents; the log holds file
keys.

## 3. Upload the gateway

Upload these files from the repo's `gateway/` folder into the document root
(`files.phmgindia.com/`), and nothing else:

```
index.php      a 404, so the folder has no front page
upload.php     receives a file
download.php   decrypts and streams one back
delete.php     bin, restore, purge
verify.php     the shared ticket check — a library, not an endpoint
.htaccess      denies verify.php, forces HTTPS, sets security headers
```

Do **not** upload `config.example.php`. It is a template, and a file ending
`.php` in the web root is reachable.

If File Manager hides `.htaccess`: **Settings → Show Hidden Files**. It must
be there — it is what denies `verify.php` and forces HTTPS.

## 4. Write the config file

1. In File Manager, go to your **home folder** — the level above
   `files.phmgindia.com`.
2. **+ File**, named exactly `phmg-gateway-config.php`.
3. Right-click → **Edit**, and paste this, filling in the four values:

```php
<?php
return [
    'shared_secret'   => 'THE SAME STRING AS STORAGE_SHARED_SECRET IN VERCEL',
    'encryption_key'  => 'THE SAME STRING AS STORAGE_ENCRYPTION_KEY IN VERCEL',
    'vault_dir'       => '/home/<user>/phmg-vault',
    'allowed_origin'  => 'https://crm.phmgindia.com',
    'log_dir'         => '/home/<user>/phmg-logs',
];
```

Replace `<user>` with your cPanel username. `allowed_origin` is the CRM's
own address — the only site a browser may call the gateway from.

Need the secrets? `npm run secrets` prints fresh ones. Generate them once,
paste the same values into both Vercel and this file.

4. Set the file's permissions to **0600**.

## 5. Check the PHP version

**cPanel → MultiPHP Manager**, select `files.phmgindia.com`. It needs
**7.4 or newer**; 8.1 or 8.2 is what to aim for. The gateway was verified
against 8.1.34.

Two extensions must be on — **MultiPHP INI Editor → Editor mode**, or
**Select PHP Version → Extensions**:

- `openssl` — AES-256-GCM. Without it no file can be stored or read.
- `fileinfo` — sniffs an upload's real type instead of trusting the browser.

Both are on by default on nearly every cPanel host. Check anyway: if
`openssl` is missing the gateway returns 500 on every upload.

## 6. Point the app at it

In **Vercel → Settings → Environment Variables**, for Production:

| Variable | Value |
| --- | --- |
| `STORAGE_DRIVER` | `bigrock` |
| `STORAGE_GATEWAY_URL` | `https://files.phmgindia.com` |
| `STORAGE_SHARED_SECRET` | the same string as `shared_secret` |
| `STORAGE_ENCRYPTION_KEY` | the same string as `encryption_key` |

Then **redeploy** — environment changes do not reach a running deployment.

`STORAGE_DRIVER` must not be `local` in production. The local driver writes
to the server's own disk, and Vercel's disk is wiped on every deploy, so
every document would silently vanish. The app now refuses to start in
production with `STORAGE_DRIVER=local`, and `npm run doctor` fails on it.

## 7. Testing it before you trust it

Run this from the project, with the two secrets in your environment:

```
node scripts/gateway-smoke.mjs --base-url=https://files.phmgindia.com
```

It uploads a small text file, reads it back and compares the bytes, then
tries to break in: a tampered signature, a download ticket reused to
delete, an expired ticket, eight path-traversal keys, an oversized file, a
disallowed type. Finally it bins, restores and purges its own test file, so
nothing is left behind.

Expect `26 passed, 0 failed`. Anything else means stop and fix it before
the firm uploads a single document. The commonest causes:

| What you see | Almost always |
| --- | --- |
| every check fails to connect | the subdomain's DNS has not propagated yet |
| `500 Gateway is not configured` | `phmg-gateway-config.php` is in the wrong folder, or not readable |
| `500 Encryption key is not 32 bytes` | `encryption_key` was not copied whole, or is not base64 |
| `401 Bad signature` on everything | `shared_secret` differs between Vercel and the config file |
| uploads give 500 | `openssl` is off for this domain |
| the round trip fails but uploads work | the two `encryption_key` values differ |

### Running it locally first

You do not need BigRock to try this. With Docker:

```
mkdir -p .gateway-local/vault/files .gateway-local/vault/.recycle .gateway-local/logs
cat > .gateway-local/phmg-gateway-config.php <<'PHP'
<?php
return [
    'shared_secret'  => getenv('STORAGE_SHARED_SECRET'),
    'encryption_key' => getenv('STORAGE_ENCRYPTION_KEY'),
    'vault_dir'      => getenv('PHMG_VAULT'),
    'allowed_origin' => 'http://127.0.0.1:3000',
    'log_dir'        => getenv('PHMG_LOGS'),
];
PHP

docker compose -f docker-compose.gateway.yml up -d
node scripts/gateway-smoke.mjs --base-url=http://127.0.0.1:8099
docker compose -f docker-compose.gateway.yml down
```

`.gateway-local/` is git-ignored: it holds both secrets and real file bytes.

Without Docker, PHP's own server is enough — the gateway needs no Apache
features except what `.htaccess` adds:

```
php -S 127.0.0.1:8099 -t gateway
```

The one difference is that PHP's dev server ignores `.htaccess`, so
`verify.php` is not denied and HTTPS is not forced. The smoke test knows
this and accepts either result for that single check. Both of those
protections are Apache's, so they are worth re-checking on BigRock itself
once it is up:

```
curl -i https://files.phmgindia.com/verify.php      # expect 403
curl -i http://files.phmgindia.com/index.php        # expect 301 to https
```

## 8. Afterwards

- **Back the vault up.** The documents are not in MongoDB and are not in
  the repo. cPanel → Backup, or the firm's own copy of
  `/home/<user>/phmg-vault`. Ciphertext is useless without
  `encryption_key`, so back that up separately — and not in the same place.
- **Watch the log** for the first week:
  `/home/<user>/phmg-logs/gateway-YYYY-MM.log`, one JSON line per request.
  A run of `refused` entries with `Bad signature` means the secrets have
  drifted apart.
- **The recycle folder empties itself** after 90 days, and only through the
  purge job, which only a Partner can trigger. Nothing else erases a file.

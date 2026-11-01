/**
 * Fresh secrets to paste into Vercel. `npm run secrets`
 *
 * Generated with Node's own CSPRNG, printed once, and never written to a
 * file — a secret in a file is a secret in a backup.
 *
 * **It does not touch the field-encryption key.** `FIELD_ENCRYPTION_KEY`
 * decrypts the portal passwords, bank details and Aadhaar numbers already
 * in the database (spec section 16). Replacing it does not re-encrypt
 * anything; it makes every one of those fields permanently unreadable. So
 * this prints a warning about it rather than a new value, and prints one
 * only when asked for a brand-new installation with --first-time.
 */

import { randomBytes } from "node:crypto";

const firstTime = process.argv.includes("--first-time");

/** 32 bytes, base64 — the shape Auth.js and the gateway both expect. */
const b64 = () => randomBytes(32).toString("base64");
/** 32 bytes, hex — easier to paste into a cron line without quoting. */
const hex = () => randomBytes(32).toString("hex");

const lines = [
  "",
  "  Fresh secrets. Copy each into Vercel → Settings → Environment",
  "  Variables (Production), then redeploy — environment changes do not",
  "  reach a deployment that is already running.",
  "",
  "  Printed once and not saved anywhere. If you lose one, generate a new",
  "  one; nothing in the database depends on these three.",
  "",
  `  AUTH_SECRET=${b64()}`,
  "      Signs the session cookie. Changing it signs everybody out, which",
  "      is all it does.",
  "",
  `  JOBS_SECRET=${hex()}`,
  "      The only lock on /api/jobs/run. Must match the cron job's header",
  "      (DEPLOY.md §2). Hex, so it pastes into a curl line cleanly.",
  "",
  `  STORAGE_SHARED_SECRET=${hex()}`,
  "      Signs the tickets the gateway trusts. **The same string must go",
  "      into the gateway's own config file on BigRock** as",
  "      'shared_secret' (GATEWAY_DEPLOY.md §4). If the two differ, every",
  "      upload and download fails with 'Bad signature'.",
  "",
];

if (firstTime) {
  lines.push(
    "  ─── for a brand-new installation only ───",
    "",
    `  STORAGE_ENCRYPTION_KEY=${b64()}`,
    "      Encrypts the stored documents. Also goes into the gateway's",
    "      config as 'encryption_key'. LOSING IT MAKES EVERY STORED",
    "      DOCUMENT UNREADABLE FOREVER — put it in the firm's password",
    "      manager before using it anywhere.",
    "",
    `  FIELD_ENCRYPTION_KEY=${b64()}`,
    "      Encrypts portal passwords, bank details and Aadhaar numbers in",
    "      the database. Same warning, and worse: there is no file to",
    "      recover from, only the database.",
    "",
  );
} else {
  lines.push(
    "  ─── not printed, on purpose ───",
    "",
    "  FIELD_ENCRYPTION_KEY and STORAGE_ENCRYPTION_KEY are missing from the",
    "  list above because this database already holds data encrypted with",
    "  them: portal passwords, bank details, Aadhaar numbers, stored",
    "  documents. Replacing either does not re-encrypt anything — it makes",
    "  that data permanently unreadable, with no way back.",
    "",
    "  Keep the values you have. They belong in the firm's password",
    "  manager, backed up somewhere other than the database backup.",
    "",
    "  Setting up a brand-new installation with nothing in it yet?",
    "",
    "      npm run secrets -- --first-time",
    "",
  );
}

console.log(lines.join("\n"));

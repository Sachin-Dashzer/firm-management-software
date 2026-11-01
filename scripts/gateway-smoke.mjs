/**
 * Exercise the real PHP file gateway, through the app's own storage driver.
 *
 * **Why this exists.** The gateway is 450 lines of PHP that had never been
 * executed — not once, anywhere. There is no PHP on the machine the app is
 * built on, so BigRock was going to be its first run, with the firm's
 * documents as the test data. Everything the gateway protects is on the
 * other side of code nobody had watched work.
 *
 * It goes through `lib/storage/index.js` rather than building its own
 * requests, so what passes here is the path the app actually uses: the same
 * ticket shape, the same signature, the same URLs. A smoke test that spoke
 * to the gateway directly could pass while the app remained broken.
 *
 *   node scripts/gateway-smoke.mjs --base-url=http://127.0.0.1:8099
 *   node scripts/gateway-smoke.mjs --base-url=https://files.phmgindia.com
 *
 * The secrets must match the gateway's config file: pass them in the
 * environment (STORAGE_SHARED_SECRET, STORAGE_ENCRYPTION_KEY) or let
 * `.env` supply them.
 *
 * It writes and deletes files under a `smoke/` prefix and cleans up after
 * itself. Safe against the live gateway, but it does write to the vault.
 */

import { randomUUID, createHash } from "node:crypto";

const baseUrl = (process.argv.find((a) => a.startsWith("--base-url=")) ?? "")
  .split("=")
  .slice(1)
  .join("=")
  .replace(/\/$/, "");

if (!baseUrl) {
  console.error(
    "\n  Usage: node scripts/gateway-smoke.mjs --base-url=http://127.0.0.1:8099\n",
  );
  process.exit(1);
}

/*
 * Point the driver at the gateway under test before it is imported: it
 * reads STORAGE_DRIVER at call time but the secret check runs on first use,
 * and being explicit here beats depending on what .env happened to say.
 */
process.env.STORAGE_DRIVER = "bigrock";
process.env.STORAGE_GATEWAY_URL = baseUrl;

const storage = await import("../lib/storage/index.js");
const { signTicket } = await import("../lib/storage/tickets.js");

let passed = 0;
let failed = 0;

/**
 * @param {string} name
 * @param {() => Promise<void>} body
 */
async function check(name, body) {
  try {
    await body();
    console.log(`  ok    ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`  FAIL  ${name}`);
    console.log(`          ${error.message}`);
    failed += 1;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** A key under our own prefix, so nothing real is ever touched. */
const run = randomUUID().slice(0, 8);
const key = `smoke/${run}/hello.txt`;
const body = Buffer.from(
  `PHMG gateway smoke test ${new Date().toISOString()}\nrun ${run}\n`,
);
const checksum = createHash("sha256").update(body).digest("hex");

/**
 * POST a file to an upload URL the driver built, the way a browser would.
 * @param {string} url
 * @param {Buffer} bytes
 * @param {string} filename
 * @param {string} type
 */
async function postFile(url, bytes, filename, type) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type }), filename);
  return fetch(url, { method: "POST", body: form });
}

console.log(`\n  Gateway smoke test against ${baseUrl}\n`);

// ─── the happy path ────────────────────────────────────────────────────────

await check("the front page gives nothing away", async () => {
  const response = await fetch(`${baseUrl}/`);
  assert(response.status === 404, `expected 404, got ${response.status}`);
});

await check("verify.php is a library, not an endpoint", async () => {
  const response = await fetch(`${baseUrl}/verify.php`);
  /*
   * Apache denies it through .htaccess (403). PHP's own dev server has no
   * .htaccess, so there it runs as an empty script and returns 200 with no
   * body. Both are acceptable; what must not happen is it doing anything.
   */
  const text = await response.text();
  assert(
    response.status === 403 || text.trim() === "",
    `verify.php answered ${response.status} with a body: ${text.slice(0, 80)}`,
  );
});

await check("an upload is accepted, and reports what it stored", async () => {
  const ticket = storage.getUploadTicket({
    key,
    types: ["text/plain"],
  });
  const response = await postFile(ticket.url, body, "hello.txt", "text/plain");
  const json = await response.json();
  assert(response.ok, `gateway said ${response.status}: ${JSON.stringify(json)}`);
  assert(json.ok === true, `expected ok, got ${JSON.stringify(json)}`);
  assert(json.key === key, `key came back as ${json.key}`);
  assert(
    json.checksum === checksum,
    "the gateway's checksum does not match the bytes we sent",
  );
});

await check("the file is there", async () => {
  assert(await storage.exists(key), "exists() says the file is not there");
});

await check("downloading it gives back exactly what went in", async () => {
  const response = await fetch(
    storage.getDownloadLink({ key, name: "hello.txt", mime: "text/plain" }),
  );
  assert(response.ok, `gateway said ${response.status}`);
  const got = Buffer.from(await response.arrayBuffer());
  assert(
    got.equals(body),
    `got ${got.length} bytes back, sent ${body.length} — encryption round trip is broken`,
  );
});

await check("a download is never rendered in the browser by default", async () => {
  const response = await fetch(storage.getDownloadLink({ key }));
  const disposition = response.headers.get("content-disposition") ?? "";
  assert(
    disposition.startsWith("attachment"),
    `content-disposition was "${disposition}"`,
  );
  assert(
    (response.headers.get("x-content-type-options") ?? "") === "nosniff",
    "nosniff header is missing",
  );
});

// ─── the locks ─────────────────────────────────────────────────────────────

await check("a tampered signature is refused", async () => {
  const link = storage.getDownloadLink({ key });
  const broken = link.replace(/&s=([0-9a-f]+)/, (_, sig) => {
    // flip one hex digit: same length, wrong value
    const flipped = sig[0] === "0" ? `1${sig.slice(1)}` : `0${sig.slice(1)}`;
    return `&s=${flipped}`;
  });
  const response = await fetch(broken);
  assert(response.status === 401, `expected 401, got ${response.status}`);
});

await check("a ticket with no signature is refused", async () => {
  const link = storage.getDownloadLink({ key }).replace(/&s=[0-9a-f]+/, "");
  const response = await fetch(link);
  assert(response.status === 401, `expected 401, got ${response.status}`);
});

await check("a read ticket cannot be used to delete", async () => {
  /*
   * The ticket is honestly signed and perfectly valid — for `get`. Reusing
   * it on delete.php is the attack the `op` field exists to stop, and it is
   * the one a leaked download link would make possible.
   */
  const link = storage.getDownloadLink({ key });
  const query = link.slice(link.indexOf("?"));
  const response = await fetch(`${baseUrl}/delete.php${query}`, {
    method: "POST",
  });
  assert(response.status === 403, `expected 403, got ${response.status}`);
  assert(await storage.exists(key), "the file was deleted by a read ticket");
});

await check("an upload ticket cannot be used to read", async () => {
  const ticket = storage.getUploadTicket({ key });
  const query = ticket.url.slice(ticket.url.indexOf("?"));
  const response = await fetch(`${baseUrl}/download.php${query}`);
  assert(response.status === 403, `expected 403, got ${response.status}`);
});

await check("an expired ticket is refused", async () => {
  const { payload, signature } = signTicket({
    k: key,
    op: "get",
    exp: Math.floor(Date.now() / 1000) - 60,
  });
  const response = await fetch(
    `${baseUrl}/download.php?t=${payload}&s=${signature}`,
  );
  assert(response.status === 401, `expected 401, got ${response.status}`);
});

/**
 * Path traversal, signed properly.
 *
 * `isSafeKey` in the driver would refuse these before building a URL, so
 * they are signed by hand — the point is the gateway's own guard, which is
 * what stands between a leaked secret and the whole filesystem.
 */
const traversals = [
  ["plain ../", "../../../../etc/passwd"],
  ["inside the path", "smoke/../../../etc/passwd"],
  ["url-encoded", "..%2f..%2fetc%2fpasswd"],
  ["double-encoded", "..%252f..%252fetc%252fpasswd"],
  ["backslash", "..\\..\\windows\\win.ini"],
  ["absolute", "/etc/passwd"],
  ["leading dot", ".ssh/id_rsa"],
  ["null byte", "smoke/ok.txt\u0000.php"],
];

for (const [label, badKey] of traversals) {
  await check(`a key that climbs out is refused (${label})`, async () => {
    const { payload, signature } = signTicket({ k: badKey, op: "get" });
    const response = await fetch(
      `${baseUrl}/download.php?t=${payload}&s=${signature}`,
    );
    assert(
      response.status === 400,
      `expected 400 (bad file key), got ${response.status}`,
    );
  });
}

await check("a file bigger than the ticket allows is refused", async () => {
  const bigKey = `smoke/${run}/too-big.txt`;
  const ticket = storage.getUploadTicket({
    key: bigKey,
    maxBytes: 1024,
    types: ["text/plain"],
  });
  const tooBig = Buffer.alloc(4096, 0x41);
  const response = await postFile(ticket.url, tooBig, "big.txt", "text/plain");
  assert(response.status === 413, `expected 413, got ${response.status}`);
  assert(
    !(await storage.exists(bigKey)),
    "the oversized file was stored anyway",
  );
});

await check("a type the ticket does not allow is refused", async () => {
  const phpKey = `smoke/${run}/payload.txt`;
  const ticket = storage.getUploadTicket({
    key: phpKey,
    types: ["application/pdf"],
  });
  const response = await postFile(
    ticket.url,
    Buffer.from("<?php echo 1; ?>"),
    "payload.txt",
    "text/plain",
  );
  assert(response.status === 415, `expected 415, got ${response.status}`);
  assert(!(await storage.exists(phpKey)), "the refused file was stored anyway");
});

await check("an empty file is refused", async () => {
  const emptyKey = `smoke/${run}/empty.txt`;
  const ticket = storage.getUploadTicket({ key: emptyKey, types: ["text/plain"] });
  const response = await postFile(
    ticket.url,
    Buffer.alloc(0),
    "empty.txt",
    "text/plain",
  );
  assert(response.status === 400, `expected 400, got ${response.status}`);
});

// ─── delete, restore, purge ────────────────────────────────────────────────

await check("a delete moves the file to the recycle folder, not oblivion", async () => {
  const result = await storage.remove(key);
  assert(result.ok === true, `delete said ${JSON.stringify(result)}`);
  assert(!(await storage.exists(key)), "the file is still readable after a delete");
});

await check("a restore brings it back, byte for byte", async () => {
  await storage.remove(key, { restore: true });
  assert(await storage.exists(key), "the file did not come back");

  const response = await fetch(storage.getDownloadLink({ key }));
  const got = Buffer.from(await response.arrayBuffer());
  assert(got.equals(body), "the restored file is not what was stored");
});

await check("the purge is the only thing that erases, and it does", async () => {
  await storage.remove(key);
  await storage.remove(key, { purge: true });
  assert(!(await storage.exists(key)), "the file survived a purge");
});

await check("deleting something that is not there is not an error", async () => {
  const result = await storage.remove(`smoke/${run}/never-existed.txt`);
  assert(result.ok === true, `expected ok, got ${JSON.stringify(result)}`);
});

// ─── result ────────────────────────────────────────────────────────────────

console.log(
  `\n  ${passed} passed, ${failed} failed.${failed ? " The gateway is not ready." : " The gateway works."}\n`,
);
process.exit(failed > 0 ? 1 : 0);

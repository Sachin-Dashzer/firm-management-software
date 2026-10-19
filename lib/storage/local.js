// @ts-check

import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { sealFile, openFile } from "./crypto.js";
import { isSafeKey } from "./tickets.js";

/**
 * The local storage driver: the PHP gateway's job, done by the app, for
 * development and the tests.
 *
 * It is not a stub. It checks the same tickets, writes the same encrypted
 * format into the same `files/` and `.recycle/` layout, and refuses the same
 * keys — so an upload exercised here is the upload that will run against
 * BigRock, and a vault written here can be read there.
 */

/** Where the development vault lives; `.storage/` is git-ignored. */
export function vaultDir() {
  return resolve(process.env.STORAGE_LOCAL_DIR || ".storage");
}

function keyPath(key, recycled = false) {
  const base = join(vaultDir(), recycled ? ".recycle" : "files");
  const full = resolve(base, key);
  // belt and braces: the key rule already forbids climbing out, but the
  // resolved path is checked too, because this one writes to a real disk
  if (
    !full.startsWith(resolve(base) + "\\") &&
    !full.startsWith(resolve(base) + "/")
  ) {
    throw new Error("File key escapes the vault");
  }
  return full;
}

function storageKey() {
  const key =
    process.env.STORAGE_ENCRYPTION_KEY || process.env.FIELD_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "STORAGE_ENCRYPTION_KEY is not set (see .env.example); the local vault is encrypted like the real one",
    );
  }
  return key;
}

/**
 * @param {string} key
 * @param {Buffer} bytes
 */
export async function putLocal(key, bytes) {
  if (!isSafeKey(key)) throw new Error("Unsafe file key");
  const path = keyPath(key);
  await mkdir(dirname(path), { recursive: true });
  const sealed = sealFile(bytes, key, storageKey());
  // write beside the target and move into place, as the gateway does
  await writeFile(`${path}.part`, sealed);
  await rename(`${path}.part`, path);
}

/**
 * @param {string} key
 * @returns {Promise<Buffer>}
 */
export async function getLocal(key) {
  if (!isSafeKey(key)) throw new Error("Unsafe file key");
  const sealed = await readFile(keyPath(key));
  return openFile(sealed, key, storageKey());
}

/**
 * @param {string} key
 * @param {{ restore?: boolean, purge?: boolean }} [options]
 */
export async function removeLocal(key, options = {}) {
  if (!isSafeKey(key)) throw new Error("Unsafe file key");
  const live = keyPath(key);
  const binned = keyPath(key, true);

  if (options.purge) {
    await unlink(binned).catch(() => {});
    return { ok: true, purged: true };
  }

  const from = options.restore ? binned : live;
  const to = options.restore ? live : binned;
  try {
    await mkdir(dirname(to), { recursive: true });
    await rename(from, to);
    return { ok: true, moved: true };
  } catch {
    // already where the app wants it
    return { ok: true, moved: false };
  }
}

/** @param {string} key */
export async function existsLocal(key) {
  if (!isSafeKey(key)) return false;
  try {
    await readFile(keyPath(key));
    return true;
  } catch {
    return false;
  }
}

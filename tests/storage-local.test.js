import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The local driver is what development and the Playwright suite run against,
 * so it has to behave like the gateway: encrypted at rest, deletes that move
 * rather than erase, and a purge that is the only thing which destroys.
 */

let vault;
let local;

beforeAll(async () => {
  vault = await mkdtemp(join(tmpdir(), "phmg-vault-"));
  process.env.STORAGE_LOCAL_DIR = vault;
  process.env.STORAGE_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
  local = await import("../lib/storage/local.js");
});

afterAll(async () => {
  await rm(vault, { recursive: true, force: true });
});

const KEY = "clients/PHMG-NOI-0142/FY2026-27/GSTR3B/E1/sales.pdf";
const BYTES = Buffer.from("%PDF-1.7 pretend sales register");

describe("the local vault", () => {
  it("stores and returns the same bytes", async () => {
    await local.putLocal(KEY, BYTES);
    expect((await local.getLocal(KEY)).equals(BYTES)).toBe(true);
  });

  it("writes them encrypted, not as they came in", async () => {
    const onDisk = await readFile(join(vault, "files", KEY));
    expect(onDisk.includes("pretend sales register")).toBe(false);
    expect(onDisk.length).toBe(BYTES.length + 28);
  });

  it("says whether a file is there", async () => {
    expect(await local.existsLocal(KEY)).toBe(true);
    expect(await local.existsLocal("clients/none/missing.pdf")).toBe(false);
  });

  it("moves a delete to the recycle folder instead of erasing it", async () => {
    await local.removeLocal(KEY);
    expect(await local.existsLocal(KEY)).toBe(false);
    // still on disk, just out of the way
    const binned = await readFile(join(vault, ".recycle", KEY));
    expect(binned.length).toBe(BYTES.length + 28);
  });

  it("brings it back intact", async () => {
    await local.removeLocal(KEY, { restore: true });
    expect((await local.getLocal(KEY)).equals(BYTES)).toBe(true);
  });

  it("erases only on an explicit purge", async () => {
    await local.removeLocal(KEY);
    await local.removeLocal(KEY, { purge: true });
    await expect(readFile(join(vault, ".recycle", KEY))).rejects.toThrow();
  });

  it("refuses a key that tries to climb out of the vault", async () => {
    await expect(local.putLocal("../escaped.pdf", BYTES)).rejects.toThrow(
      /Unsafe file key/,
    );
    await expect(local.getLocal("/etc/passwd")).rejects.toThrow(
      /Unsafe file key/,
    );
  });

  it("does not mind deleting something already gone", async () => {
    expect(await local.removeLocal("clients/none/missing.pdf")).toEqual({
      ok: true,
      moved: false,
    });
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import { signTicket, verifyTicket, isSafeKey } from "../lib/storage/tickets.js";
import { sealFile, openFile } from "../lib/storage/crypto.js";
import { buildFileKey, displayName } from "../lib/storage/paths.js";

/**
 * The gateway's other half is PHP on BigRock, which cannot be run here, so
 * these tests pin the contract instead: the exact ticket format the PHP
 * verifies, and the exact byte layout it reads. If either side drifts, these
 * fail before a file is lost.
 */

const SECRET = "a-test-secret-at-least-32-characters-long";
const KEY = Buffer.alloc(32, 7).toString("base64");
const NOW = 1_800_000_000;

beforeEach(() => {
  process.env.STORAGE_SHARED_SECRET = SECRET;
});

describe("the ticket format PHP has to agree with", () => {
  it("signs base64url(JSON) with HMAC-SHA256 in lower-case hex", () => {
    const { payload, signature } = signTicket(
      { k: "clients/A/file.pdf", op: "get", exp: NOW + 60, n: "fixed" },
      { secret: SECRET, now: NOW },
    );

    // exactly what hash_hmac('sha256', $payload, $secret) returns in PHP
    expect(signature).toBe(
      createHmac("sha256", SECRET).update(payload).digest("hex"),
    );
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    // base64url: no +, / or = to mangle in a query string
    expect(payload).not.toMatch(/[+/=]/);

    const decoded = JSON.parse(
      Buffer.from(
        payload.replace(/-/g, "+").replace(/_/g, "/"),
        "base64",
      ).toString(),
    );
    expect(decoded).toEqual({
      k: "clients/A/file.pdf",
      op: "get",
      exp: NOW + 60,
      n: "fixed",
    });
  });

  it("gives every ticket its own nonce and expiry", () => {
    const one = signTicket({ k: "a/b.pdf", op: "put" }, { secret: SECRET });
    const two = signTicket({ k: "a/b.pdf", op: "put" }, { secret: SECRET });
    expect(one.payload).not.toBe(two.payload);
  });
});

describe("checking a ticket", () => {
  const good = () =>
    signTicket(
      { k: "clients/A/file.pdf", op: "get" },
      { secret: SECRET, now: NOW, ttlSeconds: 300 },
    );

  it("accepts one it just signed", () => {
    const { payload, signature } = good();
    const result = verifyTicket(payload, signature, "get", {
      secret: SECRET,
      now: NOW,
    });
    expect(result.ok).toBe(true);
  });

  it("refuses an edited payload", () => {
    const { payload, signature } = good();
    const tampered = Buffer.from(
      JSON.stringify({ k: "clients/B/secret.pdf", op: "get", exp: NOW + 300 }),
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const result = verifyTicket(tampered, signature, "get", {
      secret: SECRET,
      now: NOW,
    });
    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it("refuses a signature from a different secret", () => {
    const { payload } = good();
    const forged = createHmac("sha256", "another-secret-entirely-32-chars!!")
      .update(payload)
      .digest("hex");
    expect(
      verifyTicket(payload, forged, "get", { secret: SECRET, now: NOW }).ok,
    ).toBe(false);
  });

  it("refuses one that has expired", () => {
    const { payload, signature } = good();
    const result = verifyTicket(payload, signature, "get", {
      secret: SECRET,
      now: NOW + 301,
    });
    expect(result).toMatchObject({ ok: false, error: "Ticket has expired" });
  });

  it("refuses a download ticket used to upload", () => {
    const { payload, signature } = good();
    const result = verifyTicket(payload, signature, "put", {
      secret: SECRET,
      now: NOW,
    });
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it("refuses a signature of the wrong length without throwing", () => {
    const { payload } = good();
    expect(
      verifyTicket(payload, "abc", "get", { secret: SECRET, now: NOW }).ok,
    ).toBe(false);
  });
});

describe("file keys", () => {
  it("refuses anything that could climb out of the vault", () => {
    for (const bad of [
      "../etc/passwd",
      "clients/../../etc/passwd",
      "/etc/passwd",
      ".ssh/id_rsa",
      "clients/a\0b.pdf",
      "clients/a b.pdf",
      "clients/a;rm -rf.pdf",
      "",
    ]) {
      expect(isSafeKey(bad), bad).toBe(false);
    }
  });

  it("accepts the keys we build", () => {
    const key = buildFileKey({
      clientCode: "PHMG-NOI-0142",
      filename: "October sales register.xlsx",
      fy: "FY2026-27",
      serviceCode: "GSTR3B",
      engagementCode: "NOI-GSTR3B-2026-10-0412",
    });
    expect(isSafeKey(key)).toBe(true);
    expect(key).toMatch(
      /^clients\/PHMG-NOI-0142\/FY2026-27\/GSTR3B\/NOI-GSTR3B-2026-10-0412\//,
    );
    expect(key.endsWith(".xlsx")).toBe(true);
  });

  it("builds a safe key even from a hostile filename", () => {
    const key = buildFileKey({
      clientCode: "../../root",
      filename: "../../../etc/passwd",
    });
    expect(isSafeKey(key)).toBe(true);
    expect(key).not.toContain("..");
  });

  it("never collides when the same name is uploaded twice", () => {
    const one = buildFileKey({ clientCode: "C1", filename: "scan.pdf" });
    const two = buildFileKey({ clientCode: "C1", filename: "scan.pdf" });
    expect(one).not.toBe(two);
  });

  it("files the permanent file apart from the year folders", () => {
    const key = buildFileKey({
      clientCode: "PHMG-NOI-0142",
      filename: "incorporation.pdf",
      permanent: true,
    });
    expect(key).toContain("/permanent/");
  });

  it("shows the name the person gave, without the id", () => {
    const key = buildFileKey({
      clientCode: "C1",
      filename: "Form 16.pdf",
    });
    expect(displayName(key)).toBe("Form-16.pdf");
  });
});

describe("the stored file layout PHP has to agree with", () => {
  const plain = Buffer.from("A scanned sales register, pretend.");
  const fileKey = "clients/PHMG-NOI-0142/FY2026-27/GSTR3B/E1/file.pdf";

  it("is IV, then tag, then ciphertext", () => {
    const sealed = sealFile(plain, fileKey, KEY);
    expect(sealed.length).toBe(12 + 16 + plain.length);
    expect(openFile(sealed, fileKey, KEY).toString()).toBe(plain.toString());
  });

  it("uses a fresh IV every time", () => {
    const a = sealFile(plain, fileKey, KEY);
    const b = sealFile(plain, fileKey, KEY);
    expect(a.subarray(0, 12).equals(b.subarray(0, 12))).toBe(false);
  });

  it("refuses to decrypt a file that has been edited", () => {
    const sealed = sealFile(plain, fileKey, KEY);
    sealed[sealed.length - 1] ^= 0xff;
    expect(() => openFile(sealed, fileKey, KEY)).toThrow();
  });

  it("refuses to decrypt a file moved to another key", () => {
    // the file key is the AAD, so a file cannot be passed off as another
    const sealed = sealFile(plain, fileKey, KEY);
    expect(() => openFile(sealed, `${fileKey}.other`, KEY)).toThrow();
  });

  it("refuses the wrong encryption key", () => {
    const sealed = sealFile(plain, fileKey, KEY);
    const other = Buffer.alloc(32, 9).toString("base64");
    expect(() => openFile(sealed, fileKey, other)).toThrow();
  });

  it("insists the key is 32 bytes", () => {
    expect(() => sealFile(plain, fileKey, "c2hvcnQ=")).toThrow(/32 bytes/);
  });
});

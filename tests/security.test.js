import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  hashPassword,
  verifyPassword,
  encryptField,
  decryptField,
  maskAllButLast4,
} from "@/lib/crypto";
import {
  newTotpSecret,
  totpUri,
  verifyTotp,
  signChallenge,
  readChallenge,
} from "@/lib/twoFactor";
import {
  isLocked,
  afterFailure,
  MAX_ATTEMPTS,
  LOCK_MINUTES,
} from "@/lib/security/lockout";
import { TOTP, Secret } from "otpauth";

beforeAll(() => {
  process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.AUTH_SECRET = randomBytes(32).toString("base64");
});

describe("passwords", () => {
  it("accepts the right password and rejects the wrong one", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("Correct horse battery", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("salts, so the same password hashes differently every time", async () => {
    const a = await hashPassword("same password here");
    const b = await hashPassword("same password here");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same password here", b)).toBe(true);
  });

  it("refuses to hash something too short to be a password", async () => {
    await expect(hashPassword("short")).rejects.toThrow(/10 characters/);
  });

  it("returns false on a corrupt stored hash instead of throwing", async () => {
    expect(await verifyPassword("anything at all", "garbage")).toBe(false);
    expect(await verifyPassword("anything at all", "")).toBe(false);
    expect(await verifyPassword("anything at all", "bcrypt$x$y")).toBe(false);
  });
});

describe("field encryption", () => {
  it("round-trips a value", () => {
    const secret = "GST portal: phmg_noida / Tr@de2026";
    expect(decryptField(encryptField(secret))).toBe(secret);
  });

  it("produces different ciphertext each time (fresh nonce)", () => {
    expect(encryptField("same")).not.toBe(encryptField("same"));
  });

  it("refuses a tampered value rather than returning rubbish", () => {
    const payload = encryptField("1234-5678-9012");
    const [v, iv, tag, ct] = payload.split(":");
    const flipped = Buffer.from(ct, "base64");
    flipped[0] ^= 0xff;
    expect(() =>
      decryptField([v, iv, tag, flipped.toString("base64")].join(":")),
    ).toThrow();
  });

  it("refuses a value encrypted under a different key", () => {
    const payload = encryptField("bank account 1234");
    process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => decryptField(payload)).toThrow();
  });

  it("complains clearly when the key is missing or the wrong size", () => {
    const saved = process.env.FIELD_ENCRYPTION_KEY;
    delete process.env.FIELD_ENCRYPTION_KEY;
    expect(() => encryptField("x")).toThrow(/FIELD_ENCRYPTION_KEY/);
    process.env.FIELD_ENCRYPTION_KEY =
      Buffer.from("tooshort").toString("base64");
    expect(() => encryptField("x")).toThrow(/32 bytes/);
    process.env.FIELD_ENCRYPTION_KEY = saved;
  });

  it("masks all but the last four digits (Aadhaar)", () => {
    expect(maskAllButLast4("123456789012")).toBe("XXXXXXXX9012");
    expect(maskAllButLast4("9012")).toBe("9012");
    expect(maskAllButLast4("")).toBe("");
  });
});

describe("two-factor codes", () => {
  const email = "owner@phmgindia.com";

  /** Generate the code an authenticator app would show right now. */
  function currentCode(secret) {
    return new TOTP({
      issuer: "PHMG & Associates",
      label: email,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    }).generate();
  }

  it("accepts the code the app is showing", () => {
    const secret = newTotpSecret();
    const result = verifyTotp({ secret, email, code: currentCode(secret) });
    expect(result.ok).toBe(true);
    expect(result.counter).toBeGreaterThan(0);
  });

  it("rejects a code from a different secret", () => {
    const result = verifyTotp({
      secret: newTotpSecret(),
      email,
      code: currentCode(newTotpSecret()),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("wrong");
  });

  it("rejects anything that is not six digits", () => {
    const secret = newTotpSecret();
    for (const code of ["", "12345", "1234567", "abcdef", null, undefined]) {
      expect(verifyTotp({ secret, email, code }).reason).toBe("format");
    }
  });

  it("will not accept the same code twice", () => {
    const secret = newTotpSecret();
    const code = currentCode(secret);
    const first = verifyTotp({ secret, email, code });
    expect(first.ok).toBe(true);

    const replay = verifyTotp({
      secret,
      email,
      code,
      lastCounter: first.counter,
    });
    expect(replay.ok).toBe(false);
    expect(replay.reason).toBe("reused");
  });

  it("builds a QR URI an authenticator app understands", () => {
    const uri = totpUri(newTotpSecret(), email);
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
    expect(decodeURIComponent(uri)).toContain(email);
  });
});

describe("the sign-in challenge", () => {
  it("reads back the user it was issued for", () => {
    expect(readChallenge(signChallenge("user-123"))).toBe("user-123");
  });

  it("rejects a forged or altered challenge", () => {
    const real = signChallenge("user-123");
    expect(readChallenge(real.replace("user-123", "user-999"))).toBeNull();
    expect(readChallenge("user-123.0.0.deadbeef")).toBeNull();
    expect(readChallenge("")).toBeNull();
    expect(readChallenge(real.slice(0, -2))).toBeNull();
  });

  it("rejects one that is older than five minutes", () => {
    const real = signChallenge("user-123");
    const [id, , nonce, mac] = real.split(".");
    const stale = [id, Date.now() - 6 * 60 * 1000, nonce, mac].join(".");
    expect(readChallenge(stale)).toBeNull();
  });

  it("will not verify at all without AUTH_SECRET", () => {
    const saved = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    expect(() => signChallenge("user-123")).toThrow(/AUTH_SECRET/);
    process.env.AUTH_SECRET = saved;
  });
});

describe("the sign-in lockout", () => {
  const now = new Date("2026-10-19T10:00:00Z");

  it("counts failures and locks on the fifth", () => {
    let record = {};
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
      record = afterFailure(record, now);
      expect(record.failedLogins).toBe(attempt);
      expect(record.lockedUntil, `attempt ${attempt}`).toBeNull();
    }

    record = afterFailure(record, now);
    expect(record.failedLogins).toBe(MAX_ATTEMPTS);
    expect(record.lockedUntil).toEqual(
      new Date(now.getTime() + LOCK_MINUTES * 60 * 1000),
    );
  });

  it("reports a live lock and lets it lapse", () => {
    const locked = {
      failedLogins: 5,
      lockedUntil: new Date("2026-10-19T10:05:00Z"),
    };
    expect(isLocked(locked, now)).toBe(true);
    expect(isLocked(locked, new Date("2026-10-19T10:05:01Z"))).toBe(false);
  });

  it("treats a fresh record and a missing one as unlocked", () => {
    expect(isLocked({}, now)).toBe(false);
    expect(isLocked({ failedLogins: 4, lockedUntil: null }, now)).toBe(false);
    expect(isLocked(null, now)).toBe(false);
    expect(isLocked(undefined, now)).toBe(false);
  });

  /**
   * The client portal signs in against `clientUsers` with the same rule
   * (P2-9a). This is the test that the rule is one piece of code and not two.
   */
  it("works on any record with the two fields, not only a User", () => {
    const clientUser = { email: "ops@example.in", failedLogins: 4 };
    expect(afterFailure(clientUser, now).lockedUntil).not.toBeNull();
  });
});

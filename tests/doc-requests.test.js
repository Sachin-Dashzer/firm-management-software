import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  newRequestToken,
  hashRequestToken,
  tokenMatches,
  requestExpiry,
  requestLink,
  REQUEST_DAYS,
} from "../lib/storage/requests.js";

/**
 * The client upload link is the only credential on a page with no sign-in,
 * so these tests are about the three things that keeps honest: the token is
 * unguessable, only its hash is ever stored, and it stops working.
 */

describe("the upload token", () => {
  it("is long and url-safe", () => {
    const token = newRequestToken();
    expect(token.length).toBeGreaterThanOrEqual(42);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("is never the same twice", () => {
    const seen = new Set();
    for (let i = 0; i < 500; i += 1) seen.add(newRequestToken());
    expect(seen.size).toBe(500);
  });

  it("is stored only as a SHA-256 hash", () => {
    const token = newRequestToken();
    const stored = hashRequestToken(token);
    expect(stored).toBe(createHash("sha256").update(token).digest("hex"));
    expect(stored).not.toContain(token);
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
  });

  it("recognises the right token and nothing else", () => {
    const token = newRequestToken();
    const stored = hashRequestToken(token);
    expect(tokenMatches(token, stored)).toBe(true);
    expect(tokenMatches(newRequestToken(), stored)).toBe(false);
    expect(tokenMatches(`${token}x`, stored)).toBe(false);
    expect(tokenMatches(token.slice(0, -1), stored)).toBe(false);
  });

  it("does not throw on nonsense instead of a stored hash", () => {
    expect(tokenMatches("anything", "")).toBe(false);
    expect(tokenMatches("anything", undefined)).toBe(false);
  });
});

describe("expiry and the link", () => {
  it("lasts seven days from when it was made", () => {
    const from = new Date("2026-10-16T09:00:00Z");
    const until = requestExpiry(from);
    expect(REQUEST_DAYS).toBe(7);
    expect(until.getTime() - from.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("points at the public upload page, not the app", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://crm.phmgindia.com";
    const link = requestLink("abc123");
    expect(link).toBe("https://crm.phmgindia.com/upload/abc123");
    // the client-facing page is outside the signed-in area
    expect(link).not.toContain("/clients");
    expect(link).not.toContain("/engagements");
  });

  it("does not double a trailing slash", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://crm.phmgindia.com/";
    expect(requestLink("abc")).toBe("https://crm.phmgindia.com/upload/abc");
  });
});

import { describe, it, expect } from "vitest";
import { config } from "../middleware.js";

/**
 * Which paths the session wall stands in front of.
 *
 * It is one regex in a config object, nobody reads it twice, and getting it
 * wrong fails in the quietest possible way: from go-live until 06-11-2026
 * it matched `/api/jobs/run`, so Vercel Cron was redirected to `/login`
 * every five minutes and not one scheduled job ever ran. Nothing in the
 * app could have told anybody — the queue simply grew.
 */

const matcher = new RegExp(`^${config.matcher[0]}$`);
const walled = (path) => matcher.test(path);

describe("the session wall", () => {
  it("stands in front of the app", () => {
    expect(walled("/clients")).toBe(true);
    expect(walled("/engagements/abc123")).toBe(true);
    expect(walled("/settings/automation")).toBe(true);
    expect(walled("/client/documents")).toBe(true);
  });

  it("lets the front doors through", () => {
    expect(walled("/login")).toBe(false);
    expect(walled("/client/login")).toBe(false);
    expect(walled("/api/auth/session")).toBe(false);
  });

  it("lets the routes that carry their own key through", () => {
    // guarded by JOBS_SECRET, and called by cron, which has no cookie
    expect(walled("/api/jobs/run")).toBe(false);
    // guarded by a signed, short-lived ticket
    expect(walled("/api/storage/local")).toBe(false);
    // and the upload page, whose guard is the request token
    expect(walled("/upload/abcdef123456")).toBe(false);
  });

  it("keeps the wall in front of anything that reads client data", () => {
    expect(walled("/api/search?q=rao")).toBe(true);
  });
});

import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { isId } from "../lib/routes/id.js";
import { runAction, SIGNED_OUT } from "../lib/forms/runAction.js";
import { middleware } from "../middleware.js";

/**
 * The two ways the app used to answer with a developer's error message
 * (QA 09-11-2026, #7 and #8).
 */

describe("an id out of a URL (#7)", () => {
  it("rejects what Mongoose would throw on", () => {
    // /engagements/abc answered 500 "Only plain objects can be passed to
    // Client Components", because a CastError reached the error boundary
    for (const bad of ["abc", "", "   ", "not-an-id", "../etc/passwd", null]) {
      expect(isId(bad), String(bad)).toBe(false);
    }
  });

  it("accepts a real one", () => {
    expect(isId("6730f0c1a2b3c4d5e6f70123")).toBe(true);
  });

  /**
   * An id of the right shape belonging to nothing is a different case: it
   * casts cleanly, matches nothing, and reaches the not-found page from the
   * `if (!doc) notFound()` each route already has.
   */
  it("lets a valid-shaped but missing id through to the not-found page", () => {
    expect(isId("000000000000000000000000")).toBe(true);
  });

  it("asks Mongoose, so it cannot drift from the caster it guards", () => {
    // twenty-four hex characters and nothing else, in this version
    expect(isId("abcdefghijkl")).toBe(false);
    expect(isId("6730f0c1a2b3c4d5e6f7012")).toBe(false);
  });
});

describe("every route that takes an id from a URL (#7)", () => {
  /** The files that read an `id` route parameter, from git rather than a list. */
  const files = execFileSync(
    "git",
    ["grep", "-l", "const { id } = await params;", "--", "app"],
    { encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean);

  it("is a list worth checking", () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it("checks the shape of the id before it queries", () => {
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      const reads = text.match(/const \{ id \} = await params;/g) ?? [];
      const guards = text.match(/if \(!isId\(id\)\)/g) ?? [];
      expect(guards.length, `${file}: ${reads.length} reads`).toBe(
        reads.length,
      );
    }
  });

  it("answers a route handler with a 404 and a page with not-found", () => {
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      const expected = file.endsWith("route.js")
        ? "if (!isId(id)) return notFoundResponse();"
        : "if (!isId(id)) notFound();";
      expect(text, file).toContain(expected);
    }
  });
});

describe("the session wall and a server action (#8)", () => {
  /** Only the four things `middleware` actually reads. */
  const request = ({
    action = false,
    signedIn = false,
    path = "/clients",
  }) => ({
    method: action ? "POST" : "GET",
    headers: new Headers(action ? { "next-action": "abc123" } : {}),
    cookies: { has: () => signedIn },
    nextUrl: new URL(`http://localhost:3000${path}`),
    url: `http://localhost:3000${path}`,
  });

  it("answers a signed-out action with 401, not a page of HTML", () => {
    // the HTML was what produced "An unexpected response was received from
    // the server", and the button appearing to do nothing at all
    const response = middleware(request({ action: true }));
    expect(response.status).toBe(401);
    expect(response.headers.get("x-phmg-signed-out")).toBe("1");
  });

  it("still sends a signed-out page view to the login screen", () => {
    const response = middleware(request({ path: "/engagements/abc" }));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location"));
    expect(location.pathname).toBe("/login");
    // and brings them back to where they were afterwards
    expect(location.searchParams.get("next")).toBe("/engagements/abc");
  });

  it("does not stand in the way of a signed-in action", () => {
    const response = middleware(request({ action: true, signedIn: true }));
    expect(response.status).toBe(200);
  });
});

describe("running a server action from a screen (#8)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** What `/api/auth/session` answers. */
  const session = (user) =>
    vi.fn(async () => ({
      ok: true,
      json: async () => (user ? { user: { name: "Riya" } } : {}),
    }));

  it("passes an answer straight through, undefined included", async () => {
    expect(await runAction(async () => ({ ok: "Saved." }))).toEqual({
      ok: "Saved.",
    });
    // saving() tells "returned nothing" from "was refused" by this, and
    // resets the form only on the first
    expect(await runAction(async () => undefined)).toBeUndefined();
  });

  it("says you have been signed out when that is what happened", async () => {
    vi.stubGlobal("fetch", session(null));
    const result = await runAction(async () => {
      throw new Error("An unexpected response was received from the server");
    });

    expect(result.signedOut).toBe(true);
    expect(result.error).toBe(SIGNED_OUT);
    // and it does not send them away, because that would lose the form
    expect(result.error).not.toMatch(/http|\/login/);
    expect(result.error).toContain("still here");
  });

  it("does not blame the session for an ordinary refusal", async () => {
    vi.stubGlobal("fetch", session(true));
    const result = await runAction(async () => {
      throw new Error("That client no longer exists");
    });

    expect(result.signedOut).toBeUndefined();
    expect(result.error).toBe("That client no longer exists");
  });

  it("does not blame the session when the network is what failed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Failed to fetch");
      }),
    );
    const result = await runAction(async () => {
      throw new Error("Load failed");
    });

    expect(result.signedOut).toBeUndefined();
  });

  it("always has something to show, even for an error with no message", async () => {
    vi.stubGlobal("fetch", session(true));
    const result = await runAction(async () => {
      throw new Error("");
    });
    expect(result.error).toBe("That did not go through. Please try again.");
  });
});

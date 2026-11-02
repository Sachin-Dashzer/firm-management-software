import { defineConfig, devices } from "@playwright/test";
import { assertSafeDb } from "./tests/e2e/assert-safe-db.mjs";

/**
 * **The environment, and the database, are decided before this file runs.**
 *
 * This config used to call `process.loadEnvFile(".env")` itself. That fixed
 * one bug and created a worse one: it made the suite finally see a
 * `MONGODB_URI`, and the one it saw was the firm's live Atlas cluster,
 * which specs then called `Client.deleteMany` against. Two bugs, one line.
 *
 * Both are now handled by `scripts/e2e.mjs` (`npm run test:e2e`), which
 * loads `.env.test` — never `.env` — starts a throwaway replica set and
 * puts its URI in the environment before Playwright is loaded at all. So
 * by the time this file is evaluated, `MONGODB_URI` is already the right
 * answer, and it can be handed to the server under test below.
 *
 * `.env.test` is loaded here too, as a fallback, so a bare
 * `npx playwright test` gets a coherent environment rather than a
 * confusing one — but it carries no `MONGODB_URI`, so a bare run has no
 * database and the guard says so plainly.
 */
try {
  process.loadEnvFile(".env.test");
} catch {
  // committed to the repo; if it is gone the guard below explains the rest
}

/**
 * **The lock, at load time.**
 *
 * Here rather than only in `globalSetup` because `--list`, `--ui` and a
 * `--reporter` that merely collects tests never run global setup, and
 * "refuses to delete the firm's clients" should not depend on which
 * Playwright subcommand was typed.
 */
assertSafeDb("the end-to-end suite");

/**
 * **2FA is always on under test, whatever `.env` says.**
 *
 * `AUTH_SKIP_2FA=true` is the trial-phase escape hatch (`lib/twoFactor.js`):
 * the password alone signs you in and the code box never renders. Thirty-nine
 * specs sign in through their own copy of a helper that waits for that box,
 * so switching the hatch on turned the entire suite red at the same line —
 * and none of those failures were about the thing being tested.
 *
 * The suite's job is to test what goes live, and what goes live has 2FA. So
 * the flag is forced off here rather than patched into thirty-nine helpers,
 * and the hatch stays free to be whatever the owner needs it to be while they
 * are trying the system out.
 *
 * Set before the `webServer` command is spawned, and passed to it
 * explicitly in `webServer.env` below, so the server under test cannot
 * boot with the hatch open.
 */
process.env.AUTH_SKIP_2FA = "false";

/**
 * **Its own port, not 3000.**
 *
 * 3000 is where a developer's `next dev` lives, and that server booted
 * from `.env` — the firm's live database. Sharing the port meant the suite
 * either collided with it or, worse, reused it and drove a browser against
 * production. A port of its own makes both impossible.
 */
const port = process.env.PHMG_TEST_PORT ?? "3147";
const base = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: base },
  globalSetup: "./tests/e2e/global-setup.mjs",
  /**
   * **One worker, on purpose.**
   *
   * These specs are not parallel-safe and cannot cheaply be made so: there
   * is one firm, one `firmSettings` document, one set of branches and one
   * due-date master, and a third of the suite writes to them — the
   * firm-wide pause, the module switches, the ICAI record, a confirmed
   * rule. Six workers against one database and one `next start` also
   * emptied the Mongo connection pool, so pages came back as errors and
   * the failures read like missing features.
   *
   * The proof: `nav.spec.js` passes 6 of 6 alone and failed 5 of 6 inside
   * a six-worker run of the same build. Serial takes longer and tells the
   * truth.
   */
  workers: 1,
  /**
   * **Room for an audited write to Atlas, not room for a slow app.**
   *
   * Playwright's default is five seconds for an assertion and thirty for a
   * test. Every change in this system is a transaction against a replica
   * set in Mumbai — the change, the audit entry and the hash-chain counter,
   * committed together (CLAUDE.md rule 2) — and from a laptop on a home
   * connection one of those is routinely a second or two. A screen that
   * writes a few of them in a row, like posting an announcement to the
   * whole firm, was timing out at five seconds **while still working**, and
   * the failure read as a broken feature.
   *
   * So the budget is raised once, here, rather than with a `timeout:` on
   * each assertion that happens to be slow. What it must not become is a
   * way to not notice that something is genuinely slow: if a test needs
   * more than a few seconds for a single click, that is worth reading the
   * query for.
   */
  timeout: 60_000,
  expect: { timeout: 15_000 },
  projects: [
    { name: "laptop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    command: `npm run build && npm run start -- -p ${port}`,
    url: base,
    /**
     * **The server under test gets the throwaway database explicitly.**
     *
     * Without this it would start from `.env` and serve the firm's live
     * cluster, while the specs wrote their fixtures into the throwaway one.
     * Every assertion would then be read against a different database from
     * the one it set up — and the screens a reviewer looked at would be the
     * real firm's.
     */
    env: {
      MONGODB_URI: process.env.MONGODB_URI ?? "",
      AUTH_SKIP_2FA: "false",
      /**
       * Its own build directory, for the same reason it has its own port: a
       * developer's `next dev` owns `.next`, and `next build` clearing it
       * mid-compile broke the dev server rather than the test run.
       */
      PHMG_DIST_DIR: ".next-e2e",
    },
    /**
     * **Never reuse a server that is already up.**
     *
     * This was `!process.env.CI`, which was the convenience of not waiting
     * for a build and the risk of testing the wrong thing: a `next dev`
     * left running on this port booted from `.env`, so the suite would
     * drive a browser against the firm's data no matter what the specs
     * did. The port below is its own, so there is nothing to collide with
     * and nothing to reuse.
     */
    reuseExistingServer: false,
    /**
     * Ten minutes. `next build` on a machine whose SWC binary is blocked
     * falls back to the WASM compiler and takes several, and a timeout
     * shorter than the build reads as "the server would not start".
     */
    timeout: 600000,
  },
});

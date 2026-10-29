import { defineConfig, devices } from "@playwright/test";

/**
 * **The environment is loaded here, and that is the whole point of this
 * comment.**
 *
 * Every spec in `tests/e2e` starts with
 * `test.skip(!process.env.MONGODB_URI || !process.env.AUTH_SECRET)`, and
 * Playwright does not read `.env` by itself — only `npm run doctor` and
 * `npm run seed` did, through `--env-file-if-exists`. So for twenty-odd
 * steps the whole suite skipped and every report said it was "waiting on
 * Atlas", when the database had been there for weeks and the gate was
 * three missing lines in this file.
 *
 * Loaded in the config process, before the workers are forked, so the
 * tests inherit it.
 */
for (const file of [".env", ".env.local"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // not there, which is fine: the specs then skip themselves
  }
}

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
 * Set before the `webServer` command is spawned, so the server under test
 * inherits it too. If a server is *already* up on the port — `reuseExistingServer`
 * below — it keeps whatever it booted with; use `PHMG_TEST_PORT` to get a
 * fresh one.
 */
process.env.AUTH_SKIP_2FA = "false";

/**
 * The port, so a second server can be run beside one that is already up.
 * On this machine a `next start` from an earlier session cannot be stopped,
 * and it serves the build it booted with — which fails every test about a
 * screen that has changed since.
 */
const port = process.env.PHMG_TEST_PORT ?? "3000";
const base = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: base },
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
    reuseExistingServer: !process.env.CI,
    /**
     * Ten minutes. `next build` on a machine whose SWC binary is blocked
     * falls back to the WASM compiler and takes several, and a timeout
     * shorter than the build reads as "the server would not start".
     */
    timeout: 600000,
  },
});

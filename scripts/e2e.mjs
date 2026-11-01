/**
 * `npm run test:e2e` — the browser suite, against a database it is allowed
 * to destroy.
 *
 * **Why a wrapper and not just `globalSetup`.** The suite needs
 * `MONGODB_URI` to be the throwaway one in three separate processes: the
 * Playwright config (which passes it to the server under test), the
 * `next start` server itself, and every worker, because the specs import
 * the models directly and connect on their own. Playwright evaluates the
 * config — including `webServer.env` — before `globalSetup` runs, so a URI
 * invented in global setup arrives too late for the server, which is the
 * one process that must not be left pointing at `.env`.
 *
 * Starting the replica set out here, before Playwright is loaded at all,
 * removes the ordering question: the environment is simply correct by the
 * time anything reads it. `globalSetup` still runs — it seeds the firm's
 * furniture — but it no longer decides which database that is.
 *
 * Anything after `--` is passed through to Playwright:
 *
 *   npm run test:e2e
 *   npm run test:e2e -- tests/e2e/auth.spec.js
 *   npm run test:e2e -- --project=laptop --reporter=list
 */

import { spawn } from "node:child_process";
import { startLocalDb, stopLocalDb } from "../tests/e2e/local-db.mjs";
import { describeDbSafety } from "../tests/e2e/assert-safe-db.mjs";

/**
 * Only `.env.test` is loaded, and it is loaded here rather than in the
 * Playwright config.
 *
 * The config used to call `process.loadEnvFile(".env")`, which is how the
 * live cluster got into a test run in the first place. The firm's `.env`
 * is not read by this path at all now, so a developer's working
 * environment cannot leak into the suite — and `.env.test` carries no
 * `MONGODB_URI`, so the only answer to that question is the one below.
 */
function loadTestEnv() {
  try {
    process.loadEnvFile(".env.test");
  } catch {
    throw new Error(
      ".env.test is missing. It is committed to the repo — restore it rather than copying .env, which holds the firm's live values.",
    );
  }
}

async function main() {
  loadTestEnv();

  // whatever a shell happened to export: the suite picks its own database
  delete process.env.MONGODB_URI;

  const wantsAtlas = process.env.PHMG_TEST_DB === "atlas";
  if (wantsAtlas) {
    /*
     * The acceptance pass, where the point is the real cluster. The URI has
     * to come from somewhere, and that somewhere is the operator's shell —
     * not `.env` — so saying "use Atlas" is a deliberate two-part act.
     */
    process.env.MONGODB_URI = process.env.PHMG_ATLAS_URI ?? "";
    const verdict = describeDbSafety(process.env.MONGODB_URI);
    console.log(
      `\n  PHMG_TEST_DB=atlas: using PHMG_ATLAS_URI (${verdict.safe ? "local" : "remote"}).`,
    );
    console.log(
      "  The safety guard will refuse this unless E2E_ALLOW_REMOTE_DB is also set.\n",
    );
    return runPlaywright();
  }

  console.log("\n  Starting a throwaway MongoDB replica set…");
  const { uri } = await startLocalDb();
  const host = new URL(uri.replace("mongodb://", "http://")).host;
  console.log(`  Up at ${host} — this database is created and destroyed by this run.\n`);

  try {
    return await runPlaywright();
  } finally {
    await stopLocalDb();
    console.log("\n  Throwaway database stopped.\n");
  }
}

/**
 * Hand over to Playwright, inheriting the environment we just built.
 * @returns {Promise<number>} Playwright's exit code
 */
function runPlaywright() {
  const args = process.argv.slice(2);
  const child = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["playwright", "test", ...args],
    { stdio: "inherit", env: process.env, shell: process.platform === "win32" },
  );

  return new Promise((resolve) => {
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`\n  ${error.message}\n`);
    process.exit(1);
  });

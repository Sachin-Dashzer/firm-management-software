/**
 * Seed the firm's furniture once, before the suite starts.
 *
 * The database itself is started by `scripts/e2e.mjs`, not here — see the
 * note at the top of that file for why the ordering matters. By the time
 * this runs, `MONGODB_URI` already points at a throwaway replica set.
 *
 * The guard is called again anyway. `playwright.config.mjs` checks at load
 * time, which is what makes `--list` refuse, but a check that only happens
 * in one place is a check one refactor away from not happening.
 */

import { assertSafeDb } from "./assert-safe-db.mjs";
import { seedLocalDb } from "./local-db.mjs";

export default async function globalSetup() {
  const uri = assertSafeDb("the end-to-end suite's global setup");
  const host = new URL(uri.replace(/^mongodb(\+srv)?:\/\//, "http://")).host;
  console.log(`  Seeding the firm's furniture into ${host}…`);

  await seedLocalDb();

  /*
   * Mongoose holds the connection open, which keeps the setup process alive
   * past its work. The workers open their own.
   */
  const mongoose = (await import("mongoose")).default;
  await mongoose.disconnect();

  console.log("  Branches, services, due-date rules and templates in place.\n");
}

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

export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://127.0.0.1:3000" },
  projects: [
    { name: "laptop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    command: "npm run build && npm run start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    /**
     * Ten minutes. `next build` on a machine whose SWC binary is blocked
     * falls back to the WASM compiler and takes several, and a timeout
     * shorter than the build reads as "the server would not start".
     */
    timeout: 600000,
  },
});

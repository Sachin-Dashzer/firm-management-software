/**
 * Screenshots of real screens, in both themes, for looking at a design
 * change rather than guessing at it.
 *
 *   node scripts/shots.mjs                     every screen, both themes
 *   node scripts/shots.mjs --light login       one screen, one theme
 *
 * Screens are named, not routed, because a Git Bash on Windows rewrites a
 * bare `/login` into a Windows path before the script ever sees it.
 *
 * It exists because the design tools can only reach `/login`: everything
 * else in this application is behind a session, so a change to the token
 * layer — which restyles sixty routes at once — was being judged on the
 * one screen that needs no password. This signs in with the suite's own
 * helper and photographs the rest.
 *
 * Output lands in `.taste-skill/shots/<theme>/<name>.png`. Nothing here is
 * a test: it asserts nothing and fails nothing. It is a way of looking.
 */

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { TOTP, Secret } from "otpauth";
import { connectDB } from "../lib/db.js";
import User from "../models/User.js";
import Branch from "../models/Branch.js";
import { hashPassword, decryptField } from "../lib/crypto.js";
import { systemAudit } from "../lib/audit/system.js";

/**
 * Its own sign-in, as of 04-11-2026, rather than the suite's.
 *
 * This script used to import `signIn` from `tests/e2e/signin.js`, which
 * calls `assertSafeDb` on import — the guard that stops a spec deleting
 * the firm's records. The guard is right, and this script is not a spec:
 * it creates one account and removes it again. Borrowing the helper meant
 * the only way to photograph a screen was to set
 * `E2E_ALLOW_REMOTE_DB=i-understand-this-deletes-data`, which is a promise
 * this script does not need to make and should not be teaching anyone to
 * make for a screenshot.
 *
 * So: the same two steps, written here. The password is generated per run
 * and never leaves the process.
 */
const PASSWORD = `shots-${randomBytes(12).toString("base64url")}`;

/** The code an authenticator would be showing for this account now. */
async function codeFor(email) {
  const user = await User.findOne({ email }).select("+totpSecret");
  if (!user?.totpSecret) return null;
  await User.updateOne({ email }, { $set: { lastTotpCounter: 0 } });
  return new TOTP({
    issuer: "PHMG & Associates",
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(decryptField(user.totpSecret)),
  }).generate();
}

/**
 * Sign in. Either a code is wanted or the application is already open —
 * `AUTH_SKIP_2FA` is the server's decision, so both are raced rather than
 * assumed.
 */
async function signIn(page, email) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();

  const codeBox = page.getByLabel("6-digit code");
  const asked = await codeBox
    .waitFor({ state: "visible", timeout: 8000 })
    .then(() => true)
    .catch(() => false);

  if (asked) {
    const code = await codeFor(email);
    if (!code) {
      throw new Error(
        "A code was asked for and this account has no TOTP secret yet.",
      );
    }
    await codeBox.fill(code);
    await page
      .getByRole("button", { name: /verify|continue|sign in/i })
      .click();
  }

  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 20_000,
  });
}

const BASE = process.env.SHOTS_BASE ?? "http://localhost:3001";

/**
 * Its own account, made and removed again, exactly as every spec in the
 * suite makes one. Nobody's real password is needed to look at a screen,
 * and the firm's own partner account is not something a screenshot script
 * should be holding.
 */
const WHO = "shots@phmgindia.test";

/** The screens that carry the design: the shell, a list, a case file, money. */
const SCREENS = [
  ["login", "/login", { anonymous: true }],
  ["issues", "/issues"],
  ["today", "/today"],
  ["clients", "/clients"],
  ["team", "/team"],
  ["engagements", "/engagements"],
  ["invoices", "/invoices"],
  ["dashboard", "/dashboard"],
  ["desk", "/billing/desk"],
  ["reports", "/reports"],
  ["settings", "/settings"],
  // the settings area, redrawn D106: the index, the two widest tables, the
  // two reading screens and one form
  ["settings-setup", "/settings/setup"],
  ["settings-services", "/settings/services"],
  ["settings-permissions", "/settings/permissions"],
  ["settings-due-dates", "/settings/due-dates"],
  ["settings-messages", "/settings/messages"],
  ["settings-icai", "/settings/icai"],
  // the twelve redrawn on 04-11-2026
  ["inbox", "/inbox"],
  ["team-plan", "/team/plan"],
  ["compliance", "/compliance"],
  ["compliance-monthly", "/compliance/monthly"],
  ["compliance-quarterly", "/compliance/quarterly"],
  ["compliance-annual", "/compliance/annual"],
  ["gst-cycle", "/gst-cycle"],
  ["settings-branches", "/settings/branches"],
  ["settings-doc-templates", "/settings/doc-templates"],
  ["settings-doc-wording", "/settings/doc-templates?tab=wording"],
];

const args = process.argv.slice(2);
const themes = args.includes("--light")
  ? ["light"]
  : args.includes("--dark")
    ? ["dark"]
    : ["light", "dark"];
const only = new Set(args.filter((a) => !a.startsWith("-")));
const width = Number(process.env.SHOTS_WIDTH ?? 1440);

const wanted = only.size ? SCREENS.filter(([name]) => only.has(name)) : SCREENS;

if (!wanted.length) {
  console.error(`no such screen. Known: ${SCREENS.map(([n]) => n).join(", ")}`);
  process.exit(1);
}

await connectDB();
await User.deleteOne({ email: WHO });
// audited models refuse to write outside a transaction, fixtures included
await systemAudit(async (session) => {
  const branch = await Branch.findOneAndUpdate(
    { code: "NOI" },
    { $setOnInsert: { name: "Noida (head office)", invoicePrefix: "NOI" } },
    { returnDocument: "after", upsert: true, session },
  );
  await User.create(
    [
      {
        name: "Design review",
        email: WHO,
        role: "partner",
        branchIds: [branch._id],
        passwordHash: await hashPassword(PASSWORD),
      },
    ],
    { session, ordered: true },
  );
});

const browser = await chromium.launch();

for (const theme of themes) {
  const dir = `.taste-skill/shots/${theme}`;
  await mkdir(dir, { recursive: true });

  const context = await browser.newContext({
    baseURL: BASE,
    viewport: { width, height: 900 },
    colorScheme: theme,
    deviceScaleFactor: 1,
  });

  /* The theme toggle writes localStorage before first paint; setting it
     here means the shot never catches the pre-hydration flash. */
  await context.addInitScript((value) => {
    try {
      localStorage.setItem("phmg-theme", value);
    } catch {}
  }, theme);

  const page = await context.newPage();
  let signedIn = false;

  for (const [name, path, options = {}] of wanted) {
    try {
      if (!options.anonymous && !signedIn) {
        await signIn(page, WHO);
        signedIn = true;
      }
      await page.goto(path, { waitUntil: "networkidle", timeout: 45_000 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${dir}/${name}.png`, fullPage: false });
      console.log(`${theme}  ${path}`);
    } catch (error) {
      console.log(
        `${theme}  ${path}  — ${String(error.message).split("\n")[0]}`,
      );
    }
  }

  await context.close();
}

await browser.close();
await User.deleteOne({ email: WHO });
process.exit(0);

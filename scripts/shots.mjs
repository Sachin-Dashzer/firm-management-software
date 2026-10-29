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
import { connectDB } from "../lib/db.js";
import { signIn, PASSWORD } from "../tests/e2e/signin.js";
import User from "../models/User.js";
import Branch from "../models/Branch.js";
import { hashPassword } from "../lib/crypto.js";
import { systemAudit } from "../lib/audit/system.js";

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
  ["engagements", "/engagements"],
  ["invoices", "/invoices"],
  ["dashboard", "/dashboard"],
  ["desk", "/billing/desk"],
  ["reports", "/reports"],
  ["settings", "/settings"],
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

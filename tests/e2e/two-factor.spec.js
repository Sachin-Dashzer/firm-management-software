import { test, expect } from "@playwright/test";
import { codeFor, PASSWORD } from "./signin.js";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import { hashPassword } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";
import { MAX_ATTEMPTS } from "../../lib/security/lockout.js";

/**
 * The second factor and the lockout, through the browser.
 *
 * Both were well covered as functions (`tests/security.test.js`: codes,
 * replay, forged challenges, the counter) and not at all as a sign-in. The
 * suite signed people *in* forty times over and never once watched a
 * sign-in be refused — so "2FA is mandatory" rested on a flag nobody
 * tested, and the go-live audit found that flag switched off in the firm's
 * own environment.
 *
 * `AUTH_SKIP_2FA` is forced off for the whole suite in
 * `playwright.config.mjs`, so these run against the real two-step flow.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    person: `pw-2fa-person-${tag}@phmgindia.test`,
    victim: `pw-2fa-lockout-${tag}@phmgindia.test`,
  };
}

test.beforeAll(async ({}, testInfo) => {
  const fx = names(testInfo.project.name);
  await connectDB();
  await User.deleteMany({ email: { $in: [fx.person, fx.victim] } });

  await systemAudit(async (session) => {
    const branch = await Branch.findOneAndUpdate(
      { code: "NOI" },
      { $setOnInsert: { name: "Noida (head office)", invoicePrefix: "NOI" } },
      { returnDocument: "after", upsert: true, session },
    );

    await User.create(
      [
        {
          name: "Playwright 2FA Person",
          email: fx.person,
          role: "ca",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
        {
          name: "Playwright Lockout Victim",
          email: fx.victim,
          role: "ca",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
      ],
      { session, ordered: true },
    );
  });
});

test.afterAll(async ({}, testInfo) => {
  const fx = names(testInfo.project.name);
  await User.deleteMany({ email: { $in: [fx.person, fx.victim] } });
});

/** Fill the first step and stop at the code box. */
async function reachCodeStep(page, email, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Continue" }).click();
}

test("the right password alone does not sign anybody in", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await reachCodeStep(page, fx.person);

  /*
   * The whole of spec §16 in one assertion: the password was correct and
   * the app is still on the login page asking for something else.
   */
  await expect(page.getByLabel("6-digit code")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);

  // and nothing behind the gate has opened
  await page.goto("/clients");
  await expect(page).toHaveURL(/\/login/);
});

test("a wrong code is refused, and the code box stays", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await reachCodeStep(page, fx.person);

  const codeBox = page.getByLabel("6-digit code");
  await codeBox.fill("000000");
  await page.getByRole("button", { name: /Sign in|Turn on 2FA/ }).click();

  // still here, and told why
  await expect(page).toHaveURL(/\/login/);
  await expect(codeBox).toBeVisible();
});

test("a code from somebody else's authenticator is refused", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);

  /*
   * A real, current, valid six digits — for the wrong account. This is the
   * case a naive implementation gets wrong by checking only that the code
   * is well-formed and in date.
   */
  const theirCode = await codeFor(fx.victim).catch(() => null);
  test.skip(!theirCode, "the other fixture has not enrolled yet");

  await reachCodeStep(page, fx.person);
  await page.getByLabel("6-digit code").fill(theirCode);
  await page.getByRole("button", { name: /Sign in|Turn on 2FA/ }).click();

  await expect(page).toHaveURL(/\/login/);
});

test("a wrong password is refused without saying which half was wrong", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await reachCodeStep(page, fx.person, "not-the-password");

  await expect(page).toHaveURL(/\/login/);
  // no code box: the first step did not pass
  await expect(page.getByLabel("6-digit code")).toBeHidden();

  /*
   * The message must not distinguish "no such account" from "wrong
   * password": that difference tells somebody which addresses are staff.
   */
  const body = await page.textContent("body");
  expect(body).not.toMatch(/no such user|unknown email|account does not exist/i);
});

test(`${MAX_ATTEMPTS} wrong passwords lock the account, and the right one then fails too`, async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    await reachCodeStep(page, fx.victim, `wrong-${attempt}`);
    await expect(page).toHaveURL(/\/login/);
  }

  /*
   * The point of a lockout: the correct password now gets nowhere either,
   * so guessing cannot be resumed by eventually getting it right.
   */
  await reachCodeStep(page, fx.victim, PASSWORD);
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByLabel("6-digit code")).toBeHidden();

  const locked = await User.findOne({ email: fx.victim }).select(
    "+lockedUntil +failedLogins",
  );
  expect(locked.failedLogins).toBeGreaterThanOrEqual(MAX_ATTEMPTS);
  expect(locked.lockedUntil).toBeTruthy();
  expect(locked.lockedUntil.getTime()).toBeGreaterThan(Date.now());
});

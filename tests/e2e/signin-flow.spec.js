import { test, expect } from "@playwright/test";
import { alertBox } from "./alerts.js";
import { TOTP, Secret } from "otpauth";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import { hashPassword, decryptField } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";
import { LANDING } from "../../lib/nav/landing.js";

/**
 * The whole sign-in flow against a real database: password, first-time 2FA
 * enrolment, landing in the app, and the Partner-only screen.
 *
 * Skipped until MONGODB_URI is set, so it runs automatically once the firm's
 * Atlas cluster is configured, without blocking the suite before then.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const EMAIL = "playwright-partner@phmgindia.test";
const PASSWORD = "test-password-not-real";

test.beforeAll(async () => {
  await connectDB();
  await User.deleteOne({ email: EMAIL }); // a leftover from a failed run
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
          name: "Playwright Partner",
          email: EMAIL,
          role: "partner",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
      ],
      { session, ordered: true },
    );
  });
});

test.afterAll(async () => {
  await User.deleteOne({ email: EMAIL });
  /**
   * The connection is deliberately left open. Playwright runs several spec
   * files in one worker, one after another, and `connectDB` caches the
   * connection per process — so a spec that closed it took the next spec in
   * that worker down with it. The worker exiting closes it.
   */
});

/** The code the user's authenticator app would be showing. */
async function codeFor(email) {
  const user = await User.findOne({ email }).select("+totpSecret");
  /**
   * An authenticator shows one code per 30 seconds, and the app refuses a
   * code it has already accepted — replay protection, working as spec §16
   * asks. A suite that signs in a dozen times inside one window hits it
   * every time, so the counter is cleared to stand for time having
   * passed. The rule itself is tested in tests/security.test.js.
   */
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

test("a wrong password says nothing useful to an attacker", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill("definitely-not-the-password");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(alertBox(page)).toHaveText("Email or password is not correct.");
  // an unknown email gives exactly the same answer
  await page.getByLabel("Email").fill("nobody@phmgindia.test");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(alertBox(page)).toHaveText("Email or password is not correct.");
});

test("first sign-in sets up 2FA, then lands in the app", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();

  // the QR code and the typed-key fallback are both offered
  await expect(
    page.getByRole("img", { name: "QR code for your authenticator app" }),
  ).toBeVisible();
  await expect(page.getByLabel("6-digit code")).toBeVisible();

  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: /Turn on 2FA/ }).click();
  await expect(alertBox(page)).toContainText("not right");

  await page.getByLabel("6-digit code").fill(await codeFor(EMAIL));
  await page.getByRole("button", { name: /Turn on 2FA/ }).click();

  // where a sign-in lands is `LANDING`, which the login form reads too —
  // the owner moved it from Issues (D43) to the firm dashboard on 29-10-2026
  await expect(page).toHaveURL(new RegExp(`${LANDING}$`));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  /**
   * The menu is a landmark at laptop width and a drawer behind the Menu
   * button on a phone, where the desktop rail is `hidden`. Assert whichever
   * this project renders: the claim is that the signed-in shell has its
   * navigation, not that it has it in one shape.
   */
  await expect(
    page
      .getByRole("navigation", { name: "Main" })
      .or(page.getByRole("button", { name: "Menu" })),
  ).toBeVisible();
});

test("a partner reaches the team screen and can sign out", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("6-digit code").waitFor();
  await page.getByLabel("6-digit code").fill(await codeFor(EMAIL));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${LANDING}$`));

  await page.goto("/settings/users");
  await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
  await expect(
    page.getByRole("cell", { name: /Playwright Partner/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Your profile" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);

  // and the app is closed again
  await page.goto("/today");
  await expect(page).toHaveURL(/\/login/);
});

test("the sign-in appears in the audit log, and the chain is intact", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("6-digit code").waitFor();
  await page.getByLabel("6-digit code").fill(await codeFor(EMAIL));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${LANDING}$`));

  // the old route still works and lands on the renamed screen (P2-10a)
  await page.goto("/audit");
  await expect(page).toHaveURL(/\/portal-log$/);
  await expect(page.getByRole("heading", { name: "Portal log" })).toBeVisible();
  await expect(
    page.getByText("Playwright Partner signed in").first(),
  ).toBeVisible();

  // the hash chain covers every entry written so far
  await page.getByRole("button", { name: "Check for tampering" }).click();
  await expect(page.getByRole("status")).toContainText("chain is intact");
});

test("a wrong password is recorded as a failed sign-in", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill("wrong-on-purpose");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(alertBox(page)).toBeVisible();

  // now sign in properly and look for the failure in the log
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("6-digit code").waitFor();
  await page.getByLabel("6-digit code").fill(await codeFor(EMAIL));
  await page.getByRole("button", { name: "Sign in" }).click();
  // wait for the session before navigating: this `goto` used to race the
  // sign-in and land back on /login with a `next` parameter
  await expect(page).toHaveURL(new RegExp(`${LANDING}$`));

  // the filters travel with the redirect, so a bookmark still works
  await page.goto("/audit?action=login_failed");
  await expect(page).toHaveURL(/\/portal-log\?action=login_failed/);
  await expect(page.getByText(/failed to sign in/).first()).toBeVisible();
});

import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import { TOTP, Secret } from "otpauth";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import { hashPassword, decryptField } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";

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
      { session },
    );
  });
});

test.afterAll(async () => {
  await User.deleteOne({ email: EMAIL });
  await mongoose.disconnect();
});

/** The code the user's authenticator app would be showing. */
async function codeFor(email) {
  const user = await User.findOne({ email }).select("+totpSecret");
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

  await expect(page.getByRole("alert")).toHaveText(
    "Email or password is not correct.",
  );
  // an unknown email gives exactly the same answer
  await page.getByLabel("Email").fill("nobody@phmgindia.test");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Email or password is not correct.",
  );
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
  await expect(page.getByRole("alert")).toContainText("not right");

  await page.getByLabel("6-digit code").fill(await codeFor(EMAIL));
  await page.getByRole("button", { name: /Turn on 2FA/ }).click();

  await expect(page).toHaveURL(/\/today$/);
  await expect(
    page.getByRole("heading", { name: "Today", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
});

test("a partner reaches the team screen and can sign out", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("6-digit code").fill(await codeFor(EMAIL));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/today$/);

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
  await page.getByLabel("6-digit code").fill(await codeFor(EMAIL));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/today$/);

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
  await expect(page.getByRole("alert")).toBeVisible();

  // now sign in properly and look for the failure in the log
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("6-digit code").fill(await codeFor(EMAIL));
  await page.getByRole("button", { name: "Sign in" }).click();

  // the filters travel with the redirect, so a bookmark still works
  await page.goto("/audit?action=login_failed");
  await expect(page).toHaveURL(/\/portal-log\?action=login_failed/);
  await expect(page.getByText(/failed to sign in/).first()).toBeVisible();
});

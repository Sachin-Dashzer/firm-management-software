import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import { TOTP, Secret } from "otpauth";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import DueDateRule from "../../models/DueDateRule.js";
import { hashPassword, decryptField } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";

/**
 * Settings: the sections and "Needs attention" (P2-10b).
 *
 * The strip exists because an unconfirmed due-date rule is invisible until
 * somebody goes looking, so the test that matters is the one that confirms
 * a rule and watches the item leave.
 *
 * Skipped until Atlas is configured, like every other suite.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    partner: `pw-settings-partner-${tag}@phmgindia.test`,
    employee: `pw-settings-employee-${tag}@phmgindia.test`,
    serviceCode: `PWS-${tag.slice(0, 6).toUpperCase()}`,
  };
}

async function wipe(fx) {
  await DueDateRule.deleteMany(
    { serviceCode: fx.serviceCode },
    { withDeleted: true },
  );
  await User.deleteMany({ email: { $in: [fx.partner, fx.employee] } });
}

test.beforeAll(async ({}, testInfo) => {
  const fx = names(testInfo.project.name);
  await connectDB();
  await wipe(fx);

  await systemAudit(async (session) => {
    const branch = await Branch.findOneAndUpdate(
      { code: "NOI" },
      { $setOnInsert: { name: "Noida (head office)", invoicePrefix: "NOI" } },
      { new: true, upsert: true, session },
    );

    await User.create(
      [
        {
          name: "Playwright Settings Partner",
          email: fx.partner,
          role: "partner",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
        {
          name: "Playwright Settings Employee",
          email: fx.employee,
          role: "employee",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
      ],
      { session },
    );

    // one unconfirmed rule, which is what the strip should notice
    await DueDateRule.create(
      [
        {
          serviceCode: fx.serviceCode,
          name: `Playwright settings rule ${testInfo.project.name}`,
          periodType: "monthly",
          dayOfMonth: 20,
          monthOffset: 1,
          source: "Test fixture",
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
    );
  });
});

test.afterAll(async ({}, testInfo) => {
  await wipe(names(testInfo.project.name));
  await mongoose.disconnect();
});

async function signIn(page, email) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();

  const user = await User.findOne({ email }).select("+totpSecret");
  const code = new TOTP({
    issuer: "PHMG & Associates",
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(decryptField(user.totpSecret)),
  }).generate();

  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: /Sign in|Turn on 2FA/ }).click();
  await expect(page).toHaveURL(/\/today$/);
}

test("the unconfirmed rule is on the strip, and leaves it once confirmed", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  await page.goto("/settings");
  const strip = page
    .locator("section")
    .filter({ hasText: "Needs attention" })
    .first();
  await expect(
    strip.getByText(/due-date rules have not been confirmed/),
  ).toBeVisible();

  // the item is a link to where it is fixed
  await strip.getByText(/due-date rules have not been confirmed/).click();
  await expect(page).toHaveURL(/\/settings\/due-dates/);

  // confirm every rule on the screen, including the fixture's
  const buttons = page.getByRole("button", { name: /confirm it/ });
  for (let i = await buttons.count(); i > 0; i -= 1) {
    await buttons.first().click();
    await expect(page.getByText(/confirmed\./)).toBeVisible();
    await page.reload();
  }

  await page.goto("/settings");
  await expect(
    page.getByText(/due-date rules have not been confirmed/),
  ).toHaveCount(0);
});

test("the sections are grouped, not one long column", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto("/settings");

  for (const group of [
    "The firm",
    "The work",
    "The practice",
    "Data and security",
  ]) {
    await expect(page.getByRole("heading", { name: group })).toBeVisible();
  }
});

test("an employee gets neither the strip's items nor the admin groups", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.employee);
  await page.goto("/settings");

  // they can read the service catalog, so they are not turned away
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  // but nothing they cannot act on is put in front of them
  await expect(page.getByText(/have not been confirmed/)).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Data and security" }),
  ).toHaveCount(0);
});

test("the permissions table says what the server enforces", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto("/settings/permissions");

  await expect(
    page.getByRole("heading", { name: "Who can do what" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: /Articled Intern/ }),
  ).toBeVisible();
  // the row for the credentials vault, which no grant below CA can open
  await expect(
    page.getByRole("rowheader", { name: /vault|credential/i }).first(),
  ).toBeVisible();
  // and it is honest about not being editable
  await expect(page.getByText(/cannot be edited here/)).toBeVisible();
});

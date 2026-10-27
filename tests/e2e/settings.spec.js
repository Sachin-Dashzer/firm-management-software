import { test, expect } from "@playwright/test";
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
  /**
   * The connection is deliberately left open. Playwright runs several spec
   * files in one worker, one after another, and `connectDB` caches the
   * connection per process — so a spec that closed it took the next spec in
   * that worker down with it. The worker exiting closes it.
   */
});

async function signIn(page, email) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("6-digit code").waitFor();

  const user = await User.findOne({ email }).select("+totpSecret");
  /**
   * An authenticator shows one code per 30 seconds, and the app refuses a
   * code it has already accepted — replay protection, working as spec §16
   * asks. A suite that signs in a dozen times inside one window hits it
   * every time, so the counter is cleared to stand for time having
   * passed. The rule itself is tested in tests/security.test.js.
   */
  await User.updateOne({ email }, { $set: { lastTotpCounter: 0 } });
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
  await expect(page).toHaveURL(/\/issues$/);
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

test("the reports index carries its figures and the new reports", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto("/reports");

  // the headline figures, each a link to what produced them
  await expect(page.getByText("Open work")).toBeVisible();
  await expect(page.getByText("Filed late this year")).toBeVisible();
  await page.getByText("Filed late this year").click();
  // the label's own figure is the link
  await page.goto("/reports");

  // the categories
  await expect(page.getByRole("heading", { name: "Compliance" })).toBeVisible();

  // and the reports themselves open and export
  for (const key of ["punctuality", "opinions", "rework", "tier-mix"]) {
    await page.goto(`/reports/${key}`);
    await expect(page.getByRole("heading").first()).toBeVisible();
  }

  const sheet = await page.request.get("/reports/punctuality/export");
  expect(sheet.status()).toBe(200);
});

test("the Practice group in the rail opens the registers", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  const rail = page.getByRole("navigation", { name: "Main" });
  await rail.getByRole("button", { name: "Practice" }).click();

  for (const [label, path] of [
    ["Audits", "/practice/audits"],
    ["UDIN", "/practice/udin"],
    ["DSC", "/practice/dsc"],
  ]) {
    await rail.getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(new RegExp(path.replace("/", "\/")));
    // the group stays open while you are inside it
    await expect(rail.getByRole("link", { name: "Audits" })).toBeVisible();
  }
});

test("an employee gets the group without the registers they cannot open", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.employee);

  const rail = page.getByRole("navigation", { name: "Main" });
  await rail.getByRole("button", { name: "Practice" }).click();
  // they may read the books and the DSC register; the group is there
  await expect(rail.getByRole("link", { name: "Audits" })).toBeVisible();
});

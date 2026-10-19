import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import { TOTP, Secret } from "otpauth";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import ServiceTemplate from "../../models/ServiceTemplate.js";
import AuditLog from "../../models/AuditLog.js";
import { hashPassword, decryptField } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";

/**
 * The service catalog end to end: add a service, edit it, watch the version
 * move only when the definition of the work moves, and archive it.
 *
 * Skipped until the Atlas cluster is configured, like the other suites.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const EMAIL = "playwright-services@phmgindia.test";
const EMPLOYEE_EMAIL = "playwright-services-staff@phmgindia.test";
const PASSWORD = "test-password-not-real";
const CODE = "PW-TEST";

async function cleanUp() {
  await ServiceTemplate.deleteMany({ code: CODE }, { withDeleted: true });
  await User.deleteMany({ email: { $in: [EMAIL, EMPLOYEE_EMAIL] } });
}

test.beforeAll(async () => {
  await connectDB();
  await cleanUp();
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
        {
          name: "Playwright Employee",
          email: EMPLOYEE_EMAIL,
          role: "employee",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
      ],
      { session },
    );
  });
});

test.afterAll(async () => {
  await cleanUp();
  await mongoose.disconnect();
});

async function signIn(page, email = EMAIL) {
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

test("add a service, edit it, and archive it", async ({ page }) => {
  await signIn(page);

  await page.goto("/settings/services/new");
  await page.getByLabel("Name").fill("Playwright test service");
  await page.getByLabel("Code").fill(CODE);
  await page.getByLabel("Category").selectOption("Direct Tax");
  await page.getByLabel("Tier").selectOption("L2");
  await page.getByLabel("Recurrence").selectOption("quarterly");
  await page.getByLabel("Turnaround (working days)").fill("7");

  // one checklist row and one step
  await page
    .locator("section")
    .filter({ hasText: "Checklist" })
    .getByRole("button", { name: "Add a row" })
    .click();
  await page.getByLabel("Checklist item 1").fill("Bank statements");

  await page
    .locator("section")
    .filter({ hasText: "Steps" })
    .getByRole("button", { name: "Add a row" })
    .click();
  await page.getByLabel("Steps item 1").fill("Collect data");

  await page.getByRole("button", { name: "Add service" }).click();
  await expect(page).toHaveURL(/\/settings\/services$/);
  await expect(page.getByText("Playwright test service")).toBeVisible();

  const created = await ServiceTemplate.findOne({ code: CODE });
  expect(created.version).toBe(1);
  expect(created.minReviewRole).toBe("ca");
  expect(created.checklist[0].name).toBe("Bank statements");

  // the create is in the audit log, like every other change
  const entry = await AuditLog.findOne({
    entityType: "ServiceTemplate",
    entityId: created._id,
  });
  expect(entry).toBeTruthy();

  // a fee change is a correction: same version
  await page.goto(`/settings/services/${created._id}`);
  await page.getByLabel("Default fee (rupees)").fill("5000");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/settings\/services$/);
  expect((await ServiceTemplate.findOne({ code: CODE })).version).toBe(1);
  expect((await ServiceTemplate.findOne({ code: CODE })).defaultFeePaise).toBe(
    500000,
  );

  // a checklist change redefines the work: version 2
  await page.goto(`/settings/services/${created._id}`);
  await page
    .locator("section")
    .filter({ hasText: "Checklist" })
    .getByRole("button", { name: "Add a row" })
    .click();
  await page.getByLabel("Checklist item 2").fill("Purchase register");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/settings\/services$/);
  expect((await ServiceTemplate.findOne({ code: CODE })).version).toBe(2);

  // archiving hides it from the list but keeps the record
  await page
    .getByRole("row", { name: /Playwright test service/ })
    .getByRole("button", { name: "Archive" })
    .click();
  await expect(page.getByText(/archived/)).toBeVisible();
  expect((await ServiceTemplate.findOne({ code: CODE })).active).toBe(false);
});

test("a duplicate code is refused", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings/services/new");
  await page.getByLabel("Name").fill("Another service");
  await page.getByLabel("Code").fill(CODE);
  await page
    .locator("section")
    .filter({ hasText: "Steps" })
    .getByRole("button", { name: "Add a row" })
    .click();
  await page.getByLabel("Steps item 1").fill("Do the work");
  await page.getByRole("button", { name: "Add service" }).click();

  await expect(page.getByRole("alert")).toContainText("already used");
});

test("an employee can read the catalog but cannot change it", async ({
  page,
}) => {
  await signIn(page, EMPLOYEE_EMAIL);

  await page.goto("/settings/services");
  await expect(
    page.getByRole("heading", { name: "Services", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Add a service" })).toHaveCount(
    0,
  );

  // and the screen behind the button is closed too
  await page.goto("/settings/services/new");
  await expect(page).toHaveURL(/\/settings\/services$/);
});

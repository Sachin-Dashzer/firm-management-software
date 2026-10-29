import { test, expect } from "@playwright/test";
import { signIn, gotoForm } from "./signin.js";
import { alertBox } from "./alerts.js";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import ServiceTemplate from "../../models/ServiceTemplate.js";
import AuditLog from "../../models/AuditLog.js";
import { hashPassword } from "../../lib/crypto.js";
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
      { session, ordered: true },
    );
  });
});

test.afterAll(async () => {
  await cleanUp();
  /**
   * The connection is deliberately left open. Playwright runs several spec
   * files in one worker, one after another, and `connectDB` caches the
   * connection per process — so a spec that closed it took the next spec in
   * that worker down with it. The worker exiting closes it.
   */
});

test("add a service, edit it, and archive it", async ({ page }) => {
  await signIn(page, EMAIL);

  await gotoForm(page, "/settings/services/new");
  await page.getByLabel("Name").fill("Playwright test service");
  await page.getByLabel("Code", { exact: true }).fill(CODE);
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
  await page
    .getByRole("textbox", { name: "Checklist item 1", exact: true })
    .fill("Bank statements");

  await page
    .locator("section")
    .filter({ hasText: "Steps" })
    .getByRole("button", { name: "Add a row" })
    .click();
  await page
    .getByRole("textbox", { name: "Steps item 1", exact: true })
    .fill("Collect data");

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
  await page
    .getByRole("textbox", { name: "Checklist item 2", exact: true })
    .fill("Purchase register");
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
  await signIn(page, EMAIL);
  await gotoForm(page, "/settings/services/new");
  await page.getByLabel("Name").fill("Another service");
  await page.getByLabel("Code", { exact: true }).fill(CODE);
  await page
    .locator("section")
    .filter({ hasText: "Steps" })
    .getByRole("button", { name: "Add a row" })
    .click();
  await page
    .getByRole("textbox", { name: "Steps item 1", exact: true })
    .fill("Do the work");
  await page.getByRole("button", { name: "Add service" }).click();

  await expect(alertBox(page)).toContainText("already used");
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
  await gotoForm(page, "/settings/services/new");
  await expect(page).toHaveURL(/\/settings\/services$/);
});

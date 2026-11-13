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
const UDIN_CODE = "PW-UDIN";

async function cleanUp() {
  await ServiceTemplate.deleteMany(
    { code: { $in: [CODE, UDIN_CODE] } },
    { withDeleted: true },
  );
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

  // one step, and one thing that step needs
  await page.getByRole("button", { name: "Start with one blank step" }).click();
  await page
    .getByRole("textbox", { name: "Step 1 name", exact: true })
    .fill("Collect data");
  await page
    .getByRole("button", { name: "Add something this step needs" })
    .click();
  await page
    .getByRole("textbox", { name: "Step 1 item 1", exact: true })
    .fill("Bank statements");

  await page.getByRole("button", { name: "Create this service" }).click();
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
    .getByRole("button", { name: "Add something this step needs" })
    .click();
  await page
    .getByRole("textbox", { name: "Step 1 item 2", exact: true })
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
  await page.getByRole("button", { name: "Start with one blank step" }).click();
  await page
    .getByRole("textbox", { name: "Step 1 name", exact: true })
    .fill("Do the work");
  await page.getByRole("button", { name: "Create this service" }).click();

  await expect(alertBox(page)).toContainText("already used");
});

/**
 * What a step and a row *are* (owner request, 12-11-2026).
 *
 * The two halves of the same change, checked where they meet: a step marked
 * as the UDIN step is what makes the service one that needs a UDIN — there
 * is no checkbox for that any more — and a row can be a tick or a link
 * rather than a document nobody will ever upload.
 */
test("a UDIN step decides the service's UDIN rule", async ({ page }) => {
  await signIn(page, EMAIL);

  await gotoForm(page, "/settings/services/new");
  await page.getByLabel("Name").fill("Playwright UDIN service");
  await page.getByLabel("Code", { exact: true }).fill(UDIN_CODE);
  await page.getByLabel("Category").selectOption("Certification");

  // the UDIN is not asked for anywhere but on a step
  await expect(page.getByLabel(/A UDIN is required/)).toHaveCount(0);

  await page.getByRole("button", { name: "Start with one blank step" }).click();
  await page
    .getByRole("textbox", { name: "Step 1 name", exact: true })
    .fill("Prepare the working");
  await page.getByRole("button", { name: "Add a step" }).click();
  await page
    .getByRole("textbox", { name: "Step 2 name", exact: true })
    .fill("Generate UDIN");
  await page
    .getByLabel("What kind of step 2 is", { exact: true })
    .selectOption("udin");
  await expect(page.getByText(/stops here until a UDIN/)).toBeVisible();

  // a tick on step one: no file, so no "who provides it" question either
  await page
    .getByRole("button", { name: "Add something this step needs" })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "Step 1 item 1", exact: true })
    .fill("Confirm the purpose with the client");
  await page
    .getByLabel("Step 1 item 1: what kind of thing it is", { exact: true })
    .selectOption("tick");

  await page.getByRole("button", { name: "Create this service" }).click();
  await expect(page).toHaveURL(/\/settings\/services$/);

  const made = await ServiceTemplate.findOne({ code: UDIN_CODE });
  expect(made.steps[1].kind).toBe("udin");
  // derived from the step, not from a box anybody ticked
  expect(made.udinRequired).toBe(true);
  expect(made.checklist[0].kind).toBe("tick");
  expect(made.checklist[0].side).toBe("firm");
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

  /*
   * And the screen behind the button is closed too. A plain goto, not
   * gotoForm: this person is redirected, so there is no form to wait for.
   */
  await page.goto("/settings/services/new");
  await expect(page).toHaveURL(/\/settings\/services$/);
});

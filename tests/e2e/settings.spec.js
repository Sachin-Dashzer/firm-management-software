import { test, expect } from "@playwright/test";
import { signIn } from "./signin.js";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import DueDateRule from "../../models/DueDateRule.js";
import { hashPassword } from "../../lib/crypto.js";
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
      { session, ordered: true },
    );

    // one unconfirmed rule, which is what the strip should notice
    await DueDateRule.create(
      [
        {
          serviceCode: fx.serviceCode,
          name: `Playwright settings rule ${testInfo.project.name}`,
          periodType: "monthly",
          /**
           * The 20th of the month after the period. `dayOfMonth` and
           * `monthOffset` were the shape before step 7b gave the rule a
           * `formula`, and the fixture was never moved across — so this
           * spec's `beforeAll` threw a validation error and none of its
           * tests had ever run.
           */
          formula: { kind: "dayOfMonth", day: 20, monthsAfter: 1 },
          source: "Test fixture",
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
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

/**
 * The registers in the rail.
 *
 * The group was called "Practice" until P3-22a rebuilt the menu; it is
 * "Audit and certificates" now, and the items are the register names rather
 * than the book names. Written against `lib/nav/tree.js` as it stands, which
 * is the file that decides.
 */
test("the audit group in the rail opens the registers", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  const rail = page.getByRole("navigation", { name: "Main" }).first();
  await rail.getByRole("button", { name: "Audit and certificates" }).click();

  for (const [label, path] of [
    ["All files", "/practice/audits"],
    ["UDIN register", "/practice/udin"],
    ["Audit studio", "/practice/audit"],
  ]) {
    await rail.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(path.replace(/\//g, "\/")));
    // the group holding the page you are on stays open
    await expect(
      rail.getByRole("link", { name: "All files", exact: true }).first(),
    ).toBeVisible();
  }
});

test("an employee gets the group without the registers they cannot open", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.employee);

  const rail = page.getByRole("navigation", { name: "Main" }).first();
  // their audit group is shorter and is called what their work is called
  await rail.getByRole("button", { name: "Audit", exact: true }).click();
  await expect(
    rail.getByRole("link", { name: "Certificate studio" }),
  ).toBeVisible();
  // and the firm's registers are not in it
  await expect(rail.getByRole("link", { name: "UDIN register" })).toHaveCount(
    0,
  );
});
test("setting the firm up reads the records, and says what is left", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto("/settings/setup");

  await expect(
    page.getByRole("heading", { name: "Setting the firm up", level: 1 }),
  ).toBeVisible();

  // eight steps, each with the screen that does it behind it
  // inside the page: the rail is a list of items too
  const steps = page.getByRole("main").getByRole("listitem");
  await expect(steps).toHaveCount(8);

  /**
   * The rule this spec's own fixture creates is unconfirmed, so the
   * due-date step must say so — the point of the screen is that it is read
   * from the records rather than ticked off by hand.
   */
  const dueDates = steps.filter({ hasText: "Confirm the due-date rules" });
  await expect(dueDates).toContainText("unconfirmed");
  await dueDates.getByRole("link", { name: "Do it now" }).click();
  await expect(page).toHaveURL(/\/settings\/due-dates$/);
});

test("what this covers counts the menu and owns up to the gaps", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto("/settings/coverage");

  await expect(
    page.getByRole("heading", { name: "What this covers", level: 1 }),
  ).toBeVisible();
  // the groups come from the menu, so the Billing one has to be in the table
  await expect(page.getByRole("cell", { name: "Billing" })).toBeVisible();

  // and the gaps say which kind they are
  await expect(
    page.getByRole("heading", { name: /waiting on a decision/ }),
  ).toBeVisible();
  await expect(page.getByText("WhatsApp to clients")).toBeVisible();
  await expect(page.getByText(/section 18/)).toBeVisible();
});

test("what's new is read from the log, not written up by hand", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  // this spec's own fixture creates a rule and two accounts, so there is
  // always something for the page to have read
  await page.goto("/settings/whats-new");
  await expect(
    page.getByRole("heading", { name: /What.s new/, level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();

  const main = page.getByRole("main");

  /**
   * What the lens promises, which is what is asserted — rather than one
   * particular entry being on the first page, which depends on how much
   * the rest of the suite happened to write today.
   *
   * It shows **changes to how the firm works**…
   */
  await expect(
    main
      .getByText(/created the (team member|due-date rule|firm.s own record)/)
      .first(),
  ).toBeVisible();

  // …and not events: a sign-in is not a change, and it is on the Portal log
  await expect(main.getByText(/signed in/)).toHaveCount(0);

  // …nor the day's work, which is also the Portal log's
  await expect(
    main.getByText(/the (client|invoice|engagement|payment)\b/),
  ).toHaveCount(0);
});

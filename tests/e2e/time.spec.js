import { test, expect } from "@playwright/test";
import { signIn } from "./signin.js";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import TimeEntry from "../../models/TimeEntry.js";
import { hashPassword } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";
import { istInputDate } from "../../lib/dates.js";

/**
 * The timesheet (P3-28).
 *
 * Four things worth a browser, and no more:
 *
 *  - a line is **typed in and lands on the right day**, with the hours
 *    read as hours and not as minutes;
 *  - the **clock runs and records**, which is the one part of this
 *    feature where the browser and the server both hold a figure and they
 *    have to agree;
 *  - an employee sees **their own sheet and not the firm's money** — the
 *    matrix doing its job on a new collection;
 *  - **no rate means no figure**, because the alternative is a made-up
 *    profitability number, which is what this screen must never show.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    partner: `pw-time-partner-${tag}@phmgindia.test`,
    employee: `pw-time-employee-${tag}@phmgindia.test`,
    branchCode: tag.startsWith("l") ? "TML" : "TMP",
    admin: `Playwright admin ${tag}`,
    training: `Playwright training ${tag}`,
  };
}

async function wipe(fx) {
  const people = await User.find({
    email: { $in: [fx.partner, fx.employee] },
  })
    .select("_id")
    .lean();
  if (people.length) {
    await TimeEntry.deleteMany(
      { userId: { $in: people.map((person) => person._id) } },
      { withDeleted: true },
    );
  }
  /* By text as well, for the rows an interrupted run orphaned — see the
     same note in todos.spec.js. */
  await TimeEntry.deleteMany(
    { what: { $in: [fx.admin, fx.training] } },
    { withDeleted: true },
  );
  const branch = await Branch.findOne({ code: fx.branchCode }, null, {
    withDeleted: true,
  });
  if (branch) {
    await TimeEntry.deleteMany({ branchId: branch._id }, { withDeleted: true });
    await Branch.deleteOne({ _id: branch._id }, { withDeleted: true });
  }
  await User.deleteMany({ email: { $in: [fx.partner, fx.employee] } });
}

test.beforeAll(async ({}, testInfo) => {
  const fx = names(testInfo.project.name);
  await connectDB();
  await wipe(fx);

  await systemAudit(async (session) => {
    const [branch] = await Branch.create(
      [
        {
          code: fx.branchCode,
          name: `Playwright ${fx.branchCode}`,
          invoicePrefix: fx.branchCode,
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );

    const [partner] = await User.create(
      [
        {
          name: "Playwright Time Partner",
          email: fx.partner,
          role: "partner",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
      ],
      { session, ordered: true },
    );

    await User.create(
      [
        {
          name: "Playwright Time Employee",
          email: fx.employee,
          role: "employee",
          branchIds: [branch._id],
          reportingTo: partner._id,
          passwordHash: await hashPassword(PASSWORD),
        },
      ],
      { session, ordered: true },
    );
  });
});

test.afterAll(async ({}, testInfo) => {
  await wipe(names(testInfo.project.name));
  /** The connection is left open on purpose — see the other specs. */
});

test("a line is typed in, lands on today, and comes off again", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.employee);

  await page.goto("/team/time");
  await expect(
    page.getByRole("heading", { name: "My timesheet" }),
  ).toBeVisible();

  await page.getByLabel("Hours").fill("2:30");
  await page.getByLabel("If it was not a job, what was it").fill(fx.training);
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect(page.getByText("On the sheet.")).toBeVisible();
  await expect(page.getByText(fx.training)).toBeVisible();
  /* 2:30 is two and a half hours, not two hours thirty. */
  await expect(page.getByText("2.5", { exact: true }).first()).toBeVisible();

  const row = await TimeEntry.findOne({ what: fx.training }).lean();
  expect(row.minutes).toBe(150);
  expect(row.chargeable).toBe(false);
  expect(istInputDate(row.on)).toBe(istInputDate(new Date()));

  await page
    .getByRole("button", { name: new RegExp(`Take off .* ${fx.training}`) })
    .click();
  await expect(page.getByText(fx.training)).toHaveCount(0);

  /* Soft delete, so the hour is still answerable for (rule 3). */
  const kept = await TimeEntry.findOne({ what: fx.training }, null, {
    withDeleted: true,
  }).lean();
  expect(kept.deletedAt).toBeTruthy();
});

test("the clock runs and the server counts the minutes", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.employee);

  /* Started from My tasks, which is where it will actually be used. */
  await page.goto("/my-day");
  await page.getByLabel("Or say what it is").fill(fx.admin);
  await page.getByRole("button", { name: "Start" }).click();

  await expect(page.getByText("Running since")).toBeVisible();
  await expect(page.getByText(fx.admin)).toBeVisible();

  const running = await TimeEntry.findOne({ what: fx.admin }).lean();
  expect(running.startedAt).toBeTruthy();
  expect(running.minutes).toBe(0);

  /* Stopped under a minute records nothing rather than a row of zeros. */
  await page.getByRole("button", { name: /Stop and record/ }).click();
  await expect(page.getByRole("button", { name: "Start" })).toBeVisible();

  const after = await TimeEntry.findOne({ what: fx.admin }, null, {
    withDeleted: true,
  }).lean();
  expect(after.deletedAt).toBeTruthy();
});

test("an employee gets their own sheet and none of the firm's money", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.employee);
  await page.goto("/team/time");

  await expect(
    page.getByRole("heading", { name: "My timesheet" }),
  ).toBeVisible();
  /* Own scope: no utilisation table, no profitability, no other sheets. */
  await expect(
    page.getByRole("heading", { name: /Who recorded what/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /What the time was worth/ }),
  ).toHaveCount(0);
  await expect(page.getByLabel("On whose sheet")).toHaveCount(0);
});

test("with no rate set, the partner is told so instead of shown a figure", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto("/team/time");

  await expect(
    page.getByRole("heading", { name: "Time and profitability" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Who recorded what/ }),
  ).toBeVisible();
  await expect(page.getByText("No hourly rates are set.")).toBeVisible();
});

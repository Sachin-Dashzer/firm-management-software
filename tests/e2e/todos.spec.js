import { test, expect } from "@playwright/test";
import { signIn } from "./signin.js";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import Todo from "../../models/Todo.js";
import { hashPassword } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";
import { istInputDate } from "../../lib/dates.js";

/**
 * To-dos (P3-22c).
 *
 * The three things worth a browser: a to-do can be **written down and
 * ticked off** (the first thing in this system that a person types in and
 * finishes, rather than a reading of records); an employee sees **only
 * their own**, which is the matrix doing its job on a new collection; and
 * one **handed to somebody else** turns up on their list and can be
 * finished by them.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    partner: `pw-todo-partner-${tag}@phmgindia.test`,
    employee: `pw-todo-employee-${tag}@phmgindia.test`,
    branchCode: tag.startsWith("l") ? "TDL" : "TDP",
    clientName: `Playwright To-dos ${tag} Private Limited`,
    ring: `Ring Jaspal about the GST notice ${tag}`,
    bank: `Chase the bank statement ${tag}`,
    handed: `Collect the signed letter ${tag}`,
  };
}

async function wipe(fx) {
  const people = await User.find({
    email: { $in: [fx.partner, fx.employee] },
  })
    .select("_id")
    .lean();
  if (people.length) {
    await Todo.deleteMany(
      { ownerId: { $in: people.map((person) => person._id) } },
      { withDeleted: true },
    );
  }
  /**
   * By title as well as by owner. A run that was interrupted leaves rows
   * whose owner and branch have since been deleted and recreated with new
   * ids, so they are orphans that the two filters above cannot see — and
   * the next run then reads the *old* row back and fails on it.
   */
  await Todo.deleteMany(
    { title: { $in: [fx.ring, fx.bank, fx.handed] } },
    { withDeleted: true },
  );
  await Client.deleteMany({ legalName: fx.clientName }, { withDeleted: true });
  const branch = await Branch.findOne({ code: fx.branchCode }, null, {
    withDeleted: true,
  });
  if (branch) {
    await Todo.deleteMany({ branchId: branch._id }, { withDeleted: true });
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
          name: "Playwright To-do Partner",
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
          name: "Playwright To-do Employee",
          email: fx.employee,
          role: "employee",
          branchIds: [branch._id],
          reportingTo: partner._id,
          passwordHash: await hashPassword(PASSWORD),
        },
      ],
      { session, ordered: true },
    );

    await Client.create(
      [
        {
          code: `PHMG-${fx.branchCode}-0001`,
          legalName: fx.clientName,
          entityType: "Private Limited",
          branchId: branch._id,
          status: "Active",
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
  /** The connection is left open on purpose — see the other specs. */
});

/** The section a to-do is sitting under, by its heading. */
const under = (page, heading) =>
  page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: heading }) });

test("one is written down, lands under today, and is ticked off", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  await page.goto("/todos");
  await expect(page.getByText("Nothing on your list.")).toBeVisible();

  await page.getByLabel("What has to be done").fill(fx.ring);
  await page.getByLabel("By when").fill(istInputDate(new Date()));
  await page.getByLabel("About a client (optional)").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect(page.getByText("Written down.")).toBeVisible();
  await expect(under(page, /Today/).getByText(fx.ring)).toBeVisible();

  // it is on My tasks too, which is the point of the panel
  await page.goto("/my-day");
  await expect(
    page.getByRole("heading", { name: /My to-dos, late or due today/ }),
  ).toBeVisible();
  await expect(page.getByText(fx.ring)).toBeVisible();

  // ticked off from there, and it leaves the panel
  await page.getByRole("checkbox", { name: `Done: ${fx.ring}` }).click();
  await expect(page.getByText("Ticked off.")).toBeVisible();
  await expect(page.getByText(fx.ring)).toHaveCount(0);

  // and it is kept, with who finished it
  await page.goto("/todos");
  await expect(under(page, /Done this week/).getByText(fx.ring)).toBeVisible();
  await expect(
    under(page, /Done this week/).getByText("Playwright To-do Partner"),
  ).toBeVisible();

  const row = await Todo.findOne({ title: fx.ring }).lean();
  expect(row.done).toBe(true);
  expect(row.doneByName).toBe("Playwright To-do Partner");
  expect(row.clientId).toBeTruthy();
});

test("an undated to-do is kept, under no date", async ({ page }, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  await page.goto("/todos");
  await page.getByLabel("What has to be done").fill(fx.bank);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Written down.")).toBeVisible();

  await expect(under(page, /No date/).getByText(fx.bank)).toBeVisible();
});

test("an employee sees their own list and nobody else's", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.employee);

  await page.goto("/todos");
  // the partner's two to-dos from the tests above are not on it
  await expect(page.getByText(fx.bank)).toHaveCount(0);
  await expect(page.getByText(fx.ring)).toHaveCount(0);
  // and there is no "everyone" to switch to
  await expect(page.getByRole("link", { name: "Everyone" })).toHaveCount(0);
});

test("one handed over turns up on their list, and they can finish it", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  await page.goto("/todos");
  await page.getByLabel("What has to be done").fill(fx.handed);
  await page
    .getByLabel("Give it to")
    .selectOption({ label: "Playwright To-do Employee" });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Written down.")).toBeVisible();

  // not on the partner's own list: it is somebody else's now
  await expect(page.getByText(fx.handed)).toHaveCount(0);
  // but on the firm's
  await page.goto("/todos?who=everyone");
  await expect(page.getByText(fx.handed)).toBeVisible();

  await signIn(page, fx.employee);
  await page.goto("/todos");
  await expect(page.getByText(fx.handed)).toBeVisible();
  await page.getByRole("checkbox", { name: `Done: ${fx.handed}` }).click();
  // the row moving to the finished list is the stable end of the action:
  // the banner flashes, and reading the database on the strength of it
  // races the write
  await expect(
    page.getByRole("checkbox", { name: `Put back: ${fx.handed}` }),
  ).toBeVisible();

  const row = await Todo.findOne({ title: fx.handed }).lean();
  expect(row.done).toBe(true);
  expect(row.doneByName).toBe("Playwright To-do Employee");
  expect(row.createdByName).toBe("Playwright To-do Partner");
});

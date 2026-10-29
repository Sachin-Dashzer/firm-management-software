import { test, expect } from "@playwright/test";
import { signIn } from "./signin.js";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import ServiceTemplate from "../../models/ServiceTemplate.js";
import Engagement from "../../models/Engagement.js";
import { hashPassword } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";
import { buildEngagement } from "../../lib/engagements/create.js";
import { periodFor } from "../../lib/engagements/period.js";
import { startOfISTDay } from "../../lib/dates.js";

/**
 * Filing milestones in a browser (P3-1).
 *
 * The one flow worth a browser is the one the old shape could not record:
 * GSTR-1 goes in on time, the engagement stays open, GSTR-3B goes in late,
 * and both facts survive. Everything else about milestones is arithmetic and
 * is covered in tests/milestones.test.js without a database.
 *
 * Skipped until Atlas is configured, like every other suite.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";
const DAY = 86_400_000;

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    ca: `pw-ms-ca-${tag}@phmgindia.test`,
    code: `PWM-${tag.slice(0, 6).toUpperCase()}`,
    clientName: `Playwright Milestones ${tag} Private Limited`,
  };
}

let engagementId = "";

/** GSTR-1 fell a fortnight ago, GSTR-3B five days ago. Both are past. */
const gstr1Due = startOfISTDay(new Date(Date.now() - 14 * DAY));
const gstr3bDue = startOfISTDay(new Date(Date.now() - 5 * DAY));
const gstr1Filed = startOfISTDay(new Date(Date.now() - 15 * DAY));
const gstr3bFiled = startOfISTDay(new Date(Date.now() - 1 * DAY));

async function wipe(fx) {
  const client = await Client.findOne({ legalName: fx.clientName }, null, {
    withDeleted: true,
  });
  if (client) {
    await Engagement.deleteMany(
      { clientId: client._id },
      { withDeleted: true },
    );
    await Client.deleteOne({ _id: client._id }, { withDeleted: true });
  }
  await ServiceTemplate.deleteMany({ code: fx.code }, { withDeleted: true });
  await User.deleteMany({ email: fx.ca });
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

    const [ca] = await User.create(
      [
        {
          name: "Playwright Milestones CA",
          email: fx.ca,
          role: "ca",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
      ],
      { session, ordered: true },
    );

    const [client] = await Client.create(
      [
        {
          code: `PHMG-NOI-8${testInfo.project.name.length}00`,
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

    const [service] = await ServiceTemplate.create(
      [
        {
          name: `Playwright GST pair ${testInfo.project.name}`,
          code: fx.code,
          category: "Indirect Tax",
          level: "L1",
          minExecRole: "intern",
          minReviewRole: "ca",
          recurrence: "monthly",
          checklist: [],
          steps: [{ name: "File the returns" }],
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );

    const period = periodFor("monthly", new Date(Date.now() - 40 * DAY));
    const fields = buildEngagement({ template: service, client, period });

    const [row] = await Engagement.create(
      [
        {
          ...fields,
          code: `PWM-${service.code}`,
          status: "In progress",
          assigneeId: ca._id,
          // the pair the old single-acknowledgement shape could not hold
          milestones: [
            { name: "GSTR-1", ruleKey: "GSTR1", dueDate: gstr1Due },
            { name: "GSTR-3B", ruleKey: "GSTR3B", dueDate: gstr3bDue },
          ],
          statutoryDue: gstr1Due,
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );
    engagementId = String(row._id);
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

const asInput = (date) => date.toISOString().slice(0, 10);

/** The row for one return, so the two forms on the panel never collide. */
const row = (page, name) =>
  page.getByRole("listitem").filter({ hasText: name });

test("each return is filed on its own, and both facts survive", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.ca);
  await page.goto(`/engagements/${engagementId}`);

  // both are listed, both overdue, nothing filed
  await expect(page.getByRole("heading", { name: "Filings" })).toBeVisible();
  await expect(row(page, "GSTR-1")).toContainText("Overdue");
  await expect(row(page, "GSTR-3B")).toContainText("Overdue");

  // file GSTR-1, a day before its deadline
  const first = row(page, "GSTR-1");
  await first.getByLabel("Acknowledgement number").fill("AA0911260001111");
  await first.getByLabel("Filed on").fill(asInput(gstr1Filed));
  await first.getByRole("button", { name: /Record GSTR-1/ }).click();

  await expect(page.getByText(/GSTR-1 recorded on time/)).toBeVisible();
  // the engagement is not finished: the other return is still owing
  await expect(page.getByText(/Part filed — 1 of 2/)).toBeVisible();
  await expect(row(page, "GSTR-1")).toContainText("On time");
  await expect(row(page, "GSTR-3B")).toContainText("Overdue");

  const half = await Engagement.findById(engagementId).lean();
  // half a month's GST is not a filed month
  expect(half.filedOn).toBeNull();
  expect(half.statutoryDue?.getTime()).toBe(gstr3bDue.getTime());

  // file GSTR-3B, four days after its deadline
  const second = row(page, "GSTR-3B");
  await second.getByLabel("Acknowledgement number").fill("AB0911260002222");
  await second.getByLabel("Filed on").fill(asInput(gstr3bFiled));
  await second.getByRole("button", { name: /Record GSTR-3B/ }).click();

  await expect(page.getByText(/4 days late/)).toBeVisible();
  await expect(page.getByText(/Every filing on this work/)).toBeVisible();

  const done = await Engagement.findById(engagementId).lean();
  expect(done.filedOn?.getTime()).toBe(gstr3bFiled.getTime());
  // the pair, recorded truthfully: one punctual, one four days late
  const byName = Object.fromEntries(done.milestones.map((m) => [m.name, m]));
  expect(byName["GSTR-1"].ackNo).toBe("AA0911260001111");
  expect(byName["GSTR-3B"].ackNo).toBe("AB0911260002222");
  expect(byName["GSTR-1"].dueDateAtFiling?.getTime()).toBe(gstr1Due.getTime());
  expect(byName["GSTR-3B"].dueDateAtFiling?.getTime()).toBe(
    gstr3bDue.getTime(),
  );
});

test("a correction keeps the number it replaced", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.ca);
  await page.goto(`/engagements/${engagementId}`);

  const first = row(page, "GSTR-1");
  await first.getByRole("button", { name: "Correct this record" }).click();
  await first
    .getByLabel("Why is this being corrected?")
    .fill("that ARN belonged to the September return");
  await first.getByRole("button", { name: "Correct", exact: true }).click();

  await expect(page.getByText(/GSTR-1 is open again/)).toBeVisible();
  await expect(page.getByText(/1 earlier record, superseded/)).toBeVisible();

  const after = await Engagement.findById(engagementId).lean();
  const gstr1 = after.milestones.find((m) => m.name === "GSTR-1");
  expect(gstr1.filedOn).toBeNull();
  expect(gstr1.ackNo).toBe("");
  // the number the firm reported is kept, with the reason it was wrong
  expect(gstr1.history).toHaveLength(1);
  expect(gstr1.history[0].ackNo).toBe("AA0911260001111");
  expect(gstr1.history[0].reason).toMatch(/September/);
});

import { test, expect } from "@playwright/test";
import { signIn } from "./signin.js";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import Invoice from "../../models/Invoice.js";
import ServiceTemplate from "../../models/ServiceTemplate.js";
import Engagement from "../../models/Engagement.js";
import { hashPassword } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";
import { buildEngagement } from "../../lib/engagements/create.js";
import { periodFor } from "../../lib/engagements/period.js";
import { startOfISTDay } from "../../lib/dates.js";

/**
 * Issues end to end (P3-6).
 *
 * Two things are worth a browser. The first is the promise the page makes:
 * **act on a row and the row goes**, without anybody marking anything
 * resolved and without a page reload. The second is scoping — this is the
 * one screen that gathers what sixty routes are careful about separately,
 * so an employee opening it must not find the firm's money on it.
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
    ca: `pw-iss-ca-${tag}@phmgindia.test`,
    maker: `pw-iss-maker-${tag}@phmgindia.test`,
    code: `PWI-${tag.slice(0, 6).toUpperCase()}`,
    clientName: `Playwright Issues ${tag} Private Limited`,
    invoice: `PWI/${tag.slice(0, 4).toUpperCase()}/0001`,
  };
}

const ids = { engagement: "", client: "", invoice: "" };

async function wipe(fx) {
  const client = await Client.findOne({ legalName: fx.clientName }, null, {
    withDeleted: true,
  });
  if (client) {
    await Engagement.deleteMany(
      { clientId: client._id },
      { withDeleted: true },
    );
    await Invoice.deleteMany({ clientId: client._id }, { withDeleted: true });
    await Client.deleteOne({ _id: client._id }, { withDeleted: true });
  }
  await ServiceTemplate.deleteMany({ code: fx.code }, { withDeleted: true });
  await User.deleteMany({ email: { $in: [fx.ca, fx.maker] } });
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

    const [ca, maker] = await User.create(
      [
        {
          name: "Playwright Issues CA",
          email: fx.ca,
          role: "ca",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
        {
          name: "Playwright Issues Maker",
          email: fx.maker,
          role: "employee",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
      ],
      { session, ordered: true },
    );

    const [client] = await Client.create(
      [
        {
          code: `PHMG-NOI-6${testInfo.project.name.length}00`,
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
    ids.client = String(client._id);

    const [service] = await ServiceTemplate.create(
      [
        {
          name: `Playwright Issues GST ${testInfo.project.name}`,
          code: fx.code,
          category: "Indirect Tax",
          level: "L1",
          minExecRole: "intern",
          minReviewRole: "ca",
          recurrence: "monthly",
          checklist: [
            {
              name: "Sales register for the period",
              side: "client",
              mandatory: true,
            },
          ],
          steps: [{ name: "Reconcile with GSTR-2B" }],
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );

    const period = periodFor("monthly", new Date());
    const fields = buildEngagement({
      template: service,
      client,
      period,
      assigneeId: maker._id,
      reviewerId: ca._id,
    });

    const [row] = await Engagement.create(
      [
        {
          ...fields,
          code: `PWI-${service.code}`,
          status: "In progress",
          // a client upload nobody has checked: one row, with a real button
          /**
           * **Two** uploads nobody has checked, not one.
           *
           * The test below accepts the first, which is what it is for — and
           * with a single item that left the employee test after it with an
           * empty Issues page, so it failed on test order rather than on
           * scoping. The second item is the control: their own work is
           * there, so the money being absent means scoping and not emptiness.
           */
          checklist: [
            {
              name: "Sales register for the period",
              side: "client",
              mandatory: true,
              status: "Received",
              requestedAt: new Date(Date.now() - 5 * DAY),
              receivedAt: new Date(),
              submissionCount: 1,
            },
            {
              name: "Purchase register for the period",
              side: "client",
              mandatory: true,
              status: "Received",
              requestedAt: new Date(Date.now() - 5 * DAY),
              receivedAt: new Date(),
              submissionCount: 1,
            },
          ],
          milestones: [
            {
              name: "GSTR-3B",
              ruleKey: "GSTR3B",
              dueDate: startOfISTDay(new Date(Date.now() + 25 * DAY)),
            },
          ],
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );
    ids.engagement = String(row._id);

    // and one overdue invoice, which is money and so is not an employee's
    const [invoice] = await Invoice.create(
      [
        {
          type: "Tax invoice",
          status: "Sent",
          number: fx.invoice,
          date: new Date(Date.now() - 60 * DAY),
          dueDate: new Date(Date.now() - 30 * DAY),
          clientId: client._id,
          branchId: branch._id,
          billingName: fx.clientName,
          lines: [
            {
              description: "Professional services",
              amountPaise: 1_00_000_00,
              gstRate: 18,
            },
          ],
          totalPaise: 1_18_000_00,
          paidPaise: 0,
          tdsCreditedPaise: 0,
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );
    ids.invoice = String(invoice._id);
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

const upload = (page) =>
  page
    .getByRole("listitem")
    .filter({ hasText: "Upload to check: Sales register" });

test("signing in lands on a real page, and Issues is one click away", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.ca);

  /**
   * This test used to assert that a sign-in lands on Issues, which was D43.
   * The owner changed the landing to the firm dashboard on 29-10-2026, so
   * the URL assertion now lives in `signIn` against `LANDING` and all this
   * one says is that whatever that page is, it rendered. **The decision is
   * worth revisiting**: Issues is the list of everything needing somebody's
   * attention, which is why D43 put a sign-in there.
   */
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.goto("/issues");
  await expect(page.getByRole("heading", { name: "Issues" })).toBeVisible();
  await expect(page.getByText(/nothing to tick off/)).toBeVisible();
});

test("acting on a row makes the row go, with nothing to mark resolved", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.ca);
  // a sign-in lands on the dashboard now, not here (D101)
  await page.goto("/issues");
  await page.getByRole("link", { name: "Everyone" }).click();

  await expect(upload(page)).toBeVisible();
  // there is no way to dismiss a row: the only button is the real action
  await expect(
    page.getByRole("button", { name: /Resolve|Dismiss|Snooze/ }),
  ).toHaveCount(0);

  await upload(page).getByRole("button", { name: "Accept" }).click();

  await expect(page.getByText(/accepted/)).toBeVisible();
  // gone without a reload, because the record behind it changed
  await expect(upload(page)).toHaveCount(0);

  const after = await Engagement.findById(ids.engagement).lean();
  expect(after.checklist[0].status).toBe("Accepted");
});

test("an employee's Issues has none of the firm's money on it", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.maker);
  await page.goto("/issues");
  await page.getByRole("link", { name: "Everyone" }).click();

  // their own work is there — the second upload, which the test above
  // leaves alone
  await expect(
    page.getByText("Upload to check: Purchase register"),
  ).toBeVisible();

  // the overdue invoice is not, on either view, and neither is the group
  await expect(page.getByText(fx.invoice)).toHaveCount(0);
  // the chip carries its count as a badge since D104, so "Money 8", not
  // "Money · 8" — matching on the word alone survives the next redraw
  await expect(page.getByRole("button", { name: /^Money/ })).toHaveCount(0);

  // and a CA does see it, so the absence above is scoping and not an empty list
  await signIn(page, fx.ca);
  await page.goto("/issues");
  await page.getByRole("link", { name: "Everyone" }).click();
  await expect(page.getByText(fx.invoice)).toBeVisible();
});

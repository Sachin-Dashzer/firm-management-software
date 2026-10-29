import { test, expect } from "@playwright/test";
import { signIn } from "./signin.js";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import Comment from "../../models/Comment.js";
import Notification from "../../models/Notification.js";
import ServiceTemplate from "../../models/ServiceTemplate.js";
import Engagement from "../../models/Engagement.js";
import { hashPassword } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";
import { buildEngagement } from "../../lib/engagements/create.js";
import { periodFor } from "../../lib/engagements/period.js";

/**
 * Mentions, the inbox and Notify's preview (P3-17a).
 *
 * The flow worth a browser is the one that was broken for twelve steps:
 * type a colleague's name into a comment and see it arrive in their inbox.
 * The matching rules are arithmetic and live in tests/inbox.test.js.
 *
 * Skipped until Atlas is configured, like every other suite.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    tag,
    /** A first name nobody else in the test data shares, so @handle is exact. */
    handle: `inbox${tag}`,
    partner: `pw-inbox-partner-${tag}@phmgindia.test`,
    ca: `pw-inbox-ca-${tag}@phmgindia.test`,
    code: `PWI-${tag.slice(0, 6).toUpperCase()}`,
    clientName: `Playwright Inbox ${tag} Private Limited`,
  };
}

let engagementId = "";

async function wipe(fx) {
  const client = await Client.findOne({ legalName: fx.clientName }, null, {
    withDeleted: true,
  });
  if (client) {
    await Engagement.deleteMany(
      { clientId: client._id },
      { withDeleted: true },
    );
    await Comment.deleteMany({ clientId: client._id }, { withDeleted: true });
    await Client.deleteOne({ _id: client._id }, { withDeleted: true });
  }
  await ServiceTemplate.deleteMany({ code: fx.code }, { withDeleted: true });
  const people = await User.find({ email: { $in: [fx.partner, fx.ca] } });
  await Notification.deleteMany({ userId: { $in: people.map((p) => p._id) } });
  await User.deleteMany({ email: { $in: [fx.partner, fx.ca] } });
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

    const [partner, ca] = await User.create(
      [
        {
          name: "Playwright Inbox Partner",
          email: fx.partner,
          role: "partner",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
        {
          // the first name is the @handle, and it is unique in the data
          name: `${fx.handle} Nair`,
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
          code: `PHMG-NOI-6${testInfo.project.name.length}00`,
          legalName: fx.clientName,
          entityType: "Private Limited",
          branchId: branch._id,
          status: "Active",
          contacts: [
            {
              name: "Suresh Agarwal",
              designation: "Director",
              email: "suresh@example.test",
              isPrimary: true,
            },
          ],
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );

    const [service] = await ServiceTemplate.create(
      [
        {
          name: `Playwright inbox GST ${testInfo.project.name}`,
          code: fx.code,
          category: "Indirect Tax",
          level: "L2",
          minExecRole: "intern",
          minReviewRole: "ca",
          recurrence: "monthly",
          checklist: [],
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
      assigneeId: partner._id,
      reviewerId: ca._id,
    });

    const [row] = await Engagement.create(
      [
        {
          ...fields,
          code: `PWI-${service.code}`,
          status: "In progress",
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

test("a mention arrives in the inbox, and can be put off without being lost", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);

  await signIn(page, fx.partner);
  await page.goto(`/engagements/${engagementId}`);

  await page
    .getByPlaceholder("Type @ and a name to mention someone")
    .fill(`@${fx.handle} the reconciliation is ready for you`);
  await page.getByRole("button", { name: "Add comment" }).click();
  await expect(page.getByRole("status")).toContainText(/was told/);

  // the preview says exactly what each person would get, before sending
  await page.getByText("Reviewing it").click();
  await page.getByLabel("Subject").fill("October figures");
  await page
    .getByLabel("Message")
    .fill("The October figures are ready for review.");
  await page
    .getByRole("button", { name: "Show me what they will get" })
    .click();
  await expect(
    page.getByText("The October figures are ready for review."),
  ).toBeVisible();

  // the colleague finds the mention in their inbox, under Mentions
  await page.context().clearCookies();
  await signIn(page, fx.ca);
  await page.goto("/inbox");
  await expect(page.getByText(/mentioned you/)).toBeVisible();

  await page.getByRole("button", { name: "Mentions", exact: false }).click();
  await expect(page.getByText(/mentioned you/)).toBeVisible();

  // snoozed: out of the list, not gone
  await page.getByRole("button", { name: "snooze" }).first().click();
  await page.getByRole("button", { name: "3 hours" }).click();
  await expect(page.getByText(/mentioned you/)).toHaveCount(0);

  await page.getByRole("button", { name: /1 snoozed/ }).click();
  await expect(page.getByText(/mentioned you/)).toBeVisible();
  await page.getByRole("button", { name: "bring it back" }).click();
  await expect(page.getByText(/snoozed until/)).toHaveCount(0);
});

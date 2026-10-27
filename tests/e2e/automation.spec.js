import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import { TOTP, Secret } from "otpauth";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import SendBatch from "../../models/SendBatch.js";
import NotificationRule from "../../models/NotificationRule.js";
import FirmSettings from "../../models/FirmSettings.js";
import MessageLog from "../../models/MessageLog.js";
import { hashPassword, decryptField } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";

/**
 * The automation gate in a browser (P3-10).
 *
 * The flow worth a browser is the one that crosses the gate: a batch the
 * sweep has queued, a partner reading **the message the client would read**
 * rather than a template, and the send happening only after they say so.
 *
 * The batch is created directly here rather than by running the sweep: what
 * the sweep decides to chase is `tests/gate.test.js` and `tests/sweep` work,
 * and this is about the approval.
 *
 * Skipped until Atlas is configured, like every other suite.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    partner: `pw-auto-partner-${tag}@phmgindia.test`,
    ca: `pw-auto-ca-${tag}@phmgindia.test`,
    clientName: `Playwright Automation ${tag} Private Limited`,
    email: `pw-auto-client-${tag}@example.test`,
  };
}

const ids = { client: "", batch: "" };

async function wipe(fx) {
  const client = await Client.findOne({ legalName: fx.clientName }, null, {
    withDeleted: true,
  });
  if (client) {
    await SendBatch.deleteMany({ "items.clientId": client._id });
    await MessageLog.deleteMany({ clientId: String(client._id) });
    await Client.deleteOne({ _id: client._id }, { withDeleted: true });
  }
  await SendBatch.deleteMany({ "preview.to": fx.email });
  await User.deleteMany({ email: { $in: [fx.partner, fx.ca] } });
  await NotificationRule.deleteOne({ key: "documentsPending" });
  await FirmSettings.updateOne(
    { key: "firm" },
    { $set: { automationPaused: false } },
  );
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
          name: "Playwright Automation Partner",
          email: fx.partner,
          role: "partner",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
        {
          name: "Playwright Automation CA",
          email: fx.ca,
          role: "ca",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
      ],
      { session },
    );

    const [client] = await Client.create(
      [
        {
          code: `PHMG-NOI-4${testInfo.project.name.length}00`,
          legalName: fx.clientName,
          entityType: "Private Limited",
          branchId: branch._id,
          status: "Active",
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
    );
    ids.client = String(client._id);

    /**
     * A batch as the sweep would have left it: queued, with the first real
     * message rendered and one recipient named. Its `about` points at
     * nothing, so `stillWanted` cancels it on send — which is the honest
     * behaviour and is asserted below.
     */
    const [batch] = await SendBatch.create(
      [
        {
          rule: "documentsPending",
          status: "queued",
          why: "This rule is not trusted yet, so a partner sees it before it goes.",
          items: [
            {
              to: fx.email,
              clientId: client._id,
              clientName: fx.clientName,
              rule: "documentsPending",
              dedupeKey: `pw-auto-${testInfo.project.name}`,
              values: { client: fx.clientName, items: "Bank statement" },
              about: {},
            },
          ],
          preview: {
            to: fx.email,
            subject: "We are still waiting for some papers",
            body: "Dear client, we are still waiting for the bank statement.",
          },
          createdBy: "system",
          updatedBy: "system",
        },
      ],
      { session },
    );
    ids.batch = String(batch._id);
  });
});

test.afterAll(async ({}, testInfo) => {
  await wipe(names(testInfo.project.name));
  await mongoose.disconnect();
});

async function signIn(page, email) {
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
  await expect(page).toHaveURL(/\/issues$/);
}

test("a CA sees the queue but cannot decide it", async ({ page }, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.ca);
  await page.goto("/settings/automation");

  await expect(page.getByText(/Waiting for you · 1/)).toBeVisible();
  // the message is readable — a CA should know what is going out
  await expect(
    page.getByText("We are still waiting for some papers"),
  ).toBeVisible();
  // but the decision is a partner's
  await expect(
    page.getByRole("button", { name: "Approve and send" }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/only a\s+Partner \/ Admin can change this/).first(),
  ).toBeVisible();
});

test("a partner reads the real message, the recipients, and then approves", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto("/settings/automation");

  // the preview is the message a client will read, not a template
  await expect(
    page.getByText("Dear client, we are still waiting for the bank statement."),
  ).toBeVisible();
  await expect(page.getByText(/^\{/)).toHaveCount(0);

  // and every recipient is named, because "1 client" is not checkable
  await page.getByText(/Everybody it would go to \(1\)/).click();
  await expect(page.getByText(fx.email).first()).toBeVisible();

  await page.getByRole("button", { name: "Approve and send" }).click();
  await expect(page.getByText(/no longer needed|sent/)).toBeVisible();

  const after = await SendBatch.findById(ids.batch).lean();
  expect(after.status).toBe("sent");
  expect(after.decidedByName).toBe("Playwright Automation Partner");
  expect(after.items[0].outcome).toBeTruthy();
  // nothing is deleted from the log, whatever was decided
  expect(after.items).toHaveLength(1);
});

test("the firm-wide pause is one switch, and it says so on screen", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto("/settings/automation");

  await expect(
    page.getByText(/Automatic messages to clients are running/),
  ).toBeVisible();

  await page.getByRole("button", { name: "Pause everything" }).click();
  await expect(
    page.getByText(/Automatic messages to clients are paused/),
  ).toBeVisible();
  await expect(page.getByText(/nothing leaves the building/)).toBeVisible();

  const firm = await FirmSettings.findOne({ key: "firm" })
    .select("automationPaused")
    .lean();
  expect(firm.automationPaused).toBe(true);

  await page.getByRole("button", { name: "Start sending again" }).click();
  await expect(
    page.getByText(/Automatic messages to clients are running/),
  ).toBeVisible();
});

test("trusting a rule is a partner's decision and is recorded", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto("/settings/automation");

  const row = page
    .getByRole("listitem")
    .filter({ hasText: "Reminds a client about documents" });
  await row.getByRole("button", { name: "Trust this rule" }).click();

  await expect(
    page.getByText(/can now send without waiting for you/),
  ).toBeVisible();
  // and the limits that still apply are on the screen beside it
  await expect(page.getByText(/25 clients/)).toBeVisible();
  await expect(page.getByText(/4 automatic messages a month/)).toBeVisible();

  const rule = await NotificationRule.findOne({
    key: "documentsPending",
  }).lean();
  expect(rule.trusted).toBe(true);
  expect(rule.trustedByName).toBe("Playwright Automation Partner");
});

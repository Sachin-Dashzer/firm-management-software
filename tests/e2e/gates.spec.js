import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import { TOTP, Secret } from "otpauth";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import ServiceTemplate from "../../models/ServiceTemplate.js";
import Engagement from "../../models/Engagement.js";
import { hashPassword, decryptField } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";
import { buildEngagement } from "../../lib/engagements/create.js";
import { periodFor } from "../../lib/engagements/period.js";
import { startOfISTDay } from "../../lib/dates.js";

/**
 * The gates before a filing, in a browser (P3-5).
 *
 * The flow worth a browser is the order: the filing form is not even drawn
 * until a reviewer has approved and the client has confirmed, and ticking a
 * step afterwards takes both away again. Every rule behind it is arithmetic
 * and lives in tests/gates.test.js.
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
    maker: `pw-gate-maker-${tag}@phmgindia.test`,
    reviewer: `pw-gate-ca-${tag}@phmgindia.test`,
    code: `PWG-${tag.slice(0, 6).toUpperCase()}`,
    clientName: `Playwright Gates ${tag} Private Limited`,
  };
}

let engagementId = "";

/** Both deadlines ahead, so nothing here is overdue and nothing is at risk. */
const gstr1Due = startOfISTDay(new Date(Date.now() + 20 * DAY));
const gstr3bDue = startOfISTDay(new Date(Date.now() + 29 * DAY));

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
  await User.deleteMany({ email: { $in: [fx.maker, fx.reviewer] } });
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

    const [maker, reviewer] = await User.create(
      [
        {
          name: "Playwright Gates Maker",
          email: fx.maker,
          role: "employee",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
        {
          name: "Playwright Gates Reviewer",
          email: fx.reviewer,
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
          code: `PHMG-NOI-7${testInfo.project.name.length}00`,
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

    const [service] = await ServiceTemplate.create(
      [
        {
          name: `Playwright GST gated ${testInfo.project.name}`,
          code: fx.code,
          category: "Indirect Tax",
          level: "L1",
          minExecRole: "intern",
          minReviewRole: "ca",
          recurrence: "monthly",
          // the client is liable for this tax, so they confirm the figures
          clientConfirmationRequired: true,
          checklist: [],
          steps: [{ name: "Reconcile with GSTR-2B" }],
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
    );

    const period = periodFor("monthly", new Date());
    const fields = buildEngagement({
      template: service,
      client,
      period,
      assigneeId: maker._id,
      reviewerId: reviewer._id,
    });

    const [row] = await Engagement.create(
      [
        {
          ...fields,
          code: `PWG-${service.code}`,
          status: "Under review",
          milestones: [
            { name: "GSTR-1", ruleKey: "GSTR1", dueDate: gstr1Due },
            { name: "GSTR-3B", ruleKey: "GSTR3B", dueDate: gstr3bDue },
          ],
          statutoryDue: gstr1Due,
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
    );
    engagementId = String(row._id);
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

const asInput = (date) => date.toISOString().slice(0, 10);
const row = (page, name) =>
  page.getByRole("listitem").filter({ hasText: name });

test("the person who did the work is not offered the approval", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.maker);
  await page.goto(`/engagements/${engagementId}`);

  await expect(
    page.getByText(/Reviewer approval is needed before filing/),
  ).toBeVisible();
  // and no form to record one, rather than a form that would be refused
  await expect(page.getByLabel("Acknowledgement number")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Approve for filing" }),
  ).toHaveCount(0);
});

test("approval, then the client, then the filing — in that order", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.reviewer);
  await page.goto(`/engagements/${engagementId}`);

  await page.getByRole("button", { name: "Approve for filing" }).click();
  await expect(page.getByText(/Version 1 approved/)).toBeVisible();

  // approved is not enough on tax work: the client is liable for it
  await expect(
    page.getByText(/client has not confirmed the figures yet/),
  ).toBeVisible();
  await expect(page.getByLabel("Acknowledgement number")).toHaveCount(0);

  await page.getByLabel("Who confirmed").fill("Jaspal Singh");
  await page.getByLabel("When").fill(asInput(new Date()));
  await page
    .getByLabel("Where it can be found")
    .fill("WhatsApp from Jaspal, 4:10 pm");
  await page.getByRole("button", { name: "Record it" }).click();

  await expect(
    page.getByText(/Confirmation recorded against version 1/),
  ).toBeVisible();

  const gated = await Engagement.findById(engagementId).lean();
  expect(gated.review.approvedByName).toBe("Playwright Gates Reviewer");
  expect(gated.review.version).toBe(1);
  expect(gated.clientConfirmation.who).toBe("Jaspal Singh");
  expect(gated.clientConfirmation.evidence).toMatch(/WhatsApp/);
  expect(gated.clientConfirmation.version).toBe(1);

  // now, and only now, the filing can be recorded
  const first = row(page, "GSTR-1");
  await first.getByLabel("Acknowledgement number").fill("AA0911260001111");
  await first.getByLabel("Filed on").fill(asInput(new Date()));
  await first.getByRole("button", { name: /Record GSTR-1/ }).click();

  await expect(page.getByText(/GSTR-1 recorded on time/)).toBeVisible();

  const filed = await Engagement.findById(engagementId).lean();
  // which version of the work actually went in
  expect(filed.milestones.find((m) => m.name === "GSTR-1").versionFiled).toBe(
    1,
  );
});

test("a change after approval raises the version and takes both gates away", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.reviewer);
  await page.goto(`/engagements/${engagementId}`);

  await page.getByLabel("Reconcile with GSTR-2B").check();

  await expect(page.getByText(/now version 2/)).toBeVisible();
  await expect(
    page.getByText(/Review and client confirmation needed again/),
  ).toBeVisible();

  const after = await Engagement.findById(engagementId).lean();
  expect(after.version).toBe(2);
  expect(after.review ?? null).toBeNull();
  expect(after.clientConfirmation ?? null).toBeNull();
  // back in the maker's hands
  expect(after.status).toBe("In progress");
  // the return already lodged stays lodged, recorded against version 1
  const gstr1 = after.milestones.find((m) => m.name === "GSTR-1");
  expect(gstr1.ackNo).toBe("AA0911260001111");
  expect(gstr1.versionFiled).toBe(1);

  // and the second return cannot be filed until it is approved again
  await page.reload();
  await expect(
    page.getByText(/Reviewer approval is needed before filing/),
  ).toBeVisible();
  await expect(page.getByLabel("Acknowledgement number")).toHaveCount(0);
});

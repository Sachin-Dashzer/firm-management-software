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

/**
 * Scope and waivers in a browser (P3-4).
 *
 * The flow worth a browser is the one that crosses two people: a CA asks for
 * a fee to be waived, the job stays chargeable while the partner decides, the
 * partner approves, and the job then stays on the unbilled list — with the
 * reason and both names — while being refused by the invoice builder.
 *
 * The fee rule itself and every state transition are arithmetic and are
 * covered in tests/scope.test.js without a database.
 *
 * Skipped until Atlas is configured, like every other suite.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";
const REASON = "Goodwill — the delay in filing was ours";

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    ca: `pw-waiver-ca-${tag}@phmgindia.test`,
    partner: `pw-waiver-partner-${tag}@phmgindia.test`,
    code: `PWW-${tag.slice(0, 6).toUpperCase()}`,
    clientName: `Playwright Waivers ${tag} Private Limited`,
  };
}

const ids = { engagement: "", client: "" };

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
  await User.deleteMany({ email: { $in: [fx.ca, fx.partner] } });
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

    const [ca, partner] = await User.create(
      [
        {
          name: "Playwright Waivers CA",
          email: fx.ca,
          role: "ca",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
        {
          name: "Playwright Waivers Partner",
          email: fx.partner,
          role: "partner",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
      ],
      { session },
    );

    const [client] = await Client.create(
      [
        {
          code: `PHMG-NOI-9${testInfo.project.name.length}00`,
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

    const [service] = await ServiceTemplate.create(
      [
        {
          name: `Playwright TDS return ${testInfo.project.name}`,
          code: fx.code,
          category: "Direct Tax",
          level: "L1",
          minExecRole: "intern",
          minReviewRole: "ca",
          recurrence: "quarterly",
          checklist: [],
          steps: [{ name: "Prepare the return" }],
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
    );

    const period = periodFor("quarterly", new Date());
    const fields = buildEngagement({ template: service, client, period });

    const [row] = await Engagement.create(
      [
        {
          ...fields,
          code: `PWW-${service.code}`,
          // finished, unbilled, and never priced — the state the whole step
          // exists to stop being indistinguishable from "free"
          status: "Completed",
          completedAt: new Date(),
          feePaise: 0,
          billingStatus: "Unbilled",
          assigneeId: ca._id,
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
    );
    ids.engagement = String(row._id);
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

/** The one row this suite created, so other unbilled work never collides. */
const ourRow = (page, fx) =>
  page.getByRole("row").filter({ hasText: fx.clientName.slice(0, 28) });

test("a CA asks, and the job stays chargeable while a partner decides", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.ca);
  await page.goto("/invoices/receivables?tab=unbilled");

  const row = ourRow(page, fx);
  await expect(row).toContainText("Fee not agreed");

  await row.getByRole("button", { name: "Ask a partner to waive it" }).click();
  await page.getByLabel(/Why should the fee be waived/).fill(REASON);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText(/Sent to a partner/)).toBeVisible();
  await expect(ourRow(page, fx)).toContainText("Waiver waiting for a partner");
  // and the CA is not offered the decision they just asked for
  await expect(
    ourRow(page, fx).getByRole("button", { name: "Approve the waiver" }),
  ).toHaveCount(0);

  const asked = await Engagement.findById(ids.engagement).lean();
  // asking is not deciding
  expect(asked.scope).toBe("billable");
  expect(asked.waiver.reason).toBe(REASON);
  expect(asked.waiver.requestedByName).toBe("Playwright Waivers CA");
  expect(asked.waiver.approvedAt ?? null).toBeNull();
});

test("the partner approves, and the job keeps its place with both names", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto("/invoices/receivables?tab=unbilled");

  const row = ourRow(page, fx);
  await expect(row).toContainText(REASON);
  await row.getByRole("button", { name: "Approve the waiver" }).click();

  await expect(page.getByText(/Fee waived/)).toBeVisible();

  const waived = await Engagement.findById(ids.engagement).lean();
  expect(waived.scope).toBe("waived");
  expect(waived.scopeReason).toBe(REASON);
  expect(waived.waiver.requestedByName).toBe("Playwright Waivers CA");
  expect(waived.waiver.approvedByName).toBe("Playwright Waivers Partner");

  // it has not left the list: the firm can still say what it did not charge for
  await expect(ourRow(page, fx)).toContainText("Waived");
  await expect(ourRow(page, fx)).toContainText(REASON);
  await expect(page.getByText(/settled another way/)).toBeVisible();
});

test("waived work cannot be put on an invoice", async ({ page }, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto(`/invoices/new?client=${ids.client}`);

  const item = page.getByRole("listitem").filter({ hasText: "Playwright TDS" });
  await expect(item).toContainText("Cannot be billed: waived");
  await expect(item.getByRole("checkbox")).toBeDisabled();
});

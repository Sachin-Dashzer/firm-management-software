import { test, expect } from "@playwright/test";
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
 * The life of one requested document, in a browser (P3-2).
 *
 * The flow worth a browser is the one that used to be a phone call: a client
 * sends the wrong month, the firm sends it back **with a reason the client
 * reads**, the right file arrives, and the acceptance belongs to the second
 * submission rather than the first.
 *
 * The state machine itself is covered in tests/checklist.test.js without a
 * database.
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
    ca: `pw-cl-ca-${tag}@phmgindia.test`,
    code: `PWC-${tag.slice(0, 6).toUpperCase()}`,
    clientName: `Playwright Checklist ${tag} Private Limited`,
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
          name: "Playwright Checklist CA",
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
          checklist: [
            { name: "Challans for the quarter", side: "client" },
            { name: "Vendor PAN list", side: "client" },
          ],
          steps: [{ name: "Prepare the return" }],
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
    );

    const period = periodFor("quarterly", new Date(Date.now() - 40 * DAY));
    const fields = buildEngagement({ template: service, client, period });

    const [row] = await Engagement.create(
      [
        {
          ...fields,
          code: `PWC-${service.code}`,
          status: "In progress",
          assigneeId: ca._id,
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
  /**
   * The connection is deliberately left open. Playwright runs several spec
   * files in one worker, one after another, and `connectDB` caches the
   * connection per process — so a spec that closed it took the next spec in
   * that worker down with it. The worker exiting closes it.
   */
});

async function signIn(page, email) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("6-digit code").waitFor();

  const user = await User.findOne({ email }).select("+totpSecret");
  /**
   * An authenticator shows one code per 30 seconds, and the app refuses a
   * code it has already accepted — replay protection, working as spec §16
   * asks. A suite that signs in a dozen times inside one window hits it
   * every time, so the counter is cleared to stand for time having
   * passed. The rule itself is tested in tests/security.test.js.
   */
  await User.updateOne({ email }, { $set: { lastTotpCounter: 0 } });
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

/** Pretend the client uploaded, which happens on the token link. */
async function clientSends(name) {
  const engagement = await Engagement.findById(engagementId);
  const item = engagement.checklist.find((i) => i.name === name);
  const { recordSubmission } =
    await import("../../lib/engagements/checklist.js");
  recordSubmission(item);
  await engagement.save();
  return String(item._id);
}

const row = (page, name) =>
  page.getByRole("listitem").filter({ hasText: name });

test("a wrong file goes back with a reason, and the right one is accepted", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await clientSends("Challans for the quarter");
  await signIn(page, fx.ca);
  await page.goto(`/engagements/${engagementId}`);

  const challans = row(page, "Challans for the quarter");
  await expect(challans).toContainText("Received");

  // send it back, in words the client can act on
  await challans.getByRole("button", { name: "Request a replacement" }).click();
  await challans
    .getByLabel(/What is wrong with it/)
    .fill("these are August challans; we need September");
  await challans.getByRole("button", { name: "Send it back" }).click();

  await expect(page.getByText(/Asked for a replacement/)).toBeVisible();
  await expect(challans).toContainText("Replacement requested");
  await expect(challans).toContainText("August challans");

  // the client sends the right one: a new submission, with no old checks on it
  await clientSends("Challans for the quarter");
  await page.reload();

  const again = row(page, "Challans for the quarter");
  await expect(again).toContainText("submission 2");
  await again.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText(/accepted/i)).toBeVisible();

  const saved = await Engagement.findById(engagementId).lean();
  const item = saved.checklist.find(
    (i) => i.name === "Challans for the quarter",
  );
  expect(item.status).toBe("Accepted");
  // the acceptance belongs to the file it was given for
  expect(item.acceptedSubmission).toBe(2);
  expect(item.rejectReason).toBe("");
});

test("a mandatory item can be waived with a reason, and stops blocking", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.ca);
  await page.goto(`/engagements/${engagementId}`);

  const pans = row(page, "Vendor PAN list");
  await pans.getByRole("button", { name: "Not required" }).click();
  await pans
    .getByLabel(/Why is it not needed/)
    .fill("client has no vendors above the threshold this quarter");
  await pans.getByRole("button", { name: "Mark not required" }).click();

  await expect(page.getByText(/marked not required/)).toBeVisible();

  const saved = await Engagement.findById(engagementId).lean();
  const item = saved.checklist.find((i) => i.name === "Vendor PAN list");
  expect(item.status).toBe("Not required");
  expect(item.notRequiredReason).toMatch(/threshold/);
  // the old gate demanded Verified, so a waived item blocked completion
  // for ever and the only way out was to claim it had arrived
  expect(item.mandatory).toBe(true);
});

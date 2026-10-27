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
 * The A / B / C tiers doing their job (owner decisions D4 and D5): a step
 * only a CA may tick, A-tier work a CA may not sign off, and the batch
 * sign-off that is offered for routine work and refused for the rest.
 *
 * Every rule here is also a Vitest case on the pure function; these are the
 * ones that prove the screen and the server agree. Skipped until Atlas is
 * configured, like the other suites.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    partner: `pw-tier-partner-${tag}@phmgindia.test`,
    ca: `pw-tier-ca-${tag}@phmgindia.test`,
    staff: `pw-tier-staff-${tag}@phmgindia.test`,
    routine: `PWC-${tag.slice(0, 6).toUpperCase()}`,
    crucial: `PWA-${tag.slice(0, 6).toUpperCase()}`,
    clientName: `Playwright Tiers ${tag} Private Limited`,
  };
}

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
  await ServiceTemplate.deleteMany(
    { code: { $in: [fx.routine, fx.crucial] } },
    { withDeleted: true },
  );
  await User.deleteMany({ email: { $in: [fx.partner, fx.ca, fx.staff] } });
}

/** The ids the tests need, filled in by the fixture. */
const made = {};

test.beforeAll(async ({}, testInfo) => {
  const fx = names(testInfo.project.name);
  await connectDB();
  await wipe(fx);

  await systemAudit(async (session) => {
    const branch = await Branch.findOneAndUpdate(
      { code: "NOI" },
      { $setOnInsert: { name: "Noida (head office)", invoicePrefix: "NOI" } },
      { returnDocument: "after", upsert: true, session },
    );

    const [boss, reviewer, maker] = await User.create(
      [
        {
          name: "Playwright Tier Partner",
          email: fx.partner,
          role: "partner",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
        {
          name: "Playwright Tier CA",
          email: fx.ca,
          role: "ca",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
        {
          name: "Playwright Tier Employee",
          email: fx.staff,
          role: "employee",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
      ],
      { session },
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
      { session },
    );

    // C-tier, with one step that asks for more than the service does
    const [routine, crucial] = await ServiceTemplate.create(
      [
        {
          name: `Playwright routine filing ${testInfo.project.name}`,
          code: fx.routine,
          category: "Indirect Tax",
          level: "L1",
          minExecRole: "intern",
          minReviewRole: "ca",
          recurrence: "monthly",
          turnaroundDays: 5,
          checklist: [],
          steps: [
            { name: "Collect data" },
            { name: "Sign the report", minRole: "ca" },
          ],
          createdBy: "test",
          updatedBy: "test",
        },
        {
          name: `Playwright statutory audit ${testInfo.project.name}`,
          code: fx.crucial,
          category: "Audit and Assurance",
          level: "L3",
          minExecRole: "ca",
          minReviewRole: "partner",
          recurrence: "annual",
          turnaroundDays: null,
          checklist: [],
          steps: [{ name: "Audit the books" }],
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
    );

    /** Work already at the status the test needs, so no flow is re-run here. */
    async function engagement(template, code, status, assigneeId, reviewerId) {
      const fields = buildEngagement({
        template,
        client,
        period: periodFor(template.recurrence),
        assigneeId,
        reviewerId,
      });
      const [row] = await Engagement.create(
        [
          {
            ...fields,
            code,
            status,
            // nothing mandatory outstanding, so only the tier can refuse
            reviewChecklist: fields.reviewChecklist.map((item) => ({
              ...item,
              checked: true,
            })),
            createdBy: "test",
            updatedBy: "test",
          },
        ],
        { session },
      );
      return String(row._id);
    }

    made.working = await engagement(
      routine,
      `PWT-${fx.routine}-W`,
      "In progress",
      maker._id,
      reviewer._id,
    );
    made.routineUnderReview = await engagement(
      routine,
      `PWT-${fx.routine}-R`,
      "Under review",
      maker._id,
      reviewer._id,
    );
    // a partner did this one, so the CA is not refused for self-approval:
    // the only rule left to refuse them is the tier's own
    made.auditUnderReview = await engagement(
      crucial,
      `PWT-${fx.crucial}-R`,
      "Under review",
      boss._id,
      null,
    );
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

test("a step reserved for a CA is not the employee's to tick", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);

  await signIn(page, fx.staff);
  await page.goto(`/engagements/${made.working}`);

  // the step they may do
  await page.getByLabel("Collect data").check();
  await expect(page.getByText("Collect data done")).toBeVisible();

  // and the one they may not, said on the row rather than left to fail
  await expect(page.getByLabel(/Sign the report/)).toBeDisabled();
  await expect(page.getByText("not yours to tick")).toBeVisible();

  const stored = await Engagement.findById(made.working);
  expect(stored.tasks.find((t) => t.name === "Sign the report").done).toBe(
    false,
  );
});

test("a step can only be given to somebody allowed to do it", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);

  await signIn(page, fx.partner);
  await page.goto(`/engagements/${made.working}`);

  // the open step offers everybody; the CA-only step offers only seniors
  const open = page.getByLabel("Who does “Collect data”");
  const senior = page.getByLabel("Who does “Sign the report”");
  await expect(
    open.getByRole("option", { name: "Playwright Tier Employee" }),
  ).toHaveCount(1);
  await expect(
    senior.getByRole("option", { name: "Playwright Tier Employee" }),
  ).toHaveCount(0);

  await senior.selectOption({ label: "Playwright Tier CA" });
  await expect(
    page.getByText("Sign the report is Playwright Tier CA's"),
  ).toBeVisible();

  const stored = await Engagement.findById(made.working);
  const step = stored.tasks.find((t) => t.name === "Sign the report");
  expect(String(step.assigneeId)).toBeTruthy();
});

test("A-tier work waits for a partner, whoever reviews it", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);

  await signIn(page, fx.ca);
  await page.goto(`/engagements/${made.auditUnderReview}`);
  // the badge says it in words as well as in a letter
  await expect(page.getByText("A · CA only").first()).toBeVisible();

  // nobody is named as reviewer, which used to let any CA close it
  await expect(page.getByRole("button", { name: "Completed" })).toHaveCount(0);
  expect((await Engagement.findById(made.auditUnderReview)).status).toBe(
    "Under review",
  );
});

test("routine work can be signed off in a batch, A-tier cannot", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);

  await signIn(page, fx.ca);
  await page.goto("/engagements?status=Under+review");

  // one C-tier row: the batch sign-off is offered
  await page.getByRole("checkbox", { name: /PWT-PWC/ }).check();
  const approve = page.getByRole("button", { name: "Approve selected" });
  await expect(approve).toBeEnabled();

  // adding the A-tier row takes it away again
  await page.getByRole("checkbox", { name: /PWT-PWA/ }).check();
  await expect(approve).toBeDisabled();
  await expect(page.getByText(/Only routine \(C\) work/)).toBeVisible();

  await page.getByRole("checkbox", { name: /PWT-PWA/ }).uncheck();
  await approve.click();
  await expect(page.getByText(/signed off/)).toBeVisible();

  const done = await Engagement.findById(made.routineUnderReview);
  expect(done.status).toBe("Completed");
  // signed off by the reviewer, not by the person who did the work
  expect(String(done.completedBy)).not.toBe(String(done.assigneeId));
});

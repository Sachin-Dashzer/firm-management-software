import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import { TOTP, Secret } from "otpauth";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import ServiceTemplate from "../../models/ServiceTemplate.js";
import Engagement from "../../models/Engagement.js";
import DueDateRule from "../../models/DueDateRule.js";
import { hashPassword, decryptField } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";

/**
 * The due-date master, and the rule it exists to enforce: a date nobody has
 * confirmed never reaches an engagement (CLAUDE.md rule 8).
 *
 * Skipped until Atlas is configured, like the other suites.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    partner: `pw-due-partner-${tag}@phmgindia.test`,
    serviceCode: `PWR-${tag.slice(0, 6).toUpperCase()}`,
    clientName: `Playwright Deadlines ${tag} Private Limited`,
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
    { code: fx.serviceCode },
    { withDeleted: true },
  );
  await DueDateRule.deleteMany(
    { serviceCode: fx.serviceCode },
    { withDeleted: true },
  );
  await User.deleteMany({ email: fx.partner });
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
          name: "Playwright Partner",
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

    const [template] = await ServiceTemplate.create(
      [
        {
          name: `Playwright monthly return ${testInfo.project.name}`,
          code: fx.serviceCode,
          category: "Indirect Tax",
          level: "L1",
          minExecRole: "intern",
          minReviewRole: "ca",
          recurrence: "monthly",
          checklist: [{ name: "Register", side: "client", mandatory: true }],
          steps: [{ name: "File" }],
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
    );

    await DueDateRule.create(
      [
        {
          serviceCode: fx.serviceCode,
          name: template.name,
          periodType: "monthly",
          formula: { kind: "dayOfMonth", day: 20, monthsAfter: 1 },
          source: "Playwright fixture",
          caution: "Fixture only.",
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
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
  await expect(page).toHaveURL(/\/today$/);
}

test("a rule gives no date until a partner confirms it", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  await page.goto("/settings/due-dates");
  await expect(page.getByText(/have not been confirmed/)).toBeVisible();

  const card = page
    .locator("section")
    .filter({ hasText: fx.serviceCode })
    .first();
  await expect(card.getByText("Not confirmed")).toBeVisible();
  // the draft still shows what it *would* give, so it can be judged
  await expect(
    card.getByText("The 20th of the following month."),
  ).toBeVisible();

  // --- while unconfirmed, generation leaves the date empty ---------------
  const { generateRecurring } = await import("../../jobs/generateRecurring.js");

  const client = await Client.findOne({ legalName: fx.clientName });
  const template = await ServiceTemplate.findOne({ code: fx.serviceCode });
  const ClientService = (await import("../../models/ClientService.js")).default;
  await systemAudit(async (session) => {
    await ClientService.create(
      [
        {
          clientId: client._id,
          serviceTemplateId: template._id,
          active: true,
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
    );
  });

  await generateRecurring({});
  const blind = await Engagement.findOne({
    clientId: client._id,
    serviceTemplateId: template._id,
  });
  expect(blind).toBeTruthy();
  // the work exists, the deadline does not — rule 8
  expect(blind.statutoryDue).toBeNull();
  expect(blind.statusHistory[0].reason).toMatch(/not been confirmed/);

  // --- confirming it changes that ----------------------------------------
  await page.reload();
  await card.getByRole("button", { name: /confirm it/ }).click();
  await expect(page.getByText(/confirmed\./)).toBeVisible();

  const rule = await DueDateRule.findOne({ serviceCode: fx.serviceCode });
  expect(rule.verifiedAt).toBeTruthy();
  expect(rule.verifiedByName).toBe("Playwright Partner");

  await Engagement.deleteMany({ clientId: client._id }, { withDeleted: true });
  await generateRecurring({});
  const dated = await Engagement.findOne({
    clientId: client._id,
    serviceTemplateId: template._id,
  });
  expect(dated.statutoryDue).toBeTruthy();
  // the firm's own target sits earlier than the statutory date
  expect(dated.internalDue.getTime()).toBeLessThan(
    dated.statutoryDue.getTime(),
  );

  await ClientService.deleteMany({ clientId: client._id });
});

test("an extension moves every open engagement at once", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  const client = await Client.findOne({ legalName: fx.clientName });
  const template = await ServiceTemplate.findOne({ code: fx.serviceCode });

  const engagement = await systemAudit(async (session) => {
    const [doc] = await Engagement.create(
      [
        {
          code: `NOI-${fx.serviceCode}-2026-10-7001`,
          clientId: client._id,
          serviceTemplateId: template._id,
          branchId: client.branchId,
          period: "2026-10",
          periodLabel: "Oct 2026",
          status: "In progress",
          statutoryDue: new Date("2026-11-20T00:00:00+05:30"),
          templateSnapshot: { name: template.name, code: template.code },
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
    );
    return doc;
  });

  await signIn(page, fx.partner);
  await page.goto("/settings/due-dates");

  const card = page
    .locator("section")
    .filter({ hasText: fx.serviceCode })
    .first();
  await card.getByRole("button", { name: "Record an extension" }).click();
  await card.getByLabel("Period").fill("2026-10");
  await card.getByLabel("New due date").fill("2026-11-25");
  await card
    .getByLabel("Which notification?")
    .fill("CBIC Notification 99/2026");
  await card.getByRole("button", { name: "Move this period" }).click();

  await expect(page.getByText(/1 open engagement updated/)).toBeVisible();

  const moved = await Engagement.findById(engagement._id);
  expect(moved.statutoryDue.toISOString().slice(0, 10)).toBe("2026-11-25");

  // the reason is on the record, not just in someone's memory
  const AuditLog = (await import("../../models/AuditLog.js")).default;
  const logged = await AuditLog.findOne({
    entityType: "Engagement",
    entityId: engagement._id,
  }).sort({ seq: -1 });
  expect(logged.note).toContain("CBIC Notification 99/2026");

  await Engagement.deleteOne({ _id: engagement._id }, { withDeleted: true });
});

test("the grid shows a month nobody filed", async ({ page }, testInfo) => {
  const fx = names(testInfo.project.name);
  const client = await Client.findOne({ legalName: fx.clientName });
  const template = await ServiceTemplate.findOne({ code: fx.serviceCode });

  const ClientService = (await import("../../models/ClientService.js")).default;
  await systemAudit(async (session) => {
    await ClientService.create(
      [
        {
          clientId: client._id,
          serviceTemplateId: template._id,
          active: true,
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
    );

    // April filed, May never created — the hole the grid exists to show
    await Engagement.create(
      [
        {
          code: `NOI-${fx.serviceCode}-2026-04-7101`,
          clientId: client._id,
          serviceTemplateId: template._id,
          branchId: client.branchId,
          period: "2026-04",
          periodLabel: "Apr 2026",
          status: "Completed",
          completedAt: new Date("2026-05-18T00:00:00+05:30"),
          templateSnapshot: { name: template.name, code: template.code },
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
    );
  });

  await signIn(page, fx.partner);
  await page.goto(`/calendar?view=grid&service=${template._id}&fy=2026`);

  await expect(page.getByRole("heading", { name: "Compliance" })).toBeVisible();
  await expect(page.getByText("Playwright Deadlines")).toBeVisible();

  // the headline number is the count of periods with nothing created
  const missing = page
    .locator("div")
    .filter({ hasText: /^Periods with nothing created$/ })
    .first();
  await expect(missing).toBeVisible();

  // April is completed, so its cell is a tick and links to the engagement
  const row = page.getByRole("row", { name: /Playwright Deadlines/ });
  await expect(row.getByTitle(/2026-04: Completed/)).toBeVisible();
  // May has nothing at all, and says so rather than being blank
  await expect(
    row.getByTitle(/2026-05: No engagement was ever created/),
  ).toBeVisible();

  await Engagement.deleteMany({ clientId: client._id }, { withDeleted: true });
  await ClientService.deleteMany({ clientId: client._id });
});

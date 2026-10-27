import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import { TOTP, Secret } from "otpauth";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import ServiceTemplate from "../../models/ServiceTemplate.js";
import Engagement from "../../models/Engagement.js";
import MessageLog from "../../models/MessageLog.js";
import NotificationRule from "../../models/NotificationRule.js";
import { hashPassword, decryptField } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";
import { clearRuleCache } from "../../lib/mailer/rules.js";

/**
 * The reminder sweep and the switches behind it (spec section 12).
 *
 * Two things are worth a browser: that a reminder goes out once and not
 * twice, and that switching a rule off in Settings actually stops it —
 * the difference between a setting and a label.
 *
 * Skipped until Atlas is configured, like the other suites.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    partner: `pw-rem-partner-${tag}@phmgindia.test`,
    staff: `pw-rem-staff-${tag}@phmgindia.test`,
    serviceCode: `PWM-${tag.slice(0, 6).toUpperCase()}`,
    clientName: `Playwright Reminders ${tag} Private Limited`,
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
    await MessageLog.deleteMany({ clientId: client._id });
    await Client.deleteOne({ _id: client._id }, { withDeleted: true });
  }
  await ServiceTemplate.deleteMany(
    { code: fx.serviceCode },
    { withDeleted: true },
  );
  await MessageLog.deleteMany({ to: { $in: [fx.partner, fx.staff] } });
  await User.deleteMany({ email: { $in: [fx.partner, fx.staff] } });
  await NotificationRule.deleteMany({
    key: { $in: ["internalDueSoon", "engagementOverdue"] },
  });
  clearRuleCache();
}

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

    const [partner, staff] = await User.create(
      [
        {
          name: "Playwright Partner",
          email: fx.partner,
          role: "partner",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
        {
          name: "Playwright Clerk",
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
          clientPartnerId: partner._id,
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
    );

    const [template] = await ServiceTemplate.create(
      [
        {
          name: `Playwright reminder service ${testInfo.project.name}`,
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

    // two days out, which is exactly when the internal reminder fires
    const inTwoDays = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

    await Engagement.create(
      [
        {
          code: `ENG-PWREM-${testInfo.project.name.length}`,
          clientId: client._id,
          branchId: branch._id,
          serviceTemplateId: template._id,
          templateSnapshot: { name: template.name, code: template.code },
          period: "2026-10",
          periodLabel: "October 2026",
          status: "In progress",
          assigneeId: staff._id,
          reviewerId: partner._id,
          internalDue: inTwoDays,
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
  await expect(page).toHaveURL(/\/issues$/);
}

test("a reminder goes out once, and shows up on the messages screen", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  const { reminders } = await import("../../jobs/reminders.js");

  const first = await reminders({});
  expect(first.byRule.internalDueSoon).toBeGreaterThan(0);

  // the whole point: sweeping again the same day sends nothing further
  const second = await reminders({});
  expect(second.byRule.internalDueSoon ?? 0).toBe(0);

  const sent = await MessageLog.countDocuments({
    template: "internalDueSoon",
    to: fx.staff,
  });
  expect(sent).toBe(1);

  await signIn(page, fx.partner);
  await page.goto("/settings/messages");
  await expect(page.getByText(/is yours|target/).first()).toBeVisible();
});

test("switching a rule off in settings stops it being sent", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  await page.goto("/settings/messages");

  const row = page
    .locator("li")
    .filter({ hasText: "our own target date is coming up" })
    .first();
  await row.getByRole("button", { name: "Change" }).click();
  await page.getByLabel("Send this message").uncheck();
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText(/will not be sent to anyone/)).toBeVisible();
  await expect(page.getByText("switched off").first()).toBeVisible();

  // and the sweep agrees
  await MessageLog.deleteMany({ template: "internalDueSoon", to: fx.staff });
  clearRuleCache();

  const { reminders } = await import("../../jobs/reminders.js");
  const result = await reminders({});
  expect(result.byRule.internalDueSoon ?? 0).toBe(0);
  expect(
    await MessageLog.countDocuments({
      template: "internalDueSoon",
      to: fx.staff,
    }),
  ).toBe(0);
});

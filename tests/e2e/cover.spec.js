import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import { TOTP, Secret } from "otpauth";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import Leave from "../../models/Leave.js";
import ServiceTemplate from "../../models/ServiceTemplate.js";
import Engagement from "../../models/Engagement.js";
import { hashPassword, decryptField } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";
import { buildEngagement } from "../../lib/engagements/create.js";
import { periodFor } from "../../lib/engagements/period.js";
import { startOfISTDay } from "../../lib/dates.js";

/**
 * Leave, cover, and what cover does and does not do (P3-16).
 *
 * The flow worth a browser is the whole claim: a partner records an
 * absence with a named cover, and the cover's own Issues page then carries
 * the absentee's rows — labelled as theirs, with the work still on the
 * absentee's name. The arithmetic behind it is in tests/leave.test.js.
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
    partner: `pw-cover-partner-${tag}@phmgindia.test`,
    away: `pw-cover-away-${tag}@phmgindia.test`,
    cover: `pw-cover-cover-${tag}@phmgindia.test`,
    code: `PWC-${tag.slice(0, 6).toUpperCase()}`,
    clientName: `Playwright Cover ${tag} Private Limited`,
  };
}

let awayId = "";

/** Overdue, so the absentee has a row somebody has to pick up. */
const due = startOfISTDay(new Date(Date.now() - 3 * DAY));

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
  const people = await User.find(
    { email: { $in: [fx.partner, fx.away, fx.cover] } },
    null,
    { withDeleted: true },
  );
  await Leave.deleteMany(
    { userId: { $in: people.map((row) => row._id) } },
    { withDeleted: true },
  );
  await User.deleteMany({ email: { $in: [fx.partner, fx.away, fx.cover] } });
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

    const [partner, away, cover] = await User.create(
      [
        {
          name: "Playwright Cover Partner",
          email: fx.partner,
          role: "partner",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
        {
          name: "Playwright Away Person",
          email: fx.away,
          role: "ca",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
        {
          name: "Playwright Cover Person",
          email: fx.cover,
          role: "ca",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
      ],
      { session },
    );
    awayId = String(away._id);

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
          name: `Playwright cover GST ${testInfo.project.name}`,
          code: fx.code,
          category: "Indirect Tax",
          level: "L2",
          minExecRole: "intern",
          minReviewRole: "ca",
          recurrence: "monthly",
          effortHours: 3,
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
      assigneeId: away._id,
      reviewerId: partner._id,
    });

    await Engagement.create(
      [
        {
          ...fields,
          code: `PWC-${service.code}`,
          status: "In progress",
          milestones: [{ name: "GSTR-3B", ruleKey: "GSTR3B", dueDate: due }],
          statutoryDue: due,
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

const asInput = (date) => date.toISOString().slice(0, 10);

test("a cover gets the absentee's rows, and the work stays on the absentee's name", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);

  await signIn(page, fx.partner);
  await page.goto(`/team/${awayId}?tab=leave`);

  const from = new Date(Date.now() - DAY);
  const to = new Date(Date.now() + 5 * DAY);
  await page.getByLabel("First day away").fill(asInput(from));
  await page.getByLabel("Last day away").fill(asInput(to));
  await page
    .getByLabel("Who holds their work")
    .selectOption({ label: /Playwright Cover Person/ });
  await page.getByRole("button", { name: "Record it" }).click();
  await expect(page.getByRole("status")).toContainText(
    /holds .*Issues and reminders/,
  );

  // a cover who is away themselves is refused by name
  await page
    .getByLabel("First day away")
    .fill(asInput(new Date(Date.now() + 10 * DAY)));
  await page
    .getByLabel("Last day away")
    .fill(asInput(new Date(Date.now() + 11 * DAY)));
  await page
    .getByLabel("Who holds their work")
    .selectOption({ label: /Playwright Cover Person/ });
  await page.getByRole("button", { name: "Record it" }).click();
  await expect(page.getByRole("alert")).toContainText(
    /already recorded as away|away themselves/,
  );

  // the board warns, and offers the hand-over
  await page.goto("/team/plan");
  await expect(page.getByText(/Playwright Away Person.*is away/)).toBeVisible();

  // the cover signs in and the absentee's overdue job is in their list
  await page.goto("/api/auth/signout").catch(() => {});
  await page.context().clearCookies();
  await signIn(page, fx.cover);

  await expect(
    page.getByText(/You are covering for Playwright Away Person/),
  ).toBeVisible();
  await expect(page.getByText(/Statutory date passed/)).toBeVisible();

  // and nothing has moved: the engagement is still the absentee's
  const engagement = await Engagement.findOne({ code: `PWC-${fx.code}` })
    .select("assigneeId")
    .lean();
  expect(String(engagement.assigneeId)).toBe(awayId);
});

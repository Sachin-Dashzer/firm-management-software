import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import { TOTP, Secret } from "otpauth";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import ServiceTemplate from "../../models/ServiceTemplate.js";
import Engagement from "../../models/Engagement.js";
import SavedView from "../../models/SavedView.js";
import { hashPassword, decryptField } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";

/**
 * The dashboard and the reports (spec section 10).
 *
 * The acceptance criterion in spec section 17 is the one worth a browser:
 * *the figures on the partner dashboard match the underlying lists*. So
 * this reads the number off the tile, clicks it, and counts the rows on
 * the list it lands on. A unit test cannot check that, because the whole
 * risk is the two using different queries.
 *
 * Skipped until Atlas is configured, like the other suites.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    partner: `pw-rep-partner-${tag}@phmgindia.test`,
    serviceCode: `PWX-${tag.slice(0, 6).toUpperCase()}`,
    clientName: `Playwright Reports ${tag} Private Limited`,
    viewName: `pw overdue ${tag}`,
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
  await SavedView.deleteMany({ name: fx.viewName }, { withDeleted: true });
  await User.deleteMany({ email: fx.partner });
}

/** Three overdue jobs and one due next week, so the tiles have real work. */
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

    const [partner] = await User.create(
      [
        {
          name: "Playwright Reporting Partner",
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
          name: `Playwright reported service ${testInfo.project.name}`,
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

    const day = 86_400_000;
    const plan = [
      { period: "2026-07", due: new Date(Date.now() - 40 * day) },
      { period: "2026-08", due: new Date(Date.now() - 20 * day) },
      { period: "2026-09", due: new Date(Date.now() - 5 * day) },
      { period: "2026-11", due: new Date(Date.now() + 4 * day) },
    ];

    await Engagement.create(
      plan.map((item, index) => ({
        code: `ENG-PWREP-${testInfo.project.name.length}-${index}`,
        clientId: client._id,
        branchId: branch._id,
        serviceTemplateId: template._id,
        templateSnapshot: {
          name: template.name,
          code: template.code,
          category: template.category,
        },
        period: item.period,
        periodLabel: item.period,
        status: "In progress",
        assigneeId: partner._id,
        reviewerId: partner._id,
        statutoryDue: item.due,
        internalDue: item.due,
        feePaise: 500_000,
        createdBy: "test",
        updatedBy: "test",
      })),
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

test("the overdue figure on the dashboard matches the list behind it", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  const tile = page.getByRole("link").filter({ hasText: "Overdue" }).first();
  const shown = Number((await tile.textContent()).replace(/\D/g, ""));
  expect(shown).toBeGreaterThanOrEqual(3);

  await tile.click();
  await expect(page).toHaveURL(/\/engagements\?.*due=overdue/);

  // the list says how many it found, in words, at the top
  const heading = await page
    .locator("p", { hasText: /jobs? open/ })
    .first()
    .textContent();
  const listed = Number(heading.replace(/\D/g, ""));
  expect(listed).toBe(shown);
});

test("a report filters, exports and remembers a saved view", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  await page.goto("/reports");
  await page.getByRole("link", { name: "Overdue work" }).click();
  await expect(page).toHaveURL(/\/reports\/overdue/);
  await expect(page.getByText(fx.clientName).first()).toBeVisible();

  // --- the spreadsheet is a real xlsx, not csv with a new name ----------
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Excel" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(
    /^phmg-overdue-\d{4}-\d{2}-\d{2}\.xlsx$/,
  );

  // --- save the filters, then come back to them in one click ------------
  await page.goto("/reports/overdue?branch=&status=");
  await page.getByRole("combobox", { name: "Branch" }).selectOption({
    label: "Noida (head office)",
  });
  await page.getByRole("button", { name: "Apply" }).click();

  await page.getByRole("button", { name: "Save these filters" }).click();
  await page.getByLabel("Call this view").fill(fx.viewName);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText(`Saved as “${fx.viewName}”`)).toBeVisible();

  await page.goto("/reports/overdue");
  await page.getByRole("link", { name: fx.viewName }).click();
  await expect(page).toHaveURL(/branch=/);

  const saved = await SavedView.findOne({ name: fx.viewName }).lean();
  expect(saved.screen).toBe("overdue");
  expect(saved.shared).toBe(false);
});

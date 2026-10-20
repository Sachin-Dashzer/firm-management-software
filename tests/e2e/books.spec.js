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
 * The three practice books (P2-8a).
 *
 * Two things are worth a browser: that a filing date recorded on the
 * engagement reaches the Tax book and is called late by the right number of
 * days, and that an audit report which was not clean cannot be saved without
 * saying why.
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
    ca: `pw-book-ca-${tag}@phmgindia.test`,
    taxCode: `PWT-${tag.slice(0, 6).toUpperCase()}`,
    auditCode: `PWA-${tag.slice(0, 6).toUpperCase()}`,
    clientName: `Playwright Books ${tag} Private Limited`,
  };
}

const ids = { tax: "", audit: "" };
/** The deadline the tax engagement is three days past. */
const due = startOfISTDay(new Date(Date.now() - 20 * DAY));
const filed = startOfISTDay(new Date(Date.now() - 17 * DAY));

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
    { code: { $in: [fx.taxCode, fx.auditCode] } },
    { withDeleted: true },
  );
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
          name: "Playwright Books CA",
          email: fx.ca,
          role: "ca",
          branchIds: [branch._id],
          icai: { membershipNo: "419876", grade: "ACA", copHeld: true },
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

    const services = await ServiceTemplate.create(
      [
        {
          name: `Playwright GST return ${testInfo.project.name}`,
          code: fx.taxCode,
          category: "Indirect Tax",
          level: "L1",
          minExecRole: "intern",
          minReviewRole: "ca",
          recurrence: "one-time",
          checklist: [],
          steps: [{ name: "File the return" }],
          createdBy: "test",
          updatedBy: "test",
        },
        {
          name: `Playwright statutory audit ${testInfo.project.name}`,
          code: fx.auditCode,
          category: "Audit and Assurance",
          level: "L3",
          minExecRole: "ca",
          minReviewRole: "partner",
          recurrence: "one-time",
          udinRequired: true,
          checklist: [],
          steps: [{ name: "Issue the report" }],
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
    );

    for (const [key, service, extra] of [
      ["tax", services[0], { statutoryDue: due }],
      ["audit", services[1], {}],
    ]) {
      const fields = buildEngagement({
        template: service.toObject(),
        client,
        period: periodFor("one-time"),
        assigneeId: ca._id,
      });
      const [row] = await Engagement.create(
        [
          {
            ...fields,
            ...extra,
            code: `PWB-${service.code}`,
            status: "In progress",
            createdBy: "test",
            updatedBy: "test",
          },
        ],
        { session },
      );
      ids[key] = String(row._id);
    }
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

const asInput = (date) => date.toISOString().slice(0, 10);

test("a return filed after its deadline is called late in the Tax book", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.ca);

  // before anything is filed, the deadline has passed and the book says so
  await page.goto("/practice/tax");
  // the cell, not the count at the top, which says the same words
  await expect(
    page.getByRole("cell", { name: "Past the deadline, not filed" }),
  ).toBeVisible();

  await page.goto(`/engagements/${ids.tax}`);
  // a GST return is not audit work, so the report block is not on the page
  await expect(page.getByText("The audit report")).toHaveCount(0);
  await page.getByLabel("Acknowledgement number").fill("AB2610174455621");
  await page.getByLabel("Filed on").fill(asInput(filed));
  await page.getByRole("button", { name: /Save filing/ }).click();
  await expect(page.getByText("Filing details saved")).toBeVisible();

  const saved = await Engagement.findById(ids.tax).lean();
  expect(saved.filedOn).toBeTruthy();

  await page.goto("/practice/tax");
  await expect(page.getByRole("cell", { name: "3 days late" })).toBeVisible();

  // the count at the top filters to exactly the rows it counted
  await page.getByRole("link", { name: /filed late/ }).click();
  await expect(page.getByRole("cell", { name: "3 days late" })).toHaveCount(1);
});

test("an audit report that was not clean has to say why", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.ca);
  await page.goto(`/engagements/${ids.audit}`);

  await page.getByLabel("Audit type").selectOption("Statutory audit");
  await page.getByLabel("Opinion").selectOption("Qualified");
  await page.getByRole("button", { name: /Save filing/ }).click();
  await expect(page.getByRole("alert")).toContainText("modified for");

  // nothing was half-written
  let saved = await Engagement.findById(ids.audit).lean();
  expect(saved.assurance?.opinion ?? "").toBe("");

  await page
    .getByLabel("What the opinion is modified for")
    .fill("Inventory at the Ludhiana godown was not observed.");
  await page.getByRole("button", { name: /Save filing/ }).click();
  await expect(page.getByText("Filing details saved")).toBeVisible();

  saved = await Engagement.findById(ids.audit).lean();
  expect(saved.assurance.opinion).toBe("Qualified");
  expect(saved.assurance.qualificationNote).toContain("godown");

  await page.goto("/practice/audits");
  await expect(page.getByRole("cell", { name: "Qualified" })).toBeVisible();
});

test("a filing date in the future is refused", async ({ page }, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.ca);
  await page.goto(`/engagements/${ids.audit}`);

  const tomorrow = asInput(new Date(Date.now() + DAY));
  // the input carries a max, so this types past the browser's own guard
  await page.getByLabel("Filed on").evaluate((element, value) => {
    element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }, tomorrow);
  await page.getByRole("button", { name: /Save filing/ }).click();
  await expect(page.getByRole("alert")).toContainText("future");
});

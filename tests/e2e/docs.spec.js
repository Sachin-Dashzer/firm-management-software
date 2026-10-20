import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import { TOTP, Secret } from "otpauth";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import ServiceTemplate from "../../models/ServiceTemplate.js";
import Engagement from "../../models/Engagement.js";
import DocTemplate from "../../models/DocTemplate.js";
import GeneratedDoc from "../../models/GeneratedDoc.js";
import { hashPassword, decryptField } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";
import { buildEngagement } from "../../lib/engagements/create.js";
import { periodFor } from "../../lib/engagements/period.js";

/**
 * Based Docs (P2-8b).
 *
 * The browser is here for the two rules that cannot be unit-tested end to
 * end: an unapproved template produces a draft and refuses to be issued,
 * and an A-tier letter waits for a partner however senior the CA is.
 *
 * Skipped until Atlas is configured, like every other suite.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    partner: `pw-doc-partner-${tag}@phmgindia.test`,
    ca: `pw-doc-ca-${tag}@phmgindia.test`,
    serviceCode: `PWD-${tag.slice(0, 6).toUpperCase()}`,
    templateCode: `PWDOC-${tag.slice(0, 6).toUpperCase()}`,
    clientName: `Playwright Docs ${tag} Private Limited`,
  };
}

const ids = { engagement: "", template: "" };

async function wipe(fx) {
  const client = await Client.findOne({ legalName: fx.clientName }, null, {
    withDeleted: true,
  });
  if (client) {
    await GeneratedDoc.deleteMany(
      { clientId: client._id },
      { withDeleted: true },
    );
    await Engagement.deleteMany(
      { clientId: client._id },
      { withDeleted: true },
    );
    await Client.deleteOne({ _id: client._id }, { withDeleted: true });
  }
  await DocTemplate.deleteMany(
    { code: fx.templateCode },
    { withDeleted: true },
  );
  await ServiceTemplate.deleteMany(
    { code: fx.serviceCode },
    { withDeleted: true },
  );
  await User.deleteMany({ email: { $in: [fx.partner, fx.ca] } });
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

    const [, ca] = await User.create(
      [
        {
          name: "Playwright Docs Partner",
          email: fx.partner,
          role: "partner",
          branchIds: [branch._id],
          icai: { membershipNo: "098765", grade: "FCA", copHeld: true },
          passwordHash: await hashPassword(PASSWORD),
        },
        {
          name: "Playwright Docs CA",
          email: fx.ca,
          role: "ca",
          branchIds: [branch._id],
          icai: { membershipNo: "412399", grade: "ACA", copHeld: true },
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
          addresses: [
            {
              kind: "Registered",
              line1: "B-44, Sector 63",
              city: "Noida",
              state: "UP",
              pincode: "201301",
            },
          ],
          contacts: [
            {
              name: "Vikram Jaiswal",
              designation: "Director",
              mobile: "9810012345",
              primary: true,
            },
          ],
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
    );

    // L3: A tier, so only a partner issues its letters
    const [service] = await ServiceTemplate.create(
      [
        {
          name: `Playwright statutory audit ${testInfo.project.name}`,
          code: fx.serviceCode,
          category: "Audit and Assurance",
          level: "L3",
          minExecRole: "ca",
          minReviewRole: "partner",
          recurrence: "one-time",
          checklist: [],
          steps: [{ name: "Issue the report" }],
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
    );

    const fields = buildEngagement({
      template: service.toObject(),
      client,
      period: periodFor("one-time"),
      assigneeId: ca._id,
    });
    const [engagement] = await Engagement.create(
      [
        {
          ...fields,
          code: `PWD-${fx.serviceCode}`,
          status: "In progress",
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
    );
    ids.engagement = String(engagement._id);

    const [template] = await DocTemplate.create(
      [
        {
          code: fx.templateCode,
          name: `Playwright engagement letter ${testInfo.project.name}`,
          kind: "Engagement",
          title: "Engagement letter",
          body: "{{doc.date}}\n\n{{client.legalName}}\n{{client.address}}\n\nDear {{client.contactName}},\n\nRe: {{engagement.service}} for {{engagement.period}}.\n\nFor {{firm.name}}\n{{signatory.name}}",
          // unapproved on purpose: the first test is that it cannot issue
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
    );
    ids.template = String(template._id);
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

test("a draft fills itself in from the record", async ({ page }, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.ca);
  await page.goto(`/engagements/${ids.engagement}`);

  await page
    .getByLabel("Start a draft from")
    .selectOption({ label: /not approved yet/ });
  await page.getByRole("button", { name: "Start the draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft");

  await page.getByRole("button", { name: "Read it" }).click();
  // the client's own details, not placeholders
  await expect(page.getByText(fx.clientName)).toBeVisible();
  await expect(page.getByText("Vikram Jaiswal")).toBeVisible();
  await expect(page.getByText("{{")).toHaveCount(0);
});

test("an unapproved template cannot be issued, however senior you are", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto(`/engagements/${ids.engagement}`);

  await page.getByRole("button", { name: "Issue" }).click();
  await expect(page.getByRole("alert")).toContainText("approved");

  const doc = await GeneratedDoc.findOne({ templateId: ids.template }).lean();
  expect(doc.state).toBe("draft");
  expect(doc.bodyText).toBe("");
});

test("approving the wording is a partner's, and a CA still cannot issue A-tier work", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);

  // a CA sees the template but no approve button
  await signIn(page, fx.ca);
  await page.goto("/settings/doc-templates");
  await expect(page.getByText(/not approved/i).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve the wording" }),
  ).toHaveCount(0);

  // the partner approves it
  await page.context().clearCookies();
  await signIn(page, fx.partner);
  await page.goto("/settings/doc-templates");
  await page
    .getByRole("listitem")
    .filter({ hasText: fx.templateCode })
    .getByRole("button", { name: "Approve the wording" })
    .click();
  await expect(page.getByRole("status")).toContainText("approved");

  // approved or not, an A-tier letter is not the CA's to issue
  await page.context().clearCookies();
  await signIn(page, fx.ca);
  await page.goto(`/engagements/${ids.engagement}`);
  await expect(page.getByRole("button", { name: "Issue" })).toHaveCount(0);

  // the partner issues it, and the words are frozen
  await page.context().clearCookies();
  await signIn(page, fx.partner);
  await page.goto(`/engagements/${ids.engagement}`);
  await page.getByRole("button", { name: "Issue" }).click();
  await expect(page.getByRole("status")).toContainText("fixed");

  const doc = await GeneratedDoc.findOne({ templateId: ids.template }).lean();
  expect(doc.state).toBe("final");
  expect(doc.bodyText).toContain(fx.clientName);
  expect(doc.signatoryMembershipNo).toBe("098765");
});

test("an issued document cannot be discarded", async ({ page }, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto(`/engagements/${ids.engagement}`);

  await expect(page.getByRole("button", { name: "Discard" })).toHaveCount(0);
  const doc = await GeneratedDoc.findOne({ templateId: ids.template }).lean();
  expect(doc.deletedAt ?? null).toBeNull();
});

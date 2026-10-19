import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import { TOTP, Secret } from "otpauth";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import ServiceTemplate from "../../models/ServiceTemplate.js";
import Engagement from "../../models/Engagement.js";
import DocumentModel from "../../models/Document.js";
import AuditLog from "../../models/AuditLog.js";
import { hashPassword, decryptField } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";

/**
 * Attaching a file to a checklist item and getting it back again
 * (spec section 6), against the local storage driver — the same tickets,
 * the same encrypted vault layout and the same audit entries the BigRock
 * gateway will see.
 *
 * Skipped until Atlas is configured, like the other suites.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    partner: `pw-doc-partner-${tag}@phmgindia.test`,
    serviceCode: `PWD-${tag.slice(0, 6).toUpperCase()}`,
    clientName: `Playwright Files ${tag} Private Limited`,
  };
}

async function wipe(fx) {
  const client = await Client.findOne({ legalName: fx.clientName }, null, {
    withDeleted: true,
  });
  if (client) {
    await DocumentModel.deleteMany(
      { clientId: client._id },
      { withDeleted: true },
    );
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
  await User.deleteMany({ email: fx.partner });
}

let engagementId;

test.beforeAll(async ({}, testInfo) => {
  const fx = names(testInfo.project.name);
  await connectDB();
  await wipe(fx);

  engagementId = await systemAudit(async (session) => {
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

    const [template] = await ServiceTemplate.create(
      [
        {
          name: `Playwright filing ${testInfo.project.name}`,
          code: fx.serviceCode,
          category: "Indirect Tax",
          level: "L1",
          minExecRole: "intern",
          minReviewRole: "ca",
          recurrence: "monthly",
          turnaroundDays: 5,
          checklist: [
            { name: "Sales register", side: "client", mandatory: true },
          ],
          steps: [{ name: "File" }],
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
    );

    const [engagement] = await Engagement.create(
      [
        {
          code: `NOI-${fx.serviceCode}-2026-10-8001`,
          clientId: client._id,
          serviceTemplateId: template._id,
          branchId: branch._id,
          period: "2026-10",
          periodLabel: "Oct 2026",
          periodStart: new Date("2026-10-01T00:00:00+05:30"),
          status: "In progress",
          checklist: [
            { name: "Sales register", side: "client", mandatory: true },
          ],
          templateSnapshot: { name: template.name, code: template.code },
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
    );

    return String(engagement._id);
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

const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
);

test("attach a file to a checklist item, download it, delete and restore it", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto(`/engagements/${engagementId}`);

  await page.getByLabel("Attach to “Sales register”").setInputFiles({
    name: "october-sales.pdf",
    mimeType: "application/pdf",
    buffer: PDF,
  });

  await expect(page.getByText("1 file attached")).toBeVisible();

  // the record points at a key under the structured path (spec section 6)
  const document = await DocumentModel.findOne({ name: "october-sales.pdf" });
  expect(document).toBeTruthy();
  expect(document.fileKey).toMatch(
    new RegExp(`^clients/PHMG-NOI-\\d+/FY2026-27/${fx.serviceCode}/`),
  );
  expect(document.checksum).toHaveLength(64);

  // attaching a file moves the checklist item to Received
  const engagement = await Engagement.findById(engagementId);
  expect(engagement.checklist[0].status).toBe("Received");
  expect(engagement.checklist[0].documentIds).toHaveLength(1);

  // the upload is in the audit log
  const uploaded = await AuditLog.findOne({
    entityType: "Document",
    entityId: document._id,
    action: "document_upload",
  });
  expect(uploaded).toBeTruthy();

  // --- downloading is audited and the bytes come back intact --------------
  await page.reload();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).first().click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("october-sales.pdf");

  const served = await AuditLog.findOne({
    entityType: "Document",
    entityId: document._id,
    action: "document_download",
  });
  expect(served).toBeTruthy();

  // --- deleting moves it to the bin, not away -----------------------------
  await page.getByRole("button", { name: "Delete" }).first().click();
  await expect(page.getByText(/moved to the recycle bin/)).toBeVisible();

  const binned = await DocumentModel.findById(document._id).setOptions({
    withDeleted: true,
  });
  expect(binned.deletedAt).toBeTruthy();
  expect(binned.fileKey).not.toBe("");

  await page.goto("/documents/bin");
  await expect(page.getByText("october-sales.pdf")).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).first().click();
  await expect(page.getByText(/restored/)).toBeVisible();

  const back = await DocumentModel.findById(document._id);
  expect(back.deletedAt).toBeNull();
});

test("a file the firm does not accept is refused", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto(`/engagements/${engagementId}`);

  await page.getByLabel("Attach to “Sales register”").setInputFiles({
    name: "payload.exe",
    mimeType: "application/x-msdownload",
    buffer: Buffer.from("MZ not really an executable"),
  });

  await expect(page.getByRole("alert")).toContainText("not accepted");
  expect(await DocumentModel.countDocuments({ name: "payload.exe" })).toBe(0);
});

test("a client sends documents through the link, with no account", async ({
  page,
  browser,
}, testInfo) => {
  const fx = names(testInfo.project.name);

  // the firm makes the link
  await signIn(page, fx.partner);
  await page.goto(`/engagements/${engagementId}`);
  await page.getByRole("button", { name: "Make an upload link" }).click();
  await expect(page.getByText(/Link made for/)).toBeVisible();

  const link = await page.getByLabel("Upload link for the client").inputValue();
  expect(link).toContain("/upload/");

  // asking moves the checklist item to Requested
  const asked = await Engagement.findById(engagementId);
  expect(asked.checklist[0].status).toBe("Requested");

  // only the hash is stored, never the token itself
  const token = link.split("/upload/")[1];
  const stored = await mongoose.connection
    .collection("docrequests")
    .findOne({ engagementId: asked._id });
  expect(stored.tokenHash).not.toBe(token);
  expect(JSON.stringify(stored)).not.toContain(token);

  // --- the client, in a browser that has never signed in -----------------
  const theirs = await browser.newContext();
  const client = await theirs.newPage();
  await client.goto(link);

  // no redirect to the login page: the link is public on purpose
  await expect(client).toHaveURL(new RegExp("/upload/"));
  await expect(client.getByText("Sales register")).toBeVisible();

  await client.getByLabel("Send Sales register").setInputFiles({
    name: "client-sales.pdf",
    mimeType: "application/pdf",
    buffer: PDF,
  });
  await expect(client.getByText(/Received, thank you/).first()).toBeVisible();

  // it landed on the right checklist row, marked as from the client
  const received = await DocumentModel.findOne({ name: "client-sales.pdf" });
  expect(received).toBeTruthy();
  expect(received.uploadedByName).toBe("The client");
  const after = await Engagement.findById(engagementId);
  expect(after.checklist[0].status).toBe("Received");

  // and the upload is audited as having come through the link
  const logged = await AuditLog.findOne({
    entityType: "Document",
    entityId: received._id,
    action: "document_upload",
  });
  expect(logged.note).toContain("uploaded by the client");

  // --- the link gives nothing else away -----------------------------------
  await client.goto("/clients");
  await expect(client).toHaveURL(/\/login/);

  // --- withdrawing it stops it working ------------------------------------
  await page.reload();
  await page.getByRole("button", { name: "Withdraw" }).first().click();
  await expect(page.getByText(/no longer works/)).toBeVisible();

  await client.goto(link);
  await expect(client.getByText(/withdrawn/)).toBeVisible();

  await theirs.close();
});

test("a made-up upload link is refused", async ({ browser }) => {
  const theirs = await browser.newContext();
  const client = await theirs.newPage();

  await client.goto(
    "/upload/not-a-real-token-but-long-enough-to-look-like-one",
  );
  await expect(client.getByText("This link is not valid.")).toBeVisible();
  // still no redirect to login, and still nothing to see
  await expect(client.getByText("Sales register")).toHaveCount(0);

  await theirs.close();
});

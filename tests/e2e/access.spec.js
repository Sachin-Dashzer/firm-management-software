import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import { TOTP, Secret } from "otpauth";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import ClientAccess from "../../models/ClientAccess.js";
import { hashPassword, decryptField } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";

/**
 * Client Access Grants end to end (owner decision D3, 19-10-2026) —
 * acceptance checks 1, 2 and 3 of the Phase 2 list.
 *
 * Two clients in the same branch as the employee, so sharing a branch is
 * demonstrably not the thing that opens one. One of them is granted, with two
 * sections; the other is granted nothing at all.
 *
 * Skipped until the Atlas cluster is configured, like every other suite here.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PARTNER = "playwright-access-partner@phmgindia.test";
const EMPLOYEE = "playwright-access-employee@phmgindia.test";
const PASSWORD = "test-password-not-real";

const GRANTED_PAN = "AADCJ4817Q";
const UNSEEN_PAN = "AAGCT2904M";
const GRANTED_NAME = "Jaiswal Steels Private Limited";
const UNSEEN_NAME = "Tandon Exports LLP";

/** @type {{granted: string, unseen: string, employee: string}} */
const ids = { granted: "", unseen: "", employee: "" };

test.beforeAll(async () => {
  await connectDB();
  for (const email of [PARTNER, EMPLOYEE]) await User.deleteOne({ email });
  await Client.deleteMany(
    { pan: { $in: [GRANTED_PAN, UNSEEN_PAN] } },
    { withDeleted: true },
  );

  await systemAudit(async (session) => {
    const branch = await Branch.findOneAndUpdate(
      { code: "NOI" },
      { $setOnInsert: { name: "Noida (head office)", invoicePrefix: "NOI" } },
      { new: true, upsert: true, session },
    );

    await User.create(
      [
        {
          name: "Praveen Mehrotra",
          email: PARTNER,
          role: "partner",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
      ],
      { session },
    );

    const [employee] = await User.create(
      [
        {
          name: "Ankit Saxena",
          email: EMPLOYEE,
          role: "employee",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
      ],
      { session },
    );
    ids.employee = String(employee._id);

    const made = await Client.create(
      [
        {
          code: "PHMG-NOI-9801",
          legalName: GRANTED_NAME,
          tradeName: "Jaiswal Steels",
          entityType: "Private Limited",
          pan: GRANTED_PAN,
          status: "Active",
          branchId: branch._id,
        },
        {
          code: "PHMG-NOI-9802",
          legalName: UNSEEN_NAME,
          tradeName: "Tandon Exports",
          entityType: "LLP",
          pan: UNSEEN_PAN,
          status: "Active",
          branchId: branch._id,
        },
      ],
      { session },
    );
    ids.granted = String(made[0]._id);
    ids.unseen = String(made[1]._id);

    await ClientAccess.create(
      [
        {
          userId: employee._id,
          clientId: made[0]._id,
          branchId: branch._id,
          sections: ["profile", "documents"],
          reason: "Covering the GST filings while Riya is on exam leave",
          active: true,
          grantedBy: "test",
          grantedByName: "Praveen Mehrotra",
        },
      ],
      { session },
    );
  });
});

test.afterAll(async () => {
  await ClientAccess.deleteMany(
    { userId: ids.employee },
    { withDeleted: true },
  );
  await Client.deleteMany(
    { pan: { $in: [GRANTED_PAN, UNSEEN_PAN] } },
    { withDeleted: true },
  );
  for (const email of [PARTNER, EMPLOYEE]) await User.deleteOne({ email });
  await mongoose.disconnect();
});

/** @param {import("@playwright/test").Page} page */
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

// --- acceptance 1 ----------------------------------------------------------

test("a client with no grant and no assignment is nowhere to be found", async ({
  page,
}) => {
  await signIn(page, EMPLOYEE);

  await page.goto("/clients");
  await expect(page.getByText("Jaiswal Steels")).toBeVisible();
  await expect(page.getByText("Tandon Exports")).toHaveCount(0);

  await page.goto(`/clients/${ids.unseen}`);
  await expect(page).toHaveURL(/\/clients$/);

  const search = await page.request.get("/api/search?q=Tandon");
  expect(JSON.stringify(await search.json())).not.toContain("Tandon");

  // the firm document search is scoped by client too, not by branch
  const docs = await page.request.get("/documents?q=Tandon");
  expect(await docs.text()).not.toContain("Tandon Exports");
});

// --- acceptance 2 ----------------------------------------------------------

test("a grant of two sections shows exactly those two tabs", async ({
  page,
}) => {
  await signIn(page, EMPLOYEE);
  await page.goto(`/clients/${ids.granted}`);

  const tabs = page.getByRole("navigation", { name: "Client sections" });
  await expect(tabs.getByRole("link", { name: "Overview" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Documents" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Invoices" })).toHaveCount(0);
  await expect(tabs.getByRole("link", { name: "Notes" })).toHaveCount(0);
  await expect(tabs.getByRole("link", { name: "Activity" })).toHaveCount(0);
  await expect(tabs.getByRole("link", { name: "Team & access" })).toHaveCount(
    0,
  );

  // the grant does not carry the statutory IDs, so the PAN stays masked
  await expect(page.getByText("•••").first()).toBeVisible();
  await expect(page.getByText(GRANTED_PAN)).toHaveCount(0);

  // and the whole-dossier export is refused outright
  const dossier = await page.request.get(`/clients/${ids.granted}/export`);
  expect(dossier.status()).toBe(403);
});

test("revoking a grant closes the client on the next request", async ({
  page,
}) => {
  await signIn(page, EMPLOYEE);
  await page.goto(`/clients/${ids.granted}`);
  await expect(page).toHaveURL(new RegExp(ids.granted));

  await ClientAccess.updateOne(
    { userId: ids.employee, clientId: ids.granted },
    { $set: { active: false, revokedAt: new Date() } },
  );

  await page.goto(`/clients/${ids.granted}`);
  await expect(page).toHaveURL(/\/clients$/);

  await ClientAccess.updateOne(
    { userId: ids.employee, clientId: ids.granted },
    { $set: { active: true, revokedAt: null } },
  );
});

test("an expired grant does nothing, without waiting for the nightly job", async ({
  page,
}) => {
  await ClientAccess.updateOne(
    { userId: ids.employee, clientId: ids.granted },
    { $set: { expiresAt: new Date(Date.now() - 60_000), active: true } },
  );

  await signIn(page, EMPLOYEE);
  await page.goto(`/clients/${ids.granted}`);
  await expect(page).toHaveURL(/\/clients$/);
  await expect(page.getByText("Jaiswal Steels")).toHaveCount(0);

  await ClientAccess.updateOne(
    { userId: ids.employee, clientId: ids.granted },
    { $set: { expiresAt: null } },
  );
});

// --- acceptance 3 ----------------------------------------------------------

test("the grant drawer disables what the role may never hold", async ({
  page,
}) => {
  await signIn(page, PARTNER);
  await page.goto(`/clients/${ids.unseen}?tab=access`);

  await page.getByRole("button", { name: "Give someone access" }).click();
  await page.getByLabel("Who").selectOption({ label: /Ankit Saxena/ });

  await expect(page.getByLabel(/Profile and contacts/)).toBeEnabled();
  await expect(page.getByLabel(/Statutory IDs/)).toBeEnabled();
  await expect(page.getByLabel(/Portal logins/)).toBeDisabled();
  await expect(page.getByLabel(/Invoices, payments/)).toBeDisabled();
  await expect(page.getByText(/never opened by a grant/)).toBeVisible();
});

test("a partner can give access, and the client appears for the employee", async ({
  page,
  browser,
}) => {
  await signIn(page, PARTNER);
  await page.goto(`/clients/${ids.unseen}?tab=access`);

  await page.getByRole("button", { name: "Give someone access" }).click();
  await page.getByLabel("Who").selectOption({ label: /Ankit Saxena/ });
  await page.getByLabel(/Profile and contacts/).check();
  await page
    .getByLabel(/Why they need it/)
    .fill("Taking over the export paperwork");
  await page.getByRole("button", { name: "Give access" }).click();

  await expect(page.getByRole("status")).toContainText("can now see");

  const other = await browser.newContext();
  const employeePage = await other.newPage();
  await signIn(employeePage, EMPLOYEE);
  await employeePage.goto("/clients");
  await expect(employeePage.getByText("Tandon Exports")).toBeVisible();
  await other.close();
});

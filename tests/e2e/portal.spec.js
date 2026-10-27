import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import { TOTP, Secret } from "otpauth";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import ClientUser from "../../models/ClientUser.js";
import { hashPassword, decryptField } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";

/**
 * The client portal's door (P2-9a).
 *
 * This is the first login in the system for somebody outside the firm, so
 * these tests are about containment rather than features: a client must not
 * reach a staff screen, a staff member must not become a client, and an
 * account the firm closes must stop working at once rather than when its
 * session happens to expire.
 *
 * Skipped until Atlas is configured, like every other suite.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";
const PORTAL_PASSWORD = "portal-password-not-real";

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    partner: `pw-portal-partner-${tag}@phmgindia.test`,
    portal: `pw-portal-client-${tag}@phmgindia.test`,
    clientName: `Playwright Portal ${tag} Private Limited`,
  };
}

async function wipe(fx) {
  const client = await Client.findOne({ legalName: fx.clientName }, null, {
    withDeleted: true,
  });
  if (client) {
    await ClientUser.deleteMany(
      { clientId: client._id },
      { withDeleted: true },
    );
    await Client.deleteOne({ _id: client._id }, { withDeleted: true });
  }
  await ClientUser.deleteMany({ email: fx.portal }, { withDeleted: true });
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
          name: "Playwright Portal Partner",
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
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
    );

    await ClientUser.create(
      [
        {
          name: "Playwright Portal Client",
          email: fx.portal,
          designation: "Director",
          clientId: client._id,
          branchId: branch._id,
          passwordHash: await hashPassword(PORTAL_PASSWORD),
          // already past the forced change, so these tests are about the
          // door rather than the first-run screen
          mustChangePassword: false,
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

async function signInAsClient(page, email, password = PORTAL_PASSWORD) {
  await page.goto("/client/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function signInAsStaff(page, email) {
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

test("a client signs in and lands in their own portal", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signInAsClient(page, fx.portal);

  await expect(page).toHaveURL(/\/client$/);
  await expect(page.getByText(fx.clientName)).toBeVisible();
});

test("a client cannot reach any staff screen", async ({ page }, testInfo) => {
  const fx = names(testInfo.project.name);
  await signInAsClient(page, fx.portal);
  await expect(page).toHaveURL(/\/client$/);

  // every one of these has to end up at a login screen, not at the page
  for (const path of [
    // the landing page since P3-6, and the one that gathers every other
    // screen into one list, so the one most worth checking
    "/issues",
    "/today",
    "/clients",
    "/engagements",
    "/invoices",
    "/settings",
    "/team",
    "/practice/udin",
    "/reports",
  ]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/login/);
  }
});

test("a client's export and API guesses come back empty-handed", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signInAsClient(page, fx.portal);

  for (const path of ["/clients/export", "/team/export"]) {
    const response = await page.request.get(path);
    expect([302, 303, 307, 401, 403, 404], path).toContain(response.status());
  }
});

test("a staff member is not a client", async ({ page }, testInfo) => {
  const fx = names(testInfo.project.name);
  await signInAsStaff(page, fx.partner);

  // a staff session reaching the portal is sent to the portal's own login
  await page.goto("/client");
  await expect(page).toHaveURL(/\/client\/login/);
});

test("closing the account stops the session at once", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signInAsClient(page, fx.portal);
  await expect(page).toHaveURL(/\/client$/);

  // the firm closes the account while they are signed in
  await ClientUser.updateOne({ email: fx.portal }, { $set: { active: false } });

  await page.goto("/client");
  await expect(page).toHaveURL(/\/client\/login/);
});

test("a wrong password is refused without saying which part was wrong", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await ClientUser.updateOne(
    { email: fx.portal },
    { $set: { active: true, failedLogins: 0, lockedUntil: null } },
  );

  await signInAsClient(page, fx.portal, "not-the-password");
  await expect(page.getByRole("alert")).toContainText(
    "Email or password is not correct",
  );

  // the same answer for an address that does not exist at all
  await signInAsClient(page, "nobody-at-all@phmgindia.test", "whatever-1234");
  await expect(page.getByRole("alert")).toContainText(
    "Email or password is not correct",
  );
});

test("a partner creates a portal account and sees the password once", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signInAsStaff(page, fx.partner);

  const client = await Client.findOne({ legalName: fx.clientName }).lean();
  await page.goto(`/clients/${client._id}?tab=access`);

  await page.getByRole("button", { name: "Invite somebody" }).click();
  await page.getByLabel("Name").fill("Second Director");
  await page
    .getByLabel("Email")
    .fill(`pw-portal-second-${testInfo.project.name}@phmgindia.test`);
  await page.getByRole("button", { name: "Create the account" }).click();

  await expect(page.getByText(/Read this password out/)).toBeVisible();
  await expect(page.getByText("has not set a password yet")).toBeVisible();

  const created = await ClientUser.findOne({
    email: `pw-portal-second-${testInfo.project.name}@phmgindia.test`,
  }).lean();
  expect(created.mustChangePassword).toBe(true);
  expect(String(created.clientId)).toBe(String(client._id));

  await ClientUser.deleteOne({ _id: created._id });
});

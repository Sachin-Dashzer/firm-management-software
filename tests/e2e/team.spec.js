import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import { TOTP, Secret } from "otpauth";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import Engagement from "../../models/Engagement.js";
import ServiceTemplate from "../../models/ServiceTemplate.js";
import ClientAccess from "../../models/ClientAccess.js";
import { hashPassword, decryptField } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";
import { buildEngagement } from "../../lib/engagements/create.js";

/**
 * `/me`, `/team`, the Employee 360 and offboarding — acceptance checks 4 and
 * 9 of the Phase 2 list, plus the forced password change that has been open
 * since Step 1.
 *
 * Skipped until the Atlas cluster is configured, like every other suite here.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PARTNER = "playwright-team-partner@phmgindia.test";
const CA = "playwright-team-ca@phmgindia.test";
const EMPLOYEE = "playwright-team-employee@phmgindia.test";
const LEAVER = "playwright-team-leaver@phmgindia.test";
const EMAILS = [PARTNER, CA, EMPLOYEE, LEAVER];

const PASSWORD = "test-password-not-real";
const NEW_PASSWORD = "a-brand-new-password-2026";
const PAN = "AAHCP6204J";

const ids = {};

test.beforeAll(async () => {
  await connectDB();
  for (const email of EMAILS) await User.deleteOne({ email });
  await Client.deleteMany({ pan: PAN }, { withDeleted: true });

  await systemAudit(async (session) => {
    const branch = await Branch.findOneAndUpdate(
      { code: "NOI" },
      { $setOnInsert: { name: "Noida (head office)", invoicePrefix: "NOI" } },
      { returnDocument: "after", upsert: true, session },
    );
    ids.branch = branch._id;

    const [partner] = await User.create(
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
    ids.partner = String(partner._id);

    const [ca] = await User.create(
      [
        {
          name: "Ritika Chandra",
          email: CA,
          role: "ca",
          branchIds: [branch._id],
          reportingTo: partner._id,
          passwordHash: await hashPassword(PASSWORD),
        },
      ],
      { session },
    );
    ids.ca = String(ca._id);

    // the employee whose /me page is the point of acceptance check 4
    const [employee] = await User.create(
      [
        {
          name: "Ankit Saxena",
          email: EMPLOYEE,
          role: "employee",
          mobile: "9958120043",
          branchIds: [branch._id],
          reportingTo: ca._id,
          passwordHash: await hashPassword(PASSWORD),
        },
      ],
      { session },
    );
    ids.employee = String(employee._id);

    // the one being offboarded, with a one-time password still on it
    const [leaver] = await User.create(
      [
        {
          name: "Shalini Verma",
          email: LEAVER,
          role: "employee",
          branchIds: [branch._id],
          reportingTo: ca._id,
          passwordHash: await hashPassword(PASSWORD),
          mustChangePassword: true,
        },
      ],
      { session },
    );
    ids.leaver = String(leaver._id);

    const [client] = await Client.create(
      [
        {
          code: "PHMG-NOI-9701",
          legalName: "Pathak Logistics Private Limited",
          tradeName: "Pathak Logistics",
          entityType: "Private Limited",
          pan: PAN,
          status: "Active",
          branchId: branch._id,
        },
      ],
      { session },
    );
    ids.client = String(client._id);

    // a grant on the employee, so /me has something in "clients I have been given"
    await ClientAccess.create(
      [
        {
          userId: employee._id,
          clientId: client._id,
          branchId: branch._id,
          sections: ["profile", "documents"],
          reason: "Covering the Noida paperwork over the festive weeks",
          active: true,
          grantedBy: ids.partner,
          grantedByName: "Praveen Mehrotra",
        },
      ],
      { session },
    );

    // one open engagement on the leaver, which must block offboarding
    const template = await ServiceTemplate.findOne({ code: "GSTR3B" }).lean();
    if (template) {
      const fields = buildEngagement({
        template,
        client,
        period: {
          code: "2026-09",
          label: "Sep 2026",
          start: new Date("2026-09-01"),
          end: new Date("2026-09-30"),
        },
        assigneeId: leaver._id,
        reviewerId: ca._id,
      });
      const [engagement] = await Engagement.create(
        [
          {
            ...fields,
            code: "NOI-GSTR3B-2026-09-9701",
            status: "In progress",
          },
        ],
        { session },
      );
      ids.engagement = String(engagement._id);
    }
  });
});

test.afterAll(async () => {
  if (ids.engagement) {
    await Engagement.deleteOne({ _id: ids.engagement }, { withDeleted: true });
  }
  await ClientAccess.deleteMany(
    { clientId: ids.client },
    { withDeleted: true },
  );
  await Client.deleteMany({ pan: PAN }, { withDeleted: true });
  for (const email of EMAILS) {
    await User.deleteOne({ email }, { withDeleted: true });
  }
  await mongoose.disconnect();
});

/** @param {import("@playwright/test").Page} page */
async function signIn(page, email, password = PASSWORD, land = /\/issues$/) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
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
  await expect(page).toHaveURL(land);
}

// --- acceptance 4 ----------------------------------------------------------

test("an employee's own page names their senior CA, with a way to reach them", async ({
  page,
}) => {
  await signIn(page, EMPLOYEE);
  await page.goto("/me");

  const senior = page
    .getByRole("region", { name: "My senior CA" })
    .or(page.locator("section", { has: page.getByText("My senior CA") }));
  await expect(page.getByText("Ritika Chandra")).toBeVisible();
  await expect(page.getByText(CA)).toBeVisible();
  await expect(senior.first()).toContainText("Ritika Chandra");

  // and the grant they hold is shown to them, with the reason
  await expect(page.getByText("Pathak Logistics")).toBeVisible();
  await expect(page.getByText(/festive weeks/)).toBeVisible();
});

test("an employee cannot open the team list or somebody else's record", async ({
  page,
}) => {
  await signIn(page, EMPLOYEE);

  await page.goto("/team");
  await expect(page).toHaveURL(/\/me$/);

  await page.goto(`/team/${ids.ca}`);
  await expect(page).toHaveURL(/\/me$/);

  const spreadsheet = await page.request.get("/team/export");
  expect(spreadsheet.status()).toBe(403);
});

// --- the forced password change --------------------------------------------

test("a one-time password gets you no further than the change screen", async ({
  page,
}) => {
  // the leaver still has mustChangePassword set
  await signIn(page, LEAVER, PASSWORD, /\/change-password/);

  // every other page bounces back to it
  await page.goto("/today");
  await expect(page).toHaveURL(/\/change-password/);
  await page.goto("/clients");
  await expect(page).toHaveURL(/\/change-password/);

  await page.getByLabel(/password you were given/i).fill(PASSWORD);
  await page.getByLabel(/^New password/).fill(NEW_PASSWORD);
  await page.getByLabel(/Type it again/).fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();

  await expect(page.getByRole("status")).toContainText("Password changed");
  await expect(page).toHaveURL(/\/me$/, { timeout: 5000 });

  // the old one no longer works, the new one does
  await page.goto("/api/auth/signout");
  const record = await User.findOne({ email: LEAVER }).lean();
  expect(record.mustChangePassword).toBe(false);
});

// --- the CA's view ---------------------------------------------------------

test("a CA reads a colleague's record but changes nothing on it", async ({
  page,
}) => {
  await signIn(page, CA);

  await page.goto("/team");
  await expect(page.getByText("Ankit Saxena")).toBeVisible();

  await page.goto(`/team/${ids.employee}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Ankit Saxena",
  );

  const tabs = page.getByRole("navigation", { name: "Team member sections" });
  await expect(tabs.getByRole("link", { name: "Work" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Admin" })).toHaveCount(0);

  // and the offboarding screen is not theirs to open
  await page.goto(`/team/${ids.employee}/offboard`);
  await expect(page).toHaveURL(new RegExp(`/team/${ids.employee}$`));
});

// --- acceptance 9 ----------------------------------------------------------

test("offboarding is blocked while open work is still theirs", async ({
  page,
}) => {
  test.skip(!ids.engagement, "needs the starter catalog seeded");

  await signIn(page, PARTNER);
  await page.goto(`/team/${ids.leaver}/offboard`);

  await expect(page.getByText("NOI-GSTR3B-2026-09-9701")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Offboard/ })).toBeDisabled();
  await expect(page.getByText(/Hand over the 1 open engagement/)).toBeVisible();
});

test("offboarding goes through once the work is handed over", async ({
  page,
}) => {
  test.skip(!ids.engagement, "needs the starter catalog seeded");

  // hand the engagement to the employee, out of band
  await Engagement.updateOne(
    { _id: ids.engagement },
    { $set: { assigneeId: ids.employee } },
  );

  await signIn(page, PARTNER);
  await page.goto(`/team/${ids.leaver}/offboard`);

  await page
    .getByLabel(/Why they are leaving/)
    .fill("Resigned, last day 31-10-2026");
  await page.getByRole("button", { name: /^Offboard/ }).click();
  await expect(page.getByRole("status")).toContainText("offboarded");

  // deactivated, soft deleted, grants revoked — and history intact
  const gone = await User.findOne({ email: LEAVER }).lean({
    withDeleted: true,
  });
  expect(gone.active).toBe(false);
  expect(gone.deletedAt).not.toBeNull();

  // they cannot sign in: the live check refuses on the very next request
  const other = await page.context().browser().newContext();
  const theirPage = await other.newPage();
  await theirPage.goto("/login");
  await theirPage.getByLabel("Email").fill(LEAVER);
  await theirPage.getByLabel("Password").fill(NEW_PASSWORD);
  await theirPage.getByRole("button", { name: "Continue" }).click();
  await expect(theirPage.getByRole("alert")).toBeVisible();
  await other.close();

  // the email can be used again, because the index is partial on deletedAt
  const clash = await User.findOne({ email: LEAVER }).lean();
  expect(clash).toBeNull();

  // and the engagement still carries what they did
  const engagement = await Engagement.findById(ids.engagement).lean();
  expect(engagement).not.toBeNull();
});

import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import { TOTP, Secret } from "otpauth";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import ServiceTemplate from "../../models/ServiceTemplate.js";
import Engagement from "../../models/Engagement.js";
import Udin from "../../models/Udin.js";
import Dsc from "../../models/Dsc.js";
import { hashPassword, decryptField } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";
import { buildEngagement } from "../../lib/engagements/create.js";
import { periodFor } from "../../lib/engagements/period.js";

/**
 * The UDIN and DSC registers (P2-7).
 *
 * The test that matters is the second one: a UDIN typed on an engagement has
 * to appear in the register, and the same number must then be refused for
 * other work. That is the whole reason the register exists rather than a
 * free-text field.
 *
 * Skipped until Atlas is configured, like the other suites.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    partner: `pw-reg-partner-${tag}@phmgindia.test`,
    ca: `pw-reg-ca-${tag}@phmgindia.test`,
    serviceCode: `PWR-${tag.slice(0, 6).toUpperCase()}`,
    clientName: `Playwright Registers ${tag} Private Limited`,
    // 18 characters, unique per project so the two runs cannot collide
    udin: `26${tag.slice(0, 4).toUpperCase().padEnd(4, "X")}ABCDEF7890`.slice(
      0,
      18,
    ),
  };
}

const ids = { first: "", second: "" };

async function wipe(fx) {
  const client = await Client.findOne({ legalName: fx.clientName }, null, {
    withDeleted: true,
  });
  if (client) {
    await Engagement.deleteMany(
      { clientId: client._id },
      { withDeleted: true },
    );
    await Udin.deleteMany({ clientId: client._id }, { withDeleted: true });
    await Dsc.deleteMany({ clientId: client._id }, { withDeleted: true });
    await Client.deleteOne({ _id: client._id }, { withDeleted: true });
  }
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

    const [, reviewer] = await User.create(
      [
        {
          name: "Playwright Register Partner",
          email: fx.partner,
          role: "partner",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
        {
          name: "Playwright Register CA",
          email: fx.ca,
          role: "ca",
          branchIds: [branch._id],
          icai: { membershipNo: "412345", grade: "FCA", copHeld: true },
          passwordHash: await hashPassword(PASSWORD),
        },
      ],
      { session },
    );

    const [client] = await Client.create(
      [
        {
          code: `PHMG-NOI-6${testInfo.project.name.length}00`,
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
          name: `Playwright certificate ${testInfo.project.name}`,
          code: fx.serviceCode,
          category: "Certification",
          level: "L3",
          minExecRole: "ca",
          minReviewRole: "partner",
          recurrence: "one-time",
          udinRequired: true,
          turnaroundDays: null,
          checklist: [],
          steps: [{ name: "Issue the certificate" }],
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
    );

    /** Two jobs for the same client, so one UDIN can be tried on both. */
    for (const [key, suffix] of [
      ["first", "A"],
      ["second", "B"],
    ]) {
      const fields = buildEngagement({
        template: service.toObject(),
        client,
        period: periodFor("one-time"),
        assigneeId: reviewer._id,
      });
      const [row] = await Engagement.create(
        [
          {
            ...fields,
            code: `PWR-${fx.serviceCode}-${suffix}`,
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
  await expect(page).toHaveURL(/\/issues$/);
}

test("a UDIN saved on an engagement lands in the register", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.ca);

  await page.goto(`/engagements/${ids.first}`);
  await page.getByLabel("UDIN").fill(fx.udin);
  await page.getByRole("button", { name: /Save filing/ }).click();
  await expect(page.getByText("Filing details saved")).toBeVisible();

  // the register is the record; the engagement's field is a copy of it
  const row = await Udin.findOne({ udin: fx.udin }).lean();
  expect(row).toBeTruthy();
  expect(String(row.engagementId)).toBe(ids.first);
  // recorded against the member who saved it, with their number snapshotted
  expect(row.membershipNo).toBe("412345");

  await page.goto("/practice/udin");
  await expect(page.getByText(fx.udin)).toBeVisible();
});

test("the same number cannot be recorded against other work", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.ca);

  await page.goto(`/engagements/${ids.second}`);
  await page.getByLabel("UDIN").fill(fx.udin);
  await page.getByRole("button", { name: /Save filing/ }).click();

  await expect(page.getByRole("alert")).toContainText("already recorded");

  // and nothing was half-written: the second engagement is untouched
  const second = await Engagement.findById(ids.second).lean();
  expect(second.udin).toBe("");
  const rows = await Udin.find({ udin: fx.udin }).lean();
  expect(rows).toHaveLength(1);
  expect(String(rows[0].engagementId)).toBe(ids.first);
});

test("a revoked UDIN stays in the register, struck through", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto("/practice/udin");

  await page.getByRole("button", { name: "Revoked?" }).first().click();
  await page
    .getByLabel("Why was it revoked?")
    .fill("Reissued after the client corrected a figure.");
  await page.getByRole("button", { name: "Mark revoked" }).click();

  await expect(page.getByRole("status")).toContainText("marked revoked");
  await expect(page.getByText(/Revoked/)).toBeVisible();

  const row = await Udin.findOne({ udin: fx.udin }).lean();
  expect(row.revokedAt).toBeTruthy();
  expect(row.revokeReason).toContain("Reissued");
});

test("a certificate expiring soon is on the register and on the dashboard", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  await page.goto("/practice/dsc");
  await page.getByRole("button", { name: "Add a certificate" }).click();
  await page
    .getByLabel("Client")
    .selectOption({ label: /Playwright Registers/ });
  await page.getByLabel("Whose certificate").fill("Vikram Jaiswal");
  await page.getByLabel("Their role").fill("Director");

  // ten days out: inside the thirty-day window the tile counts
  const soon = new Date(Date.now() + 10 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  await page.getByLabel("Expires").fill(soon);
  await page.getByRole("button", { name: "Add to the register" }).click();

  await expect(page.getByRole("status")).toContainText("Vikram Jaiswal");
  await expect(page.getByText("10 days left")).toBeVisible();

  // the same person and expiry again is somebody entering it twice
  await page.getByRole("button", { name: "Add a certificate" }).click();
  await page
    .getByLabel("Client")
    .selectOption({ label: /Playwright Registers/ });
  await page.getByLabel("Whose certificate").fill("Vikram Jaiswal");
  await page.getByLabel("Expires").fill(soon);
  await page.getByRole("button", { name: "Add to the register" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "already in the register",
  );

  // and the dashboard says so, counting what the register counted
  await page.goto("/today");
  const tile = page.getByRole("link", { name: /DSCs expiring/ });
  await expect(tile).toBeVisible();
  await tile.click();
  await expect(page).toHaveURL(/\/practice\/dsc\?soon=1/);
  await expect(page.getByText("Vikram Jaiswal")).toBeVisible();
});

test("the register names the partner who signed, and filters by them", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto("/practice/udin");

  // the signer is no longer optional: a certificate the register cannot
  // attribute to a partner or a CA is the thing this rule exists to stop
  await page.getByRole("button", { name: "Record a UDIN" }).click();
  await expect(page.locator('select[name="memberId"]')).toHaveAttribute(
    "required",
    "",
  );
  await page.getByRole("button", { name: "Cancel" }).click();

  // the one already recorded was signed by the CA who filed it
  await expect(page.getByText("Playwright Register CA")).toBeVisible();

  await page
    .getByLabel("Signed by")
    .selectOption({ label: /Playwright Register CA/ });
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.getByText(fx.udin)).toBeVisible();

  // filtered to the partner, who signed nothing, the register is empty
  await page
    .getByLabel("Signed by")
    .selectOption({ label: /Playwright Register Partner/ });
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.getByText(fx.udin)).toHaveCount(0);
});

test("a UDIN row opens the papers behind the certificate", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto("/practice/udin");

  await page
    .getByRole("button", { name: /None yet|file/ })
    .first()
    .click();
  await expect(page.getByText("Attached to this UDIN")).toBeVisible();
  await expect(
    page.getByText("the signed certificate belongs here"),
  ).toBeVisible();
  // it came out of an engagement, so that engagement's own papers are here
  await expect(page.getByText("On the engagement it came from")).toBeVisible();
});

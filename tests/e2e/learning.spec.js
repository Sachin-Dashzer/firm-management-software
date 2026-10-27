import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import { TOTP, Secret } from "otpauth";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Procedure from "../../models/Procedure.js";
import { hashPassword, decryptField } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";

/**
 * The firm's own procedures, beside the work (P3-19).
 *
 * The flow worth a browser is the whole claim: the panel on a screen
 * nobody has written up says so and offers the box; once a CA has written
 * it, the same panel on the same screen carries their words; and a partner
 * is the one who says it is still true.
 *
 * Skipped until Atlas is configured, like every other suite.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";
const KEY = "clients.new";

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    tag,
    partner: `pw-learn-partner-${tag}@phmgindia.test`,
    ca: `pw-learn-ca-${tag}@phmgindia.test`,
    firstStep: `Ring the client and ask for the PAN ${tag}`,
  };
}

async function wipe(fx) {
  await Procedure.deleteMany({ key: KEY }, { withDeleted: true });
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

    await User.create(
      [
        {
          name: "Playwright Learn Partner",
          email: fx.partner,
          role: "partner",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
        {
          name: "Playwright Learn Manager",
          email: fx.ca,
          role: "ca",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
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

test("a screen nobody has written up says so, and then carries the firm's words", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);

  await signIn(page, fx.ca);
  await page.goto("/clients/new");

  // the panel admits the silence rather than filling it
  await page.getByRole("button", { name: "How we do this" }).click();
  await expect(
    page.getByText(/Nobody at the firm has written this one up yet/),
  ).toBeVisible();
  await page.getByRole("link", { name: "Write it" }).click();
  await expect(page).toHaveURL(new RegExp(`/learning/${KEY}$`));

  // who may do the work is read from the matrix, not typed in
  await expect(page.getByText(/the work on it is/)).toBeVisible();

  await page
    .getByLabel("The steps")
    .fill(
      `${fx.firstStep}\n— They never have it to hand; give them a day\nCheck the group before you create them`,
    );
  await page.getByLabel(/What this is not for/).fill("Taking on an audit");
  await page.getByRole("button", { name: "Save it" }).click();
  await expect(page.getByRole("status")).toContainText(/Written/);

  // and it is there, beside the work, for the next person
  await page.goto("/clients/new");
  await page.getByRole("button", { name: "How we do this" }).click();
  await expect(page.getByText(fx.firstStep)).toBeVisible();
  await expect(page.getByText(/They never have it to hand/)).toBeVisible();
  await expect(
    page.getByText(/No partner has confirmed this in the last year/),
  ).toBeVisible();

  // a partner is the one who says it is still true
  await page.context().clearCookies();
  await signIn(page, fx.partner);
  await page.goto(`/learning/${KEY}`);
  await page.getByRole("button", { name: /it is still how we work/ }).click();
  await expect(page.getByRole("status")).toContainText(/still true/);

  const saved = await Procedure.findOne({ key: KEY }).lean();
  expect(saved.steps).toHaveLength(2);
  expect(saved.steps[0].note).toMatch(/never have it to hand/);
  expect(saved.reviewedByName).toBe("Playwright Learn Partner");
});

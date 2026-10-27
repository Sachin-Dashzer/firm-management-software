import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import { TOTP, Secret } from "otpauth";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import { hashPassword, decryptField } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";

/**
 * The data lab (P3-20).
 *
 * The flow worth a browser is the mapping step: nothing is checked until
 * somebody says which column is which, and once they do, the duplicate and
 * the gap in the series are named with the rows they are on. The checks
 * themselves are arithmetic and live in tests/datalab.test.js.
 *
 * Skipped until Atlas is configured, like every other suite.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return { tag, ca: `pw-lab-ca-${tag}@phmgindia.test` };
}

const SHEET = [
  "Date,Voucher,Party,Amount",
  "01-04-2026,INV-001,Nirmal Udyog,10000",
  "02-04-2026,INV-002,Sharma Textiles,25000",
  "02-04-2026,INV-002,Sharma Textiles,-5000",
  "03-04-2026,INV-004,Nirmal Udyog,15000",
].join("\n");

async function wipe(fx) {
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

    await User.create(
      [
        {
          name: "Playwright Lab Manager",
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

test("a register is read, mapped, and checked", async ({ page }, testInfo) => {
  const fx = names(testInfo.project.name);

  await signIn(page, fx.ca);
  await page.goto("/lab");

  await page.locator('input[type="file"]').setInputFiles({
    name: "sales.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(SHEET, "utf8"),
  });
  await page.getByRole("button", { name: "Read it" }).click();

  // it says what the columns look like, and decides nothing
  await expect(page.getByText("sales.csv · 4 rows")).toBeVisible();
  await expect(page.getByText("Which column is which")).toBeVisible();

  // nothing is checked until somebody maps a column
  await page.getByRole("button", { name: "Check it" }).click();
  await expect(page.getByRole("alert")).toContainText(
    /Say which column is which first/,
  );

  await page.getByLabel("Date").selectOption({ label: "Date" });
  await page.getByLabel("Amount").selectOption({ label: "Amount" });
  await page
    .getByLabel("Reference or voucher number")
    .selectOption({ label: "Voucher" });
  await page.getByLabel("Period from").fill("2026-04-01");
  await page.getByLabel("Period to").fill("2026-04-30");
  await page.getByRole("button", { name: "Check it" }).click();

  await expect(
    page.getByText(/1 reference appears more than once/),
  ).toBeVisible();
  await expect(page.getByText(/INV-002 — rows 3, 4/)).toBeVisible();
  await expect(
    page.getByText(/1 number missing from the series/),
  ).toBeVisible();
  await expect(page.getByText(/1 negative amount/)).toBeVisible();

  // and the summary is the thing that can be kept, not the file
  await expect(page.getByText(/The file itself is not kept/)).toBeVisible();
});

import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import { TOTP, Secret } from "otpauth";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import AuditLog from "../../models/AuditLog.js";
import { hashPassword, decryptField } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";

/**
 * Onboarding a client end to end: the form, the duplicate check, the
 * credentials vault and the audit trail behind all of it.
 *
 * Skipped until the Atlas cluster is configured, like the sign-in suite.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const EMAIL = "playwright-clients@phmgindia.test";
const PASSWORD = "test-password-not-real";
const PAN = "AABCS1429P";
const GSTIN = "09AABCS1429P1ZZ";
const NAME = "Playwright Textiles Private Limited";

test.beforeAll(async () => {
  await connectDB();
  await User.deleteOne({ email: EMAIL });
  // audited models refuse to write outside a transaction, fixtures included
  await systemAudit(async (session) => {
    const branch = await Branch.findOneAndUpdate(
      { code: "NOI" },
      { $setOnInsert: { name: "Noida (head office)", invoicePrefix: "NOI" } },
      { new: true, upsert: true, session },
    );
    await User.create(
      [
        {
          name: "Playwright Partner",
          email: EMAIL,
          role: "partner",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
      ],
      { session },
    );
  });
  await Client.deleteMany({ pan: PAN }, { withDeleted: true });
});

test.afterAll(async () => {
  await Client.deleteMany({ pan: PAN }, { withDeleted: true });
  await User.deleteOne({ email: EMAIL });
  await mongoose.disconnect();
});

async function signIn(page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();

  const user = await User.findOne({ email: EMAIL }).select("+totpSecret");
  const code = new TOTP({
    issuer: "PHMG & Associates",
    label: EMAIL,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(decryptField(user.totpSecret)),
  }).generate();

  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: /Sign in|Turn on 2FA/ }).click();
  await expect(page).toHaveURL(/\/today$/);
}

test("onboard a client, then find it again", async ({ page }) => {
  await signIn(page);

  await page.goto("/clients/new");
  await page.getByLabel("Legal name").fill(NAME);
  await page.getByLabel("Trade name").fill("Playwright Textiles");
  await page.getByLabel("Entity type").selectOption("Private Limited");
  await page.getByLabel("Branch").selectOption({ label: /NOI/ });
  await page.getByLabel("PAN").fill(PAN);
  await page.locator('input[name="gstins.0.gstin"]').fill(GSTIN);
  await page.locator('input[name="contacts.0.name"]').fill("Rakesh Sharma");
  await page.locator('input[name="contacts.0.mobile"]').fill("9811034567");
  await page.getByRole("button", { name: "Create client" }).click();

  // lands on the new client's case file, with a generated code
  await expect(page).toHaveURL(/\/clients\/[a-f0-9]{24}/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Playwright Textiles",
  );
  await expect(page.getByText(/PHMG-NOI-\d{4}/)).toBeVisible();
  await expect(page.getByText("Lead")).toBeVisible();

  // and is searchable by PAN
  await page.goto(`/clients?q=${PAN}`);
  await expect(
    page.getByRole("link", { name: /Playwright Textiles/ }),
  ).toBeVisible();
});

test("a bad GSTIN is refused with a readable reason", async ({ page }) => {
  await signIn(page);
  await page.goto("/clients/new");

  await page.getByLabel("Legal name").fill("Bad GSTIN Traders");
  await page.getByLabel("Entity type").selectOption("Partnership Firm");
  await page.getByLabel("Branch").selectOption({ label: /NOI/ });
  await page.locator('input[name="contacts.0.name"]').fill("Someone");
  // right shape, wrong check digit
  await page.locator('input[name="gstins.0.gstin"]').fill("09AABCS1429P1ZT");
  await page.getByRole("button", { name: "Create client" }).click();

  await expect(page.getByRole("alert")).toContainText("last character");
  await expect(page).toHaveURL(/\/clients\/new/);
});

test("the same PAN twice is blocked until it is confirmed", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/clients/new");

  await page.getByLabel("Legal name").fill("Playwright Textiles Duplicate");
  await page.getByLabel("Entity type").selectOption("Private Limited");
  await page.getByLabel("Branch").selectOption({ label: /NOI/ });
  await page.getByLabel("PAN").fill(PAN);
  await page.locator('input[name="contacts.0.name"]').fill("Someone Else");
  await page.getByRole("button", { name: "Create client" }).click();

  await expect(page.getByText(/is already on/)).toBeVisible();
  await expect(page).toHaveURL(/\/clients\/new/);
});

test("a portal password is hidden until revealed, and the reveal is logged", async ({
  page,
}) => {
  await signIn(page);

  const client = await Client.findOne({ pan: PAN }).lean();
  await page.goto(`/clients/${client._id}`);

  await page.getByRole("button", { name: "Add a login" }).click();
  await page.getByLabel("Portal").selectOption("GST");
  await page.getByLabel("Username").fill("playwright_gst_user");
  await page.getByLabel("Password", { exact: true }).fill("Secret-Pass-2026");
  await page.getByRole("button", { name: "Save" }).click();

  // the password is not on the page until Reveal is pressed
  await expect(page.getByText("playwright_gst_user")).toBeVisible();
  await expect(page.getByText("Secret-Pass-2026")).toBeHidden();

  await page.getByRole("button", { name: "Reveal" }).click();
  await expect(page.getByText("Secret-Pass-2026")).toBeVisible();

  // and the reveal is in the audit log
  const entry = await AuditLog.findOne({ action: "credential_reveal" })
    .sort({ seq: -1 })
    .lean();
  expect(entry).toBeTruthy();
  expect(entry.userName).toBe("Playwright Partner");

  await page.goto(`/clients/${client._id}?tab=activity`);
  await expect(
    page.getByText(/revealed a stored portal password/).first(),
  ).toBeVisible();
});

test("a note goes on the communication log", async ({ page }) => {
  await signIn(page);
  const client = await Client.findOne({ pan: PAN }).lean();

  await page.goto(`/clients/${client._id}?tab=notes`);
  await page.getByLabel("Kind").selectOption("Call");
  await page
    .getByLabel("What happened")
    .fill("Called about September GST data; promised by Friday.");
  await page.getByRole("button", { name: "Add entry" }).click();

  await expect(page.getByText(/promised by Friday/)).toBeVisible();
  await expect(page.getByText("Call").first()).toBeVisible();
});

test("the import preview refuses a bad file without saving anything", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/clients/import");

  const before = await Client.countDocuments({});

  await page.getByLabel("Your CSV file").setInputFiles({
    name: "clients.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Legal name,Entity type,Branch code,PAN,Contact 1 name\n" +
        "Good Traders LLP,LLP,NOI,AAAFZ1234C,Priya Singh\n" +
        "Bad Branch Co,LLP,XYZ,AAAFZ5678C,Someone\n",
    ),
  });
  await page.getByRole("button", { name: "Check the file" }).click();

  await expect(page.getByText("1", { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/Branch "XYZ" is not one of/)).toBeVisible();
  expect(await Client.countDocuments({})).toBe(before);

  // importing writes only the good row
  await page.getByRole("button", { name: /Import 1 client/ }).click();
  await expect(page.getByRole("status")).toContainText("1 client imported");

  const imported = await Client.findOne({ pan: "AAAFZ1234C" }).lean();
  expect(imported?.legalName).toBe("Good Traders LLP");
  await Client.deleteMany(
    { pan: { $in: ["AAAFZ1234C", "AAAFZ5678C"] } },
    { withDeleted: true },
  );
});

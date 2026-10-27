import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import { TOTP, Secret } from "otpauth";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import ClientGroup from "../../models/ClientGroup.js";
import { hashPassword, decryptField } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";

/**
 * One owner, several businesses (P2-11).
 *
 * The two businesses below have different PANs, which is why they are two
 * client records rather than one record with something underneath it. This
 * walks the way the firm actually reads them: the group list, the group, one
 * business, and back to the others from its case file.
 *
 * Skipped until the Atlas cluster is configured, like every other suite.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const EMAIL = "playwright-groups@phmgindia.test";
const PASSWORD = "test-password-not-real";
const GROUP = "Playwright Khandelwal Family";
const CODES = ["PW-GRP-A", "PW-GRP-B"];

test.beforeAll(async () => {
  await connectDB();
  await Client.deleteMany({ code: { $in: CODES } }, { withDeleted: true });
  await ClientGroup.deleteMany({ name: GROUP }, { withDeleted: true });
  await User.deleteOne({ email: EMAIL });

  // audited models refuse to write outside a transaction, fixtures included
  await systemAudit(async (session) => {
    const branch = await Branch.findOneAndUpdate(
      { code: "NOI" },
      { $setOnInsert: { name: "Noida (head office)", invoicePrefix: "NOI" } },
      { returnDocument: "after", upsert: true, session },
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

    const [group] = await ClientGroup.create(
      [{ name: GROUP, notes: "Two businesses, one family." }],
      { session },
    );

    await Client.create(
      [
        {
          code: CODES[0],
          legalName: "Khandelwal Textiles Private Limited",
          tradeName: "Khandelwal Textiles",
          entityType: "Private Limited",
          pan: "AAGCK4821L",
          branchId: branch._id,
          groupId: group._id,
          status: "Active",
        },
        {
          code: CODES[1],
          legalName: "Khandelwal Logistics LLP",
          entityType: "LLP",
          pan: "AAJFK9076D",
          branchId: branch._id,
          groupId: group._id,
          status: "Active",
        },
      ],
      { session },
    );
  });
});

test.afterAll(async () => {
  await Client.deleteMany({ code: { $in: CODES } }, { withDeleted: true });
  await ClientGroup.deleteMany({ name: GROUP }, { withDeleted: true });
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
  await expect(page).toHaveURL(/\/issues$/);
}

test("read a group, then one of its businesses, then its siblings", async ({
  page,
}) => {
  await signIn(page);

  // the group list finds it by the name of a business inside it
  await page.goto("/groups?q=Khandelwal");
  const row = page.getByRole("row", { name: new RegExp(GROUP) });
  await expect(row).toContainText("Khandelwal Textiles");
  await expect(row).toContainText("Khandelwal Logistics LLP");

  // the group itself
  await page.getByRole("link", { name: GROUP }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(GROUP);
  await expect(page.getByText("2 businesses")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Khandelwal Textiles" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Khandelwal Logistics LLP" }),
  ).toBeVisible();

  // all the group's work in one engagement list
  await page.getByRole("link", { name: "Open in the engagement list" }).click();
  await expect(page).toHaveURL(/\/engagements\?group=[a-f0-9]{24}/);

  // and from one business, the way back to the other
  await page.goto("/groups");
  await page.getByRole("link", { name: GROUP }).click();
  await page.getByRole("link", { name: "Khandelwal Textiles" }).click();
  await expect(page).toHaveURL(/\/clients\/[a-f0-9]{24}/);
  const band = page.getByText(`Also in ${GROUP}:`);
  await expect(band).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Khandelwal Logistics LLP/ }),
  ).toBeVisible();
  // the one you are looking at is not listed as its own sibling
  await expect(
    page.locator("p", { hasText: `Also in ${GROUP}:` }),
  ).not.toContainText("Khandelwal Textiles");
});

test("the group chip on a case file opens the group", async ({ page }) => {
  await signIn(page);

  const client = await Client.findOne({ code: CODES[1] }).select("_id").lean();
  await page.goto(`/clients/${client._id}`);
  await page.getByRole("link", { name: GROUP }).click();
  await expect(page).toHaveURL(/\/groups\/[a-f0-9]{24}/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(GROUP);
});

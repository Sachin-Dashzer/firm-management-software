import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import { TOTP, Secret } from "otpauth";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import Certificate from "../../models/Certificate.js";
import RuleConfirmation from "../../models/RuleConfirmation.js";
import Udin from "../../models/Udin.js";
import { hashPassword, decryptField } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";

/**
 * Drafting and signing a certificate, in a browser (P3-15).
 *
 * The flow worth a browser is the refusals, because they are the whole
 * point of the screen: the sign button is disabled with its reasons listed,
 * and the two that cannot be seen anywhere else are the wording no partner
 * has confirmed and a UDIN that belongs to somebody else. The wording rules
 * themselves are arithmetic and live in tests/certificates.test.js.
 *
 * Skipped until Atlas is configured, like every other suite.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";
/** The signer's own ICAI registration, which a UDIN carries in chars 3–8. */
const MEMBERSHIP = "512345";

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    partner: `pw-cert-partner-${tag}@phmgindia.test`,
    clientName: `Playwright Certificates ${tag} LLP`,
  };
}

/** A UDIN for this year, this member, and one for a different member. */
const year = String(new Date().getFullYear()).slice(2);
const mine = `${year}${MEMBERSHIP}ABCDEF1234`;
const someoneElses = `${year}999999ABCDEF1234`;

async function wipe(fx) {
  const client = await Client.findOne({ legalName: fx.clientName }, null, {
    withDeleted: true,
  });
  if (client) {
    await Certificate.deleteMany(
      { clientId: client._id },
      { withDeleted: true },
    );
    await Udin.deleteMany({ clientId: client._id }, { withDeleted: true });
    await Client.deleteOne({ _id: client._id }, { withDeleted: true });
  }
  await RuleConfirmation.deleteMany({ kind: "CERT-WORDING", key: "net-worth" });
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
          name: "Playwright Certificates Partner",
          email: fx.partner,
          role: "partner",
          branchIds: [branch._id],
          icai: { membershipNo: MEMBERSHIP, grade: "FCA", copHeld: true },
          passwordHash: await hashPassword(PASSWORD),
        },
      ],
      { session },
    );

    await Client.create(
      [
        {
          code: `PHMG-NOI-8${testInfo.project.name.length}00`,
          legalName: fx.clientName,
          entityType: "LLP",
          branchId: branch._id,
          status: "Active",
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

/** Write one of the open paragraphs, by the title it is shown under. */
async function write(page, title, text) {
  const card = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await card.getByRole("button", { name: /Write it|Rewrite/ }).click();
  await card.getByLabel(title, { exact: true }).fill(text);
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(title);
}

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

test("a certificate is not signed over unconfirmed wording, unheld evidence or somebody else's UDIN", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  await page.goto("/practice/certificates/new");
  await page
    .getByLabel("Client")
    .selectOption({ label: new RegExp(fx.clientName) });
  await page
    .getByLabel("What kind of certificate")
    .selectOption({ label: "Net worth certificate" });
  await page.getByLabel("Addressed to").fill("The Manager, Canara Bank");
  await page.getByRole("button", { name: "Start the draft" }).click();

  await expect(page).toHaveURL(/\/practice\/certificates\/[a-f0-9]{24}$/);

  // the draft knows what is missing, and the button is off with the list
  await expect(
    page.getByText("The wording has not been confirmed by a partner"),
  ).toBeVisible();
  const sign = page.getByRole("button", { name: "Sign and record the UDIN" });
  await expect(sign).toBeDisabled();
  await expect(
    page.getByText(/no partner has confirmed the wording/),
  ).toBeVisible();
  await expect(
    page.getByText(/items of evidence not on the file/),
  ).toBeVisible();

  // a partner reads the Guidance Note wording and says so
  await page.getByRole("button", { name: "I have read it — confirm" }).click();
  await expect(page.getByText(/Wording confirmed by/)).toBeVisible();

  // the three paragraphs that are this engagement's own facts, including
  // the two that arrive with a [placeholder] in them
  await write(
    page,
    "Addressed to",
    "The Manager, Canara Bank, Sector 18, Noida",
  );
  await write(
    page,
    "What this report is on",
    "the statement of net worth of the entity as at 31 March 2026, prepared by management from the books of account",
  );
  await write(
    page,
    "What it was measured against",
    "the audited balance sheet as at 31 March 2026 and the books of account for the period after it",
  );

  // every piece of evidence, said to be on the file
  const evidence = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("combobox") });
  for (let index = 0; index < (await evidence.count()); index += 1) {
    const item = evidence.nth(index);
    await item.getByRole("combobox").selectOption("held");
    await item.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toBeVisible();
  }
  await expect(page.getByText(/items of evidence not on the file/)).toHaveCount(
    0,
  );

  // a UDIN belonging to another member is refused by name
  await page.getByLabel("UDIN").fill(someoneElses);
  await page.getByRole("button", { name: "Sign and record the UDIN" }).click();
  await expect(page.getByText(new RegExp(`${MEMBERSHIP}`))).toBeVisible();

  await page.getByLabel("UDIN").fill(mine);
  await page.getByRole("button", { name: "Sign and record the UDIN" }).click();
  await expect(
    page.getByText(/Signed, and in the UDIN register/),
  ).toBeVisible();

  // and it is in the register of everything the firm has signed
  await page.goto("/practice/udin");
  await expect(page.getByText(mine)).toBeVisible();
  await expect(page.getByText(/Net worth certificate/)).toBeVisible();
});

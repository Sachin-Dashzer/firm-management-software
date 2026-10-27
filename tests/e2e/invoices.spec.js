import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import { TOTP, Secret } from "otpauth";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import Invoice from "../../models/Invoice.js";
import Counter from "../../models/Counter.js";
import { hashPassword, decryptField } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";

/**
 * Issuing an invoice end to end (spec section 7): the gate that stops a
 * branch with no GSTIN charging tax, the one-way door at issue, and the
 * series with no gaps.
 *
 * Skipped until Atlas is configured, like the other suites.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";
const UP_GSTIN = "09AABCS1429P1ZZ";

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    partner: `pw-bill-partner-${tag}@phmgindia.test`,
    branchCode: tag.startsWith("l") ? "PWL" : "PWP",
    clientName: `Playwright Billing ${tag} Private Limited`,
  };
}

async function wipe(fx) {
  const branch = await Branch.findOne({ code: fx.branchCode }, null, {
    withDeleted: true,
  });
  if (branch) {
    await Invoice.deleteMany({ branchId: branch._id }, { withDeleted: true });
    await Branch.deleteOne({ _id: branch._id }, { withDeleted: true });
  }
  await Client.deleteMany({ legalName: fx.clientName }, { withDeleted: true });
  await User.deleteMany({ email: fx.partner });
  await Counter.deleteMany({ _id: new RegExp(`^${fx.branchCode}/`) });
}

test.beforeAll(async ({}, testInfo) => {
  const fx = names(testInfo.project.name);
  await connectDB();
  await wipe(fx);

  await systemAudit(async (session) => {
    const [branch] = await Branch.create(
      [
        {
          code: fx.branchCode,
          name: `Playwright ${fx.branchCode}`,
          invoicePrefix: fx.branchCode,
          // deliberately no GSTIN: the first test is that this blocks issuing
          gstin: "",
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
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

    await Client.create(
      [
        {
          code: `PHMG-${fx.branchCode}-0001`,
          legalName: fx.clientName,
          entityType: "Private Limited",
          branchId: branch._id,
          status: "Active",
          creditDays: 15,
          gstins: [{ gstin: "03AABCS1429P1Z2", state: "Punjab" }],
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

test("a branch with no GSTIN can draft but not issue", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  await page.goto("/invoices/new");
  await page
    .getByLabel("Client")
    .selectOption({ label: new RegExp("Playwright Billing") });
  await page.getByRole("button", { name: /Start an empty draft/ }).click();
  await expect(page).toHaveURL(/\/invoices\/[a-f0-9]{24}/);

  // the draft exists and says exactly why it cannot go out
  await expect(page.getByText("This cannot be issued yet")).toBeVisible();
  await expect(page.getByText(/has no GSTIN/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Issue this invoice" }),
  ).toBeDisabled();

  // and no number has been taken, so nothing has gapped
  const draft = await Invoice.findOne({ status: "Draft" }).sort({
    createdAt: -1,
  });
  expect(draft.number).toBeNull();
});

test("once registered, an invoice issues with tax and a gapless number", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  // give the branch its registration, as the owner would
  await page.goto("/settings/branches");
  const card = page
    .locator("section")
    .filter({ hasText: fx.branchCode })
    .first();
  await card.getByRole("button", { name: "Edit" }).click();
  await card.getByLabel("GSTIN").fill(UP_GSTIN);
  await card.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Uttar Pradesh/)).toBeVisible();

  // draft an invoice with one line
  await page.goto("/invoices/new");
  await page
    .getByLabel("Client")
    .selectOption({ label: new RegExp("Playwright Billing") });
  await page.getByRole("button", { name: /Start an empty draft/ }).click();
  const url = page.url();

  await page.getByRole("button", { name: "Add a line" }).click();
  await page.getByLabel("Description 1").fill("Tax audit for FY 2025-26");
  await page.getByLabel("SAC 1").fill("998221");
  await page.getByLabel("Amount 1").fill("100000");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();

  // the client is in Punjab and we supply from UP, so this is IGST
  await expect(page.getByText("IGST (inter-state)")).toBeVisible();

  await page.getByRole("button", { name: "Issue this invoice" }).click();
  await expect(page.getByText(/Issued as/)).toBeVisible();

  const issued = await Invoice.findOne({ status: "Sent" }).sort({
    createdAt: -1,
  });
  expect(issued.number).toMatch(
    new RegExp(`^${fx.branchCode}/\\d{2}-\\d{2}/0001$`),
  );
  expect(issued.igstPaise).toBe(1800000); // 18% of ₹1,00,000
  expect(issued.cgstPaise).toBe(0);
  expect(issued.totalPaise).toBe(11800000);
  expect(issued.tdsExpectedPaise).toBe(1000000); // 10% of the fees

  // an issued invoice cannot be edited into something else
  await page.goto(url);
  await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Raise a credit note" }),
  ).toBeVisible();

  // --- a second invoice takes the next number, with no gap ---------------
  await page.goto("/invoices/new");
  await page
    .getByLabel("Client")
    .selectOption({ label: new RegExp("Playwright Billing") });
  await page.getByRole("button", { name: /Start an empty draft/ }).click();
  await page.getByRole("button", { name: "Add a line" }).click();
  await page.getByLabel("Description 1").fill("Second job");
  await page.getByLabel("SAC 1").fill("998221");
  await page.getByLabel("Amount 1").fill("5000");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("button", { name: "Issue this invoice" }).click();
  await expect(page.getByText(/Issued as/)).toBeVisible();

  const all = await Invoice.find({
    series: new RegExp(`^${fx.branchCode}/`),
    seq: { $ne: null },
  }).sort({ seq: 1 });
  expect(all.map((i) => i.seq)).toEqual([1, 2]);

  // --- a credit note cancels it rather than editing it -------------------
  await page.goto(`/invoices/${all[1]._id}`);
  await page.getByRole("button", { name: "Raise a credit note" }).click();
  await page
    .getByLabel(/Why is a credit note being raised/)
    .fill("Billed to the wrong entity");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/Credit note .* raised/)).toBeVisible();

  const cancelled = await Invoice.findById(all[1]._id);
  expect(cancelled.status).toBe("Cancelled");
  // the original keeps its number and its figures; nothing was rewritten
  expect(cancelled.totalPaise).toBe(590000);
  expect(cancelled.number).toBe(all[1].number);
});

test("a payment settles an invoice, TDS and all", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  const branch = await Branch.findOne({ code: fx.branchCode });
  const client = await Client.findOne({ legalName: fx.clientName });

  // an issued invoice for ₹1,18,000, as the earlier test produces
  const invoice = await systemAudit(async (session) => {
    const [doc] = await Invoice.create(
      [
        {
          number: `${fx.branchCode}/26-27/9001`,
          series: `${fx.branchCode}/26-27`,
          seq: 9001,
          type: "Tax invoice",
          status: "Sent",
          date: new Date("2026-09-01T00:00:00+05:30"),
          dueDate: new Date("2026-09-16T00:00:00+05:30"),
          clientId: client._id,
          branchId: branch._id,
          lines: [
            {
              description: "Tax audit",
              sac: "998221",
              amountPaise: 10000000,
              gstRate: 18,
              netPaise: 10000000,
              igstPaise: 1800000,
              totalPaise: 11800000,
            },
          ],
          subtotalPaise: 10000000,
          igstPaise: 1800000,
          totalPaise: 11800000,
          tdsExpectedPaise: 1000000,
          issuedAt: new Date(),
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
    );
    return doc;
  });

  await signIn(page, fx.partner);
  await page.goto(`/clients/${client._id}?tab=invoices`);

  await expect(page.getByText("Owed to us")).toBeVisible();
  await page.getByRole("button", { name: "Record a payment" }).click();

  // the client pays the invoice less the 10% TDS it withheld
  await page.getByLabel("Amount received").fill("108000");
  await page.getByLabel("TDS deducted").fill("10000");
  await page.getByLabel("Reference").fill("NEFT-55512");
  await page
    .getByRole("button", { name: /Spread it across the oldest invoices/ })
    .click();

  // the suggestion fills both columns against the one open invoice
  await expect(page.getByLabel(`Amount against ${invoice.number}`)).toHaveValue(
    "108000",
  );
  await expect(page.getByLabel(`TDS against ${invoice.number}`)).toHaveValue(
    "10000",
  );

  await page.getByRole("button", { name: "Record the payment" }).click();
  await expect(page.getByText("Payment recorded.")).toBeVisible();

  // cash plus TDS covers the bill, so it is settled, not partly paid
  const settled = await Invoice.findById(invoice._id);
  expect(settled.paidPaise).toBe(10800000);
  expect(settled.tdsCreditedPaise).toBe(1000000);
  expect(settled.status).toBe("Paid");

  // and the ledger closes at nothing
  await page.reload();
  await expect(page.getByText("TDS credited")).toBeVisible();

  const Payment = (await import("../../models/Payment.js")).default;
  await Payment.deleteMany({ clientId: client._id }, { withDeleted: true });
  await Invoice.deleteOne({ _id: invoice._id }, { withDeleted: true });
});

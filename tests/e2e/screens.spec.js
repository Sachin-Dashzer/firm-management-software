import { test, expect } from "@playwright/test";
import { signIn } from "./signin.js";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import Invoice from "../../models/Invoice.js";
import Payment from "../../models/Payment.js";
import ClientCredential from "../../models/ClientCredential.js";
import { hashPassword, encryptField } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";

/**
 * The nine screens the menu promised and P3-22b built.
 *
 * Three things here can only be tested in a browser. **The old addresses
 * redirect**: `/today`, `/invoices` and `/invoices/receivables` were moved,
 * ten places in the app still link to the last of them, and a redirect that
 * dropped its query string would send somebody to the wrong tab silently.
 * **The TDS tick works end to end** — `setTds26AS` was written at Step 8b
 * and had no screen until today, so this is the first time it has ever been
 * called. And **the logins vault reveals nothing**: the one thing that
 * would make a firm-wide list of credentials a bad idea.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";
/** The portal password the vault must never put on screen. */
const PORTAL_PASSWORD = "not-a-real-portal-password-7611";

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    partner: `pw-screens-partner-${tag}@phmgindia.test`,
    branchCode: tag.startsWith("l") ? "SCL" : "SCP",
    clientName: `Playwright Screens ${tag} Private Limited`,
  };
}

async function wipe(fx) {
  const client = await Client.findOne({ legalName: fx.clientName }, null, {
    withDeleted: true,
  });
  if (client) {
    await ClientCredential.deleteMany(
      { clientId: client._id },
      { withDeleted: true },
    );
    await Payment.deleteMany({ clientId: client._id }, { withDeleted: true });
    await Invoice.deleteMany({ clientId: client._id }, { withDeleted: true });
    await Client.deleteOne({ _id: client._id }, { withDeleted: true });
  }
  const branch = await Branch.findOne({ code: fx.branchCode }, null, {
    withDeleted: true,
  });
  if (branch)
    await Branch.deleteOne({ _id: branch._id }, { withDeleted: true });
  await User.deleteMany({ email: fx.partner });
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
          // Punjab, not UP: the invoices spec asserts on the one UP branch it
          // makes itself, and two of them is a strict-mode failure in a
          // spec that has nothing to do with this one
          gstin: "03AABCS1429P1Z2",
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );

    await User.create(
      [
        {
          name: "Playwright Screens Partner",
          email: fx.partner,
          role: "partner",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
      ],
      { session, ordered: true },
    );

    const [client] = await Client.create(
      [
        {
          code: `PHMG-${fx.branchCode}-0001`,
          legalName: fx.clientName,
          entityType: "Private Limited",
          branchId: branch._id,
          status: "Active",
          creditDays: 15,
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );

    /** An issued invoice, paid short because the client deducted TDS. */
    const [invoice] = await Invoice.create(
      [
        {
          number: `${fx.branchCode}/26-27/0001`,
          series: `${fx.branchCode}/26-27`,
          seq: 1,
          status: "Partially paid",
          clientId: client._id,
          branchId: branch._id,
          date: new Date("2026-10-05T00:00:00Z"),
          dueDate: new Date("2026-10-20T00:00:00Z"),
          subtotalPaise: 10_000_00,
          totalPaise: 11_800_00,
          paidPaise: 10_800_00,
          tdsCreditedPaise: 1_000_00,
          issuedAt: new Date("2026-10-05T00:00:00Z"),
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );

    await Payment.create(
      [
        {
          clientId: client._id,
          branchId: branch._id,
          date: new Date("2026-10-18T00:00:00Z"),
          amountPaise: 10_800_00,
          tdsPaise: 1_000_00,
          mode: "Bank transfer",
          reference: "PW-TDS-0001",
          allocations: [
            {
              invoiceId: invoice._id,
              amountPaise: 10_800_00,
              tdsPaise: 1_000_00,
            },
          ],
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );

    await ClientCredential.create(
      [
        {
          clientId: client._id,
          portal: "TRACES",
          label: "Company deductor",
          username: "PWTRACES0001",
          passwordEncrypted: encryptField(PORTAL_PASSWORD),
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );
  });
});

test.afterAll(async ({}, testInfo) => {
  await wipe(names(testInfo.project.name));
  /** The connection is left open on purpose — see the other specs. */
});

test("the day splits in two: my tasks, and the firm dashboard", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  // the old address still works
  await page.goto("/today");
  await expect(page).toHaveURL(/\/my-day$/);
  await expect(
    page.getByRole("heading", { name: "My tasks", level: 1 }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Firm dashboard" }).first().click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "Firm dashboard", level: 1 }),
  ).toBeVisible();
  // a partner has a board, so the employee fallback must not be shown
  await expect(page.getByText("Your own work is your dashboard")).toHaveCount(
    0,
  );
});

test("billing is four tabs, and the two old addresses land on the right one", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  await page.goto("/invoices");
  await expect(page).toHaveURL(/\/billing\?tab=invoices/);
  await expect(
    page.getByRole("link", { name: `${fx.branchCode}/26-27/0001` }),
  ).toBeVisible();

  // the filter a bookmark might carry survives the move
  await page.goto("/invoices?status=Draft");
  await expect(page).toHaveURL(/status=Draft/);
  await expect(page).toHaveURL(/tab=invoices/);

  // "where the money is" became two of the four tabs
  await page.goto("/invoices/receivables?tab=unbilled");
  await expect(page).toHaveURL(/\/billing\?tab=ready/);
  await page.goto("/invoices/receivables");
  await expect(page).toHaveURL(/\/billing\?tab=collections/);

  const tabs = page.getByRole("navigation", { name: "Billing" });
  for (const label of [
    "Ready to bill",
    "Invoices",
    "Collections",
    "TDS credit",
  ]) {
    await expect(tabs.getByRole("link", { name: label })).toBeVisible();
  }
  await expect(tabs.getByRole("link", { name: "Collections" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("TDS credit can be ticked off against 26AS, and unticked", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  await page.goto("/billing?tab=tds");
  // grouped by the quarter it is matched in, not the calendar quarter
  await expect(page.getByText("Q3 2026-27")).toBeVisible();
  await expect(page.getByText("PW-TDS-0001")).toBeVisible();
  await expect(
    page.getByRole("link", { name: `${fx.branchCode}/26-27/0001` }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Seen in 26AS" }).first().click();
  await expect(page.getByText("Marked as seen in 26AS.")).toBeVisible();

  const payment = await Payment.findOne({ reference: "PW-TDS-0001" });
  expect(payment.tdsSeenIn26AS).toBe(true);

  // it leaves the list of what is still to match, and is reversible
  await expect(page.getByText("PW-TDS-0001")).toHaveCount(0);
  await page.getByRole("link", { name: "Show what is matched" }).click();
  await expect(page.getByText("PW-TDS-0001")).toBeVisible();
  await page.getByRole("button", { name: "Not in 26AS" }).first().click();
  await expect(page.getByText("Unticked.")).toBeVisible();
});

/**
 * The desk used to be four lists that linked to where the work was done
 * (D74). Since P3-31 it performs those decisions itself (D92), so this
 * test now checks the sections and the honest note about the two things it
 * still does not do; the actions themselves are driven in `desk.spec.js`.
 */
test("the accounts desk says what is waiting, in the order the work runs", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  await page.goto("/billing/desk");
  await expect(
    page.getByRole("heading", { name: "Accounts desk", level: 1 }),
  ).toBeVisible();
  for (const panel of [
    "Money to apply",
    "Promises that have come round",
    "Drafts not issued",
    "TDS to find in Form 26AS",
  ]) {
    await expect(
      page.getByRole("heading", { name: new RegExp(panel) }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("heading", { name: /still does not do/ }),
  ).toBeVisible();
});

test("the logins vault lists what is held and reveals nothing", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  await page.goto("/registers/vault");
  await expect(page.getByText("PWTRACES0001")).toBeVisible();
  await expect(page.getByText("Company deductor")).toBeVisible();

  // the password is nowhere on the page, and there is no way to ask for it
  expect(await page.content()).not.toContain(PORTAL_PASSWORD);
  await expect(page.getByRole("button", { name: /Reveal/ })).toHaveCount(0);

  // the portal filter narrows to what is held
  await page.getByRole("link", { name: /^TRACES/ }).click();
  await expect(page).toHaveURL(/portal=TRACES/);
  await expect(page.getByText("PWTRACES0001")).toBeVisible();
});

test("the audit studio and the report board are two reads of one list", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  await page.goto("/practice/audit");
  await expect(
    page.getByRole("heading", { name: "Audit studio", level: 1 }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Where the reports stand" }).click();
  await expect(page).toHaveURL(/\/practice\/auditors-report$/);
  await expect(
    page.getByRole("heading", { name: /Auditor’s report/, level: 1 }),
  ).toBeVisible();
});

test("the GST board opens on a month and can be moved to another", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  await page.goto("/gst-cycle");
  await expect(
    page.getByRole("heading", { name: "Monthly GST cycle", level: 1 }),
  ).toBeVisible();

  const months = page.getByLabel("Month");
  await expect(months).toBeVisible();
  const value = await months.inputValue();
  expect(value).toMatch(/^\d{4}-\d{2}$/);

  await months.selectOption({ index: 3 });
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page).toHaveURL(/period=\d{4}-\d{2}/);
});

test("leave and cover is a firm-wide board", async ({ page }, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  await page.goto("/team/leave");
  await expect(
    page.getByRole("heading", { name: "Leave and cover", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /Away now/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Coming up/ })).toBeVisible();
});

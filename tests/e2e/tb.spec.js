import { test, expect } from "@playwright/test";
import { signIn } from "./signin.js";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import ServiceTemplate from "../../models/ServiceTemplate.js";
import Engagement from "../../models/Engagement.js";
import AuditFile from "../../models/AuditFile.js";
import TrialBalance from "../../models/TrialBalance.js";
import RuleConfirmation from "../../models/RuleConfirmation.js";
import { hashPassword } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";
import { buildEngagement } from "../../lib/engagements/create.js";
import { periodFor } from "../../lib/engagements/period.js";
import { buildAuditAreas } from "../../lib/audit-studio/standards.js";
import { CONFIRM_KEY, CONFIRM_KIND } from "../../lib/practice/scheduleIII.js";

/**
 * A trial balance to the financial statements (P3-32).
 *
 * One long test, because the five steps are one piece of work and each
 * depends on the one before — a spec that set up step four's state
 * directly would be testing a state the application cannot actually reach.
 *
 * What it proves: the import reads what Excel pastes and reports what it
 * refused; last year's mapping is remembered; an unmapped ledger blocks
 * the statements; a suggestion is not a mapping until somebody confirms
 * it; only an entry passed in the books moves a figure; an unadjusted one
 * reaches the audit file; and the statements cannot be locked until the two
 * sides agree.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    partner: `pw-tb-partner-${tag}@phmgindia.test`,
    branchCode: tag.startsWith("l") ? "TBL" : "TBP",
    clientName: `Playwright TB ${tag} Private Limited`,
    code: `PWTB${tag.slice(0, 4).toUpperCase()}`,
  };
}

/**
 * A complete little trial balance, tab-separated the way Excel pastes it,
 * with a total row and a nil balance that both have to be left out and a
 * ledger with a comma in its name that must not be split.
 */
const PASTE = [
  "Ledger\tGroup\tClosing",
  "Share Capital\tCapital Account\t10,00,000 Cr",
  "Reserves\tReserves and Surplus\t2,00,000 Cr",
  "Bank OD\tBank OD A/c\t3,00,000 Cr",
  "Sundry Creditors, Delhi\tSundry Creditors\t5,00,000 Cr",
  "Plant and Machinery\tFixed Assets\t12,00,000",
  "Closing Stock\tStock-in-Hand\t4,00,000",
  "Sundry Debtors\tSundry Debtors\t6,00,000",
  "HDFC Bank\tBank Accounts\t1,00,000",
  "Sales\tSales Account\t40,00,000 Cr",
  "Purchases\tPurchase Account\t25,00,000",
  "Salaries\tIndirect Expenses\t8,00,000",
  "Bank Interest\tIndirect Expenses\t1,00,000",
  "Depreciation\tIndirect Expenses\t3,00,000",
  /* Two the group names cannot place: they are what blocks step 5 and
     what the per-row dropdown is for. They balance each other, so the
     statements still come out even once they are mapped by hand. */
  "Preliminary Expenses\tMisc. Expenses (Asset)\t50,000",
  "Capital Reserve\tCapital Reserve\t50,000 Cr",
  "Suspense\tSuspense A/c\t0",
  "Grand Total\t\t0",
].join("\n");

const ids = { engagement: "", client: "", tb: "" };

async function wipe(fx) {
  const client = await Client.findOne({ legalName: fx.clientName }, null, {
    withDeleted: true,
  });
  if (client) {
    await TrialBalance.deleteMany(
      { clientId: client._id },
      { withDeleted: true },
    );
    const engagements = await Engagement.find({ clientId: client._id }, null, {
      withDeleted: true,
    })
      .select("_id")
      .lean();
    await AuditFile.deleteMany(
      { engagementId: { $in: engagements.map((e) => e._id) } },
      { withDeleted: true },
    );
    await Engagement.deleteMany(
      { clientId: client._id },
      { withDeleted: true },
    );
    await Client.deleteOne({ _id: client._id }, { withDeleted: true });
  }
  await ServiceTemplate.deleteMany({ code: fx.code }, { withDeleted: true });
  await User.deleteMany({ email: fx.partner });
  const branch = await Branch.findOne({ code: fx.branchCode }, null, {
    withDeleted: true,
  });
  if (branch)
    await Branch.deleteOne({ _id: branch._id }, { withDeleted: true });
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
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );

    const [partner] = await User.create(
      [
        {
          name: "Playwright TB Partner",
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
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );
    ids.client = String(client._id);

    const [service] = await ServiceTemplate.create(
      [
        {
          name: `Playwright TB audit ${testInfo.project.name}`,
          code: fx.code,
          category: "Audit and Assurance",
          level: "L3",
          minExecRole: "ca",
          minReviewRole: "partner",
          recurrence: "one-time",
          checklist: [],
          steps: [{ name: "Issue the report" }],
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );

    const [engagement] = await Engagement.create(
      [
        {
          ...buildEngagement({
            template: service.toObject(),
            client,
            period: periodFor("one-time"),
            assigneeId: partner._id,
          }),
          code: `PWTB-${fx.code}`,
          status: "In progress",
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );
    ids.engagement = String(engagement._id);

    await AuditFile.create(
      [
        {
          engagementId: engagement._id,
          clientId: client._id,
          branchId: branch._id,
          areas: buildAuditAreas(),
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );

    /**
     * Last year's audit, with last year's statements hanging off it.
     *
     * One trial balance per engagement, so the memory has to come from the
     * *previous* engagement for the same client — which is how it works
     * in the firm, and the thing the mapping memory is actually tested on.
     */
    const [prior] = await Engagement.create(
      [
        {
          ...buildEngagement({
            template: service.toObject(),
            client,
            period: periodFor("one-time"),
            assigneeId: partner._id,
          }),
          period: "FY2024-25",
          periodLabel: "FY 2024-25",
          code: `PWTB-PRIOR-${fx.code}`,
          status: "Completed",
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );

    /**
     * Only "Salaries" is remembered — everything else has to come from the
     * client's own group names or from a person on this set, which is what
     * the rest of the test is about.
     */
    await TrialBalance.create(
      [
        {
          engagementId: prior._id,
          clientId: client._id,
          branchId: branch._id,
          fyLabel: "2024-25",
          lines: [
            {
              ledger: "Salaries",
              group: "Indirect Expenses",
              closingPaise: 70_000_000,
              headKey: "employee-benefits",
              status: "confirmed",
              mappedByName: "Last year's team",
            },
          ],
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

/* The export reads what the first test built, so they run in order. */
test.describe.configure({ mode: "serial" });

test("a trial balance becomes a balance sheet, in five steps", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  await page.goto("/practice/tb");
  await expect(
    page.getByRole("heading", { name: "Financial statements" }),
  ).toBeVisible();

  /* Rule 8: the head list says it is unconfirmed until a partner reads it. */
  const confirmed = await RuleConfirmation.findOne({
    kind: CONFIRM_KIND,
    key: CONFIRM_KEY,
  }).lean();
  if (!confirmed?.confirmedAt) {
    await expect(
      page.getByText(/No partner has confirmed the Schedule III head list/),
    ).toBeVisible();
  }

  // --- start -------------------------------------------------------------
  await page
    .getByLabel("Where the trial balance comes from")
    .fill("Tally, exported by the client");
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(/\/practice\/tb\/[a-f0-9]{24}$/);

  const set = await TrialBalance.findOne({
    engagementId: ids.engagement,
    fyLabel: { $ne: "2024-25" },
  }).lean();
  ids.tb = String(set._id);

  // --- 1 · import --------------------------------------------------------
  await page.getByLabel("Paste the trial balance").fill(PASTE);
  await page.getByRole("button", { name: "Import" }).click();

  await expect(page.getByText(/15 ledgers read/)).toBeVisible();
  /* The memory: Salaries came across from last year. */
  await expect(page.getByText(/1 mapped from last year/)).toBeVisible();
  /* And the rows it would not read are named, not dropped quietly. */
  await expect(page.getByText(/rows were not read/)).toBeVisible();
  await expect(page.getByText(/is a total row/)).toBeVisible();
  await expect(page.getByText(/has a nil balance/)).toBeVisible();

  const imported = await TrialBalance.findById(ids.tb).lean();
  expect(imported.lines).toHaveLength(15);
  /* A comma in a ledger name survives the paste. */
  expect(imported.lines.map((line) => line.ledger)).toContain(
    "Sundry Creditors, Delhi",
  );
  /* Credits are negative, debits positive, as the books have it. */
  const line = (name) => imported.lines.find((row) => row.ledger === name);
  expect(line("Share Capital").closingPaise).toBe(-100_000_000);
  expect(line("Plant and Machinery").closingPaise).toBe(120_000_000);
  expect(line("Salaries").status).toBe("remembered");

  // --- 5 before 2: the statements are refused while anything is unmapped --
  await page.goto(`/practice/tb/${ids.tb}?step=5`);
  await expect(page.getByText(/still unmapped/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Lock these statements" }),
  ).toHaveCount(0);

  // --- 2 · map -----------------------------------------------------------
  await page.goto(`/practice/tb/${ids.tb}?step=2`);
  await expect(
    page.getByRole("heading", { name: /Map the ledgers/ }),
  ).toBeVisible();

  await expect(page.getByText("All 15")).toBeVisible();

  /* The two the group names could not place, mapped by hand. */
  await page
    .getByLabel("Head for Preliminary Expenses")
    .selectOption("other-current-assets");
  await page.getByLabel("Head for Capital Reserve").selectOption("reserves");

  await expect
    .poll(async () => {
      const row = await TrialBalance.findById(ids.tb).lean();
      return row.lines.filter((line) => !line.headKey).length;
    })
    .toBe(0);

  await page.getByRole("button", { name: /Confirm all/ }).click();
  await expect(page.getByText(/Your name is on each of them/)).toBeVisible();

  const mapped = await TrialBalance.findById(ids.tb).lean();
  expect(mapped.lines.every((row) => row.status === "confirmed")).toBe(true);
  expect(mapped.lines.every((row) => row.headKey)).toBe(true);
  expect(
    mapped.lines.find((row) => row.ledger === "Salaries").mappedByName,
  ).toBe("Playwright TB Partner");

  // --- 3 · adjustments ---------------------------------------------------
  await page.goto(`/practice/tb/${ids.tb}?step=3`);

  /* One entry passed in the books, which must move the figures. */
  await page.getByRole("button", { name: "Add an entry" }).click();
  await page
    .getByLabel("What the entry is")
    .fill("Gratuity provision per the actuarial report");
  await page.getByLabel("Amount (₹)").fill("31000");
  await page.getByLabel("State").selectOption("Passed in books");
  await page.getByLabel("Debit").selectOption("employee-benefits");
  await page.getByLabel("Credit").selectOption("short-provisions");
  await page.getByRole("button", { name: "Add to the journal" }).click();
  await expect(page.getByText("On the journal.")).toBeVisible();

  /* And one the client would not pass, which must not. */
  await page.getByRole("button", { name: "Add an entry" }).click();
  await page
    .getByLabel("What the entry is")
    .fill("Prepaid insurance not carried forward — client declined");
  await page.getByLabel("Amount (₹)").fill("6800");
  await page.getByLabel("State").selectOption("Unadjusted");
  await page.getByRole("button", { name: "Add to the journal" }).click();
  await expect(page.getByText("On the journal.")).toBeVisible();

  /* The unadjusted one goes to the audit file's misstatement summary. */
  await page
    .getByRole("button", { name: /Send 1 unadjusted to the audit file/ })
    .click();
  await expect(
    page.getByText(/sent to the misstatement summary/),
  ).toBeVisible();

  const file = await AuditFile.findOne({
    engagementId: ids.engagement,
  }).lean();
  expect(file.exceptions).toHaveLength(1);
  expect(file.exceptions[0].what).toMatch(/Unadjusted: Prepaid insurance/);
  expect(file.exceptions[0].amountPaise).toBe(680_000);

  // --- 4 · notes ---------------------------------------------------------
  await page.goto(`/practice/tb/${ids.tb}?step=4`);
  const needed = page.locator("ol");
  await expect(page.getByText("Notes this company needs")).toBeVisible();
  /* Nine standard notes before any question is answered. */
  await expect(needed.getByRole("listitem")).toHaveCount(9);

  const msme = page
    .getByRole("group", { name: /micro or small enterprises/ })
    .getByRole("button", { name: "Yes" });
  await msme.click();
  await expect(msme).toHaveAttribute("aria-pressed", "true");

  await expect
    .poll(async () => {
      const row = await TrialBalance.findById(ids.tb).lean();
      return row.noteAnswers?.msme;
    })
    .toBe(true);
  /* The note it adds is now on the list of notes this company needs —
     scoped to that list, because the question above says the same words. */
  await expect(needed.getByRole("listitem")).toHaveCount(10);
  await expect(needed.getByText(/MSME and others separately/)).toBeVisible();

  // --- 5 · the statements ------------------------------------------------
  await page.goto(`/practice/tb/${ids.tb}?step=5`);
  await expect(page.getByText("Balanced to the rupee.")).toBeVisible();

  /* 40 lakh of revenue, 37 lakh of expenses, less the ₹31,000 gratuity
     the client passed: ₹2,69,000. */
  await expect(page.getByText("₹2,69,000").first()).toBeVisible();
  /* The provision raised by that entry is on the balance sheet. */
  await expect(page.getByText("Short-term provisions")).toBeVisible();

  await page.getByRole("button", { name: "Lock these statements" }).click();
  await expect(page.getByText(/The figures are the firm's now/)).toBeVisible();

  const locked = await TrialBalance.findById(ids.tb).lean();
  expect(locked.locked).toBe(true);
  expect(locked.lockedByName).toBe("Playwright TB Partner");

  // --- a locked set does not re-import -----------------------------------
  await page.goto(`/practice/tb/${ids.tb}?step=1`);
  await expect(page.getByLabel(/Paste a new trial balance/)).toHaveCount(0);
  await expect(
    page.getByText(/locked, so the trial balance cannot be/),
  ).toBeVisible();
});

test("the export carries the mapping and the journal, not just the totals", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  /* The set the test above built and locked. The two are one piece of
     work, so the file runs in order. */
  expect(ids.tb).toBeTruthy();

  const response = await page.request.get(`/practice/tb/${ids.tb}/export`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("spreadsheetml");

  const body = await response.body();
  /* A real workbook, not an error page. */
  expect(body.length).toBeGreaterThan(5_000);
  expect(body.subarray(0, 2).toString()).toBe("PK");
});

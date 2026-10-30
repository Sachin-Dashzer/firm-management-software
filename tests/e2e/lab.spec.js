import { test, expect } from "@playwright/test";
import { signIn } from "./signin.js";
import { alertBox } from "./alerts.js";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import { hashPassword } from "../../lib/crypto.js";
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
      { session, ordered: true },
    );
  });
});

test.afterAll(async ({}, testInfo) => {
  await wipe(names(testInfo.project.name));
  /**
   * The connection is deliberately left open. Playwright runs several spec
   * files in one worker, one after another, and `connectDB` caches the
   * connection per process — so a spec that closed it took the next spec in
   * that worker down with it. The worker exiting closes it.
   */
});

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
  // the heading, not the sentence above it that also names the step
  await expect(
    page.getByRole("heading", { name: "Which column is which" }),
  ).toBeVisible();

  // nothing is checked until somebody maps a column
  await page.getByRole("button", { name: "Check it" }).click();
  await expect(alertBox(page)).toContainText(/Say which column is which first/);

  /**
   * By name, not by label. The mapping row has grown a select per field, and
   * `getByLabel("Amount")` matched four of them — Amount, Debit, Credit and
   * Reference all carry the phrase in their own label text.
   */
  await page.locator('select[name="map.date"]').selectOption({ label: "Date" });
  await page
    .locator('select[name="map.amount"]')
    .selectOption({ label: "Amount" });
  await page
    .locator('select[name="map.reference"]')
    .selectOption({ label: "Voucher" });
  await page.getByLabel("Period from").fill("2026-04-01");
  await page.getByLabel("Period to").fill("2026-04-30");
  await page.getByRole("button", { name: "Check it" }).click();

  /**
   * Scoped to the findings list. Every finding's wording also appears in the
   * summary that can be posted to a job, so an unscoped `getByText` matches
   * twice and fails on strict mode — the finding was on the screen both
   * times.
   */
  const findings = page.getByRole("listitem");
  await expect(
    findings.filter({ hasText: /1 reference appears more than once/ }),
  ).toBeVisible();
  // a finding's own line is a nested list item, so this matches twice
  await expect(
    findings.filter({ hasText: /INV-002 — rows 3, 4/ }).first(),
  ).toBeVisible();
  await expect(
    findings.filter({ hasText: /1 number missing from the series/ }),
  ).toBeVisible();
  await expect(
    findings.filter({ hasText: /1 negative amount/ }),
  ).toBeVisible();

  // and the summary is the thing that can be kept, not the file
  await expect(
    page.getByText(/The file itself is not kept/).first(),
  ).toBeVisible();
});

import { test, expect } from "@playwright/test";
import { signIn } from "./signin.js";
import ExcelJS from "exceljs";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import FirmSettings from "../../models/FirmSettings.js";
import { hashPassword } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";

/**
 * The firm's own record (P2-6).
 *
 * The test that matters is the last one: the firm's name was hardcoded in
 * fifteen files, and a settings screen that does not actually reach the
 * invoice would be worse than no screen at all.
 *
 * Skipped until Atlas is configured, like the other suites.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    partner: `pw-icai-partner-${tag}@phmgindia.test`,
    ca: `pw-icai-ca-${tag}@phmgindia.test`,
  };
}

/** What the firm document said before this suite touched it. */
let before = null;

test.beforeAll(async ({}, testInfo) => {
  const fx = names(testInfo.project.name);
  await connectDB();
  await User.deleteMany({ email: { $in: [fx.partner, fx.ca] } });

  before = await FirmSettings.findOne({ key: "firm" }).lean();

  await systemAudit(async (session) => {
    const branch = await Branch.findOneAndUpdate(
      { code: "NOI" },
      { $setOnInsert: { name: "Noida (head office)", invoicePrefix: "NOI" } },
      { new: true, upsert: true, session },
    );

    await User.create(
      [
        {
          name: "Playwright ICAI Partner",
          email: fx.partner,
          role: "partner",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
        {
          name: "Playwright ICAI CA",
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
  const fx = names(testInfo.project.name);
  await User.deleteMany({ email: { $in: [fx.partner, fx.ca] } });

  // put the firm's record back exactly as it was found
  if (before) {
    await FirmSettings.replaceOne({ key: "firm" }, before);
  } else {
    await FirmSettings.deleteOne({ key: "firm" });
  }
  /**
   * The connection is deliberately left open. Playwright runs several spec
   * files in one worker, one after another, and `connectDB` caches the
   * connection per process — so a spec that closed it took the next spec in
   * that worker down with it. The worker exiting closes it.
   */
});

test("a partner records the firm's ICAI details", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto("/settings/icai");

  // nothing is assumed about CPE until the firm says so
  await expect(page.getByText("No CPE target is set")).toBeVisible();

  await page.getByLabel("Firm registration number (FRN)").fill("012345N");
  await page.getByLabel("Constitution").selectOption("LLP");
  await page.getByLabel("Working papers kept (years)").fill("10");
  await page.getByLabel("Structured hours a year").fill("20");
  await page
    .getByLabel("The firm’s notes on its obligations")
    .fill("Working papers retained 10 years. UDIN on every attestation.");
  await page.getByRole("button", { name: /Save the firm/ }).click();

  await expect(page.getByRole("status")).toContainText("Saved");
  await expect(page.getByText("No CPE target is set")).toHaveCount(0);

  const firm = await FirmSettings.findOne({ key: "firm" }).lean();
  expect(firm.frn).toBe("012345N");
  expect(firm.constitution).toBe("LLP");
  expect(firm.retentionYears).toBe(10);
  expect(firm.cpeTargetStructured).toBe(20);
});

test("a CA keeps their own CPE log and not anybody else's", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.ca);
  await page.goto("/settings/icai");

  // the firm's half is readable, not editable
  await expect(page.getByRole("button", { name: /Save the firm/ })).toHaveCount(
    0,
  );
  await expect(page.getByText(/Only a partner can change/)).toBeVisible();

  // their own record is theirs
  await expect(
    page.getByRole("heading", { name: /Playwright ICAI CA/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Playwright ICAI Partner/ }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Membership and hours" }).click();
  await page.getByLabel("Membership number").fill("412345");
  await page.getByLabel("Grade").selectOption("FCA");
  await page.getByRole("button", { name: "Save membership" }).click();
  await expect(page.getByRole("status")).toContainText("ICAI record saved");

  await page.getByLabel("When").fill("2026-05-10");
  await page.getByLabel("Hours").fill("6");
  await page.getByLabel("Programme").fill("GST annual return workshop");
  await page.getByRole("button", { name: "Add to the log" }).click();
  await expect(page.getByRole("status")).toContainText("6 hours logged");

  const stored = await User.findOne({ email: fx.ca }).lean();
  expect(stored.icai.grade).toBe("FCA");
  expect(stored.cpe).toHaveLength(1);
  expect(stored.cpe[0].kind).toBe("structured");

  // a target was set in the test above, so the year is now judged
  await expect(page.getByText(/14 structured short/)).toBeVisible();
});

test("the name on the settings screen is the name on the invoice", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto("/settings/icai");

  await page.getByLabel("Name").fill("Playwright Renamed & Co.");
  await page.getByRole("button", { name: /Save the firm/ }).click();
  await expect(page.getByRole("status")).toContainText("Playwright Renamed");

  /**
   * Every workbook the app generates is authored by the firm. A .xlsx is a
   * zip we can open and read back, which a PDF's compressed text streams are
   * not — so this is the surface that can actually be checked, and it proves
   * the profile reached a generated file rather than a literal in the source.
   */
  const response = await page.request.get("/team/export");
  expect(response.status()).toBe(200);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.body());
  expect(workbook.creator).toBe("Playwright Renamed & Co.");
});

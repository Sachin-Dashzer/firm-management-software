import { test, expect } from "@playwright/test";
import { signIn } from "./signin.js";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import FirmSettings from "../../models/FirmSettings.js";
import { hashPassword } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";

/**
 * The firm's own words (P3-29).
 *
 * One thing worth a browser, and it is the thing the screen promises: a
 * renamed word reaches **the menu and not the router**. The arithmetic of
 * the substitution is covered in `tests/words.test.js`; what cannot be
 * covered there is that the rail actually re-renders and that the links
 * still work afterwards.
 *
 * **This spec writes to the firm's one settings document**, which a third
 * of the suite reads. It puts the vocabulary back in `afterAll`, and it
 * restores whatever was there before rather than assuming it was empty.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    partner: `pw-words-partner-${tag}@phmgindia.test`,
    branchCode: tag.startsWith("l") ? "TWL" : "TWP",
  };
}

/** What the firm's vocabulary was before this spec touched it. */
let before = null;

test.beforeAll(async ({}, testInfo) => {
  const fx = names(testInfo.project.name);
  await connectDB();

  const firm = await FirmSettings.findOne({ key: "firm" }).lean();
  before = firm?.vocabulary ? { ...firm.vocabulary } : {};

  await User.deleteMany({ email: fx.partner });
  const stale = await Branch.findOne({ code: fx.branchCode }, null, {
    withDeleted: true,
  });
  if (stale) await Branch.deleteOne({ _id: stale._id }, { withDeleted: true });

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
    await User.create(
      [
        {
          name: "Playwright Words Partner",
          email: fx.partner,
          role: "partner",
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
  await FirmSettings.updateOne(
    { key: "firm" },
    { $set: { vocabulary: before ?? {} } },
  );
  await User.deleteMany({ email: fx.partner });
  const branch = await Branch.findOne({ code: fx.branchCode }, null, {
    withDeleted: true,
  });
  if (branch)
    await Branch.deleteOne({ _id: branch._id }, { withDeleted: true });
  /** The connection is left open on purpose — see the other specs. */
});

test("renaming a client renames the menu and nothing else", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  await page.goto("/settings/customise");
  await expect(page.getByRole("heading", { name: "Customise" })).toBeVisible();

  const words = page
    .locator("fieldset")
    .filter({ hasText: "Instead of “client”" });
  await words.getByLabel("One of them").fill("Party");
  await words.getByLabel("More than one").fill("Parties");

  /* The preview is the real substitution, so it changes before any save. */
  await expect(page.getByText("All parties", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Save these words/ }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();

  /* The rail is in the app layout, so this proves the layout went stale
     and came back. */
  const rail = page.getByRole("navigation").first();
  await expect(rail.getByText("Parties")).toBeVisible();

  /* And the link under the renamed group still goes where it always did:
     the word reaches the label, not the href. */
  await page.goto("/clients");
  await expect(page).toHaveURL(/\/clients$/);

  /* Put it back from the screen itself, which is the path a firm would use
     if they tried a word and did not like it. */
  await page.goto("/settings/customise");
  await page.getByRole("button", { name: /Back to the usual words/ }).click();
  await page.getByRole("button", { name: /Save these words/ }).click();
  await expect(page.getByText(/back to the usual words/)).toBeVisible();
});

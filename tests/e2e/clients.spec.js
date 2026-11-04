import { test, expect } from "@playwright/test";
import { signIn, gotoForm } from "./signin.js";
import { pick } from "./alerts.js";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import AuditLog from "../../models/AuditLog.js";
import ClientGroup from "../../models/ClientGroup.js";
import { hashPassword } from "../../lib/crypto.js";
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
const GROUP = "Playwright Sharma family";

test.beforeAll(async () => {
  await connectDB();
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
      { session, ordered: true },
    );
  });
  await Client.deleteMany({ pan: PAN }, { withDeleted: true });
  await ClientGroup.deleteMany({ name: GROUP }, { withDeleted: true });
});

test.afterAll(async () => {
  await Client.deleteMany({ pan: PAN }, { withDeleted: true });
  await ClientGroup.deleteMany({ name: GROUP }, { withDeleted: true });
  await User.deleteOne({ email: EMAIL });
  /**
   * The connection is deliberately left open. Playwright runs several spec
   * files in one worker, one after another, and `connectDB` caches the
   * connection per process — so a spec that closed it took the next spec in
   * that worker down with it. The worker exiting closes it.
   */
});

/**
 * Every new client belongs to a group (owner decision, 24-10-2026). The
 * group is chosen on the checks step, and can be made from there: the first
 * client of a new family has nowhere else to make one.
 */
async function chooseGroup(page, name = GROUP) {
  const select = page.locator('select[name="groupId"]');
  if (await select.locator("option", { hasText: name }).count()) {
    await select.selectOption({ label: name });
    return;
  }
  await page.getByPlaceholder("Sharma family").fill(name);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(select).toHaveValue(/^[a-f0-9]{24}$/);
}

/** Step 1, then the master in step 2, which is where every test starts. */
async function master(page, fields) {
  const {
    entity = "Private limited company",
    name,
    pan,
    gstin,
    contact = "Rakesh Sharma",
    mobile,
  } = fields;

  await page.getByRole("button", { name: new RegExp(`^${entity}`) }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", { name: /Client master/ }),
  ).toBeVisible();

  await page.getByLabel(/Legal name/).fill(name);
  await page.getByLabel(/Contact person/).fill(contact);
  await pick(page.getByLabel(/^Branch/), /NOI/);
  if (mobile) await page.getByLabel("Mobile").fill(mobile);
  if (gstin) await page.getByLabel("GSTIN", { exact: true }).fill(gstin);
  // the PAN is typed last: leaving it is what starts the duplicate lookup
  if (pan) await page.getByLabel(/^PAN/).fill(pan);
  await page.getByRole("heading", { name: /Client master/ }).click();
}

/** Click Continue until the named step is on screen. */
async function walkTo(page, heading) {
  for (let i = 0; i < 6; i += 1) {
    if (await page.getByRole("heading", { name: heading }).isVisible()) return;
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
}

test("the wizard will not go past the checks without a group", async ({
  page,
}) => {
  await signIn(page, EMAIL);
  await gotoForm(page, "/clients/new", "section");

  await master(page, { name: "Playwright Groupless Private Limited" });
  await walkTo(page, /Checks before accepting/);

  const select = page.locator('select[name="groupId"]');
  await expect(select).toHaveValue("");
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();

  await chooseGroup(page);
  await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
});

test("the entity type decides the fields that are asked for", async ({
  page,
}) => {
  await signIn(page, EMAIL);
  await gotoForm(page, "/clients/new", "section");

  // a company is asked for its CIN
  await page
    /* the card carries its own second line — "PAN 4th character: C · 7
       documents" — so its accessible name starts with the label rather
       than being it */
    .getByRole("button", { name: /^Private limited company/ })
    .click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByLabel("CIN", { exact: true })).toBeVisible();

  // a trust is asked for its trustees instead
  await page.getByRole("button", { name: "1. Entity type" }).click();
  await page.getByRole("button", { name: /^Trust/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByLabel("CIN", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Trustees")).toBeVisible();
});

test("onboard a client, then find it again", async ({ page }) => {
  await signIn(page, EMAIL);
  await gotoForm(page, "/clients/new", "section");

  await master(page, {
    name: NAME,
    pan: PAN,
    gstin: GSTIN,
    mobile: "9811034567",
  });
  await page.getByLabel(/Trade name/).fill("Playwright Textiles");

  // every check that can be decided from the typed master has passed
  await expect(page.getByText(/matches Private limited company/)).toBeVisible();

  await walkTo(page, /Documents to collect/);
  await page.getByText("Certificate of incorporation (CIN)").click();

  await walkTo(page, /Checks before accepting/);
  await chooseGroup(page);

  await walkTo(page, /Ready to create/);
  await page.getByRole("button", { name: "Create client" }).click();

  // the client, its services, and a link for what is still outstanding
  await expect(page.getByText(/created as Lead/)).toBeVisible();
  await expect(page.getByText(/documents asked for/)).toBeVisible();

  await page.getByRole("button", { name: "Open the client" }).click();
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

test("a bad GSTIN is caught where it is typed, not on save", async ({
  page,
}) => {
  await signIn(page, EMAIL);
  await gotoForm(page, "/clients/new", "section");

  await master(page, {
    entity: "Partnership firm",
    name: "Bad GSTIN Traders",
    // right shape, wrong check digit
    gstin: "09AABCS1429P1ZT",
  });

  await expect(page.getByText(/last character/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
});

test("the same PAN twice is blocked until it is confirmed", async ({
  page,
}) => {
  await signIn(page, EMAIL);
  await gotoForm(page, "/clients/new", "section");

  await master(page, {
    name: "Playwright Textiles Duplicate",
    pan: PAN,
    contact: "Someone Else",
  });

  // said once where it is typed, and it does not stop the wizard: whether
  // two records are the same client is a judgement, not a bad field
  await expect(page.getByText(/is already on/).first()).toBeVisible();

  await walkTo(page, /Checks before accepting/);
  await chooseGroup(page);
  await walkTo(page, /Ready to create/);

  // ...and again where it would be saved, with the only way past it
  await expect(
    page.getByText("This looks like an existing client"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create client" }).click();
  await expect(page.getByText(/is already on/).first()).toBeVisible();

  await page.getByLabel(/Create anyway/).check();
  await page.getByRole("button", { name: "Create client" }).click();
  await expect(page.getByText(/created as Lead/)).toBeVisible();
});

test("a portal password is hidden until revealed, and the reveal is logged", async ({
  page,
}) => {
  await signIn(page, EMAIL);

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
  await signIn(page, EMAIL);
  const client = await Client.findOne({ pan: PAN }).lean();

  await page.goto(`/clients/${client._id}?tab=notes`);
  await page.getByLabel("Kind").selectOption("Call");
  await page
    .getByLabel("What happened")
    .fill("Called about September GST data; promised by Friday.");
  await page.getByRole("button", { name: "Add entry" }).click();

  /**
   * The kind is asserted on the log row, not on the page. `getByText("Call")`
   * resolved to the `<option>` inside the Kind select — which is hidden, so
   * the test failed on a control it had just used rather than on the entry it
   * was about.
   */
  const entry = page
    .getByRole("listitem")
    .filter({ hasText: /promised by Friday/ });
  await expect(entry).toBeVisible();
  await expect(entry).toContainText("Call");
});

test("the import preview refuses a bad file without saving anything", async ({
  page,
}) => {
  await signIn(page, EMAIL);
  await gotoForm(page, "/clients/import");

  const before = await Client.countDocuments({});

  await page.getByLabel("Your CSV file").setInputFiles({
    name: "clients.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Group,Legal name,Entity type,Branch code,PAN,Contact 1 name\n" +
        `${GROUP},Good Traders LLP,LLP,NOI,AAAFZ1234C,Priya Singh\n` +
        `${GROUP},Bad Branch Co,LLP,XYZ,AAAFZ5678C,Someone\n`,
    ),
  });
  await page.getByRole("button", { name: "Check the file" }).click();

  /**
   * This said `getByText("1")`, which meant "some element somewhere contains
   * a 1" — at phone width the first match was the hidden to-do count in the
   * menu drawer, so the test failed on the navigation while the preview it
   * was about was correct. The count has a sentence; assert the sentence.
   */
  await expect(page.getByText(/1 ready to import/)).toBeVisible();
  await expect(page.getByText(/Branch "XYZ" is not one of/)).toBeVisible();
  expect(await Client.countDocuments({})).toBe(before);

  // importing writes only the good row
  await page.getByRole("button", { name: /Import 1 client/ }).click();
  await expect(page.getByRole("status")).toContainText("1 client imported");

  const imported = await Client.findOne({ pan: "AAAFZ1234C" }).lean();
  expect(imported?.legalName).toBe("Good Traders LLP");
  // the group named in the spreadsheet was made as the row was written
  const group = await ClientGroup.findOne({ name: GROUP }).lean();
  expect(String(imported?.groupId)).toBe(String(group?._id));
  await Client.deleteMany(
    { pan: { $in: ["AAAFZ1234C", "AAAFZ5678C"] } },
    { withDeleted: true },
  );
});

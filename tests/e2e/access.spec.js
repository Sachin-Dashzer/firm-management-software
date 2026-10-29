import { test, expect } from "@playwright/test";
import { signIn } from "./signin.js";
import { pick } from "./alerts.js";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import ClientAccess from "../../models/ClientAccess.js";
import { hashPassword } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";

/**
 * Client Access Grants end to end (owner decision D3, 19-10-2026) —
 * acceptance checks 1, 2 and 3 of the Phase 2 list.
 *
 * Two clients in the same branch as the employee, so sharing a branch is
 * demonstrably not the thing that opens one. One of them is granted, with two
 * sections; the other is granted nothing at all.
 *
 * Skipped until the Atlas cluster is configured, like every other suite here.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PARTNER = "playwright-access-partner@phmgindia.test";
const EMPLOYEE = "playwright-access-employee@phmgindia.test";
const PASSWORD = "test-password-not-real";

const GRANTED_PAN = "AADCJ4817Q";
const UNSEEN_PAN = "AAGCT2904M";
const GRANTED_NAME = "Jaiswal Steels Private Limited";
const UNSEEN_NAME = "Tandon Exports LLP";

/** @type {{granted: string, unseen: string, employee: string}} */
const ids = { granted: "", unseen: "", employee: "" };

test.beforeAll(async () => {
  await connectDB();
  for (const email of [PARTNER, EMPLOYEE]) await User.deleteOne({ email });
  await Client.deleteMany(
    { pan: { $in: [GRANTED_PAN, UNSEEN_PAN] } },
    { withDeleted: true },
  );

  await systemAudit(async (session) => {
    const branch = await Branch.findOneAndUpdate(
      { code: "NOI" },
      { $setOnInsert: { name: "Noida (head office)", invoicePrefix: "NOI" } },
      { returnDocument: "after", upsert: true, session },
    );

    await User.create(
      [
        {
          name: "Praveen Mehrotra",
          email: PARTNER,
          role: "partner",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
      ],
      { session, ordered: true },
    );

    const [employee] = await User.create(
      [
        {
          name: "Ankit Saxena",
          email: EMPLOYEE,
          role: "employee",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
      ],
      { session, ordered: true },
    );
    ids.employee = String(employee._id);

    const made = await Client.create(
      [
        {
          code: "PHMG-NOI-9801",
          legalName: GRANTED_NAME,
          tradeName: "Jaiswal Steels",
          entityType: "Private Limited",
          pan: GRANTED_PAN,
          status: "Active",
          branchId: branch._id,
        },
        {
          code: "PHMG-NOI-9802",
          legalName: UNSEEN_NAME,
          tradeName: "Tandon Exports",
          entityType: "LLP",
          pan: UNSEEN_PAN,
          status: "Active",
          branchId: branch._id,
        },
      ],
      { session, ordered: true },
    );
    ids.granted = String(made[0]._id);
    ids.unseen = String(made[1]._id);

    await ClientAccess.create(
      [
        {
          userId: employee._id,
          clientId: made[0]._id,
          branchId: branch._id,
          sections: ["profile", "documents"],
          reason: "Covering the GST filings while Riya is on exam leave",
          active: true,
          grantedBy: "test",
          grantedByName: "Praveen Mehrotra",
        },
      ],
      { session, ordered: true },
    );
  });
});

test.afterAll(async () => {
  await ClientAccess.deleteMany(
    { userId: ids.employee },
    { withDeleted: true },
  );
  await Client.deleteMany(
    { pan: { $in: [GRANTED_PAN, UNSEEN_PAN] } },
    { withDeleted: true },
  );
  for (const email of [PARTNER, EMPLOYEE]) await User.deleteOne({ email });
  /**
   * The connection is deliberately left open. Playwright runs several spec
   * files in one worker, one after another, and `connectDB` caches the
   * connection per process — so a spec that closed it took the next spec in
   * that worker down with it. The worker exiting closes it.
   */
});

/** @param {import("@playwright/test").Page} page */

// --- acceptance 1 ----------------------------------------------------------

test("a client with no grant and no assignment is nowhere to be found", async ({
  page,
}) => {
  await signIn(page, EMPLOYEE);

  // the row's own link: since P2-13 the list prints the group beside the
  // client, so the name can appear twice on one row
  await expect(
    page.getByRole("link", { name: "Jaiswal Steels" }).first(),
  ).toBeVisible();
  await expect(page.getByText("Jaiswal Steels")).toBeVisible();
  await expect(page.getByText("Tandon Exports")).toHaveCount(0);

  await page.goto(`/clients/${ids.unseen}`);
  // a client they may not see goes to the same page as a revoked grant:
  // "it exists, and here is who can open it for you" (P3-7)
  await expect(page).toHaveURL(/no-access\?client=/);

  const search = await page.request.get("/api/search?q=Tandon");
  expect(JSON.stringify(await search.json())).not.toContain("Tandon");

  // the firm document search is scoped by client too, not by branch
  const docs = await page.request.get("/documents?q=Tandon");
  expect(await docs.text()).not.toContain("Tandon Exports");
});

// --- acceptance 2 ----------------------------------------------------------

test("a grant of two sections shows exactly those two tabs", async ({
  page,
}) => {
  await signIn(page, EMPLOYEE);
  await page.goto(`/clients/${ids.granted}`);

  const tabs = page.getByRole("navigation", { name: "Client sections" });
  await expect(tabs.getByRole("link", { name: "Overview" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Documents" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Invoices" })).toHaveCount(0);
  await expect(tabs.getByRole("link", { name: "Notes" })).toHaveCount(0);
  await expect(tabs.getByRole("link", { name: "Activity" })).toHaveCount(0);
  await expect(tabs.getByRole("link", { name: "Team & access" })).toHaveCount(
    0,
  );

  // the grant does not carry the statutory IDs, so the PAN stays masked
  await expect(page.getByText("•••").first()).toBeVisible();
  await expect(page.getByText(GRANTED_PAN)).toHaveCount(0);

  // and the whole-dossier export is refused outright
  const dossier = await page.request.get(`/clients/${ids.granted}/export`);
  expect(dossier.status()).toBe(403);
});

test("revoking a grant closes the client on the next request", async ({
  page,
}) => {
  await signIn(page, EMPLOYEE);
  await page.goto(`/clients/${ids.granted}`);
  await expect(page).toHaveURL(new RegExp(ids.granted));

  await ClientAccess.updateOne(
    { userId: ids.employee, clientId: ids.granted },
    { $set: { active: false, revokedAt: new Date() } },
  );

  await page.goto(`/clients/${ids.granted}`);
  // not the list: P3-7 sends you to the page that says the record exists
  // and who can open it for you, because a redirect to the list reads as
  // "no such client"
  await expect(page).toHaveURL(/no-access\?client=/);

  await ClientAccess.updateOne(
    { userId: ids.employee, clientId: ids.granted },
    { $set: { active: true, revokedAt: null } },
  );
});

test("an expired grant does nothing, without waiting for the nightly job", async ({
  page,
}) => {
  await ClientAccess.updateOne(
    { userId: ids.employee, clientId: ids.granted },
    { $set: { expiresAt: new Date(Date.now() - 60_000), active: true } },
  );

  await signIn(page, EMPLOYEE);
  await page.goto(`/clients/${ids.granted}`);
  // the same page as a revoked grant: the client exists, you cannot open it
  await expect(page).toHaveURL(/no-access\?client=/);
  await expect(page.getByText("Jaiswal Steels")).toHaveCount(0);

  await ClientAccess.updateOne(
    { userId: ids.employee, clientId: ids.granted },
    { $set: { expiresAt: null } },
  );
});

// --- acceptance 3 ----------------------------------------------------------

test("the grant drawer disables what the role may never hold", async ({
  page,
}) => {
  await signIn(page, PARTNER);
  await page.goto(`/clients/${ids.unseen}?tab=access`);

  await page.getByRole("button", { name: "Give someone access" }).click();
  await pick(page.getByLabel("Who"), /Ankit Saxena/);

  await expect(page.getByLabel(/Profile and contacts/)).toBeEnabled();
  await expect(page.getByLabel(/Statutory IDs/)).toBeEnabled();
  await expect(page.getByLabel(/Portal logins/)).toBeDisabled();
  await expect(page.getByLabel(/Invoices, payments/)).toBeDisabled();
  await expect(page.getByText(/never opened by a grant/)).toBeVisible();
});

test("a partner can give access, and the client appears for the employee", async ({
  page,
  browser,
}) => {
  await signIn(page, PARTNER);
  await page.goto(`/clients/${ids.unseen}?tab=access`);

  await page.getByRole("button", { name: "Give someone access" }).click();
  await pick(page.getByLabel("Who"), /Ankit Saxena/);
  await page.getByLabel(/Profile and contacts/).check();
  await page
    .getByLabel(/Why they need it/)
    .fill("Taking over the export paperwork");
  await page.getByRole("button", { name: "Give access" }).click();

  await expect(page.getByRole("status")).toContainText("can now see");

  const other = await browser.newContext();
  const employeePage = await other.newPage();
  await signIn(employeePage, EMPLOYEE);
  await employeePage.goto("/clients");
  await expect(employeePage.getByText("Tandon Exports")).toBeVisible();
  await other.close();
});

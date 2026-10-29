import { test, expect } from "@playwright/test";
import { signIn } from "./signin.js";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import { hashPassword } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";

/**
 * What an intern with no work on a client can reach (spec section 2, owner
 * decision D3).
 *
 * The tab title is the point of this suite. Before P2-1 `generateMetadata`
 * read the client out of the database before any permission check ran, so a
 * guessed id put the client's legal name in the browser tab of anybody who
 * was signed in. The redirect was already right; the title was not.
 *
 * Skipped until the Atlas cluster is configured, like every other suite here.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PARTNER = "playwright-perm-partner@phmgindia.test";
const INTERN = "playwright-perm-intern@phmgindia.test";
const PASSWORD = "test-password-not-real";
const PAN = "AAFCP7391K";
const NAME = "Kesarwani Agro Industries Private Limited";

/** @type {string} */
let clientId;

test.beforeAll(async () => {
  await connectDB();
  await User.deleteOne({ email: PARTNER });
  await User.deleteOne({ email: INTERN });
  await Client.deleteMany({ pan: PAN }, { withDeleted: true });

  await systemAudit(async (session) => {
    const branch = await Branch.findOneAndUpdate(
      { code: "NOI" },
      { $setOnInsert: { name: "Noida (head office)", invoicePrefix: "NOI" } },
      { returnDocument: "after", upsert: true, session },
    );

    const [partner] = await User.create(
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

    // Same branch as the client, and no engagement anywhere near it: under D3
    // a shared branch is no longer a reason to see anything.
    await User.create(
      [
        {
          name: "Ananya Bisht",
          email: INTERN,
          role: "intern",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
          articleship: {
            principalId: partner._id,
            icaiRegNo: "NRO0912345",
            start: new Date("2026-05-01"),
            expectedEnd: new Date("2029-04-30"),
          },
        },
      ],
      { session, ordered: true },
    );

    const [client] = await Client.create(
      [
        {
          code: "PHMG-NOI-9901",
          legalName: NAME,
          tradeName: "Kesarwani Agro",
          entityType: "Private Limited",
          pan: PAN,
          status: "Active",
          branchId: branch._id,
        },
      ],
      { session, ordered: true },
    );
    clientId = String(client._id);
  });
});

test.afterAll(async () => {
  await Client.deleteMany({ pan: PAN }, { withDeleted: true });
  await User.deleteOne({ email: PARTNER });
  await User.deleteOne({ email: INTERN });
  /**
   * The connection is deliberately left open. Playwright runs several spec
   * files in one worker, one after another, and `connectDB` caches the
   * connection per process — so a spec that closed it took the next spec in
   * that worker down with it. The worker exiting closes it.
   */
});

/** @param {import("@playwright/test").Page} page */

test("an unconnected intern is turned away and the tab title says nothing", async ({
  page,
}) => {
  await signIn(page, INTERN);

  await page.goto(`/clients/${clientId}`);

  // turned away from the case file
  await expect(page).toHaveURL(/\/clients$/);

  // and the name never reached the tab on the way past
  expect(await page.title()).toBe("Client · PHMG");
  expect(await page.title()).not.toContain("Kesarwani");

  // nor is the client in their list
  await expect(page.getByText(NAME)).toHaveCount(0);
  await expect(page.getByText("Kesarwani Agro")).toHaveCount(0);

  // nor reachable through the command bar, which searches with the same scope
  const search = await page.request.get("/api/search?q=Kesarwani");
  expect(JSON.stringify(await search.json())).not.toContain("Kesarwani");

  // and the spreadsheet of the whole list is refused outright
  const spreadsheet = await page.request.get("/clients/export");
  expect(spreadsheet.status()).toBe(403);
});

test("a partner opens the same client and sees the name in the tab", async ({
  page,
}) => {
  await signIn(page, PARTNER);

  await page.goto(`/clients/${clientId}`);
  await expect(page).toHaveURL(new RegExp(`/clients/${clientId}`));
  expect(await page.title()).toContain("Kesarwani Agro");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Kesarwani Agro",
  );
});

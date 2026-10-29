import { test, expect } from "@playwright/test";
import { signIn } from "./signin.js";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import ClientGroup from "../../models/ClientGroup.js";
import HeldChange from "../../models/HeldChange.js";
import { hashPassword } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";

/**
 * The bulk client round-trip (P3-18a).
 *
 * The flow worth a browser is the split: a CA sends a sheet that corrects
 * a trade name and a PAN, the trade name lands immediately, the PAN waits,
 * and a partner decides on it alone. The diffing rules are arithmetic and
 * live in tests/round-trip.test.js.
 *
 * Skipped until Atlas is configured, like every other suite.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";
/** A PAN and a GSTIN that belong to each other, both fake but well formed. */
const PAN = "AABCS1429P";
const NEW_PAN = "AAACS1429P";

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    tag,
    partner: `pw-rt-partner-${tag}@phmgindia.test`,
    ca: `pw-rt-ca-${tag}@phmgindia.test`,
    clientName: `Playwright Round Trip ${tag} Private Limited`,
    code: `PHMG-NOI-7${tag.slice(0, 3).toUpperCase()}`,
    group: `Round trip group ${tag}`,
  };
}

async function wipe(fx) {
  const client = await Client.findOne({ legalName: fx.clientName }, null, {
    withDeleted: true,
  });
  if (client) {
    await HeldChange.deleteMany(
      { clientId: client._id },
      { withDeleted: true },
    );
    await Client.deleteOne({ _id: client._id }, { withDeleted: true });
  }
  await ClientGroup.deleteMany({ name: fx.group }, { withDeleted: true });
  await User.deleteMany({ email: { $in: [fx.partner, fx.ca] } });
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
          name: "Playwright RT Partner",
          email: fx.partner,
          role: "partner",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
        {
          name: "Playwright RT Manager",
          email: fx.ca,
          role: "ca",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
      ],
      { session, ordered: true },
    );

    const [group] = await ClientGroup.create(
      [{ name: fx.group, createdBy: "test", updatedBy: "test" }],
      { session, ordered: true },
    );

    await Client.create(
      [
        {
          code: fx.code,
          legalName: fx.clientName,
          tradeName: "Round Trip Traders",
          entityType: "Private Limited",
          branchId: branch._id,
          groupId: group._id,
          pan: PAN,
          status: "Active",
          risk: "Low",
          creditDays: 15,
          contacts: [
            { name: "Suresh Agarwal", mobile: "9876543210", primary: true },
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
  /**
   * The connection is deliberately left open. Playwright runs several spec
   * files in one worker, one after another, and `connectDB` caches the
   * connection per process — so a spec that closed it took the next spec in
   * that worker down with it. The worker exiting closes it.
   */
});

test("a sheet from a manager changes the ordinary fields and holds the identity ones", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);

  await signIn(page, fx.ca);
  await page.goto("/clients/round-trip");

  await expect(
    page.getByText(/do not apply when you send a sheet/),
  ).toBeVisible();

  const sheet = [
    "Client code,Legal name,Trade name,PAN,Risk",
    `"${fx.code}","${fx.clientName}","Round Trip Trading Co","${NEW_PAN}","High"`,
  ].join("\n");

  await page.locator('input[type="file"]').setInputFiles({
    name: "clients.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(sheet, "utf8"),
  });
  await page.getByRole("button", { name: "Show me what would change" }).click();

  // every change is shown field by field, and the identity one says so
  await expect(page.getByText("Round Trip Trading Co")).toBeVisible();
  await expect(page.getByText(/identity — a partner decides/)).toBeVisible();

  await page.getByRole("button", { name: /Apply 3 changes/ }).click();
  await expect(page.getByRole("status")).toContainText(/waiting for a partner/);

  // the trade name landed; the PAN did not
  const after = await Client.findOne({ code: fx.code })
    .select("tradeName pan risk")
    .lean();
  expect(after.tradeName).toBe("Round Trip Trading Co");
  expect(after.risk).toBe("High");
  expect(after.pan).toBe(PAN);

  // and this batch can be put back, field by field
  await page.getByRole("button", { name: "Put it back" }).first().click();
  await expect(page.getByRole("status")).toContainText(/put back/i);

  // the partner decides on the PAN alone
  await page.context().clearCookies();
  await signIn(page, fx.partner);
  await page.goto("/clients/changes");

  await expect(page.getByText(new RegExp(NEW_PAN))).toBeVisible();
  await page.getByRole("button", { name: "Make the change" }).click();
  await expect(page.getByRole("status")).toContainText(/PAN changed/);

  const settled = await Client.findOne({ code: fx.code }).select("pan").lean();
  expect(settled.pan).toBe(NEW_PAN);
});

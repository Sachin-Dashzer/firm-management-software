import { test, expect } from "@playwright/test";
import { signIn } from "./signin.js";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import ClientGroup from "../../models/ClientGroup.js";
import FormDraft from "../../models/FormDraft.js";
import { hashPassword } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";

/**
 * Keeping an unfinished client, and adding another (P3-18b).
 *
 * The flow worth a browser is the one the firm will actually hit: the
 * phone rings halfway through a new client, and what comes back is
 * everything except the PAN — which is said out loud rather than left as
 * an empty box nobody notices.
 *
 * Skipped until Atlas is configured, like every other suite.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";
const PAN = "AABCS1429P";

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    tag,
    partner: `pw-draft-partner-${tag}@phmgindia.test`,
    clientName: `Playwright Draft ${tag} Private Limited`,
    group: `Draft group ${tag}`,
  };
}

async function wipe(fx) {
  const people = await User.find({ email: fx.partner });
  await FormDraft.deleteMany({ userId: { $in: people.map((p) => p._id) } });
  await Client.deleteMany(
    { legalName: { $regex: `^Playwright Draft ${fx.tag}` } },
    { withDeleted: true },
  );
  await ClientGroup.deleteMany({ name: fx.group }, { withDeleted: true });
  await User.deleteMany({ email: fx.partner });
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

    await ClientGroup.create(
      [{ name: fx.group, createdBy: "test", updatedBy: "test" }],
      { session, ordered: true },
    );

    await User.create(
      [
        {
          name: "Playwright Draft Partner",
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
  await wipe(names(testInfo.project.name));
  /**
   * The connection is deliberately left open. Playwright runs several spec
   * files in one worker, one after another, and `connectDB` caches the
   * connection per process — so a spec that closed it took the next spec in
   * that worker down with it. The worker exiting closes it.
   */
});

test("an unfinished client comes back, without its PAN", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);

  await signIn(page, fx.partner);
  await page.goto("/clients/new");

  await page.getByLabel(/Legal name/).fill(fx.clientName);
  await page.getByLabel(/^PAN/).fill(PAN);
  await page.getByRole("button", { name: "Keep for later" }).click();
  await expect(page.getByRole("status")).toContainText(/PAN is not kept/);

  // the phone call ends and they come back to it
  await page.goto("/clients/new");
  await expect(page.getByText(/unfinished client from/)).toBeVisible();
  await expect(page.getByText(/PAN was not kept/)).toBeVisible();

  await page.getByRole("button", { name: "Carry on with it" }).click();
  await expect(page.getByLabel(/Legal name/)).toHaveValue(fx.clientName);
  await expect(page.getByLabel(/^PAN/)).toHaveValue("");

  // what is in the database is the name, and nothing sensitive
  const draft = await FormDraft.findOne({ kind: "client" }).lean();
  expect(JSON.stringify(draft.payload)).not.toContain(PAN);
  expect(draft.dropped).toContain("PAN");
});

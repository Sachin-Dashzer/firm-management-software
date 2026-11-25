import { test, expect } from "@playwright/test";
import { signIn, PASSWORD } from "./signin.js";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import ServiceTemplate from "../../models/ServiceTemplate.js";
import Engagement from "../../models/Engagement.js";
import ClientService from "../../models/ClientService.js";
import { hashPassword } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";
import { checkGSTIN } from "../../lib/validators.js";

/**
 * One client, three GST registrations, three monthly returns (owner
 * request, 24-11-2026).
 *
 * The firm's client has branches in Delhi, Maharashtra and Telangana, each
 * with its own GSTIN and its own return. Before this the unique index
 * allowed one GSTR-1 per client per month, so the second branch's work
 * could not be raised at all — which is what this walks through: raise
 * Delhi, raise Mumbai for the same month, and have both.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** A GSTIN for this state and PAN whose check digit is actually right. */
function gstinFor(stateCode, pan) {
  for (const last of ALPHABET) {
    const candidate = `${stateCode}${pan}1Z${last}`;
    if (checkGSTIN(candidate).ok) return candidate;
  }
  throw new Error(`no valid check digit for ${stateCode}${pan}`);
}

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    partner: `pw-gstin-partner-${tag}@phmgindia.test`,
    code: `PWG-${tag.slice(0, 6).toUpperCase()}`,
    clientName: `Playwright Medihub ${tag} Private Limited`,
    service: `Playwright GSTR-1 ${tag}`,
  };
}

/** One PAN, three registrations — which is what a GST branch is. */
const PAN = "AABCM1429P";

const BRANCHES = [
  { label: "Delhi", stateCode: "07" },
  { label: "Mumbai", stateCode: "27" },
  { label: "Hyderabad", stateCode: "36" },
].map((b) => ({ ...b, gstin: gstinFor(b.stateCode, PAN) }));

/** Exactly what the picker's option reads, so it can be chosen by name. */
function optionFor(label) {
  const branch = BRANCHES.find((b) => b.label === label);
  return `${branch.label} — ${branch.gstin}`;
}

let fx;

async function wipe(f) {
  const client = await Client.findOne({ legalName: f.clientName }, null, {
    withDeleted: true,
  });
  if (client) {
    await Engagement.deleteMany(
      { clientId: client._id },
      { withDeleted: true },
    );
    await ClientService.deleteMany(
      { clientId: client._id },
      { withDeleted: true },
    );
    await Client.deleteOne({ _id: client._id }, { withDeleted: true });
  }
  await ServiceTemplate.deleteMany({ code: f.code }, { withDeleted: true });
  await User.deleteMany({ email: f.partner });
}

test.beforeAll(async ({}, testInfo) => {
  fx = names(testInfo.project.name);
  await connectDB();
  await wipe(fx);

  await systemAudit(async (session) => {
    const branch = await Branch.findOneAndUpdate(
      { code: "NOI" },
      { $setOnInsert: { name: "Noida (head office)", invoicePrefix: "NOI" } },
      { returnDocument: "after", upsert: true, session },
    );

    await User.create(
      [
        {
          name: "Playwright GSTIN Partner",
          email: fx.partner,
          role: "partner",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
      ],
      { session, ordered: true },
    );

    await Client.create(
      [
        {
          code: `PHMG-NOI-8${testInfo.project.name.length}00`,
          legalName: fx.clientName,
          tradeName: `Playwright Medihub ${testInfo.project.name}`,
          entityType: "Private Limited",
          pan: PAN,
          branchId: branch._id,
          status: "Active",
          gstins: BRANCHES.map((b) => ({ gstin: b.gstin, label: b.label })),
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );

    await ServiceTemplate.create(
      [
        {
          name: fx.service,
          code: fx.code,
          category: "Indirect Tax",
          level: "L3",
          minExecRole: "intern",
          minReviewRole: "ca",
          recurrence: "monthly",
          steps: [{ name: "File the return" }],
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );
  });
});

test.afterAll(async () => {
  if (fx) await wipe(fx);
});

/**
 * Fill the create form for one registration, by the name the firm gave it.
 *
 * The two comboboxes are driven from the keyboard — type, Enter — which is
 * both what the component documents and a check that the form is usable
 * without a mouse at all (the definition of done asks for it).
 */
async function fillForm(page, label, service) {
  await page.goto("/engagements/new");

  const client = page.getByRole("combobox", { name: "Client" });
  await client.fill("Playwright Medihub");
  await expect(
    page.getByRole("option", { name: /Playwright Medihub/ }).first(),
  ).toBeVisible();
  await client.press("Enter");

  // the picker is there only because this client has three registrations
  const picker = page.getByLabel("GST registration");
  await expect(picker).toBeVisible();
  await picker.selectOption({ label: optionFor(label) });

  const svc = page.getByRole("combobox", { name: "Service" });
  await svc.fill(service);
  await expect(
    page.getByRole("option", { name: service }).first(),
  ).toBeVisible();
  await svc.press("Enter");

  await page.getByRole("button", { name: /create engagement/i }).click();
}

test("raises the same month's return for two branches of one client", async ({
  page,
}) => {
  await signIn(page, fx.partner);

  await fillForm(page, "Delhi", fx.service);
  await expect(page).toHaveURL(/\/engagements\/[a-f0-9]{24}/);
  const delhi = page.url();
  // the header says which branch the work is for
  await expect(page.locator("main")).toContainText("Delhi");

  // the same client, the same service, the same month: the case the old
  // unique index refused outright
  await fillForm(page, "Mumbai", fx.service);
  await expect(page).toHaveURL(/\/engagements\/[a-f0-9]{24}/);
  expect(page.url()).not.toBe(delhi);
  await expect(page.locator("main")).toContainText("Mumbai");

  // and both are on the list, told apart by branch
  await page.goto("/engagements");
  await expect(page.locator("table").first()).toContainText("Delhi");
  await expect(page.locator("table").first()).toContainText("Mumbai");

  const raised = await Engagement.find({ "templateSnapshot.code": fx.code })
    .select("gstin gstinLabel period")
    .lean();
  expect(raised).toHaveLength(2);
  // one period, two registrations, two different GSTINs
  expect(new Set(raised.map((e) => e.period)).size).toBe(1);
  expect(new Set(raised.map((e) => e.gstin)).size).toBe(2);
});

test("still refuses the same branch's return twice", async ({ page }) => {
  await signIn(page, fx.partner);

  await fillForm(page, "Hyderabad", fx.service);
  await expect(page).toHaveURL(/\/engagements\/[a-f0-9]{24}/);

  // again, the same registration: the duplicate guard holds, and says
  // which branch it is talking about
  await fillForm(page, "Hyderabad", fx.service);
  // the form's own alert, not Next's route announcer, which is also one
  const alert = page.locator("form p[role='alert']");
  await expect(alert).toContainText(/Hyderabad/);
  await expect(alert).toContainText(/already exists/);
});

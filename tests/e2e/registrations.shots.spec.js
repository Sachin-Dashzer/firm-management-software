import { test } from "@playwright/test";
import { signIn, PASSWORD } from "./signin.js";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import { hashPassword } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";
import { checkGSTIN } from "../../lib/validators.js";

/**
 * Not a test: a way of **looking** at the two screens per-branch GST work
 * changed, in both themes, against a throwaway database.
 *
 * `scripts/shots.mjs` cannot reach these — one needs a client that has
 * three registrations, and the firm's own database has no such client and
 * must not be given one for a screenshot. So the fixture is made here, in
 * the database the suite is allowed to destroy, and the shots land in
 * `.taste-skill/shots/registrations/`.
 *
 * It asserts nothing and fails nothing.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const PAN = "AABCR5055K";

function gstinFor(stateCode) {
  for (const last of ALPHABET) {
    const candidate = `${stateCode}${PAN}1Z${last}`;
    if (checkGSTIN(candidate).ok) return candidate;
  }
  throw new Error(`no valid check digit for ${stateCode}`);
}

const WHO = "pw-shots-partner@phmgindia.test";
const CLIENT = "Ryan Medihub Private Limited";
const BRANCHES = [
  { label: "Delhi", stateCode: "07" },
  { label: "Mumbai", stateCode: "27" },
  { label: "Hyderabad", stateCode: "36" },
];

let clientId = "";

test.beforeAll(async () => {
  await connectDB();
  await Client.deleteMany({ legalName: CLIENT }, { withDeleted: true });
  await User.deleteMany({ email: WHO });

  await systemAudit(async (session) => {
    const branch = await Branch.findOneAndUpdate(
      { code: "NOI" },
      { $setOnInsert: { name: "Noida (head office)", invoicePrefix: "NOI" } },
      { returnDocument: "after", upsert: true, session },
    );

    await User.create(
      [
        {
          name: "Shots Partner",
          email: WHO,
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
          code: "PHMG-NOI-9001",
          legalName: CLIENT,
          tradeName: "Ryan Medihub",
          entityType: "Private Limited",
          pan: PAN,
          branchId: branch._id,
          status: "Active",
          gstins: BRANCHES.map((b) => ({
            gstin: gstinFor(b.stateCode),
            label: b.label,
            state: b.label,
          })),
          contacts: [
            {
              name: "Ryan Mathew",
              designation: "Director",
              mobile: "9810055501",
              email: "ryan@ryanmedihub.in",
              primary: true,
            },
          ],
          createdBy: "shots",
          updatedBy: "shots",
        },
      ],
      { session, ordered: true },
    );
    clientId = String(client._id);
  });
});

test.afterAll(async () => {
  await Client.deleteMany({ legalName: CLIENT }, { withDeleted: true });
  await User.deleteMany({ email: WHO });
});

for (const theme of ["light", "dark"]) {
  test(`shots — ${theme}`, async ({ page }) => {
    await page.addInitScript((value) => {
      try {
        localStorage.setItem("phmg-theme", value);
      } catch {}
    }, theme);
    await page.emulateMedia({ colorScheme: theme });
    await signIn(page, WHO);

    const dir = `.taste-skill/shots/registrations/${theme}`;

    // 0. the onboarding wizard: the GSTIN first, then the master step
    await page.goto("/clients/new");
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${dir}/onboard-1-blank.png` });
    await page.getByLabel("GSTIN", { exact: true }).fill(gstinFor("07"));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${dir}/onboard-2-read.png` });
    // "C" fits four kinds of company, so the wizard asks rather than guesses
    await page
      .getByRole("button", { name: /^Private limited company/ })
      .click();
    await page.getByRole("button", { name: /^Continue/ }).click();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: `${dir}/onboard-3-master.png`,
      fullPage: true,
    });

    // 1. the create form, with a client chosen so the picker is showing
    await page.goto("/engagements/new");
    const client = page.getByRole("combobox", { name: "Client" });
    await client.fill("Ryan Medihub");
    await page
      .getByRole("option", { name: /Ryan Medihub/ })
      .first()
      .waitFor();
    await client.press("Enter");
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${dir}/engagement-new.png` });

    // 2. the client's own edit form: the name beside each GSTIN
    await page.goto(`/clients/${clientId}/edit`);
    await page.waitForTimeout(400);
    await page
      .getByRole("group", { name: /GST registrations/i })
      .screenshot({ path: `${dir}/client-gstins.png` });

    // 3. the services the client takes, where a subscription names one
    await page.goto(`/clients/${clientId}?tab=engagements`);
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: /add a service/i }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${dir}/client-services.png` });
  });
}

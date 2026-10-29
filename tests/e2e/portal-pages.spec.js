import { test, expect } from "@playwright/test";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import ClientUser from "../../models/ClientUser.js";
import DocumentModel from "../../models/Document.js";
import Invoice from "../../models/Invoice.js";
import Comment from "../../models/Comment.js";
import { hashPassword } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";

/**
 * The rooms behind the portal's door (P2-9b).
 *
 * The tests that matter are the negative ones: a document nobody shared,
 * a draft invoice, and another client's PDF all have to be invisible to
 * somebody who is signed in and looking for them.
 *
 * Skipped until Atlas is configured, like every other suite.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PORTAL_PASSWORD = "portal-password-not-real";

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    portal: `pw-pages-client-${tag}@phmgindia.test`,
    clientName: `Playwright Pages ${tag} Private Limited`,
    otherName: `Playwright Other ${tag} Private Limited`,
    partner: `pw-pages-partner-${tag}@phmgindia.test`,
  };
}

const ids = {
  client: "",
  other: "",
  shared: "",
  secret: "",
  issued: "",
  draft: "",
  otherInvoice: "",
};

async function wipe(fx) {
  for (const legalName of [fx.clientName, fx.otherName]) {
    const client = await Client.findOne({ legalName }, null, {
      withDeleted: true,
    });
    if (!client) continue;
    await ClientUser.deleteMany(
      { clientId: client._id },
      { withDeleted: true },
    );
    await DocumentModel.deleteMany(
      { clientId: client._id },
      { withDeleted: true },
    );
    await Invoice.deleteMany({ clientId: client._id }, { withDeleted: true });
    await Comment.deleteMany({ clientId: client._id }, { withDeleted: true });
    await Client.deleteOne({ _id: client._id }, { withDeleted: true });
  }
  await User.deleteMany({ email: fx.partner });
  await ClientUser.deleteMany({ email: fx.portal }, { withDeleted: true });
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

    const [partner] = await User.create(
      [
        {
          name: "Playwright Pages Partner",
          email: fx.partner,
          role: "partner",
          branchIds: [branch._id],
          passwordHash: await hashPassword("test-password-not-real"),
        },
      ],
      { session, ordered: true },
    );

    const made = await Client.create(
      [
        {
          code: `PHMG-NOI-A${testInfo.project.name.length}00`,
          legalName: fx.clientName,
          entityType: "Private Limited",
          branchId: branch._id,
          status: "Active",
          clientPartnerId: partner._id,
          pan: "AAACP1234K",
          gstins: [{ gstin: "09AAACP1234K1Z5", state: "Uttar Pradesh" }],
          contacts: [
            {
              name: "Portal Contact",
              designation: "Director",
              mobile: "9810012399",
              primary: true,
            },
          ],
          createdBy: "test",
          updatedBy: "test",
        },
        {
          code: `PHMG-NOI-B${testInfo.project.name.length}00`,
          legalName: fx.otherName,
          entityType: "Private Limited",
          branchId: branch._id,
          status: "Active",
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );
    ids.client = String(made[0]._id);
    ids.other = String(made[1]._id);

    await ClientUser.create(
      [
        {
          name: "Portal Reader",
          email: fx.portal,
          designation: "Director",
          clientId: made[0]._id,
          branchId: branch._id,
          passwordHash: await hashPassword(PORTAL_PASSWORD),
          mustChangePassword: false,
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );

    const documents = await DocumentModel.create(
      [
        {
          name: "Shared acknowledgement.pdf",
          fileKey: `test/${ids.client}/shared.pdf`,
          mime: "application/pdf",
          size: 1024,
          clientId: made[0]._id,
          sharedWithClient: true,
          sharedAt: new Date(),
          createdBy: "test",
          updatedBy: "test",
        },
        {
          name: "Internal working papers.xlsx",
          fileKey: `test/${ids.client}/secret.xlsx`,
          mime: "application/vnd.ms-excel",
          size: 2048,
          clientId: made[0]._id,
          // never ticked: the whole point of the flag
          sharedWithClient: false,
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );
    ids.shared = String(documents[0]._id);
    ids.secret = String(documents[1]._id);

    const invoices = await Invoice.create(
      [
        {
          number: `PWP/26-27/0001`,
          type: "Tax invoice",
          status: "Sent",
          clientId: made[0]._id,
          branchId: branch._id,
          date: new Date(),
          billingName: fx.clientName,
          lines: [
            { description: "Audit fee", amountPaise: 5000000, gstRate: 18 },
          ],
          subtotalPaise: 5000000,
          totalPaise: 5900000,
          createdBy: "test",
          updatedBy: "test",
        },
        {
          type: "Tax invoice",
          status: "Draft",
          clientId: made[0]._id,
          branchId: branch._id,
          date: new Date(),
          billingName: fx.clientName,
          lines: [
            {
              description: "Not yet agreed",
              amountPaise: 9900000,
              gstRate: 18,
            },
          ],
          subtotalPaise: 9900000,
          totalPaise: 11682000,
          createdBy: "test",
          updatedBy: "test",
        },
        {
          number: `PWO/26-27/0001`,
          type: "Tax invoice",
          status: "Sent",
          clientId: made[1]._id,
          branchId: branch._id,
          date: new Date(),
          billingName: fx.otherName,
          lines: [
            {
              description: "Another client's fee",
              amountPaise: 100000,
              gstRate: 18,
            },
          ],
          subtotalPaise: 100000,
          totalPaise: 118000,
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );
    ids.issued = String(invoices[0]._id);
    ids.draft = String(invoices[1]._id);
    ids.otherInvoice = String(invoices[2]._id);
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

async function signIn(page, fx) {
  await page.goto("/client/login");
  await page.getByLabel("Email").fill(fx.portal);
  await page.getByLabel("Password").fill(PORTAL_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/client$/);
}

test("only the shared document is on the documents page", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx);

  await page.goto("/client/documents");
  await expect(page.getByText("Shared acknowledgement.pdf")).toBeVisible();
  await expect(page.getByText("Internal working papers.xlsx")).toHaveCount(0);

  // and guessing the unshared one's id gets nowhere
  const response = await page.request.get(`/client/documents/${ids.secret}`, {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(404);
});

test("a draft invoice is not a bill, and another client's is not theirs", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx);

  await page.goto("/client/invoices");
  await expect(page.getByText("PWP/26-27/0001")).toBeVisible();
  await expect(page.getByText("Not yet agreed")).toHaveCount(0);

  // the draft's own PDF, by id
  expect(
    (await page.request.get(`/client/invoices/${ids.draft}/pdf`)).status(),
  ).toBe(404);
  // and the other company's issued invoice
  expect(
    (
      await page.request.get(`/client/invoices/${ids.otherInvoice}/pdf`)
    ).status(),
  ).toBe(404);
  // their own one works
  const mine = await page.request.get(`/client/invoices/${ids.issued}/pdf`);
  expect(mine.status()).toBe(200);
  expect(mine.headers()["content-type"]).toContain("pdf");
});

test("the account page adds up to what the invoices say", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx);

  await page.goto("/client/ledger");
  // the issued invoice only: ₹59,000, with the draft nowhere in the balance
  await expect(page.getByText("59,000")).toBeVisible();
  await expect(page.getByText("1,16,820")).toHaveCount(0);
});

test("a change request reaches the firm and changes nothing", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx);

  await page.goto("/client/profile");
  // their own details, and nothing internal
  await expect(page.getByText("AAACP1234K")).toBeVisible();
  await expect(
    page.getByText(/Client partner|Relationship manager/),
  ).toHaveCount(0);

  await page
    .getByLabel("What needs changing?")
    .fill(
      "Our registered address changed in August. The new one is B-12, Sector 62.",
    );
  await page.getByRole("button", { name: "Send it to the firm" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Nothing has been changed",
  );

  const request = await Comment.findOne({
    clientId: ids.client,
    kind: "Change request",
  }).lean();
  expect(request).toBeTruthy();
  expect(request.internal).toBe(false);
  expect(request.body).toContain("Sector 62");

  // and the client record itself is untouched
  const client = await Client.findById(ids.client).lean();
  expect(client.addresses ?? []).toHaveLength(0);
});

import { test, expect } from "@playwright/test";
import { signIn } from "./signin.js";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import ServiceTemplate from "../../models/ServiceTemplate.js";
import Engagement from "../../models/Engagement.js";
import Invoice from "../../models/Invoice.js";
import Payment from "../../models/Payment.js";
import { hashPassword } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";
import { buildEngagement } from "../../lib/engagements/create.js";
import { periodFor } from "../../lib/engagements/period.js";

/**
 * The accounts desk performing its own decisions (P3-31, reversing D74).
 *
 * The point of the step is that the desk acts, so what is worth a browser
 * is each kind of action happening **from the desk** and landing on the
 * record: a draft issued and numbered, a waiver decided with both names on
 * it, a promise moved, and unapplied money going where the screen said it
 * would. The rules themselves are tested where they live — this proves the
 * desk is wired to them and not to a second copy.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";
const REASON = "Goodwill — the delay in filing was ours";

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    partner: `pw-desk-partner-${tag}@phmgindia.test`,
    branchCode: tag.startsWith("l") ? "DKL" : "DKP",
    clientName: `Playwright Desk ${tag} Private Limited`,
    code: `PWD${tag.slice(0, 5).toUpperCase()}`,
  };
}

const ids = {
  client: "",
  engagement: "",
  draft: "",
  stuck: "",
  issued: "",
  payment: "",
};

async function wipe(fx) {
  const client = await Client.findOne({ legalName: fx.clientName }, null, {
    withDeleted: true,
  });
  if (client) {
    await Payment.deleteMany({ clientId: client._id }, { withDeleted: true });
    await Invoice.deleteMany({ clientId: client._id }, { withDeleted: true });
    await Engagement.deleteMany(
      { clientId: client._id },
      { withDeleted: true },
    );
    await Client.deleteOne({ _id: client._id }, { withDeleted: true });
  }
  await ServiceTemplate.deleteMany({ code: fx.code }, { withDeleted: true });
  await User.deleteMany({ email: fx.partner });
  const branch = await Branch.findOne({ code: fx.branchCode }, null, {
    withDeleted: true,
  });
  if (branch) {
    await Invoice.deleteMany({ branchId: branch._id }, { withDeleted: true });
    await Payment.deleteMany({ branchId: branch._id }, { withDeleted: true });
    await Branch.deleteOne({ _id: branch._id }, { withDeleted: true });
  }
}

test.beforeAll(async ({}, testInfo) => {
  const fx = names(testInfo.project.name);
  await connectDB();
  await wipe(fx);

  await systemAudit(async (session) => {
    const [branch] = await Branch.create(
      [
        {
          code: fx.branchCode,
          name: `Playwright ${fx.branchCode}`,
          invoicePrefix: fx.branchCode,
          /* A real GSTIN, because an invoice cannot be issued without one
             and the refusal is tested separately below. */
          gstin: "09AABCS1429P1ZX",
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );

    const [partner] = await User.create(
      [
        {
          name: "Playwright Desk Partner",
          email: fx.partner,
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
          code: `PHMG-${fx.branchCode}-0001`,
          legalName: fx.clientName,
          entityType: "Private Limited",
          branchId: branch._id,
          status: "Active",
          gstins: [{ gstin: "09AABCS1429P1Z2", state: "Uttar Pradesh" }],
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );
    ids.client = String(client._id);

    const [service] = await ServiceTemplate.create(
      [
        {
          name: `Playwright desk TDS ${testInfo.project.name}`,
          code: fx.code,
          category: "Direct Tax",
          level: "L1",
          minExecRole: "intern",
          minReviewRole: "ca",
          recurrence: "quarterly",
          checklist: [],
          steps: [{ name: "Prepare the return" }],
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );

    /* Finished, unbilled, and a waiver asked for and not decided — the
       exact row the desk's waiver panel is a list of. */
    const [engagement] = await Engagement.create(
      [
        {
          ...buildEngagement({
            template: service,
            client,
            period: periodFor("quarterly", new Date()),
          }),
          code: `PWD-${service.code}`,
          status: "Completed",
          completedAt: new Date(),
          feePaise: 500_000,
          billingStatus: "Unbilled",
          assigneeId: partner._id,
          waiver: {
            reason: REASON,
            requestedBy: String(partner._id),
            requestedByName: "Playwright Desk Partner",
            requestedAt: new Date(),
          },
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );
    ids.engagement = String(engagement._id);

    /* One draft to issue, and one issued invoice with a promise that has
       gone by and a receipt sitting unapplied against the client. */
    const [draft, issued] = await Invoice.create(
      [
        {
          clientId: client._id,
          branchId: branch._id,
          type: "Tax invoice",
          status: "Draft",
          date: new Date(),
          dueDate: new Date(Date.now() + 15 * 86_400_000),
          placeOfSupply: "09",
          lines: [
            {
              description: "Desk draft",
              sac: "998221",
              amountPaise: 300_000,
              gstRate: 18,
              netPaise: 300_000,
              totalPaise: 354_000,
            },
          ],
          subtotalPaise: 300_000,
          totalPaise: 354_000,
          createdBy: "test",
          updatedBy: "test",
        },
        {
          clientId: client._id,
          branchId: branch._id,
          type: "Tax invoice",
          status: "Sent",
          number: `${fx.branchCode}/26-27/0099`,
          date: new Date(Date.now() - 40 * 86_400_000),
          dueDate: new Date(Date.now() - 25 * 86_400_000),
          issuedAt: new Date(Date.now() - 40 * 86_400_000),
          lines: [
            {
              description: "Desk issued",
              amountPaise: 200_000,
              netPaise: 200_000,
              totalPaise: 200_000,
            },
          ],
          subtotalPaise: 200_000,
          totalPaise: 200_000,
          promise: {
            date: new Date(Date.now() - 3 * 86_400_000),
            note: "Said they would pay on Monday",
            byName: "Playwright Desk Partner",
            at: new Date(),
          },
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );
    ids.draft = String(draft._id);
    ids.issued = String(issued._id);

    /* A draft that cannot be issued, so the desk's refusal can be read.
       No SAC on the line, which is the commonest real reason and the one
       the firm will meet first. */
    const [stuck] = await Invoice.create(
      [
        {
          clientId: client._id,
          branchId: branch._id,
          type: "Tax invoice",
          status: "Draft",
          date: new Date(),
          dueDate: new Date(Date.now() + 15 * 86_400_000),
          placeOfSupply: "09",
          lines: [
            {
              description: "Desk draft with no SAC",
              amountPaise: 110_000,
              netPaise: 110_000,
              totalPaise: 110_000,
            },
          ],
          subtotalPaise: 110_000,
          totalPaise: 110_000,
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );
    ids.stuck = String(stuck._id);

    const [payment] = await Payment.create(
      [
        {
          clientId: client._id,
          branchId: branch._id,
          date: new Date(),
          amountPaise: 150_000,
          mode: "Bank transfer",
          reference: "PWDESK-1",
          allocations: [],
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );
    ids.payment = String(payment._id);
  });
});

test.afterAll(async ({}, testInfo) => {
  await wipe(names(testInfo.project.name));
  /** The connection is left open on purpose — see the other specs. */
});

/** The section that holds a given heading. */
const panel = (page, heading) =>
  page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: heading }) });

test("a draft is issued from the desk and gets its number", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto("/billing/desk");

  await expect(
    page.getByRole("heading", { name: "Accounts desk" }),
  ).toBeVisible();

  const drafts = panel(page, "Drafts not issued");
  /* Two drafts for the same client sit here — this one and the one with
     no SAC that the refusal test uses — so the row is found by its
     amount, which is the only thing that tells them apart. */
  const row = drafts.getByRole("listitem").filter({ hasText: "₹3,540" });
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Issue" }).click();

  /* The number comes off the branch's gapless series, so the proof is on
     the record and not in a message. */
  await expect
    .poll(async () => {
      const invoice = await Invoice.findById(ids.draft).lean();
      return invoice.status;
    })
    .not.toBe("Draft");

  const issued = await Invoice.findById(ids.draft).lean();
  expect(issued.number).toContain(fx.branchCode);
  expect(issued.issuedAt).toBeTruthy();

  /* And it has left the panel it was in. */
  await expect(
    panel(page, "Drafts not issued")
      .getByRole("listitem")
      .filter({ hasText: "₹3,540" }),
  ).toHaveCount(0);
});

test("a fee waiver is decided from the desk, with both names on it", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto("/billing/desk");

  const waivers = panel(page, /Fee waivers/);
  await expect(waivers).toContainText(REASON);

  await waivers.getByRole("button", { name: "Approve the waiver" }).click();
  await expect(page.getByText(/Fee waived/)).toBeVisible();

  const waived = await Engagement.findById(ids.engagement).lean();
  expect(waived.scope).toBe("waived");
  expect(waived.scopeReason).toBe(REASON);
  expect(waived.waiver.requestedByName).toBe("Playwright Desk Partner");
  expect(waived.waiver.approvedByName).toBe("Playwright Desk Partner");
});

test("a promise is moved from the desk and the reminders pause again", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto("/billing/desk");

  const promises = panel(page, "Promises that have come round");
  await expect(promises).toContainText("Said they would pay on Monday");

  await promises
    .getByRole("button", { name: /They said again|Change/ })
    .click();

  const nextWeek = new Date(Date.now() + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  await page.getByLabel("The new date they gave").fill(nextWeek);
  await page.getByLabel("What they said").fill("Promised again, Friday");
  await page.getByRole("button", { name: "Record it" }).click();

  await expect
    .poll(async () => {
      const invoice = await Invoice.findById(ids.issued).lean();
      return invoice.promise?.note;
    })
    .toBe("Promised again, Friday");
});

test("unapplied money goes where the desk said it would", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto("/billing/desk");

  const money = panel(page, "Money to apply");
  await expect(money).toContainText(fx.clientName.slice(0, 24));
  /* ₹1,500 against a ₹2,000 invoice: the whole receipt goes on it, and the
     screen says so before anything is pressed. */
  await expect(money).toContainText(`${fx.branchCode}/26-27/0099`);

  await money.getByRole("button", { name: "Apply as shown" }).click();

  await expect
    .poll(async () => {
      const payment = await Payment.findById(ids.payment).lean();
      return (payment.allocations ?? []).reduce(
        (sum, a) => sum + (a.amountPaise ?? 0),
        0,
      );
    })
    .toBe(150_000);

  const invoice = await Invoice.findById(ids.issued).lean();
  expect(invoice.paidPaise).toBe(150_000);
  expect(invoice.status).toBe("Partially paid");
});

test("an accounts person is offered the decisions, and a partner's are refused with the reason", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto("/billing/desk");

  /* The two things the desk deliberately still does not do say so, rather
     than leaving somebody looking for a button that is not there. */
  await expect(
    page.getByRole("heading", { name: /still does not do/ }),
  ).toBeVisible();
  await expect(page.getByText(/There is no .remind now/)).toBeVisible();
});

test("a draft that cannot be issued says why, on the desk", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto("/billing/desk");

  const drafts = panel(page, "Drafts not issued");
  const row = drafts
    .getByRole("listitem")
    .filter({ hasText: "₹1,100" })
    .first();
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Issue" }).click();

  /**
   * The reason, not a silent failure. This is the refusal the firm will
   * meet first — its own branches have no GSTIN entered yet, and a SAC is
   * missing on several services — so the desk has to say so rather than
   * look broken.
   */
  await expect(page.getByText(/SAC code/)).toBeVisible();

  const still = await Invoice.findById(ids.stuck).lean();
  expect(still.status).toBe("Draft");
  expect(still.number ?? null).toBeNull();
});

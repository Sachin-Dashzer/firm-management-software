import { test, expect } from "@playwright/test";
import { TOTP, Secret } from "otpauth";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import ClientService from "../../models/ClientService.js";
import ServiceTemplate from "../../models/ServiceTemplate.js";
import Engagement from "../../models/Engagement.js";
import Invoice from "../../models/Invoice.js";
import { hashPassword, decryptField } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";
import { buildEngagement } from "../../lib/engagements/create.js";
import { parsePeriod } from "../../lib/engagements/period.js";
import { financialYearStart } from "../../lib/dates.js";

/**
 * The Client 360: the counts on the dividers, the outstanding balance in the
 * header, and the Compliance tab showing a month nobody filed.
 *
 * The fixture is deliberately a client with **a hole in the middle of the
 * year** — April and June filed, May never created — because that absence is
 * the whole reason the grid exists and it cannot be seen in any list.
 *
 * Skipped until Atlas is configured, like the other suites.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";
const FY = financialYearStart(new Date());

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    partner: `pw-360-partner-${tag}@phmgindia.test`,
    staff: `pw-360-staff-${tag}@phmgindia.test`,
    serviceCode: `PW3-${tag.slice(0, 6).toUpperCase()}`,
    clientName: `Playwright Threesixty ${tag} Private Limited`,
  };
}

const ids = { client: "" };

async function wipe(fx) {
  const client = await Client.findOne({ legalName: fx.clientName }, null, {
    withDeleted: true,
  });
  if (client) {
    await Engagement.deleteMany(
      { clientId: client._id },
      { withDeleted: true },
    );
    await Invoice.deleteMany({ clientId: client._id }, { withDeleted: true });
    await ClientService.deleteMany(
      { clientId: client._id },
      { withDeleted: true },
    );
    await Client.deleteOne({ _id: client._id }, { withDeleted: true });
  }
  await ServiceTemplate.deleteMany(
    { code: fx.serviceCode },
    { withDeleted: true },
  );
  await User.deleteMany({ email: { $in: [fx.partner, fx.staff] } });
}

test.beforeAll(async ({}, testInfo) => {
  const fx = names(testInfo.project.name);
  await connectDB();
  await wipe(fx);

  await systemAudit(async (session) => {
    const branch = await Branch.findOneAndUpdate(
      { code: "NOI" },
      { $setOnInsert: { name: "Noida (head office)", invoicePrefix: "NOI" } },
      { returnDocument: "after", upsert: true, session },
    );

    const [boss, maker] = await User.create(
      [
        {
          name: "Playwright 360 Partner",
          email: fx.partner,
          role: "partner",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
        {
          name: "Playwright 360 Employee",
          email: fx.staff,
          role: "employee",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
      ],
      { session },
    );

    const [client] = await Client.create(
      [
        {
          code: `PHMG-NOI-7${testInfo.project.name.length}00`,
          legalName: fx.clientName,
          entityType: "Private Limited",
          branchId: branch._id,
          status: "Active",
          clientPartnerId: boss._id,
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
    );
    ids.client = String(client._id);

    const [service] = await ServiceTemplate.create(
      [
        {
          name: `Playwright monthly ${testInfo.project.name}`,
          code: fx.serviceCode,
          category: "Indirect Tax",
          level: "L1",
          minExecRole: "intern",
          minReviewRole: "ca",
          recurrence: "monthly",
          turnaroundDays: 5,
          checklist: [],
          steps: [{ name: "File it" }],
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
    );

    await ClientService.create(
      [
        {
          clientId: client._id,
          serviceTemplateId: service._id,
          feePaise: 500000,
          startPeriod: `${FY}-04`,
          defaultAssigneeId: maker._id,
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
    );

    // April and June filed; May was never created — the hole the grid is for
    for (const [month, status] of [
      ["04", "Completed"],
      ["06", "In progress"],
    ]) {
      const fields = buildEngagement({
        template: service.toObject(),
        client,
        period: parsePeriod(`${FY}-${month}`),
        assigneeId: maker._id,
      });
      await Engagement.create(
        [
          {
            ...fields,
            code: `PW3-${fx.serviceCode}-${month}`,
            status,
            createdBy: "test",
            updatedBy: "test",
          },
        ],
        { session },
      );
    }

    // one bill, long past its due date, so the header has something to say
    await Invoice.create(
      [
        {
          clientId: client._id,
          branchId: branch._id,
          type: "Tax invoice",
          number: `PW3/${testInfo.project.name.length}/001`,
          status: "Sent",
          date: new Date(`${FY}-05-01T06:00:00.000Z`),
          dueDate: new Date(`${FY}-05-31T06:00:00.000Z`),
          placeOfSupply: "09-Uttar Pradesh",
          lines: [
            {
              description: "Monthly filing",
              sac: "998221",
              amountPaise: 500000,
              gstRate: 18,
            },
          ],
          subtotalPaise: 500000,
          cgstPaise: 45000,
          sgstPaise: 45000,
          igstPaise: 0,
          totalPaise: 590000,
          paidPaise: 0,
          tdsCreditedPaise: 0,
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
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

async function signIn(page, email) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("6-digit code").waitFor();

  const user = await User.findOne({ email }).select("+totpSecret");
  /**
   * An authenticator shows one code per 30 seconds, and the app refuses a
   * code it has already accepted — replay protection, working as spec §16
   * asks. A suite that signs in a dozen times inside one window hits it
   * every time, so the counter is cleared to stand for time having
   * passed. The rule itself is tested in tests/security.test.js.
   */
  await User.updateOne({ email }, { $set: { lastTotpCounter: 0 } });
  const code = new TOTP({
    issuer: "PHMG & Associates",
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(decryptField(user.totpSecret)),
  }).generate();

  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: /Sign in|Turn on 2FA/ }).click();
  await expect(page).toHaveURL(/\/issues$/);
}

test("the header says what is owed and how much of it is late", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto(`/clients/${ids.client}`);

  await expect(page.getByText("Outstanding")).toBeVisible();
  await expect(page.getByRole("link", { name: /5,900/ })).toBeVisible();
  // the bill fell due in May, so all of it is overdue by now
  await expect(page.getByText(/overdue since/)).toBeVisible();
});

test("a divider's count matches the rows behind it", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto(`/clients/${ids.client}`);

  // one open engagement (June); April is completed and so nobody's problem
  const tab = page.getByRole("link", { name: /^Engagements/ });
  await expect(tab).toContainText("1");

  await tab.click();
  await expect(page.getByRole("link", { name: /PW3-/ })).toHaveCount(2);

  // one unpaid bill
  await expect(page.getByRole("link", { name: /^Invoices/ })).toContainText(
    "1",
  );
});

test("the Compliance tab shows the month nobody filed", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  await page.goto(`/clients/${ids.client}?tab=compliance`);

  await expect(
    page.getByRole("heading", { name: /^Compliance for/ }),
  ).toBeVisible();
  await expect(page.getByText("Monthly").first()).toBeVisible();

  // April filed, May a hole, June in hand
  const may = page.getByLabel(new RegExp(`${FY}-05: No engagement`));
  await expect(may).toBeVisible();
  await expect(
    page.getByLabel(new RegExp(`${FY}-04: Completed`)),
  ).toBeVisible();

  // and the hole is counted, not only coloured
  await expect(page.getByText(/no work against/)).toBeVisible();
});

test("somebody who only sees their own work gets no grid", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.staff);
  await page.goto(`/clients/${ids.client}?tab=compliance`);

  // they are on the work, so the file opens — but a partial grid would show
  // holes that are not real ones
  await expect(page.getByText(/gaps that are not real/)).toBeVisible();
  await expect(page.getByText("Outstanding")).toHaveCount(0);
});

import { test, expect } from "@playwright/test";
import { alertBox } from "./alerts.js";
import { TOTP, Secret } from "otpauth";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import ServiceTemplate from "../../models/ServiceTemplate.js";
import Engagement from "../../models/Engagement.js";
import { hashPassword, decryptField } from "../../lib/crypto.js";
import { formatISTDate } from "../../lib/dates.js";
import { systemAudit } from "../../lib/audit/system.js";

/**
 * One engagement from creation to completion, through the review gate and
 * back again for rework — the flow spec section 5 is built around.
 *
 * Each browser project gets its own client, service and people, so the two
 * runs cannot tread on each other. Skipped until Atlas is configured.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";

/** Fixture names, unique per project so laptop and phone runs stay apart. */
function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    partner: `pw-eng-partner-${tag}@phmgindia.test`,
    ca: `pw-eng-ca-${tag}@phmgindia.test`,
    staff: `pw-eng-staff-${tag}@phmgindia.test`,
    serviceCode: `PWE-${tag.slice(0, 6).toUpperCase()}`,
    clientName: `Playwright Works ${tag} Private Limited`,
  };
}

async function wipe(fx) {
  const client = await Client.findOne({ legalName: fx.clientName }, null, {
    withDeleted: true,
  });
  if (client) {
    await Engagement.deleteMany(
      { clientId: client._id },
      { withDeleted: true },
    );
    await Client.deleteOne({ _id: client._id }, { withDeleted: true });
  }
  await ServiceTemplate.deleteMany(
    { code: fx.serviceCode },
    { withDeleted: true },
  );
  await User.deleteMany({
    email: { $in: [fx.partner, fx.ca, fx.staff] },
  });
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

    await User.create(
      [
        {
          name: "Playwright Partner",
          email: fx.partner,
          role: "partner",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
        {
          name: "Playwright Reviewer",
          email: fx.ca,
          role: "ca",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
        {
          name: "Playwright Maker",
          email: fx.staff,
          role: "employee",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
      ],
      { session },
    );

    await Client.create(
      [
        {
          code: `PHMG-NOI-9${testInfo.project.name.length}00`,
          legalName: fx.clientName,
          entityType: "Private Limited",
          branchId: branch._id,
          status: "Active",
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
    );

    await ServiceTemplate.create(
      [
        {
          name: `Playwright monthly filing ${testInfo.project.name}`,
          code: fx.serviceCode,
          category: "Indirect Tax",
          level: "L1",
          minExecRole: "intern",
          minReviewRole: "ca",
          recurrence: "monthly",
          turnaroundDays: 5,
          checklist: [
            { name: "Sales register", side: "client", mandatory: true },
            { name: "Filed acknowledgement", side: "firm", mandatory: true },
          ],
          steps: [{ name: "Collect data" }, { name: "File" }],
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

async function signOut(page) {
  await page.getByRole("button", { name: "Your profile" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
}

test("an engagement goes out for review, comes back, and is completed", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);

  // --- a partner creates it ------------------------------------------------
  await signIn(page, fx.partner);
  await page.goto("/engagements/new");
  await page.getByLabel("Client").selectOption({ label: /Playwright Works/ });
  await page
    .getByLabel("Service")
    .selectOption({ label: new RegExp(fx.serviceCode) });
  await page
    .getByLabel("Doing the work")
    .selectOption({ label: "Playwright Maker" });
  await page
    .getByLabel("Reviewing")
    .selectOption({ label: "Playwright Reviewer" });

  // the target date is prefilled from the service's turnaround, and the date
  // shown is the IST day — not the UTC day before it
  const dueBox = page.getByLabel("Internal due date");
  await expect(dueBox).not.toHaveValue("");
  await dueBox.fill("2027-01-29");

  await page.getByRole("button", { name: "Create engagement" }).click();

  await expect(page).toHaveURL(/\/engagements\/[a-f0-9]{24}/);
  const url = page.url();
  const stored = await Engagement.findOne({ code: /-/ }).sort({
    createdAt: -1,
  });
  expect(stored.status).toBe("Scheduled");
  // the template is copied in, not referred to
  expect(stored.templateSnapshot.code).toBe(fx.serviceCode);
  expect(stored.tasks).toHaveLength(2);
  expect(stored.statutoryDue).toBeNull();
  // the date typed on the form is the target, and it survives as that IST day
  expect(formatISTDate(stored.internalDue)).toBe("29-01-2027");
  await expect(page.getByText("Internal 29-01-2027")).toBeVisible();
  await signOut(page);

  // --- the maker does the work --------------------------------------------
  await signIn(page, fx.staff);
  await page.goto(url);
  await page.getByRole("button", { name: "In progress" }).click();
  await expect(page.getByText("Moved to In progress")).toBeVisible();

  await page.getByLabel("Collect data").check();
  await page.getByLabel("Sales register status").selectOption("Verified");
  await page
    .getByLabel("Filed acknowledgement status")
    .selectOption("Verified");
  await page.getByRole("button", { name: "Under review" }).click();
  await expect(page.getByText("Moved to Under review")).toBeVisible();

  // the work has left their hands
  await expect(page.getByLabel("Sales register status")).toBeDisabled();
  await signOut(page);

  // --- the reviewer sends it back -----------------------------------------
  await signIn(page, fx.ca);
  await page.goto(url);
  await page.getByRole("button", { name: "Send back for rework" }).click();
  await page
    .getByLabel("What needs redoing?")
    .fill("October figures do not tie to the sales register.");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Sent back for rework")).toBeVisible();

  const reworked = await Engagement.findById(stored._id);
  expect(reworked.status).toBe("In progress");
  expect(reworked.reworkCount).toBe(1);
  // the reason is on the thread, where the maker will read it
  await expect(page.getByText(/October figures do not tie/)).toBeVisible();
  await signOut(page);

  // --- round two, then signed off -----------------------------------------
  await signIn(page, fx.staff);
  await page.goto(url);
  await page.getByRole("button", { name: "Under review" }).click();
  await expect(page.getByText("Moved to Under review")).toBeVisible();
  await signOut(page);

  await signIn(page, fx.ca);
  await page.goto(url);

  // completing before the review checklist is ticked is refused
  await page.getByRole("button", { name: "Completed" }).click();
  await expect(alertBox(page)).toContainText("every review point");

  for (const item of await page
    .getByRole("checkbox", { checked: false })
    .all()) {
    if (await item.isEnabled()) await item.check();
  }
  await page.getByRole("button", { name: "Completed" }).click();
  await expect(page.getByText("Moved to Completed")).toBeVisible();

  const done = await Engagement.findById(stored._id);
  expect(done.status).toBe("Completed");
  expect(done.completedAt).toBeTruthy();
  // and it is locked
  await expect(page.getByText(/Completed and locked/)).toBeVisible();
});

test("the person who did the work cannot sign it off", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);

  // a CA who is also the assignee: senior enough, but still the maker
  const ca = await User.findOne({ email: fx.ca });
  const client = await Client.findOne({ legalName: fx.clientName });
  const template = await ServiceTemplate.findOne({ code: fx.serviceCode });

  const engagement = await systemAudit(async (session) => {
    const [doc] = await Engagement.create(
      [
        {
          code: `NOI-${fx.serviceCode}-2026-09-9999`,
          clientId: client._id,
          serviceTemplateId: template._id,
          branchId: client.branchId,
          period: "2026-09",
          periodLabel: "Sep 2026",
          status: "Under review",
          assigneeId: ca._id,
          reviewerId: ca._id,
          templateSnapshot: { name: template.name, code: template.code },
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
    );
    return doc;
  });

  await signIn(page, fx.ca);
  await page.goto(`/engagements/${engagement._id}`);

  // the button is not offered, and the server refuses it too
  await expect(page.getByRole("button", { name: "Completed" })).toHaveCount(0);

  await Engagement.deleteOne({ _id: engagement._id }, { withDeleted: true });
});

test("filters, the board, the calendar and a bulk action", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);

  const [ca, staff, client, template] = await Promise.all([
    User.findOne({ email: fx.ca }),
    User.findOne({ email: fx.staff }),
    Client.findOne({ legalName: fx.clientName }),
    ServiceTemplate.findOne({ code: fx.serviceCode }),
  ]);

  // two jobs in different periods, one urgent
  const made = await systemAudit(async (session) =>
    Engagement.create(
      [
        {
          code: `NOI-${fx.serviceCode}-2026-07-9001`,
          clientId: client._id,
          serviceTemplateId: template._id,
          branchId: client.branchId,
          period: "2026-07",
          periodLabel: "Jul 2026",
          status: "In progress",
          priority: "Urgent",
          assigneeId: staff._id,
          reviewerId: ca._id,
          internalDue: new Date("2026-07-20T00:00:00+05:30"),
          templateSnapshot: { name: template.name, code: template.code },
          createdBy: "test",
          updatedBy: "test",
        },
        {
          code: `NOI-${fx.serviceCode}-2026-08-9002`,
          clientId: client._id,
          serviceTemplateId: template._id,
          branchId: client.branchId,
          period: "2026-08",
          periodLabel: "Aug 2026",
          status: "Awaiting documents",
          assigneeId: staff._id,
          reviewerId: ca._id,
          internalDue: new Date("2026-08-20T00:00:00+05:30"),
          templateSnapshot: { name: template.name, code: template.code },
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session },
    ),
  );

  await signIn(page, fx.partner);

  // --- the list filters ----------------------------------------------------
  await page.goto("/engagements?period=2026-07");
  await expect(
    page.getByText(`NOI-${fx.serviceCode}-2026-07-9001`),
  ).toBeVisible();
  await expect(
    page.getByText(`NOI-${fx.serviceCode}-2026-08-9002`),
  ).toHaveCount(0);

  await page.goto("/engagements?priority=Urgent");
  await expect(
    page.getByText(`NOI-${fx.serviceCode}-2026-07-9001`),
  ).toBeVisible();

  // both are in the past, so both are overdue
  await page.goto("/engagements?due=overdue&q=Playwright+Works");
  await expect(page.getByText(/days overdue/).first()).toBeVisible();

  // --- the board -----------------------------------------------------------
  await page.goto("/engagements?view=board&q=Playwright+Works");
  const inProgress = page.getByRole("region", { name: "In progress" });
  await expect(inProgress.getByText(/Playwright Works/)).toBeVisible();

  // --- the calendar --------------------------------------------------------
  await page.goto("/engagements?view=calendar&q=Playwright+Works");
  await expect(page.getByRole("button", { name: /Previous/ })).toBeVisible();

  // --- a bulk action -------------------------------------------------------
  await page.goto("/engagements?q=Playwright+Works");
  await page.getByLabel(`Select NOI-${fx.serviceCode}-2026-07-9001`).check();
  await page.getByLabel(`Select NOI-${fx.serviceCode}-2026-08-9002`).check();
  await expect(page.getByText("2 selected")).toBeVisible();

  await page
    .getByRole("region", { name: "Bulk actions" })
    .getByLabel("Priority")
    .selectOption("High");
  await expect(page.getByText("2 of 2 set to High")).toBeVisible();

  for (const doc of made) {
    expect((await Engagement.findById(doc._id)).priority).toBe("High");
  }

  // a bulk move that some rows cannot make reports the ones it skipped
  await page.getByLabel(`Select NOI-${fx.serviceCode}-2026-07-9001`).check();
  await page.getByLabel(`Select NOI-${fx.serviceCode}-2026-08-9002`).check();
  await page
    .getByRole("region", { name: "Bulk actions" })
    .getByLabel("Move to")
    .selectOption("Under review");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText(/1 of 2 moved to Under review/)).toBeVisible();
  await expect(page.getByText(/cannot go straight to/)).toBeVisible();

  await Engagement.deleteMany(
    { _id: { $in: made.map((d) => d._id) } },
    { withDeleted: true },
  );
});

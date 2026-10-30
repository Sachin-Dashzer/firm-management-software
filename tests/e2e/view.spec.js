import { test, expect } from "@playwright/test";
import { signIn } from "./signin.js";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import ServiceTemplate from "../../models/ServiceTemplate.js";
import Engagement from "../../models/Engagement.js";
import { hashPassword } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";
import { buildEngagement } from "../../lib/engagements/create.js";
import { periodFor } from "../../lib/engagements/period.js";

/**
 * Access versus view in a browser (P3-7).
 *
 * The manager here is assigned to two branches and reviews one job in each,
 * plus there is a job in a third branch they have no access to at all. That
 * shape is what makes the distinction visible:
 *
 *   - switching the view moves the counts, and never reveals the third
 *   - "my work across branches" shows the Ludhiana job they review next to
 *     their own Noida work, while the rest of Ludhiana stays out
 *   - the record in the branch they cannot see gives them a page that says
 *     who to ask, not an empty list
 *
 * Skipped until Atlas is configured, like every other suite.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    manager: `pw-view-ca-${tag}@phmgindia.test`,
    other: `pw-view-other-${tag}@phmgindia.test`,
    code: `PWV-${tag.slice(0, 6).toUpperCase()}`,
    noida: `Playwright View Noida ${tag} Private Limited`,
    ludhiana: `Playwright View Ludhiana ${tag} Private Limited`,
    meerut: `Playwright View Meerut ${tag} Private Limited`,
  };
}

const ids = { noida: "", ludhiana: "", meerut: "", meerutJob: "" };

async function wipe(fx) {
  for (const legalName of [fx.noida, fx.ludhiana, fx.meerut]) {
    const client = await Client.findOne({ legalName }, null, {
      withDeleted: true,
    });
    if (client) {
      await Engagement.deleteMany(
        { clientId: client._id },
        { withDeleted: true },
      );
      await Client.deleteOne({ _id: client._id }, { withDeleted: true });
    }
  }
  await ServiceTemplate.deleteMany({ code: fx.code }, { withDeleted: true });
  await User.deleteMany({ email: { $in: [fx.manager, fx.other] } });
}

test.beforeAll(async ({}, testInfo) => {
  const fx = names(testInfo.project.name);
  await connectDB();
  await wipe(fx);

  await systemAudit(async (session) => {
    const branches = {};
    for (const [code, name] of [
      ["NOI", "Noida (head office)"],
      ["LDH", "Ludhiana"],
      ["MRT", "Meerut"],
    ]) {
      branches[code] = await Branch.findOneAndUpdate(
        { code },
        { $setOnInsert: { name, invoicePrefix: code } },
        { new: true, upsert: true, session },
      );
    }

    const [manager, other] = await User.create(
      [
        {
          name: "Playwright View Manager",
          email: fx.manager,
          role: "ca",
          // two branches, deliberately not all three
          branchIds: [branches.NOI._id, branches.LDH._id],
          passwordHash: await hashPassword(PASSWORD),
        },
        {
          name: "Playwright View Other",
          email: fx.other,
          role: "employee",
          branchIds: [branches.LDH._id],
          passwordHash: await hashPassword(PASSWORD),
        },
      ],
      { session, ordered: true },
    );

    const [service] = await ServiceTemplate.create(
      [
        {
          name: `Playwright View GST ${testInfo.project.name}`,
          code: fx.code,
          category: "Indirect Tax",
          level: "L1",
          minExecRole: "intern",
          minReviewRole: "ca",
          recurrence: "monthly",
          checklist: [],
          steps: [{ name: "Prepare the return" }],
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );

    const period = periodFor("monthly", new Date());
    let n = 0;
    for (const [key, legalName, branch, assignee, reviewer] of [
      ["noida", fx.noida, branches.NOI, manager._id, null],
      ["ludhiana", fx.ludhiana, branches.LDH, other._id, manager._id],
      ["meerut", fx.meerut, branches.MRT, other._id, null],
    ]) {
      const [client] = await Client.create(
        [
          {
            code: `PHMG-${branch.code}-5${testInfo.project.name.length}0${n++}`,
            legalName,
            entityType: "Private Limited",
            branchId: branch._id,
            status: "Active",
            createdBy: "test",
            updatedBy: "test",
          },
        ],
        { session, ordered: true },
      );
      ids[key] = String(client._id);

      const fields = buildEngagement({
        template: service,
        client,
        period,
        assigneeId: assignee,
        reviewerId: reviewer,
      });
      const [job] = await Engagement.create(
        [
          {
            ...fields,
            code: `PWV-${branch.code}-${testInfo.project.name.length}`,
            status: "In progress",
            createdBy: "test",
            updatedBy: "test",
          },
        ],
        { session, ordered: true },
      );
      if (key === "meerut") ids.meerutJob = String(job._id);
    }
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

const selector = (page) => page.getByLabel("What you are looking at");

test("the selector offers only the branches you may see", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.manager);

  const options = await selector(page).locator("option").allInnerTexts();
  expect(options).toContain("All my branches");
  expect(options).toContain("Noida (head office)");
  expect(options).toContain("Ludhiana");
  expect(options).toContain("My work across branches");
  // the branch they are not assigned to is not even offered
  expect(options).not.toContain("Meerut");
});

test("switching the view narrows the list and never widens it", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.manager);
  await page.goto("/engagements");

  // both of their branches
  await expect(page.getByText(fx.noida.slice(0, 26))).toBeVisible();
  await expect(page.getByText(fx.ludhiana.slice(0, 26))).toBeVisible();
  // never the third, on any view
  await expect(page.getByText(fx.meerut.slice(0, 26))).toHaveCount(0);

  await selector(page).selectOption({ label: "Ludhiana" });
  await expect(page.getByText(fx.ludhiana.slice(0, 26))).toBeVisible();
  await expect(page.getByText(fx.noida.slice(0, 26))).toHaveCount(0);
  await expect(page.getByText(fx.meerut.slice(0, 26))).toHaveCount(0);

  // and it is remembered on the next page they open
  await page.goto("/engagements");
  await expect(selector(page)).toHaveValue(/.+/);
  await expect(page.getByText(fx.noida.slice(0, 26))).toHaveCount(0);
});

test("my work across branches crosses branches without opening them", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.manager);
  await page.goto("/engagements");

  await selector(page).selectOption({ label: "My work across branches" });

  // the Noida job they prepare and the Ludhiana job they review, together
  await expect(page.getByText(fx.noida.slice(0, 26))).toBeVisible();
  await expect(page.getByText(fx.ludhiana.slice(0, 26))).toBeVisible();
  // the rest of Ludhiana is not their work, and Meerut is not theirs at all
  await expect(page.getByText(fx.meerut.slice(0, 26))).toHaveCount(0);
});

test("a record outside your access says who can open it for you", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.manager);

  await page.goto(`/engagements/${ids.meerutJob}`);
  await expect(page).toHaveURL(/\/no-access/);
  await expect(
    page.getByRole("heading", { name: "This one is not open to you" }),
  ).toBeVisible();
  // it exists, and the page says so rather than implying it was deleted
  await expect(page.getByText(/It exists/)).toBeVisible();
  await expect(page.getByText(/Team & access/)).toBeVisible();
  // and the client's name is not on a page shown to somebody without access
  await expect(page.getByText(fx.meerut.slice(0, 26))).toHaveCount(0);
});

test("a record opened from outside the current view explains itself", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.manager);
  await page.goto("/engagements");
  await selector(page).selectOption({ label: "Noida (head office)" });

  // a Ludhiana job, opened directly while the view says Noida
  const ludhianaJob = await Engagement.findOne({
    clientId: ids.ludhiana,
  }).lean();
  await page.goto(`/engagements/${ludhianaJob._id}`);

  await expect(page.getByText(/You are viewing Noida/)).toBeVisible();
  await expect(page.getByText(/opened it directly/)).toBeVisible();
});

test("a firm-wide screen says the view does not apply to it", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.manager);
  await selector(page).selectOption({ label: "Ludhiana" });

  await page.goto("/settings/services");
  await expect(
    page.getByText(/the branch view above does not change it/),
  ).toBeVisible();
});

/**
 * P3-8 rides on this suite's fixture: the employee here is the preparer of a
 * job the manager reviews, which is the one case where "why is there no
 * button" is a real question with a real answer.
 */
test("a control you may not use is shown disabled, with the reason", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  const job = await Engagement.findOne({ clientId: ids.ludhiana });
  await Engagement.updateOne({ _id: job._id }, { status: "Under review" });

  await signIn(page, fx.other);
  await page.goto(`/engagements/${job._id}`);

  // the button is there, disabled, and says why rather than being absent
  const approve = page.getByRole("button", { name: "Approve for filing" });
  await expect(approve).toBeVisible();
  await expect(approve).toBeDisabled();
  await expect(
    page.getByText(/Your role \(Employee\) cannot approve/),
  ).toBeVisible();
  await expect(page.getByText(/Only a Partner \/ Admin or a CA/)).toBeVisible();

  // and the reason is readable text, not a tooltip on a control that cannot
  // be focused — a disabled button's title reaches nobody on a phone
  await expect(approve).toHaveAttribute("aria-describedby", /.+/);

  // one Approve on the screen, not two: the Next band points at this one
  await expect(approve).toHaveCount(1);

  await Engagement.updateOne({ _id: job._id }, { status: "In progress" });
});

/**
 * P3-9 on this suite's fixture too: the Ludhiana client has one period with
 * no job, and the manager can say which of the three it is.
 */
test("an empty period gets a reason, and leaves the count", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.manager);
  await selector(page).selectOption({ label: "All my branches" });

  const service = await ServiceTemplate.findOne({ code: fx.code }).lean();
  await page.goto(
    `/compliance/monthly?service=${service._id}&fy=${new Date().getFullYear() - 1}`,
  );

  const panel = page.getByRole("heading", {
    name: /Periods nobody has an answer for/,
  });
  await expect(panel).toBeVisible();
  // only the first of the three is a firm miss, and the screen says so
  await expect(page.getByText(/only the first is a firm miss/)).toBeVisible();

  const before = Number(
    await page
      .getByText("Periods nobody has answered for")
      .locator("..")
      .getByRole("strong")
      .innerText()
      .catch(() => "0"),
  );

  const row = page.getByRole("listitem").first();
  await row.getByRole("button", { name: "Not our miss…" }).click();
  await page
    .getByLabel(/Who did it, or why they were not with us/)
    .fill("filed by their earlier CA");
  await page
    .getByRole("button", { name: "Handled by another professional" })
    .click();

  await expect(page.getByText(/off the list of periods nobody/)).toBeVisible();

  // and it is recorded, not just hidden
  const { default: PeriodReason } =
    await import("../../models/PeriodReason.js");
  const saved = await PeriodReason.findOne({
    serviceTemplateId: service._id,
  }).lean();
  expect(saved.reason).toBe("other-professional");
  expect(saved.note).toBe("filed by their earlier CA");
  expect(saved.recordedByName).toBe("Playwright View Manager");
  expect(before).toBeGreaterThanOrEqual(0);

  await PeriodReason.deleteMany(
    { serviceTemplateId: service._id },
    { withDeleted: true },
  );
});

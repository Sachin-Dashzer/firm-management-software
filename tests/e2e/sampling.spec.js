import { test, expect } from "@playwright/test";
import { signIn } from "./signin.js";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import ServiceTemplate from "../../models/ServiceTemplate.js";
import Engagement from "../../models/Engagement.js";
import AuditFile from "../../models/AuditFile.js";
import Sample from "../../models/Sample.js";
import { hashPassword } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";
import { buildEngagement } from "../../lib/engagements/create.js";
import { periodFor } from "../../lib/engagements/period.js";
import { buildAuditAreas } from "../../lib/audit-studio/standards.js";

/**
 * Sampling and vouching (P3-30, SA 530).
 *
 * Four things worth a browser:
 *
 *  - **the draw is reproducible** — the same seed gives the same rows, and
 *    that is the only question a reviewer asks about a sample, so it is
 *    checked against the database rather than against the screen;
 *  - **the grid records three states**, and a cross is not a blank;
 *  - **the lock refuses a redraw**, because redrawing after seeing an
 *    exception is how a sample stops being a sample;
 *  - **an exception reaches the audit file's misstatement summary**, with
 *    its words, and is refused without them.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    partner: `pw-samp-partner-${tag}@phmgindia.test`,
    branchCode: tag.startsWith("l") ? "TSL" : "TSP",
    clientName: `Playwright Sampling ${tag} Private Limited`,
    serviceCode: `PWSMP${tag.slice(0, 3).toUpperCase()}`,
    paper: `Purchases ${tag}`,
  };
}

/** Four columns, the way Excel pastes them. */
const PASTE = [
  "Voucher no\tParty\tDate\tAmount",
  "PV-1\tKumar Packaging, Noida\t04-04-2026\t485000",
  "PV-2\tSharma Steel\t11-05-2026\t92000",
  "PV-3\tVerma Traders\t02-06-2026\t41000",
  "PV-4\tNaaz Enterprises\t19-07-2026\t28500",
  "PV-5\tJaiswal Hardware\t03-08-2026\t17000",
  "PV-6\tBose Chemicals\t22-09-2026\t9500",
  "PV-7\tIyer Supplies\t08-10-2026\t6400",
  "PV-8\tKaur Fabricators\t15-11-2026\t3100",
].join("\n");

async function wipe(fx) {
  const client = await Client.findOne({ legalName: fx.clientName }, null, {
    withDeleted: true,
  });
  if (client) {
    await Sample.deleteMany({ clientId: client._id }, { withDeleted: true });
    const engagements = await Engagement.find({ clientId: client._id }, null, {
      withDeleted: true,
    })
      .select("_id")
      .lean();
    await AuditFile.deleteMany(
      { engagementId: { $in: engagements.map((e) => e._id) } },
      { withDeleted: true },
    );
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
  await User.deleteMany({ email: fx.partner });
  const branch = await Branch.findOne({ code: fx.branchCode }, null, {
    withDeleted: true,
  });
  if (branch)
    await Branch.deleteOne({ _id: branch._id }, { withDeleted: true });
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
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );

    const [partner] = await User.create(
      [
        {
          name: "Playwright Sampling Partner",
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
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );

    const [service] = await ServiceTemplate.create(
      [
        {
          name: `Playwright statutory audit ${testInfo.project.name}`,
          code: fx.serviceCode,
          category: "Audit and Assurance",
          level: "L3",
          minExecRole: "ca",
          minReviewRole: "partner",
          recurrence: "one-time",
          checklist: [],
          steps: [{ name: "Issue the report" }],
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );

    const [engagement] = await Engagement.create(
      [
        {
          ...buildEngagement({
            template: service.toObject(),
            client,
            period: periodFor("one-time"),
            assigneeId: partner._id,
          }),
          code: `PWS-${fx.serviceCode}`,
          status: "In progress",
          createdBy: "test",
          updatedBy: "test",
        },
      ],
      { session, ordered: true },
    );

    /* The file has to exist: a sample needs a programme to sit in, and
       the screen refuses to start one otherwise. Opening it through the
       browser is the audit studio's own spec, not this one. */
    await AuditFile.create(
      [
        {
          engagementId: engagement._id,
          clientId: client._id,
          branchId: branch._id,
          areas: buildAuditAreas(),
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
  /** The connection is left open on purpose — see the other specs. */
});

test("a sample is drawn reproducibly, vouched, locked, and its exception reaches the file", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  await page.goto("/practice/sampling");
  await expect(
    page.getByRole("heading", { name: "Sampling and vouching" }),
  ).toBeVisible();

  // --- start the working paper -------------------------------------------
  await page.getByLabel("What is being sampled").fill(fx.paper);
  await page.getByLabel("Paper ref").fill("H-4");
  await page.getByLabel("Area", { exact: true }).fill("H");
  await page.getByRole("button", { name: "Start" }).click();

  await expect(page).toHaveURL(/\/practice\/sampling\/[a-f0-9]{24}$/);
  await expect(
    page.getByRole("heading", { name: `H-4 · ${fx.paper}` }),
  ).toBeVisible();

  // --- the design --------------------------------------------------------
  await page
    .getByLabel("Where the population came from")
    .fill("Purchase register, Tally");
  await page
    .getByLabel("Does it agree to the trial balance?")
    .selectOption("yes");
  await page
    .getByLabel("Method", { exact: true })
    .selectOption("monetary-unit");
  await page.getByLabel("Sample size").fill("4");
  await page.getByLabel("Tolerable misstatement (₹)").fill("50000");
  await page
    .getByLabel("Why this size, and this method")
    .fill("Controls tested and reliable; four items off the firm's table.");
  await page.getByRole("button", { name: "Save the design" }).click();
  await expect(
    page.getByText(/Nothing is drawn until you draw it/),
  ).toBeVisible();

  // --- the draw ----------------------------------------------------------
  await page.getByLabel("The population, pasted").fill(PASTE);
  await page.getByRole("button", { name: "Draw", exact: true }).click();
  await expect(page.getByText(/selected from 8 entries/)).toBeVisible();

  const drawn = await Sample.findOne({ name: fx.paper }).lean();
  expect(drawn.entries).toBe(8);
  /* 4,85,000 + 92,000 + … in paise, nothing lost to the comma in
     "Kumar Packaging, Noida". */
  expect(drawn.valuePaise).toBe(68_250_000);
  expect(drawn.items).toHaveLength(4);
  expect(drawn.seed).toBeGreaterThan(0);
  expect(drawn.items.map((item) => item.party)).toContain(
    "Kumar Packaging, Noida",
  );

  // --- the seed is stored and shown, and a new one changes the sample ----
  /**
   * That the *same* seed draws the same rows is a property of the pure
   * selection and is tested exhaustively in `tests/sampling.test.js` — the
   * browser cannot add anything to it, and asserting it here only races
   * the second draw against the first draw's own message.
   *
   * What only the browser can show is the half that the firm relies on:
   * the seed that was used is **on the screen**, and asking for a new one
   * really does produce a different sample.
   */
  const drawButton = page.getByRole("button", { name: "Draw", exact: true });
  await expect(page.getByText(new RegExp(String(drawn.seed)))).toBeVisible();

  const first = drawn.items.map((item) => item.ref).join(",");
  await page.getByRole("button", { name: "New seed" }).click();
  await expect(page.getByText(/New seed \d+/)).toBeVisible();
  await page.getByLabel("The population, pasted").fill(PASTE);
  await drawButton.click();

  /**
   * Polled against the database, not against the message on screen.
   *
   * "4 selected from 8 entries" is already on the page from the first
   * draw, so waiting for it passes before this draw has even started —
   * and the next click then lands while a redraw is still in flight,
   * which replaces every row and takes the mark with it.
   */
  await expect
    .poll(async () => {
      const row = await Sample.findOne({ name: fx.paper }).lean();
      return row.items.map((item) => item.ref).join(",");
    })
    .not.toBe(first);
  await expect(drawButton).toBeEnabled();

  const again = await Sample.findOne({ name: fx.paper }).lean();
  expect(again.seed).not.toBe(drawn.seed);
  await expect(page.getByText(new RegExp(String(again.seed)))).toBeVisible();

  // --- the grid ----------------------------------------------------------
  const grid = page.getByRole("table").last();
  const firstRow = grid.locator("tbody tr").first();

  /* Three states, and the cycle is · → ✓ → ✗. */
  const cell = firstRow.getByRole("button", { name: /Invoice seen/ });
  await expect(cell).toHaveAccessibleName(/not checked/);
  await cell.click();
  await expect(cell).toHaveAccessibleName(/: fine/);
  await cell.click();
  await expect(cell).toHaveAccessibleName(/an exception/);

  await expect(page.getByText(/1 exception/).first()).toBeVisible();

  /* And now that a cell is marked, drawing again is refused rather than
     quietly replacing every row. */
  await drawButton.click();
  await expect(page.getByText(/Vouching has already started/)).toBeVisible();

  // --- an exception with no words is refused -----------------------------
  await page
    .getByRole("button", { name: /Send exceptions to the audit file/ })
    .click();
  await expect(page.getByText(/Say what was wrong on row/)).toBeVisible();

  // --- with words, it goes ------------------------------------------------
  await firstRow.getByRole("button", { name: /add|note/ }).click();
  await page
    .getByLabel("What was found on this one")
    .fill("Invoice dated after the year end but booked inside it.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page
    .getByRole("button", { name: /Send exceptions to the audit file/ })
    .click();
  await expect(
    page.getByText(/sent to the misstatement summary/),
  ).toBeVisible();

  const file = await AuditFile.findOne({
    engagementId: drawn.engagementId,
  }).lean();
  expect(file.exceptions).toHaveLength(1);
  expect(file.exceptions[0].what).toMatch(/after the year end/);
  expect(file.exceptions[0].what).toMatch(/failed: Invoice seen/);
  expect(file.exceptions[0].state).toBe("Open");

  // --- the projection is shown, and labelled as a projection -------------
  await expect(
    page.getByRole("heading", { name: /What this says about the whole/ }),
  ).toBeVisible();
  await expect(page.getByText("Projected, not found.")).toBeVisible();

  // --- the lock refuses a redraw -----------------------------------------
  await page.getByRole("button", { name: "Lock the sample" }).click();
  await expect(page.getByText(/evidence now/)).toBeVisible();
  await expect(page.getByText("Locked", { exact: true })).toBeVisible();
  /* The whole draw panel is gone, so there is nothing to redraw with. */
  await expect(page.getByLabel("The population, pasted")).toHaveCount(0);

  const locked = await Sample.findOne({ name: fx.paper }).lean();
  expect(locked.locked).toBe(true);
  expect(locked.lockedByName).toBe("Playwright Sampling Partner");
});

test("locking is refused until somebody says the population agrees to the books", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  await page.goto("/practice/sampling");
  await page.getByLabel("What is being sampled").fill(`${fx.paper} two`);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(/\/practice\/sampling\/[a-f0-9]{24}$/);

  await page.getByLabel("Sample size").fill("3");
  await page.getByRole("button", { name: "Save the design" }).click();
  await expect(
    page.getByText(/Nothing is drawn until you draw it/),
  ).toBeVisible();

  await page.getByLabel("The population, pasted").fill(PASTE);
  await page.getByRole("button", { name: "Draw", exact: true }).click();
  await expect(page.getByText(/selected from 8 entries/)).toBeVisible();

  await page.getByRole("button", { name: "Lock the sample" }).click();
  await expect(
    page.getByText(/agrees to the trial balance first/),
  ).toBeVisible();

  const sample = await Sample.findOne({ name: `${fx.paper} two` }).lean();
  expect(sample.locked).toBe(false);
});

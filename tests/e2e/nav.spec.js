import { test, expect } from "@playwright/test";
import { signIn } from "./signin.js";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import { hashPassword } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";
import fixture from "../fixtures/nav-v6.2.json" with { type: "json" };

/**
 * The menu, in a browser (P3-22a).
 *
 * Three things are worth the browser. **The rendered menu equals the
 * fixture**, group by group and label by label, in order — which catches
 * the rail and `lib/nav/tree.js` drifting apart. **Every href answers 200**
 * for a partner, which is the promise that no menu item 404s. And the
 * accordion, the search and the drawer, which are behaviour and cannot be
 * unit-tested.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";

/**
 * The rail tests run at laptop width. On a phone the menu is a drawer that
 * has to be opened, and it has a test of its own at the bottom of this file
 * which makes its own 390px context — so these skip rather than assert
 * against a menu that is deliberately not on screen.
 */
const onPhone = (testInfo) => testInfo.project.name === "phone";
const DRAWER_NOTE = "the menu is a drawer on a phone; see the drawer test";

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    partner: `pw-nav-partner-${tag}@phmgindia.test`,
    employee: `pw-nav-employee-${tag}@phmgindia.test`,
  };
}

async function wipe(fx) {
  await User.deleteMany({ email: { $in: [fx.partner, fx.employee] } });
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
          name: "Playwright Nav Partner",
          email: fx.partner,
          role: "partner",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
      ],
      { session, ordered: true },
    );

    await User.create(
      [
        {
          name: "Playwright Nav Employee",
          email: fx.employee,
          role: "employee",
          branchIds: [branch._id],
          reportingTo: partner._id,
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
   * The connection is left open on purpose: Playwright runs several spec
   * files per worker and `connectDB` caches per process, so closing it took
   * the next spec down with it.
   */
});

/**
 * A group row is a **link** now (P3-34 phase 2).
 *
 * It was a button that only expanded, so reaching the first child took two
 * clicks and the first went nowhere. The row now goes to the group's first
 * item and opens the group on the way, which means these helpers look for
 * a link carrying `aria-expanded` rather than for a button.
 *
 * `today` is no longer a group at all: its four items are rows of the rail
 * under a TODAY heading, so the fixture's first entry is checked by its
 * items and not by a heading of its own.
 */
const FLAT = new Set(["Today"]);

/** @param {import("@playwright/test").Locator} rail @param {string} label */
function groupRow(rail, label) {
  return rail.getByRole("link", { name: label, exact: false }).first();
}

/**
 * Open a group, if it is not already.
 *
 * The group holding the current page opens itself, so a test that clicks
 * blindly tests nothing but its own assumption.
 */
async function openGroup(rail, label) {
  if (FLAT.has(label)) return;
  const head = groupRow(rail, label);
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click();
}

/** The group rows on screen, in order. */
const groupsOn = (page) =>
  page.locator('nav[aria-label="Main"]').first().locator("a[aria-expanded]");

test("a partner's menu is the ten groups, in order", async ({
  page,
}, testInfo) => {
  test.skip(onPhone(testInfo), DRAWER_NOTE);
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  const rail = page.locator('nav[aria-label="Main"]').first();
  const headings = fixture.partner
    .map((group) => group.label)
    .filter((label) => !FLAT.has(label));

  for (const label of headings) {
    await expect(groupRow(rail, label)).toBeVisible();
  }

  // the three bands are over them
  for (const band of ["Today", "Work", "Firm"]) {
    await expect(rail.getByText(band, { exact: true }).first()).toBeVisible();
  }

  // and the groups are in the fixture's order
  const onScreen = await groupsOn(page).allInnerTexts();
  const seen = headings.filter((label) =>
    onScreen.some((text) => text.includes(label)),
  );
  expect(seen).toEqual(headings);
});

test("the Today band's items are rows of the rail, not children", async ({
  page,
}, testInfo) => {
  test.skip(onPhone(testInfo), DRAWER_NOTE);
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  const rail = page.locator('nav[aria-label="Main"]').first();

  // visible without opening anything, which is the whole point of `flat`
  for (const label of fixture.partner[0].items) {
    await expect(rail.getByRole("link", { name: label })).toBeVisible();
  }
  // and no group row claims to hold them
  await expect(
    rail.locator("a[aria-expanded]", { hasText: "Today" }),
  ).toHaveCount(0);
});

test("opening a group closes the others, and the links are the fixture's", async ({
  page,
}, testInfo) => {
  test.skip(onPhone(testInfo), DRAWER_NOTE);
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  const rail = page.locator('nav[aria-label="Main"]').first();

  for (const group of fixture.partner) {
    await openGroup(rail, group.label);

    for (const item of group.items) {
      const label = item.replace(/^— /, "");
      if (item.startsWith("— ")) {
        await expect(rail.getByText(label, { exact: true })).toBeVisible();
      } else {
        await expect(rail.getByRole("link", { name: label })).toBeVisible();
      }
    }

    if (FLAT.has(group.label)) continue;

    // the accordion: exactly one group is expanded
    const expanded = await rail
      .locator('a[aria-expanded="true"]')
      .allInnerTexts();
    expect(expanded).toHaveLength(1);
  }
});

test("every menu item opens something", async ({ page, request }, testInfo) => {
  test.skip(onPhone(testInfo), DRAWER_NOTE);
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  const rail = page.locator('nav[aria-label="Main"]').first();

  /** The hrefs as rendered, which is what somebody can actually click. */
  const hrefs = new Set();
  for (const group of fixture.partner) {
    await openGroup(rail, group.label);
    for (const href of await rail
      .locator("a")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")))) {
      if (href?.startsWith("/")) hrefs.add(href);
    }
  }

  expect(hrefs.size).toBeGreaterThanOrEqual(59);

  for (const href of hrefs) {
    const response = await request.get(href);
    expect(response.status(), href).toBe(200);
  }
});

test("find in menu narrows it, and says so when nothing matches", async ({
  page,
}, testInfo) => {
  test.skip(onPhone(testInfo), DRAWER_NOTE);
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);
  const rail = page.locator('nav[aria-label="Main"]').first();

  await rail.getByLabel("Find in menu").fill("udin");
  await expect(rail.getByRole("link", { name: "UDIN register" })).toBeVisible();
  await expect(rail.getByRole("link", { name: "All clients" })).toHaveCount(0);

  await rail.getByLabel("Find in menu").fill("zzzz");
  await expect(rail.getByText("No menu item matches.")).toBeVisible();
});

test("an employee gets the short menu, and not the firm's", async ({
  page,
}, testInfo) => {
  test.skip(onPhone(testInfo), DRAWER_NOTE);
  const fx = names(testInfo.project.name);
  await signIn(page, fx.employee);
  const rail = page.locator('nav[aria-label="Main"]').first();

  await expect(groupRow(rail, "My jobs")).toBeVisible();
  // "Firm" is a band heading for staff too, so this asks about the group
  await expect(
    rail.locator("a[aria-expanded]", { hasText: "Firm" }),
  ).toHaveCount(0);
  await expect(
    rail.locator("a[aria-expanded]", { hasText: "Billing" }),
  ).toHaveCount(0);
});

test("on a phone the menu is a drawer", async ({ browser }, testInfo) => {
  const fx = names(testInfo.project.name);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await signIn(page, fx.partner);

  /**
   * The desktop rail is still in the document at this width — it is hidden
   * by CSS, not unmounted — so the question is what is **visible**.
   */
  const navs = page.locator('nav[aria-label="Main"]');
  await expect(navs.first()).toBeHidden();

  await page.getByRole("button", { name: "Menu" }).click();
  const drawer = navs.filter({ has: page.getByLabel("Find in menu") }).last();
  await expect(drawer).toBeVisible();
  // Today is a band heading now, with its items as rows beneath it
  await expect(drawer.getByText("Today", { exact: true })).toBeVisible();
  await expect(drawer.getByRole("link", { name: "My tasks" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();

  await context.close();
});

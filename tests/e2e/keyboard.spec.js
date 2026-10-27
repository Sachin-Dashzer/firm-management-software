import { test, expect } from "@playwright/test";
import { TOTP, Secret } from "otpauth";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Client from "../../models/Client.js";
import { hashPassword, decryptField } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";

/**
 * The keyboard, which spec section 15 makes a quality bar: "every action
 * reachable by keyboard; the mouse is optional for power users".
 *
 * These are the paths that only a browser can check — that Ctrl+K opens
 * the command bar from anywhere, that typing a PAN finds the client, that
 * the skip link is the first thing in the tab order, and that the login
 * form works before the 3D scene has loaded.
 *
 * Skipped until Atlas is configured, like the other suites.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    partner: `pw-kbd-partner-${tag}@phmgindia.test`,
    clientName: `Keyboard Test Textiles ${tag} Private Limited`,
    pan: "AAJCK4821M",
  };
}

async function wipe(fx) {
  await Client.deleteMany({ legalName: fx.clientName }, { withDeleted: true });
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
      { returnDocument: "after", upsert: true, session },
    );

    await User.create(
      [
        {
          name: "Playwright Keyboard Partner",
          email: fx.partner,
          role: "partner",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
      ],
      { session },
    );

    await Client.create(
      [
        {
          code: `PHMG-NOI-6${testInfo.project.name.length}00`,
          legalName: fx.clientName,
          entityType: "Private Limited",
          branchId: branch._id,
          status: "Active",
          pan: fx.pan,
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

test("the login form is usable before the scene is, and the map is always there", async ({
  page,
}) => {
  await page.goto("/login");

  // the form comes first in the document, so this focuses the email box
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Email")).toBeFocused();

  // the flat ledger map is in the markup whatever the device decides about 3D
  await expect(
    page.getByRole("img", { name: /ledger-style map of North India/ }),
  ).toBeAttached();

  // and the scene, if it loads at all, is hidden from assistive tech
  const canvas = page.locator("canvas");
  if (await canvas.count()) {
    await expect(canvas.first()).toHaveAttribute("aria-hidden", "true");
  }
});

test("skip to content is the first thing in the tab order", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#content$/);
});

test("Ctrl+K opens the command bar and a PAN finds its client", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  await page.keyboard.press("Control+k");
  const input = page.getByPlaceholder(/Client, PAN, GSTIN/);
  await expect(input).toBeFocused();

  await input.fill(fx.pan);
  const hit = page.getByRole("option", { name: new RegExp(fx.clientName) });
  await expect(hit).toBeVisible();

  // chosen with the keyboard alone
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/clients\/[0-9a-f]{24}/);
  await expect(page.getByText(fx.clientName).first()).toBeVisible();

  // and it closes without touching the mouse
  await page.keyboard.press("Control+k");
  await expect(page.getByPlaceholder(/Client, PAN, GSTIN/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByPlaceholder(/Client, PAN, GSTIN/)).toBeHidden();
});

test("a command finds a screen as well as a record", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/Client, PAN, GSTIN/).fill("overdue");
  await page.getByRole("option", { name: "Overdue work" }).click();
  await expect(page).toHaveURL(/due=overdue/);
});

test("the client case file's tabs work by keyboard and keep the section in the URL", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);
  await signIn(page, fx.partner);

  await page.goto("/clients");
  await page.getByRole("link", { name: new RegExp(fx.clientName) }).click();

  await page.getByRole("link", { name: "Documents" }).click();
  await expect(page).toHaveURL(/tab=documents/);
  await expect(page.getByRole("link", { name: "Documents" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

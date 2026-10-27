import { test, expect } from "@playwright/test";
import { TOTP, Secret } from "otpauth";
import { connectDB } from "../../lib/db.js";
import User from "../../models/User.js";
import Branch from "../../models/Branch.js";
import Announcement from "../../models/Announcement.js";
import Notification from "../../models/Notification.js";
import { hashPassword, decryptField } from "../../lib/crypto.js";
import { systemAudit } from "../../lib/audit/system.js";

/**
 * Announcements, and who has read them (P3-17b).
 *
 * The flow worth a browser is the one a partner actually uses: post
 * something, see one name still outstanding, and have that name disappear
 * when the person says they have read it. The audience rules are
 * arithmetic and live in tests/announcements.test.js.
 *
 * Skipped until Atlas is configured, like every other suite.
 */

const ready = Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET);
test.skip(!ready, "needs MONGODB_URI and AUTH_SECRET in the environment");

const PASSWORD = "test-password-not-real";

function names(project) {
  const tag = project.replace(/\W/g, "").toLowerCase();
  return {
    tag,
    title: `Office closed on Friday ${tag}`,
    partner: `pw-ann-partner-${tag}@phmgindia.test`,
    ca: `pw-ann-ca-${tag}@phmgindia.test`,
  };
}

async function wipe(fx) {
  await Announcement.deleteMany({ title: fx.title }, { withDeleted: true });
  const people = await User.find({ email: { $in: [fx.partner, fx.ca] } });
  await Notification.deleteMany({ userId: { $in: people.map((p) => p._id) } });
  await User.deleteMany({ email: { $in: [fx.partner, fx.ca] } });
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

    await User.create(
      [
        {
          name: "Playwright Announce Partner",
          email: fx.partner,
          role: "partner",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
        },
        {
          name: "Playwright Announce CA",
          email: fx.ca,
          role: "ca",
          branchIds: [branch._id],
          passwordHash: await hashPassword(PASSWORD),
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

test("an announcement reaches the firm, and says who has not read it", async ({
  page,
}, testInfo) => {
  const fx = names(testInfo.project.name);

  await signIn(page, fx.partner);
  await page.goto("/inbox/announcements");

  await page.getByLabel("Title").fill(fx.title);
  await page
    .getByLabel("What you want to say")
    .fill("The Noida office is closed on Friday for the festival.");
  await page.getByLabel("Ask people to say they have read it").check();
  await page.getByRole("button", { name: "Post it" }).click();
  await expect(page.getByRole("status")).toContainText(/Posted/);

  // the CA has not read it, and is named rather than counted
  await expect(page.getByText(/Not read yet:/)).toContainText(
    "Playwright Announce CA",
  );

  // they meet it at the top of their inbox, and can say so
  await page.context().clearCookies();
  await signIn(page, fx.ca);
  await page.goto("/inbox");

  await expect(page.getByText("From the firm")).toBeVisible();
  await expect(page.getByText(fx.title)).toBeVisible();
  await page.getByRole("button", { name: "I have read this" }).click();
  await expect(page.getByText(/You said you had read this/)).toBeVisible();

  // and the partner's list is clear
  await page.context().clearCookies();
  await signIn(page, fx.partner);
  await page.goto("/inbox/announcements");
  await expect(
    page.getByText(/Everybody it reaches has read it/),
  ).toBeVisible();
});

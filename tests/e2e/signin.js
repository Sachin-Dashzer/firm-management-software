import { expect } from "@playwright/test";
import { TOTP, Secret } from "otpauth";
import User from "../../models/User.js";
import { decryptField } from "../../lib/crypto.js";

/**
 * Signing in, once, for every spec that needs it.
 *
 * **This was copied into forty spec files.** Identical bodies, which meant
 * a flaw in it was forty flaws, and a fix was forty edits — so nobody made
 * one and the suite was quietly flaky instead. One copy, here.
 *
 * Two things it does that the copies did not:
 *
 *  - **It handles both second steps.** A brand-new account is enrolled
 *    (the QR screen, "Turn on 2FA"); an enrolled one is asked for a code.
 *    And if `AUTH_SKIP_2FA` is on in the environment under test, the
 *    password is the whole of it and no code box ever appears — a spec that
 *    waits for one hangs for thirty seconds and fails on the wrong thing.
 *  - **It retries a refused code once, in the next time step.** A code is
 *    good for thirty seconds; a suite that signs in ten times in one file
 *    straddles a boundary sooner or later, and `verifyTotp` also refuses a
 *    step that has already been accepted. Waiting for the next step and
 *    trying again is what a person would do, and it turns a flaky failure
 *    into four seconds of patience.
 *
 * The spec is expected to have called `connectDB()` already, as every
 * `beforeAll` in this suite does.
 */

export const PASSWORD = "test-password-not-real";

/**
 * Open a page and wait until React has taken over its form.
 *
 * **Why this exists.** Playwright types faster than a browser hydrates. A
 * `fill()` before hydration puts the value in the DOM and React never hears
 * about it — so a control that enables itself when a box has text stays
 * disabled, and the submit button, with no handler attached yet, does a
 * native form submit: the page reloads, empty, and the test sees a form it
 * has apparently not filled in. Six clients tests failed that way, each
 * looking like a different bug.
 *
 * Hydration is detected the only way it can be from outside: React puts its
 * own keys on the DOM node it has adopted.
 *
 * A person typing a client's name takes half a minute, so this race is the
 * suite's and not theirs. It is still worth knowing that the form has no
 * no-JavaScript fallback — it loses what was typed.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} path
 * @param {string} [selector] the element whose hydration matters
 */
export async function gotoForm(page, path, selector = "form") {
  await page.goto(path);
  await page.waitForFunction(
    (sel) => {
      const node = document.querySelector(sel);
      return (
        node && Object.keys(node).some((key) => key.startsWith("__react"))
      );
    },
    selector,
    { timeout: 20_000 },
  );
}

/** Milliseconds until the next 30-second TOTP step begins. */
function msToNextStep() {
  return 30_000 - (Date.now() % 30_000);
}

/**
 * The code an authenticator would be showing for this account right now.
 *
 * The replay guard is cleared first: it refuses a time step that has
 * already been accepted, which is correct in production (spec §16) and
 * wrong for a suite that signs the same person in repeatedly inside one
 * window. The rule itself is tested in `tests/security.test.js`.
 *
 * @param {string} email
 */
export async function codeFor(email) {
  const user = await User.findOne({ email }).select("+totpSecret");
  if (!user?.totpSecret) {
    throw new Error(`${email} has no TOTP secret: is the fixture signed up?`);
  }
  await User.updateOne({ email }, { $set: { lastTotpCounter: 0 } });

  return new TOTP({
    issuer: "PHMG & Associates",
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(decryptField(user.totpSecret)),
  }).generate();
}

/**
 * Sign in and wait until the app has opened.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} email
 * @param {{password?: string, land?: RegExp}} [options]
 *   `land` is where this account is expected to end up — `/issues` for
 *   everybody except an account that must change its password first.
 */
export async function signIn(page, email, options = {}) {
  const { password = PASSWORD, land = /\/issues$/ } = options;

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Continue" }).click();

  const codeBox = page.getByLabel("6-digit code");

  /**
   * Either a code is wanted or the app is already open. Racing the two is
   * the only way to work with `AUTH_SKIP_2FA` either way round, and the
   * flag is the server's to decide, not the spec's.
   */
  const asked = await Promise.race([
    codeBox
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false),
    page
      .waitForURL(land, { timeout: 15_000 })
      .then(() => false)
      .catch(() => false),
  ]);

  if (!asked) {
    await expect(page, `${email} did not reach ${land}`).toHaveURL(land);
    return;
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await codeBox.fill(await codeFor(email));
    await page.getByRole("button", { name: /Sign in|Turn on 2FA/ }).click();

    try {
      await page.waitForURL(land, { timeout: 10_000 });
      return;
    } catch (err) {
      // a refused code, or a step already burnt: wait for the next one
      if (attempt === 1) throw err;
      await page.waitForTimeout(msToNextStep() + 1_000);
    }
  }
}

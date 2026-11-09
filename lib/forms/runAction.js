"use client";

/**
 * Calling a server action without ever letting it throw at the screen
 * (QA 09-11-2026, #8).
 *
 * What happened: a session expires after thirty minutes idle, which is
 * exactly how long somebody spends filling in a long form. The next button
 * press posted to a server action, the middleware redirected it to the
 * login page, and the action client was handed HTML where it expected a
 * React payload. The screen said "An unexpected response was received from
 * the server" and the button did nothing — no explanation, and the figure
 * that had been typed looked like it had never been entered.
 *
 * Two halves to the fix. The middleware now answers such a POST with 401
 * instead of a page of HTML, so nothing runs signed out. And every caller
 * comes through here, which turns any failure into an answer the screen can
 * show — and, when the session is the reason, says so in words.
 *
 * Why ask the server rather than read the error: a server action's error
 * message is redacted in production, so the thrown error cannot be trusted
 * to say what went wrong. `/api/auth/session` is outside the session wall
 * and answers plainly.
 */

/**
 * What somebody is told when their session has gone.
 *
 * It does **not** send them away. Navigating to the login page would throw
 * away everything on the screen, which is the thing this whole fix is
 * about; signing in elsewhere and pressing the button again keeps it.
 * Reloading works too — the session wall sends them to the login page with
 * this page as `next`, and brings them back to it afterwards.
 */
export const SIGNED_OUT =
  "You have been signed out, so nothing was saved. Sign in again in another tab and press the button again — what you have typed is still here. Reloading this page also works, and brings you back here after you sign in.";

/** Is there still a session? Asked only after something has failed. */
export async function stillSignedIn() {
  try {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    if (!response.ok) return false;
    const session = await response.json();
    return Boolean(session?.user);
  } catch {
    // no answer at all is the network, not a sign-out; don't accuse the
    // session of something the office wifi did
    return true;
  }
}

/**
 * Run a server action and always come back with something to show.
 *
 * @template {{ ok?: string, error?: string } | void} R
 * @param {() => Promise<R>} action
 * @returns {Promise<any>} the action's own answer — passed through
 *          untouched, `undefined` included — or `{ error }` if it threw
 */
export async function runAction(action) {
  try {
    return await action();
  } catch (error) {
    /*
     * `redirect()` and `notFound()` work by throwing, and Next marks those
     * with a digest. Catching one would turn "go to the new page" into an
     * error message and leave the person where they were — `startSample`
     * and `startTrialBalance` both end that way.
     */
    if (String(error?.digest ?? "").startsWith("NEXT_")) throw error;
    if (!(await stillSignedIn())) {
      return { error: SIGNED_OUT, signedOut: true };
    }
    return {
      error: error?.message || "That did not go through. Please try again.",
    };
  }
}

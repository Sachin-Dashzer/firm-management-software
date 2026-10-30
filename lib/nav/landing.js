// @ts-check

/**
 * Where a staff sign-in lands, in one place.
 *
 * It was in two: `LoginForm.jsx` chose the path and `tests/e2e/signin.js`
 * expected it. On 29-10-2026 the first was changed from `/issues` to
 * `/dashboard` and the second was not, so the sign-in helper waited for a
 * URL that never came, tried its 2FA code a second time on a page that had
 * no code box, and **every one of the 45 spec files that signs somebody in
 * failed on the sign-in** — reported as a timeout filling the code box,
 * which names the symptom and hides the cause.
 *
 * Both now read this. Changing where the firm lands is one line, and the
 * suite cannot disagree with the application about it.
 *
 * Note that D43 (P3-6) made Issues the landing page deliberately: it is the
 * list of everything that needs somebody's attention. `/dashboard` is the
 * owner's later choice and is kept.
 */
export const LANDING = "/dashboard";

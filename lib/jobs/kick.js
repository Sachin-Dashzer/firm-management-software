// @ts-check

import { after } from "next/server.js";

/**
 * Drain the queue as soon as this request's response has gone out, instead
 * of waiting for the next cron pass.
 *
 * Nothing sends mail inline — that is deliberate (`lib/mailer/notify.js`:
 * a dead mailbox must never make saving an engagement slow or fail). But
 * the only thing that *started* the runner was cron every five minutes, so
 * asking a client for documents meant the client's email left up to five
 * minutes later, which reads as the system being slow (owner, 14-11-2026).
 *
 * `after()` runs the callback once the response has been sent, so the
 * screen is as quick as it was and the mail goes in the same second. Two
 * things make that safe:
 *
 *  - **after the commit.** A `messageLogs` row is written inside the
 *    caller's transaction while the `jobs` row is not, so a drain starting
 *    any earlier could claim the job, find no message log and drop the
 *    letter. `after()` cannot run before the response, and the response
 *    cannot be sent before the action's transaction has committed.
 *  - **no second mechanism.** It calls the same `runOnce()` cron calls, so
 *    the rate limit, the back-off, the heartbeat and the hourly cap all
 *    still apply. Cron remains the floor: anything this pass does not get
 *    to is picked up five minutes later exactly as before.
 *
 * Outside a request — the cPanel runner, `npm run jobs:tick`, a test —
 * there is no response to come after, so `after()` throws and this does
 * nothing. That is the right answer: those contexts *are* the runner.
 */

/** One drain at a time per instance, so a kick cannot kick itself. */
let draining = false;

/**
 * A short pass: the letter that was just queued, not the whole backlog.
 * A server action's own time limit is what is being spent here, and cron
 * has a full 60 seconds for the rest.
 */
const KICK = { budgetSeconds: 10, maxJobs: 5 };

export function kickQueue() {
  if (draining) return;

  try {
    after(async () => {
      if (draining) return;
      draining = true;
      try {
        /* imported here, not at the top: `run.js` imports this module's
           caller (`queue.js`), and a cycle through a module that runs at
           import time is a bad trade for one await. */
        const { runOnce } = await import("./run.js");
        await runOnce(KICK);
      } catch (error) {
        // the queue is still the queue: cron will try again
        console.error("Post-response queue drain failed:", error?.message);
      } finally {
        draining = false;
      }
    });
  } catch {
    // not in a request: the runner is already what is running
  }
}

// @ts-check

import { checkReviewer } from "./status.js";

/**
 * The three gates a filing passes before it is recorded (P3-5).
 *
 * The order is the change. Spec §5 had the assignee file, capture the
 * acknowledgement, and *then* the reviewer sign off — which asks a reviewer
 * to approve something already lodged with the department. If they disagree,
 * the return is on the portal and the remedy is a revised return.
 *
 * So:
 *
 *   1. staff prepare and send for review
 *   2. a reviewer approves — not the person who did the work, and a Partner
 *      for A-tier work (`checkReviewer`, shared with marking it Completed)
 *   3. for GST, GSTR-9, TDS and the two ITRs, **the client confirms the
 *      figures** — named, dated, with evidence, against a version
 *   4. only then can a filing be recorded
 *
 * And the gates are tied to a **version**, not to the engagement: change the
 * work after approval and the version rises, which leaves both gates behind
 * and sends the job back. An approval that survives an edit is not an
 * approval of anything in particular.
 *
 * The client gate matters because the client, not the firm, owes the tax.
 * Recording who confirmed what, when, and on what evidence is the answer to
 * a dispute two years later.
 */

/**
 * The starter catalog's codes that need the client to confirm the figures
 * (owner, 26-10-2026). Seed values only: the live answer is the flag on the
 * service template, so the firm can change it in Settings without a release.
 *
 * Tax audit and statutory audit are deliberately absent — they carry their
 * own sign-off and representation letters, and the prototype leaves them out
 * for the same reason.
 */
export const CONFIRM_SEED_CODES = [
  "GSTR3B",
  "GSTR9",
  "TDS-RET",
  "ITR-SAL",
  "ITR-BUS",
];

/** The version of the work. Everything created before P3-5 is version 1. */
export function versionOf(engagement) {
  return engagement?.version ?? 1;
}

/** Does this service need the client to confirm the figures? */
export function needsClientConfirmation(engagement) {
  return Boolean(engagement?.templateSnapshot?.clientConfirmationRequired);
}

/**
 * Is the *current* version approved?
 *
 * The version comparison is the whole point. A record of an approval is not
 * the same as an approval that still stands.
 */
export function isApproved(engagement) {
  const review = engagement?.review;
  return Boolean(
    review?.approvedAt && review.version === versionOf(engagement),
  );
}

/** Has the client confirmed the figures as they now stand? */
export function isClientConfirmed(engagement) {
  const c = engagement?.clientConfirmation;
  return Boolean(c?.when && c.version === versionOf(engagement));
}

/**
 * Why a filing cannot be recorded yet, or null when it can.
 *
 * Read by `canRecordFiling` and by the filing panel, so the buttons are
 * disabled with the reason rather than offered and then refused.
 */
export function blocksFiling(engagement) {
  if (!isApproved(engagement)) {
    return "Reviewer approval is needed before filing.";
  }
  if (needsClientConfirmation(engagement) && !isClientConfirmed(engagement)) {
    return "The client has not confirmed the figures yet.";
  }
  return null;
}

/**
 * What this job is waiting for, in the words a list can show: the one next
 * thing, not everything at once.
 */
export function gateState(engagement) {
  const version = versionOf(engagement);
  if (!isApproved(engagement)) {
    return {
      key: "awaiting-review",
      label: version > 1 ? `Version ${version} to approve` : "To approve",
      version,
    };
  }
  if (needsClientConfirmation(engagement) && !isClientConfirmed(engagement)) {
    return {
      key: "awaiting-client",
      label: `Client to confirm version ${version}`,
      version,
    };
  }
  return { key: "ready-to-file", label: "Approved — ready to file", version };
}

/**
 * A reviewer approves the version in front of them.
 *
 * @param {object} engagement
 * @param {{ id: string, role: string, name: string }} actor
 * @returns {{ ok: true, version: number } | { ok: false, error: string }}
 */
export function approve(engagement, actor) {
  if (engagement.status === "Completed") {
    return { ok: false, error: "A completed engagement is locked." };
  }
  if (engagement.status === "Cancelled") {
    return { ok: false, error: "This engagement was cancelled." };
  }
  if (isApproved(engagement)) {
    return {
      ok: false,
      error: `Version ${versionOf(engagement)} is already approved by ${
        engagement.review?.approvedByName || "a reviewer"
      }.`,
    };
  }
  if (engagement.status !== "Under review") {
    return {
      ok: false,
      error:
        "Send the work for review first. Approving something nobody has submitted is how a review becomes a formality.",
    };
  }

  const allowed = checkReviewer(
    actor,
    {
      status: engagement.status,
      assigneeId: engagement.assigneeId,
      reviewerId: engagement.reviewerId,
      minReviewRole: engagement.templateSnapshot?.minReviewRole ?? "",
      level: engagement.templateSnapshot?.level ?? "",
    },
    { act: "approve it", instead: "approve it", only: "approve this" },
  );
  if (!allowed.ok) return { ok: false, error: allowed.error };

  const version = versionOf(engagement);
  engagement.review = {
    approvedBy: actor.id,
    approvedByName: actor.name,
    approvedAt: new Date(),
    version,
  };
  return { ok: true, version };
}

/**
 * Record the client's confirmation of the figures.
 *
 * The firm records it rather than the client always typing it, because the
 * confirmation usually arrives on WhatsApp or over the phone — so the
 * evidence line is mandatory and has to say where it can be found. "Client
 * agreed" is not evidence; "WhatsApp from Jaspal, 25 Oct 4:10 pm" is.
 *
 * The client can also do it themselves from the portal, which arrives at the
 * same record with `who` as their own name.
 *
 * @param {object} engagement
 * @param {{ who?: string, when?: Date|null, evidence?: string }} input
 * @param {{ id: string, name: string }} actor
 * @param {Date} [now] passed in rather than read off the clock, so the rule
 *   is testable — the same reason `recordFiling` takes it
 */
export function recordClientConfirmation(
  engagement,
  input,
  actor,
  now = new Date(),
) {
  if (!needsClientConfirmation(engagement)) {
    return {
      ok: false,
      error: "This service does not ask the client to confirm the figures.",
    };
  }
  if (!isApproved(engagement)) {
    return {
      ok: false,
      error:
        "Get the work reviewed first. Asking a client to confirm figures nobody has checked puts our mistake in their hands.",
    };
  }
  if (isClientConfirmed(engagement)) {
    return {
      ok: false,
      error: `Version ${versionOf(engagement)} is already confirmed by ${
        engagement.clientConfirmation?.who || "the client"
      }.`,
    };
  }

  const who = String(input.who ?? "").trim();
  if (who.length < 3) {
    return { ok: false, error: "Name the person at the client who confirmed." };
  }
  const evidence = String(input.evidence ?? "").trim();
  if (evidence.length < 5) {
    return {
      ok: false,
      error:
        'Say where the confirmation is — e.g. "WhatsApp from Jaspal, 25 Oct 4:10 pm". A confirmation nobody can find is not one.',
    };
  }
  const when = input.when ?? null;
  if (!when) return { ok: false, error: "Enter the date they confirmed." };
  if (when.getTime() > now.getTime()) {
    return { ok: false, error: "That date is in the future." };
  }

  engagement.clientConfirmation = {
    who,
    when,
    evidence,
    version: versionOf(engagement),
    recordedBy: actor.id,
    recordedByName: actor.name,
    recordedAt: new Date(),
  };
  return { ok: true, version: versionOf(engagement) };
}

/**
 * The work changed after somebody approved it: raise the version, drop both
 * gates, and send it back to be looked at again.
 *
 * Returns `{ bumped: false }` when there was nothing standing to lose, which
 * is the ordinary case — most edits happen before anyone has approved
 * anything, and they must not be made to feel like an event.
 *
 * Anything already filed is left alone: `milestone.versionFiled` records
 * which version went in, and a return lodged with the department is not
 * un-lodged by an edit here.
 *
 * @param {object} engagement
 * @param {{ id: string, name: string }} actor
 * @param {string} what  what was changed, for the note
 */
export function changedAfterApproval(engagement, actor, what) {
  const hadApproval = isApproved(engagement);
  const hadConfirmation = isClientConfirmed(engagement);
  if (!hadApproval && !hadConfirmation) return { bumped: false };

  const version = versionOf(engagement) + 1;
  engagement.version = version;
  engagement.review = undefined;
  engagement.clientConfirmation = undefined;

  // back to the maker's hands: the status itself is the signal the board and
  // the review queue read, and leaving it in Under review would hide the
  // fact that there is work to redo
  if (
    !["Completed", "Cancelled", "Filed / delivered"].includes(engagement.status)
  ) {
    engagement.status = "In progress";
  }

  return {
    bumped: true,
    version,
    hadConfirmation,
    note: `Changed after approval (${what}) — now version ${version}. Review${
      hadConfirmation ? " and client confirmation" : ""
    } needed again.`,
  };
}

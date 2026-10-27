// @ts-check

import { toPaise } from "../money.js";

/**
 * How a finished job is paid for, and the one process that writes free work
 * down as a decision instead of a blank (P3-4).
 *
 * The prototype's rule: a fee is a positive whole-rupee amount, and free work
 * is a *waiver* — a reason, a partner's approval, and both names kept. A zero
 * fee and a waived fee look identical in a database and mean opposite things.
 * One is "nobody has priced this yet"; the other is "a partner decided not to
 * charge, for this reason".
 *
 * Everything here is a pure function over the engagement document. The server
 * actions wrap these in `audited()` so the change and its log share one
 * transaction; the Billing screen and the engagement page call the same
 * functions, because two copies of a waiver rule is how two screens come to
 * disagree about who approved what.
 */

export const SCOPES = ["billable", "retainer", "waived"];

/** What each scope is called on screen. */
export const SCOPE_LABELS = {
  billable: "Billable",
  retainer: "Included in the monthly retainer",
  waived: "Waived",
};

/**
 * Chargeable work, as a Mongo query.
 *
 * `null` is in the list because everything created before P3-4 has no
 * `scope` field at all — a schema default is applied on write, never to rows
 * already in the collection — and in MongoDB `{ scope: null }` matches a
 * missing field as well as a null one. Those engagements were billable, so
 * they must keep counting as billable.
 */
export const CHARGEABLE_QUERY = { scope: { $in: [null, "billable"] } };

/** The shortest reason that is actually a reason rather than a shrug. */
const MIN_REASON = 5;

/** @param {{ scope?: string }} engagement */
export function scopeOf(engagement) {
  const scope = engagement?.scope;
  return SCOPES.includes(scope) ? scope : "billable";
}

/**
 * Is this job one the firm will raise an invoice for?
 *
 * Note this says nothing about whether the fee has been agreed yet — a
 * billable job with no fee is billable and unpriced, which is exactly the
 * state `feeState()` exists to name.
 *
 * @param {{ scope?: string }} engagement
 */
export function isChargeable(engagement) {
  return scopeOf(engagement) === "billable";
}

/**
 * Read an agreed fee typed by a person.
 *
 * Whole rupees only, and strictly positive. The firm bills in rupees — a
 * fee of ₹1,500.50 is a typing accident, and a fee of ₹0 is the thing this
 * whole step exists to stop. Both are refused in the prototype's own words,
 * because the answer to "then how do I record free work?" has to travel with
 * the refusal or the next thing somebody types is 1.
 *
 * @param {unknown} rupees  what the form field held
 * @returns {{ ok: true, paise: number } | { ok: false, error: string }}
 */
export function readFee(rupees) {
  const raw = String(rupees ?? "").trim();
  if (!raw) return { ok: false, error: FEE_RULE };

  let paise;
  try {
    paise = toPaise(raw);
  } catch {
    return { ok: false, error: "That fee is not an amount." };
  }

  if (paise <= 0) return { ok: false, error: FEE_RULE };
  if (paise % 100 !== 0) {
    return {
      ok: false,
      error: "Fees are agreed in whole rupees. Drop the paise.",
    };
  }
  return { ok: true, paise };
}

export const FEE_RULE =
  "Enter the agreed fee as a positive amount in whole rupees. For free work use Waive or In retainer.";

/**
 * What the money on this job is waiting for — the one question four screens
 * ask, so they get one answer.
 *
 * `pending` is the useful part: it is true only when somebody still has to
 * do something about the money — agree a fee, or decide a waiver. Retainer
 * and waived work is settled, so it is not pending even though it cannot be
 * invoiced either; `blocksInvoice()` is the question about invoicing.
 *
 * @param {{ scope?: string, feePaise?: number, scopeReason?: string,
 *           waiver?: { reason?: string, requestedByName?: string } }} engagement
 */
export function feeState(engagement) {
  const scope = scopeOf(engagement);
  const paise = engagement?.feePaise ?? 0;
  const pending = pendingWaiver(engagement);

  if (pending) {
    return {
      scope,
      key: "waiver-pending",
      pending: true,
      label: "Waiver waiting for a partner",
      detail: `${pending.requestedByName || "Staff"} asked: ${pending.reason}`,
    };
  }

  if (scope !== "billable") {
    return {
      scope,
      key: scope,
      pending: false,
      label: SCOPE_LABELS[scope],
      detail: engagement?.scopeReason ?? "",
    };
  }

  if (paise <= 0) {
    return {
      scope,
      key: "fee-not-agreed",
      pending: true,
      label: "Fee not agreed",
      detail: "Agree a fee, or record this as retainer or waived.",
    };
  }

  return {
    scope,
    key: "billable",
    pending: false,
    label: SCOPE_LABELS.billable,
    detail: "",
  };
}

/** The waiver request nobody has decided yet, or null. */
export function pendingWaiver(engagement) {
  const w = engagement?.waiver;
  if (!w || !w.reason) return null;
  if (w.approvedAt || w.declinedAt) return null;
  return w;
}

/**
 * Set the agreed fee. Does not touch the scope: a job marked retainer keeps
 * its reason, and a fee typed against it is the figure the retainer covers.
 *
 * @returns {{ ok: true, paise: number } | { ok: false, error: string }}
 */
export function setFee(engagement, rupees) {
  const read = readFee(rupees);
  if (!read.ok) return read;
  if (closedToMoney(engagement)) return closedError;

  engagement.feePaise = read.paise;
  return read;
}

/**
 * Move a job between billable and retainer. Waived is not reachable this way
 * — it needs a partner, and that is `decideWaiver`'s job.
 *
 * @param {object} engagement
 * @param {string} scope  "billable" or "retainer"
 * @param {string} reason required for retainer
 */
export function setScope(engagement, scope, reason = "") {
  if (scope !== "billable" && scope !== "retainer") {
    return {
      ok: false,
      error: "Free work is a waiver, which a partner approves with a reason.",
    };
  }
  if (closedToMoney(engagement)) return closedError;

  const why = String(reason ?? "").trim();
  if (scope === "retainer" && why.length < MIN_REASON) {
    return {
      ok: false,
      error:
        "Say which retainer covers this, so the next person billing knows why it is not on an invoice.",
    };
  }

  // moving back to billable clears the settlement, including a waiver that
  // was approved: the job is chargeable again and the old reason would read
  // as if it still applied
  engagement.scope = scope;
  engagement.scopeReason = scope === "retainer" ? why : "";
  // null rather than undefined: Mongoose unsets the subdocument either way,
  // and a plain object in a test reads back the same
  if (scope === "billable") engagement.waiver = null;

  return { ok: true, scope };
}

/**
 * Staff ask for a fee to be waived. The job does not move: it stays
 * chargeable and unbilled until a partner says otherwise, so a request can
 * never quietly become a decision.
 *
 * @param {object} engagement
 * @param {string} reason
 * @param {{ id: string, name: string }} actor
 */
export function requestWaiver(engagement, reason, actor) {
  const why = String(reason ?? "").trim();
  if (why.length < MIN_REASON) {
    return { ok: false, error: "A waiver needs a reason." };
  }
  if (closedToMoney(engagement)) return closedError;
  if (scopeOf(engagement) === "waived") {
    return { ok: false, error: "This fee is already waived." };
  }
  if (pendingWaiver(engagement)) {
    return {
      ok: false,
      error: "A waiver is already waiting for a partner on this work.",
    };
  }

  engagement.waiver = {
    reason: why,
    requestedBy: actor.id,
    requestedByName: actor.name,
    requestedAt: new Date(),
  };
  return { ok: true };
}

/**
 * A partner decides. Approving writes the waiver with *both* names — whoever
 * asked and whoever allowed it — because a waiver with one name on it cannot
 * be told apart from somebody waiving their own client's fee.
 *
 * A partner may also approve with no request behind it, which is the common
 * case on their own clients; then both names are theirs and the record says
 * so plainly.
 *
 * Declining keeps the request, the decision and the reason. The job goes
 * back to being billable with the fee still to agree, which is the honest
 * state: the partner has said this work is chargeable.
 *
 * @param {object} engagement
 * @param {boolean} approve
 * @param {string} reason  the waiver reason when approving straight out, or
 *                         why it was declined
 * @param {{ id: string, name: string }} actor  must be a partner; the action checks
 */
export function decideWaiver(engagement, approve, reason, actor) {
  const why = String(reason ?? "").trim();
  const pending = pendingWaiver(engagement);

  if (closedToMoney(engagement)) return closedError;

  if (!approve) {
    if (!pending) return { ok: false, error: "No waiver is waiting here." };
    if (why.length < MIN_REASON) {
      return {
        ok: false,
        error: "Say why it is declined — whoever asked will read this.",
      };
    }
    engagement.waiver.declinedBy = actor.id;
    engagement.waiver.declinedByName = actor.name;
    engagement.waiver.declinedAt = new Date();
    engagement.waiver.declineReason = why;
    return { ok: true, approved: false, reason: pending.reason };
  }

  const basis = pending ? pending.reason : why;
  if (!basis || basis.length < MIN_REASON) {
    return { ok: false, error: "A waiver needs a reason." };
  }

  engagement.waiver = {
    reason: basis,
    // a partner waiving outright is both the asker and the approver, and the
    // record should not pretend somebody else raised it
    requestedBy: pending ? pending.requestedBy : actor.id,
    requestedByName: pending ? pending.requestedByName : actor.name,
    requestedAt: pending ? pending.requestedAt : new Date(),
    approvedBy: actor.id,
    approvedByName: actor.name,
    approvedAt: new Date(),
  };
  engagement.scope = "waived";
  engagement.scopeReason = basis;

  return { ok: true, approved: true, reason: basis };
}

/**
 * One line describing a settled scope, for the reports and the audit note:
 * "Waived — goodwill, our delay · asked by Neha Arora, approved by R. Gupta".
 */
export function scopeLine(engagement) {
  const scope = scopeOf(engagement);
  if (scope === "billable") return "";
  const head = `${SCOPE_LABELS[scope]}${
    engagement.scopeReason ? ` — ${engagement.scopeReason}` : ""
  }`;
  const w = engagement.waiver;
  if (scope !== "waived" || !w?.approvedByName) return head;
  const asker = w.requestedByName;
  return `${head} · ${
    asker && asker !== w.approvedByName
      ? `asked by ${asker}, approved by ${w.approvedByName}`
      : `approved by ${w.approvedByName}`
  }`;
}

/**
 * Money on an invoice is not ours to revise. Once something has been billed,
 * the way to change what the client owes is a credit note — the same rule
 * `correctFiling` applies to a filing record (P3-1).
 */
function closedToMoney(engagement) {
  return Boolean(
    engagement?.billingStatus && engagement.billingStatus !== "Unbilled",
  );
}

const closedError = {
  ok: /** @type {false} */ (false),
  error:
    "This work is already invoiced. Raise a credit note rather than changing what it was priced at.",
};

/**
 * Why this engagement cannot go on an invoice, or null if it can (P3-4).
 *
 * Read by the invoice builder, so a waived job cannot be billed by typing a
 * URL, and by the Billing list so the row says it before anybody clicks.
 */
export function blocksInvoice(engagement) {
  // settled another way: there is nothing to invoice and nothing pending
  if (!isChargeable(engagement)) {
    return SCOPE_LABELS[scopeOf(engagement)].toLowerCase();
  }
  const state = feeState(engagement);
  if (state.key === "fee-not-agreed") return "no fee has been agreed";
  if (state.key === "waiver-pending")
    return "a waiver is waiting for a partner";
  return null;
}

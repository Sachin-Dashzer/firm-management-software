// @ts-check

/**
 * The life of one requested document (P3-2, spec section 6).
 *
 * Spec section 6 has three states: Requested, Received, Verified. That is
 * enough to track a file arriving and enough to miss the two things that
 * actually hold work up — a file that arrived and is **wrong**, and a client
 * who **cannot produce** the thing at all. Both were a phone call nobody
 * recorded, and the job sat in "Awaiting documents" with no reason attached.
 *
 * So: Requested → Received → Format checked → Accepted, with Replacement
 * requested and Not required as the two ways out.
 *
 * Everything here is pure. The callers save and audit.
 */

export const PENDING = "Pending";
export const REQUESTED = "Requested";
export const RECEIVED = "Received";
export const FORMAT_CHECKED = "Format checked";
export const ACCEPTED = "Accepted";
export const REPLACEMENT = "Replacement requested";
export const NOT_REQUIRED = "Not required";
/** The old name for Accepted. Read, never written (P3-2). */
export const LEGACY_VERIFIED = "Verified";

export const CHECKLIST_STATES = [
  PENDING,
  REQUESTED,
  RECEIVED,
  FORMAT_CHECKED,
  ACCEPTED,
  REPLACEMENT,
  NOT_REQUIRED,
];

/**
 * Terminal states for the completion gate.
 *
 * `Not required` counts: an item a CA deliberately waived, with a reason on
 * the record, must not block the engagement for ever. That is what the old
 * gate did by demanding `Verified` and nothing else.
 */
export const SETTLED = [ACCEPTED, NOT_REQUIRED, LEGACY_VERIFIED];

/** Is this item done with, one way or the other? */
export const isSettled = (item) => SETTLED.includes(item?.status);

/** Waiting on the client, for any reason. */
export const isWaitingOnClient = (item) =>
  [REQUESTED, REPLACEMENT].includes(item?.status) ||
  Boolean(item?.clientReply && item.clientReply.kind === "cannot") ||
  Boolean(
    item?.clientReply &&
    item.clientReply.kind === "question" &&
    !item.clientReply.answer,
  );

/** Arrived and nobody at the firm has looked at it yet. */
export const needsReview = (item) =>
  [RECEIVED, FORMAT_CHECKED].includes(item?.status);

/**
 * What the client is shown. Deliberately fewer words than the firm sees:
 * "Format checked" is our business, not theirs — to them it is still with us.
 */
export function clientLabel(item) {
  switch (item?.status) {
    case ACCEPTED:
    case LEGACY_VERIFIED:
      return "Received, thank you";
    case NOT_REQUIRED:
      return "Not needed after all";
    case REPLACEMENT:
      return "Please send a replacement";
    case RECEIVED:
    case FORMAT_CHECKED:
      return "With us for checking";
    default:
      return "Please upload";
  }
}

/**
 * Record that the client sent something.
 *
 * **Clears every earlier check**, which is the point. A format check and an
 * acceptance belong to the file they were performed on; carrying them over
 * to a replacement would mean the system vouching for a file nobody looked
 * at. Returns the submission number so a document can be filed against it.
 *
 * @param {any} item
 * @param {{ formatOk?: boolean|null }} [checks]
 */
export function recordSubmission(item, checks = {}) {
  item.submissionCount = (item.submissionCount ?? 0) + 1;
  item.receivedAt = new Date();
  item.rejectReason = "";
  item.acceptedSubmission = null;
  item.acceptedBy = null;
  item.acceptedByName = "";
  item.verifiedBy = null;

  // a reply the client made about not having the thing is answered by
  // actually sending it, so it stops being an open question
  if (item.clientReply && item.clientReply.kind === "cannot") {
    item.clientReply = null;
  }

  item.status = checks.formatOk === true ? FORMAT_CHECKED : RECEIVED;
  return item.submissionCount;
}

/**
 * A person accepts. Not the format check — a person.
 *
 * @param {any} item
 * @param {{ id: string, name: string }} actor
 */
export function accept(item, actor) {
  if (isSettled(item)) {
    return {
      ok: false,
      error: `${item.name} is already ${item.status.toLowerCase()}.`,
    };
  }
  if (!needsReview(item)) {
    return {
      ok: false,
      error: `Nothing has arrived for ${item.name} yet, so there is nothing to accept.`,
    };
  }

  item.status = ACCEPTED;
  item.acceptedSubmission = item.submissionCount || 1;
  item.acceptedBy = actor.id;
  item.acceptedByName = actor.name;
  item.verifiedBy = actor.id;
  item.rejectReason = "";
  return { ok: true };
}

/**
 * Send it back, with words the client will read.
 *
 * The reason is mandatory and it is not for us: a client told "rejected"
 * sends the same wrong file again. A client told "these are August
 * challans, we need September" sends the right one.
 *
 * @param {any} item
 * @param {string} reason
 */
export function requestReplacement(item, reason) {
  const why = String(reason ?? "").trim();
  if (why.length < 5) {
    return {
      ok: false,
      error: "Say what is wrong with it, in words the client can act on.",
    };
  }
  if (!item.submissionCount) {
    return {
      ok: false,
      error: `Nothing has arrived for ${item.name}, so there is nothing to replace.`,
    };
  }

  item.status = REPLACEMENT;
  item.rejectReason = why;
  item.acceptedSubmission = null;
  item.acceptedBy = null;
  item.acceptedByName = "";
  item.verifiedBy = null;
  return { ok: true };
}

/**
 * Decide the firm does not need it after all — usually because the client
 * cannot produce it and the work can proceed without it.
 *
 * @param {any} item
 * @param {string} reason
 * @param {{ id: string, name: string }} actor
 */
export function markNotRequired(item, reason, actor) {
  const why = String(reason ?? "").trim();
  if (why.length < 5) {
    return {
      ok: false,
      error:
        "Say why it is not needed. A mandatory document waived without a reason is the thing a reviewer asks about.",
    };
  }
  item.status = NOT_REQUIRED;
  item.notRequiredReason = why;
  item.acceptedBy = actor.id;
  item.acceptedByName = actor.name;
  item.rejectReason = "";
  return { ok: true };
}

/** Ask for it. */
export function request(item) {
  if (isSettled(item)) {
    return { ok: false, error: `${item.name} is already settled.` };
  }
  item.status = REQUESTED;
  item.requestedAt = new Date();
  return { ok: true };
}

/* ---------------------------------------------------------------- client */

/**
 * "I don't have this."
 *
 * Recorded rather than argued with. The firm then decides: ask for an
 * alternative, or mark it not required and proceed.
 *
 * @param {any} item
 * @param {{ note?: string, byName: string }} args
 */
export function clientCannotProvide(item, { note = "", byName }) {
  if (isSettled(item)) {
    return { ok: false, error: "That item is already settled." };
  }
  item.clientReply = {
    kind: "cannot",
    note: String(note ?? "").trim(),
    byName,
    at: new Date(),
  };
  return { ok: true };
}

/**
 * "Someone else will send it."
 *
 * The client names a person; the **system** makes the one-item upload link
 * and sends it. The client never holds the token: a portal user minting a
 * link that works without signing in is an escalation, and the effect is
 * the same without it.
 *
 * @param {any} item
 * @param {{ name: string, contact: string, byName: string }} args
 */
export function clientDelegates(item, { name, contact, byName }) {
  const who = String(name ?? "").trim();
  const how = String(contact ?? "").trim();
  if (who.length < 2) return { ok: false, error: "Who will send it?" };
  if (how.length < 5) {
    return { ok: false, error: "Give them a mobile number or an email." };
  }
  if (isSettled(item)) {
    return { ok: false, error: "That item is already settled." };
  }

  item.clientReply = {
    kind: "delegated",
    delegateName: who,
    delegateContact: how,
    byName,
    at: new Date(),
  };
  return { ok: true, delegate: { name: who, contact: how } };
}

/**
 * "Please clarify."
 *
 * @param {any} item
 * @param {{ question: string, byName: string }} args
 */
export function clientAsks(item, { question, byName }) {
  const q = String(question ?? "").trim();
  if (q.length < 5) return { ok: false, error: "Type your question." };
  item.clientReply = {
    kind: "question",
    question: q,
    answer: "",
    byName,
    at: new Date(),
  };
  return { ok: true };
}

/**
 * The firm answers the question. The item is not settled by this — the
 * client still has to send the thing.
 *
 * @param {any} item
 * @param {string} answer
 * @param {{ id: string, name: string }} actor
 */
export function answerClient(item, answer, actor) {
  const a = String(answer ?? "").trim();
  if (a.length < 2) return { ok: false, error: "Type the answer." };
  if (!item.clientReply || item.clientReply.kind !== "question") {
    return { ok: false, error: "There is no question on that item." };
  }
  item.clientReply.answer = a;
  item.clientReply.answeredBy = actor.id;
  item.clientReply.answeredAt = new Date();
  return { ok: true };
}

/* ----------------------------------------------------------------- views */

/**
 * What the engagement is waiting for, in one line, for the job header and
 * the client portal.
 *
 * @param {any} engagement
 */
export function outstandingSummary(engagement) {
  const client = (engagement?.checklist ?? []).filter(
    (i) => i.side === "client",
  );
  const waiting = client.filter(isWaitingOnClient);
  const toCheck = client.filter(needsReview);
  const stuck = client.filter(
    (i) => i.clientReply && i.clientReply.kind === "cannot",
  );
  const asked = client.filter(
    (i) =>
      i.clientReply &&
      i.clientReply.kind === "question" &&
      !i.clientReply.answer,
  );

  return {
    total: client.length,
    settled: client.filter(isSettled).length,
    waiting: waiting.length,
    toCheck: toCheck.length,
    stuck: stuck.length,
    asked: asked.length,
    names: {
      waiting: waiting.map((i) => i.name),
      toCheck: toCheck.map((i) => i.name),
    },
  };
}

/** Mandatory client items that are not settled — the completion gate. */
export function blockingItems(engagement) {
  return (engagement?.checklist ?? []).filter(
    (i) => i.mandatory && !isSettled(i),
  );
}

// @ts-check

import { daysUntil } from "../dates.js";
import { CLOSED_STATUSES } from "../engagements/status.js";

/**
 * The three practice books: Audits, Statutory and Tax (P2-8a).
 *
 * None of these is a new kind of work. They are **views over engagements**,
 * grouped by the service's category, each showing the handful of columns the
 * question actually needs — "what have we signed and was it clean", "what is
 * going to the Registrar and when did it go", "which returns are in and which
 * are late". A second place to record the state of a job would be a second
 * place to forget to update.
 *
 * Kept apart from the model and the screens so the page, the spreadsheet and
 * the tests read one definition of each book.
 */

/**
 * The kinds of audit a firm this size takes on. Not a statutory list — it is
 * the firm's own vocabulary for sorting its work, and "Other" catches what we
 * have not named.
 */
export const AUDIT_TYPES = [
  "Statutory audit",
  "Tax audit",
  "GST audit",
  "Internal audit",
  "Stock audit",
  "Concurrent audit",
  "Other",
];

/**
 * The four opinions of SA 700 / SA 705, plus the state every audit starts in.
 * These are the standard's words rather than ours (owner default, 20-10-2026).
 */
export const OPINIONS = [
  "Not yet issued",
  "Unmodified",
  "Qualified",
  "Adverse",
  "Disclaimer",
];

/** An opinion that is not clean has to say why, in the file, at the time. */
export const MODIFIED_OPINIONS = ["Qualified", "Adverse", "Disclaimer"];

/** Every column any book can show, named once. */
export const COLUMNS = {
  code: { label: "Code", kind: "text" },
  client: { label: "Client", kind: "text" },
  service: { label: "Service", kind: "text" },
  auditType: { label: "Audit type", kind: "text" },
  period: { label: "Period", kind: "text" },
  status: { label: "Status", kind: "text" },
  appointmentDate: { label: "Appointed", kind: "date" },
  reportDate: { label: "Report date", kind: "date" },
  opinion: { label: "Opinion", kind: "text" },
  udin: { label: "UDIN", kind: "text" },
  member: { label: "Signed by", kind: "text" },
  eventDate: { label: "AGM / event", kind: "date" },
  due: { label: "Due", kind: "date" },
  filedOn: { label: "Filed on", kind: "date" },
  ackNo: { label: "Ack / SRN no.", kind: "text" },
  lateDays: { label: "Days late", kind: "int" },
};

/**
 * Which service categories each book reads.
 *
 * Payroll and Labour sits in Tax rather than Statutory (owner default,
 * 20-10-2026): PF, ESI and PT are returns with a deadline, and Statutory is
 * the Registrar's book. Accounting, Advisory, Registrations and Certification
 * belong to no book — they are work, not filings.
 */
export const BOOKS = {
  audits: {
    title: "Audits",
    blurb:
      "Every audit and assurance engagement, what was signed against it, and whether the opinion was clean.",
    categories: ["Audit and Assurance"],
    columns: [
      "code",
      "client",
      "auditType",
      "period",
      "status",
      "reportDate",
      "opinion",
      "udin",
      "member",
    ],
  },
  statutory: {
    title: "Statutory",
    blurb:
      "Company law and ROC filings: what is due, what has gone in, and the SRN it came back with.",
    categories: ["Company Law / ROC"],
    columns: [
      "code",
      "client",
      "service",
      "period",
      "eventDate",
      "due",
      "filedOn",
      "ackNo",
      "lateDays",
    ],
  },
  tax: {
    title: "Tax",
    blurb:
      "Direct and indirect tax returns, payroll filings included: filed, due, or late.",
    categories: ["Direct Tax", "Indirect Tax", "Payroll and Labour"],
    columns: [
      "code",
      "client",
      "service",
      "period",
      "due",
      "filedOn",
      "ackNo",
      "lateDays",
    ],
  },
};

export const BOOK_KEYS = Object.keys(BOOKS);

/**
 * The book a service category belongs to, or "" for one that has none. Used
 * to send somebody from an engagement to the register it appears in, and to
 * revalidate the right page when a filing is saved.
 *
 * @param {string} category
 * @returns {string}
 */
export function bookOf(category) {
  return (
    BOOK_KEYS.find((key) => BOOKS[key].categories.includes(category)) ?? ""
  );
}

/** Is this engagement audit work, i.e. does it carry an audit report? */
export function isAuditWork(engagement) {
  return bookOf(engagement?.templateSnapshot?.category ?? "") === "audits";
}

/**
 * Audit work whose report does not yet say which opinion was given.
 *
 * Blank is a legitimate state while the work is in progress — the opinion is
 * the signing CA's judgement and is formed at the end, not at the start. What
 * it cannot be is the state the file is *left* in: an opinion is the audit,
 * so a file carrying a UDIN or marked Completed without one is not a draft,
 * it is a gap in the record. "Not yet issued" counts as missing here for the
 * same reason — it says in words that there is nothing to report yet.
 *
 * Nothing here guesses an opinion. Choosing one is professional judgement,
 * so the only thing code does is refuse to let the file be closed without it.
 *
 * @param {any} engagement
 * @returns {boolean}
 */
export function missingOpinion(engagement) {
  if (!isAuditWork(engagement)) return false;
  const opinion = engagement?.assurance?.opinion ?? "";
  return !opinion || opinion === "Not yet issued";
}

/**
 * The same question as a database filter, for the two things that have to
 * ask it of every record at once: `npm run opinions:empty` and the doctor.
 *
 * Written once here so the report and the health check cannot come to
 * different answers about the same engagement.
 */
export const EMPTY_OPINION_QUERY = {
  "templateSnapshot.category": { $in: BOOKS.audits.categories },
  $or: [
    { "assurance.opinion": { $in: ["", null, "Not yet issued"] } },
    { "assurance.opinion": { $exists: false } },
    { assurance: { $exists: false } },
  ],
};

/**
 * ...and the ones that are past the point where blank is acceptable: closed,
 * numbered, or carrying a report date.
 */
export const CLOSED_WITHOUT_OPINION_QUERY = {
  ...EMPTY_OPINION_QUERY,
  $and: [
    {
      $or: [
        { status: "Completed" },
        { udin: { $nin: ["", null] } },
        { "assurance.reportDate": { $nin: [null] } },
      ],
    },
  ],
};

/**
 * How many days after its deadline this was filed.
 *
 * Filed **on** the due date is not late, which is why this compares whole IST
 * days rather than moments: a return filed at 11pm on the 31st is on time.
 * No deadline recorded means the question cannot be answered, and an
 * unanswered question is not a late filing.
 *
 * @param {Date|string|null|undefined} filedOn
 * @param {Date|string|null|undefined} statutoryDue
 * @returns {number} days late, 0 when on time or not answerable
 */
export function daysLate(filedOn, statutoryDue) {
  if (!filedOn || !statutoryDue) return 0;
  const late = -daysUntil(statutoryDue, new Date(filedOn));
  return late > 0 ? late : 0;
}

/**
 * How a row reads on the register: filed, late, overdue or still open.
 *
 * "Overdue" here is the statutory deadline passed with nothing filed, which
 * is a different thing from an engagement running behind its internal date —
 * and the reason the statutory date governs on these pages.
 *
 * @param {{filedOn?: Date|null, statutoryDue?: Date|null, status?: string}} e
 * @param {Date} [now]
 */
export function filingState(e, now = new Date()) {
  if (e.filedOn) {
    const late = daysLate(e.filedOn, e.statutoryDue);
    return late > 0
      ? { state: "late", label: `${late} ${late === 1 ? "day" : "days"} late` }
      : { state: "filed", label: "Filed on time" };
  }
  if (CLOSED_STATUSES.includes(e.status ?? "")) {
    return { state: "closed", label: "No filing recorded" };
  }
  if (e.statutoryDue && daysUntil(e.statutoryDue, now) < 0) {
    return { state: "overdue", label: "Past the deadline, not filed" };
  }
  return { state: "open", label: "Not filed yet" };
}

/**
 * A modified opinion has to carry its reason (SA 705). An audit report that
 * was not clean, with nothing in the file saying why, is what a peer reviewer
 * asks about first.
 *
 * @param {{opinion?: string, auditType?: string, qualificationNote?: string}} assurance
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function checkAssurance(assurance = {}) {
  const opinion = assurance.opinion ?? "";
  if (opinion && !OPINIONS.includes(opinion)) {
    return { ok: false, error: "That is not one of the opinions." };
  }
  if (assurance.auditType && !AUDIT_TYPES.includes(assurance.auditType)) {
    return { ok: false, error: "That is not one of the audit types." };
  }
  if (
    MODIFIED_OPINIONS.includes(opinion) &&
    !(assurance.qualificationNote ?? "").trim()
  ) {
    return {
      ok: false,
      error: `A ${opinion.toLowerCase()} opinion has to say what it is modified for.`,
    };
  }
  return { ok: true };
}

/**
 * One engagement as a book row: raw values, formatted by nobody.
 *
 * The screen and the spreadsheet both call this, so a column cannot say one
 * thing on the page and another in Excel. Dates stay dates — the spreadsheet
 * writer wants them sortable and the page formats them in IST.
 *
 * @param {any} e a lean engagement
 * @param {{clientName?: Map<string,string>, signer?: Map<string,string>}} lookups
 * @param {Date} [now]
 */
export function bookRow(e, lookups = {}, now = new Date()) {
  const assurance = e.assurance ?? {};
  const state = filingState(e, now);
  return {
    id: String(e._id),
    clientId: String(e.clientId),
    state: state.state,
    stateLabel: state.label,
    cells: {
      code: e.code ?? "",
      client: lookups.clientName?.get(String(e.clientId)) ?? "A client",
      service: e.templateSnapshot?.name ?? "",
      auditType: assurance.auditType ?? "",
      period: e.periodLabel || e.period || "",
      status: e.status ?? "",
      appointmentDate: assurance.appointmentDate ?? null,
      reportDate: assurance.reportDate ?? null,
      opinion: assurance.opinion ?? "",
      udin: e.udin ?? "",
      // from the UDIN register, not a field of our own: the member a report
      // was signed against is recorded there once (P2-7), and a copy here
      // would be free to disagree with it
      member: lookups.signer?.get(String(e._id)) ?? "",
      eventDate: e.eventDate ?? null,
      due: e.statutoryDue ?? e.internalDue ?? null,
      filedOn: e.filedOn ?? null,
      ackNo: e.ackNo ?? "",
      lateDays: daysLate(e.filedOn, e.statutoryDue),
    },
  };
}

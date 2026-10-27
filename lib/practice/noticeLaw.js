// @ts-check

/**
 * The law behind a notice, as a table the firm confirms (P3-11).
 *
 * **Nothing in here is authority.** CLAUDE.md rule 8: never invent a
 * statutory date or a tax rule — seed them from a table the owner verifies,
 * and flag anything uncertain. So every rule below arrives
 * **unconfirmed**, carries the section it comes from, and produces no date
 * on any screen until a partner has read it and ticked it. An unchecked
 * limitation date is worse than none, because people act on a date and a
 * limitation date that is wrong by a week loses a client their appeal.
 *
 * The wording and the citations are taken from the `CA-Firm-OS-v6.2`
 * prototype, which carries "to be verified by a practising CA before use"
 * throughout. They are a first draft for a partner to correct, not a
 * statement of the law by this system.
 *
 * `offset` is what lets a confirmed rule become a date. It says what to
 * count from and how far; a rule with no offset is guidance a person acts
 * on rather than a clock. `from` names a field on the notice, so the
 * arithmetic is visible rather than buried.
 */

/** What the firm can file against a notice. */
export const SUBMISSION_TYPES = [
  "Reply",
  "Additional reply",
  "Adjournment request",
  "Written submissions",
  "Rectification application",
  "Appeal",
];

/** The laws a notice can come under. */
export const NOTICE_LAWS = ["Income tax", "GST", "Other"];

export const NOTICE_STAGES = [
  "Notice received",
  "Reply",
  "Hearing",
  "Order",
  "Appeal",
  "Closed",
];

/**
 * @typedef {object} LawRule
 * @property {string} key
 * @property {string} text      what the rule says, in the firm's words
 * @property {string} cite      the section it comes from
 * @property {{from: string, months?: number, years?: number, days?: number, direction?: -1|1}} [offset]
 * @property {number} [adjournmentCap]  hearings may be put off this many times
 */

/** @type {Record<string, { label: string, law: string, rules: LawRule[] }>} */
export const NOTICE_KINDS = {
  SCN74: {
    label: "GST SCN under s.74 (fraud or suppression; FY up to 2023-24)",
    law: "GST",
    rules: [
      {
        key: "order",
        text: "The order must be passed within 5 years of the due date of the annual return for that year",
        cite: "s.74(10) CGST Act",
        offset: { from: "annualReturnDue", years: 5 },
      },
      {
        key: "scn",
        text: "The show cause notice must be issued at least 6 months before that last date",
        cite: "s.74(2) CGST Act",
        offset: { from: "annualReturnDue", years: 5, months: -6 },
      },
      {
        key: "adjournments",
        text: "A personal hearing may be adjourned at most 3 times",
        cite: "s.75(5) CGST Act",
        adjournmentCap: 3,
      },
      {
        key: "appeal",
        text: "Appeal against the order within 3 months, with one further month on sufficient cause",
        cite: "s.107(1) and (4) CGST Act",
        offset: { from: "orderDate", months: 3 },
      },
      {
        key: "predeposit",
        text: "Pre-deposit for an appeal: the admitted amount, plus 10% of the disputed tax",
        cite: "s.107(6) CGST Act",
      },
    ],
  },

  SCN73: {
    label: "GST SCN under s.73 (no fraud; FY up to 2023-24)",
    law: "GST",
    rules: [
      {
        key: "order",
        text: "The order must be passed within 3 years of the due date of the annual return",
        cite: "s.73(10) CGST Act",
        offset: { from: "annualReturnDue", years: 3 },
      },
      {
        key: "scn",
        text: "The show cause notice must be issued at least 3 months before that last date",
        cite: "s.73(2) CGST Act",
        offset: { from: "annualReturnDue", years: 3, months: -3 },
      },
      {
        key: "adjournments",
        text: "A personal hearing may be adjourned at most 3 times",
        cite: "s.75(5) CGST Act",
        adjournmentCap: 3,
      },
      {
        key: "appeal",
        text: "Appeal within 3 months, with one further month on sufficient cause",
        cite: "s.107 CGST Act",
        offset: { from: "orderDate", months: 3 },
      },
    ],
  },

  ASMT10: {
    label: "GST scrutiny of returns (ASMT-10)",
    law: "GST",
    rules: [
      {
        key: "reply",
        text: "Reply in ASMT-11 within 30 days of the notice, or longer if the officer allows",
        cite: "Rule 99(2) CGST Rules",
        offset: { from: "servedOn", days: 30 },
      },
      {
        key: "close",
        text: "If the reply is accepted the proceedings close in ASMT-12",
        cite: "Rule 99(3) CGST Rules",
      },
      {
        key: "escalate",
        text: "If it is not accepted, the officer may start action under s.73 or s.74",
        cite: "s.61(3) CGST Act",
      },
    ],
  },

  IT148A: {
    label: "Income tax — show cause before reopening",
    law: "Income tax",
    rules: [
      {
        key: "reply",
        text: "Reply within the time stated in the notice",
        cite: "s.148A, Income-tax Act 1961",
      },
      {
        key: "order",
        text: "Keep the order on whether to reopen; it can be challenged",
        cite: "s.148A, Income-tax Act 1961",
      },
      {
        key: "appeal",
        text: "Appeal against a reassessment order to CIT(A) within 30 days of service",
        cite: "s.249(2), Income-tax Act 1961",
        offset: { from: "orderDate", days: 30 },
      },
      {
        key: "act2025",
        text: "For notices under the Income-tax Act 2025, the matching sections have to be mapped before this table is relied on",
        cite: "A partner must settle this",
      },
    ],
  },

  IT142: {
    label: "Income tax — enquiry before assessment",
    law: "Income tax",
    rules: [
      {
        key: "reply",
        text: "Reply within the time stated in the notice",
        cite: "s.142(1), Income-tax Act 1961",
      },
      {
        key: "assessment",
        text: "The assessment time limit runs from the end of the assessment year",
        cite: "s.153, Income-tax Act 1961 — a partner must settle the date",
      },
      {
        key: "appeal",
        text: "Appeal against the assessment to CIT(A) within 30 days of service",
        cite: "s.249(2), Income-tax Act 1961",
        offset: { from: "orderDate", days: 30 },
      },
    ],
  },

  CITA: {
    label: "Income tax — appeal before CIT(A)",
    law: "Income tax",
    rules: [
      {
        key: "submissions",
        text: "Written submissions by the hearing date; an adjournment on request",
        cite: "The hearing notice itself",
      },
      {
        key: "itat",
        text: "Appeal against the CIT(A) order to the ITAT within the period in s.253(3)",
        cite: "s.253(3) — a partner must confirm the period as amended",
      },
      {
        key: "stay",
        text: "Stay of demand: apply to the assessing officer while the appeal is pending",
        cite: "CBDT instructions — a partner must confirm the current percentage",
      },
    ],
  },
};

/** Every rule in the table, flattened, for the seed and the settings strip. */
export function allLawRules() {
  return Object.entries(NOTICE_KINDS).flatMap(([kind, entry]) =>
    entry.rules.map((rule) => ({ kind, label: entry.label, ...rule })),
  );
}

/** IST is a fixed +05:30, so the offset is exact arithmetic. */
const IST = 5.5 * 3_600_000;

/**
 * Add months, years and days to a date, on the Indian calendar, without
 * drifting.
 *
 * Two traps, and both of them move a limitation date by a day or two, which
 * is the difference between an appeal filed in time and one that is not:
 *
 *  - every date in this system is an **IST midnight**, which is 18:30 UTC
 *    the day before. Doing the arithmetic in UTC therefore works on the
 *    wrong day of the month, and the first test written for this caught it:
 *    31 January came out as 1 March instead of 28 February. So the instant
 *    is shifted into IST, the calendar arithmetic is done there, and it is
 *    shifted back
 *  - `setUTCMonth` past the end of a short month rolls forward on its own,
 *    so the day is clamped to the last day of the target month, which is
 *    how a limitation period is read
 *
 * @param {Date} from
 * @param {{years?: number, months?: number, days?: number}} by
 */
export function shiftDate(from, by) {
  const date = new Date(from.getTime() + IST);
  const day = date.getUTCDate();

  if (by.years || by.months) {
    date.setUTCDate(1);
    date.setUTCFullYear(date.getUTCFullYear() + (by.years ?? 0));
    date.setUTCMonth(date.getUTCMonth() + (by.months ?? 0));
    const lastDay = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
  }
  if (by.days) date.setUTCDate(date.getUTCDate() + by.days);

  return new Date(date.getTime() - IST);
}

// @ts-check

/**
 * A first draft of the statutory due-date master (spec section 8).
 *
 * **Every row here is unverified and the system treats it that way.** The
 * generator will not put any of these dates on an engagement until a
 * partner has confirmed the rule in Settings → Due dates (CLAUDE.md rule 8).
 *
 * How this draft was made, so the person checking it knows what they are
 * checking: the dates were looked up on the web in October 2026. **No
 * official source was found** — not gst.gov.in, not incometax.gov.in, not
 * an MCA circular. Everything below comes from third-party tax calendars
 * that agree with each other and with long-standing practice, which is
 * evidence of the usual position and nothing more.
 *
 * Where the sources disagreed, the `caution` line says so rather than
 * quietly picking one. Those rows need the most attention.
 */

/** @typedef {import("../../models/DueDateRule.js")} DueDateRule */

const SEARCHED = "Third-party tax calendars, checked October 2026";

export const STARTER_DUE_RULES = [
  {
    serviceCode: "GSTR3B",
    name: "GSTR-1 / GSTR-3B filing",
    periodType: "monthly",
    // GSTR-3B is the later of the pair, so it governs the engagement
    formula: { kind: "dayOfMonth", day: 20, monthsAfter: 1 },
    source: SEARCHED,
    sourceUrl: "https://www.gst.gov.in/",
    caution:
      "This is the monthly filer's date (GSTR-1 on the 11th, GSTR-3B on the 20th). QRMP clients are different — GSTR-1 on the 13th after the quarter and GSTR-3B on the 22nd or 24th depending on the state group, and the sources disagreed about which states fall in which group. If the firm has QRMP clients, this needs a second rule.",
  },
  {
    serviceCode: "GSTR9",
    name: "GST annual return (GSTR-9 / 9C)",
    periodType: "annual",
    // 31 December following the financial year end
    formula: { kind: "dayOfMonth", day: 31, monthsAfter: 9 },
    source: SEARCHED,
    sourceUrl: "https://www.gst.gov.in/",
    caution:
      "Commonly extended. Check for a CBIC notification each year before relying on it.",
  },
  {
    serviceCode: "TDS-RET",
    name: "TDS return (24Q / 26Q) and Form 16 / 16A",
    periodType: "quarterly",
    // Q1-Q3: the last day of the month after the quarter
    formula: { kind: "dayOfMonth", day: 31, monthsAfter: 1 },
    variants: [
      {
        // Q4 (Jan-Mar) is 31 May, two months after the quarter ends
        match: "Q4",
        formula: { kind: "dayOfMonth", day: 31, monthsAfter: 2 },
        note: "The March quarter is due 31 May, not 30 April.",
      },
    ],
    source: SEARCHED,
    sourceUrl: "https://www.incometax.gov.in/",
    caution:
      "Form 16 is due 15 June and Form 16A within 15 days of the return — both after this date. If the firm treats the certificate as the deliverable rather than the return, this rule needs to say so.",
  },
  {
    serviceCode: "ITR-SAL",
    name: "ITR — salaried individual",
    periodType: "annual",
    // 31 July following the financial year
    formula: { kind: "dayOfMonth", day: 31, monthsAfter: 4 },
    source: SEARCHED,
    sourceUrl: "https://www.incometax.gov.in/",
    caution:
      "Extended in several recent years. The extension tool handles that once it happens.",
  },
  {
    serviceCode: "ITR-BUS",
    name: "ITR — business / firm / company",
    periodType: "annual",
    // 31 October for audit cases
    formula: { kind: "dayOfMonth", day: 31, monthsAfter: 7 },
    source: SEARCHED,
    sourceUrl: "https://www.incometax.gov.in/",
    caution:
      "This is the audit-case date. A non-audit business return is 31 July, and a transfer-pricing case is 30 November — the firm may want three rules rather than one. One source reported the AY 2026-27 audit date being extended to 21 November 2026, which shows how often this moves.",
  },
  {
    serviceCode: "TAX-AUD",
    name: "Tax audit (Form 3CA/3CB-3CD)",
    periodType: "annual",
    // 30 September following the financial year
    formula: { kind: "dayOfMonth", day: 30, monthsAfter: 6 },
    source: SEARCHED,
    sourceUrl: "https://www.incometax.gov.in/",
    caution: "Frequently extended, usually together with the audit ITR date.",
  },
  {
    serviceCode: "STAT-AUD",
    name: "Statutory audit (company)",
    periodType: "annual",
    // tied to the AGM, which must be held within six months of year end
    formula: { kind: "dayOfMonth", day: 30, monthsAfter: 6 },
    source: SEARCHED,
    sourceUrl: "https://www.mca.gov.in/",
    caution:
      "There is no statutory date for the audit itself — this is the AGM deadline under section 96, which the audit must precede. The firm may prefer an internal date instead.",
  },
  {
    serviceCode: "ROC-ANN",
    name: "ROC annual filing (AOC-4, MGT-7)",
    periodType: "annual",
    // 30 days after the AGM for AOC-4; MGT-7 is 60
    formula: { kind: "daysAfterEvent", event: "AGM", days: 30 },
    source: SEARCHED,
    sourceUrl: "https://www.mca.gov.in/",
    caution:
      "This one depends on each client's actual AGM date, which has to be entered on the engagement. MGT-7 is 60 days after the AGM, so a second rule may be wanted. As at mid-October 2026 the MCA had not granted the extension ICSI asked for.",
  },
  {
    serviceCode: "PAYROLL",
    name: "Payroll, PF / ESI returns",
    periodType: "monthly",
    // the 15th of the following month
    formula: { kind: "dayOfMonth", day: 15, monthsAfter: 1 },
    source: SEARCHED,
    sourceUrl: "https://www.epfindia.gov.in/",
    caution:
      "Sources agreed on the 15th for PF, but one put ESI on the 21st. Worth confirming against the EPFO and ESIC portals before this drives a reminder.",
  },
  {
    serviceCode: "BOOKS",
    name: "Bookkeeping",
    periodType: "monthly",
    // the firm's own promise, not the law
    formula: { kind: "dayOfMonth", day: 10, monthsAfter: 1 },
    source: "The firm's own service standard (spec section 4)",
    caution:
      "Not a statutory date at all — this is the turnaround the firm promises. Confirm it is still what the firm wants to be held to.",
  },
  {
    serviceCode: "IT-NOTICE",
    name: "Income tax notice / assessment reply",
    periodType: "one-time",
    formula: { kind: "daysAfterEvent", event: "notice date", days: 30 },
    source: "Each notice states its own deadline",
    caution:
      "The 30 days is only a placeholder: every notice carries its own date, which must be entered on the engagement. Confirm the firm wants a default at all.",
  },
];

/** Services in the starter catalog that deliberately have no statutory date. */
export const NO_STATUTORY_DATE = ["INCORP", "REG-NEW", "CERT-NW", "ADVISORY"];

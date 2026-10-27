// @ts-check

/**
 * The shape of an audit file, and the standards each part of it answers to
 * (P3-13).
 *
 * **Nothing here is authority.** Every reference is a pointer to a standard
 * a partner has to read, and until they confirm it the file says so rather
 * than implying the firm has complied with something. CLAUDE.md rule 8 reads
 * "never invent statutory due dates or tax rules"; a Standard on Auditing is
 * squarely within the spirit of that, and the gap report is explicit that
 * this module "needs a partner's sign-off on every standard reference before
 * a line is written".
 *
 * So what is written is: the stages, the areas, the questions, and the
 * references **as the prototype states them** — and a confirmation
 * mechanism, shared with the notice-law table and the GST set-off order
 * (`models/RuleConfirmation.js`).
 */

export const CONFIRM_KIND = "AUDIT-AREA";

/** The seven stages a file moves through, in order. */
export const AUDIT_STAGES = [
  "Acceptance",
  "Planning",
  "Risk",
  "Fieldwork",
  "Review",
  "Report + UDIN",
  "File closure",
];

/**
 * @typedef {object} AuditArea
 * @property {string} key    the letter the working papers are filed under
 * @property {string} name
 * @property {string} standards  the references, as stated
 * @property {string} stage  which stage it belongs to
 * @property {string[]} questions  the programme for the area
 */

/**
 * The ten areas, their letters and their references, from the prototype's
 * own working-paper index.
 *
 * The letters are not sequential (there is no D or I) and that is on
 * purpose: they are the firm's filing letters, and renumbering them would
 * break every reference in a file somebody has already made up.
 *
 * @type {AuditArea[]}
 */
export const AUDIT_AREAS = [
  {
    key: "A",
    name: "Acceptance and engagement",
    standards: "SA 210, SA 220",
    stage: "Acceptance",
    questions: [
      "The terms of the engagement are agreed in writing and on the file",
      "Independence has been considered and recorded for everyone on the job",
      "The firm has the people and the time to do this work",
      "Where this is a continuing audit, the previous year's file has been read",
    ],
  },
  {
    key: "B",
    name: "Planning and materiality",
    standards: "SA 300, SA 320",
    stage: "Planning",
    questions: [
      "Materiality is set, with the basis written down",
      "Performance materiality and the threshold for trivial items are set",
      "The audit plan names who does what and when",
      "The team has been briefed and the briefing is on the file",
    ],
  },
  {
    key: "C",
    name: "Risk assessment and fraud",
    standards: "SA 315, SA 240",
    stage: "Risk",
    questions: [
      "The entity and its environment are understood and recorded",
      "Risks are identified at the assertion level, with the planned response",
      "Fraud risk has been discussed with the team and with management",
      "Related parties are identified from the register, not only from management",
    ],
  },
  {
    key: "E",
    name: "Revenue and receivables",
    standards: "SA 500, SA 505",
    stage: "Fieldwork",
    questions: [
      "Revenue recognition is tested against the policy and the contracts",
      "Cut-off around the year end has been tested in both directions",
      "Balances are confirmed directly, or the alternative procedure is recorded",
      "Ageing is reviewed and the provision is reasoned",
    ],
  },
  {
    key: "F",
    name: "Inventory",
    standards: "SA 501",
    stage: "Fieldwork",
    questions: [
      "Physical verification was attended, or why it was not is recorded",
      "Counts are reconciled to the books with differences explained",
      "Valuation is tested, including the basis for any write-down",
      "Inventory held by third parties is confirmed",
    ],
  },
  {
    key: "G",
    name: "Fixed assets and depreciation",
    standards: "Schedule II, Companies Act 2013",
    stage: "Fieldwork",
    questions: [
      "Additions and disposals are vouched to documents of title",
      "Useful lives are compared with Schedule II, and any difference is reasoned",
      "Depreciation is recomputed on a sample",
      "Capital work in progress is reviewed for items that should have been capitalised",
    ],
  },
  {
    key: "H",
    name: "Purchases, payables and MSME",
    standards: "SA 500, SA 530",
    stage: "Fieldwork",
    questions: [
      "Purchases are tested for occurrence and for the period they belong to",
      "Payables are tested for completeness, including unrecorded liabilities",
      "MSME status is obtained from suppliers and the ageing disclosure is prepared",
      "Related-party purchases are identified and the approvals are on the file",
    ],
  },
  {
    key: "J",
    name: "Borrowings and finance cost",
    standards: "SA 505",
    stage: "Fieldwork",
    questions: [
      "Balances and terms are confirmed with the lenders",
      "Charges are checked against the register and the filings",
      "Covenants are tested and breaches are reported",
      "Interest is recomputed and compared with the sanction terms",
    ],
  },
  {
    key: "N",
    name: "Taxation",
    standards: "AS 22 / Ind AS 12",
    stage: "Fieldwork",
    questions: [
      "Current tax is recomputed and agreed with the return and the challans",
      "Deferred tax is recomputed on the timing differences",
      "Demands, appeals and contingencies are listed with their status",
      "Tax audit observations are reconciled with the financial statements",
    ],
  },
  {
    key: "Z",
    name: "Completion and representations",
    standards: "SA 560, SA 570, SA 580",
    stage: "Review",
    questions: [
      "Events after the balance sheet date are reviewed up to the report date",
      "Going concern is assessed and the basis is recorded",
      "Written representations are obtained and dated no earlier than the report",
      "The unadjusted differences schedule is complete and has been considered",
    ],
  },
];

/** Every standard reference in the index, as a rule to be confirmed. */
export function allStandardRules() {
  return AUDIT_AREAS.map((area) => ({
    key: area.key,
    name: area.name,
    standards: area.standards,
    stage: area.stage,
  }));
}

/** The areas belonging to one stage. */
export function areasForStage(stage) {
  return AUDIT_AREAS.filter((area) => area.stage === stage);
}

/**
 * How far an area has got, and whether anybody may say it is done.
 *
 * An area is not complete while an exception on it is unresolved — which is
 * the rule a percentage bar quietly breaks. The prototype's own index shows
 * the two numbers side by side (per cent done, open exceptions) for exactly
 * that reason, so both travel together here.
 *
 * @param {{questions?: Array<{done?: boolean}>}} area  as stored on the file
 * @param {number} openExceptions
 */
export function areaProgress(area, openExceptions = 0) {
  const questions = area?.questions ?? [];
  const done = questions.filter((row) => row.done).length;
  const percent = questions.length
    ? Math.round((done / questions.length) * 100)
    : 0;

  return {
    done,
    total: questions.length,
    percent,
    openExceptions,
    /**
     * Deliberately not "percent === 100": an area with every question ticked
     * and an exception nobody has resolved is not finished, and a file that
     * says it is is the file a peer reviewer picks up.
     */
    complete:
      questions.length > 0 && done === questions.length && openExceptions === 0,
    why:
      openExceptions > 0
        ? `${openExceptions} ${openExceptions === 1 ? "exception is" : "exceptions are"} still open on this area.`
        : questions.length === 0
          ? "No programme on this area yet."
          : done < questions.length
            ? `${questions.length - done} of ${questions.length} still to do.`
            : "",
  };
}

/**
 * Build the areas for a new file from the index above.
 *
 * Copied in, not referred to — the same rule the engagement's template
 * snapshot follows (spec §13). Changing the programme next year must not
 * reach back into a file that has been signed.
 */
export function buildAuditAreas() {
  return AUDIT_AREAS.map((area) => ({
    key: area.key,
    name: area.name,
    standards: area.standards,
    stage: area.stage,
    questions: area.questions.map((text) => ({ text, done: false })),
  }));
}

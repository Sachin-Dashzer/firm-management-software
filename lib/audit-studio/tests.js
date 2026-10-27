// @ts-check

/**
 * The tests a file records against the whole ledger, not a sample (P3-14).
 *
 * **What this is, honestly.** Spec §1 puts the accounting ledger out of
 * scope: this system does not hold the client's vouchers, so it cannot run
 * these tests itself. What it does is hold the *programme* — the sixteen
 * tests, what each one is for, the authority it answers to, the population
 * it was run over, and what came out. The running happens in the firm's
 * own tool (Tally, Excel, whatever the data lab eventually becomes), and
 * every flagged item is raised here as an exception, which then has the
 * lifecycle P3-13 built.
 *
 * That is a smaller claim than the prototype's "16 tests on every voucher",
 * and it is the true one. Writing a test runner over a ledger this system
 * has never seen would be a screen that reports zero flags because there is
 * nothing to test, which is worse than no screen.
 *
 * The value of recording them is real all the same: **population and flags
 * side by side**. "Sampled 25 of 14,286" and "tested 14,286, 23 flagged"
 * are different audits, and a file that cannot tell you which one it was is
 * a file that cannot answer the only question a reviewer asks about scope.
 */

/**
 * @typedef {object} LedgerTest
 * @property {string} key
 * @property {string} area
 * @property {string} name
 * @property {string} ref     the authority: a standard, a section, a clause
 * @property {string[]} feeds which CARO or 3CD answers this test pre-fills
 */

/** @type {LedgerTest[]} */
export const LEDGER_TESTS = [
  {
    key: "T1",
    area: "Journal entries",
    name: "Weekend, holiday and after-year-end postings",
    ref: "SA 240",
    feeds: [],
  },
  {
    key: "T2",
    area: "Journal entries",
    name: "Round amounts of ₹1 lakh and above to revenue or expenses",
    ref: "SA 240",
    feeds: [],
  },
  {
    key: "T3",
    area: "Purchases",
    name: "Possible duplicate invoices — same supplier, same amount, within 7 days",
    ref: "SA 500",
    feeds: [],
  },
  {
    key: "T4",
    area: "Payments",
    name: "Cash payments above ₹10,000 in a day to one person",
    ref: "s.40A(3)",
    feeds: ["3CD 21(d)"],
  },
  {
    key: "T5",
    area: "Loans",
    name: "Loans taken or repaid in cash of ₹20,000 or more",
    ref: "s.269SS / s.269T",
    feeds: ["3CD 31"],
  },
  {
    key: "T6",
    area: "TDS",
    name: "Expense parties above the TDS thresholds with no TDS deducted",
    ref: "s.40(a)(ia)",
    feeds: ["3CD 21(b)", "3CD 34"],
  },
  {
    key: "T7",
    area: "GST",
    name: "Credit taken in the books that is not in GSTR-2B",
    ref: "s.16(2)(aa) CGST Act",
    feeds: [],
  },
  {
    key: "T8",
    area: "MSME",
    name: "MSME suppliers unpaid beyond 45 days at the year end",
    ref: "s.43B(h)",
    feeds: ["3CD 22", "CARO (vii)"],
  },
  {
    key: "T9",
    area: "Related parties",
    name: "Transactions with related parties, from the group register",
    ref: "AS 18 · s.188",
    feeds: ["CARO (xiii)"],
  },
  {
    key: "T10",
    area: "Revenue",
    name: "Cut-off: invoices either side of the year end against e-way bill dates",
    ref: "SA 500",
    feeds: [],
  },
  {
    key: "T11",
    area: "Inventory",
    name: "Quarterly stock statements given to banks against the books",
    ref: "CARO 3(ii)(b)",
    feeds: ["CARO (ii)"],
  },
  {
    key: "T12",
    area: "Statutory dues",
    name: "PF, ESI, TDS and GST paid after the due date",
    ref: "CARO 3(vii)(a)",
    feeds: ["CARO (vii)", "3CD 26"],
  },
  {
    key: "T13",
    area: "Receivables",
    name: "Debtors outstanding more than 180 days",
    ref: "SA 540",
    feeds: [],
  },
  {
    key: "T14",
    area: "Analytics",
    name: "Expense ledgers that moved more than 25% from last year",
    ref: "SA 520",
    feeds: [],
  },
  {
    key: "T15",
    area: "Analytics",
    name: "First-digit (Benford) test on purchase amounts",
    ref: "SA 240",
    feeds: [],
  },
  {
    key: "T16",
    area: "Fixed assets",
    name: "Additions above ₹5 lakh with no invoice attached",
    ref: "CARO 3(i)",
    feeds: ["CARO (i)"],
  },
];

/** Blank rows for a new file, copied in like the area programme. */
export function buildLedgerTests() {
  return LEDGER_TESTS.map((test) => ({
    key: test.key,
    area: test.area,
    name: test.name,
    ref: test.ref,
    population: "",
    wholePopulation: null,
    flags: null,
    note: "",
    ranAt: null,
  }));
}

/** Which tests pre-fill one CARO or 3CD answer. */
export function testsFeeding(answerKey) {
  return LEDGER_TESTS.filter((test) => test.feeds.includes(answerKey));
}

/**
 * Where the testing stands, and the one thing a reviewer asks about scope.
 *
 * `sampled` is the count of tests the firm has recorded as run over
 * something less than the whole population. It is not a criticism — a
 * sample is a perfectly good procedure — but it has to be visible, because
 * "we tested every voucher" and "we looked at twenty-five" are different
 * audits and the file has to say which.
 *
 * @param {Array<any>} tests  as stored on the file
 */
export function testingProgress(tests = []) {
  const run = tests.filter((test) => test.ranAt);
  const sampled = run.filter((test) => test.wholePopulation === false);
  const flagged = run.filter((test) => (test.flags ?? 0) > 0);

  return {
    total: tests.length,
    run: run.length,
    notRun: tests.length - run.length,
    sampled: sampled.length,
    flagged: flagged.length,
    totalFlags: run.reduce((sum, test) => sum + (test.flags ?? 0), 0),
    why:
      tests.length === 0
        ? "No testing programme on this file yet."
        : run.length < tests.length
          ? `${tests.length - run.length} of ${tests.length} not run yet.`
          : sampled.length > 0
            ? `${sampled.length} ${sampled.length === 1 ? "test was" : "tests were"} run over a sample rather than the whole population.`
            : "",
  };
}

/**
 * Has a test that found something had its findings raised?
 *
 * A test recorded as "23 flagged" with no exception against it is the file's
 * worst state: it says the firm looked, found things, and wrote none of them
 * down. So this is checked before signing rather than left to notice.
 *
 * @param {Array<any>} tests
 * @param {Array<any>} exceptions
 */
export function flagsWithoutExceptions(tests = [], exceptions = []) {
  const raised = new Set(exceptions.map((row) => row.test).filter(Boolean));
  return tests
    .filter(
      (test) => test.ranAt && (test.flags ?? 0) > 0 && !raised.has(test.key),
    )
    .map((test) => ({ key: test.key, name: test.name, flags: test.flags }));
}

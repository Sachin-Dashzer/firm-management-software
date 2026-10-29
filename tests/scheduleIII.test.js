import { describe, expect, it } from "vitest";
import {
  HEADS,
  HEAD_BY_KEY,
  mappingProgress,
  notesNeeded,
  NOTE_QUESTIONS,
  outOfBalance,
  readTrialBalance,
  statements,
  STANDARD_NOTES,
  suggestHeads,
} from "../lib/practice/scheduleIII.js";
import { parseCSVObjects } from "../lib/csv.js";
import { csvFromPaste } from "../lib/practice/sampling.js";

/**
 * A trial balance to the financial statements (P3-32).
 *
 * Three things can go wrong here and each is silent: a ledger lost on
 * import, a sign turned the wrong way, and a profit that does not reach
 * reserves. All three produce a balance sheet that looks like a balance
 * sheet, so all three are tested.
 */

/** A small company's trial balance, as a Tally export writes it. */
const tally = [
  {
    ledger: "Share Capital",
    group: "Capital Account",
    closing: "10,00,000 Cr",
  },
  { ledger: "Reserves", group: "Reserves and Surplus", closing: "2,00,000 Cr" },
  { ledger: "Bank OD", group: "Bank OD A/c", closing: "3,00,000 Cr" },
  {
    ledger: "Sundry Creditors",
    group: "Sundry Creditors",
    closing: "5,00,000 Cr",
  },
  {
    ledger: "Plant and Machinery",
    group: "Fixed Assets",
    closing: "12,00,000",
  },
  { ledger: "Closing Stock", group: "Stock-in-Hand", closing: "4,00,000" },
  { ledger: "Sundry Debtors", group: "Sundry Debtors", closing: "6,00,000" },
  { ledger: "HDFC Bank", group: "Bank Accounts", closing: "1,00,000" },
  { ledger: "Sales", group: "Sales Account", closing: "40,00,000 Cr" },
  { ledger: "Purchases", group: "Purchase Account", closing: "25,00,000" },
  { ledger: "Salaries", group: "Indirect Expenses", closing: "8,00,000" },
  { ledger: "Bank Interest", group: "Indirect Expenses", closing: "1,00,000" },
  { ledger: "Depreciation", group: "Indirect Expenses", closing: "3,00,000" },
  { ledger: "Grand Total", group: "", closing: "0" },
];

describe("reading a trial balance", () => {
  const { rows, refused } = readTrialBalance(tally);

  it("reads every ledger and leaves the total row out", () => {
    expect(rows).toHaveLength(13);
    expect(refused).toEqual([
      { line: 15, why: '"Grand Total" is a total row' },
    ]);
  });

  it("keeps the books' own convention: debits positive, credits negative", () => {
    const find = (name) => rows.find((row) => row.ledger === name);
    expect(find("Share Capital").closingPaise).toBe(-100_000_000);
    expect(find("Plant and Machinery").closingPaise).toBe(120_000_000);
  });

  it("reads a credit written three different ways as the same number", () => {
    /* The first version of this turned "500000Cr" into "50000-0". */
    const { rows: three } = readTrialBalance([
      { ledger: "A", closing: "5,00,000 Cr" },
      { ledger: "B", closing: "(5,00,000)" },
      { ledger: "C", closing: "-500000" },
    ]);
    expect(three.map((row) => row.closingPaise)).toEqual([
      -50_000_000, -50_000_000, -50_000_000,
    ]);
  });

  it("works the closing out of debit and credit when there is no closing column", () => {
    const { rows: fromColumns } = readTrialBalance([
      { ledger: "A", debit: "1,000", credit: "" },
      { ledger: "B", debit: "", credit: "400" },
    ]);
    expect(fromColumns.map((row) => row.closingPaise)).toEqual([
      100_000, -40_000,
    ]);
  });

  it("names every row it refuses, with its line number", () => {
    const { rows: kept, refused: left } = readTrialBalance([
      { ledger: "", closing: "100" },
      { ledger: "Nil ledger", closing: "0" },
      { ledger: "Bad", closing: "n/a" },
      { ledger: "Good", closing: "100" },
    ]);
    expect(kept).toHaveLength(1);
    expect(left).toEqual([
      { line: 2, why: "no ledger name" },
      { line: 3, why: '"Nil ledger" has a nil balance' },
      { line: 4, why: '"n/a" is not an amount' },
    ]);
  });

  it("reads what Excel actually pastes", () => {
    const pasted = [
      "Ledger\tGroup\tClosing",
      "Sundry Debtors, Delhi\tSundry Debtors\t6,00,000",
    ].join("\n");
    const { rows: pastedRows } = readTrialBalance(
      parseCSVObjects(csvFromPaste(pasted)).rows,
    );
    expect(pastedRows[0].ledger).toBe("Sundry Debtors, Delhi");
    expect(pastedRows[0].closingPaise).toBe(60_000_000);
  });

  it("says by how much the trial balance is out, not just that it is", () => {
    expect(outOfBalance(rows)).toBe(0);
    expect(outOfBalance([{ closingPaise: 100 }, { closingPaise: -98 }])).toBe(
      2,
    );
  });
});

describe("suggesting a head", () => {
  const { rows } = readTrialBalance(tally);

  it("reads the client's own group names", () => {
    const suggested = suggestHeads(rows);
    const headFor = (name) =>
      suggested[rows.findIndex((row) => row.ledger === name)];

    expect(headFor("Sundry Creditors")).toEqual({
      headKey: "trade-payables",
      status: "suggested",
    });
    expect(headFor("Bank OD").headKey).toBe("short-borrowings");
    expect(headFor("Sales").headKey).toBe("revenue");
    expect(headFor("HDFC Bank").headKey).toBe("cash");
  });

  it("prefers last year's mapping, and calls it remembered", () => {
    const suggested = suggestHeads(
      rows,
      new Map([["salaries", "employee-benefits"]]),
    );
    const salaries = suggested[rows.findIndex((r) => r.ledger === "Salaries")];
    expect(salaries).toEqual({
      headKey: "employee-benefits",
      status: "remembered",
    });
  });

  it("ignores a remembered head that no longer exists", () => {
    const suggested = suggestHeads(
      [{ ledger: "Odd", group: "" }],
      new Map([["odd", "a-head-that-was-removed"]]),
    );
    expect(suggested[0]).toEqual({ headKey: "", status: "unmapped" });
  });

  it("says unmapped rather than guessing", () => {
    const suggested = suggestHeads([
      { ledger: "Suspense", group: "Suspense A/c" },
    ]);
    expect(suggested[0]).toEqual({ headKey: "", status: "unmapped" });
  });

  it("prefers the longer phrase, so a group is not matched by one word", () => {
    const suggested = suggestHeads([
      { ledger: "X", group: "Reserves and Surplus" },
    ]);
    expect(suggested[0].headKey).toBe("reserves");
  });
});

describe("the statements", () => {
  const { rows } = readTrialBalance(tally);
  /* Mapped the way a person would, from the suggestions. */
  const suggested = suggestHeads(rows);
  const lines = rows.map((row, index) => ({
    ...row,
    headKey: suggested[index].headKey,
    status: "confirmed",
  }));

  it("maps every ledger in this trial balance", () => {
    expect(lines.every((line) => line.headKey)).toBe(true);
  });

  it("reports credits as positive figures on the credit side", () => {
    const result = statements(lines);
    const figure = (key) =>
      result.rows.find((row) => row.key === key)?.paise ?? 0;
    expect(figure("share-capital")).toBe(100_000_000);
    expect(figure("revenue")).toBe(400_000_000);
    expect(figure("ppe")).toBe(120_000_000);
  });

  it("works out the profit, and balances once it reaches reserves", () => {
    const result = statements(lines);
    /* 40 lakh of revenue less 37 lakh of expenses is 3 lakh, which is
       30,000,000 paise. */
    expect(result.profitBeforeTax).toBe(30_000_000);
    expect(result.profit).toBe(30_000_000);
    expect(result.assets).toBe(230_000_000);
    expect(result.liabilitiesWithProfit).toBe(230_000_000);
    expect(result.balanced).toBe(true);
    expect(result.difference).toBe(0);
  });

  it("does not balance when a ledger is left unmapped, and says by how much", () => {
    const holed = lines.map((line) =>
      line.ledger === "HDFC Bank" ? { ...line, headKey: "" } : line,
    );
    const result = statements(holed);
    expect(result.balanced).toBe(false);
    expect(result.difference).toBe(-10_000_000);
  });

  it("moves figures for an entry passed in the books, and for no other", () => {
    const journal = [
      {
        description: "Gratuity provision per the actuarial report",
        amountPaise: 3_100_000,
        headKey: "employee-benefits",
        counterHeadKey: "short-provisions",
        state: "Passed in books",
      },
      {
        description: "Prepaid insurance not carried forward",
        amountPaise: 6_800_000,
        headKey: "other-current-assets",
        counterHeadKey: "other-expenses",
        state: "Unadjusted",
      },
      {
        description: "Cut-off purchase, proposed",
        amountPaise: 48_500_000,
        headKey: "trade-payables",
        counterHeadKey: "materials",
        state: "Proposed",
      },
    ];

    const result = statements(lines, journal);
    /* The passed entry reduces the profit by its amount and raises a
       provision by the same, so the two sides still agree. */
    expect(result.profit).toBe(30_000_000 - 3_100_000);
    expect(result.balanced).toBe(true);

    const provisions = result.rows.find((r) => r.key === "short-provisions");
    expect(provisions.paise).toBe(3_100_000);
    /* Neither the proposal nor the unadjusted entry appears at all. */
    expect(result.rows.find((r) => r.key === "other-current-assets")).toBe(
      undefined,
    );
  });

  it("keeps tax out of profit before tax", () => {
    const withTax = [
      ...lines,
      {
        ledger: "Income tax",
        group: "",
        closingPaise: 5_000_000,
        headKey: "tax",
        status: "confirmed",
      },
    ];
    const result = statements(withTax);
    expect(result.profitBeforeTax).toBe(30_000_000);
    expect(result.taxExpense).toBe(5_000_000);
    expect(result.profit).toBe(25_000_000);
  });
});

describe("how far the mapping has got", () => {
  it("counts each status and blocks on an unmapped ledger", () => {
    const progress = mappingProgress([
      { headKey: "cash", status: "confirmed", closingPaise: 100 },
      { headKey: "revenue", status: "suggested", closingPaise: -100 },
      { headKey: "ppe", status: "remembered", closingPaise: 500 },
      { headKey: "", status: "unmapped", closingPaise: -500 },
    ]);
    expect(progress).toMatchObject({
      total: 4,
      confirmed: 1,
      suggested: 1,
      remembered: 1,
      unmapped: 1,
      unmappedPaise: -500,
      blocked: true,
    });
  });

  it("is not blocked once everything has a head", () => {
    expect(
      mappingProgress([
        { headKey: "cash", status: "confirmed", closingPaise: 1 },
      ]).blocked,
    ).toBe(false);
  });
});

describe("which notes are needed", () => {
  it("always needs the nine standard ones", () => {
    expect(STANDARD_NOTES).toHaveLength(9);
    const notes = notesNeeded({});
    expect(notes).toHaveLength(9);
    expect(notes.every((note) => note.always)).toBe(true);
  });

  it("adds one per question answered yes, and nothing for a no", () => {
    const notes = notesNeeded({ msme: true, csr: false, gratuity: true });
    expect(notes).toHaveLength(11);
    expect(
      notes.filter((note) => !note.always).map((note) => note.key),
    ).toEqual(["msme", "gratuity"]);
  });

  it("gives every question and every note an authority", () => {
    for (const row of [...NOTE_QUESTIONS, ...STANDARD_NOTES]) {
      expect(row.cite).toBeTruthy();
    }
  });
});

describe("the head list itself", () => {
  it("has a unique key, a side and a Schedule III reference for each", () => {
    expect(new Set(HEADS.map((head) => head.key)).size).toBe(HEADS.length);
    for (const head of HEADS) {
      expect(["liability", "asset", "income", "expense"]).toContain(head.side);
      expect(head.cite).toMatch(/Part I|Part II/);
      expect(HEAD_BY_KEY.get(head.key)).toBe(head);
    }
  });
});

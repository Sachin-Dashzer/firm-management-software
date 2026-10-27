import { describe, it, expect } from "vitest";
import {
  profileSheet,
  kindOf,
  readNumber,
  readDate,
} from "../lib/datalab/profile.js";
import { runChecks, summaryText, ROLES } from "../lib/datalab/checks.js";
import { istDate } from "../lib/dates.js";

/**
 * The data lab (P3-20).
 *
 * The tests that earn their place are the ones where being wrong is
 * invisible: a date read month-first moves every entry into the wrong
 * month, and an amount column with one "n/a" in it gives a total that is
 * short by exactly that row and looks perfectly reasonable.
 */

describe("a number is read the way a spreadsheet writes one", () => {
  it("takes Indian grouping, currency and brackets", () => {
    expect(readNumber("1,23,456.78")).toBeCloseTo(123456.78);
    expect(readNumber("₹ 450")).toBe(450);
    expect(readNumber("(450)")).toBe(-450);
    expect(readNumber("-450")).toBe(-450);
    expect(readNumber("0")).toBe(0);
  });

  it("refuses what is not a number, rather than reading it as zero", () => {
    expect(readNumber("n/a")).toBe(null);
    expect(readNumber("-")).toBe(null);
    expect(readNumber("12 pcs")).toBe(null);
    expect(readNumber("")).toBe(null);
  });
});

describe("a date is read day first, because this is India", () => {
  /**
   * 03-04-2026 is 3 April. Reading it as 4 March would move every entry in
   * the file into the wrong month, and nothing on screen would look odd.
   */
  it("reads 03-04-2026 as 3 April", () => {
    expect(readDate("03-04-2026").getTime()).toBe(
      istDate(2026, 4, 3).getTime(),
    );
    expect(readDate("3/4/2026").getTime()).toBe(istDate(2026, 4, 3).getTime());
    expect(readDate("03.04.26").getTime()).toBe(istDate(2026, 4, 3).getTime());
  });

  it("still takes the ISO form Excel sometimes writes", () => {
    expect(readDate("2026-04-03").getTime()).toBe(
      istDate(2026, 4, 3).getTime(),
    );
  });

  it("refuses a month that does not exist", () => {
    expect(readDate("03-13-2026")).toBe(null);
    expect(readDate("not a date")).toBe(null);
  });
});

describe("a column is only what every filled cell in it is", () => {
  it("is a number when they all are", () => {
    expect(kindOf(["1,000", "2,500.50", ""])).toBe("number");
  });

  /**
   * One stray cell makes it text, and saying so is the honest answer: a
   * total that silently skipped a row is the thing nobody catches.
   */
  it("is text when one cell is not a number", () => {
    expect(kindOf(["1,000", "n/a", "2,500"])).toBe("text");
  });

  it("is a date when they all are, and empty when there is nothing", () => {
    expect(kindOf(["01-04-2026", "02-04-2026"])).toBe("date");
    expect(kindOf(["", "  "])).toBe("empty");
  });
});

describe("reading a file says what is in it and nothing more", () => {
  const csv = [
    "Date,Voucher,Party,Amount",
    "01-04-2026,INV-001,Nirmal Udyog,10000",
    "02-04-2026,INV-002,,25000.50",
    "03-04-2026,INV-004,Sharma Textiles,15000",
  ].join("\n");

  it("finds the headers, the rows and the kinds", () => {
    const profile = profileSheet(csv);
    expect(profile.rowCount).toBe(3);
    expect(profile.headers).toEqual(["Date", "Voucher", "Party", "Amount"]);
    expect(profile.columns.map((column) => column.kind)).toEqual([
      "date",
      "text",
      "text",
      "number",
    ]);
  });

  it("totals a number column and dates the range of a date column", () => {
    const profile = profileSheet(csv);
    expect(profile.columns[3].total).toBeCloseTo(50000.5);
    expect(profile.columns[0].min.slice(0, 10)).toBe("2026-03-31"); // IST midnight
    expect(profile.columns[2].blanks).toBe(1);
  });

  it("names a column the file left unnamed rather than losing it", () => {
    const profile = profileSheet("Date,,Amount\n01-04-2026,x,10");
    expect(profile.headers[1]).toBe("Column 2");
  });

  /**
   * A row of commas is not a row. The parser drops it, so it never reaches
   * a check and never counts towards the total — which is why the profile
   * reports no "blank rows skipped" figure: there is no honest one to give
   * without parsing the file a second way, and a number the lab cannot
   * stand behind is worse than no number.
   */
  it("does not count a row of commas as a row", () => {
    const profile = profileSheet(`${csv}\n,,,\n,,,`);
    expect(profile.rowCount).toBe(3);
    expect(profile.blankRows).toBeUndefined();
  });
});

describe("the checks, over the columns somebody mapped", () => {
  const rows = [
    ["01-04-2026", "INV-001", "Nirmal Udyog", "10000"],
    ["02-04-2026", "INV-002", "", "25000"],
    ["02-04-2026", "INV-002", "Sharma Textiles", "-5000"],
    ["03-04-2026", "INV-004", "Sharma Textiles", "n/a"],
    ["01-01-2026", "INV-005", "Nirmal Udyog", "50000"],
  ];
  const mapping = { date: 0, reference: 1, party: 2, amount: 3 };
  const find = (findings, key) => findings.find((row) => row.key === key);

  const findings = runChecks(rows, mapping, {
    from: istDate(2026, 4, 1),
    to: istDate(2026, 4, 30),
  });

  it("offers the roles a person can map, and no more", () => {
    expect(ROLES.map((role) => role.key)).toEqual([
      "date",
      "amount",
      "debit",
      "credit",
      "reference",
      "party",
    ]);
  });

  it("finds the reference used twice, with the rows it is on", () => {
    const duplicate = find(findings, "duplicates");
    expect(duplicate.count).toBe(1);
    expect(duplicate.lines[0]).toMatch(/INV-002 — rows 3, 4/);
  });

  /** A sales register with a hole in it is what a department asks about. */
  it("finds the gap in the numbered series", () => {
    const gaps = find(findings, "gaps");
    expect(gaps.count).toBe(1);
    expect(gaps.lines[1]).toBe("3");
  });

  it("finds the row dated outside the period", () => {
    const outside = find(findings, "outside");
    expect(outside.count).toBe(1);
    expect(outside.lines[0]).toMatch(/Row 6: 01-01-2026/);
  });

  it("finds the amount that is not a number", () => {
    const bad = find(findings, "not-numbers");
    expect(bad.count).toBe(1);
    expect(bad.lines[0]).toMatch(/"n\/a"/);
  });

  it("finds the negative and the blank party", () => {
    expect(find(findings, "negatives").count).toBe(1);
    expect(find(findings, "no-party").count).toBe(1);
  });

  it("says nothing about a check whose column was not mapped", () => {
    const only = runChecks(rows, { amount: 3 }, {});
    expect(find(only, "duplicates")).toBeUndefined();
    expect(find(only, "no-party")).toBeUndefined();
    expect(find(only, "outside")).toBeUndefined();
  });

  it("checks the two sides against each other only when both are mapped", () => {
    const books = [
      ["01-04-2026", "", "", "", "1000", "900"],
      ["02-04-2026", "", "", "", "500", "600"],
    ];
    const level = runChecks(books, { debit: 4, credit: 5 }, {});
    expect(find(level, "balance")).toBeUndefined();

    const off = runChecks(
      [["01-04-2026", "", "", "", "1000", "900"]],
      { debit: 4, credit: 5 },
      {},
    );
    expect(find(off, "balance").title).toMatch(/differ by ₹100/);
  });

  /** Every finding has to say what it does not mean, or it cries wolf. */
  it("gives every finding a note saying what it might innocently be", () => {
    for (const finding of findings) {
      expect(finding.note, finding.key).toBeTruthy();
    }
  });

  it("writes a summary naming the file, the mapping and the findings", () => {
    const text = summaryText({
      fileName: "sales.csv",
      rowCount: 5,
      columns: [{ header: "Amount", kind: "number", total: 80000 }],
      mapping,
      findings,
      headers: ["Date", "Voucher", "Party", "Amount"],
    });
    expect(text).toContain("sales.csv");
    expect(text).toContain("Reference or voucher number: Voucher");
    expect(text).toContain("Amount: ₹80,000");
    expect(text).toContain("The file itself is not kept");
  });
});

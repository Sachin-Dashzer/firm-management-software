import { describe, it, expect } from "vitest";
import { validateGstSheets, summariseIssues } from "../lib/gst/validate.js";
import { computeGst, SET_OFF_ORDER, toPaise } from "../lib/gst/compute.js";
import {
  GST_SHEETS,
  SHEET_NAMES,
  gstTemplateSheets,
  NOT_A_FILING_FILE,
} from "../lib/gst/template.js";
import { readGstWorkbook } from "../lib/gst/read.js";
import { buildWorkbook } from "../lib/excel.js";

/**
 * The monthly GST cycle's arithmetic and checking (P3-12).
 *
 * Two properties matter more than the rest.
 *
 * The first is the **set-off order**. CGST credit used against an SGST
 * liability is not a rounding difference: it is the wrong tax paid to the
 * wrong government, and it is the error an accountant who has only ever
 * added the three heads together makes first. So the order is tested step
 * by step, including the step that must not exist.
 *
 * The second is that **nothing here is a return**. The computation carries
 * its caveat on every figure, the workbook says it on every sheet, and
 * credit the client has not actually received is excluded and named rather
 * than quietly left out.
 */

const d = (s) => new Date(`${s}T00:00:00+05:30`);

const sheets = (over = {}) => ({
  salesB2B: [],
  salesB2C: [],
  purchases: [],
  ...over,
});

const sale = (over = {}) => ({
  invoiceNo: "INV-001",
  date: d("2026-10-04"),
  gstin: "09AAACH7409R1ZZ",
  name: "Jaiswal Steels",
  placeOfSupply: "09",
  taxable: 100000,
  igst: 0,
  cgst: 9000,
  sgst: 9000,
  ...over,
});

const purchase = (over = {}) => ({
  invoiceNo: "PUR-001",
  date: d("2026-10-06"),
  gstin: "09AAACH7409R1ZZ",
  name: "Supplier",
  taxable: 50000,
  igst: 0,
  cgst: 4500,
  sgst: 4500,
  eligible: "Y",
  receivedOn: d("2026-10-07"),
  ...over,
});

/** Every rule confirmed, for the tests that are about the arithmetic. */
const CONFIRMED = SET_OFF_ORDER.rules.map((rule) => ({
  key: rule.key,
  confirmedAt: new Date(),
}));

describe("the set-off order, which is the part that matters", () => {
  it("uses IGST credit against IGST, then CGST, then SGST", () => {
    const result = computeGst(
      sheets({
        salesB2B: [sale({ igst: 0, cgst: 5000, sgst: 5000 })],
        purchases: [purchase({ igst: 12000, cgst: 0, sgst: 0 })],
      }),
      CONFIRMED,
    );

    // 12,000 of IGST credit, 10,000 of CGST+SGST liability
    expect(result.cash).toEqual({ igst: 0, cgst: 0, sgst: 0 });
    expect(result.carried.igst).toBe(2000);
    expect(result.total).toBe(0);
  });

  it("never uses CGST credit against an SGST liability", () => {
    const result = computeGst(
      sheets({
        // liability is SGST only
        salesB2B: [sale({ igst: 0, cgst: 0, sgst: 9000 })],
        // credit is CGST only
        purchases: [purchase({ igst: 0, cgst: 9000, sgst: 0 })],
      }),
      CONFIRMED,
    );

    // the whole SGST liability stays payable in cash, and the CGST credit
    // carries forward — paying it from CGST credit would be the wrong tax to
    // the wrong government
    expect(result.cash.sgst).toBe(9000);
    expect(result.carried.cgst).toBe(9000);
    expect(result.total).toBe(9000);
  });

  it("never uses SGST credit against a CGST liability either", () => {
    const result = computeGst(
      sheets({
        salesB2B: [sale({ igst: 0, cgst: 9000, sgst: 0 })],
        purchases: [purchase({ igst: 0, cgst: 0, sgst: 9000 })],
      }),
      CONFIRMED,
    );
    expect(result.cash.cgst).toBe(9000);
    expect(result.carried.sgst).toBe(9000);
  });

  it("uses CGST and SGST credit against IGST once their own head is clear", () => {
    const result = computeGst(
      sheets({
        salesB2B: [sale({ igst: 20000, cgst: 1000, sgst: 1000 })],
        purchases: [purchase({ igst: 0, cgst: 6000, sgst: 6000 })],
      }),
      CONFIRMED,
    );

    // 1,000 each clears its own head; 5,000 each goes against the IGST
    expect(result.cash.cgst).toBe(0);
    expect(result.cash.sgst).toBe(0);
    expect(result.cash.igst).toBe(10000);
    expect(result.carried).toEqual({ igst: 0, cgst: 0, sgst: 0 });
  });

  it("has exactly the seven steps, and not the two forbidden ones", () => {
    const pairs = SET_OFF_ORDER.steps.map((step) => step.join("→"));
    expect(pairs).toEqual([
      "igst→igst",
      "igst→cgst",
      "igst→sgst",
      "cgst→cgst",
      "cgst→igst",
      "sgst→sgst",
      "sgst→igst",
    ]);
    expect(pairs).not.toContain("cgst→sgst");
    expect(pairs).not.toContain("sgst→cgst");
  });

  it("adds up: credit used plus credit carried equals credit available", () => {
    const result = computeGst(
      sheets({
        salesB2B: [sale({ igst: 3000, cgst: 4000, sgst: 4000 })],
        purchases: [
          purchase({ igst: 5000, cgst: 1000, sgst: 2000 }),
          purchase({ invoiceNo: "PUR-002", igst: 0, cgst: 500, sgst: 500 }),
        ],
      }),
      CONFIRMED,
    );

    for (const head of ["igst", "cgst", "sgst"]) {
      expect(result.used[head] + result.carried[head]).toBe(
        result.credit[head],
      );
    }
    // and liability settled plus cash equals output
    const settled = result.used.igst + result.used.cgst + result.used.sgst;
    const output = result.output.igst + result.output.cgst + result.output.sgst;
    expect(settled + result.total).toBe(output);
  });
});

describe("credit the client has not actually got", () => {
  it("leaves out what is not marked eligible, and names it", () => {
    const result = computeGst(
      sheets({
        salesB2B: [sale()],
        purchases: [purchase({ eligible: "N", invoiceNo: "PUR-009" })],
      }),
      CONFIRMED,
    );

    expect(result.credit).toEqual({ igst: 0, cgst: 0, sgst: 0 });
    expect(result.excluded).toEqual([
      { invoiceNo: "PUR-009", why: "not marked eligible", amount: 9000 },
    ]);
  });

  it("leaves out what has not arrived, and says that is why", () => {
    const result = computeGst(
      sheets({
        purchases: [purchase({ receivedOn: "", invoiceNo: "PUR-010" })],
      }),
      CONFIRMED,
    );
    expect(result.excluded[0].why).toBe("the goods or service had not arrived");
  });

  it("takes the credit when both are true", () => {
    const result = computeGst(sheets({ purchases: [purchase()] }), CONFIRMED);
    expect(result.credit).toEqual({ igst: 0, cgst: 4500, sgst: 4500 });
    expect(result.excluded).toEqual([]);
  });
});

describe("nothing here is a return", () => {
  it("says so on every computation", () => {
    const result = computeGst(sheets(), CONFIRMED);
    expect(result.caveat).toMatch(/Indicative/);
    expect(result.caveat).toMatch(
      /GSTR-2B reconciliation, not from this sheet/,
    );
  });

  it("runs the arithmetic but marks itself unconfirmed until a partner agrees the order", () => {
    const result = computeGst(
      sheets({
        salesB2B: [sale()],
        purchases: [purchase()],
      }),
      [],
    );

    // a bookkeeper still gets the figures
    expect(result.total).toBe(9000);
    // but the system does not claim the order is settled
    expect(result.confirmed).toBe(false);
    expect(result.unconfirmed).toHaveLength(SET_OFF_ORDER.rules.length);
    expect(result.unconfirmed[0].cite).toMatch(/partner must confirm/);
  });

  it("is confirmed only when every rule is", () => {
    const partly = computeGst(sheets(), [
      { key: "order", confirmedAt: new Date() },
    ]);
    expect(partly.confirmed).toBe(false);
    expect(computeGst(sheets(), CONFIRMED).confirmed).toBe(true);
  });

  it("cites a section on every rule of the order", () => {
    for (const rule of SET_OFF_ORDER.rules) {
      expect(rule.cite).toMatch(/CGST Act|Rule 88A/);
      expect(rule.text.length).toBeGreaterThan(30);
    }
  });

  it("stamps the workbook on the front and on every sheet", () => {
    const built = gstTemplateSheets({
      clientName: "Ravi Textiles",
      period: "Oct 2026",
    });
    const front = built[0].rows.map((row) => row.row);
    expect(front).toContain(NOT_A_FILING_FILE);

    for (const name of SHEET_NAMES) {
      const sheet = built.find((row) => row.name === name);
      expect(sheet.title).toMatch(/not a filing file/);
    }
  });

  it("converts to paise at one boundary, not in four screens", () => {
    const result = computeGst(
      sheets({ salesB2B: [sale({ igst: 0, cgst: 9000, sgst: 9000 })] }),
      CONFIRMED,
    );
    expect(toPaise(result)).toEqual({
      outputPaise: 18_000_00,
      creditPaise: 0,
      cashPaise: 18_000_00,
      carriedPaise: 0,
    });
  });
});

describe("checking the sheet before anybody prepares from it", () => {
  it("passes a clean workbook", () => {
    const result = validateGstSheets(
      sheets({ salesB2B: [sale()], purchases: [purchase()] }),
    );
    expect(result.ok).toBe(true);
    expect(result.counts).toEqual({ salesB2B: 1, salesB2C: 0, purchases: 1 });
  });

  it("names the sheet, the Excel row, the column and the fix", () => {
    const result = validateGstSheets(
      sheets({ salesB2B: [sale({ gstin: "09AAACH7409R1Z" })] }),
    );
    const issue = result.issues[0];
    expect(issue.sheet).toBe("Sales B2B");
    // row 1 is the title and row 2 the headers, so the first data row is 3
    expect(issue.row).toBe(3);
    expect(issue.column).toBe("GSTIN");
    expect(issue.says).toMatch(/15 characters/);
    expect(issue.fix).toBeTruthy();
  });

  it("catches the same invoice number twice, which doubles the tax", () => {
    const result = validateGstSheets(
      sheets({
        salesB2B: [sale(), sale({ date: d("2026-10-09") })],
      }),
    );
    const issue = result.issues.find((row) => row.column === "Invoice no");
    expect(issue.says).toBe("is the same as row 3");
    expect(issue.row).toBe(4);
  });

  it("catches IGST and CGST on one row", () => {
    const result = validateGstSheets(
      sheets({ salesB2B: [sale({ igst: 5000 })] }),
    );
    expect(result.issues.some((row) => row.says.match(/both IGST and/))).toBe(
      true,
    );
  });

  it("catches a negative amount, and says where a credit note goes", () => {
    const result = validateGstSheets(
      sheets({ salesB2B: [sale({ cgst: -9000 })] }),
    );
    const issue = result.issues.find((row) => row.says === "is negative");
    expect(issue.fix).toMatch(/credit note/);
  });

  it("catches a required column left empty", () => {
    const result = validateGstSheets(
      sheets({ purchases: [purchase({ invoiceNo: "" })] }),
    );
    expect(
      result.issues.some(
        (row) => row.column === "Invoice no" && row.says === "is empty",
      ),
    ).toBe(true);
  });

  it("asks about credit claimed on something that has not arrived", () => {
    const result = validateGstSheets(
      sheets({ purchases: [purchase({ receivedOn: "" })] }),
    );
    const issue = result.issues.find(
      (row) => row.column === "Goods / service received on",
    );
    expect(issue.says).toMatch(/empty, but the credit is marked eligible/);
    expect(issue.fix).toMatch(/left out of the computation/);
  });

  it("refuses a Y/N column that says something else", () => {
    const result = validateGstSheets(
      sheets({ purchases: [purchase({ eligible: "maybe" })] }),
    );
    expect(
      result.issues.some((row) => row.column === "ITC eligible (Y/N)"),
    ).toBe(true);
  });

  it("ignores a blank row, which is where the data stopped", () => {
    const blank = Object.fromEntries(
      GST_SHEETS.salesB2B.columns.map((column) => [column.key, ""]),
    );
    const result = validateGstSheets(sheets({ salesB2B: [sale(), blank] }));
    expect(result.ok).toBe(true);
  });

  it("groups the list so a bookkeeper can work through it", () => {
    const result = validateGstSheets(
      sheets({
        salesB2B: [sale({ gstin: "nope" }), sale({ cgst: -1 })],
        purchases: [purchase({ invoiceNo: "" })],
      }),
    );
    const grouped = summariseIssues(result.issues);
    expect(grouped.map((row) => row.sheet).sort()).toEqual([
      "Purchases",
      "Sales B2B",
    ]);
    for (const group of grouped) {
      expect(group.count).toBe(group.lines.length);
      expect(group.lines[0]).toMatch(/^Row \d+, /);
    }
  });
});

describe("reading back what the client actually sends", () => {
  async function workbookOf(rows) {
    const built = gstTemplateSheets({
      clientName: "Ravi Textiles",
      period: "Oct 2026",
    });
    for (const [name, data] of Object.entries(rows)) {
      const sheet = built.find((row) => row.name === name);
      sheet.rows = data;
    }
    return buildWorkbook(built);
  }

  it("reads the template it sent back in", async () => {
    const buffer = await workbookOf({
      "Sales B2B": [sale()],
      Purchases: [purchase()],
    });

    const { sheets: read, missing } = await readGstWorkbook(buffer);
    expect(missing).toEqual([]);
    expect(read.salesB2B).toHaveLength(1);
    expect(read.salesB2B[0].invoiceNo).toBe("INV-001");
    expect(read.salesB2B[0].cgst).toBe(9000);
    expect(read.purchases[0].eligible).toBe("Y");
    expect(read.purchases[0].receivedOn).toBeInstanceOf(Date);
    // and the whole round trip computes
    expect(computeGst(read, CONFIRMED).total).toBe(9000);
  });

  it("says which sheet is missing rather than failing", async () => {
    const buffer = await workbookOf({ "Sales B2B": [sale()] });
    const workbook = await readGstWorkbook(buffer);
    // the sheets exist in the template even when empty, so nothing is missing
    expect(workbook.missing).toEqual([]);
    expect(workbook.sheets.purchases).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildWorkbook, addSheet } from "../lib/excel.js";
import { istDate } from "../lib/dates.js";

/**
 * The spreadsheet writer (spec section 17: every list exports to Excel).
 *
 * The point of the file is that a column of money can be summed and a
 * column of dates can be sorted, so that is what these tests check —
 * reading the workbook back and asking what type each cell actually is.
 * A test that only checked the bytes exist would pass on a file full of
 * text.
 */

const columns = [
  { header: "Client", key: "client" },
  { header: "Fee", key: "fee", kind: "money" },
  { header: "Billed on", key: "date", kind: "date" },
  { header: "Jobs", key: "jobs", kind: "int" },
];

const rows = [
  { client: "Rao & Co", fee: 2_500_000, date: istDate(2026, 10, 20), jobs: 3 },
  { client: "Bhatt Textiles", fee: 47_500, date: null, jobs: 1 },
];

async function readBack(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

describe("a report as a workbook", () => {
  it("writes money as a number in rupees, not text", async () => {
    const workbook = await readBack(
      await buildWorkbook([{ name: "Fees", columns, rows }]),
    );
    const sheet = workbook.getWorksheet("Fees");

    const fee = sheet.getRow(2).getCell(2);
    expect(typeof fee.value).toBe("number");
    // paise in, rupees out
    expect(fee.value).toBe(25000);
    expect(fee.numFmt).toContain("#,##,##0.00");
  });

  it("writes a date as a date, on the Indian calendar day", async () => {
    const workbook = await readBack(
      await buildWorkbook([{ name: "Fees", columns, rows }]),
    );
    const cell = workbook.getWorksheet("Fees").getRow(2).getCell(3);

    expect(cell.value).toBeInstanceOf(Date);
    // 20 Oct 2026 in IST, whatever time zone reads the file
    expect(cell.value.toISOString().slice(0, 10)).toBe("2026-10-20");
    expect(cell.numFmt).toBe("dd-mm-yyyy");
  });

  it("freezes and bolds the heading row", async () => {
    const workbook = await readBack(
      await buildWorkbook([{ name: "Fees", columns, rows }]),
    );
    const sheet = workbook.getWorksheet("Fees");

    expect(sheet.getRow(1).font?.bold).toBe(true);
    expect(sheet.views[0].state).toBe("frozen");
    expect(sheet.views[0].ySplit).toBe(1);
  });

  it("drops the frozen line one row when there is a title", async () => {
    const workbook = await readBack(
      await buildWorkbook([
        { name: "Fees", columns, rows, title: "Filtered: October." },
      ]),
    );
    const sheet = workbook.getWorksheet("Fees");

    expect(sheet.getRow(1).getCell(1).value).toBe("Filtered: October.");
    expect(sheet.getRow(2).getCell(1).value).toBe("Client");
    expect(sheet.views[0].ySplit).toBe(2);
  });

  it("leaves an empty cell empty rather than writing zero or 'null'", async () => {
    const workbook = await readBack(
      await buildWorkbook([{ name: "Fees", columns, rows }]),
    );
    const cell = workbook.getWorksheet("Fees").getRow(3).getCell(3);
    expect(cell.value).toBeNull();
  });

  it("takes rows as arrays as well as objects, for the older exports", async () => {
    const workbook = await readBack(
      await buildWorkbook([
        {
          name: "Positional",
          columns,
          rows: [["Rao & Co", 100_000, istDate(2026, 4, 1), 2]],
        },
      ]),
    );
    const row = workbook.getWorksheet("Positional").getRow(2);
    expect(row.getCell(1).value).toBe("Rao & Co");
    expect(row.getCell(2).value).toBe(1000);
  });

  it("takes rupees already converted, for the invoice export", async () => {
    const workbook = await readBack(
      await buildWorkbook([
        {
          name: "Invoices",
          columns: [{ header: "Total", key: "total", kind: "rupees" }],
          rows: [{ total: 1250.5 }],
        },
      ]),
    );
    const cell = workbook.getWorksheet("Invoices").getRow(2).getCell(1);
    expect(cell.value).toBe(1250.5);
    expect(cell.numFmt).toContain("#,##,##0.00");
  });

  it("makes a sheet name Excel will accept", async () => {
    const workbook = await readBack(
      await buildWorkbook([
        {
          name: "Revenue by client / branch [draft] — a very long heading",
          columns,
          rows,
        },
      ]),
    );
    const [sheet] = workbook.worksheets;
    expect(sheet.name.length).toBeLessThanOrEqual(31);
    expect(sheet.name).not.toMatch(/[*?:/\\[\]]/);
  });

  it("writes several sheets into one file", async () => {
    const workbook = await readBack(
      await buildWorkbook([
        { name: "One", columns, rows },
        { name: "Two", columns, rows: [] },
      ]),
    );
    expect(workbook.worksheets.map((s) => s.name)).toEqual(["One", "Two"]);
  });

  it("does not put a filter on a sheet with nothing to filter", async () => {
    const workbook = new ExcelJS.Workbook();
    const empty = addSheet(workbook, { name: "Empty", columns, rows: [] });
    expect(empty.autoFilter).toBeFalsy();

    const full = addSheet(workbook, { name: "Full", columns, rows });
    expect(full.autoFilter).toBeTruthy();
  });
});

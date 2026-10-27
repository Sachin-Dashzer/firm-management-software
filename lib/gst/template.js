// @ts-check

/**
 * The sheet the firm sends a client each month, and what it is allowed to be
 * (P3-12).
 *
 * Three sheets, because that is what a month of GST needs from a client and
 * nothing more: what they sold to businesses, what they sold to everybody
 * else, and what they bought. Asking for a fourth thing is how a monthly
 * pack stops coming back.
 *
 * Every column is named the way the client's own accountant would name it,
 * not the way the return does — "Invoice no", not "doc_num".
 *
 * The amount columns are `rupees`, not `money`: `lib/excel.js` takes paise
 * for `money`, and this is a sheet a person types rupees into. Getting that
 * the wrong way round divides every figure by a hundred, which the first
 * round-trip test caught.
 */

export const NOT_A_FILING_FILE =
  "This workbook is for preparation only. It is not a filing file, and nothing in it is a return.";

/** @typedef {{ header: string, key: string, width?: number, kind?: string, required?: boolean }} Column */

/** @type {Column[]} */
const SALES_B2B = [
  { header: "Invoice no", key: "invoiceNo", width: 18, required: true },
  {
    header: "Invoice date",
    key: "date",
    width: 14,
    kind: "date",
    required: true,
  },
  { header: "Customer GSTIN", key: "gstin", width: 20, required: true },
  { header: "Customer name", key: "name", width: 28 },
  { header: "Place of supply (state code)", key: "placeOfSupply", width: 24 },
  { header: "Taxable value", key: "taxable", width: 16, kind: "rupees" },
  { header: "IGST", key: "igst", width: 14, kind: "rupees" },
  { header: "CGST", key: "cgst", width: 14, kind: "rupees" },
  { header: "SGST", key: "sgst", width: 14, kind: "rupees" },
];

/** @type {Column[]} */
const SALES_B2C = [
  { header: "Invoice no", key: "invoiceNo", width: 18 },
  {
    header: "Invoice date",
    key: "date",
    width: 14,
    kind: "date",
    required: true,
  },
  { header: "Place of supply (state code)", key: "placeOfSupply", width: 24 },
  { header: "Taxable value", key: "taxable", width: 16, kind: "rupees" },
  { header: "IGST", key: "igst", width: 14, kind: "rupees" },
  { header: "CGST", key: "cgst", width: 14, kind: "rupees" },
  { header: "SGST", key: "sgst", width: 14, kind: "rupees" },
];

/**
 * The purchase sheet carries the two questions that decide whether credit
 * may be taken at all, and they are asked as questions rather than inferred:
 * is it eligible, and have the goods or the service actually arrived.
 */
/** @type {Column[]} */
const PURCHASES = [
  { header: "Invoice no", key: "invoiceNo", width: 18, required: true },
  {
    header: "Invoice date",
    key: "date",
    width: 14,
    kind: "date",
    required: true,
  },
  { header: "Supplier GSTIN", key: "gstin", width: 20, required: true },
  { header: "Supplier name", key: "name", width: 28 },
  { header: "Taxable value", key: "taxable", width: 16, kind: "rupees" },
  { header: "IGST", key: "igst", width: 14, kind: "rupees" },
  { header: "CGST", key: "cgst", width: 14, kind: "rupees" },
  { header: "SGST", key: "sgst", width: 14, kind: "rupees" },
  {
    header: "ITC eligible (Y/N)",
    key: "eligible",
    width: 18,
    required: true,
  },
  {
    header: "Goods / service received on",
    key: "receivedOn",
    width: 26,
    kind: "date",
  },
];

/** @type {Record<string, { name: string, columns: Column[], what: string }>} */
export const GST_SHEETS = {
  salesB2B: {
    name: "Sales B2B",
    columns: SALES_B2B,
    what: "Every invoice to a registered business.",
  },
  salesB2C: {
    name: "Sales B2C",
    columns: SALES_B2C,
    what: "Everything else you sold, summarised or invoice by invoice.",
  },
  purchases: {
    name: "Purchases",
    columns: PURCHASES,
    what: "What you bought, with whether the credit is eligible and when it arrived.",
  },
};

/** The sheet names, in the order they appear in the workbook. */
export const SHEET_NAMES = Object.values(GST_SHEETS).map((s) => s.name);

/**
 * The workbook to send, as `buildWorkbook` wants it.
 *
 * The first sheet is a page of instructions rather than data. A client who
 * opens a bare grid of columns guesses at what they mean, and a guess in the
 * purchase sheet's eligibility column is the one that costs money.
 *
 * @param {{ clientName: string, period: string, firm?: string }} input
 */
export function gstTemplateSheets({ clientName, period, firm }) {
  const notes = [
    { row: `${clientName} — GST data for ${period}` },
    { row: NOT_A_FILING_FILE },
    { row: "" },
    { row: "Three sheets to fill in:" },
    ...Object.values(GST_SHEETS).map((sheet) => ({
      row: `  ${sheet.name} — ${sheet.what}`,
    })),
    { row: "" },
    { row: "Two things worth saying about the Purchases sheet:" },
    {
      row: '  "ITC eligible (Y/N)" — mark N where the credit is blocked, or where you are not sure. We will ask.',
    },
    {
      row: '  "Goods / service received on" — leave it empty if it has not arrived yet. Credit is not taken on what has not arrived.',
    },
    { row: "" },
    {
      row: "Amounts in rupees. Leave a tax column empty rather than putting a zero you are not sure of.",
    },
    { row: "" },
    {
      row: `Any questions, reply to the email and ask.${firm ? ` — ${firm}` : ""}`,
    },
  ];

  return [
    {
      name: "Read this first",
      title: `GST data for ${period}`,
      columns: [{ header: "", key: "row", width: 110 }],
      rows: notes,
    },
    ...Object.values(GST_SHEETS).map((sheet) => ({
      name: sheet.name,
      title: `${sheet.name} — ${period} — preparation only, not a filing file`,
      columns: sheet.columns,
      rows: [],
    })),
  ];
}

// @ts-check

import { parseCSVObjects } from "../csv.js";
import { validateClient } from "./validate.js";

/**
 * Bulk import of existing clients (spec section 3), as a validation preview
 * before anything is written.
 *
 * The header row is matched loosely, so "Legal name", "LEGAL_NAME" and
 * "Legal Name" all work, and columns may be in any order. Up to three GSTINs
 * and two contacts per row, which covers almost every real client; anything
 * more is added on the client's own page afterwards.
 */

/** Published column names, used for the downloadable template. */
export const IMPORT_COLUMNS = [
  "Group",
  "Legal name",
  "Trade name",
  "Entity type",
  "Branch code",
  "PAN",
  "TAN",
  "CIN",
  "GSTIN 1",
  "GSTIN 2",
  "GSTIN 3",
  "Contact 1 name",
  "Contact 1 mobile",
  "Contact 1 email",
  "Contact 2 name",
  "Contact 2 mobile",
  "Contact 2 email",
  "Status",
  "Risk",
  "Credit days",
  "Industry",
  "Turnover band",
  "Tags",
  "Invoice email",
  "City",
  "State",
  "Pincode",
];

/** Header key (as normaliseHeader produces) to the field it fills. */
const SIMPLE_FIELDS = {
  legalname: "legalName",
  tradename: "tradeName",
  entitytype: "entityType",
  pan: "pan",
  tan: "tan",
  cin: "cin",
  status: "status",
  risk: "risk",
  creditdays: "creditDays",
  industry: "industry",
  turnoverband: "turnoverBand",
  tags: "tags",
  invoiceemail: "invoiceEmail",
  referralsource: "referralSource",
};

/**
 * Turn one spreadsheet row into the shape validateClient() expects.
 * @param {Record<string, string>} row
 * @param {Map<string, string>} branchIdByCode
 */
function toClientInput(row, branchIdByCode) {
  /** @type {Record<string, any>} */
  const input = {};

  for (const [key, field] of Object.entries(SIMPLE_FIELDS)) {
    if (row[key] !== undefined && row[key] !== "") input[field] = row[key];
  }

  // a blank status column means a client the firm is already working for
  if (!input.status) input.status = "Active";
  if (!input.creditDays) input.creditDays = 15;

  const code = String(row.branchcode ?? "")
    .trim()
    .toUpperCase();
  input.branchId = branchIdByCode.get(code) ?? "";

  input.gstins = [row.gstin1, row.gstin2, row.gstin3]
    .filter((g) => g && String(g).trim())
    .map((gstin) => ({ gstin }));

  input.contacts = [1, 2]
    .map((n) => ({
      name: row[`contact${n}name`] ?? "",
      mobile: row[`contact${n}mobile`] ?? "",
      email: row[`contact${n}email`] ?? "",
      primary: n === 1,
    }))
    .filter((c) => c.name || c.mobile || c.email);

  if (row.city || row.state || row.pincode) {
    input.addresses = [
      {
        kind: "Registered",
        city: row.city ?? "",
        state: row.state ?? "",
        pincode: row.pincode ?? "",
      },
    ];
  }

  return {
    input,
    branchCode: code,
    // the spreadsheet names a group; the id is resolved as the row is written,
    // creating the group if the firm has not used that name before
    groupName: String(row.group ?? "").trim(),
  };
}

/**
 * Validate a whole file without touching the database.
 *
 * @param {string} csvText
 * @param {{ branches: {id: string, code: string}[] }} context
 * @returns {{
 *   headers: string[],
 *   rows: { line: number, name: string, input: object, value: object,
 *           errors: string[], duplicateOf?: string }[],
 *   readyCount: number,
 *   errorCount: number,
 *   unknownHeaders: string[],
 * }}
 */
export function prepareImport(csvText, { branches }) {
  const { headers, rows: raw } = parseCSVObjects(csvText);
  const branchIdByCode = new Map(branches.map((b) => [b.code, b.id]));

  const known = new Set([
    ...Object.keys(SIMPLE_FIELDS),
    // the round-trip sheet (P3-18a) carries our own client code, so a row
    // can find the client it belongs to. Harmless on a fresh import.
    "clientcode",
    "branchcode",
    "group",
    "gstin1",
    "gstin2",
    "gstin3",
    "contact1name",
    "contact1mobile",
    "contact1email",
    "contact2name",
    "contact2mobile",
    "contact2email",
    "city",
    "state",
    "pincode",
  ]);

  const unknownHeaders = headers.filter(
    (h) =>
      h.trim() !== "" && !known.has(h.toLowerCase().replace(/[^a-z0-9]/g, "")),
  );

  // The same client twice inside the file itself, before the database is
  // asked. Only PAN needs tracking: a GSTIN carries its own PAN, so two rows
  // sharing a GSTIN necessarily share a PAN and are caught here.
  const seenPan = new Map();

  const rows = raw.map((row, i) => {
    const line = i + 2; // row 1 is the header, as the person sees it in Excel
    const { input, branchCode, groupName } = toClientInput(row, branchIdByCode);
    const { errors, value } = validateClient(input, { requireGroup: false });

    /** @type {string[]} */
    const messages = Object.entries(errors).map(([field, message]) =>
      field.includes(".") ? `${field}: ${message}` : message,
    );

    if (!groupName) {
      messages.push(
        "Group is missing — every client belongs to one owner's group",
      );
    }

    if (!branchCode) {
      messages.push("Branch code is missing");
    } else if (!branchIdByCode.has(branchCode)) {
      messages.push(
        `Branch "${branchCode}" is not one of ${[...branchIdByCode.keys()].join(", ")}`,
      );
    }

    let duplicateOf;
    if (value.pan) {
      if (seenPan.has(value.pan)) {
        duplicateOf = `row ${seenPan.get(value.pan)}`;
        messages.push(`The same PAN appears on row ${seenPan.get(value.pan)}`);
      } else {
        seenPan.set(value.pan, line);
      }
    }
    return {
      line,
      name: value.legalName || row.legalname || "(no name)",
      input,
      value,
      groupName,
      branchCode,
      /** Blank on a fresh import; the client's own code on a round-trip. */
      code: String(row.clientcode ?? "")
        .trim()
        .toUpperCase(),
      errors: messages,
      duplicateOf,
    };
  });

  return {
    headers,
    rows,
    readyCount: rows.filter((r) => r.errors.length === 0).length,
    errorCount: rows.filter((r) => r.errors.length > 0).length,
    unknownHeaders,
  };
}

/** The template a person downloads, fills in and uploads. */
export function importTemplateRows() {
  return [
    IMPORT_COLUMNS,
    [
      "Sharma family",
      "Sharma Textiles Private Limited",
      "Sharma Textiles",
      "Private Limited",
      "NOI",
      "AABCS1429P",
      "DELS12345B",
      "U17111UP2015PTC071234",
      "09AABCS1429P1Z4",
      "",
      "",
      "Rakesh Sharma",
      "9811034567",
      "rakesh@sharmatextiles.in",
      "Anita Sharma",
      "9811034568",
      "accounts@sharmatextiles.in",
      "Active",
      "Medium",
      "15",
      "Textile manufacturing",
      "₹5 – 50 crore",
      "GST, Audit",
      "accounts@sharmatextiles.in",
      "Noida",
      "Uttar Pradesh",
      "201301",
    ],
  ];
}

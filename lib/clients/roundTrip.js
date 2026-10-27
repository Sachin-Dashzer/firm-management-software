// @ts-check

import { IMPORT_COLUMNS, prepareImport } from "./import.js";
import { validateClient } from "./validate.js";
import { normaliseHeader } from "../csv.js";

/**
 * The bulk client round-trip (P3-18a).
 *
 * Export the list in the same shape the import reads, edit it in Excel,
 * send it back. The import has done the *creating* half since Step 3; this
 * is the *updating* half, and the three rules it carries are the reason it
 * is not just "import with upsert":
 *
 *  - **a row finds its client by our own code, and by nothing else.**
 *    Matching on PAN or on a name is how two clients quietly become one,
 *    and a spreadsheet is exactly where that happens. A row with no code
 *    is a new client and goes down the ordinary create path.
 *  - **nothing is applied that nobody has seen at field level.** The
 *    preview is per field — *was → will be* — with a tick each, so a
 *    column somebody dragged down by accident is refused one field at a
 *    time rather than row at a time.
 *  - **identity is held for a partner.** A sheet uploaded by anybody else
 *    cannot rewrite a legal name, a PAN, a GSTIN, the branch, the group or
 *    the status; those become held changes a partner decides on, one by
 *    one. Forty PANs rewritten by a dragged cell is the thing this exists
 *    to stop.
 */

/** Our own code first, then the import's own columns. */
export const ROUND_TRIP_COLUMNS = ["Client code", ...IMPORT_COLUMNS];

/**
 * The fields a sheet may change, in the order the preview shows them.
 *
 * Contacts and addresses are deliberately **not** here: the sheet's contact
 * columns are read when a row creates a client and ignored when it updates
 * one. A contact is a person with a mobile and an email, and merging two
 * lists of them from a spreadsheet is a different problem — one somebody
 * should solve on the client's own page, where they can see who they are
 * about to overwrite.
 */
export const DIFF_FIELDS = [
  { field: "legalName", label: "Legal name", held: true },
  { field: "tradeName", label: "Trade name", held: false },
  { field: "entityType", label: "Entity type", held: true },
  { field: "branchId", label: "Branch", held: true },
  { field: "pan", label: "PAN", held: true },
  { field: "tan", label: "TAN", held: true },
  { field: "cin", label: "CIN", held: true },
  { field: "gstins", label: "GSTIN", held: true, list: true },
  { field: "status", label: "Status", held: true },
  { field: "risk", label: "Risk", held: false },
  { field: "creditDays", label: "Credit days", held: false },
  { field: "industry", label: "Industry", held: false },
  { field: "turnoverBand", label: "Turnover band", held: false },
  { field: "tags", label: "Tags", held: false, list: true },
  { field: "invoiceEmail", label: "Invoice email", held: false },
];

/** Which of them wait for a partner. */
export const HELD_FIELDS = DIFF_FIELDS.filter((row) => row.held).map(
  (row) => row.field,
);

/**
 * The column each field comes from, as `normaliseHeader` writes it.
 *
 * This is what makes "a blank cell changes nothing" true in the only way
 * that matters: a field is considered **only when its column is in the
 * file**. The import fills defaults for a new client — a missing Status
 * becomes Active, a missing Credit days becomes 15 — and on an update
 * those defaults would propose changes nobody asked for.
 */
const COLUMN_FOR = {
  legalName: ["legalname"],
  tradeName: ["tradename"],
  entityType: ["entitytype"],
  branchId: ["branchcode"],
  pan: ["pan"],
  tan: ["tan"],
  cin: ["cin"],
  gstins: ["gstin1", "gstin2", "gstin3"],
  status: ["status"],
  risk: ["risk"],
  creditDays: ["creditdays"],
  industry: ["industry"],
  turnoverBand: ["turnoverband"],
  tags: ["tags"],
  invoiceEmail: ["invoiceemail"],
};

/**
 * Is this change held, for this person?
 *
 * A partner's own upload applies: they are the person a hold waits for, and
 * holding a change for the only people who can release it is a queue that
 * never empties.
 *
 * @param {string} field
 * @param {{role: string}} actor
 */
export function isHeld(field, actor) {
  if (actor?.role === "partner") return false;
  return HELD_FIELDS.includes(field);
}

/** One client as a row of the round-trip sheet. */
export function clientToRow(client, { branchCode = "", groupName = "" } = {}) {
  const gstins = (client.gstins ?? []).map((row) => row.gstin ?? row);
  const contacts = client.contacts ?? [];

  return {
    "Client code": client.code ?? "",
    Group: groupName,
    "Legal name": client.legalName ?? "",
    "Trade name": client.tradeName ?? "",
    "Entity type": client.entityType ?? "",
    "Branch code": branchCode,
    PAN: client.pan ?? "",
    TAN: client.tan ?? "",
    CIN: client.cin ?? "",
    "GSTIN 1": gstins[0] ?? "",
    "GSTIN 2": gstins[1] ?? "",
    "GSTIN 3": gstins[2] ?? "",
    "Contact 1 name": contacts[0]?.name ?? "",
    "Contact 1 mobile": contacts[0]?.mobile ?? "",
    "Contact 1 email": contacts[0]?.email ?? "",
    "Contact 2 name": contacts[1]?.name ?? "",
    "Contact 2 mobile": contacts[1]?.mobile ?? "",
    "Contact 2 email": contacts[1]?.email ?? "",
    Status: client.status ?? "",
    Risk: client.risk ?? "",
    "Credit days":
      client.creditDays === undefined || client.creditDays === null
        ? ""
        : String(client.creditDays),
    Industry: client.industry ?? "",
    "Turnover band": client.turnoverBand ?? "",
    Tags: (client.tags ?? []).join(", "),
    "Invoice email": client.invoiceEmail ?? "",
    City: client.addresses?.[0]?.city ?? "",
    State: client.addresses?.[0]?.state ?? "",
    Pincode: client.addresses?.[0]?.pincode ?? "",
  };
}

/** How a value reads in the preview, so a list and a number look like one. */
function show(value, branchName) {
  if (value === undefined || value === null || value === "") return "—";
  if (Array.isArray(value)) {
    const parts = value.map((row) =>
      typeof row === "string" ? row : (row.gstin ?? ""),
    );
    return parts.filter(Boolean).join(", ") || "—";
  }
  if (branchName) return branchName;
  return String(value);
}

/** Two values, compared the way the preview shows them. */
function same(before, after) {
  const one = Array.isArray(before)
    ? before
        .map((row) => (typeof row === "string" ? row : (row.gstin ?? "")))
        .join("|")
    : String(before ?? "");
  const two = Array.isArray(after)
    ? after
        .map((row) => (typeof row === "string" ? row : (row.gstin ?? "")))
        .join("|")
    : String(after ?? "");
  return one === two;
}

/**
 * A whole file read against the clients we already have.
 *
 * @param {string} csvText
 * @param {object} context
 * @param {{id: string, code: string, name?: string}[]} context.branches
 * @param {any[]} context.clients  lean clients, with `code`
 * @param {{role: string}} context.actor
 */
export function prepareRoundTrip(csvText, { branches, clients, actor }) {
  const parsed = prepareImport(csvText, { branches });
  const byCode = new Map(
    clients.map((client) => [String(client.code ?? "").toUpperCase(), client]),
  );
  const branchName = new Map(
    branches.map((branch) => [
      String(branch.id),
      branch.name ? `${branch.name} (${branch.code})` : branch.code,
    ]),
  );

  /** Which columns the file actually has, so a missing one is left alone. */
  const present = new Set(
    parsed.headers.map((header) => normaliseHeader(header)),
  );

  const rows = parsed.rows.map((row) => {
    if (!row.code) {
      return { ...row, kind: "new", changes: [] };
    }

    const client = byCode.get(row.code);
    if (!client) {
      return {
        ...row,
        kind: "unknown",
        changes: [],
        errors: [
          `No client has the code ${row.code}. Leave the code blank to add a new client, or correct it.`,
        ],
      };
    }

    /**
     * An update row is validated **partially**, like the client's own edit
     * form: the import validates a row as a whole new client, which asks
     * an update sheet for an entity type, a branch and a contact it was
     * never going to carry.
     */
    const partial = validateClient(row.input, { partial: true });
    const value = partial.value;

    /**
     * Only what is wrong with a column the file actually carries — and
     * `gstins.0` is matched back through `COLUMN_FOR`, so a GSTIN the
     * sheet got wrong is reported rather than dropped in silence.
     */
    const errors = Object.entries(partial.errors)
      .filter(([field]) =>
        (COLUMN_FOR[field.split(".")[0]] ?? [normaliseHeader(field)]).some(
          (column) => present.has(column),
        ),
      )
      .map(([field, message]) =>
        field.includes(".") ? `${field}: ${message}` : message,
      );

    /**
     * Only what the sheet actually carries. A blank cell is "not saying",
     * never "clear it": a spreadsheet full of empty columns must not empty
     * forty client records, and anybody who means to clear a field does it
     * on the client's own page.
     */
    const changes = [];
    for (const spec of DIFF_FIELDS) {
      // not in the file at all: not a change, not a question
      if (
        !(COLUMN_FOR[spec.field] ?? []).some((column) => present.has(column))
      ) {
        continue;
      }

      const after = value[spec.field];
      if (after === undefined) continue;
      if (spec.list && Array.isArray(after) && after.length === 0) continue;
      if (after === "") continue;

      const before = client[spec.field];
      if (same(before, after)) continue;

      changes.push({
        field: spec.field,
        label: spec.label,
        from: show(
          before,
          spec.field === "branchId" ? branchName.get(String(before)) : "",
        ),
        to: show(
          after,
          spec.field === "branchId" ? branchName.get(String(after)) : "",
        ),
        /** The stored values, for the write and for the undo. */
        beforeValue: before ?? null,
        afterValue: after,
        held: isHeld(spec.field, actor),
      });
    }

    return {
      ...row,
      kind: "update",
      clientId: String(client._id),
      name: client.tradeName || client.legalName || row.name,
      changes,
      /**
       * Only what is wrong with the columns the file carries. An update is
       * never refused for a missing group, a missing contact or a missing
       * branch — the client already has all three.
       */
      errors,
    };
  });

  const updates = rows.filter((row) => row.kind === "update");

  return {
    headers: parsed.headers,
    unknownHeaders: parsed.unknownHeaders,
    rows,
    newCount: rows.filter((row) => row.kind === "new").length,
    updateCount: updates.filter((row) => row.changes.length > 0).length,
    unchangedCount: updates.filter((row) => row.changes.length === 0).length,
    heldCount: updates.reduce(
      (sum, row) => sum + row.changes.filter((change) => change.held).length,
      0,
    ),
    errorCount: rows.filter((row) => row.errors.length > 0).length,
  };
}

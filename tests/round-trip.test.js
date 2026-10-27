import { describe, it, expect } from "vitest";
import {
  ROUND_TRIP_COLUMNS,
  DIFF_FIELDS,
  HELD_FIELDS,
  isHeld,
  clientToRow,
  prepareRoundTrip,
} from "../lib/clients/roundTrip.js";
import { IMPORT_COLUMNS } from "../lib/clients/import.js";

/**
 * The bulk client round-trip (P3-18a).
 *
 * Three things are worth a test here and they are all about what the sheet
 * is *not* allowed to do: find a client by anything but our own code, clear
 * a field because a cell was left empty, and rewrite an identity field
 * without a partner.
 */

const branches = [
  { id: "b1", code: "NOI", name: "Noida" },
  { id: "b2", code: "LDH", name: "Ludhiana" },
];

const client = (over = {}) => ({
  _id: "c1",
  code: "PHMG-NOI-0001",
  legalName: "Nirmal Udyog Private Limited",
  tradeName: "Nirmal Udyog",
  entityType: "Private Limited",
  branchId: "b1",
  pan: "AABCS1429P",
  tan: "",
  cin: "",
  gstins: [{ gstin: "09AABCS1429P1ZZ" }],
  status: "Active",
  risk: "Low",
  creditDays: 15,
  industry: "Manufacturing",
  turnoverBand: "",
  tags: ["gst"],
  invoiceEmail: "accounts@nirmal.test",
  ...over,
});

const employee = { role: "employee" };
const partner = { role: "partner" };

/** A sheet with a header row and one row, in round-trip shape. */
function sheet(cells) {
  const header = ["Client code", "Legal name", ...Object.keys(cells)];
  const row = [
    "PHMG-NOI-0001",
    "Nirmal Udyog Private Limited",
    ...Object.values(cells),
  ];
  return `${header.join(",")}\n${row.map((value) => `"${value}"`).join(",")}`;
}

const run = (text, actor = employee, clients = [client()]) =>
  prepareRoundTrip(text, { branches, clients, actor });

describe("the sheet is the import's own shape, plus our code", () => {
  it("puts the client code first and keeps every import column", () => {
    expect(ROUND_TRIP_COLUMNS[0]).toBe("Client code");
    expect(ROUND_TRIP_COLUMNS.slice(1)).toEqual(IMPORT_COLUMNS);
  });

  it("writes a client out in those columns", () => {
    const row = clientToRow(client(), {
      branchCode: "NOI",
      groupName: "Nirmal family",
    });
    expect(row["Client code"]).toBe("PHMG-NOI-0001");
    expect(row["Branch code"]).toBe("NOI");
    expect(row.Group).toBe("Nirmal family");
    expect(row["GSTIN 1"]).toBe("09AABCS1429P1ZZ");
    expect(row.Tags).toBe("gst");
    expect(row["Credit days"]).toBe("15");
  });

  /** Every column the sheet offers is a column the diff can read back. */
  it("can read back every field it writes, or deliberately ignores it", () => {
    const diffable = DIFF_FIELDS.map((row) => row.field);
    for (const field of ["legalName", "tradeName", "pan", "status", "tags"]) {
      expect(diffable, field).toContain(field);
    }
    // contacts and addresses are written for a new client and never diffed
    expect(diffable).not.toContain("contacts");
    expect(diffable).not.toContain("addresses");
  });
});

describe("a row finds its client by the code, and by nothing else", () => {
  it("matches the code", () => {
    const result = run(sheet({ "Trade name": "Nirmal Udyog Ltd" }));
    expect(result.rows[0].kind).toBe("update");
    expect(result.rows[0].clientId).toBe("c1");
  });

  it("refuses a code nobody has, rather than guessing from the name", () => {
    const text = sheet({}).replace("PHMG-NOI-0001", "PHMG-NOI-9999");
    const result = run(text);
    expect(result.rows[0].kind).toBe("unknown");
    expect(result.rows[0].errors[0]).toMatch(/No client has the code/);
  });

  it("treats a row with no code as a new client, not an update", () => {
    const text = sheet({}).replace('"PHMG-NOI-0001"', '""');
    const result = run(text);
    expect(result.rows[0].kind).toBe("new");
    expect(result.newCount).toBe(1);
  });
});

describe("a blank cell changes nothing", () => {
  it("leaves a field alone when the column is empty", () => {
    const result = run(sheet({ "Trade name": "", Industry: "" }));
    expect(result.rows[0].changes).toEqual([]);
    expect(result.unchangedCount).toBe(1);
  });

  it("leaves a field alone when the column is not in the sheet at all", () => {
    const result = run(sheet({ Risk: "High" }));
    expect(result.rows[0].changes.map((row) => row.field)).toEqual(["risk"]);
  });

  it("says nothing changed when the sheet matches the record", () => {
    const result = run(sheet({ "Trade name": "Nirmal Udyog" }));
    expect(result.rows[0].changes).toEqual([]);
  });

  it("reads a GSTIN list as a list, not as three fields", () => {
    const result = run(
      sheet({
        "GSTIN 1": "09AABCS1429P1ZZ",
        "GSTIN 2": "03AABCS1429P1ZB",
      }),
    );
    const change = result.rows[0].changes.find((row) => row.field === "gstins");
    expect(change.from).toBe("09AABCS1429P1ZZ");
    expect(change.to).toBe("09AABCS1429P1ZZ, 03AABCS1429P1ZB");
  });
});

describe("identity waits for a partner", () => {
  it("holds the six that matter", () => {
    expect(HELD_FIELDS).toEqual([
      "legalName",
      "entityType",
      "branchId",
      "pan",
      "tan",
      "cin",
      "gstins",
      "status",
    ]);
  });

  it("holds them for an employee and not for a partner", () => {
    expect(isHeld("pan", employee)).toBe(true);
    expect(isHeld("pan", partner)).toBe(false);
    // holding a change for the only people who can release it is a queue
    // that never empties
  });

  it("lets anybody change the ordinary fields", () => {
    expect(isHeld("tradeName", employee)).toBe(false);
    expect(isHeld("risk", employee)).toBe(false);
    expect(isHeld("creditDays", employee)).toBe(false);
  });

  it("marks the held changes in the preview, one field at a time", () => {
    const result = run(
      sheet({ "Trade name": "Nirmal Udyog Ltd", PAN: "AAACS1429P" }),
    );
    const changes = result.rows[0].changes;
    expect(changes.find((row) => row.field === "tradeName").held).toBe(false);
    expect(changes.find((row) => row.field === "pan").held).toBe(true);
    expect(result.heldCount).toBe(1);
  });

  it("holds nothing when a partner sends the same sheet", () => {
    const result = run(
      sheet({ "Trade name": "Nirmal Udyog Ltd", PAN: "AAACS1429P" }),
      partner,
    );
    expect(result.heldCount).toBe(0);
    expect(result.rows[0].changes.every((row) => !row.held)).toBe(true);
  });

  it("carries both values, so a decline and an undo are exact", () => {
    const change = run(sheet({ PAN: "AAACS1429P" })).rows[0].changes[0];
    expect(change.beforeValue).toBe("AABCS1429P");
    expect(change.afterValue).toBe("AAACS1429P");
    expect(change.from).toBe("AABCS1429P");
    expect(change.to).toBe("AAACS1429P");
  });
});

describe("the preview counts what a person is about to do", () => {
  it("separates changed, unchanged and new", () => {
    const text = [
      "Client code,Legal name,Trade name",
      '"PHMG-NOI-0001","Nirmal Udyog Private Limited","Nirmal Udyog Ltd"',
      '"PHMG-NOI-0002","Sharma Textiles LLP","Sharma Textiles"',
      '"","Brand New Traders Private Limited","Brand New"',
    ].join("\n");

    const result = run(text, employee, [
      client(),
      client({
        _id: "c2",
        code: "PHMG-NOI-0002",
        legalName: "Sharma Textiles LLP",
        tradeName: "Sharma Textiles",
      }),
    ]);

    expect(result.updateCount).toBe(1);
    expect(result.unchangedCount).toBe(1);
    expect(result.newCount).toBe(1);
  });

  it("does not refuse an update for a missing group, which it already has", () => {
    const result = run(sheet({ Risk: "High" }));
    expect(result.rows[0].errors).toEqual([]);
  });

  it("names a column nobody reads instead of silently ignoring it", () => {
    const result = run(sheet({ "Favourite colour": "blue" }));
    expect(result.unknownHeaders).toContain("Favourite colour");
  });
});

describe("what the sheet got wrong is said, not dropped", () => {
  /**
   * The error arrives from the validator as `gstins.0`, and the column is
   * called "GSTIN 1". Matching the two is the difference between telling
   * somebody their GSTIN is mistyped and silently ignoring the cell.
   */
  it("reports a mistyped GSTIN against the column it came from", () => {
    const result = run(sheet({ "GSTIN 1": "09AABCS1429P1Z9" }));
    expect(result.rows[0].errors[0]).toMatch(/gstins.0/);
    expect(result.errorCount).toBe(1);
  });

  it("reports a PAN that is not a PAN", () => {
    const result = run(sheet({ PAN: "NOTAPAN123" }));
    expect(result.rows[0].errors.length).toBe(1);
  });
});

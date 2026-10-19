import { describe, it, expect } from "vitest";
import {
  prepareOpeningBalances,
  readDate,
  readRupees,
  openingTemplateRows,
  OPENING_COLUMNS,
} from "../lib/migration/openingBalances.js";
import { prepareTeamImport, teamTemplateRows } from "../lib/migration/team.js";
import { REDACTION } from "../lib/dpdp/index.js";

/**
 * The go-live imports (spec section 17, step 2).
 *
 * These run once, on the day the firm switches over, against a sheet
 * somebody typed by hand — so the tests are mostly about the ways a real
 * sheet is wrong: an Indian date, a rupee amount with commas, a client
 * code that does not exist, the same invoice twice, and the sheet being
 * imported a second time.
 *
 * Getting opening receivables wrong is the expensive one. Too low and the
 * firm under-chases; too high and it chases money it was already paid.
 */

const clients = [
  {
    id: "c1",
    code: "PHMG-NOI-0001",
    legalName: "Sharma Textiles Private Limited",
    branchId: "b1",
  },
  {
    id: "c2",
    code: "PHMG-LDH-0007",
    legalName: "Rao & Co",
    branchId: "b2",
  },
];

const branches = [
  { id: "b1", code: "NOI" },
  { id: "b2", code: "LDH" },
  { id: "b3", code: "DEL" },
  { id: "b4", code: "MRT" },
];

const csv = (rows) =>
  rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");

describe("dates as people type them", () => {
  it("reads an Indian date day-first", () => {
    // 04-05-2026 is the 4th of May here, not the 5th of April
    const date = readDate("04-05-2026");
    expect(date.toISOString().slice(0, 10)).toBe("2026-05-03");
  });

  it("takes slashes, dots and two-digit years", () => {
    for (const text of ["15/04/2026", "15.04.2026", "15-04-26"]) {
      expect(readDate(text), text).not.toBeNull();
    }
  });

  it("takes an ISO date, which is what a system export gives", () => {
    expect(readDate("2026-04-15")).not.toBeNull();
  });

  it("stores midnight IST, not midnight UTC", () => {
    // 15 Apr 2026 00:00 IST is 14 Apr 18:30 UTC — otherwise a date drifts
    // a day backwards on every screen
    expect(readDate("15-04-2026").toISOString()).toBe(
      "2026-04-14T18:30:00.000Z",
    );
  });

  it("refuses something that is not a date", () => {
    for (const text of ["", "last April", "32-01-2026", "2026"]) {
      expect(readDate(text), text).toBeNull();
    }
  });
});

describe("amounts as people type them", () => {
  it("reads Indian grouping and a rupee sign", () => {
    expect(readRupees("1,25,000")).toBe(12_500_000);
    expect(readRupees("₹45,000")).toBe(4_500_000);
    expect(readRupees("45000.50")).toBe(4_500_050);
  });

  it("refuses words, blanks and junk rather than guessing zero", () => {
    for (const text of ["", "about 40k", "4,0,0.0.0", "-"]) {
      expect(readRupees(text), text).toBeNull();
    }
  });
});

describe("opening balances", () => {
  const good = [
    OPENING_COLUMNS,
    [
      "PHMG-NOI-0001",
      "2025-26/114",
      "12-02-2026",
      "27-02-2026",
      "45000",
      "Audit",
    ],
    ["PHMG-LDH-0007", "2025-26/221", "03-03-2026", "", "1,25,000", ""],
  ];

  it("reads a clean sheet and totals it", () => {
    const result = prepareOpeningBalances(csv(good), { clients });
    expect(result.readyCount).toBe(2);
    expect(result.errorCount).toBe(0);
    expect(result.totalPaise).toBe(4_500_000 + 12_500_000);
  });

  it("puts them in their own series, outside the GST numbering", () => {
    const result = prepareOpeningBalances(csv(good), { clients });
    // the firm's real invoices are numbered gaplessly; history must not
    // take a number out of that series
    expect(result.rows[0].value.number).toBe("OB/2025-26/114");
    expect(result.rows[0].value.originalNumber).toBe("2025-26/114");
  });

  it("treats a missing due date as due when it was raised", () => {
    const result = prepareOpeningBalances(csv(good), { clients });
    const row = result.rows[1];
    expect(+row.value.dueDate).toBe(+row.value.date);
  });

  it("names a client code that does not exist", () => {
    const result = prepareOpeningBalances(
      csv([
        OPENING_COLUMNS,
        ["PHMG-XXX-9999", "9", "01-04-2026", "", "100", ""],
      ]),
      { clients },
    );
    expect(result.rows[0].errors[0]).toContain("PHMG-XXX-9999");
    expect(result.readyCount).toBe(0);
  });

  it("catches the same invoice twice in one sheet", () => {
    const result = prepareOpeningBalances(
      csv([
        OPENING_COLUMNS,
        ["PHMG-NOI-0001", "114", "01-04-2026", "", "100", ""],
        ["PHMG-NOI-0001", "114", "01-04-2026", "", "100", ""],
      ]),
      { clients },
    );
    expect(result.rows[1].errors[0]).toContain("row 2");
    expect(result.readyCount).toBe(1);
  });

  it("refuses a zero or negative balance", () => {
    const result = prepareOpeningBalances(
      csv([
        OPENING_COLUMNS,
        ["PHMG-NOI-0001", "1", "01-04-2026", "", "0", ""],
        ["PHMG-NOI-0001", "2", "01-04-2026", "", "-500", ""],
      ]),
      { clients },
    );
    expect(result.readyCount).toBe(0);
    expect(result.rows[0].errors[0]).toContain("more than zero");
  });

  it("reports a column it does not understand instead of ignoring it quietly", () => {
    const result = prepareOpeningBalances(
      csv([
        [...OPENING_COLUMNS, "interestCharged"],
        ["PHMG-NOI-0001", "1", "01-04-2026", "", "100", "", "50"],
      ]),
      { clients },
    );
    expect(result.unknownHeaders).toContain("interestCharged");
  });

  it("ships a template that passes its own check", () => {
    const result = prepareOpeningBalances(csv(openingTemplateRows()), {
      clients,
    });
    expect(result.errorCount).toBe(0);
    expect(result.readyCount).toBe(2);
  });
});

describe("the team import", () => {
  it("reads a clean sheet", () => {
    const result = prepareTeamImport(csv(teamTemplateRows()), { branches });
    expect(result.readyCount).toBe(3);
    expect(result.errorCount).toBe(0);
  });

  it("will not create a partner from a spreadsheet", () => {
    const result = prepareTeamImport(
      csv([
        ["name", "email", "role", "branchCodes", "notes"],
        ["Someone Ambitious", "x@phmgindia.com", "partner", "NOI", ""],
      ]),
      { branches },
    );
    expect(result.rows[0].skip).toBe(true);
    expect(result.rows[0].warnings[0]).toContain("Team screen");
    expect(result.readyCount).toBe(0);
    expect(result.skippedCount).toBe(1);
  });

  it("refuses an email somebody already has", () => {
    const result = prepareTeamImport(
      csv([
        ["name", "email", "role", "branchCodes", "notes"],
        ["Neha Bhatt", "neha@phmgindia.com", "ca", "NOI", ""],
      ]),
      { branches, existingEmails: ["NEHA@phmgindia.com"] },
    );
    expect(result.rows[0].errors[0]).toContain("already has");
  });

  it("catches the same email twice in one sheet", () => {
    const result = prepareTeamImport(
      csv([
        ["name", "email", "role", "branchCodes", "notes"],
        ["One", "same@phmgindia.com", "ca", "NOI", ""],
        ["Two", "same@phmgindia.com", "employee", "NOI", ""],
      ]),
      { branches },
    );
    expect(result.rows[1].errors[0]).toContain("row 2");
  });

  it("names the roles and branches that exist, when one is wrong", () => {
    const result = prepareTeamImport(
      csv([
        ["name", "email", "role", "branchCodes", "notes"],
        ["Wrong Role", "a@phmgindia.com", "manager", "NOI", ""],
        ["Wrong Branch", "b@phmgindia.com", "ca", "GOA", ""],
      ]),
      { branches },
    );
    expect(result.rows[0].errors[0]).toContain("partner");
    expect(result.rows[1].errors[0]).toContain("NOI");
  });

  it("takes several branches in one cell", () => {
    const result = prepareTeamImport(
      csv([
        ["name", "email", "role", "branchCodes", "notes"],
        ["Two Offices", "c@phmgindia.com", "ca", "NOI LDH", ""],
      ]),
      { branches },
    );
    expect(result.rows[0].value.branchIds).toEqual(["b1", "b2"]);
  });

  it("never carries a password column: those are read out, not typed in a sheet", () => {
    const result = prepareTeamImport(csv(teamTemplateRows()), { branches });
    for (const row of result.rows) {
      expect(Object.keys(row.value)).not.toContain("password");
    }
  });
});

describe("what a deletion request keeps", () => {
  it("keeps everything the law requires and says why", () => {
    const keeps = REDACTION.keeps.map(([what]) => what.toLowerCase());
    expect(keeps.join(" ")).toContain("invoices");
    expect(keeps.join(" ")).toContain("udin");
    expect(keeps.join(" ")).toContain("audit log");

    // every kept thing carries its reason: a redaction policy nobody can
    // read is one nobody can defend
    for (const [what, why] of REDACTION.keeps) {
      expect(why, what).toBeTruthy();
    }
  });

  it("clears every field that identifies a person", () => {
    const clears = REDACTION.clears.map(([field]) => field);
    for (const field of [
      "legalName",
      "pan",
      "aadhaarEncrypted",
      "contacts",
      "addresses",
    ]) {
      expect(clears, field).toContain(field);
    }
  });

  it("does not claim to destroy a per-client key, because there is not one", () => {
    // one storage key for the whole firm: the only honest way to make a
    // client's files unreadable is to erase them
    const text = JSON.stringify(REDACTION).toLowerCase();
    expect(text).toContain("erased");
    expect(text).not.toContain("key destroyed");
  });
});

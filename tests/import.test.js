import { describe, expect, it } from "vitest";
import { parseCSV, parseCSVObjects, toCSV, normaliseHeader } from "@/lib/csv";
import { prepareImport, IMPORT_COLUMNS } from "@/lib/clients/import";
import { validateClient } from "@/lib/clients/validate";

const BRANCHES = [
  { id: "b-noi", code: "NOI" },
  { id: "b-ldh", code: "LDH" },
];

describe("CSV parsing", () => {
  it("reads plain rows", () => {
    expect(parseCSV("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quotes, commas and doubled quotes inside fields", () => {
    expect(parseCSV('name,note\n"Sharma, Rakesh","said ""fine"""')).toEqual([
      ["name", "note"],
      ["Sharma, Rakesh", 'said "fine"'],
    ]);
  });

  it("handles a newline inside a quoted field", () => {
    const [, row] = parseCSV('a,b\n"line one\nline two",x');
    expect(row[0]).toBe("line one\nline two");
  });

  it("copes with Windows line endings and Excel's byte-order mark", () => {
    expect(parseCSV("﻿a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("drops blank lines rather than importing empty clients", () => {
    expect(parseCSV("a,b\n1,2\n\n,\n3,4")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("matches headers loosely, so Excel formatting does not matter", () => {
    expect(normaliseHeader("Legal Name *")).toBe("legalname");
    expect(normaliseHeader("LEGAL_NAME")).toBe("legalname");
    const { rows } = parseCSVObjects("Legal Name,PAN\nABC Traders,AAAFZ1234C");
    expect(rows[0]).toEqual({ legalname: "ABC Traders", pan: "AAAFZ1234C" });
  });

  it("writes CSV that Excel reads back unchanged", () => {
    const text = toCSV([
      ["name", "amount"],
      ['Sharma "Bros", Noida', "₹1,00,000"],
    ]);
    expect(text.startsWith("﻿")).toBe(true);
    const [, row] = parseCSV(text);
    expect(row).toEqual(['Sharma "Bros", Noida', "₹1,00,000"]);
  });
});

describe("the client import preview", () => {
  const header = IMPORT_COLUMNS.join(",");

  /** One good row, built from the published column order. */
  function row(overrides = {}) {
    const values = {
      "Legal name": "Sharma Textiles Private Limited",
      "Trade name": "Sharma Textiles",
      "Entity type": "Private Limited",
      "Branch code": "NOI",
      PAN: "AABCS1429P",
      "GSTIN 1": "09AABCS1429P1ZZ",
      "Contact 1 name": "Rakesh Sharma",
      "Contact 1 mobile": "9811034567",
      Status: "Active",
      Risk: "Medium",
      "Credit days": "15",
      ...overrides,
    };
    return IMPORT_COLUMNS.map((c) => values[c] ?? "").join(",");
  }

  it("accepts a good row and reports it ready", () => {
    const result = prepareImport(`${header}\n${row()}`, { branches: BRANCHES });
    expect(result.readyCount).toBe(1);
    expect(result.errorCount).toBe(0);
    expect(result.rows[0].value.pan).toBe("AABCS1429P");
    expect(result.rows[0].value.gstins[0].state).toBe("Uttar Pradesh");
    expect(result.rows[0].value.contacts[0].primary).toBe(true);
  });

  it("numbers rows the way Excel does, so a person can find the bad one", () => {
    const result = prepareImport(
      `${header}\n${row()}\n${row({ "Legal name": "", PAN: "AAACZ1234C" })}`,
      { branches: BRANCHES },
    );
    expect(result.rows[0].line).toBe(2);
    expect(result.rows[1].line).toBe(3);
  });

  it("reports a bad GSTIN against the row it is on", () => {
    const result = prepareImport(
      `${header}\n${row({ "GSTIN 1": "09AABCS1429P1ZT" })}`,
      { branches: BRANCHES },
    );
    expect(result.errorCount).toBe(1);
    expect(result.rows[0].errors.join(" ")).toMatch(/last character/);
  });

  it("rejects a GSTIN belonging to a different PAN", () => {
    const result = prepareImport(
      `${header}\n${row({ "GSTIN 1": "27AAPFU0939F1ZV" })}`,
      { branches: BRANCHES },
    );
    expect(result.rows[0].errors.join(" ")).toMatch(/different PAN/);
  });

  it("rejects an unknown branch code and names the valid ones", () => {
    const result = prepareImport(
      `${header}\n${row({ "Branch code": "XYZ" })}`,
      {
        branches: BRANCHES,
      },
    );
    expect(result.rows[0].errors.join(" ")).toMatch(/NOI, LDH/);
  });

  it("catches the same PAN twice inside one file", () => {
    const result = prepareImport(
      `${header}\n${row()}\n${row({ "Legal name": "Sharma Textiles LLP" })}`,
      { branches: BRANCHES },
    );
    expect(result.readyCount).toBe(1);
    expect(result.rows[1].errors.join(" ")).toMatch(
      /same PAN appears on row 2/,
    );
  });

  it("catches the same client listed twice under different names", () => {
    // a GSTIN carries its own PAN, so two rows sharing a GSTIN are the same
    // client however the name is spelled
    const result = prepareImport(
      `${header}\n${row()}\n${row({
        "Legal name": "Sharma Textiles Pvt Ltd",
        PAN: "",
      })}`,
      { branches: BRANCHES },
    );
    expect(result.readyCount).toBe(1);
    expect(result.rows[1].errors.join(" ")).toMatch(
      /same PAN appears on row 2/,
    );
  });

  it("rejects a GSTIN that does not belong to the PAN on the same row", () => {
    const result = prepareImport(`${header}\n${row({ PAN: "AAACZ1234C" })}`, {
      branches: BRANCHES,
    });
    expect(result.rows[0].errors.join(" ")).toMatch(/different PAN/);
  });

  it("notices a PAN that disagrees with the entity type", () => {
    const result = prepareImport(
      `${header}\n${row({ "Entity type": "Individual" })}`,
      { branches: BRANCHES },
    );
    expect(result.rows[0].errors.join(" ")).toMatch(/different kind of entity/);
  });

  it("defaults status to Active and credit days to 15", () => {
    const result = prepareImport(
      `${header}\n${row({ Status: "", "Credit days": "" })}`,
      { branches: BRANCHES },
    );
    expect(result.rows[0].value.status).toBe("Active");
    expect(result.rows[0].value.creditDays).toBe(15);
  });

  it("lists columns it does not recognise instead of silently dropping them", () => {
    const result = prepareImport(
      `Legal name,Branch code,Entity type,Contact 1 name,Favourite colour\nABC Traders,NOI,LLP,Raj,blue`,
      { branches: BRANCHES },
    );
    expect(result.unknownHeaders).toEqual(["Favourite colour"]);
  });

  it("works with columns in a different order and some missing", () => {
    const result = prepareImport(
      `Branch code,Entity type,Contact 1 name,Legal name\nLDH,LLP,Priya Singh,Singh and Associates LLP`,
      { branches: BRANCHES },
    );
    expect(result.readyCount).toBe(1);
    expect(result.rows[0].value.branchId).toBe("b-ldh");
    expect(result.rows[0].value.legalName).toBe("Singh and Associates LLP");
  });

  it("returns nothing for an empty file rather than throwing", () => {
    expect(prepareImport("", { branches: BRANCHES }).rows).toEqual([]);
    expect(prepareImport(header, { branches: BRANCHES }).rows).toEqual([]);
  });
});

describe("client validation shared by the form and the import", () => {
  it("requires a name, an entity type, a branch and one contact", () => {
    const { errors } = validateClient({});
    expect(errors.legalName).toBeDefined();
    expect(errors.entityType).toBeDefined();
    expect(errors.branchId).toBeDefined();
  });

  it("takes the PAN from the GSTIN when only the GSTIN was given", () => {
    const { value } = validateClient(
      { gstins: [{ gstin: "09AABCS1429P1ZZ" }] },
      { partial: true },
    );
    expect(value.pan).toBe("AABCS1429P");
  });

  it("refuses to list the same GSTIN twice", () => {
    const { errors } = validateClient(
      {
        gstins: [{ gstin: "09AABCS1429P1ZZ" }, { gstin: "09AABCS1429P1ZZ" }],
      },
      { partial: true },
    );
    expect(errors["gstins.1"]).toMatch(/listed twice/);
  });

  it("needs a reason before a client goes on hold or closes", () => {
    expect(
      validateClient({ status: "On hold" }, { partial: true }).errors
        .statusReason,
    ).toMatch(/needs a reason/);
    expect(
      validateClient(
        { status: "On hold", statusReason: "fees overdue" },
        { partial: true },
      ).errors.statusReason,
    ).toBeUndefined();
  });

  it("turns a typed fee into integer paise", () => {
    const { value } = validateClient(
      { quotedAmount: "25,000.50" },
      { partial: true },
    );
    expect(value.quotedAmountPaise).toBe(2500050);
  });

  it("rejects a date of incorporation in the future", () => {
    const { errors } = validateClient(
      { establishedOn: "2099-01-01" },
      { partial: true },
    );
    expect(errors.establishedOn).toMatch(/future/);
  });

  it("makes the first contact primary when nobody is marked", () => {
    const { value } = validateClient(
      {
        contacts: [
          { name: "Rakesh Sharma", mobile: "9811034567" },
          { name: "Anita Sharma" },
        ],
      },
      { partial: true },
    );
    expect(value.contacts).toHaveLength(2);
    expect(value.contacts[0].mobile).toBe("9811034567");
  });

  it("checks a credit period is a sensible number of days", () => {
    expect(
      validateClient({ creditDays: 400 }, { partial: true }).errors.creditDays,
    ).toBeDefined();
    expect(
      validateClient({ creditDays: "30" }, { partial: true }).value.creditDays,
    ).toBe(30);
  });
});

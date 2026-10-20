import { describe, it, expect } from "vitest";
import {
  BOOKS,
  BOOK_KEYS,
  COLUMNS,
  OPINIONS,
  AUDIT_TYPES,
  bookOf,
  bookRow,
  checkAssurance,
  daysLate,
  filingState,
} from "../lib/practice/books.js";
import { SERVICE_CATEGORIES } from "../lib/services/catalog.js";
import { SAMPLE_ENGAGEMENTS } from "../scripts/sample.js";

/**
 * The three practice books (P2-8a).
 *
 * The sharp edge is "late". It is arithmetic on two dates the firm types by
 * hand, it is never stored, and a firm reading its own register has to be
 * able to trust it — a filing called late that was not is an accusation.
 */

const NOW = new Date("2026-10-20T12:00:00+05:30");
const ist = (text) => new Date(`${text}T12:00:00+05:30`);

describe("which book a service belongs to", () => {
  it("puts each category in at most one book", () => {
    for (const category of SERVICE_CATEGORIES) {
      const books = BOOK_KEYS.filter((key) =>
        BOOKS[key].categories.includes(category),
      );
      expect(books.length).toBeLessThanOrEqual(1);
    }
  });

  it("files audit, ROC and tax work where the firm looks for it", () => {
    expect(bookOf("Audit and Assurance")).toBe("audits");
    expect(bookOf("Company Law / ROC")).toBe("statutory");
    expect(bookOf("Direct Tax")).toBe("tax");
    expect(bookOf("Indirect Tax")).toBe("tax");
    // the owner's default: PF, ESI and PT are returns with a deadline
    expect(bookOf("Payroll and Labour")).toBe("tax");
  });

  it("leaves work that is not a filing out of every book", () => {
    expect(bookOf("Accounting")).toBe("");
    expect(bookOf("Advisory")).toBe("");
    expect(bookOf("Registrations")).toBe("");
    expect(bookOf("Certification")).toBe("");
    expect(bookOf("")).toBe("");
  });

  it("names a real category in every book, so none reads empty for ever", () => {
    for (const key of BOOK_KEYS) {
      expect(BOOKS[key].categories.length).toBeGreaterThan(0);
      for (const category of BOOKS[key].categories) {
        expect(SERVICE_CATEGORIES).toContain(category);
      }
      for (const column of BOOKS[key].columns) {
        expect(COLUMNS[column]).toBeTruthy();
      }
    }
  });
});

describe("how late a filing was", () => {
  it("is not late when it went in on the day itself", () => {
    expect(daysLate(ist("2026-10-20"), ist("2026-10-20"))).toBe(0);
    // the deadline is a day, not a moment: 11pm on the due date is on time
    expect(
      daysLate(new Date("2026-10-20T23:45:00+05:30"), ist("2026-10-20")),
    ).toBe(0);
  });

  it("is not late when it went in early", () => {
    expect(daysLate(ist("2026-10-14"), ist("2026-10-20"))).toBe(0);
  });

  it("counts whole days past the deadline", () => {
    expect(daysLate(ist("2026-10-21"), ist("2026-10-20"))).toBe(1);
    expect(daysLate(ist("2026-11-19"), ist("2026-10-20"))).toBe(30);
  });

  it("answers nothing when either date is missing", () => {
    // no deadline recorded is an unanswered question, not a late filing —
    // and the due-date master leaves dates blank until a partner verifies
    // the rule (Step 7b), so this is the common case, not an edge one
    expect(daysLate(ist("2026-10-21"), null)).toBe(0);
    expect(daysLate(null, ist("2026-10-20"))).toBe(0);
    expect(daysLate(null, null)).toBe(0);
  });
});

describe("how a row reads on the register", () => {
  it("calls a filing on time what it is", () => {
    expect(
      filingState(
        { filedOn: ist("2026-10-18"), statutoryDue: ist("2026-10-20") },
        NOW,
      ),
    ).toMatchObject({ state: "filed" });
  });

  it("says how late a late one was, in the plural only when it should", () => {
    expect(
      filingState(
        { filedOn: ist("2026-10-21"), statutoryDue: ist("2026-10-20") },
        NOW,
      ),
    ).toMatchObject({ state: "late", label: "1 day late" });
    expect(
      filingState(
        { filedOn: ist("2026-10-23"), statutoryDue: ist("2026-10-20") },
        NOW,
      ),
    ).toMatchObject({ state: "late", label: "3 days late" });
  });

  it("flags a deadline that has passed with nothing filed", () => {
    expect(
      filingState(
        { statutoryDue: ist("2026-10-19"), status: "In progress" },
        NOW,
      ),
    ).toMatchObject({ state: "overdue" });
  });

  it("does not call today's deadline overdue", () => {
    expect(
      filingState(
        { statutoryDue: ist("2026-10-20"), status: "In progress" },
        NOW,
      ),
    ).toMatchObject({ state: "open" });
  });

  it("does not chase closed work for a filing it never needed", () => {
    // a cancelled engagement with a date behind it is not a missed deadline
    expect(
      filingState(
        { statutoryDue: ist("2026-09-30"), status: "Cancelled" },
        NOW,
      ),
    ).toMatchObject({ state: "closed" });
  });
});

describe("the audit opinion", () => {
  it("takes the four opinions of the standard and the state before one", () => {
    expect(OPINIONS).toEqual([
      "Not yet issued",
      "Unmodified",
      "Qualified",
      "Adverse",
      "Disclaimer",
    ]);
  });

  it("lets a clean opinion stand on its own", () => {
    expect(checkAssurance({ opinion: "Unmodified" }).ok).toBe(true);
    expect(checkAssurance({}).ok).toBe(true);
  });

  it("refuses a modified opinion with no reason recorded", () => {
    for (const opinion of ["Qualified", "Adverse", "Disclaimer"]) {
      const result = checkAssurance({ opinion, qualificationNote: "   " });
      expect(result.ok).toBe(false);
      expect(result.error).toContain(opinion.toLowerCase());
    }
  });

  it("accepts a modified opinion that says why", () => {
    expect(
      checkAssurance({
        opinion: "Qualified",
        qualificationNote: "Inventory at the Ludhiana godown not observed.",
      }).ok,
    ).toBe(true);
  });

  it("refuses words that are not opinions or audit types", () => {
    expect(checkAssurance({ opinion: "Fine" }).ok).toBe(false);
    expect(checkAssurance({ auditType: "Vibes audit" }).ok).toBe(false);
    expect(checkAssurance({ auditType: AUDIT_TYPES[0] }).ok).toBe(true);
  });
});

describe("one engagement as a book row", () => {
  const engagement = {
    _id: "e1",
    clientId: "c1",
    code: "NOI/STAT-AUD/2025-26",
    status: "Completed",
    periodLabel: "FY 2025-26",
    statutoryDue: ist("2026-09-30"),
    filedOn: ist("2026-10-03"),
    ackNo: "SRN AA1234567",
    udin: "26412345ABCDEF7890",
    templateSnapshot: {
      name: "Statutory audit",
      category: "Audit and Assurance",
    },
    assurance: {
      auditType: "Statutory audit",
      opinion: "Qualified",
      reportDate: ist("2026-10-02"),
    },
  };

  const lookups = {
    clientName: new Map([["c1", "Jaiswal Textiles"]]),
    signer: new Map([["e1", "Priya Nair"]]),
  };

  it("reads the signing member from the UDIN register, not a copy", () => {
    // the engagement holds no member of its own: P2-7 records it once
    expect(bookRow(engagement, lookups, NOW).cells.member).toBe("Priya Nair");
    expect(
      bookRow(engagement, { clientName: lookups.clientName }, NOW).cells.member,
    ).toBe("");
  });

  it("carries the late arithmetic into the cells", () => {
    const row = bookRow(engagement, lookups, NOW);
    expect(row.cells.lateDays).toBe(3);
    expect(row.state).toBe("late");
  });

  it("falls back to the internal date when there is no statutory one", () => {
    const row = bookRow(
      { ...engagement, statutoryDue: null, internalDue: ist("2026-09-15") },
      lookups,
      NOW,
    );
    expect(row.cells.due).toEqual(ist("2026-09-15"));
    // but late is measured against the statutory date alone: an internal
    // deadline is the firm's own promise, not the law's
    expect(row.cells.lateDays).toBe(0);
  });

  it("gives every column of every book something to render", () => {
    const row = bookRow(engagement, lookups, NOW);
    for (const key of BOOK_KEYS.flatMap((k) => BOOKS[k].columns)) {
      expect(row.cells).toHaveProperty(key);
    }
  });
});

describe("the sample dataset's filings", () => {
  it("includes one filing that is genuinely late", () => {
    const late = SAMPLE_ENGAGEMENTS.filter(
      (row) => row.filedDaysAgo && row.dueDaysAgo > row.filedDaysAgo,
    );
    expect(late).toHaveLength(1);
  });

  it("only ever puts an opinion on something an opinion belongs to", () => {
    for (const row of SAMPLE_ENGAGEMENTS) {
      if (!row.assurance) continue;
      expect(checkAssurance(row.assurance).ok).toBe(true);
    }
  });
});

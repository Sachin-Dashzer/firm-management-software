import { describe, it, expect } from "vitest";
import {
  readFee,
  setFee,
  setScope,
  requestWaiver,
  decideWaiver,
  feeState,
  pendingWaiver,
  isChargeable,
  scopeOf,
  scopeLine,
  blocksInvoice,
  CHARGEABLE_QUERY,
  FEE_RULE,
} from "../lib/engagements/scope.js";

/**
 * Scope and waivers (P3-4).
 *
 * The property worth testing is that **a zero fee and a waived fee are never
 * the same thing**. One is "nobody has priced this yet" and blocks an
 * invoice; the other is a decision with a reason and two names on it, and
 * stays on the unbilled list so the firm can still say what it did and did
 * not charge for.
 *
 * The second is that a request is not a decision: staff asking for a waiver
 * must leave the job exactly as chargeable as it was.
 */

const STAFF = { id: "u-neha", name: "Neha Arora" };
const PARTNER = { id: "u-rg", name: "R. Gupta" };

const job = (over = {}) => ({
  _id: "e1",
  code: "ENG-0042",
  feePaise: 0,
  billingStatus: "Unbilled",
  scope: "billable",
  scopeReason: "",
  waiver: null,
  ...over,
});

describe("a fee is a positive whole-rupee amount", () => {
  it("refuses zero, and says what to do about free work", () => {
    const result = readFee("0");
    expect(result.ok).toBe(false);
    expect(result.error).toBe(FEE_RULE);
    // the answer has to travel with the refusal, or the next thing typed is 1
    expect(result.error).toMatch(/Waive or In retainer/);
  });

  it("refuses a blank and a negative", () => {
    expect(readFee("").ok).toBe(false);
    expect(readFee("-1500").ok).toBe(false);
  });

  it("refuses part-rupees", () => {
    const result = readFee("1500.50");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/whole rupees/);
  });

  it("refuses something that is not a number at all", () => {
    expect(readFee("about five thousand").error).toBe(
      "That fee is not an amount.",
    );
  });

  it("takes a positive amount, in paise, commas and all", () => {
    expect(readFee("1500")).toEqual({ ok: true, paise: 1_500_00 });
    expect(readFee("₹1,25,000")).toEqual({ ok: true, paise: 1_25_000_00 });
  });

  it("stores it on the engagement", () => {
    const e = job();
    expect(setFee(e, "7500").ok).toBe(true);
    expect(e.feePaise).toBe(7_500_00);
  });

  it("will not reprice work that is already invoiced", () => {
    const e = job({ billingStatus: "Billed", feePaise: 5_000_00 });
    const result = setFee(e, "9000");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/credit note/);
    expect(e.feePaise).toBe(5_000_00);
  });
});

describe("an unpriced job is not a free job", () => {
  it("names the unpriced state and blocks an invoice", () => {
    const state = feeState(job());
    expect(state.key).toBe("fee-not-agreed");
    expect(state.pending).toBe(true);
    expect(blocksInvoice(job())).toBe("no fee has been agreed");
  });

  it("is still chargeable work — unpriced is not the same as not for sale", () => {
    expect(isChargeable(job())).toBe(true);
  });

  it("stops blocking once a fee is agreed", () => {
    const e = job({ feePaise: 7_500_00 });
    expect(feeState(e).key).toBe("billable");
    expect(blocksInvoice(e)).toBe(null);
  });
});

describe("free work is a waiver, and a waiver needs a partner", () => {
  it("refuses a request with no reason", () => {
    const e = job();
    expect(requestWaiver(e, "", STAFF).error).toBe("A waiver needs a reason.");
    expect(requestWaiver(e, "no", STAFF).ok).toBe(false);
    expect(e.waiver).toBe(null);
  });

  it("asking is not deciding: the job stays chargeable and billing is held", () => {
    const e = job();
    expect(requestWaiver(e, "Goodwill — our delay", STAFF).ok).toBe(true);

    expect(scopeOf(e)).toBe("billable");
    expect(isChargeable(e)).toBe(true);
    expect(pendingWaiver(e).requestedByName).toBe("Neha Arora");
    // and it must not be billed while a partner is still deciding
    expect(feeState(e).key).toBe("waiver-pending");
    expect(blocksInvoice(e)).toBe("a waiver is waiting for a partner");
  });

  it("will not queue two requests on one job", () => {
    const e = job();
    requestWaiver(e, "Goodwill — our delay", STAFF);
    expect(requestWaiver(e, "Asking again", STAFF).error).toMatch(
      /already waiting/,
    );
  });

  it("keeps both names when a partner approves somebody else's request", () => {
    const e = job();
    requestWaiver(e, "Goodwill — our delay", STAFF);
    const result = decideWaiver(e, true, "", PARTNER);

    expect(result).toMatchObject({ ok: true, approved: true });
    expect(e.scope).toBe("waived");
    expect(e.scopeReason).toBe("Goodwill — our delay");
    expect(e.waiver.requestedByName).toBe("Neha Arora");
    expect(e.waiver.approvedByName).toBe("R. Gupta");
    expect(e.waiver.approvedAt).toBeInstanceOf(Date);
    // a waiver with one name on it cannot be told apart from somebody
    // waiving their own client's fee, which is what this line is for
    expect(scopeLine(e)).toBe(
      "Waived — Goodwill — our delay · asked by Neha Arora, approved by R. Gupta",
    );
  });

  it("lets a partner waive outright, and says it was their own decision", () => {
    const e = job();
    expect(decideWaiver(e, true, "Written off as goodwill", PARTNER).ok).toBe(
      true,
    );
    expect(e.scope).toBe("waived");
    expect(scopeLine(e)).toBe(
      "Waived — Written off as goodwill · approved by R. Gupta",
    );
  });

  it("refuses a partner waiving with no reason at all", () => {
    const e = job();
    expect(decideWaiver(e, true, "", PARTNER).error).toBe(
      "A waiver needs a reason.",
    );
    expect(scopeOf(e)).toBe("billable");
  });

  it("keeps a declined request, and leaves the fee to agree", () => {
    const e = job();
    requestWaiver(e, "Goodwill — our delay", STAFF);
    const result = decideWaiver(
      e,
      false,
      "The delay was the client's",
      PARTNER,
    );

    expect(result.approved).toBe(false);
    expect(scopeOf(e)).toBe("billable");
    expect(e.waiver.reason).toBe("Goodwill — our delay");
    expect(e.waiver.declineReason).toBe("The delay was the client's");
    expect(e.waiver.declinedByName).toBe("R. Gupta");
    // decided, so it is no longer waiting on anybody
    expect(pendingWaiver(e)).toBe(null);
    expect(feeState(e).key).toBe("fee-not-agreed");
  });

  it("refuses a decline with no reason, and a decline of nothing", () => {
    const e = job();
    requestWaiver(e, "Goodwill — our delay", STAFF);
    expect(decideWaiver(e, false, "no", PARTNER).ok).toBe(false);
    expect(
      decideWaiver(job(), false, "A good long reason", PARTNER).error,
    ).toBe("No waiver is waiting here.");
  });

  it("will not waive a fee on work already invoiced", () => {
    const e = job({ billingStatus: "Partly billed", feePaise: 5_000_00 });
    expect(decideWaiver(e, true, "Goodwill all round", PARTNER).ok).toBe(false);
    expect(scopeOf(e)).toBe("billable");
  });
});

describe("retainer work is settled, not pending", () => {
  it("needs to say which retainer covers it", () => {
    const e = job();
    expect(setScope(e, "retainer").ok).toBe(false);
    expect(setScope(e, "retainer", "x").ok).toBe(false);
    expect(scopeOf(e)).toBe("billable");
  });

  it("does not block billing and cannot be invoiced", () => {
    const e = job();
    expect(setScope(e, "retainer", "Monthly retainer, clause 3").ok).toBe(true);

    expect(feeState(e)).toMatchObject({
      scope: "retainer",
      pending: false,
    });
    expect(isChargeable(e)).toBe(false);
    expect(blocksInvoice(e)).toBe("included in the monthly retainer");
  });

  it("cannot be used as a back door to waived", () => {
    const e = job();
    const result = setScope(e, "waived", "Goodwill — our delay");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/partner approves/);
    expect(scopeOf(e)).toBe("billable");
  });

  it("clears the old reason on the way back to chargeable", () => {
    const e = job();
    decideWaiver(e, true, "Goodwill — our delay", PARTNER);
    expect(setScope(e, "billable").ok).toBe(true);

    expect(e.scope).toBe("billable");
    expect(e.scopeReason).toBe("");
    expect(e.waiver).toBe(null);
    expect(scopeLine(e)).toBe("");
  });
});

describe("work from before this step keeps its meaning", () => {
  it("reads a missing scope as billable", () => {
    const old = { feePaise: 7_500_00, billingStatus: "Unbilled" };
    expect(scopeOf(old)).toBe("billable");
    expect(isChargeable(old)).toBe(true);
    expect(feeState(old).key).toBe("billable");
  });

  it("matches the chargeable query, which has to allow a missing field", () => {
    // a schema default is applied on write, never to rows already written —
    // so the query says null as well as "billable"
    expect(CHARGEABLE_QUERY.scope.$in).toContain(null);
    expect(CHARGEABLE_QUERY.scope.$in).toContain("billable");
  });
});

/**
 * The queries themselves are checked in the browser against the lists they
 * link to — the convention in `tests/reports.test.js`, and the only check
 * that means anything for a query. What is arithmetic here is the rule the
 * unbilled report and the dashboard tile both apply to their rows, so that
 * is what is tested.
 */
describe("the unbilled list keeps the work; the unbilled figure keeps the money", () => {
  const rows = [
    job({ feePaise: 10_000_00 }),
    job({ feePaise: 0, scope: "waived", scopeReason: "Goodwill — our delay" }),
    job({
      feePaise: 4_000_00,
      scope: "retainer",
      scopeReason: "Monthly retainer, clause 3",
    }),
    { feePaise: 2_500_00, billingStatus: "Unbilled" }, // from before P3-4
  ];

  it("counts only chargeable fees in the total", () => {
    const total = rows
      .filter(isChargeable)
      .reduce((sum, row) => sum + (row.feePaise ?? 0), 0);
    // 10,000 + 2,500 — the waived and the retained are not money owed
    expect(total).toBe(12_500_00);
  });

  it("still describes every row, so none of them vanish", () => {
    const described = rows.map((row) => scopeLine(row) || feeState(row).label);
    expect(described).toEqual([
      "Billable",
      "Waived — Goodwill — our delay",
      "Included in the monthly retainer — Monthly retainer, clause 3",
      "Billable",
    ]);
  });
});

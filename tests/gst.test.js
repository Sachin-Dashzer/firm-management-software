import { describe, it, expect } from "vitest";
import {
  computeInvoice,
  reasonsNotIssuable,
  stateCodeOf,
  amountInWords,
  TDS_194J_PERCENT,
} from "../lib/billing/gst.js";
import { formatPaise } from "../lib/money.js";

/**
 * GST on an invoice is the one calculation in this system that a tax
 * authority will check. These tests are deliberately fussy about the
 * rupee: every figure is integer paise, the halves of CGST and SGST add
 * back to the whole, and nothing is taxed that should not be.
 */

const UP = "09AABCS1429P1ZZ"; // Uttar Pradesh, the Noida branch
const PUNJAB = "03";
const UTTAR_PRADESH = "09";

const line = (amountPaise, gstRate = 18) => ({
  description: "Professional fees",
  sac: "998221",
  amountPaise,
  gstRate,
});

describe("which tax applies", () => {
  it("splits into CGST and SGST inside the state", () => {
    const result = computeInvoice({
      lines: [line(10000000)], // ₹1,00,000
      supplierGstin: UP,
      placeOfSupply: UTTAR_PRADESH,
    });

    expect(result.interState).toBe(false);
    expect(result.cgstPaise).toBe(900000); // ₹9,000
    expect(result.sgstPaise).toBe(900000);
    expect(result.igstPaise).toBe(0);
    expect(result.totalPaise).toBe(11800000); // ₹1,18,000
  });

  it("charges IGST across state lines", () => {
    const result = computeInvoice({
      lines: [line(10000000)],
      supplierGstin: UP,
      placeOfSupply: PUNJAB,
    });

    expect(result.interState).toBe(true);
    expect(result.igstPaise).toBe(1800000); // ₹18,000
    expect(result.cgstPaise).toBe(0);
    expect(result.sgstPaise).toBe(0);
    expect(result.totalPaise).toBe(11800000);
  });

  it("reads the supplying state off the branch GSTIN", () => {
    expect(stateCodeOf(UP)).toBe("09");
    expect(stateCodeOf("03ABCDE1234F1Z5")).toBe("03");
    expect(stateCodeOf("")).toBeNull();
    expect(stateCodeOf("XX12345")).toBeNull();
  });

  it("charges no tax at all when the supplying state is unknown", () => {
    // a branch with no GSTIN cannot issue a tax invoice; the draft still
    // adds up, but it carries no tax it has no right to charge
    const result = computeInvoice({
      lines: [line(10000000)],
      supplierGstin: null,
      placeOfSupply: UTTAR_PRADESH,
    });
    expect(result.taxable).toBe(false);
    expect(result.cgstPaise + result.sgstPaise + result.igstPaise).toBe(0);
    expect(result.totalPaise).toBe(10000000);
  });
});

describe("the rupee has to add up", () => {
  it("keeps the halves of CGST and SGST summing to the whole", () => {
    // ₹333.33 at 18% is 5999.94 paise, which rounds to 5,999 — an odd number
    const result = computeInvoice({
      lines: [line(33333)],
      supplierGstin: UP,
      placeOfSupply: UTTAR_PRADESH,
    });

    const tax = result.cgstPaise + result.sgstPaise;
    expect(tax).toBe(6000);
    // the odd paisa goes one way, not lost and not doubled
    expect(Math.abs(result.cgstPaise - result.sgstPaise)).toBeLessThanOrEqual(
      1,
    );
    expect(result.totalPaise).toBe(33333 + 6000);
  });

  it("keeps every figure whole paise", () => {
    const result = computeInvoice({
      lines: [line(12345), line(67891, 5)],
      supplierGstin: UP,
      placeOfSupply: PUNJAB,
      discountPercent: 7,
    });

    for (const value of [
      result.subtotalPaise,
      result.cgstPaise,
      result.sgstPaise,
      result.igstPaise,
      result.totalPaise,
      result.tdsExpectedPaise,
      result.discountTotalPaise,
    ]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("totals the lines rather than re-taxing the sum", () => {
    const result = computeInvoice({
      lines: [line(33333), line(33333), line(33333)],
      supplierGstin: UP,
      placeOfSupply: PUNJAB,
    });

    // what the invoice prints line by line must equal what it prints at the
    // foot, even where each line rounded on its own
    const printed = result.lines.reduce((sum, l) => sum + l.igstPaise, 0);
    expect(result.igstPaise).toBe(printed);
    expect(result.totalPaise).toBe(result.subtotalPaise + printed);
  });

  it("allows a line at a rate other than 18 per cent", () => {
    const result = computeInvoice({
      lines: [line(100000, 5)],
      supplierGstin: UP,
      placeOfSupply: PUNJAB,
    });
    expect(result.igstPaise).toBe(5000);
  });
});

describe("reimbursements", () => {
  it("carries them at cost, with no GST", () => {
    const result = computeInvoice({
      lines: [line(1000000)], // ₹10,000 fees
      reimbursements: [
        { description: "ROC filing fee", amountPaise: 60000 }, // ₹600
        { description: "Stamp duty", amountPaise: 10000 },
      ],
      supplierGstin: UP,
      placeOfSupply: UTTAR_PRADESH,
    });

    expect(result.reimbursementTotalPaise).toBe(70000);
    // the tax is on the fees alone
    expect(result.cgstPaise + result.sgstPaise).toBe(180000);
    expect(result.totalPaise).toBe(1000000 + 180000 + 70000);
  });

  it("does not let a reimbursement affect the TDS figure either", () => {
    const withOut = computeInvoice({
      lines: [line(1000000)],
      supplierGstin: UP,
      placeOfSupply: UTTAR_PRADESH,
    });
    const withIn = computeInvoice({
      lines: [line(1000000)],
      reimbursements: [{ amountPaise: 500000 }],
      supplierGstin: UP,
      placeOfSupply: UTTAR_PRADESH,
    });
    expect(withIn.tdsExpectedPaise).toBe(withOut.tdsExpectedPaise);
  });
});

describe("discounts", () => {
  it("reduces the taxable value, so the tax follows it down", () => {
    const result = computeInvoice({
      lines: [line(1000000)],
      supplierGstin: UP,
      placeOfSupply: UTTAR_PRADESH,
      discountPercent: 10,
    });

    expect(result.discountTotalPaise).toBe(100000);
    expect(result.subtotalPaise).toBe(900000);
    expect(result.cgstPaise + result.sgstPaise).toBe(162000); // 18% of 9,000
  });

  it("ignores a nonsense discount rather than inverting the invoice", () => {
    const silly = computeInvoice({
      lines: [line(1000000)],
      supplierGstin: UP,
      placeOfSupply: UTTAR_PRADESH,
      discountPercent: -50,
    });
    expect(silly.subtotalPaise).toBe(1000000);
  });
});

describe("TDS under 194J", () => {
  it("is ten per cent of the fees, and changes nothing on the invoice", () => {
    const result = computeInvoice({
      lines: [line(1000000)],
      supplierGstin: UP,
      placeOfSupply: UTTAR_PRADESH,
    });

    expect(TDS_194J_PERCENT).toBe(10);
    expect(result.tdsExpectedPaise).toBe(100000);
    // the client pays the invoice less the TDS, but owes the whole invoice
    expect(result.totalPaise).toBe(1180000);
    expect(result.expectedReceiptPaise).toBe(1080000);
  });

  it("is not charged on the GST, only on the fees", () => {
    const result = computeInvoice({
      lines: [line(1000000)],
      supplierGstin: UP,
      placeOfSupply: UTTAR_PRADESH,
    });
    expect(result.tdsExpectedPaise).toBe(100000);
  });

  it("can be turned off for a client who does not deduct", () => {
    const result = computeInvoice({
      lines: [line(1000000)],
      supplierGstin: UP,
      placeOfSupply: UTTAR_PRADESH,
      tdsApplies: false,
    });
    expect(result.tdsExpectedPaise).toBe(0);
    expect(result.expectedReceiptPaise).toBe(result.totalPaise);
  });
});

describe("what stops an invoice being issued", () => {
  const good = {
    placeOfSupply: "09",
    lines: [line(100000)],
  };

  it("lets a complete invoice through", () => {
    expect(reasonsNotIssuable(good, { gstin: UP, code: "NOI" })).toEqual([]);
  });

  it("refuses a branch with no GSTIN, and says where to fix it", () => {
    const reasons = reasonsNotIssuable(good, { gstin: "", code: "LDH" });
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(/LDH branch has no GSTIN/);
    expect(reasons[0]).toMatch(/Settings/);
  });

  it("refuses a missing place of supply, a missing SAC and a zero line", () => {
    const reasons = reasonsNotIssuable(
      {
        placeOfSupply: null,
        lines: [{ amountPaise: 0, sac: "" }],
      },
      { gstin: UP, code: "NOI" },
    );
    expect(reasons).toHaveLength(3);
  });

  it("lists every reason at once rather than one at a time", () => {
    const reasons = reasonsNotIssuable(
      { placeOfSupply: null, lines: [] },
      { gstin: "", code: "MRT" },
    );
    expect(reasons.length).toBeGreaterThanOrEqual(3);
  });
});

describe("the amount in words", () => {
  it("uses lakh and crore, not millions", () => {
    expect(amountInWords(10000000)).toBe("One lakh rupees only");
    expect(amountInWords(11800000)).toBe(
      "One lakh eighteen thousand rupees only",
    );
    expect(amountInWords(100000000)).toBe("Ten lakh rupees only");
    expect(amountInWords(1000000000)).toBe("One crore rupees only");
  });

  it("says the paise when there are any", () => {
    expect(amountInWords(123456)).toBe(
      "One thousand two hundred and thirty-four rupees and fifty-six paise only",
    );
  });

  it("agrees with how the figure is printed", () => {
    expect(formatPaise(11800000)).toBe("₹1,18,000");
  });
});

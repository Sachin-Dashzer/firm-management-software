import { describe, it, expect } from "vitest";
import { readAmount, MAX_AMOUNT_PAISE, formatPaise } from "../lib/money.js";
import { taxNoticeFor, computeInvoice } from "../lib/billing/gst.js";
import { issueWarning } from "../lib/billing/number.js";
import { GST_STATE_LIST, GST_STATES } from "../lib/validators.js";

/**
 * The money the QA run of 09-11-2026 got past the system (#3, #4, #12, #23,
 * #35). Each of these fails on the code as it was that morning.
 */

describe("reading an amount somebody typed (#4, #12)", () => {
  it("refuses a negative amount with a sentence, not an exception", () => {
    // -500 used to reach Mongoose, whose `min: 0` threw, which reached the
    // error boundary: "Something broke", and everything typed was gone
    const read = readAmount("-500");
    expect(read.ok).toBe(false);
    expect(read.reason).toBe("Amount must be more than ₹0.");
  });

  it("refuses a figure that is not a number", () => {
    const read = readAmount("abc");
    expect(read.ok).toBe(false);
    expect(read.reason).toMatch(/not a number/);
  });

  it("refuses ₹0 unless a zero is allowed", () => {
    expect(readAmount("0").ok).toBe(false);
    expect(readAmount("0", { allowZero: true })).toEqual({ ok: true, paise: 0 });
  });

  it("refuses ₹99,99,99,99,999 and says what the ceiling is", () => {
    const read = readAmount("9999999999");
    expect(read.ok).toBe(false);
    expect(read.reason).toContain(formatPaise(MAX_AMOUNT_PAISE));
  });

  it("stops at ₹10 crore, and takes exactly that", () => {
    expect(MAX_AMOUNT_PAISE).toBe(10_000_000_000);
    expect(readAmount("100000000")).toEqual({
      ok: true,
      paise: MAX_AMOUNT_PAISE,
    });
    expect(readAmount("100000000.01").ok).toBe(false);
  });

  it("takes an ordinary fee, typed the way people type it", () => {
    expect(readAmount("15,000").paise).toBe(1_500_000);
    expect(readAmount("₹ 25,000.50").paise).toBe(2_500_050);
  });

  it("names the field, so a message can point at the line", () => {
    const read = readAmount("-1", { label: "Line 2: the amount" });
    expect(read.reason).toBe("Line 2: the amount must be more than ₹0.");
  });
});

describe("why an invoice carries no tax (#3)", () => {
  it("says the branch has no GSTIN, and names the branch", () => {
    const notice = taxNoticeFor({
      supplierGstin: "",
      placeOfSupply: "09",
      branchCode: "NOI",
    });
    expect(notice).toContain("the NOI branch has no GSTIN");
    expect(notice).toMatch(/^Tax not charged:/);
  });

  it("says when the place of supply is what is missing", () => {
    const notice = taxNoticeFor({
      supplierGstin: "09AABCS1429P1ZZ",
      placeOfSupply: null,
      branchCode: "NOI",
    });
    expect(notice).toContain("no place of supply");
  });

  it("says nothing at all when tax applies normally", () => {
    expect(
      taxNoticeFor({
        supplierGstin: "09AABCS1429P1ZZ",
        placeOfSupply: "09",
        branchCode: "NOI",
      }),
    ).toBe("");
  });

  /**
   * The arithmetic was never wrong — a branch with no GSTIN cannot charge
   * GST. What was wrong is that the screen said "18%" and "CGST + SGST"
   * over a tax figure of ₹0. These two tests pin the pair together: no tax,
   * and a reason given.
   */
  it("charges nothing, and has something to say about it", () => {
    const computed = computeInvoice({
      lines: [{ amountPaise: 1_500_000, gstRate: 18 }],
      supplierGstin: null,
      placeOfSupply: "09",
    });

    expect(computed.taxable).toBe(false);
    expect(computed.cgstPaise + computed.sgstPaise + computed.igstPaise).toBe(0);
    expect(computed.totalPaise).toBe(1_500_000);
    expect(taxNoticeFor({ supplierGstin: null, placeOfSupply: "09" })).not.toBe(
      "",
    );
  });

  it("charges IGST across state lines, and says nothing", () => {
    const computed = computeInvoice({
      lines: [{ amountPaise: 1_500_000, gstRate: 18 }],
      supplierGstin: "09AABCS1429P1ZZ",
      placeOfSupply: "03",
    });

    expect(computed.taxable).toBe(true);
    expect(computed.interState).toBe(true);
    expect(computed.igstPaise).toBe(270_000);
    expect(computed.cgstPaise).toBe(0);
    expect(
      taxNoticeFor({
        supplierGstin: "09AABCS1429P1ZZ",
        placeOfSupply: "03",
      }),
    ).toBe("");
  });
});

describe("the warning before issuing (#23)", () => {
  it("names the number it would take and that it cannot be undone", () => {
    const warning = issueWarning("NOI/26-27/0046");
    expect(warning).toContain("NOI/26-27/0046");
    expect(warning).toContain("cannot be deleted");
    expect(warning).toContain("credit note");
  });

  it("still warns when the number cannot be read", () => {
    expect(issueWarning("")).toContain("cannot be deleted");
  });
});

describe("the place of supply list (#35)", () => {
  it("runs 01 to 38 in order, not 10 before 01", () => {
    const codes = GST_STATE_LIST.map(([code]) => code);
    expect(codes.slice(0, 5)).toEqual(["01", "02", "03", "04", "05"]);
    expect([...codes].sort((a, b) => Number(a) - Number(b))).toEqual(codes);
  });

  it("holds every state, two digits each, with its name", () => {
    expect(GST_STATE_LIST.length).toBe(Object.keys(GST_STATES).length);
    for (const [code, name] of GST_STATE_LIST) {
      expect(code, name).toMatch(/^\d{2}$/);
      expect(name).toBeTruthy();
    }
  });

  it("puts the two special codes last", () => {
    expect(GST_STATE_LIST.slice(-2).map(([code]) => code)).toEqual(["97", "99"]);
  });
});

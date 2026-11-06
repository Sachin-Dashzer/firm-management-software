import { describe, it, expect } from "vitest";
import { quotation, feeToPaise } from "../lib/clients/quotation.js";

describe("feeToPaise", () => {
  it("reads what the wizard puts in the box", () => {
    expect(feeToPaise("18,000")).toBe(1_800_000);
    expect(feeToPaise("₹2,500.50")).toBe(250_050);
  });

  it("treats a cleared fee as none agreed, not as the rate card", () => {
    expect(feeToPaise("", 500_000)).toBe(0);
  });

  it("falls back only when there is no number at all", () => {
    expect(feeToPaise(undefined, 500_000)).toBe(500_000);
    expect(feeToPaise("about ten thousand", 500_000)).toBe(500_000);
  });
});

describe("quotation", () => {
  const rows = [
    {
      name: "GST monthly returns",
      feePaise: 200_000,
      billingBasis: "per month",
      gstTreatment: "plus GST",
    },
    {
      name: "Income-tax return",
      feePaise: 500_000,
      billingBasis: "per engagement",
      gstTreatment: "inclusive of GST",
    },
    {
      name: "Statutory audit",
      feePaise: 0,
      billingBasis: "per year",
    },
  ];

  it("quotes each service in the client's words", () => {
    const { lines } = quotation(rows);
    expect(lines[0]).toBe("GST monthly returns — ₹2,000 per month, plus GST");
    expect(lines[1]).toBe(
      "Income-tax return — ₹5,000 per engagement, inclusive of GST",
    );
  });

  it("says fee to be agreed rather than ₹0, which reads as free", () => {
    const { lines, unpriced } = quotation(rows);
    expect(lines[2]).toBe("Statutory audit — fee to be agreed");
    expect(unpriced).toBe(1);
  });

  it("never adds fees of different billing bases together", () => {
    const { totals, totalLine } = quotation(rows);
    expect(totals).toEqual(["₹2,000 per month", "₹5,000 per engagement"]);
    expect(totalLine).toBe("Total: ₹2,000 per month · ₹5,000 per engagement");
  });

  it("adds up fees that share a basis", () => {
    const { totals } = quotation([
      { name: "A", feePaise: 100_000, billingBasis: "per month" },
      { name: "B", feePaise: 50_000, billingBasis: "per month" },
    ]);
    expect(totals).toEqual(["₹1,500 per month"]);
  });

  it("has nothing to say about no services", () => {
    expect(quotation([])).toEqual({
      lines: [],
      totals: [],
      totalLine: "",
      unpriced: 0,
    });
  });
});

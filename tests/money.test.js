import { describe, expect, it } from "vitest";
import { formatPaise, toPaise, percentOf } from "@/lib/money";

describe("formatPaise", () => {
  it("groups the Indian way: lakh, not thousand", () => {
    expect(formatPaise(124500000)).toBe("₹12,45,000");
    expect(formatPaise(10000000)).toBe("₹1,00,000");
  });

  it("shows paise only when there are paise", () => {
    expect(formatPaise(125050)).toBe("₹1,250.50");
    expect(formatPaise(125000)).toBe("₹1,250");
    expect(formatPaise(125000, { paise: true })).toBe("₹1,250.00");
  });

  it("handles zero and negatives (credit notes)", () => {
    expect(formatPaise(0)).toBe("₹0");
    expect(formatPaise(-125000)).toBe("-₹1,250");
  });

  it("refuses a non-integer amount, so floats never reach the database", () => {
    expect(() => formatPaise(1250.5)).toThrow();
  });
});

describe("toPaise", () => {
  it("parses what a user types", () => {
    expect(toPaise("12,45,000")).toBe(124500000);
    expect(toPaise("₹1,250.50")).toBe(125050);
    expect(toPaise(1250.5)).toBe(125050);
  });

  it("rounds instead of truncating, so 0.1+0.2 does not lose a paisa", () => {
    expect(toPaise(0.1 + 0.2)).toBe(30);
  });

  it("rejects nonsense", () => {
    expect(() => toPaise("abc")).toThrow();
  });
});

describe("percentOf", () => {
  it("computes GST to the nearest paisa", () => {
    expect(percentOf(100000, 18)).toBe(18000); // ₹1,000 at 18%
    expect(percentOf(100000, 9)).toBe(9000); // CGST half
    expect(percentOf(12345, 18)).toBe(2222); // 2222.1 rounds down
  });
});

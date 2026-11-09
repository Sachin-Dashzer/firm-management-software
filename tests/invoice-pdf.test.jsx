import { describe, it, expect, vi } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { InvoicePdf, BODY_FONT } from "../lib/billing/invoicePdf.jsx";
import { amountInWords } from "../lib/billing/gst.js";
import { formatPaise } from "../lib/money.js";

/**
 * The invoice PDF is a legal document, and the ways it fails are quiet: a
 * missing GSTIN, a tax head that does not appear, a draft that looks
 * issued. So these tests render the real thing and read the bytes back.
 */

/**
 * **20 seconds a test, not the default 5.**
 *
 * Every test here lays out a real PDF, which is pure CPU and about a second
 * on an idle machine. The suite spawns a worker per file, so on a busy one
 * these lose the race for a core and time out *while working correctly* —
 * a flake that moved between tests in this file depending on scheduling.
 *
 * Raised for this file only. Everything else in the suite should still be
 * quick, and a slow test elsewhere is worth noticing rather than absorbing.
 */
vi.setConfig({ testTimeout: 20_000 });

const base = {
  number: "NOI/26-27/0087",
  type: "Tax invoice",
  date: "17-10-2026",
  dueDate: "01-11-2026",
  supplierGstin: "09AABCS1429P1ZZ",
  branchAddress: "B-12, Sector 62, Noida",
  billingName: "Aggarwal Traders Private Limited",
  billingAddress: "17 Mall Road, Ludhiana",
  billingGstin: "03AABCS1429P1Z2",
  placeOfSupply: "03",
  placeOfSupplyName: "Punjab",
  interState: true,
  // both ends of the supply are known, so GST applies (QA 09-11-2026, #3)
  taxable: true,
  taxNotice: "",
  lines: [
    {
      description: "Tax audit for FY 2025-26",
      sac: "998221",
      gstRate: 18,
      amount: formatPaise(10000000),
    },
  ],
  reimbursements: [],
  subtotal: formatPaise(10000000),
  cgst: formatPaise(0),
  sgst: formatPaise(0),
  igst: formatPaise(1800000),
  reimbursementTotal: formatPaise(0),
  total: formatPaise(11800000),
  totalInWords: amountInWords(11800000),
  tdsExpected: formatPaise(1000000),
  expectedReceipt: formatPaise(10800000),
  zero: formatPaise(0),
  notes: "",
  bankDetails: "",
};

/**
 * A rendered PDF compresses its text, so the bytes cannot be searched.
 * These tests read the element tree instead — which is where a missing
 * GSTIN or a wrong tax head would actually be — and separately check that
 * the whole thing really renders to a PDF.
 */
function textOf(node) {
  if (node === null || node === undefined || node === false) return "";
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (typeof node === "object" && node.props) {
    const own =
      typeof node.type === "function" ? textOf(node.type(node.props)) : "";
    return [own, textOf(node.props.children)].filter(Boolean).join(" ");
  }
  return "";
}

async function render(invoice) {
  const element = <InvoicePdf invoice={invoice} />;
  return { element, text: textOf(element) };
}

describe("the invoice PDF", () => {
  it("renders a real PDF", async () => {
    const buffer = await renderToBuffer(<InvoicePdf invoice={base} />);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it("carries what a tax invoice must carry", async () => {
    const { text } = await render(base);
    for (const required of [
      "TAX INVOICE",
      "NOI/26-27/0087",
      "09AABCS1429P1ZZ", // ours
      "03AABCS1429P1Z2", // theirs
      "998221", // the SAC
      "Punjab", // place of supply
    ]) {
      expect(text, required).toContain(required);
    }
  });

  it("shows IGST alone on an inter-state supply", async () => {
    const { text } = await render(base);
    expect(text).toContain("IGST");
    expect(text).not.toContain("CGST");
  });

  it("shows both halves on an intra-state supply", async () => {
    const { text } = await render({
      ...base,
      interState: false,
      igst: formatPaise(0),
      cgst: formatPaise(900000),
      sgst: formatPaise(900000),
    });
    expect(text).toContain("CGST");
    expect(text).toContain("SGST");
  });

  it("marks a draft as a draft, so it cannot pass for an invoice", async () => {
    const { text } = await render({ ...base, number: null });
    expect(text).toContain("DRAFT");
    expect(text).toContain("not a valid tax invoice");
  });

  it("names a credit note as one", async () => {
    const { text } = await render({ ...base, type: "Credit note" });
    expect(text).toContain("CREDIT NOTE");
  });

  it("shows out-of-pocket costs apart, with their no-GST line", async () => {
    const { text } = await render({
      ...base,
      reimbursements: [
        { description: "ROC filing fee", amount: formatPaise(60000) },
      ],
      reimbursementTotal: formatPaise(60000),
    });
    expect(text).toContain("Out-of-pocket costs recovered at cost");
    expect(text).toContain("ROC filing fee");
  });

  it("prints the total in words", async () => {
    const { text } = await render(base);
    // the words are what a reader checks the figures against
    expect(text).toContain("One lakh eighteen thousand rupees only");
  });

  it("copes with an unregistered client", async () => {
    const { text } = await render({ ...base, billingGstin: "" });
    expect(text).toContain("unregistered");
  });

  /**
   * The rupee sign (QA 09-11-2026, #13).
   *
   * The fourteen fonts a PDF reader is guaranteed to have are Latin-1 and
   * have no ₹ (U+20B9), so every amount printed as a tick-like glyph. The
   * only cure is to embed a font that has the character, which means the
   * files have to be there and have to contain it.
   */
  describe("the rupee sign", () => {
    it("is set in an embedded font, not a built-in one", () => {
      expect(BODY_FONT).toBe("Plex Sans");
    });

    it("comes from files that are committed and have the glyph", async () => {
      const fontkit = await import("fontkit");
      const dir = join(process.cwd(), "lib", "billing", "fonts");

      for (const file of [
        "IBMPlexSans-Regular.ttf",
        "IBMPlexSans-SemiBold.ttf",
        "IBMPlexSans-Italic.ttf",
      ]) {
        const path = join(dir, file);
        expect(existsSync(path), file).toBe(true);
        const font = fontkit.openSync(path);
        expect(font.hasGlyphForCodePoint(0x20b9), file).toBe(true);
      }
    });

    it("survives a render with ₹ figures all over it", async () => {
      const buffer = await renderToBuffer(<InvoicePdf invoice={base} />);
      expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
      // the font is embedded in the file, which is what makes ₹ printable
      expect(buffer.includes(Buffer.from("IBMPlexSans"))).toBe(true);
    });
  });

  /** #3: a document charging no tax must not print a rate and a tax head. */
  describe("when tax cannot apply", () => {
    const untaxed = {
      ...base,
      taxable: false,
      interState: false,
      supplierGstin: "",
      igst: formatPaise(0),
      cgst: formatPaise(0),
      sgst: formatPaise(0),
      total: formatPaise(10000000),
      taxNotice:
        "Tax not charged: the NOI branch has no GSTIN set, so no GST can be charged on this invoice.",
    };

    it("says so, instead of showing 18% over ₹0", async () => {
      const { text } = await render(untaxed);
      expect(text).toContain("Tax not charged");
      expect(text).toContain("has no GSTIN set");
      expect(text).not.toContain("18%");
    });

    it("leaves out the tax heads rather than printing them at nil", async () => {
      const { text } = await render(untaxed);
      expect(text).not.toContain("CGST");
      expect(text).not.toContain("SGST");
      expect(text).not.toContain("IGST");
    });

    it("omits the GSTIN label when the branch has none", async () => {
      // the notice itself names GSTIN, so it is out of the way for the count
      const { text } = await render({ ...untaxed, taxNotice: "" });
      // "GSTIN " with nothing after it reads as a missing field on a legal
      // document. The client's own GSTIN is still printed, so one label is
      // left where there were two.
      expect(text.match(/GSTIN/g)).toHaveLength(1);
      expect(text).toContain("GSTIN  03AABCS1429P1Z2");

      const both = await render({ ...untaxed, taxNotice: "" });
      expect(both.text.match(/GSTIN/g)).toHaveLength(1);
      const ours = await render({ ...base, taxNotice: "" });
      expect(ours.text.match(/GSTIN/g)).toHaveLength(2);
    });
  });

  it("does not fall over on many lines", async () => {
    const many = {
      ...base,
      lines: Array.from({ length: 40 }, (_, i) => ({
        description: `Service line ${i + 1}`,
        sac: "998221",
        gstRate: 18,
        amount: formatPaise(100000),
      })),
    };
    const buffer = await renderToBuffer(<InvoicePdf invoice={many} />);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });
});

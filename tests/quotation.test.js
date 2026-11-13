import { describe, it, expect } from "vitest";
import { quotation, feeToPaise } from "../lib/clients/quotation.js";
import { packLines, quotationBody } from "../lib/clients/pack.js";
import { compose } from "../lib/mailer/templates.js";

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

describe("the welcome pack email", () => {
  const quote = {
    lines: ["GST monthly returns — ₹2,000.00 per month, plus GST"],
    totalLine: "Total: ₹2,000.00 per month",
    unpriced: 0,
  };

  it("names what is attached and what is still wanted", () => {
    const lines = packLines({
      names: ["Engagement letter", "Quotation"],
      documents: ["PAN card", "Aadhaar of the partners"],
      link: "https://files.example.com/u/abc",
      days: 7,
    });

    expect(lines.attachedLine).toContain("Engagement letter");
    expect(lines.documentsLine).toContain("PAN card");
    expect(lines.documentsLine).toContain("https://files.example.com/u/abc");
    expect(lines.documentsLine).toContain("7 days");
  });

  it("says nothing at all when there is nothing to say", () => {
    expect(packLines({})).toEqual({ attachedLine: "", documentsLine: "" });
    // a list with no link is a list, not an invitation to upload
    expect(packLines({ documents: ["PAN card"] }).documentsLine).not.toContain(
      "upload",
    );
  });

  /* #15 again: an empty optional block must leave no blank hole and no
     literal {placeholder} in a letter a client reads. */
  it("composes a message with no placeholder left in it, either way", () => {
    const full = compose("quotation", {
      name: "Rupal",
      client: "Patil Textiles",
      services: "What we have agreed\n— GST monthly returns",
      totals: quote.totalLine,
      unpricedLine: "",
      from: "Meera Pandit",
      ...packLines({
        names: ["Engagement letter"],
        documents: ["PAN card"],
        link: "https://files.example.com/u/abc",
      }),
    });

    expect(full.text).not.toMatch(/[{}]/);
    expect(full.text).toContain("Attached to this email");
    expect(full.text).toContain("What we need from you");
    expect(full.text).not.toMatch(/\n\n\n/);

    const bare = compose("quotation", {
      name: "Rupal",
      client: "Patil Textiles",
      services: "What we have agreed\n— GST monthly returns",
      totals: quote.totalLine,
      unpricedLine: "",
      from: "Meera Pandit",
      ...packLines({}),
    });

    expect(bare.text).not.toMatch(/[{}]/);
    expect(bare.text).not.toContain("Attached to this email");
    expect(bare.text).not.toMatch(/\n\n\n/);
  });
});

describe("the quotation as a document", () => {
  const body = quotationBody(
    {
      lines: [
        "GST monthly returns — ₹2,000.00 per month, plus GST",
        "Statutory audit — fee to be agreed",
      ],
      totalLine: "Total: ₹2,000.00 per month",
      unpriced: 1,
    },
    {
      clientName: "Patil Textiles",
      firmName: "PHMG & Associates",
      signedBy: "Meera Pandit",
      on: "12-11-2026",
    },
  );

  it("reads as a letter, signed, and dated from the day it was made", () => {
    expect(body).toContain("Patil Textiles");
    expect(body).toContain("— GST monthly returns — ₹2,000.00 per month");
    expect(body).toContain("Total: ₹2,000.00 per month");
    expect(body).toContain("holds for 30 days from 12-11-2026");
    expect(body).toContain("For PHMG & Associates\nMeera Pandit");
  });

  it("says out loud that a fee is still to be agreed", () => {
    // a client who reads "to be agreed" and hears nothing further assumes
    // it is free
    expect(body).toContain('the fee marked "to be agreed"');
  });

  // paragraphs are what the PDF lays out: blank lines, nothing else
  it("separates its paragraphs and leaves no empty one", () => {
    expect(body).not.toMatch(/\n\n\n/);
    expect(body.split("\n\n").every((block) => block.trim())).toBe(true);
  });
});

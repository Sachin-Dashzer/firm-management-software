import { describe, it, expect } from "vitest";
import {
  FIELDS,
  FIELD_KEYS,
  GAP_MARK,
  buildContext,
  placeholdersIn,
  resolveTemplate,
} from "../lib/docs/resolve.js";
import { checkIssue, issuerFor } from "../lib/docs/rules.js";
import { STARTER_DOC_TEMPLATES } from "../lib/docs/starter.js";

/**
 * Based Docs (P2-8b).
 *
 * Two things have to hold or the feature is a liability rather than a help:
 * a letter must never go out with a silent blank where a field should be,
 * and a document nobody with the authority to sign has approved must not be
 * issuable at all.
 */

const context = {
  now: new Date("2026-10-20T12:00:00+05:30"),
  firm: { name: "PHMG & Associates", frn: "000000N" },
  client: { legalName: "Jaiswal Textiles Private Limited", gstin: "" },
  engagement: { service: "Statutory audit", period: "FY 2025-26" },
  signatory: { name: "Priya Nair", membershipNo: "412345" },
};

describe("filling a template", () => {
  it("replaces the fields it knows", () => {
    const { text } = resolveTemplate(
      "Dear {{client.legalName}}, re {{engagement.service}}.",
      context,
    );
    expect(text).toBe(
      "Dear Jaiswal Textiles Private Limited, re Statutory audit.",
    );
  });

  it("marks a blank visibly and reports it", () => {
    // the whole point: a GSTIN the record does not have must not become an
    // invisible gap in a letter somebody signs
    const { text, gaps } = resolveTemplate("GSTIN: {{client.gstin}}", context);
    expect(text).toBe(`GSTIN: ${GAP_MARK("Client GSTIN")}`);
    expect(gaps).toEqual([{ key: "client.gstin", label: "Client GSTIN" }]);
  });

  it("reports each blank once however often it appears", () => {
    const { gaps } = resolveTemplate(
      "{{client.gstin}} and again {{client.gstin}}",
      context,
    );
    expect(gaps).toHaveLength(1);
  });

  it("leaves an unknown placeholder on the page rather than swallowing it", () => {
    // a typo in a template should be obvious to whoever reads the draft
    const { text, unknown } = resolveTemplate("Dear {{clint.name}},", context);
    expect(text).toBe("Dear {{clint.name}},");
    expect(unknown).toEqual(["clint.name"]);
  });

  it("tolerates spaces inside the braces", () => {
    expect(resolveTemplate("{{ firm.frn }}", context).text).toBe("000000N");
  });

  it("leaves text with no placeholders exactly as it was", () => {
    const body = "Yours faithfully,\n\nFor the firm";
    expect(resolveTemplate(body, context).text).toBe(body);
  });
});

describe("what a template is allowed to reach", () => {
  it("offers no sensitive field at all", () => {
    // CLAUDE.md rule 7: a PAN, an Aadhaar or a credential must not be one
    // typo away from a letter
    const forbidden = ["pan", "aadhaar", "password", "credential", "bank"];
    for (const key of FIELD_KEYS) {
      const whole = `${key} ${FIELDS[key].label}`.toLowerCase();
      for (const word of forbidden) expect(whole).not.toContain(word);
    }
  });

  it("builds a context from a client record without copying it wholesale", () => {
    const built = buildContext({
      firm: { name: "PHMG & Associates", headOffice: "A-1, Sector 2, Noida" },
      client: {
        legalName: "Jaiswal Textiles Private Limited",
        pan: "AAACJ1234K",
        gstins: [{ gstin: "09AAACJ1234K1Z5" }],
        contacts: [
          { name: "Vikram Jaiswal", designation: "Director", primary: true },
        ],
        addresses: [
          {
            kind: "Registered",
            line1: "B-44, Sector 63",
            city: "Noida",
            state: "UP",
            pincode: "201301",
          },
        ],
      },
    });
    expect(built.client.gstin).toBe("09AAACJ1234K1Z5");
    expect(built.client.contactName).toBe("Vikram Jaiswal");
    expect(built.client.address).toContain("Sector 63");
    // the PAN came in on the record and no field carries it out. A GSTIN
    // has the PAN inside it by construction, and a GSTIN belongs on a
    // letter — what must not happen is a PAN of its own becoming printable
    expect(built.client).not.toHaveProperty("pan");
    expect(FIELD_KEYS).not.toContain("client.pan");
  });
});

describe("reading a template's placeholders", () => {
  it("separates the ones that exist from the ones that do not", () => {
    const found = placeholdersIn("{{firm.name}} {{nope.at.all}} {{firm.name}}");
    expect(found.known).toEqual(["firm.name"]);
    expect(found.unknown).toEqual(["nope.at.all"]);
  });
});

describe("who may issue a document", () => {
  const approved = { verifiedAt: new Date(), name: "Engagement letter" };
  const partner = { role: "partner" };
  const ca = { role: "ca" };
  const employee = { role: "employee" };

  it("follows the tier ladder the work is signed off on", () => {
    expect(issuerFor("L3")).toBe("partner");
    expect(issuerFor("L2")).toBe("ca");
    expect(issuerFor("L1")).toBe("ca");
    // nothing told us a standalone document is routine, so it is not
    expect(issuerFor("")).toBe("partner");
  });

  it("will not issue from a template nobody has approved", () => {
    const result = checkIssue(partner, { verifiedAt: null }, { level: "L1" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("approved");
  });

  it("keeps an A-tier letter for a partner", () => {
    expect(checkIssue(ca, approved, { level: "L3" }).ok).toBe(false);
    expect(checkIssue(partner, approved, { level: "L3" }).ok).toBe(true);
  });

  it("lets a CA issue routine work's letters", () => {
    expect(checkIssue(ca, approved, { level: "L1" }).ok).toBe(true);
    expect(checkIssue(employee, approved, { level: "L1" }).ok).toBe(false);
  });

  it("respects a template that is a partner's whatever the work is", () => {
    const partnerOnly = { ...approved, partnerOnly: true };
    expect(checkIssue(ca, partnerOnly, { level: "L1" }).ok).toBe(false);
    expect(checkIssue(partner, partnerOnly, { level: "L1" }).ok).toBe(true);
  });

  it("refuses a certificate with no UDIN behind it", () => {
    const certificate = { ...approved, udinRequired: true };
    const without = checkIssue(partner, certificate, {
      level: "L3",
      udin: "",
    });
    expect(without.ok).toBe(false);
    expect(without.error).toContain("UDIN");
    expect(
      checkIssue(partner, certificate, {
        level: "L3",
        udin: "26412345ABCDEF7890",
      }).ok,
    ).toBe(true);
  });

  it("refuses to issue anything still carrying a blank, and names them", () => {
    const result = checkIssue(
      partner,
      approved,
      { level: "L1" },
      {
        gaps: [
          { label: "Client GSTIN" },
          { label: "Firm registration number" },
        ],
      },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Client GSTIN");
    expect(result.error).toContain("Firm registration number");
  });
});

describe("the eight starter templates", () => {
  it("ships eight, each with a code of its own", () => {
    expect(STARTER_DOC_TEMPLATES).toHaveLength(8);
    const codes = STARTER_DOC_TEMPLATES.map((t) => t.code);
    expect(new Set(codes).size).toBe(8);
  });

  it("ships none of them approved", () => {
    // the firm's own words have to be put to them first
    for (const template of STARTER_DOC_TEMPLATES) {
      expect(template.verifiedAt).toBeUndefined();
      expect(template.sourceNote).toBeTruthy();
    }
  });

  it("uses no placeholder that does not exist", () => {
    for (const template of STARTER_DOC_TEMPLATES) {
      expect(placeholdersIn(template.body).unknown).toEqual([]);
    }
  });

  it("keeps the certificate behind a UDIN and a partner", () => {
    const certificate = STARTER_DOC_TEMPLATES.find(
      (t) => t.code === "NETWORTH-CERT",
    );
    expect(certificate.udinRequired).toBe(true);
    expect(certificate.partnerOnly).toBe(true);
  });

  it("keeps the letters to another member or a regulator with a partner", () => {
    for (const code of ["PREV-AUD-COMM", "NOC-PREV-AUD", "CONSENT-AUD"]) {
      const template = STARTER_DOC_TEMPLATES.find((t) => t.code === code);
      expect(template.partnerOnly).toBe(true);
    }
  });

  it("renders to a PDF, every one of them", async () => {
    // the renderer is the one part of this that no unit test reaches by
    // accident: a layout mistake is a crash at the moment somebody prints
    const { renderToBuffer } = await import("@react-pdf/renderer");
    const React = await import("react");
    const { TemplatePdf } = await import("../lib/docs/templatePdf.jsx");

    for (const template of STARTER_DOC_TEMPLATES) {
      const { text, gaps } = resolveTemplate(template.body, context);
      const buffer = await renderToBuffer(
        React.createElement(TemplatePdf, {
          doc: {
            title: template.title,
            body: text,
            state: "draft",
            firm: context.firm,
            gaps,
          },
        }),
      );
      expect(buffer.length).toBeGreaterThan(1000);
    }
  }, 60_000);

  it("renders to a Word file whose text is really in it", async () => {
    // the one thing that cannot be checked here is whether Word opens it, so
    // what is checked is the next best: a real zip, with the document part
    // where Word looks for it, carrying the letter's own words
    const { renderDocx } = await import("../lib/docs/templateDocx.js");
    const { unzipSync, strFromU8 } = await import("fflate");

    const template = STARTER_DOC_TEMPLATES[0];
    const { text } = resolveTemplate(template.body, context);
    const buffer = await renderDocx({
      title: template.title,
      body: text,
      state: "final",
      firm: context.firm,
      reference: "ENG-LETTER",
    });

    // "PK": it is a zip at all
    expect(buffer.subarray(0, 2).toString()).toBe("PK");

    const files = unzipSync(new Uint8Array(buffer));
    expect(Object.keys(files)).toContain("word/document.xml");
    expect(Object.keys(files)).toContain("[Content_Types].xml");

    const xml = strFromU8(files["word/document.xml"]);
    expect(xml).toContain("Jaiswal Textiles Private Limited");
    expect(xml).toContain("PHMG &amp; Associates");
    // a final carries no draft marking
    expect(xml).not.toContain("DRAFT");
  }, 30_000);

  it("marks a draft as a draft inside the Word file too", async () => {
    const { renderDocx } = await import("../lib/docs/templateDocx.js");
    const { unzipSync, strFromU8 } = await import("fflate");

    const buffer = await renderDocx({
      title: "Engagement letter",
      body: "Dear Sir,",
      state: "draft",
      firm: context.firm,
      gaps: [{ label: "Client GSTIN" }],
    });
    const xml = strFromU8(
      unzipSync(new Uint8Array(buffer))["word/document.xml"],
    );
    expect(xml).toContain("DRAFT");
    expect(xml).toContain("Client GSTIN");
  }, 30_000);

  it("renders every starter template to Word without throwing", async () => {
    const { renderDocx } = await import("../lib/docs/templateDocx.js");
    for (const template of STARTER_DOC_TEMPLATES) {
      const { text, gaps } = resolveTemplate(template.body, context);
      const buffer = await renderDocx({
        title: template.title,
        body: text,
        state: "draft",
        firm: context.firm,
        gaps,
      });
      expect(buffer.length).toBeGreaterThan(1000);
    }
  }, 60_000);

  it("quotes no section number or statutory date", () => {
    // CLAUDE.md rule 8: nothing statutory is invented, not even in a letter
    for (const template of STARTER_DOC_TEMPLATES) {
      expect(template.body).not.toMatch(/\bSection\s+\d/i);
      expect(template.body).not.toMatch(/\bu\/s\s*\d/i);
    }
  });
});

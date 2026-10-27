import { describe, it, expect } from "vitest";
import {
  CERTIFICATE_TYPES,
  BANNED_PHRASES,
  ASSURANCE_LEVELS,
  paragraphsFor,
  checkCertificate,
  blockingSign,
  assemble,
} from "../lib/practice/certificates.js";
import {
  buildReport,
  diffReport,
  unwritten,
  reportFrom,
  reportText,
} from "../lib/audit-studio/report700.js";
import { checkUdinForMember } from "../lib/practice/udin.js";

/**
 * Certificates and the auditor's report (P3-15).
 *
 * Three properties, and each one is a way a real certificate goes wrong.
 *
 * **The assurance level is not a label.** Picking "limited" has to rewrite
 * the conclusion into the negative form *and* make the procedures
 * mandatory; a dropdown that changes a word and nothing else is how a
 * limited engagement goes out reading like an audit.
 *
 * **A UDIN belongs to the member who generated it.** Its first two digits
 * are the year and characters 3 to 8 are the registration number, so last
 * year's number, or another partner's, is catchable before the document
 * leaves rather than by the portal afterwards.
 *
 * **The report's switches restructure it.** A modified opinion puts a basis
 * section immediately after the opinion; a disclaimer takes the sentence
 * about sufficient evidence *out* of the responsibilities section, which is
 * the commonest thing left in by mistake.
 */

const member = { name: "R. Gupta", membershipNo: "412345" };
const SIGNED = new Date("2026-09-14T00:00:00+05:30");

/** A good UDIN for that member in that year: 26 + 412345 + six + four. */
const GOOD = "26412345ATNDWK5530";

describe("a UDIN belongs to its member and its year", () => {
  it("takes one that matches both", () => {
    const result = checkUdinForMember(GOOD, member, SIGNED);
    expect(result.ok).toBe(true);
    // and never claims more than a shape check can
    expect(result.note).toMatch(/ICAI portal/);
  });

  it("refuses another member's number", () => {
    const result = checkUdinForMember(
      GOOD,
      { name: "H. Bedi", membershipNo: "536712" },
      SIGNED,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Characters 3 to 8 are 412345/);
    expect(result.error).toMatch(/536712/);
  });

  it("refuses last year's number", () => {
    const result = checkUdinForMember(GOOD, member, new Date("2027-04-01"));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/generated in 2026 rather than 2027/);
  });

  it("refuses the wrong length and the wrong shape", () => {
    expect(checkUdinForMember("2641234", member, SIGNED).error).toMatch(/18/);
    // eighteen characters, but the last four are not digits
    expect(
      checkUdinForMember("26412345ATNDWKABCD", member, SIGNED).error,
    ).toMatch(/two-digit year/);
  });

  it("refuses an empty one", () => {
    expect(checkUdinForMember("", member, SIGNED).error).toBe(
      "No UDIN entered.",
    );
  });

  it("says so when the firm has not recorded the member's number", () => {
    const result = checkUdinForMember(GOOD, { name: "Somebody" }, SIGNED);
    expect(result.ok).toBe(true);
    expect(result.note).toMatch(/could not be checked/);
  });
});

describe("the assurance level rewrites the certificate", () => {
  const type = CERTIFICATE_TYPES[0];

  it("gives a positive opinion on reasonable assurance", () => {
    const paragraphs = paragraphsFor(type, "Reasonable");
    const conclusion = paragraphs.find((row) => row.key === "conclusion");
    expect(conclusion.title).toBe("Our opinion");
    expect(conclusion.text).toMatch(/^In our opinion/);
  });

  it("gives a negative-form conclusion on limited assurance", () => {
    const paragraphs = paragraphsFor(type, "Limited");
    const conclusion = paragraphs.find((row) => row.key === "conclusion");
    expect(conclusion.title).toBe("Our conclusion");
    expect(conclusion.text).toMatch(/nothing has come to our attention/);
  });

  /**
   * The asymmetry that matters: a conclusion in the negative form means
   * little unless the reader knows what was done to reach it.
   */
  it("makes the procedures mandatory on a limited engagement and not on a reasonable one", () => {
    const limited = paragraphsFor(type, "Limited").find(
      (row) => row.key === "procedures",
    );
    const reasonable = paragraphsFor(type, "Reasonable").find(
      (row) => row.key === "procedures",
    );
    expect(limited.required).toBe(true);
    expect(reasonable.required).toBe(false);
    expect(limited.help).toMatch(/Required on a limited assurance/);
  });

  it("says which standard the work was done under, and it differs", () => {
    const limited = paragraphsFor(type, "Limited").find(
      (row) => row.key === "practitioner",
    );
    const reasonable = paragraphsFor(type, "Reasonable").find(
      (row) => row.key === "practitioner",
    );
    expect(limited.text).toMatch(/substantially less in scope/);
    expect(reasonable.text).toMatch(/SQC 1/);
    expect(limited.text).not.toBe(reasonable.text);
  });

  it("locks the Guidance Note's own paragraphs and leaves the rest open", () => {
    const paragraphs = paragraphsFor(type, "Reasonable");
    const locked = paragraphs.filter((row) => row.locked).map((row) => row.key);
    const open = paragraphs.filter((row) => !row.locked).map((row) => row.key);

    expect(locked).toEqual([
      "management",
      "practitioner",
      "conclusion",
      "restriction",
    ]);
    // what is open is what is particular to this engagement
    expect(open).toEqual(["addressee", "subject", "criteria", "procedures"]);
  });

  it("offers the two levels and describes each", () => {
    expect(ASSURANCE_LEVELS).toEqual(["Reasonable", "Limited"]);
  });
});

describe("the five certificate types", () => {
  it("each names its use, its subject, its criteria and its evidence", () => {
    expect(CERTIFICATE_TYPES).toHaveLength(5);
    for (const type of CERTIFICATE_TYPES) {
      expect(type.use, type.key).toBeTruthy();
      expect(type.subject, type.key).toBeTruthy();
      expect(type.criteria, type.key).toBeTruthy();
      expect(type.evidence.length, type.key).toBeGreaterThanOrEqual(5);
    }
  });

  it("writes its subject with the places that need this engagement's facts", () => {
    const netWorth = CERTIFICATE_TYPES.find((t) => t.key === "net-worth");
    expect(netWorth.subject).toMatch(/\[date\]/);
  });
});

describe("four phrases a certificate does not use", () => {
  const draft = (text) => ({
    paragraphs: [
      { key: "subject", title: "What this report is on", text, required: true },
    ],
    evidence: [],
  });

  it("refuses them all, and says what to do instead", () => {
    expect(BANNED_PHRASES.map((row) => row.phrase)).toEqual([
      "true and correct",
      "certify that",
      "to whomsoever",
      "guarantee",
    ]);

    for (const banned of BANNED_PHRASES) {
      const problems = checkCertificate(
        draft(`We hereby ${banned.phrase} the statement of net worth.`),
      );
      const found = problems.find((row) => row.what.includes(banned.phrase));
      expect(found, banned.phrase).toBeTruthy();
      expect(found.fix).toBe(banned.why);
    }
  });

  it("catches them whatever the case", () => {
    const problems = checkCertificate(
      draft("The accounts are TRUE AND CORRECT."),
    );
    expect(problems.some((row) => row.what.includes("true and correct"))).toBe(
      true,
    );
  });

  it("leaves a properly worded draft alone", () => {
    expect(
      checkCertificate(
        draft("the statement of net worth of the entity as at 31 March 2026"),
      ),
    ).toEqual([]);
  });
});

describe("a draft is not ready while something is unfinished", () => {
  function draft(over = {}) {
    const type = CERTIFICATE_TYPES[0];
    return {
      number: "CERT/26-27/014",
      paragraphs: paragraphsFor(type, "Reasonable").map((row) => ({
        ...row,
        text:
          row.key === "addressee"
            ? "The Visa Officer, VFS Global"
            : row.key === "subject"
              ? "the statement of net worth of the entity as at 31 March 2026"
              : row.text,
      })),
      evidence: type.evidence.map((what) => ({ what, held: true })),
      ...over,
    };
  }

  it("is ready when everything is answered and held", () => {
    expect(blockingSign(draft())).toEqual([]);
  });

  it("catches a placeholder nobody replaced", () => {
    const row = draft();
    row.paragraphs.find((p) => p.key === "subject").text =
      "the statement of net worth of the entity as at [date]";
    const problems = checkCertificate(row);
    expect(problems[0].what).toMatch(/still has a placeholder in it: \[date\]/);
  });

  it("catches a required paragraph left empty", () => {
    const row = draft();
    row.paragraphs.find((p) => p.key === "addressee").text = "";
    expect(blockingSign(row)[0]).toMatch(/"Addressed to" is empty/);
  });

  it("catches evidence that is not on the file", () => {
    const row = draft();
    row.evidence[0].held = false;
    const problems = checkCertificate(row);
    expect(problems[0].what).toMatch(/1 item of evidence not on the file/);
    expect(problems[0].fix).toMatch(/rests on what is in the file/);
  });

  it("takes evidence marked not applicable", () => {
    const row = draft();
    row.evidence[0] = { ...row.evidence[0], held: false, notApplicable: true };
    expect(blockingSign(row)).toEqual([]);
  });

  it("refuses to edit one that is signed", () => {
    const row = draft({ signedAt: new Date("2026-09-14") });
    expect(blockingSign(row)[0]).toMatch(/is not edited; issue a fresh one/);
  });

  it("assembles only the paragraphs that have words in them", () => {
    const parts = assemble(draft());
    // the procedures paragraph is optional on reasonable assurance and empty
    expect(parts.map((p) => p.title)).not.toContain("What we did");
    expect(parts[0].title).toBe("Addressed to");
  });
});

describe("the auditor's report restructures itself", () => {
  const base = { opinionType: "Unmodified" };
  const keys = (input) => buildReport(input).map((row) => row.key);

  it("has no basis section on an unmodified opinion", () => {
    expect(keys(base)).not.toContain("basis");
    expect(buildReport(base)[2].title).toBe("Opinion");
  });

  it("puts the basis immediately after a modified opinion", () => {
    for (const type of ["Qualified", "Adverse", "Disclaimer of opinion"]) {
      const list = keys({ opinionType: type });
      expect(list.indexOf("basis"), type).toBe(list.indexOf("opinion") + 1);
      expect(
        buildReport({ opinionType: type })[2].title.toLowerCase(),
      ).toContain(type.toLowerCase().split(" ")[0]);
    }
  });

  /**
   * The sentence that is left in by mistake more than any other: on a
   * disclaimer the auditor has *not* obtained sufficient appropriate
   * evidence, so the responsibilities section must not say they have.
   */
  it("takes the sufficient-evidence sentence out on a disclaimer", () => {
    const normal = buildReport(base).find(
      (row) => row.key === "auditorResponsibility",
    );
    const disclaimed = buildReport({
      opinionType: "Disclaimer of opinion",
    }).find((row) => row.key === "auditorResponsibility");

    expect(normal.body).toMatch(/obtain reasonable assurance/);
    expect(disclaimed.body).toMatch(
      /not able to obtain sufficient appropriate/,
    );
    expect(disclaimed.why).toMatch(/commonest thing left in by mistake/);
  });

  it("gives going concern its own section, never an emphasis", () => {
    const list = keys({ ...base, goingConcern: true, emphasis: "something" });
    expect(list).toContain("goingConcern");
    expect(list.indexOf("goingConcern")).toBeLessThan(list.indexOf("emphasis"));

    const section = buildReport({ ...base, goingConcern: true }).find(
      (row) => row.key === "goingConcern",
    );
    expect(section.cite).toBe("SA 570");
    expect(section.why).toMatch(/never folded into an emphasis/);
  });

  it("puts emphasis of matter before other matter", () => {
    const list = keys({ ...base, emphasis: "a", otherMatter: "b" });
    expect(list.indexOf("emphasis")).toBeLessThan(list.indexOf("otherMatter"));
  });

  it("gives key audit matters to a listed entity, and not under a disclaimer", () => {
    expect(keys({ ...base, listed: true })).toContain("keyAuditMatters");
    expect(keys({ ...base, listed: false })).not.toContain("keyAuditMatters");
    expect(
      keys({ opinionType: "Disclaimer of opinion", listed: true }),
    ).not.toContain("keyAuditMatters");
  });

  it("adds the other legal and regulatory section for a company", () => {
    const section = buildReport({ ...base, companiesAct: true }).find(
      (row) => row.key === "otherLegal",
    );
    expect(section.cite).toMatch(/s\.143\(3\)/);
    expect(section.why).toMatch(/CARO annexure/);
  });

  it("keeps the order fixed whatever is switched on", () => {
    const list = keys({
      opinionType: "Qualified",
      goingConcern: true,
      listed: true,
      emphasis: "a",
      otherMatter: "b",
      otherInformation: true,
      companiesAct: true,
    });
    expect(list).toEqual([
      "title",
      "addressee",
      "opinion",
      "basis",
      "goingConcern",
      "keyAuditMatters",
      "emphasis",
      "otherMatter",
      "otherInformation",
      "managementResponsibility",
      "auditorResponsibility",
      "otherLegal",
      "signature",
    ]);
  });

  it("says what flipping a switch will do before anybody flips it", () => {
    const change = diffReport(base, {
      ...base,
      opinionType: "Qualified",
      goingConcern: true,
    });
    expect(change.added).toEqual(["basis", "goingConcern"]);
    expect(change.removed).toEqual([]);

    const back = diffReport({ ...base, listed: true }, base);
    expect(back.removed).toEqual(["keyAuditMatters"]);
  });

  it("names what is still unwritten, and never asks for a locked section", () => {
    const sections = buildReport({
      opinionType: "Qualified",
      companiesAct: true,
    });
    const blanks = unwritten(sections);
    expect(blanks).toContain("Basis for qualified");
    expect(blanks).not.toContain("Opinion");
    expect(blanks).not.toContain("Signature");
  });
});

describe("the report is assembled from the file, not typed again", () => {
  const file = (over = {}) => ({
    opinion: {
      type: "Qualified",
      basis: "Inventory at the year end could not be verified.",
      emphasis: "",
    },
    reportSwitches: { goingConcern: true, companiesAct: true },
    reportSections: [
      {
        key: "addressee",
        body: "On the financial statements of Nirmal Udyog Private Limited",
      },
      { key: "goingConcern", body: "The company's net current liabilities…" },
      { key: "otherLegal", body: "As required by s.143(3)…" },
    ],
    ...over,
  });

  it("takes the basis from the opinion rather than keeping a second copy", () => {
    const basis = reportFrom(file()).find((row) => row.key === "basis");
    expect(basis.body).toBe("Inventory at the year end could not be verified.");
  });

  /**
   * The point of the switches: a section the standard puts in the report
   * and nobody has written is a hole in a document the firm signs, so it
   * has to be nameable before signing.
   */
  it("names the sections the switches added and nobody has written", () => {
    const left = unwritten(reportFrom(file({ reportSections: [] })));
    expect(left).toContain("Material uncertainty related to going concern");
    expect(left).toContain("Report on other legal and regulatory requirements");
    // the basis is not unwritten: it came from the opinion
    expect(left).not.toContain("Basis for qualified");
  });

  it("is finished when every open section has words in it", () => {
    expect(unwritten(reportFrom(file()))).toEqual([]);
  });

  it("writes the report out in the standard's order", () => {
    const text = reportText(reportFrom(file()));
    expect(text.indexOf("Basis for qualified")).toBeGreaterThan(
      text.indexOf("Qualified opinion"),
    );
    expect(text.indexOf("Material uncertainty")).toBeGreaterThan(
      text.indexOf("Basis for qualified"),
    );
    expect(text).toContain("Inventory at the year end could not be verified.");
    expect(text).toContain("Membership Number: [M. No.]");
  });

  it("leaves a locked section's own wording alone whatever the file says", () => {
    const sections = reportFrom(
      file({
        reportSections: [{ key: "opinion", body: "we think it is fine" }],
      }),
    );
    const opinion = sections.find((row) => row.key === "opinion");
    expect(opinion.body).not.toContain("we think it is fine");
    expect(opinion.body).toMatch(/except for the effects of the matter/);
  });

  it("says what a switch will do before anybody flips it", () => {
    const moved = diffReport(
      { opinionType: "Qualified", goingConcern: true },
      { opinionType: "Qualified", goingConcern: false },
    );
    expect(moved.removed).toEqual(["goingConcern"]);
    expect(moved.added).toEqual([]);
  });
});

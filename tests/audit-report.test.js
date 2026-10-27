import { describe, it, expect } from "vitest";
import {
  LEDGER_TESTS,
  buildLedgerTests,
  testingProgress,
  flagsWithoutExceptions,
  testsFeeding,
} from "../lib/audit-studio/tests.js";
import {
  CARO_CLAUSES,
  CD3_CLAUSES,
  OPINION_TYPES,
  buildReportAnswers,
  prefillFor,
  suggestedOpinion,
  conclusionSignature,
  conclusionStands,
  isLocked,
  readiness,
  blockingSign,
  signReport,
  openAmendment,
  closureClock,
} from "../lib/audit-studio/reporting.js";

/**
 * The reporting half of the audit file (P3-14).
 *
 * Three properties, and each is a thing that goes wrong in real files.
 *
 * **A signed report is a snapshot.** Version two does not replace version
 * one: version one went out, somebody relied on it, and that is a fact
 * about the world whatever the firm thinks now. And an amended report gets
 * **its own UDIN** — reusing the first one defeats the entire purpose of
 * having one.
 *
 * **The opinion has three layers and they are allowed to disagree.** What
 * the matters suggest, what the reviewer concluded, and what is signed.
 * Recording only the third is how a qualified matter ends up under a clean
 * opinion with nobody having said anything.
 *
 * **A judgement recorded is not a judgement that still stands.** The
 * overall conclusion is stamped with a fingerprint of its inputs, so moving
 * a matter makes it stale — the same device as the approval version at
 * P3-5.
 */

const PARTNER = { id: "u-rg", name: "R. Gupta", role: "partner" };
const CA = { id: "u-ca", name: "Ritika Chandra", role: "ca" };

/** A file that is ready to sign, so each test can break one thing. */
function readyFile(over = {}) {
  const tests = buildLedgerTests().map((test) => ({
    ...test,
    ranAt: new Date(),
    wholePopulation: true,
    flags: 0,
    population: "all of it",
  }));

  return {
    stage: "Report + UDIN",
    materialityPaise: 58_00_000_00,
    materialityBasis: "1% of turnover, rounded down",
    areas: [
      { key: "A", questions: [{ text: "one", done: true }] },
      { key: "Z", questions: [{ text: "two", done: true }] },
    ],
    exceptions: [],
    tests,
    reportAnswers: buildReportAnswers().map((row) => ({
      ...row,
      answer: row.kind === "CARO" ? "Answered" : "",
    })),
    opinion: { type: "Unmodified", udin: "26123456AAAAAABBBB" },
    overall: { text: "Nothing changes the opinion." },
    signedHistory: [],
    ...over,
  };
}

/** With a matching signature, so the conclusion stands. */
function signable(over = {}) {
  const file = readyFile(over);
  file.overall.signature = conclusionSignature(file);
  return file;
}

describe("the testing programme says what it was run over", () => {
  it("has the sixteen tests, each with an authority", () => {
    expect(LEDGER_TESTS).toHaveLength(16);
    for (const test of LEDGER_TESTS) {
      expect(test.ref, test.key).toBeTruthy();
      expect(test.area, test.key).toBeTruthy();
    }
  });

  it("builds them blank, with nobody having said anything yet", () => {
    const built = buildLedgerTests();
    expect(built).toHaveLength(16);
    expect(built[0].ranAt).toBe(null);
    // null, not false: "nobody has said" is not "it was a sample"
    expect(built[0].wholePopulation).toBe(null);
    expect(built[0].flags).toBe(null);
  });

  it("counts what is run, and says when something was only sampled", () => {
    const tests = buildLedgerTests().map((test, index) => ({
      ...test,
      ranAt: index < 10 ? new Date() : null,
      wholePopulation: index < 8,
      flags: index < 3 ? 2 : 0,
    }));

    const progress = testingProgress(tests);
    expect(progress).toMatchObject({
      total: 16,
      run: 10,
      notRun: 6,
      sampled: 2,
      flagged: 3,
      totalFlags: 6,
    });
    expect(progress.why).toMatch(/6 of 16 not run yet/);
  });

  it("says plainly when everything is run but some of it was sampled", () => {
    const tests = buildLedgerTests().map((test, index) => ({
      ...test,
      ranAt: new Date(),
      wholePopulation: index !== 0,
      flags: 0,
    }));
    expect(testingProgress(tests).why).toMatch(
      /over a sample rather than the whole population/,
    );
  });

  /**
   * The file's worst state: the firm looked, found things, and wrote none of
   * them down.
   */
  it("catches a test that found things with nothing raised against it", () => {
    const tests = [
      { key: "T1", name: "Weekend postings", ranAt: new Date(), flags: 23 },
      { key: "T3", name: "Duplicates", ranAt: new Date(), flags: 3 },
      { key: "T5", name: "Cash loans", ranAt: new Date(), flags: 0 },
    ];
    const exceptions = [{ test: "T1", what: "JV/2026/0412" }];

    const missing = flagsWithoutExceptions(tests, exceptions);
    expect(missing).toEqual([{ key: "T3", name: "Duplicates", flags: 3 }]);
  });

  it("knows which tests feed which clause", () => {
    expect(testsFeeding("3CD 21(d)").map((t) => t.key)).toEqual(["T4"]);
    expect(testsFeeding("CARO (vii)").map((t) => t.key)).toEqual(["T8", "T12"]);
  });
});

describe("CARO and 3CD are pre-filled from evidence, not memory", () => {
  it("has the twenty-one CARO clauses and the 3CD ones", () => {
    expect(CARO_CLAUSES).toHaveLength(21);
    expect(CARO_CLAUSES[0].no).toBe("(i)");
    expect(CARO_CLAUSES.at(-1).no).toBe("(xxi)");
    expect(CD3_CLAUSES.map((row) => row.no)).toContain("21(b)");
    expect(buildReportAnswers()).toHaveLength(32);
  });

  it("pre-fills a clause from the tests that feed it", () => {
    const tests = [
      {
        key: "T4",
        name: "Cash payments above the limit",
        ranAt: new Date(),
        flags: 2,
        population: "1,288 cash vouchers",
      },
    ];
    const exceptions = [
      { test: "T4", what: "Two payments of ₹31,500 in total" },
    ];

    const prefill = prefillFor("3CD 21(d)", tests, exceptions);
    expect(prefill.tests).toEqual(["T4"]);
    expect(prefill.lines[0]).toMatch(/2 found over 1,288 cash vouchers/);
    expect(prefill.lines[0]).toMatch(/₹31,500/);
    expect(prefill.ready).toBe(true);
  });

  it("says when a test has not been run, rather than reading as nothing found", () => {
    const prefill = prefillFor(
      "3CD 21(d)",
      [{ key: "T4", name: "Cash payments" }],
      [],
    );
    expect(prefill.lines[0]).toMatch(/has not been run/);
    expect(prefill.ready).toBe(false);
  });

  it("says when findings exist but nobody raised them", () => {
    const prefill = prefillFor(
      "3CD 21(d)",
      [{ key: "T4", name: "Cash payments", ranAt: new Date(), flags: 5 }],
      [],
    );
    expect(prefill.lines[0]).toMatch(/not yet raised as exceptions/);
  });

  it("offers nothing for a clause no test feeds", () => {
    expect(prefillFor("CARO (xii)", buildLedgerTests(), [])).toBe(null);
  });
});

describe("three layers, allowed to disagree", () => {
  it("suggests nothing while a matter is unresolved", () => {
    const suggested = suggestedOpinion([
      { state: "With partner", what: "Stock statement difference" },
    ]);
    expect(suggested.type).toBe(null);
    expect(suggested.why).toMatch(/unresolved/);
  });

  it("suggests unmodified when nothing carries into the report", () => {
    const suggested = suggestedOpinion([
      { state: "Verified", what: "Duplicate invoice", reportEffect: "" },
    ]);
    expect(suggested.type).toBe("Unmodified");
  });

  it("suggests qualified, and adverse beats qualified", () => {
    expect(
      suggestedOpinion([
        { state: "Explained", what: "A", reportEffect: "Qualify" },
      ]).type,
    ).toBe("Qualified");

    expect(
      suggestedOpinion([
        { state: "Explained", what: "A", reportEffect: "Qualify" },
        { state: "Explained", what: "B", reportEffect: "Adverse" },
      ]).type,
    ).toBe("Adverse");
  });

  it("lets the signed opinion differ from what the matters suggest", () => {
    // the point of three layers: the system records the disagreement rather
    // than resolving it, because resolving it is a person's job
    const file = signable({
      exceptions: [
        { _id: "e1", state: "Explained", what: "A", reportEffect: "Qualify" },
      ],
      opinion: { type: "Unmodified", udin: "26123456AAAAAABBBB" },
    });
    expect(suggestedOpinion(file.exceptions).type).toBe("Qualified");
    expect(file.opinion.type).toBe("Unmodified");
    // and the file is still signable: the reviewer has concluded on it
    expect(conclusionStands(file)).toBe(true);
  });

  it("offers the four opinions SA 700 and SA 705 allow", () => {
    expect(OPINION_TYPES).toEqual([
      "Unmodified",
      "Qualified",
      "Adverse",
      "Disclaimer of opinion",
    ]);
  });
});

describe("a conclusion recorded is not a conclusion that still stands", () => {
  it("stands while nothing has moved", () => {
    expect(conclusionStands(signable())).toBe(true);
  });

  it("goes stale when a matter's effect on the report changes", () => {
    const file = signable({
      exceptions: [
        { _id: "e1", state: "Explained", what: "A", reportEffect: "" },
      ],
    });
    expect(conclusionStands(file)).toBe(true);

    file.exceptions[0].reportEffect = "Qualify";
    expect(conclusionStands(file)).toBe(false);
  });

  it("goes stale when the opinion type changes", () => {
    const file = signable();
    file.opinion.type = "Qualified";
    expect(conclusionStands(file)).toBe(false);
  });

  it("goes stale when an emphasis paragraph is added", () => {
    const file = signable();
    file.opinion.emphasis = "Material uncertainty on going concern";
    expect(conclusionStands(file)).toBe(false);
  });

  it("is not standing at all when nobody recorded one", () => {
    expect(conclusionStands(readyFile({ overall: undefined }))).toBe(false);
  });
});

describe("nothing is signed until everything is true", () => {
  it("lists the eight things, all true on a ready file", () => {
    const list = readiness(signable());
    expect(list).toHaveLength(8);
    expect(list.every((row) => row.ok)).toBe(true);
    expect(blockingSign(signable())).toEqual([]);
  });

  it("refuses with an unresolved matter", () => {
    const file = signable({
      exceptions: [{ _id: "e1", state: "With partner", what: "A" }],
    });
    expect(blockingSign(file)).toContain(
      "Every matter the audit found is verified or explained",
    );
  });

  it("refuses when a test found things nobody raised", () => {
    const file = signable();
    file.tests[0].flags = 23;
    expect(blockingSign(file)).toContain(
      "Every test that found something has its findings on the file",
    );
  });

  it("refuses with a CARO clause unanswered, and takes not-applicable", () => {
    const file = signable();
    const clause = file.reportAnswers.find((row) => row.kind === "CARO");
    clause.answer = "";
    expect(blockingSign(file)).toContain(
      "Every CARO clause is answered, or marked not applicable",
    );

    clause.notApplicable = true;
    expect(blockingSign(file)).not.toContain(
      "Every CARO clause is answered, or marked not applicable",
    );
  });

  it("refuses with no materiality basis, even with a figure", () => {
    const file = signable({ materialityBasis: "" });
    expect(blockingSign(file)).toContain("Materiality is set, with its basis");
  });

  it("refuses with no UDIN", () => {
    const file = signable();
    file.opinion.udin = "   ";
    expect(blockingSign(file)).toContain(
      "A UDIN has been generated for the report",
    );
  });

  it("refuses with an area still incomplete", () => {
    const file = signable();
    file.areas[0].questions[0].done = false;
    expect(blockingSign(file)).toContain(
      "Every working-paper area is complete",
    );
  });

  it("refuses a stale overall conclusion", () => {
    const file = signable();
    file.opinion.type = "Qualified";
    expect(blockingSign(file)).toContain(
      "The reviewer's overall conclusion is recorded for this version of the file",
    );
  });
});

describe("a signed report is a snapshot, and an amendment needs a new UDIN", () => {
  it("is signed by a partner and nobody else", () => {
    const file = signable();
    const refused = signReport(file, CA);
    expect(refused.ok).toBe(false);
    expect(refused.error).toBe("Only a partner signs an audit report.");
    expect(file.signed).toBeUndefined();
  });

  it("keeps the version, the UDIN, the matters and the words", () => {
    const file = signable({
      exceptions: [
        {
          _id: "e1",
          state: "Explained",
          what: "Stock statement difference",
          reportEffect: "Emphasis",
        },
      ],
    });
    file.overall = {
      text: "The difference is reconciled and does not change the opinion.",
      signature: conclusionSignature(file),
    };

    const result = signReport(file, PARTNER, { text: "the report text" });
    expect(result.ok).toBe(true);
    expect(file.signed).toMatchObject({
      version: 1,
      signedByName: "R. Gupta",
      udin: "26123456AAAAAABBBB",
      opinionType: "Unmodified",
      text: "the report text",
    });
    expect(file.signed.matters).toEqual([
      "Stock statement difference — Emphasis",
    ]);
    expect(file.signedHistory).toHaveLength(1);
    expect(isLocked(file)).toBe(true);
  });

  it("refuses to sign again while it is locked", () => {
    const file = signable();
    signReport(file, PARTNER);
    const again = signReport(file, PARTNER);
    expect(again.ok).toBe(false);
    expect(again.error).toMatch(/signed and locked/);
    expect(file.signedHistory).toHaveLength(1);
  });

  it("opens an amendment only with a reason, and only for a partner", () => {
    const file = signable();
    signReport(file, PARTNER);

    expect(openAmendment(file, "typo", PARTNER).ok).toBe(false);
    expect(openAmendment(file, "A long enough reason here", CA).error).toMatch(
      /Only a partner/,
    );

    const result = openAmendment(
      file,
      "The stock statement reconciliation was wrong and the figure restated",
      PARTNER,
    );
    expect(result).toMatchObject({ ok: true, version: 2 });
    expect(isLocked(file)).toBe(false);
    // and the version that went out is untouched
    expect(file.signedHistory).toHaveLength(1);
    expect(file.signedHistory[0].version).toBe(1);
  });

  it("clears the UDIN and the conclusion when an amendment opens", () => {
    const file = signable();
    signReport(file, PARTNER);
    openAmendment(
      file,
      "The figure had to be restated after the year end",
      PARTNER,
    );

    // both belonged to the version that was signed, not the one being written
    expect(file.opinion.udin).toBe("");
    expect(file.overall).toBeUndefined();
    expect(blockingSign(file)).toContain(
      "A UDIN has been generated for the report",
    );
  });

  it("refuses the earlier version's UDIN on the amended report", () => {
    const file = signable();
    signReport(file, PARTNER);
    openAmendment(
      file,
      "The figure had to be restated after the year end",
      PARTNER,
    );

    // somebody types the old number back in
    file.opinion.udin = "26123456AAAAAABBBB";
    file.overall = { text: "Restated.", signature: conclusionSignature(file) };

    const result = signReport(file, PARTNER);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already on an earlier version/);
    expect(file.signedHistory).toHaveLength(1);
  });

  it("signs version two with its own UDIN, and keeps version one", () => {
    const file = signable();
    signReport(file, PARTNER, { text: "first" });
    openAmendment(
      file,
      "The figure had to be restated after the year end",
      PARTNER,
    );

    file.opinion.udin = "26999999CCCCCCDDDD";
    file.opinion.type = "Qualified";
    file.overall = {
      text: "Qualified on the restated figure.",
      signature: conclusionSignature(file),
    };

    const result = signReport(file, PARTNER, { text: "second" });
    expect(result.ok).toBe(true);
    expect(file.signedHistory).toHaveLength(2);
    expect(file.signedHistory[0]).toMatchObject({
      version: 1,
      opinionType: "Unmodified",
      text: "first",
    });
    expect(file.signedHistory[1]).toMatchObject({
      version: 2,
      opinionType: "Qualified",
      udin: "26999999CCCCCCDDDD",
    });
    expect(isLocked(file)).toBe(true);
  });

  it("will not amend something that was never signed", () => {
    expect(
      openAmendment(readyFile(), "A good long reason", PARTNER).error,
    ).toBe("Nothing has been signed to amend.");
  });
});

describe("the closure clock counts rather than judges", () => {
  it("is nothing until the report is signed", () => {
    expect(closureClock(readyFile())).toBe(null);
  });

  it("counts the days and names the standard without asserting a number", () => {
    const file = signable();
    signReport(file, PARTNER, {}, new Date("2026-09-30T00:00:00Z"));

    const clock = closureClock(file, new Date("2026-11-09T00:00:00Z"));
    expect(clock.days).toBe(40);
    expect(clock.note).toMatch(/SA 230 sets a period/);
    // deliberately no "you are late": the number of days is a rule, and a
    // rule is not this system's to assert (CLAUDE.md rule 8)
    expect(clock.note).toMatch(/counts rather than judges/);
    expect(clock.closed).toBe(false);
  });

  it("knows when the file has actually been closed", () => {
    const file = signable({ stage: "File closure" });
    signReport(file, PARTNER);
    expect(closureClock(file).closed).toBe(true);
  });
});

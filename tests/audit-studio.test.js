import { describe, it, expect } from "vitest";
import {
  AUDIT_STAGES,
  AUDIT_AREAS,
  areasForStage,
  areaProgress,
  buildAuditAreas,
  allStandardRules,
} from "../lib/audit-studio/standards.js";
import {
  movesFrom,
  moveException,
  isUnresolved,
  exceptionCounts,
  openByArea,
  checkStageMove,
  UNRESOLVED,
  ADJUSTING,
} from "../lib/audit-studio/exceptions.js";

/**
 * The audit file (P3-13).
 *
 * Three properties, and each one is a thing a peer reviewer looks for.
 *
 * **Escalation is not resolution.** An exception sitting with the partner,
 * or waiting on the client, is still unresolved. A file where "with partner"
 * counted as dealt with is a file where nothing is dealt with, and that is
 * the easiest mistake to make when a status is just a label.
 *
 * **Posted is not verified.** The books have been changed; nobody has
 * checked the change. Those are different facts and only the second one
 * finishes.
 *
 * **Nothing is signed over an open exception.** The report says the auditor
 * obtained sufficient evidence; with something unresolved on the file, it
 * does not say something true.
 */

const PARTNER = { id: "u-rg", name: "R. Gupta", role: "partner" };
const CA = { id: "u-ca", name: "Ritika Chandra", role: "ca" };

const exception = (over = {}) => ({
  area: "E",
  what: "Cut-off: three March invoices booked in April",
  risk: "High",
  amountPaise: 4_80_000_00,
  state: "Open",
  trail: [],
  ...over,
});

describe("the file's shape comes from the index, copied in", () => {
  it("has the seven stages in order", () => {
    expect(AUDIT_STAGES).toEqual([
      "Acceptance",
      "Planning",
      "Risk",
      "Fieldwork",
      "Review",
      "Report + UDIN",
      "File closure",
    ]);
  });

  it("has the ten areas, with their own filing letters", () => {
    expect(AUDIT_AREAS).toHaveLength(10);
    expect(AUDIT_AREAS.map((area) => area.key)).toEqual([
      "A",
      "B",
      "C",
      "E",
      "F",
      "G",
      "H",
      "J",
      "N",
      "Z",
    ]);
    // the letters skip D and I on purpose: they are the firm's filing
    // letters, and renumbering them breaks every made-up reference
    expect(AUDIT_AREAS.map((area) => area.key)).not.toContain("D");
  });

  it("cites a standard on every area and a programme under it", () => {
    for (const area of AUDIT_AREAS) {
      expect(area.standards, area.key).toBeTruthy();
      expect(area.questions.length, area.key).toBeGreaterThanOrEqual(4);
      expect(AUDIT_STAGES).toContain(area.stage);
    }
  });

  it("puts the fieldwork areas in Fieldwork, and completion in Review", () => {
    expect(areasForStage("Fieldwork").map((a) => a.key)).toEqual([
      "E",
      "F",
      "G",
      "H",
      "J",
      "N",
    ]);
    expect(areasForStage("Review").map((a) => a.key)).toEqual(["Z"]);
  });

  it("builds a file's areas as copies, not references", () => {
    const built = buildAuditAreas();
    built[0].questions[0].text = "changed";
    // the index behind it is untouched, so next year's programme change
    // cannot reach into a file already made up
    expect(AUDIT_AREAS[0].questions[0]).not.toBe("changed");
    expect(built[0].questions[0].done).toBe(false);
  });

  it("offers every area as a rule a partner has to confirm", () => {
    const rules = allStandardRules();
    expect(rules).toHaveLength(10);
    for (const rule of rules) expect(rule.standards).toBeTruthy();
  });
});

describe("an area is not done while something is open on it", () => {
  const area = (done) => ({
    questions: [
      { text: "one", done: done > 0 },
      { text: "two", done: done > 1 },
      { text: "three", done: done > 2 },
      { text: "four", done: done > 3 },
    ],
  });

  it("counts the programme", () => {
    const result = areaProgress(area(2), 0);
    expect(result).toMatchObject({ done: 2, total: 4, percent: 50 });
    expect(result.why).toBe("2 of 4 still to do.");
  });

  it("is complete when every question is done and nothing is open", () => {
    expect(areaProgress(area(4), 0).complete).toBe(true);
  });

  /**
   * The rule a percentage bar quietly breaks: 100% with an exception still
   * open is not finished, and a file saying it is is the file a peer
   * reviewer picks up.
   */
  it("is not complete at a hundred per cent with an exception open", () => {
    const result = areaProgress(area(4), 1);
    expect(result.percent).toBe(100);
    expect(result.complete).toBe(false);
    expect(result.why).toBe("1 exception is still open on this area.");
  });

  it("is not complete with no programme at all", () => {
    const result = areaProgress({ questions: [] }, 0);
    expect(result.complete).toBe(false);
    expect(result.why).toBe("No programme on this area yet.");
  });
});

describe("escalation is not resolution", () => {
  it("counts with-partner and asked-client as still unresolved", () => {
    expect(UNRESOLVED).toContain("With partner");
    expect(UNRESOLVED).toContain("Asked client");
    expect(isUnresolved(exception({ state: "With partner" }))).toBe(true);
    expect(isUnresolved(exception({ state: "Asked client" }))).toBe(true);
  });

  it("counts proposed, accepted and posted as still unresolved too", () => {
    for (const state of ["Proposed", "Accepted by management", "Posted"]) {
      expect(isUnresolved(exception({ state })), state).toBe(true);
    }
  });

  it("counts only verified and explained as finished", () => {
    expect(isUnresolved(exception({ state: "Verified" }))).toBe(false);
    expect(isUnresolved(exception({ state: "Explained" }))).toBe(false);
  });
});

describe("posted is not verified", () => {
  it("leaves something to do after the books are changed", () => {
    expect(movesFrom("Posted")).toEqual([
      {
        action: "verify",
        to: "Verified",
        label: "Verified in the revised trial balance",
      },
    ]);
  });

  it("walks the whole adjusting route and keeps the trail", () => {
    const row = exception();

    expect(moveException(row, "propose", {}, CA).ok).toBe(true);
    expect(row.state).toBe("Proposed");
    expect(moveException(row, "accept", {}, CA).ok).toBe(true);
    expect(moveException(row, "post", {}, CA).ok).toBe(true);
    expect(isUnresolved(row)).toBe(true);
    expect(moveException(row, "verify", {}, CA).ok).toBe(true);

    expect(row.state).toBe("Verified");
    expect(isUnresolved(row)).toBe(false);
    expect(row.trail).toHaveLength(4);
    expect(row.trail.map((step) => step.to)).toEqual(ADJUSTING);
    expect(row.trail[0].byName).toBe("Ritika Chandra");
  });

  it("refuses a move the state does not offer", () => {
    const row = exception({ state: "Open" });
    const result = moveException(row, "verify", {}, CA);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Nothing takes this from Open/);
    expect(row.state).toBe("Open");
  });
});

describe("explaining one away is a partner's judgement, with words", () => {
  it("refuses an explanation with no reason", () => {
    const row = exception();
    const result = moveException(row, "explain", { reason: "fine" }, PARTNER);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/whole of the audit evidence/);
    expect(row.state).toBe("Open");
  });

  it("refuses it from anybody but a partner", () => {
    const row = exception();
    const result = moveException(
      row,
      "explain",
      { reason: "Within materiality and the policy is applied consistently" },
      CA,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Only a partner can close an exception/);
  });

  it("takes it from a partner, and keeps the words", () => {
    const row = exception();
    const reason =
      "Within performance materiality; the cut-off policy is applied consistently across both years";
    expect(moveException(row, "explain", { reason }, PARTNER).ok).toBe(true);
    expect(row.state).toBe("Explained");
    expect(row.explanation).toBe(reason);
  });

  it("insists on what management actually said when they decline", () => {
    const row = exception({ state: "Proposed" });
    expect(moveException(row, "decline", { reason: "no" }, CA).ok).toBe(false);

    const said =
      "Management say the invoices were raised on the contract date and will not restate";
    expect(moveException(row, "decline", { reason: said }, CA).ok).toBe(true);
    expect(row.declineReason).toBe(said);
    // declined is not finished: it goes to the partner or is explained
    expect(movesFrom("Declined by management").map((m) => m.to)).toEqual([
      "With partner",
      "Explained",
    ]);
  });

  it("insists on saying what is being asked of the client", () => {
    const row = exception();
    expect(moveException(row, "ask", {}, CA).ok).toBe(false);
    expect(
      moveException(row, "ask", { reason: "the March despatch register" }, CA)
        .ok,
    ).toBe(true);
    expect(row.state).toBe("Asked client");
  });
});

describe("the four numbers a partner reads", () => {
  const file = [
    exception({ state: "Verified", amountPaise: 4_80_000_00 }),
    exception({ state: "Posted", amountPaise: 1_82_540_00, area: "H" }),
    exception({ state: "With partner", risk: "High", area: "C" }),
    exception({ state: "Asked client", risk: "Low", area: "E" }),
    exception({
      state: "Explained",
      amountPaise: 36_000_00,
      area: "G",
      risk: "Medium",
    }),
  ];

  it("counts open, high and resolved", () => {
    const counts = exceptionCounts(file);
    // verified and explained are done; posted is not
    expect(counts.open).toBe(3);
    expect(counts.highOpen).toBe(2);
    expect(counts.resolved).toBe(2);
  });

  it("counts into the books only what is going into the books", () => {
    const counts = exceptionCounts(file);
    expect(counts.adjustmentsPaise).toBe(4_80_000_00 + 1_82_540_00);
    // and an explained difference is unadjusted, by definition
    expect(counts.unadjustedPaise).toBe(36_000_00);
  });

  it("counts what is open per area, for the working-paper index", () => {
    const byArea = openByArea(file);
    expect(byArea.get("C")).toBe(1);
    expect(byArea.get("E")).toBe(1);
    expect(byArea.get("H")).toBe(1);
    // nothing open on G: its one exception was explained
    expect(byArea.get("G")).toBeUndefined();
  });

  it("is all zeroes on an empty file", () => {
    expect(exceptionCounts([])).toEqual({
      open: 0,
      highOpen: 0,
      resolved: 0,
      adjustmentsPaise: 0,
      unadjustedPaise: 0,
    });
  });
});

describe("nothing is signed over an open exception", () => {
  it("stops the file reaching Report + UDIN", () => {
    const result = checkStageMove("Report + UDIN", [
      exception({ state: "With partner" }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/1 exception is still unresolved/);
    expect(result.error).toMatch(/before a report is signed/);
  });

  it("stops file closure too", () => {
    expect(checkStageMove("File closure", [exception()]).ok).toBe(false);
  });

  it("counts posted as unresolved for this, because nobody checked it", () => {
    expect(
      checkStageMove("Report + UDIN", [exception({ state: "Posted" })]).ok,
    ).toBe(false);
  });

  it("allows it once everything is verified or explained", () => {
    expect(
      checkStageMove("Report + UDIN", [
        exception({ state: "Verified" }),
        exception({ state: "Explained" }),
      ]).ok,
    ).toBe(true);
  });

  it("leaves the earlier stages alone — fieldwork is where things are open", () => {
    for (const stage of ["Planning", "Risk", "Fieldwork", "Review"]) {
      expect(checkStageMove(stage, [exception()]).ok, stage).toBe(true);
    }
  });
});

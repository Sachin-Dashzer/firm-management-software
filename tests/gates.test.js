import { describe, it, expect } from "vitest";
import {
  approve,
  recordClientConfirmation,
  changedAfterApproval,
  blocksFiling,
  gateState,
  isApproved,
  isClientConfirmed,
  needsClientConfirmation,
  versionOf,
  CONFIRM_SEED_CODES,
} from "../lib/engagements/gates.js";
import {
  canRecordFiling,
  recordFiling,
} from "../lib/engagements/milestones.js";
import { STARTER_CATALOG } from "../lib/services/starter.js";

/**
 * The gates before a filing (P3-5).
 *
 * The property worth testing is the **order**: approval is a precondition of
 * recording a filing, not a sign-off afterwards. Before this, a reviewer was
 * asked to approve something already lodged with the department, where
 * disagreeing meant a revised return.
 *
 * The second is that the gates belong to a **version**, not to the
 * engagement. An approval that survives an edit is not an approval of
 * anything in particular — so a change after approval raises the version and
 * both gates fall away, with nobody having to remember to withdraw them.
 */

const MAKER = { id: "u-maker", role: "employee", name: "Neha Arora" };
const REVIEWER = { id: "u-ca", role: "ca", name: "Ritika Chandra" };
const PARTNER = { id: "u-rg", role: "partner", name: "R. Gupta" };
const d = (s) => new Date(`${s}T00:00:00+05:30`);

const job = (over = {}) => ({
  _id: "e1",
  status: "Under review",
  version: 1,
  assigneeId: MAKER.id,
  reviewerId: REVIEWER.id,
  billingStatus: "Unbilled",
  templateSnapshot: {
    name: "GSTR-1 / GSTR-3B filing",
    minReviewRole: "ca",
    level: "L1",
    clientConfirmationRequired: true,
  },
  milestones: [
    { _id: "m1", name: "GSTR-1", dueDate: d("2026-11-11"), filedOn: null },
  ],
  statusHistory: [],
  ...over,
});

/** Approved, so the client gate is the only one left. */
function approved(over = {}) {
  const e = job(over);
  const result = approve(e, REVIEWER);
  expect(result.ok).toBe(true);
  return e;
}

describe("review comes before filing, not after it", () => {
  it("refuses a filing on work nobody has approved", () => {
    const e = job();
    expect(canRecordFiling(e)).toEqual({
      ok: false,
      error: "Reviewer approval is needed before filing.",
    });

    const attempt = recordFiling({
      engagement: e,
      milestoneId: "m1",
      ackNo: "AA0911260001111",
      filedOn: d("2026-11-09"),
      actor: REVIEWER,
      now: d("2026-11-10"),
    });
    expect(attempt.ok).toBe(false);
    // and nothing was written on the way to being refused
    expect(e.milestones[0].filedOn).toBeNull();
  });

  it("will not approve work nobody has submitted", () => {
    const result = approve(job({ status: "In progress" }), REVIEWER);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Send the work for review first/);
  });

  it("will not let the person who did the work approve it", () => {
    const result = approve(job(), {
      ...MAKER,
      role: "ca",
      id: MAKER.id,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/cannot approve it/);
  });

  it("needs a partner for A-tier work, not a CA", () => {
    const aTier = job({
      templateSnapshot: {
        ...job().templateSnapshot,
        minReviewRole: "partner",
        level: "L3",
      },
      reviewerId: null,
    });
    expect(approve(aTier, REVIEWER).error).toMatch(/needs a Partner/i);
    expect(approve(aTier, PARTNER).ok).toBe(true);
  });

  it("will not approve the same version twice", () => {
    const e = approved();
    expect(approve(e, PARTNER).error).toMatch(/already approved by Ritika/);
  });

  it("records who approved, and which version", () => {
    const e = approved();
    expect(isApproved(e)).toBe(true);
    expect(e.review).toMatchObject({
      approvedByName: "Ritika Chandra",
      version: 1,
    });
  });
});

describe("the client confirms the figures on tax work", () => {
  it("holds the filing until they have", () => {
    const e = approved();
    expect(blocksFiling(e)).toBe(
      "The client has not confirmed the figures yet.",
    );
    expect(gateState(e)).toMatchObject({
      key: "awaiting-client",
      label: "Client to confirm version 1",
    });
  });

  it("does not ask on work the client is not liable for", () => {
    const audit = job({
      templateSnapshot: {
        ...job().templateSnapshot,
        clientConfirmationRequired: false,
      },
    });
    approve(audit, REVIEWER);
    expect(needsClientConfirmation(audit)).toBe(false);
    expect(blocksFiling(audit)).toBe(null);
    expect(canRecordFiling(audit).ok).toBe(true);
  });

  it("will not take a confirmation of figures nobody has reviewed", () => {
    const result = recordClientConfirmation(
      job(),
      { who: "Jaspal Singh", when: d("2026-11-09"), evidence: "WhatsApp" },
      REVIEWER,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/reviewed first/);
  });

  it("insists on a name, a date and where it can be found", () => {
    const e = approved();
    const bad = (input) =>
      recordClientConfirmation(e, input, REVIEWER, d("2026-11-10")).error;

    expect(
      bad({ who: "", when: d("2026-11-09"), evidence: "WhatsApp 4pm" }),
    ).toMatch(/Name the person/);
    expect(
      bad({ who: "Jaspal Singh", when: null, evidence: "WhatsApp 4pm" }),
    ).toMatch(/date/);
    // "agreed" is not evidence: it says nothing anybody could go and check
    expect(
      bad({ who: "Jaspal Singh", when: d("2026-11-09"), evidence: "ok" }),
    ).toMatch(/where the confirmation is/);
    expect(isClientConfirmed(e)).toBe(false);
  });

  it("refuses a date in the future", () => {
    const e = approved();
    const result = recordClientConfirmation(
      e,
      {
        who: "Jaspal Singh",
        when: new Date(Date.now() + 86_400_000),
        evidence: "WhatsApp from Jaspal, 4:10 pm",
      },
      REVIEWER,
    );
    expect(result.error).toBe("That date is in the future.");
  });

  it("records it against the version, and opens the filing", () => {
    const e = approved();
    const result = recordClientConfirmation(
      e,
      {
        who: "Jaspal Singh",
        when: d("2026-11-09"),
        evidence: "WhatsApp from Jaspal, 9 Nov 4:10 pm",
      },
      REVIEWER,
      d("2026-11-10"),
    );

    expect(result).toMatchObject({ ok: true, version: 1 });
    expect(e.clientConfirmation).toMatchObject({
      who: "Jaspal Singh",
      version: 1,
      recordedByName: "Ritika Chandra",
    });
    expect(blocksFiling(e)).toBe(null);
    expect(gateState(e).key).toBe("ready-to-file");

    const filed = recordFiling({
      engagement: e,
      milestoneId: "m1",
      ackNo: "AA0911260001111",
      filedOn: d("2026-11-09"),
      actor: REVIEWER,
      now: d("2026-11-10"),
    });
    expect(filed.ok).toBe(true);
    // which version actually went in
    expect(e.milestones[0].versionFiled).toBe(1);
  });
});

describe("a change after approval raises the version and resets both gates", () => {
  function confirmed() {
    const e = approved();
    recordClientConfirmation(
      e,
      {
        who: "Jaspal Singh",
        when: d("2026-11-09"),
        evidence: "WhatsApp from Jaspal, 9 Nov 4:10 pm",
      },
      REVIEWER,
      d("2026-11-10"),
    );
    return e;
  }

  it("does nothing when there was nothing standing to lose", () => {
    const e = job();
    expect(changedAfterApproval(e, MAKER, "a step ticked")).toEqual({
      bumped: false,
    });
    expect(versionOf(e)).toBe(1);
    expect(e.status).toBe("Under review");
  });

  it("raises the version, drops both gates and sends it back", () => {
    const e = confirmed();
    const bump = changedAfterApproval(
      e,
      MAKER,
      '"Reconcile with GSTR-2B" reopened',
    );

    expect(bump).toMatchObject({ bumped: true, version: 2 });
    expect(bump.note).toMatch(/now version 2/);
    // the client's confirmation of version 1 is not a confirmation of this
    expect(bump.note).toMatch(/Review and client confirmation needed again/);
    expect(isApproved(e)).toBe(false);
    expect(isClientConfirmed(e)).toBe(false);
    expect(e.status).toBe("In progress");
    expect(blocksFiling(e)).toBe("Reviewer approval is needed before filing.");
  });

  it("says only what was lost when there was no client gate", () => {
    const e = approved();
    const bump = changedAfterApproval(e, MAKER, "a document accepted");
    expect(bump.note).toMatch(/Review needed again/);
    expect(bump.note).not.toMatch(/client confirmation/);
  });

  it("needs approving again, and the new version is what gets filed", () => {
    const e = confirmed();
    changedAfterApproval(e, MAKER, "a step reopened");

    e.status = "Under review";
    expect(approve(e, REVIEWER).ok).toBe(true);
    recordClientConfirmation(
      e,
      {
        who: "Jaspal Singh",
        when: d("2026-11-10"),
        evidence: "WhatsApp from Jaspal, 10 Nov 11:02 am",
      },
      REVIEWER,
      d("2026-11-11"),
    );

    const filed = recordFiling({
      engagement: e,
      milestoneId: "m1",
      ackNo: "AA0911260002222",
      filedOn: d("2026-11-10"),
      actor: REVIEWER,
      now: d("2026-11-11"),
    });
    expect(filed.ok).toBe(true);
    expect(e.milestones[0].versionFiled).toBe(2);
  });

  it("leaves a filing already recorded alone", () => {
    const e = confirmed();
    recordFiling({
      engagement: e,
      milestoneId: "m1",
      ackNo: "AA0911260001111",
      filedOn: d("2026-11-09"),
      actor: REVIEWER,
      now: d("2026-11-10"),
    });

    changedAfterApproval(e, MAKER, "a step reopened");
    // a return lodged with the department is not un-lodged by an edit here
    expect(e.milestones[0].filedOn).toEqual(d("2026-11-09"));
    expect(e.milestones[0].versionFiled).toBe(1);
  });
});

describe("which services ask the client to confirm", () => {
  it("is the five the owner named, and no assurance work", () => {
    expect(CONFIRM_SEED_CODES).toEqual([
      "GSTR3B",
      "GSTR9",
      "TDS-RET",
      "ITR-SAL",
      "ITR-BUS",
    ]);
  });

  it("is seeded onto exactly those services in the starter catalog", () => {
    const flagged = STARTER_CATALOG.filter(
      (s) => s.clientConfirmationRequired,
    ).map((s) => s.code);
    expect(flagged.sort()).toEqual([...CONFIRM_SEED_CODES].sort());

    const audit = STARTER_CATALOG.find((s) => s.code === "STAT-AUD");
    expect(audit.clientConfirmationRequired).toBe(false);
  });
});

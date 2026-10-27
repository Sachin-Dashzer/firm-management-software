import { describe, it, expect } from "vitest";
import {
  isMine,
  filterIssues,
  countByKind,
  KINDS,
  SEVERITY_LABELS,
  PARTNER,
  ACCOUNTS,
} from "../lib/issues/shape.js";
import { nextStep } from "../lib/issues/next.js";
import { approve, recordClientConfirmation } from "../lib/engagements/gates.js";

/**
 * Issues (P3-6).
 *
 * Two properties are worth testing here, and the rules themselves are
 * tested where they live — the gate rules in `gates.test.js`, the clock in
 * `risk.test.js`, the money in `scope.test.js`. Issues reads those same
 * functions, which is the point of it: a row appears because a rule that is
 * already tested says so, not because this file has a second opinion.
 *
 * The first is **whose a row is**. "Mine" is the default view for everybody
 * but a partner, so a rule that is slightly wrong means somebody never sees
 * the thing they are supposed to act on.
 *
 * The second is **what the per-job card offers**: the preparer must not be
 * shown an approval button the server would refuse, and work that is
 * somebody else's must offer a nudge rather than nothing.
 */

const PARTNER_USER = { id: "u-rg", role: "partner", name: "R. Gupta" };
const CA = { id: "u-ca", role: "ca", name: "Ritika Chandra" };
const EMPLOYEE = { id: "u-neha", role: "employee", name: "Neha Arora" };
const INTERN = { id: "u-int", role: "intern", name: "Aditya Rao" };
const ACCOUNTANT = { id: "u-acc", role: "accounts", name: "Suresh Pillai" };

const row = (over = {}) => ({
  key: "k1",
  kind: "Deadlines",
  severity: 2,
  text: "Statutory date passed",
  clientId: "c1",
  ownerId: null,
  href: "/engagements/e1",
  actions: [],
  ...over,
});

describe("whose row is it", () => {
  it("is yours when it names you", () => {
    expect(isMine(row({ ownerId: EMPLOYEE.id }), EMPLOYEE)).toBe(true);
    expect(isMine(row({ ownerId: EMPLOYEE.id }), CA)).toBe(false);
  });

  it("falls to the managers when it names nobody", () => {
    const unowned = row({ ownerId: null });
    expect(isMine(unowned, PARTNER_USER)).toBe(true);
    expect(isMine(unowned, CA)).toBe(true);
    // an employee is never the default owner of a firm-wide problem
    expect(isMine(unowned, EMPLOYEE)).toBe(false);
    expect(isMine(unowned, INTERN)).toBe(false);
  });

  it("gives a partner decision to a partner only", () => {
    const waiver = row({ ownerId: PARTNER, kind: "Money" });
    expect(isMine(waiver, PARTNER_USER)).toBe(true);
    expect(isMine(waiver, CA)).toBe(false);
    expect(isMine(waiver, ACCOUNTANT)).toBe(false);
  });

  it("gives an accounts row to whoever may bill", () => {
    const invoice = row({ ownerId: ACCOUNTS, kind: "Money" });
    // the matrix: invoices is edit for a partner, a CA in branch, accounts
    expect(isMine(invoice, ACCOUNTANT)).toBe(true);
    expect(isMine(invoice, PARTNER_USER)).toBe(true);
    expect(isMine(invoice, CA)).toBe(true);
    expect(isMine(invoice, EMPLOYEE)).toBe(false);
    expect(isMine(invoice, INTERN)).toBe(false);
  });
});

describe("the list a reader is shown", () => {
  const rows = [
    row({ key: "a", severity: 1, kind: "Money", ownerId: ACCOUNTS }),
    row({ key: "b", severity: 3, kind: "Deadlines", ownerId: EMPLOYEE.id }),
    row({ key: "c", severity: 2, kind: "Uploads", ownerId: EMPLOYEE.id }),
    row({ key: "d", severity: 2, kind: "Review", ownerId: CA.id }),
  ];

  it("puts the worst first, then the groups in their fixed order", () => {
    const seen = filterIssues(rows, { who: "all" }, PARTNER_USER);
    // b is Urgent; c and d are both Today, and Review outranks Uploads
    // because KINDS says so — ties have to break the same way every time or
    // the list reshuffles itself between page loads
    expect(seen.map((r) => r.key)).toEqual(["b", "d", "c", "a"]);
  });

  it("narrows to one person without changing the order", () => {
    const mine = filterIssues(rows, { who: "mine" }, EMPLOYEE);
    expect(mine.map((r) => r.key)).toEqual(["b", "c"]);
  });

  it("narrows to one kind", () => {
    const money = filterIssues(
      rows,
      { who: "all", kind: "Money" },
      PARTNER_USER,
    );
    expect(money.map((r) => r.key)).toEqual(["a"]);
  });

  it("counts what it is about to show, not everything", () => {
    const mine = rows.filter((r) => isMine(r, EMPLOYEE));
    expect(countByKind(mine)).toEqual({ Deadlines: 1, Uploads: 1 });
  });

  it("keeps the groups in a fixed order, so the filters do not jump about", () => {
    expect(KINDS[0]).toBe("Deadlines");
    expect(KINDS.at(-1)).toBe("Client data");
    expect(new Set(KINDS).size).toBe(KINDS.length);
  });

  it("names the three urgencies the way the prototype does", () => {
    expect(SEVERITY_LABELS).toEqual({
      3: "Urgent",
      2: "Today",
      1: "This week",
    });
  });
});

/**
 * There is deliberately no test for "a row is marked resolved", because
 * there is no way to mark one. This is the check that the door stays shut:
 * nothing in a row carries a state of its own, so nothing can go stale.
 */
describe("nothing is marked resolved", () => {
  it("has no resolved, dismissed or snoozed field on a row", () => {
    const keys = Object.keys(row());
    for (const forbidden of [
      "resolved",
      "resolvedAt",
      "dismissed",
      "snoozedUntil",
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});

describe("the one next thing on a job", () => {
  const d = (s) => new Date(`${s}T00:00:00+05:30`);

  const job = (over = {}) => ({
    _id: "e1",
    clientId: "c1",
    status: "Under review",
    version: 1,
    assigneeId: EMPLOYEE.id,
    reviewerId: CA.id,
    billingStatus: "Unbilled",
    templateSnapshot: {
      minReviewRole: "ca",
      minExecRole: "intern",
      level: "L1",
      clientConfirmationRequired: true,
    },
    checklist: [],
    tasks: [{ _id: "t1", name: "Reconcile with GSTR-2B", done: true }],
    milestones: [
      { _id: "m1", name: "GSTR-3B", dueDate: d("2026-11-20"), filedOn: null },
    ],
    ...over,
  });

  const names = { assigneeName: "Neha Arora", reviewerName: "Ritika Chandra" };

  it("tells the preparer to wait, and offers them nothing to press", () => {
    const step = nextStep(job(), EMPLOYEE, names);
    expect(step.text).toBe("With Ritika Chandra for review");
    expect(step.action).toBe(null);
    // their own job is to wait, so there is nobody to nudge
    expect(step.stance).toBe("watch");
    // and the reason the button is absent travels with it. For an employee
    // it is the tier floor rather than maker-checker: that check comes first
    // in `checkReviewer`, and an employee could not review this whoever
    // prepared it
    expect(step.why).toMatch(/needs a CA to approve it/);
  });

  it("tells a CA who did the work that they cannot review their own", () => {
    const step = nextStep(job({ assigneeId: CA.id, reviewerId: null }), CA, {
      ...names,
      assigneeName: "Ritika Chandra",
    });
    expect(step.action).toBe(null);
    expect(step.why).toMatch(/cannot approve it/);
  });

  it("gives the reviewer the approval", () => {
    const step = nextStep(job(), CA, names);
    expect(step.text).toMatch(/Review the work and approve it/);
    expect(step.action).toMatchObject({
      act: "approve-work",
      label: "Approve",
    });
    expect(step.stance).toBe("mine");
  });

  it("offers a partner the same thing as help, not as their own work", () => {
    const step = nextStep(job(), PARTNER_USER, names);
    expect(step.action.act).toBe("approve-work");
    expect(step.stance).toBe("help");
  });

  it("moves to the client once it is approved", () => {
    const e = job();
    approve(e, CA);
    const step = nextStep(e, CA, names);
    expect(step.text).toBe("The client confirms version 1 of the figures");
    expect(step.action.href).toBe("#approval");
  });

  it("moves to the filing once the client has confirmed", () => {
    const e = job();
    approve(e, CA);
    recordClientConfirmation(
      e,
      {
        who: "Jaspal Singh",
        when: d("2026-11-18"),
        evidence: "WhatsApp from Jaspal, 18 Nov 4:10 pm",
      },
      CA,
      d("2026-11-19"),
    );
    const step = nextStep(e, CA, names, d("2026-11-19"));
    expect(step.text).toMatch(/^File GSTR-3B in the department's utility/);
  });

  it("says the date has gone when it has", () => {
    const e = job();
    approve(e, CA);
    recordClientConfirmation(
      e,
      {
        who: "Jaspal Singh",
        when: d("2026-11-18"),
        evidence: "WhatsApp from Jaspal, 18 Nov 4:10 pm",
      },
      CA,
      d("2026-11-19"),
    );
    const step = nextStep(e, CA, names, d("2026-11-25"));
    expect(step.text).toMatch(/the date has already passed/);
  });

  it("puts an upload to check above everything else", () => {
    const e = job({
      checklist: [
        {
          _id: "i1",
          name: "Sales register",
          side: "client",
          status: "Received",
        },
      ],
    });
    expect(nextStep(e, CA, names).text).toBe(
      "Check the upload: Sales register",
    );
  });

  it("puts a client who cannot provide above a chase", () => {
    const e = job({
      status: "Awaiting documents",
      checklist: [
        {
          _id: "i1",
          name: "Bank statement",
          side: "client",
          mandatory: true,
          status: "Requested",
          clientReply: { kind: "cannot", note: "the bank has not issued it" },
        },
      ],
    });
    expect(nextStep(e, CA, names).text).toMatch(
      /cannot provide Bank statement — decide how to proceed/,
    );
  });

  it("offers the step to whoever may tick it, and a nudge to whoever may not", () => {
    const e = job({
      status: "In progress",
      tasks: [
        { _id: "t1", name: "Sign the report", done: false, minRole: "partner" },
      ],
    });
    expect(nextStep(e, PARTNER_USER, names).action).toMatchObject({
      act: "tick-task",
    });
    // an employee may work the job but not this step
    const theirs = nextStep(e, EMPLOYEE, names);
    expect(theirs.action).toBe(null);
    expect(theirs.stance).toBe("nudge");
  });

  it("asks for the acknowledgement on finished work that has none", () => {
    const e = job({
      status: "Completed",
      milestones: [
        {
          _id: "m1",
          name: "GSTR-3B",
          dueDate: d("2026-11-20"),
          filedOn: d("2026-11-19"),
          proofDocumentId: null,
        },
      ],
    });
    expect(nextStep(e, CA, names).text).toBe(
      "Attach the acknowledgement for GSTR-3B",
    );
  });

  it("hands finished, unpriced work to accounts", () => {
    const e = job({
      status: "Completed",
      feePaise: 0,
      milestones: [
        {
          _id: "m1",
          name: "GSTR-3B",
          dueDate: d("2026-11-20"),
          filedOn: d("2026-11-19"),
          proofDocumentId: "d1",
        },
      ],
    });
    const step = nextStep(e, CA, names);
    expect(step.text).toBe("Agree the fee, then bill it");
    expect(step.who).toBe("Accounts");
  });

  it("says so plainly when a job is done with", () => {
    const e = job({
      status: "Completed",
      billingStatus: "Billed",
      milestones: [
        {
          _id: "m1",
          name: "GSTR-3B",
          dueDate: d("2026-11-20"),
          filedOn: d("2026-11-19"),
          proofDocumentId: "d1",
        },
      ],
    });
    const step = nextStep(e, CA, names);
    expect(step.stance).toBe("done");
    expect(step.text).toBe("Nothing left to do on this job");
  });
});

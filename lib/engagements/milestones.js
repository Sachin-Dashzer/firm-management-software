// @ts-check

import { milestonesFor, governingDate } from "../compliance/dueDate.js";

/**
 * Filing milestones: the shape of a filing record (P3-1).
 *
 * An engagement is one service for one client for one period, but it is not
 * always one *filing*. October GST owes GSTR-1 on the 11th and GSTR-3B on
 * the 20th; ROC annual filing owes AOC-4 thirty days after the AGM and
 * MGT-7 sixty. Before this, the engagement held one `ackNo` and one
 * `filedOn`, so a client whose GSTR-1 went in on time and whose GSTR-3B went
 * in nine days late could only be recorded as one or the other — and
 * whichever was stored was a false statement about the other return. The
 * due-date master said as much in a comment: *"GSTR-3B is the later of the
 * pair, so it governs the engagement."*
 *
 * Everything here is pure except `recordFiling` and `correctFiling`, which
 * need a session. The derived fields are written in one place, `syncDerived`,
 * and nowhere else.
 */

/** A milestone nobody has filed yet. */
export const OPEN = "open";
/** Filed, with its acknowledgement. */
export const FILED = "filed";
/** Its date has passed and it is not filed. */
export const OVERDUE = "overdue";
/** No date known — an unconfirmed rule, or an event date not yet entered. */
export const UNDATED = "undated";

/**
 * Build the milestone rows for a new engagement from the due-date master.
 *
 * Returns an empty list when the rule is unverified or missing, which is
 * CLAUDE.md rule 8 doing its job: no date is better than an invented one,
 * and the engagement is created with its filings unknown rather than wrong.
 *
 * @param {any} rule
 * @param {string} periodCode
 * @param {{ eventDate?: Date|null }} [context]
 */
export function buildMilestones(rule, periodCode, context = {}) {
  const { milestones } = milestonesFor(rule, periodCode, context);
  return milestones.map((m) => ({
    name: m.name,
    ruleKey: m.key,
    dueDate: m.date ?? null,
    filedOn: null,
    dueDateAtFiling: null,
    ackNo: "",
    proofDocumentId: null,
    versionFiled: null,
    filedBy: null,
    filedByName: "",
    history: [],
  }));
}

/**
 * Where one milestone stands.
 * @param {any} milestone
 * @param {Date} [now]
 */
export function milestoneState(milestone, now = new Date()) {
  if (milestone?.filedOn) return FILED;
  if (!milestone?.dueDate) return UNDATED;
  return milestone.dueDate.getTime() < now.getTime() ? OVERDUE : OPEN;
}

/**
 * How late one filing was, in days, against the date that was in force on
 * the day it went in.
 *
 * `dueDateAtFiling` is the honest comparison and `dueDate` is only the
 * fallback for rows filed before P3-1 existed. An extension announced after
 * the event must not turn a late filing punctual, and withdrawing one must
 * not turn a punctual filing late.
 *
 * @param {any} milestone
 * @returns {number} 0 when on time, or not filed, or no date to judge against
 */
export function latenessDays(milestone) {
  const due = milestone?.dueDateAtFiling ?? milestone?.dueDate;
  if (!milestone?.filedOn || !due) return 0;
  const ms = milestone.filedOn.getTime() - due.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

/**
 * Did this engagement's filings all go in on time?
 *
 * `null` when there is nothing to judge — no milestones, or none filed, or
 * no dates behind them. A report that treats null as "on time" is lying by
 * omission, which is why this is three-valued.
 *
 * @param {any} engagement
 * @returns {boolean|null}
 */
export function wasOnTime(engagement) {
  const judged = (engagement?.milestones ?? []).filter(
    (m) => m.filedOn && (m.dueDateAtFiling ?? m.dueDate),
  );
  if (!judged.length) return null;
  return judged.every((m) => latenessDays(m) === 0);
}

/**
 * "none", "part" or "all" — what the compliance grid colours a cell by.
 *
 * "part" is the state the grid could not previously express, and it is the
 * interesting one: GSTR-1 in, GSTR-3B still owing.
 *
 * @param {any} engagement
 */
export function filingProgress(engagement) {
  const list = engagement?.milestones ?? [];
  if (!list.length) return "none";
  const filed = list.filter((m) => m.filedOn).length;
  if (filed === 0) return "none";
  return filed === list.length ? "all" : "part";
}

/** Filed, but the acknowledgement was never attached. The client sees this. */
export function proofPending(engagement) {
  return (engagement?.milestones ?? []).some(
    (m) => m.filedOn && !m.proofDocumentId,
  );
}

/** The next filing that has to happen, or null when everything is in. */
export function nextOpenMilestone(engagement) {
  const open = (engagement?.milestones ?? []).filter(
    (m) => !m.filedOn && m.dueDate,
  );
  if (!open.length) return null;
  return open.reduce(
    (a, b) => (a.dueDate.getTime() <= b.dueDate.getTime() ? a : b),
    open[0],
  );
}

/**
 * Write the three derived fields from the milestones. **The only place they
 * are written.**
 *
 * They exist because forty files read `statutoryDue` and sixteen read
 * `filedOn`, and all of them want what they always wanted: when is this due,
 * when did it go in. Keeping them a view of the array was a two-surface
 * change instead of a forty-file one.
 *
 * `filedOn` is the *last* milestone's date, so "when was this job filed"
 * means what it has always meant. Anything that cares about one return
 * rather than the job reads `milestones`.
 *
 * @param {any} engagement a Mongoose document or a plain object
 */
export function syncDerived(engagement) {
  const list = engagement.milestones ?? [];

  if (!list.length) return engagement;

  engagement.statutoryDue = governingDate(list);

  const filed = list.filter((m) => m.filedOn);
  if (filed.length === list.length) {
    // all in: the job was filed when the last one went in
    engagement.filedOn = filed.reduce(
      (a, b) => (a.filedOn.getTime() >= b.filedOn.getTime() ? a : b),
      filed[0],
    ).filedOn;
  } else {
    // part-filed is not filed, and saying otherwise is how a half-done
    // month ends up counted as done
    engagement.filedOn = null;
  }

  const governing = nextOpenMilestone(engagement) ?? list[list.length - 1];
  engagement.ackNo = governing?.ackNo || filed[filed.length - 1]?.ackNo || "";

  return engagement;
}

/**
 * Move a milestone's live date — a government extension, or an AGM date
 * entered late. Filing records are left alone: `dueDateAtFiling` on anything
 * already filed is the date that applied then and does not move.
 *
 * @param {any} engagement
 * @param {Array<{key: string, date: Date|null}>} dates
 */
export function applyDueDates(engagement, dates) {
  const byKey = new Map(
    dates.map((d) => [String(d.key).toUpperCase(), d.date]),
  );
  for (const m of engagement.milestones ?? []) {
    const next = byKey.get(String(m.ruleKey).toUpperCase());
    if (next !== undefined) m.dueDate = next;
  }
  return syncDerived(engagement);
}

/**
 * May a filing be recorded on this engagement at all?
 *
 * Note what this does **not** check: that a reviewer approved first. In this
 * build review still comes after filing (spec section 5), and reversing that
 * order is P3-5's job, not this step's. Doing half of it here would have
 * left the pipeline in a state neither the spec nor the prototype describes.
 *
 * @param {any} engagement
 */
export function canRecordFiling(engagement) {
  if (engagement.status === "Completed") {
    return { ok: false, error: "A completed engagement is locked." };
  }
  if (engagement.status === "Cancelled") {
    return { ok: false, error: "This engagement was cancelled." };
  }
  if (!(engagement.milestones ?? []).length) {
    return {
      ok: false,
      error:
        "This engagement has no filings listed yet. Confirm the due-date rule for the service in Settings → Due dates, which is what tells the system which returns it owes.",
    };
  }
  return { ok: true };
}

/**
 * Record one filing.
 *
 * Mutates and returns the engagement; the caller saves it inside its own
 * audited transaction. The acknowledgement is mandatory — a filing nobody
 * can evidence is a claim, not a record — and a milestone already filed is
 * refused rather than overwritten, because replacing a wrong number is a
 * correction and corrections keep what they replaced.
 *
 * @param {object} args
 * @param {any} args.engagement
 * @param {string} args.milestoneId
 * @param {string} args.ackNo
 * @param {Date} args.filedOn
 * @param {string|null} [args.proofDocumentId]
 * @param {{ id: string, name: string }} args.actor
 * @param {Date} [args.now]
 * @returns {{ ok: true, milestone: any, complete: boolean } | { ok: false, error: string }}
 */
export function recordFiling({
  engagement,
  milestoneId,
  ackNo,
  filedOn,
  proofDocumentId = null,
  actor,
  now = new Date(),
}) {
  const allowed = canRecordFiling(engagement);
  if (!allowed.ok) return allowed;

  const milestone = (engagement.milestones ?? []).find(
    (m) => String(m._id) === String(milestoneId),
  );
  if (!milestone) return { ok: false, error: "No such filing on this work." };

  if (milestone.filedOn) {
    return {
      ok: false,
      error: `${milestone.name} is already recorded as filed on ${milestone.filedOn.toISOString().slice(0, 10)}. Correct that record instead, so the number it replaces is kept.`,
    };
  }

  const ack = String(ackNo ?? "").trim();
  if (!ack) {
    return {
      ok: false,
      error: `Enter the acknowledgement number for ${milestone.name}. Without it there is nothing to show that it was filed.`,
    };
  }

  if (!filedOn) return { ok: false, error: "Enter the date it was filed." };
  if (filedOn.getTime() > now.getTime()) {
    return { ok: false, error: "A filing date cannot be in the future." };
  }

  milestone.ackNo = ack;
  milestone.filedOn = filedOn;
  // frozen here, on purpose: see latenessDays
  milestone.dueDateAtFiling = milestone.dueDate ?? null;
  milestone.proofDocumentId = proofDocumentId ?? null;
  milestone.versionFiled = engagement.version ?? 1;
  milestone.filedBy = actor.id;
  milestone.filedByName = actor.name;

  syncDerived(engagement);

  const complete = (engagement.milestones ?? []).every((m) => m.filedOn);
  return { ok: true, milestone, complete };
}

/**
 * Replace a filing record that was wrong.
 *
 * The old record moves to `history` with the reason — it is not deleted,
 * because the number the firm reported is a fact about what was reported
 * even once it turns out to be the wrong number, and a peer reviewer asking
 * "what did you tell the client in November" deserves an answer.
 *
 * Refused once the work is billed: an invoice that cites a filing cannot
 * quietly start citing a different one. A credit note comes first.
 *
 * @param {object} args
 * @param {any} args.engagement
 * @param {string} args.milestoneId
 * @param {string} args.reason
 * @param {{ id: string, name: string }} args.actor
 * @returns {{ ok: true, milestone: any } | { ok: false, error: string }}
 */
export function correctFiling({ engagement, milestoneId, reason, actor }) {
  const milestone = (engagement.milestones ?? []).find(
    (m) => String(m._id) === String(milestoneId),
  );
  if (!milestone) return { ok: false, error: "No such filing on this work." };
  if (!milestone.filedOn) {
    return { ok: false, error: "That filing was never recorded." };
  }

  const why = String(reason ?? "").trim();
  if (why.length < 5) {
    return {
      ok: false,
      error:
        "Say why the record is being corrected. It is kept with the old one.",
    };
  }

  if (engagement.billingStatus && engagement.billingStatus !== "Unbilled") {
    return {
      ok: false,
      error:
        "This work is already invoiced. Raise a credit note before correcting what the invoice says was filed.",
    };
  }

  milestone.history = milestone.history ?? [];
  milestone.history.push({
    filedOn: milestone.filedOn,
    ackNo: milestone.ackNo,
    dueDateAtFiling: milestone.dueDateAtFiling,
    reason: why,
    correctedAt: new Date(),
    correctedBy: actor.id,
    correctedByName: actor.name,
  });

  milestone.filedOn = null;
  milestone.ackNo = "";
  milestone.dueDateAtFiling = null;
  milestone.proofDocumentId = null;
  milestone.versionFiled = null;
  milestone.filedBy = null;
  milestone.filedByName = "";

  syncDerived(engagement);
  return { ok: true, milestone };
}

/**
 * Give a pre-P3-1 engagement the milestone it always had, from the `ackNo`
 * and `filedOn` it was carrying.
 *
 * One milestone, because that is all the old shape could hold, and
 * `dueDateAtFiling` is set from `statutoryDue` — the best available guess
 * and flagged as one, since the date in force at the time was never
 * recorded. Idempotent: running it twice does nothing the second time.
 *
 * @param {any} engagement
 */
export function backfillMilestones(engagement) {
  if ((engagement.milestones ?? []).length) return engagement;

  const code = String(
    engagement.templateSnapshot?.code ??
      engagement.templateSnapshot?.name ??
      "",
  ).toUpperCase();

  engagement.milestones = [
    {
      name: engagement.templateSnapshot?.name || code || "Filing",
      ruleKey: code,
      dueDate: engagement.statutoryDue ?? null,
      filedOn: engagement.filedOn ?? null,
      dueDateAtFiling: engagement.filedOn
        ? (engagement.statutoryDue ?? null)
        : null,
      ackNo: engagement.ackNo ?? "",
      proofDocumentId: null,
      versionFiled: null,
      filedBy: null,
      filedByName: "",
      history: [],
    },
  ];
  engagement.schemaVersion = 2;
  return engagement;
}

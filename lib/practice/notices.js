// @ts-check

import { NOTICE_KINDS, shiftDate } from "./noticeLaw.js";
import { daysUntil, startOfISTDay } from "../dates.js";

/**
 * What a notice owes, and when (P3-11).
 *
 * A notice is not one deadline and one reply. It is a matter: several
 * submissions, each with its own date and its own acknowledgement; hearings
 * that get put off and have to be counted because the law caps how often;
 * and limitation dates that do not come from the notice at all but from the
 * statute behind it.
 *
 * Everything here is pure, and the one rule it obeys throughout is
 * CLAUDE.md rule 8: **a limitation date appears only when a partner has
 * confirmed the rule it comes from.** An unconfirmed rule is shown as words
 * and a section, never as a date, because a date gets diarised.
 */

/**
 * The dates the law puts on this matter.
 *
 * @param {any} notice
 * @param {Array<{kind: string, key: string, confirmedAt?: Date|null}>} confirmations
 * @returns {Array<{key: string, text: string, cite: string, date: Date|null,
 *   confirmed: boolean, why: string, adjournmentCap?: number}>}
 */
export function lawClocks(notice, confirmations = []) {
  const entry = NOTICE_KINDS[notice?.kind];
  if (!entry) return [];

  const confirmed = new Set(
    confirmations
      .filter((row) => row.confirmedAt && row.kind === notice.kind)
      .map((row) => row.key),
  );

  return entry.rules.map((rule) => {
    const isConfirmed = confirmed.has(rule.key);
    const basis = rule.offset ? notice[rule.offset.from] : null;

    /**
     * Three different nulls, and the screen says which: the rule is not a
     * clock at all, the firm has not confirmed it, or the date it counts
     * from has not happened yet. Collapsing them into "—" is how somebody
     * comes to think a limitation date was computed when it was not.
     */
    let date = null;
    let why = "";

    if (!rule.offset) {
      why = "A rule to act on, not a date to count.";
    } else if (!isConfirmed) {
      why = "A partner has not confirmed this rule, so no date is shown.";
    } else if (!basis) {
      why = `Needs ${describeBasis(rule.offset.from)} before it can be worked out.`;
    } else {
      date = shiftDate(new Date(basis), rule.offset);
    }

    return {
      key: rule.key,
      text: rule.text,
      cite: rule.cite,
      date,
      confirmed: isConfirmed,
      why,
      ...(rule.adjournmentCap ? { adjournmentCap: rule.adjournmentCap } : {}),
    };
  });
}

/** What a rule counts from, in words. */
function describeBasis(field) {
  return (
    {
      annualReturnDue: "the annual return's due date for that year",
      servedOn: "the date the notice was served",
      noticeDate: "the date on the notice",
      orderDate: "the date of the order",
    }[field] ?? field
  );
}

/**
 * How many times a hearing has been put off, and whether the law allows
 * another.
 *
 * The count is arithmetic over the hearings and is always safe to show. The
 * **cap** is law, so it is shown only once the rule carrying it is
 * confirmed — until then the firm is told the count and told that nobody
 * has confirmed the limit.
 *
 * @param {any} notice
 * @param {Array<any>} clocks  from `lawClocks`
 */
export function adjournments(notice, clocks = []) {
  const used = (notice?.hearings ?? []).filter((h) => h.adjourned).length;
  const rule = clocks.find((clock) => clock.adjournmentCap);

  if (!rule || !rule.confirmed) {
    return {
      used,
      cap: null,
      left: null,
      warning: rule
        ? `${used} ${used === 1 ? "adjournment" : "adjournments"} so far. The limit (${rule.cite}) has not been confirmed by a partner, so nothing here says whether another is allowed.`
        : "",
    };
  }

  const left = Math.max(0, rule.adjournmentCap - used);
  return {
    used,
    cap: rule.adjournmentCap,
    left,
    warning:
      left === 0
        ? `All ${rule.adjournmentCap} adjournments have been used (${rule.cite}). Asking for another is not a thing to rely on.`
        : left === 1
          ? `One adjournment left (${rule.cite}).`
          : "",
  };
}

/**
 * The next thing the firm owes on this matter, or null.
 *
 * Deliberately **only** dates the department itself put on the notice: a
 * submission's due date, or a hearing. A limitation date is the firm's own
 * last chance rather than a thing it owes this week, and mixing the two
 * would put "appeal by March" at the top of somebody's Monday.
 *
 * @param {any} notice
 * @param {Date} [now]
 */
export function nextDue(notice, now = new Date()) {
  const candidates = [
    ...(notice?.submissions ?? [])
      .filter((row) => !row.filedOn && row.dueDate)
      .map((row) => ({ what: row.type, date: new Date(row.dueDate) })),
    ...(notice?.hearings ?? [])
      .filter((row) => !row.heldOn && row.on)
      .map((row) => ({ what: "Hearing", date: new Date(row.on) })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const next = candidates[0];
  if (!next) return null;
  return { ...next, days: daysUntil(next.date, now) };
}

/** Is this matter past something it owed? */
export function isOverdue(notice, now = new Date()) {
  const today = startOfISTDay(now).getTime();
  return (notice?.submissions ?? []).some(
    (row) =>
      !row.filedOn && row.dueDate && new Date(row.dueDate).getTime() < today,
  );
}

/**
 * One timeline out of the several lists a matter keeps.
 *
 * The matter's own story is spread across submissions, hearings and the
 * notice's own dates, and reading three lists side by side to work out what
 * happened is what a merged timeline saves. Nothing is stored for this: a
 * second copy of the same events is a second copy to get out of step.
 *
 * @param {any} notice
 * @returns {Array<{at: Date, what: string, detail: string, kind: string}>}
 */
export function timeline(notice) {
  const out = [];

  if (notice?.noticeDate) {
    out.push({
      at: new Date(notice.noticeDate),
      what: "Notice dated",
      detail: notice.section || notice.kind || "",
      kind: "notice",
    });
  }
  if (notice?.servedOn) {
    out.push({
      at: new Date(notice.servedOn),
      what: "Served",
      detail: notice.authority || "",
      kind: "notice",
    });
  }

  for (const row of notice?.submissions ?? []) {
    if (row.dueDate && !row.filedOn) {
      out.push({
        at: new Date(row.dueDate),
        what: `${row.type} due`,
        detail: row.note || "",
        kind: "due",
      });
    }
    if (row.filedOn) {
      out.push({
        at: new Date(row.filedOn),
        what: `${row.type} filed`,
        detail: row.ackNo ? `Acknowledgement ${row.ackNo}` : "",
        kind: "filed",
      });
    }
  }

  for (const row of notice?.hearings ?? []) {
    out.push({
      at: new Date(row.heldOn ?? row.on),
      what: row.heldOn
        ? row.adjourned
          ? "Hearing adjourned"
          : "Hearing held"
        : "Hearing listed",
      detail:
        [row.mode, row.attendedByName, row.outcome || row.adjournmentReason]
          .filter(Boolean)
          .join(" · ") || "",
      kind: row.adjourned ? "adjourned" : "hearing",
    });
  }

  if (notice?.orderDate) {
    out.push({
      at: new Date(notice.orderDate),
      what: "Order",
      detail: notice.orderNote || "",
      kind: "order",
    });
  }

  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/**
 * Is the paragraph for the client actually usable?
 *
 * The prototype's example is the standard to hold: "The department thinks
 * ₹48.6 lakh of cash deposited in 2018-19 was not explained. We reply by 27
 * October with your cash book and sales records. No payment is due now."
 * Three facts, no sections, no jargon. So this refuses the two things that
 * make such a paragraph useless to the person it is written for.
 *
 * @param {string} text
 */
export function checkPlainWords(text) {
  const words = String(text ?? "").trim();
  if (words.length < 40) {
    return {
      ok: false,
      error:
        "Too short to be useful. Say what they think, what we are doing about it, and whether any money is due now.",
    };
  }
  const jargon = words.match(
    /\bs\.\s?\d+|\bsection \d+|\bu\/s\b|DRC-\d+|ASMT-\d+/gi,
  );
  if (jargon) {
    return {
      ok: false,
      error: `This is for the client, so leave the section numbers out: ${[...new Set(jargon)].join(", ")}.`,
    };
  }
  return { ok: true };
}

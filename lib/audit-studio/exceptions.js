// @ts-check

/**
 * What happens to something an auditor finds (P3-13).
 *
 * The lifecycle is the point of this file, and the reason it is a lifecycle
 * rather than a tick is that an audit exception has two quite different
 * endings and they must not look alike:
 *
 *  - it is **adjusted** — proposed, accepted by management, posted in the
 *    books, and then **verified in the revised trial balance**. Verified is
 *    the only state that means the books now say something different
 *  - it is **explained** — somebody decided it is not an issue, and said
 *    why. That reason is the whole of the audit evidence for it, so it is
 *    mandatory
 *
 * And the state that matters most is **escalated**: an exception with the
 * partner, or waiting on the client, is still *unresolved*. The prototype
 * keeps those inside the unresolved list on purpose, because a file where
 * "with partner" counted as dealt with is a file where nothing is dealt
 * with.
 *
 * Everything here is pure.
 */

/** States where the firm is still waiting for something to happen. */
export const UNRESOLVED = [
  "Open",
  "Asked client",
  "With partner",
  "Proposed",
  "Accepted by management",
  "Posted",
];

/** The states of an exception that is being put right in the books. */
export const ADJUSTING = [
  "Proposed",
  "Accepted by management",
  "Posted",
  "Verified",
];

/** Every state. */
export const EXCEPTION_STATES = [
  "Open",
  "Asked client",
  "With partner",
  "Proposed",
  "Accepted by management",
  "Posted",
  "Verified",
  "Declined by management",
  "Explained",
];

export const RISKS = ["Low", "Medium", "High"];

/**
 * Where each state may go next, and what the move is called on the button.
 *
 * Note what `Posted` does **not** do: it does not finish. The books have
 * been changed and nobody has checked the change, which is a different
 * thing from the change being right.
 */
const MOVES = {
  Open: [
    ["ask", "Asked client", "Ask the client"],
    ["escalate", "With partner", "Put it to the partner"],
    ["propose", "Proposed", "Propose an adjustment"],
    ["explain", "Explained", "It is not an issue"],
  ],
  "Asked client": [
    ["reply", "Open", "The client has replied — decide again"],
    ["escalate", "With partner", "Put it to the partner"],
  ],
  "With partner": [
    ["propose", "Proposed", "Partner: propose an adjustment"],
    ["explain", "Explained", "Partner: it is not an issue"],
  ],
  Proposed: [
    ["accept", "Accepted by management", "Management accepted it"],
    ["decline", "Declined by management", "Management declined it"],
  ],
  "Accepted by management": [["post", "Posted", "Posted in the books"]],
  Posted: [["verify", "Verified", "Verified in the revised trial balance"]],
  "Declined by management": [
    ["escalate", "With partner", "Put it to the partner"],
    ["explain", "Explained", "Accepted as not an issue"],
  ],
  Verified: [],
  Explained: [],
};

/** What this exception may do next, for the buttons. */
export function movesFrom(state) {
  return (MOVES[state] ?? []).map(([action, to, label]) => ({
    action,
    to,
    label,
  }));
}

/** Is this one still waiting on somebody? */
export function isUnresolved(exception) {
  return UNRESOLVED.includes(exception?.state);
}

/**
 * Move an exception along.
 *
 * Two moves demand words and neither is negotiable: an explanation is the
 * audit evidence for *not* doing something, and a decline by management is
 * the fact the report may have to carry.
 *
 * @param {any} exception
 * @param {string} action
 * @param {{ reason?: string, amountPaise?: number }} input
 * @param {{ id: string, name: string, role: string }} actor
 * @param {Date} [now]
 */
export function moveException(
  exception,
  action,
  input,
  actor,
  now = new Date(),
) {
  const move = movesFrom(exception?.state).find((row) => row.action === action);
  if (!move) {
    return {
      ok: false,
      error: `Nothing takes this from ${exception?.state ?? "nowhere"} by that route.`,
    };
  }

  const reason = String(input?.reason ?? "").trim();

  if (move.to === "Explained" && reason.length < 10) {
    return {
      ok: false,
      error:
        "Say why it is not an issue. That reason is the whole of the audit evidence for leaving it, so it has to stand on its own.",
    };
  }
  if (move.to === "Declined by management" && reason.length < 10) {
    return {
      ok: false,
      error:
        "Record what management said. If the report has to carry this, these are the words it carries.",
    };
  }
  if (move.to === "Asked client" && reason.length < 5) {
    return { ok: false, error: "Say what is being asked for." };
  }

  /**
   * Only a partner closes one by explaining it. Proposing an adjustment is
   * ordinary audit work; deciding that something found is not an issue is a
   * judgement the firm signs for.
   */
  if (move.to === "Explained" && actor.role !== "partner") {
    return {
      ok: false,
      error:
        "Only a partner can close an exception by explaining it. Put it to the partner instead.",
    };
  }

  const from = exception.state;
  exception.state = move.to;
  if (reason) exception.lastReason = reason;
  if (move.to === "Explained") exception.explanation = reason;
  if (move.to === "Declined by management") exception.declineReason = reason;
  if (typeof input?.amountPaise === "number" && move.to === "Proposed") {
    exception.amountPaise = input.amountPaise;
  }

  exception.trail = exception.trail ?? [];
  exception.trail.push({
    at: now,
    from,
    to: move.to,
    byId: actor.id,
    byName: actor.name,
    reason,
  });

  return { ok: true, from, to: move.to };
}

/**
 * The four numbers a partner reads off an audit file.
 *
 * `adjustmentsPaise` counts only the ones actually going into the books —
 * proposed through verified. An explained exception has no amount in the
 * accounts by definition, and counting it would make the unadjusted
 * differences schedule disagree with itself.
 *
 * @param {Array<any>} exceptions
 */
export function exceptionCounts(exceptions = []) {
  const open = exceptions.filter(isUnresolved);
  return {
    open: open.length,
    highOpen: open.filter((row) => row.risk === "High").length,
    resolved: exceptions.length - open.length,
    adjustmentsPaise: exceptions
      .filter((row) => ADJUSTING.includes(row.state))
      .reduce((sum, row) => sum + (row.amountPaise ?? 0), 0),
    /** Differences nobody is adjusting, which the file has to carry. */
    unadjustedPaise: exceptions
      .filter((row) =>
        ["Explained", "Declined by management"].includes(row.state),
      )
      .reduce((sum, row) => sum + (row.amountPaise ?? 0), 0),
  };
}

/** Open exceptions per area, for the working-paper index. */
export function openByArea(exceptions = []) {
  const counts = new Map();
  for (const exception of exceptions) {
    if (!isUnresolved(exception)) continue;
    const key = exception.area ?? "";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * May the file move to the next stage?
 *
 * The one gate worth having at this step: nothing reaches **Report + UDIN**
 * while an exception is unresolved. A signed report over an open exception
 * is the thing a peer review finds, and it is also simply not true — the
 * report says the auditor has obtained sufficient evidence.
 *
 * @param {string} to
 * @param {Array<any>} exceptions
 */
export function checkStageMove(to, exceptions = []) {
  if (to !== "Report + UDIN" && to !== "File closure") return { ok: true };

  const open = exceptions.filter(isUnresolved);
  if (open.length === 0) return { ok: true };

  return {
    ok: false,
    error: `${open.length} ${open.length === 1 ? "exception is" : "exceptions are"} still unresolved. They are either adjusted and verified, or explained with a reason, before a report is signed.`,
  };
}

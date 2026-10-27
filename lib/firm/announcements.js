// @ts-check

import { startOfISTDay } from "../dates.js";

/**
 * Announcements: one thing said once to a named audience (P3-17b).
 *
 * Pure. Who an announcement reaches, whether it is still live, and who has
 * not acknowledged it — the queries and the writes live in the actions.
 *
 * Two rules carry this:
 *
 *  - **an announcement never blocks anything.** Acknowledgement is a record
 *    that somebody read it, not a gate in front of their work. A system
 *    that locks the screen until you tick a box teaches people to tick
 *    boxes.
 *  - **the audience is a rule, not a list of names.** "Everyone", one
 *    branch, or one role — so somebody joining the firm tomorrow is inside
 *    an announcement posted today, and a list of forty names does not have
 *    to be maintained to stay true.
 */

/** The three audiences. Individuals are deliberately not one of them. */
export const AUDIENCES = ["everyone", "branch", "role"];

export const AUDIENCE_LABELS = {
  everyone: "Everybody at the firm",
  branch: "One office",
  role: "One role",
};

/**
 * Is it live on this day? Both ends count, and `until` may be absent —
 * which means it stays up until somebody takes it down.
 *
 * @param {{from: Date|string, until?: Date|string|null, deletedAt?: Date|null}} row
 * @param {Date} [now]
 */
export function isLive(row, now = new Date()) {
  if (!row || row.deletedAt) return false;
  const today = startOfISTDay(now).getTime();
  if (startOfISTDay(new Date(row.from)).getTime() > today) return false;
  if (!row.until) return true;
  return startOfISTDay(new Date(row.until)).getTime() >= today;
}

/**
 * Does it reach this person?
 *
 * @param {{audience: string, branchId?: any, role?: string}} row
 * @param {{id?: string, role: string, branchIds?: string[]}} person
 */
export function reaches(row, person) {
  if (!row || !person) return false;
  switch (row.audience) {
    case "everyone":
      return true;
    case "branch":
      return (person.branchIds ?? []).some(
        (id) => String(id) === String(row.branchId ?? ""),
      );
    case "role":
      return person.role === row.role;
    default:
      // an audience nobody recognises reaches nobody, rather than everybody
      return false;
  }
}

/**
 * @param {{acknowledgements?: Array<{userId: any}>}} row
 * @param {string} userId
 */
export function ackedBy(row, userId) {
  return (row?.acknowledgements ?? []).some(
    (ack) => String(ack.userId) === String(userId),
  );
}

/**
 * Who it reaches and has not acknowledged, so a partner can ask them
 * rather than asking everybody.
 *
 * @param {any} row
 * @param {Array<{_id?: any, id?: any, name: string, role: string, branchIds?: any[]}>} people
 */
export function pending(row, people) {
  if (!row?.needsAck) return [];
  return people.filter((person) => {
    const id = String(person._id ?? person.id);
    return (
      reaches(row, {
        id,
        role: person.role,
        branchIds: (person.branchIds ?? []).map(String),
      }) && !ackedBy(row, id)
    );
  });
}

/**
 * What is wrong with a draft announcement.
 *
 * @param {object} input
 * @param {string} input.title
 * @param {string} input.body
 * @param {string} input.audience
 * @param {string} [input.branchId]
 * @param {string} [input.role]
 * @param {Date|string} input.from
 * @param {Date|string} [input.until]
 * @returns {string|null}
 */
export function checkAnnouncement({
  title,
  body,
  audience,
  branchId,
  role,
  from,
  until,
}) {
  if (String(title ?? "").trim().length < 4) {
    return "Give it a title. It is the line that appears in everybody's inbox.";
  }
  if (String(body ?? "").trim().length < 10) return "Write the announcement.";
  if (!AUDIENCES.includes(audience)) return "Choose who it is for.";
  if (audience === "branch" && !branchId) return "Choose which office.";
  if (audience === "role" && !role) return "Choose which role.";

  const start = new Date(from);
  if (Number.isNaN(start.valueOf())) return "That start date is not a date.";
  if (until) {
    const end = new Date(until);
    if (Number.isNaN(end.valueOf())) return "That end date is not a date.";
    if (startOfISTDay(end).getTime() < startOfISTDay(start).getTime()) {
      return "It would come down before it goes up.";
    }
  }
  return null;
}

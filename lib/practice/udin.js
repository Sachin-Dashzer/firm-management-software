// @ts-check

import Udin, { UDIN_PATTERN } from "../../models/Udin.js";

/**
 * Keeping the UDIN register and the engagements in step (P2-7).
 *
 * There are two doors onto the same fact — the filing panel on an engagement
 * and the register screen — and before this there was one field and no
 * register at all. The rule is: **the register is the record, the
 * engagement's field is a copy of it**, and both are written in the same
 * transaction as the audit entry, so neither can exist without the other.
 *
 * Everything here takes a session. A UDIN written outside a transaction is
 * exactly the kind of half-change CLAUDE.md rule 2 exists to stop.
 */

export { UDIN_PATTERN };

/**
 * Is this the shape the ICAI issues? Checked, not validated: only the portal
 * can say whether a number is real.
 *
 * @param {string} udin
 * @returns {{ok: true}|{ok: false, error: string}}
 */
export function checkUdinShape(udin) {
  if (!UDIN_PATTERN.test(udin)) {
    return { ok: false, error: "A UDIN is 18 letters and digits." };
  }
  return { ok: true };
}

/**
 * Record a UDIN against an engagement, or move it onto one.
 *
 * Returns the register row. Refuses when the number is already recorded
 * against **different** work, naming it — that is the whole point of a
 * register, and the unique index behind it is what makes the refusal safe
 * when two people save at the same moment.
 *
 * @param {object} input
 * @param {string} input.udin
 * @param {any} input.engagement a loaded Engagement document
 * @param {{id: string, name: string}} input.actor
 * @param {{id: string, membershipNo?: string}|null} [input.member]
 * @param {string} [input.documentType] defaults to the service's own name
 * @param {Date} [input.generatedOn]
 * @param {import("mongoose").ClientSession} session
 */
export async function linkUdinToEngagement(
  { udin, engagement, actor, member = null, documentType, generatedOn },
  session,
) {
  const shape = checkUdinShape(udin);
  if (!shape.ok) return shape;

  const existing = await Udin.findOne({ udin }).session(session);

  if (existing) {
    const already = String(existing.engagementId ?? "");
    if (already && already !== String(engagement._id)) {
      return {
        ok: false,
        error: `That UDIN is already recorded against ${existing.documentType} for another engagement. A UDIN belongs to one document.`,
      };
    }

    // the same number, now being pinned to this engagement
    existing.engagementId = engagement._id;
    existing.clientId = engagement.clientId;
    existing.branchId = engagement.branchId;
    existing.updatedBy = actor.id;
    await existing.save({ session });
    return { ok: true, row: existing };
  }

  const [row] = await Udin.create(
    [
      {
        udin,
        clientId: engagement.clientId,
        engagementId: engagement._id,
        branchId: engagement.branchId,
        memberId: member?.id ?? null,
        membershipNo: member?.membershipNo ?? "",
        documentType:
          documentType ||
          engagement.templateSnapshot?.name ||
          "Signed document",
        generatedOn: generatedOn ?? new Date(),
        createdBy: actor.id,
        updatedBy: actor.id,
      },
    ],
    { session },
  );

  return { ok: true, row };
}

/**
 * The engagement's UDIN has been cleared on the filing panel.
 *
 * The register row stays: a UDIN generated on the portal exists whether or
 * not we still think it belongs here, and deleting the row would lose the
 * only record the firm has of having signed something. It is unlinked, with
 * a note saying so.
 *
 * @param {any} engagement
 * @param {{id: string, name: string}} actor
 * @param {import("mongoose").ClientSession} session
 */
export async function unlinkUdinFromEngagement(engagement, actor, session) {
  const row = await Udin.findOne({ engagementId: engagement._id }).session(
    session,
  );
  if (!row) return null;

  row.engagementId = null;
  row.note = [row.note, `Unlinked from ${engagement.code} by ${actor.name}`]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 500);
  row.updatedBy = actor.id;
  await row.save({ session });
  return row;
}

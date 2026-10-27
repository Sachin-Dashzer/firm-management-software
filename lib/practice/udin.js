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
 * The same number, checked against the person signing and the day they are
 * signing it (P3-15).
 *
 * A UDIN is not an opaque string. Its first two digits are the year it was
 * generated and **characters 3 to 8 are the member's own registration
 * number**, so a number pasted from last year's certificate, or from a
 * different partner's, is catchable here rather than by the ICAI portal
 * after the certificate has gone out.
 *
 * This is a *shape* check and says so: only the portal knows whether a
 * well-formed number was ever issued. The message says that too, because a
 * green tick that means "the format is right" and reads as "this is valid"
 * is worse than no tick.
 *
 * @param {string} udin
 * @param {{ membershipNo?: string, name?: string }|null} member
 * @param {Date} [signedOn]
 * @returns {{ ok: boolean, error?: string, note?: string }}
 */
export function checkUdinForMember(udin, member, signedOn = new Date()) {
  const value = String(udin ?? "")
    .trim()
    .toUpperCase();
  if (!value) return { ok: false, error: "No UDIN entered." };

  const shape = checkUdinShape(value);
  if (!shape.ok) {
    return {
      ok: false,
      error: `${shape.error} This one is ${value.length}.`,
    };
  }

  /**
   * Year, then the member's number, then the ICAI's own six, then four
   * digits. The register's own pattern only counts the characters, which is
   * why a number for the wrong member used to go in unremarked.
   */
  if (!/^\d{8}[A-Z0-9]{6}\d{4}$/.test(value)) {
    return {
      ok: false,
      error:
        "A UDIN reads as the two-digit year, then the six-digit membership number, then six letters or digits, then four digits.",
    };
  }

  const registration = String(member?.membershipNo ?? "").trim();
  if (registration && value.slice(2, 8) !== registration) {
    return {
      ok: false,
      error: `Characters 3 to 8 are ${value.slice(2, 8)}, and ${member?.name ?? "this member"}'s registration number is ${registration}. A UDIN belongs to the member who generated it.`,
    };
  }

  const year = String(signedOn.getFullYear()).slice(2);
  if (value.slice(0, 2) !== year) {
    return {
      ok: false,
      error: `This UDIN starts ${value.slice(0, 2)}, so it was generated in 20${value.slice(0, 2)} rather than ${signedOn.getFullYear()}. Generate one for this signing.`,
    };
  }

  if (!registration) {
    return {
      ok: true,
      note: "The shape is right. Nobody has recorded this member's registration number, so characters 3 to 8 could not be checked — and only the ICAI portal can say whether the number was ever issued.",
    };
  }

  return {
    ok: true,
    note: "The shape and the membership number match. Confirm it on the ICAI portal before the document leaves the office.",
  };
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

/**
 * Record a certificate's UDIN in the register (P3-15).
 *
 * The register is the record (see the note at the top of this file), and
 * before this a certificate's number lived only on the certificate — so
 * "what have we signed this year" would have answered with the engagements
 * and quietly left the certificates out. It is written in the same
 * transaction as the signature.
 *
 * The duplicate check is across **everything** the firm has signed, not
 * just across certificates, because that is what a UDIN identifying one
 * document means.
 *
 * @param {object} input
 * @param {string} input.udin
 * @param {any} input.certificate a loaded Certificate document
 * @param {{id: string, name: string}} input.actor
 * @param {{membershipNo?: string}|null} [input.member]
 * @param {import("mongoose").ClientSession} session
 */
export async function linkUdinToCertificate(
  { udin, certificate, actor, member = null },
  session,
) {
  const shape = checkUdinShape(udin);
  if (!shape.ok) return shape;

  const existing = await Udin.findOne({ udin }).session(session);
  if (existing) {
    return {
      ok: false,
      error: `That UDIN is already in the register against ${existing.documentType}. A UDIN belongs to one document.`,
    };
  }

  const [row] = await Udin.create(
    [
      {
        udin,
        clientId: certificate.clientId,
        // a certificate is the register's own case for a row with no engagement
        engagementId: certificate.engagementId ?? null,
        branchId: certificate.branchId,
        memberId: actor.id,
        membershipNo: member?.membershipNo ?? "",
        documentType: `${certificate.typeName} · ${certificate.number}`,
        generatedOn: new Date(),
        createdBy: actor.id,
        updatedBy: actor.id,
      },
    ],
    { session },
  );

  return { ok: true, row };
}

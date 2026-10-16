// @ts-check

import Client from "../../models/Client.js";

/**
 * Duplicate and conflict checking on PAN, GSTIN and mobile number (spec
 * section 3), run before a lead is activated.
 *
 * It reports rather than blocks: two family members genuinely share a mobile
 * number, and the same PAN appearing twice is a mistake worth a hard stop.
 * So PAN and GSTIN matches are `blocking`, a shared mobile is a warning.
 *
 * Deleted clients are included deliberately: a PAN sitting on a soft-deleted
 * record still occupies the unique index, and the person onboarding needs to
 * be told that rather than meeting a database error.
 *
 * @param {object} candidate
 * @param {string} [candidate.pan]
 * @param {{gstin: string}[]} [candidate.gstins]
 * @param {{mobile?: string}[]} [candidate.contacts]
 * @param {string} [candidate.legalName]
 * @param {string} [excludeId] the client being edited, which is not its own duplicate
 * @returns {Promise<{ blocking: object[], warnings: object[] }>}
 */
export async function findDuplicates(candidate, excludeId) {
  /** @type {object[]} */
  const blocking = [];
  /** @type {object[]} */
  const warnings = [];

  const not = excludeId ? { _id: { $ne: excludeId } } : {};
  const select = "code legalName tradeName status pan deletedAt";
  const options = { withDeleted: true };

  if (candidate.pan) {
    const matches = await Client.find(
      { ...not, pan: candidate.pan },
      select,
      options,
    ).lean();
    for (const match of matches) {
      blocking.push({
        field: "PAN",
        value: candidate.pan,
        client: match,
        message: match.deletedAt
          ? `PAN ${candidate.pan} belongs to ${match.legalName} (${match.code}), which was deleted. Restore that client instead of creating a new one.`
          : `PAN ${candidate.pan} is already on ${match.legalName} (${match.code}).`,
      });
    }
  }

  const gstins = (candidate.gstins ?? []).map((g) => g.gstin).filter(Boolean);
  if (gstins.length) {
    const matches = await Client.find(
      { ...not, "gstins.gstin": { $in: gstins } },
      select + " gstins.gstin",
      options,
    ).lean();
    for (const match of matches) {
      const shared = match.gstins
        .map((g) => g.gstin)
        .filter((g) => gstins.includes(g));
      blocking.push({
        field: "GSTIN",
        value: shared.join(", "),
        client: match,
        message: `GSTIN ${shared.join(", ")} is already on ${match.legalName} (${match.code}).`,
      });
    }
  }

  const mobiles = (candidate.contacts ?? [])
    .map((c) => c.mobile)
    .filter(Boolean);
  if (mobiles.length) {
    const matches = await Client.find(
      { ...not, "contacts.mobile": { $in: mobiles }, deletedAt: null },
      select + " contacts.mobile contacts.name",
      options,
    ).lean();
    for (const match of matches) {
      warnings.push({
        field: "Mobile",
        value: mobiles.join(", "),
        client: match,
        message: `${match.legalName} (${match.code}) has the same mobile number. Fine for a family group — check it is not the same client twice.`,
      });
    }
  }

  // a near-identical name is worth a glance even with different identifiers
  if (candidate.legalName && candidate.legalName.length > 5) {
    const escaped = candidate.legalName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = await Client.find(
      { ...not, legalName: new RegExp(`^${escaped}$`, "i"), deletedAt: null },
      select,
      options,
    ).lean();
    for (const match of matches) {
      warnings.push({
        field: "Name",
        value: candidate.legalName,
        client: match,
        message: `${match.legalName} (${match.code}) already has that exact name.`,
      });
    }
  }

  return { blocking, warnings };
}

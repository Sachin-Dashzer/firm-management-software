// @ts-check

import { TIER_OF } from "../services/catalog.js";

/**
 * Who may issue a document, and when (P2-8b).
 *
 * A draft is a working paper: anybody who may generate documents for that
 * client makes one, it is watermarked, and it re-reads live data every time
 * it is opened. **Final** is a different act — it is the firm's letter, over
 * the firm's name — so three things have to hold, and all three are checked
 * on the server (CLAUDE.md rule 1).
 */

/**
 * The role a final needs, from the tier of the work it belongs to.
 *
 * It follows P2-4's sign-off rule rather than inventing a second ladder: if
 * only a partner may sign an A-tier job off, only a partner may issue the
 * letter that goes with it. A document with no engagement behind it — a
 * standalone certificate — is treated as A-tier, because nothing told us it
 * was routine.
 *
 * @param {string} level the service level L1 / L2 / L3, or "" for none
 * @returns {"partner"|"ca"}
 */
export function issuerFor(level) {
  return TIER_OF[level] === "A" || !level ? "partner" : "ca";
}

/**
 * @param {{role: string}} actor
 * @param {{verifiedAt?: Date|null, partnerOnly?: boolean, udinRequired?: boolean, name?: string}} template
 * @param {{level?: string, udin?: string}|null} engagement
 * @param {{gaps?: Array<{label: string}>}} resolved
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function checkIssue(actor, template, engagement, resolved = {}) {
  /**
   * An unapproved template cannot produce a signed document — the same rule
   * the due-date master follows for an unconfirmed rule (CLAUDE.md rule 8).
   * The starter templates are drafted wording, not the firm's words yet.
   */
  if (!template.verifiedAt) {
    return {
      ok: false,
      error:
        "This template has not been approved yet. A partner has to read it and approve the wording in Settings → Document templates before it can be issued.",
    };
  }

  const needed = template.partnerOnly
    ? "partner"
    : issuerFor(engagement?.level ?? "");
  if (needed === "partner" && actor.role !== "partner") {
    return { ok: false, error: "Only a partner issues this document." };
  }
  if (needed === "ca" && !["ca", "partner"].includes(actor.role)) {
    return { ok: false, error: "Only a CA or a partner issues a document." };
  }

  if (template.udinRequired && !(engagement?.udin ?? "").trim()) {
    return {
      ok: false,
      error:
        "This document needs a UDIN. Record it on the engagement's filing panel first.",
    };
  }

  const gaps = resolved.gaps ?? [];
  if (gaps.length) {
    return {
      ok: false,
      error: `Still missing: ${gaps.map((gap) => gap.label).join(", ")}. Fill these in on the record, then issue.`,
    };
  }

  return { ok: true };
}

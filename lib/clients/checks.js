// @ts-check

import {
  checkPAN,
  checkGSTIN,
  checkCIN,
  PAN_CHAR_FOR_ENTITY,
} from "../validators.js";
import { ENTITY_BY_KEY, entityLabel, panCharLabel } from "./entityTypes.js";

/**
 * The checks the firm runs before it accepts a client.
 *
 * Pure, so the same six rows can tick along under the master form as it is
 * typed (step 2) and be read back whole before accepting (step 5) — one
 * list, one wording, no chance of the two screens disagreeing.
 *
 * Only the first three can be decided from what has been typed. The
 * duplicate check, the group suggestion and the independence note need the
 * database, so they are handed in already answered.
 *
 * @typedef {"ok"|"warn"|"bad"|"idle"} CheckState
 * @typedef {{ key: string, label: string, state: CheckState, detail: string }} Check
 */

/** @type {(label: string) => Check} */
const idle = (label) => ({
  key: label,
  label,
  state: "idle",
  detail: "Not filled in yet",
});

/**
 * @param {object} input
 * @param {string} input.entityType
 * @param {string} [input.pan]
 * @param {string} [input.gstin]
 * @param {string} [input.cin]
 * @param {{ state: CheckState, detail: string } | null} [input.duplicate]
 * @param {{ state: CheckState, detail: string } | null} [input.group]
 * @param {{ state: CheckState, detail: string } | null} [input.independence]
 * @returns {Check[]}
 */
export function onboardingChecks({
  entityType,
  pan = "",
  gstin = "",
  cin = "",
  duplicate = null,
  group = null,
  independence = null,
}) {
  const config = ENTITY_BY_KEY[entityType];
  /** @type {Check[]} */
  const checks = [];

  // --- 1. the PAN, and whether its 4th character agrees with the entity ---
  if (!String(pan).trim()) {
    checks.push(idle("PAN format and type"));
  } else {
    const result = checkPAN(pan);
    const expected = PAN_CHAR_FOR_ENTITY[entityType] ?? "";
    if (!result.ok) {
      checks.push({
        key: "pan",
        label: "PAN format and type",
        state: "bad",
        detail: result.reason,
      });
    } else if (expected && !expected.includes(result.value[3])) {
      checks.push({
        key: "pan",
        label: "PAN format and type",
        state: "bad",
        // the most common paste error: the director's PAN on the company
        detail: `4th character "${result.value[3]}" is a ${result.holderType}; ${entityLabel(entityType)} expects ${panCharLabel(expected)}`,
      });
    } else {
      checks.push({
        key: "pan",
        label: "PAN format and type",
        state: "ok",
        detail: `4th character "${result.value[3]}" matches ${entityLabel(entityType)}`,
      });
    }
  }

  // --- 2. the GSTIN check digit, and the PAN buried inside it ---
  if (!String(gstin).trim()) {
    checks.push(idle("GSTIN check digit and PAN match"));
  } else {
    const result = checkGSTIN(gstin);
    const typedPan = checkPAN(pan);
    if (!result.ok) {
      checks.push({
        key: "gstin",
        label: "GSTIN check digit and PAN match",
        state: "bad",
        detail: result.reason,
      });
    } else if (typedPan.ok && result.pan !== typedPan.value) {
      checks.push({
        key: "gstin",
        label: "GSTIN check digit and PAN match",
        state: "bad",
        detail: `Check digit valid, but the PAN inside it is ${result.pan}, not ${typedPan.value}`,
      });
    } else {
      checks.push({
        key: "gstin",
        label: "GSTIN check digit and PAN match",
        state: "ok",
        detail: typedPan.ok
          ? `Check digit valid; PAN inside GSTIN matches. ${result.state}`
          : `Check digit valid. ${result.state}`,
      });
    }
  }

  // --- 3. the CIN or LLPIN, for the entities that have one ---
  const wantsCin = (config?.fields ?? []).some((field) => field.name === "cin");
  if (wantsCin) {
    if (!String(cin).trim()) {
      checks.push(idle("CIN format"));
    } else {
      const result = checkCIN(cin);
      checks.push({
        key: "cin",
        label: "CIN format",
        state: result.ok ? "ok" : "bad",
        detail: result.ok
          ? result.kind === "LLPIN"
            ? "LLPIN looks right"
            : "21-character CIN looks right"
          : result.reason,
      });
    }
  }

  // --- 4, 5, 6: the three the database answers ---
  checks.push({
    key: "duplicate",
    label: "Duplicate check",
    state: duplicate?.state ?? "idle",
    detail: duplicate?.detail ?? "Runs when the PAN or GSTIN is filled in",
  });

  if (group) {
    checks.push({ key: "group", label: "Group link", ...group });
  }
  if (independence) {
    checks.push({
      key: "independence",
      label: "Conflict and independence",
      ...independence,
    });
  }

  return checks;
}

/**
 * Is anything wrong enough to stop here? Idle is not wrong.
 *
 * **The duplicate check is deliberately excluded.** A clash with an existing
 * client is a judgement, not a malformed field: sometimes it really is two
 * companies of the same family with the same contact number. Blocking the
 * wizard on it would leave the firm with no way to say "I have looked, and
 * these are different" — so the duplicate is shown in red here, stops the
 * creation on the last step, and is overridden there by a person who ticks
 * to say so. The server enforces the same rule either way.
 */
export function checksPass(checks) {
  return !checks.some(
    (check) => check.state === "bad" && check.key !== "duplicate",
  );
}

// @ts-check

import {
  checkPAN,
  checkGSTIN,
  checkCIN,
  checkEmail,
  checkMobile,
  PAN_CHAR_FOR_ENTITY,
} from "../validators.js";
import { readAmount } from "../money.js";
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
 * @param {string} [input.email]   the contact's, as typed
 * @param {string} [input.mobile]  the contact's, as typed
 * @param {Array<{name: string, fee?: string|number}>} [input.fees] what was
 *        typed against each ticked service
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
  email = "",
  mobile = "",
  fees = [],
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

  /**
   * The contact's email and mobile (QA 09-11-2026, #17).
   *
   * `zztest@` and `12345` went through onboarding untouched: the wizard
   * asked for them and checked neither, and the Potentials register —
   * which does check, with these same two functions — was the only place
   * in the app that caught a mistyped number. A wrong number on a client
   * record is found out on the day somebody needs to ring them.
   */
  const typedEmail = String(email).trim();
  if (typedEmail) {
    const result = checkEmail(typedEmail);
    checks.push({
      key: "email",
      label: "Contact email",
      state: result.ok ? "ok" : "bad",
      detail: result.ok ? "Looks like an address" : result.reason,
    });
  }

  const typedMobile = String(mobile).trim();
  if (typedMobile) {
    const result = checkMobile(typedMobile);
    checks.push({
      key: "mobile",
      label: "Contact mobile",
      state: result.ok ? "ok" : "bad",
      detail: result.ok ? "Ten digits, starts 6 to 9" : result.reason,
    });
  }

  /**
   * The fees agreed on the services step (QA 09-11-2026, #18).
   *
   * `-500`, `abc` and `99999999999` were all accepted, and the Checks step
   * said nothing about any of them. A fee is a number the client is told
   * and the firm later bills, so a bad one is not a cosmetic problem.
   * Blank is allowed: "to be agreed" is a real answer, and the quotation
   * says so out loud.
   */
  const badFees = [];
  for (const row of fees) {
    const typed = String(row?.fee ?? "").trim();
    if (!typed) continue;
    const read = readAmount(typed, { label: "The fee" });
    if (!read.ok) badFees.push(`${row.name}: ${read.reason.toLowerCase()}`);
  }
  if (fees.length > 0) {
    checks.push({
      key: "fees",
      label: "Fees agreed",
      state: badFees.length ? "bad" : "ok",
      detail: badFees.length
        ? badFees.join(" ")
        : "Every fee entered is an amount",
    });
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

// @ts-check

import { istParts } from "../dates.js";
import { hasCpeTarget } from "./profile.js";

/**
 * Totalling a member's CPE hours (P2-6).
 *
 * Pure, because this is the arithmetic somebody will quote to the ICAI. The
 * one judgement it refuses to make is whether the hours are *enough*: the
 * firm's target comes from the settings screen, and until a partner enters it
 * the answer is "nobody has said" — never "zero required" (CLAUDE.md rule 8).
 */

/**
 * Which CPE year a date falls in, as the firm counts them.
 *
 * @param {Date|string} on
 * @param {string} basis "calendar" (Jan–Dec) or "financial" (Apr–Mar)
 * @returns {string} e.g. "2026" or "2026-27"
 */
export function cpeYearOf(on, basis = "calendar") {
  const { year, month } = istParts(new Date(on));
  if (basis === "financial") {
    const start = month >= 4 ? year : year - 1;
    return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
  }
  return String(year);
}

/**
 * One member's log, folded into years, newest first.
 *
 * @param {Array<{on: Date|string, hours: number, kind?: string}>} entries
 * @param {{cpeYearBasis?: string, cpeTargetStructured?: number, cpeTargetUnstructured?: number}} firm
 * @returns {Array<{year: string, structured: number, unstructured: number, total: number, met: boolean|null, short: {structured: number, unstructured: number}}>}
 */
export function cpeByYear(entries = [], firm = {}) {
  const basis = firm.cpeYearBasis ?? "calendar";
  /** @type {Map<string, {structured: number, unstructured: number}>} */
  const years = new Map();

  for (const entry of entries) {
    const year = cpeYearOf(entry.on, basis);
    const row = years.get(year) ?? { structured: 0, unstructured: 0 };
    const kind = entry.kind === "unstructured" ? "unstructured" : "structured";
    row[kind] += Number(entry.hours) || 0;
    years.set(year, row);
  }

  const targetS = firm.cpeTargetStructured ?? 0;
  const targetU = firm.cpeTargetUnstructured ?? 0;
  const judged = hasCpeTarget(firm);

  return [...years.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, row]) => ({
      year,
      structured: round(row.structured),
      unstructured: round(row.unstructured),
      total: round(row.structured + row.unstructured),
      /**
       * `null` when the firm has not set a target. A screen must print that
       * as "not set" and never as a cross: an unanswered question is not a
       * failure, and showing it as one would have people chasing hours
       * nobody has asked them for.
       */
      met: judged
        ? row.structured >= targetS && row.unstructured >= targetU
        : null,
      short: {
        structured: round(Math.max(0, targetS - row.structured)),
        unstructured: round(Math.max(0, targetU - row.unstructured)),
      },
    }));
}

/** Half-hour credits add up to figures like 7.499999; one decimal is plenty. */
function round(hours) {
  return Math.round(hours * 10) / 10;
}

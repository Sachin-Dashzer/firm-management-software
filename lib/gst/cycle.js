// @ts-check

import { filingProgress } from "../engagements/milestones.js";

/**
 * Where a month's GST work has got to, across the whole cycle (P3-22b).
 *
 * P3-12 built the middle of the cycle — the workbook out, the workbook
 * back, the check, the correction loop, the indicative computation — and
 * said in so many words that the rest of it belongs to other steps: the
 * review and client-confirmation gates are P3-5, the filings are P3-1
 * milestones, the chasing is the P3-9 sweep. Nothing new is stored for this
 * board. Every stage below is **read off fields those steps already write**,
 * which is the only way a board over eleven clients can be trusted: there is
 * no second record of where a month stands that could disagree with the job
 * itself.
 *
 * The stage is decided from the far end backwards rather than as a chain,
 * because real work does not run in a straight line — a sheet can be
 * re-sent after a review, and the honest answer to "where is this" is the
 * furthest it has actually got.
 */

/** @typedef {{ key: string, label: string, hint: string }} CycleStage */

/** The eight stages, in the order the month runs. */
export const GST_CYCLE_STAGES = /** @type {CycleStage[]} */ ([
  {
    key: "awaiting-data",
    label: "Waiting for data",
    hint: "The client has not sent a workbook for this month yet.",
  },
  {
    key: "corrections",
    label: "Corrections asked for",
    hint: "The sheet came back with problems and the client has it again.",
  },
  {
    key: "data-in",
    label: "Data in",
    hint: "A workbook is here and nobody has computed from it yet.",
  },
  {
    key: "computed",
    label: "Computed, for review",
    hint: "The indicative figures are worked out and a CA has to look.",
  },
  {
    key: "reviewed",
    label: "Reviewed, client to confirm",
    hint: "Approved inside the firm; the client has not confirmed the tax.",
  },
  {
    key: "confirmed",
    label: "Confirmed, to file",
    hint: "The client has confirmed the figures. Nothing is filed yet.",
  },
  {
    key: "part-filed",
    label: "Part filed",
    hint: "One return is in and another is still owing.",
  },
  {
    key: "filed",
    label: "Filed",
    hint: "Every return for the month is in.",
  },
]);

/** Where each stage sits in the order, by key. */
export const STAGE_INDEX = Object.fromEntries(
  GST_CYCLE_STAGES.map((stage, index) => [stage.key, index]),
);

/**
 * What a GST service's code looks like. Also the query the board filters
 * with, so the rows it lists and the panel the engagement screen shows are
 * decided by one expression rather than two that drift.
 */
export const GST_CODE = /GSTR|GST/i;

/**
 * Is this GST work?
 *
 * The same test the engagement screen uses to decide whether to show the
 * GST panel at all (P3-12).
 *
 * @param {any} engagement
 */
export function isGstWork(engagement) {
  return GST_CODE.test(engagement?.templateSnapshot?.code ?? "");
}

/**
 * The stage one engagement's month has reached.
 *
 * @param {any} engagement
 * @returns {CycleStage & { index: number }}
 */
export function cycleStage(engagement) {
  const prep = engagement?.gstPrep ?? null;
  const filed = filingProgress(engagement);

  const key = (() => {
    if (filed === "all") return "filed";
    if (filed === "part") return "part-filed";
    if (engagement?.clientConfirmation?.when) return "confirmed";
    if (engagement?.review?.approvedAt) return "reviewed";
    if (prep?.computedAt) return "computed";

    /**
     * Sent back *after* the last upload means the ball is with the client;
     * sent back before it means they answered and this is the answer.
     */
    if (prep?.sentBackAt && prep?.uploadedAt) {
      return new Date(prep.sentBackAt) > new Date(prep.uploadedAt)
        ? "corrections"
        : "data-in";
    }
    if (prep?.sentBackAt) return "corrections";
    if (prep?.uploadedAt) return "data-in";
    return "awaiting-data";
  })();

  const stage = GST_CYCLE_STAGES[STAGE_INDEX[key]];
  return { ...stage, index: STAGE_INDEX[key] };
}

/**
 * How many clients sit at each stage, for the strip across the top.
 *
 * @param {any[]} engagements
 * @returns {Array<CycleStage & { index: number, count: number }>}
 */
export function cycleTally(engagements) {
  const counts = new Map();
  for (const engagement of engagements) {
    const stage = cycleStage(engagement);
    counts.set(stage.key, (counts.get(stage.key) ?? 0) + 1);
  }
  return GST_CYCLE_STAGES.map((stage, index) => ({
    ...stage,
    index,
    count: counts.get(stage.key) ?? 0,
  }));
}

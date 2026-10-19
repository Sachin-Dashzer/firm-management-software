// @ts-check

import { addWorkingDays } from "../dates.js";

/**
 * Build the engagement an engagement is created from: the template copied in,
 * not referred to (spec section 13).
 *
 * Kept free of the database so it can be tested on its own and reused by the
 * recurring generator in Step 7, which creates the same thing without anyone
 * filling in a form. The caller adds the code and writes it.
 *
 * @param {object} input
 * @param {any} input.template    the ServiceTemplate, as a plain object
 * @param {any} input.client      the Client, as a plain object
 * @param {{code: string, label: string, start: Date, end: Date}} input.period
 * @param {string|null} [input.assigneeId]
 * @param {string|null} [input.reviewerId]
 * @param {number} [input.feePaise]
 * @param {string} [input.priority]
 * @param {Date} [input.now]      when the clock starts, for the internal due date
 * @returns {Record<string, any>}
 */
export function buildEngagement({
  template,
  client,
  period,
  assigneeId = null,
  reviewerId = null,
  feePaise,
  priority = "Normal",
  now = new Date(),
}) {
  return {
    clientId: client._id,
    serviceTemplateId: template._id,
    branchId: client.branchId,

    period: period.code,
    periodLabel: period.label,
    periodStart: period.start,
    periodEnd: period.end,

    status: "Scheduled",
    priority,
    assigneeId,
    reviewerId,

    // the statutory date comes from the due-date master in Step 7; until
    // then it stays empty rather than being guessed (CLAUDE.md rule 8)
    statutoryDue: null,
    internalDue:
      typeof template.turnaroundDays === "number"
        ? addWorkingDays(now, template.turnaroundDays)
        : null,

    feePaise: feePaise ?? template.defaultFeePaise ?? 0,
    billingStatus: "Unbilled",

    // copies, so catalog edits never reach work already under way
    tasks: (template.steps ?? []).map((step) => ({
      name: step.name,
      assigneeId: null,
      done: false,
    })),
    checklist: (template.checklist ?? []).map((item) => ({
      name: item.name,
      side: item.side,
      mandatory: item.mandatory !== false,
      status: "Pending",
    })),
    reviewChecklist: defaultReviewChecklist(template),
    reworkCount: 0,

    statusHistory: [],

    templateSnapshot: {
      name: template.name,
      code: template.code,
      category: template.category,
      version: template.version ?? 1,
      level: template.level,
      minExecRole: template.minExecRole,
      minReviewRole: template.minReviewRole,
      recurrence: template.recurrence,
      turnaroundDays: template.turnaroundDays ?? null,
      turnaroundNote: template.turnaroundNote ?? "",
      udinRequired: Boolean(template.udinRequired),
      sac: template.sac ?? "",
      gstRate: template.gstRate ?? 18,
      snapshotAt: now,
    },
  };
}

/**
 * What the reviewer ticks before signing off (spec section 5).
 *
 * The firm has not given us a review checklist per service, so this is the
 * general one every engagement gets; a UDIN line is added where the template
 * requires one. Per-service review checklists can be added to the catalog
 * later if the firm wants them.
 */
function defaultReviewChecklist(template) {
  const items = [
    "Figures agreed to the client's records",
    "Prior period compared and differences explained",
    "Mandatory client documents received and verified",
    "Working papers filed",
  ];
  if (template.udinRequired) items.push("UDIN generated and recorded");
  return items.map((name) => ({ name, checked: false }));
}

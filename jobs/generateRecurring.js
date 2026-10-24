// @ts-check

import ClientService from "../models/ClientService.js";
import ServiceTemplate from "../models/ServiceTemplate.js";
import Client from "../models/Client.js";
import Branch from "../models/Branch.js";
import Engagement from "../models/Engagement.js";
import User from "../models/User.js";
import DueDateRule from "../models/DueDateRule.js";
import { connectDB } from "../lib/db.js";
import { systemAudit } from "../lib/audit/system.js";
import { periodFor, parsePeriod } from "../lib/engagements/period.js";
import { buildEngagement } from "../lib/engagements/create.js";
import { checkAssignment } from "../lib/engagements/assign.js";
import { nextEngagementCode } from "../lib/engagements/code.js";
import { istInputDate } from "../lib/dates.js";
import {
  statutoryDueFor,
  internalTargetFor,
  generateFrom,
  GENERATE_LEAD_DAYS,
} from "../lib/compliance/dueDate.js";

/**
 * Create next period's recurring work before it is due (spec section 8),
 * so routine filings never depend on anyone remembering.
 *
 * Runs nightly. For every client signed up to a recurring service, it works
 * out the period coming up, asks the due-date master when it is due, and
 * creates the engagement a fortnight beforehand — assigned to whoever
 * normally does that work for that client.
 *
 * Two things it deliberately will not do:
 *
 *  - It will not invent a date. A service whose rule nobody has verified
 *    still gets its engagement created on schedule, but with the statutory
 *    date left empty and a note saying why. The work appears; the deadline
 *    waits for a person (CLAUDE.md rule 8).
 *  - It will not create the same engagement twice. The unique index on
 *    client + service + period is the backstop, and a duplicate is counted
 *    rather than treated as a failure.
 *
 * @param {{ now?: Date, limit?: number, leadDays?: number }} [options]
 */
export async function generateRecurring(options = {}) {
  await connectDB();

  const now = options.now ?? new Date();
  const limit = options.limit ?? 200;
  const leadDays = options.leadDays ?? GENERATE_LEAD_DAYS;

  const subscriptions = await ClientService.find({ active: true })
    .limit(limit)
    .lean();

  const created = [];
  const waiting = [];
  const unassigned = [];
  const skipped = [];

  // one read each, reused across every subscription on this pass
  const [templates, rules, branches] = await Promise.all([
    ServiceTemplate.find({}).lean(),
    DueDateRule.find({ active: true }).lean(),
    Branch.find({}).select("code").lean(),
  ]);
  const templateById = new Map(templates.map((t) => [String(t._id), t]));
  const ruleByService = new Map(rules.map((r) => [r.serviceCode, r]));
  const branchCode = new Map(branches.map((b) => [String(b._id), b.code]));

  for (const subscription of subscriptions) {
    const template = templateById.get(String(subscription.serviceTemplateId));
    if (!template || template.active === false) continue;
    if (template.recurrence === "one-time") continue;

    const client = await Client.findById(subscription.clientId).lean();
    if (!client || client.status !== "Active") continue;

    // the period that is coming up: the one after the current one
    const current = periodFor(template.recurrence, now);
    const next = periodFor(
      template.recurrence,
      new Date(current.end.getTime() + 43_200_000),
    );

    for (const period of [current, next]) {
      const rule = ruleByService.get(template.code);
      const due = statutoryDueFor(rule, period.code);

      // without a date, create as soon as the period itself has started;
      // with one, a fortnight before it falls
      const startFrom = due.date
        ? generateFrom(due.date, leadDays)
        : period.start;
      if (!startFrom || startFrom > now) continue;

      const exists = await Engagement.findOne({
        clientId: client._id,
        serviceTemplateId: template._id,
        period: period.code,
      })
        .select("_id")
        .lean();
      if (exists) continue;

      /**
       * The subscription's usual people were legal when somebody chose them
       * (`saveClientService` checks), but a default goes stale: the person is
       * demoted, or the service's level is raised to A-tier, and the row
       * still names somebody who may no longer do the work.
       *
       * So the generator checks before it assigns, and when the default no
       * longer qualifies it **creates the work unassigned and says why** —
       * the same discipline as an unconfirmed due date (rule 8). The job
       * appears on time; who does it waits for a person. Assigning somebody
       * who is not allowed to do the work would make every later check a lie.
       */
      const people = await loadRoles([
        subscription.defaultAssigneeId,
        subscription.defaultReviewerId,
      ]);
      const assignee = people.get(String(subscription.defaultAssigneeId ?? ""));
      const reviewer = people.get(String(subscription.defaultReviewerId ?? ""));
      const legal = checkAssignment(
        template,
        assignee ?? null,
        reviewer ?? null,
      );

      if (!legal.ok) {
        unassigned.push({
          client: client.code,
          service: template.code,
          period: period.code,
          why: legal.error,
        });
      }

      try {
        const engagement = await systemAudit(async (session) => {
          const fields = buildEngagement({
            template,
            client,
            period,
            assigneeId: legal.ok
              ? (subscription.defaultAssigneeId ?? null)
              : null,
            reviewerId: legal.ok
              ? (subscription.defaultReviewerId ?? null)
              : null,
            feePaise: subscription.feePaise || undefined,
            now,
          });

          const code = await nextEngagementCode(
            branchCode.get(String(client.branchId)) ?? "NOI",
            template.code,
            period.code,
            session,
          );

          const [doc] = await Engagement.create(
            [
              {
                ...fields,
                code,
                statutoryDue: due.date,
                // the statutory date governs the internal target when there
                // is one; the template's turnaround covers the rest
                internalDue: due.date
                  ? internalTargetFor(due.date)
                  : fields.internalDue,
                statusHistory: [
                  {
                    to: "Scheduled",
                    byName: "System",
                    reason: [
                      due.date
                        ? `created automatically, due ${istInputDate(due.date)}`
                        : `created automatically — ${due.why}`,
                      legal.ok ? null : `left unassigned — ${legal.error}`,
                    ]
                      .filter(Boolean)
                      .join("; "),
                  },
                ],
                createdBy: null,
                updatedBy: null,
              },
            ],
            { session },
          );
          return doc;
        });

        created.push({ code: engagement.code, dated: Boolean(due.date) });
        if (!due.date) waiting.push({ code: engagement.code, why: due.why });
      } catch (err) {
        // someone created it by hand a moment ago: not a failure
        if (err?.code === 11000) continue;
        skipped.push({
          client: client.code,
          service: template.code,
          period: period.code,
          error: err.message,
        });
      }
    }
  }

  return {
    created: created.length,
    withoutDate: waiting.length,
    withoutAssignee: unassigned.length,
    skipped,
    // named so the admin screen can say which rules are holding things up
    waiting: waiting.slice(0, 20),
    // and which subscriptions name somebody who may no longer do the work
    unassigned: unassigned.slice(0, 20),
  };
}

/**
 * The roles of the people a subscription names, so `checkAssignment` has
 * something to judge. One query a subscription, which is the price of not
 * assigning work to somebody who may not do it.
 *
 * @param {any[]} ids
 */
async function loadRoles(ids) {
  const wanted = ids.filter(Boolean).map(String);
  if (wanted.length === 0) return new Map();

  const rows = await User.find({ _id: { $in: wanted }, active: true })
    .select("name role")
    .lean();
  return new Map(
    rows.map((row) => [
      String(row._id),
      { id: String(row._id), name: row.name, role: row.role },
    ]),
  );
}

export default generateRecurring;

/** Periods are parsed often enough here to be worth re-exporting. */
export { parsePeriod };

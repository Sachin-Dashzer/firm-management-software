"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan, can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import Client from "@/models/Client";
import ServiceTemplate from "@/models/ServiceTemplate";
import ClientService from "@/models/ClientService";
import Engagement from "@/models/Engagement";
import Branch from "@/models/Branch";
import User from "@/models/User";
import DueDateRule from "@/models/DueDateRule";
import PeriodReason from "@/models/PeriodReason";
import { PERIOD_REASONS, PERIOD_REASON_LABELS } from "@/lib/compliance/reasons";
import { parsePeriod } from "@/lib/engagements/period";
import { periodsInYear, missingCells } from "@/lib/compliance/grid";
import { statutoryDueFor, internalTargetFor } from "@/lib/compliance/dueDate";
import { buildEngagement } from "@/lib/engagements/create";
import { checkAssignment } from "@/lib/engagements/assign";
import { buildMilestones } from "@/lib/engagements/milestones";
import { nextEngagementCode } from "@/lib/engagements/code";
import { clientListFilter } from "@/lib/access/clientAccess";
import { financialYearStart, istInputDate } from "@/lib/dates";

/** One click opens at most this many jobs; a function has sixty seconds. */
const CREATE_CAP = 50;

/**
 * What an empty cell on the compliance grid means (P3-9).
 *
 * Three answers, and **only the first is a firm failure**: our miss, which
 * is fixed by creating the engagement rather than by writing a note about
 * it; handled by another professional; or the client was not with us then.
 *
 * So there is no "mark as our miss" action here. Creating the job is that
 * action, and it already exists.
 */

/** Both actions touch compliance, which is the engagement-creation area. */
async function gate(actor, clientId) {
  await connectDB();
  const client = await Client.findById(clientId)
    .select("branchId legalName tradeName")
    .lean();
  if (!client) return { error: "That client no longer exists." };

  assertCan(actor, "edit", "engagementsCreate", {
    branchId: String(client.branchId),
  });
  return { client };
}

/**
 * Record why nothing was created for one client, service and period.
 *
 * Idempotent on purpose: marking the same cell twice changes the reason
 * rather than failing, because the commonest correction is "actually they
 * weren't with us at all".
 */
export async function explainPeriod(formData) {
  const actor = await requireUser();

  const clientId = String(formData.get("clientId") ?? "");
  const serviceTemplateId = String(formData.get("serviceTemplateId") ?? "");
  const period = String(formData.get("period") ?? "").trim();
  const reason = String(formData.get("reason") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (!PERIOD_REASONS.includes(reason)) {
    return { error: "Choose what this period actually was." };
  }
  if (!parsePeriod(period)) return { error: "That is not a period." };

  const loaded = await gate(actor, clientId);
  if (loaded.error) return { error: loaded.error };

  const service = await ServiceTemplate.findById(serviceTemplateId)
    .select("name")
    .lean();
  if (!service) return { error: "That service no longer exists." };

  await audited(actor, async (session) => {
    const existing = await PeriodReason.findOne({
      clientId,
      serviceTemplateId,
      period,
    }).session(session);

    if (existing) {
      const was = existing.reason;
      existing.reason = reason;
      existing.note = note;
      existing.recordedBy = actor.id;
      existing.recordedByName = actor.name;
      existing.updatedBy = actor.id;
      await existing.save({ session });

      await recordAudit(
        {
          action: ACTIONS.update,
          entityType: "PeriodReason",
          entityId: existing._id,
          clientId,
          diff: { reason: [was, reason] },
          note: `${service.name} ${period}: ${PERIOD_REASON_LABELS[reason]}`,
        },
        session,
      );
      return;
    }

    const [created] = await PeriodReason.create(
      [
        {
          clientId,
          serviceTemplateId,
          period,
          branchId: loaded.client.branchId,
          reason,
          note,
          recordedBy: actor.id,
          recordedByName: actor.name,
          createdBy: actor.id,
          updatedBy: actor.id,
        },
      ],
      { session },
    );

    await recordAudit(
      {
        action: ACTIONS.create,
        entityType: "PeriodReason",
        entityId: created._id,
        clientId,
        note: `${service.name} ${period}: ${PERIOD_REASON_LABELS[reason]}${note ? ` — ${note}` : ""}`,
      },
      session,
    );
  });

  revalidatePath("/compliance");
  revalidatePath(`/clients/${clientId}`);
  return {
    ok: `${PERIOD_REASON_LABELS[reason]}. It is off the list of periods nobody has an answer for.`,
  };
}

/**
 * Take the explanation back off, so the period counts again.
 *
 * Soft deleted like everything else (CLAUDE.md rule 3): somebody decided
 * this period was somebody else's, and that decision is part of why the
 * firm did nothing about it for a year.
 */
export async function clearPeriodReason(id) {
  const actor = await requireUser();
  await connectDB();

  const row = await PeriodReason.findById(id);
  if (!row) return { error: "That note is already gone." };

  const loaded = await gate(actor, String(row.clientId));
  if (loaded.error) return { error: loaded.error };

  await audited(actor, async (session) => {
    await recordAudit(
      {
        action: ACTIONS.softDelete,
        entityType: "PeriodReason",
        entityId: row._id,
        clientId: row.clientId,
        note: `${row.period}: the explanation was withdrawn, so the period counts again`,
      },
      session,
    );
    await row.softDelete(actor.id, { session });
  });

  revalidatePath("/compliance");
  revalidatePath(`/clients/${row.clientId}`);
  return { ok: "Back on the list. Somebody has to answer for it again." };
}

/**
 * Open a job for every closed period that has nothing in it (P3-34 phase 4).
 *
 * The button says "Create all 16 jobs" and this is what it does. Five
 * rules hold it together, and each exists because of a way this could go
 * wrong quietly:
 *
 *  1. **The server recomputes the list.** Nothing arrives from the browser
 *     but a financial year and, optionally, one service. A client that
 *     could name which jobs to create could name any jobs to create.
 *  2. **Permission is asked per client**, not once for the batch. A
 *     manager may create work for Noida and not for Ludhiana, and the
 *     honest answer is to open the Noida ones and report the rest as
 *     skipped — not to refuse the whole button.
 *  3. **It goes through the same path the nightly generator uses** —
 *     `buildEngagement`, `nextEngagementCode`, the due-date master, the
 *     subscription's own people. A second way of creating an engagement
 *     is a second set of defaults to keep in step.
 *  4. **It never invents a date** (CLAUDE.md rule 8). A service whose rule
 *     nobody has confirmed still gets its job, with the statutory date
 *     empty and the reason written into the status history.
 *  5. **Fifty at a time**, each its own transaction with its own audit
 *     entry.
 *
 * @param {{ fy: number, serviceId?: string }} input
 */
export async function createMissingJobs({ fy, serviceId = "" }) {
  const actor = await requireUser();
  assertCan(actor, "edit", "engagementsCreate");
  await connectDB();

  const now = new Date();
  const year = Number(fy) || financialYearStart(now);

  const templates = await ServiceTemplate.find({
    active: true,
    recurrence: { $ne: "one-time" },
    ...(serviceId ? { _id: serviceId } : {}),
  })
    .select("name code category recurrence turnaroundDays level")
    .lean();

  if (templates.length === 0) {
    return { created: 0, skipped: [], error: "There is no such service." };
  }

  const templateById = new Map(templates.map((t) => [String(t._id), t]));
  const periodsFor = new Map(
    templates.map((t) => [String(t._id), periodsInYear(t.recurrence, year)]),
  );
  const codes = [
    ...new Set([...periodsFor.values()].flat().map((p) => p.code)),
  ];

  /** Only clients this person may see at all; the branch check comes later. */
  const visible = await Client.find(await clientListFilter(actor))
    .select("_id")
    .limit(5000)
    .lean();
  const visibleIds = visible.map((row) => String(row._id));

  const [subscriptions, engagements, reasons] = await Promise.all([
    ClientService.find({
      active: true,
      clientId: { $in: visibleIds },
      serviceTemplateId: { $in: [...templateById.keys()] },
    })
      .select(
        "clientId serviceTemplateId startPeriod feePaise defaultAssigneeId defaultReviewerId",
      )
      .lean(),
    /**
     * A cancelled job is still an answer to "did anybody look at this
     * period", so nothing is filtered by status here. The soft-delete
     * plugin's own scope is all this needs.
     */
    Engagement.find({
      clientId: { $in: visibleIds },
      serviceTemplateId: { $in: [...templateById.keys()] },
      period: { $in: codes },
    })
      .select("clientId serviceTemplateId period")
      .limit(20000)
      .lean(),
    PeriodReason.find({
      clientId: { $in: visibleIds },
      period: { $in: codes },
    })
      .select("clientId serviceTemplateId period")
      .lean(),
  ]);

  const holes = missingCells({
    subscriptions,
    engagements,
    reasons,
    periodsOf: (id) => periodsFor.get(id) ?? [],
    now,
  });

  if (holes.length === 0) {
    return { created: 0, skipped: [], ok: "There was nothing left to open." };
  }

  const batch = holes.slice(0, CREATE_CAP);
  const subscriptionFor = new Map(
    subscriptions.map((row) => [
      `${String(row.clientId)}:${String(row.serviceTemplateId)}`,
      row,
    ]),
  );

  const [clients, rules, branches] = await Promise.all([
    Client.find({ _id: { $in: [...new Set(batch.map((h) => h.clientId))] } })
      .select("legalName tradeName code branchId status")
      .lean(),
    DueDateRule.find({ active: true }).lean(),
    Branch.find({}).select("code").lean(),
  ]);
  const clientById = new Map(clients.map((c) => [String(c._id), c]));
  const ruleByService = new Map(rules.map((r) => [r.serviceCode, r]));
  const branchCode = new Map(branches.map((b) => [String(b._id), b.code]));

  let created = 0;
  /** @type {Array<{client: string, period: string, reason: string}>} */
  const skipped = [];

  for (const hole of batch) {
    const client = clientById.get(hole.clientId);
    const template = templateById.get(hole.serviceTemplateId);
    if (!client || !template) continue;

    const who = client.tradeName || client.legalName;

    if (client.status !== "Active") {
      skipped.push({
        client: who,
        period: hole.periodLabel,
        reason: "the client is not active",
      });
      continue;
    }

    // rule 2: asked for this client's own branch, and a refusal is a skip
    if (
      !can(actor, "edit", "engagementsCreate", {
        branchId: String(client.branchId),
      })
    ) {
      skipped.push({
        client: who,
        period: hole.periodLabel,
        reason: "not your branch",
      });
      continue;
    }

    const period = (periodsFor.get(hole.serviceTemplateId) ?? []).find(
      (p) => p.code === hole.period,
    );
    if (!period) continue;

    const rule = ruleByService.get(template.code);
    const due = statutoryDueFor(rule, period.code);
    const subscription = subscriptionFor.get(
      `${hole.clientId}:${hole.serviceTemplateId}`,
    );

    /**
     * The subscription's usual people were legal when somebody chose them,
     * but a default goes stale. The generator's rule applies here too:
     * create the work unassigned and say why, rather than assign somebody
     * who may no longer be allowed to do it.
     */
    const people = await loadPeople([
      subscription?.defaultAssigneeId,
      subscription?.defaultReviewerId,
    ]);
    const legal = checkAssignment(
      template,
      people.get(String(subscription?.defaultAssigneeId ?? "")) ?? null,
      people.get(String(subscription?.defaultReviewerId ?? "")) ?? null,
    );

    try {
      await audited(actor, async (session) => {
        const fields = buildEngagement({
          template,
          client,
          period,
          assigneeId: legal.ok
            ? (subscription?.defaultAssigneeId ?? null)
            : null,
          reviewerId: legal.ok
            ? (subscription?.defaultReviewerId ?? null)
            : null,
          feePaise: subscription?.feePaise || undefined,
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
              milestones: buildMilestones(rule, period.code),
              statutoryDue: due.date,
              internalDue: due.date
                ? internalTargetFor(due.date)
                : fields.internalDue,
              statusHistory: [
                {
                  to: "Scheduled",
                  byName: actor.name,
                  reason: [
                    `opened from the compliance grid, which had no job for this period${
                      due.date ? `, due ${istInputDate(due.date)}` : ""
                    }`,
                    due.date ? null : due.why,
                    legal.ok ? null : `left unassigned — ${legal.error}`,
                  ]
                    .filter(Boolean)
                    .join("; "),
                },
              ],
              createdBy: actor.id,
              updatedBy: actor.id,
            },
          ],
          { session },
        );

        await recordAudit(
          {
            action: ACTIONS.create,
            entityType: "Engagement",
            entityId: doc._id,
            clientId: client._id,
            note: `${template.name} ${period.label}: opened from the compliance grid, which had no job for it`,
          },
          session,
        );
      });

      created += 1;
    } catch (err) {
      // somebody created it by hand a moment ago: not a failure
      if (err?.code === 11000) continue;
      skipped.push({
        client: who,
        period: hole.periodLabel,
        reason: "it could not be saved",
      });
    }
  }

  revalidatePath("/compliance");
  revalidatePath("/dashboard");

  return {
    created,
    skipped,
    remaining: Math.max(0, holes.length - batch.length),
  };
}

/** The roles behind two ids, for `checkAssignment`. */
async function loadPeople(ids) {
  const wanted = ids.filter(Boolean).map(String);
  if (wanted.length === 0) return new Map();
  const rows = await User.find({ _id: { $in: wanted } })
    .select("role name active")
    .lean();
  return new Map(rows.map((row) => [String(row._id), row]));
}

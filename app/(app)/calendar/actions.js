"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import Client from "@/models/Client";
import ServiceTemplate from "@/models/ServiceTemplate";
import PeriodReason from "@/models/PeriodReason";
import { PERIOD_REASONS, PERIOD_REASON_LABELS } from "@/lib/compliance/reasons";
import { parsePeriod } from "@/lib/engagements/period";

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

  revalidatePath("/calendar");
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

  revalidatePath("/calendar");
  revalidatePath(`/clients/${row.clientId}`);
  return { ok: "Back on the list. Somebody has to answer for it again." };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/auth";
import { assertCan } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import Incident from "@/models/Incident";
import { SEVERITIES, INCIDENT_STATES } from "@/lib/security/incidents";

/**
 * Keeping the incident log (spec section 16).
 *
 * Partner-only, audited, and **nothing here deletes anything**. An
 * incident can be closed and it can be added to; it cannot be made to go
 * away, because a log somebody can tidy is not a log.
 */

const raise = z.object({
  summary: z.string().trim().min(5, "Say in one line what happened").max(200),
  severity: z.enum(SEVERITIES),
  occurredAt: z.string().trim().optional(),
  detail: z.string().max(4000).optional(),
  personalData: z.boolean(),
  clientsAffected: z.coerce.number().int().min(0).max(100000).optional(),
});

/** @param {FormData} formData */
export async function raiseIncident(formData) {
  const actor = await requireUser();
  assertCan(actor, "edit", "usersSettings");

  const parsed = raise.safeParse({
    summary: formData.get("summary") ?? "",
    severity: formData.get("severity") ?? "Noted",
    occurredAt: formData.get("occurredAt") || undefined,
    detail: formData.get("detail") ?? "",
    personalData: formData.get("personalData") === "on",
    clientsAffected: formData.get("clientsAffected") || 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const input = parsed.data;
  await connectDB();

  let created;
  await audited(actor, async (session) => {
    const [incident] = await Incident.create(
      [
        {
          summary: input.summary,
          severity: input.severity,
          occurredAt: input.occurredAt
            ? new Date(`${input.occurredAt}T00:00:00+05:30`)
            : new Date(),
          noticedAt: new Date(),
          detail: input.detail ?? "",
          personalData: input.personalData,
          clientsAffected: input.clientsAffected ?? 0,
          raisedBy: actor.id,
          raisedByName: actor.name,
          createdBy: actor.id,
          updatedBy: actor.id,
        },
      ],
      { session },
    );
    created = incident;
  });

  revalidatePath("/settings/security");

  return {
    ok: input.personalData
      ? "Recorded. Personal data was involved, so check the notification duty under the DPDP Rules with the firm's lawyer — the facts are now written down to notify from."
      : "Recorded on the incident log.",
    id: String(created?._id ?? ""),
  };
}

/** Add to an incident: what was done, who was told, whether it is closed. */
export async function updateIncident(id, formData) {
  const actor = await requireUser();
  assertCan(actor, "edit", "usersSettings");

  const status = String(formData.get("status") ?? "");
  if (!INCIDENT_STATES.includes(status)) {
    return { error: "That is not a status." };
  }

  const action = String(formData.get("action") ?? "").trim();
  const notified = String(formData.get("notified") ?? "").trim();

  if (status === "Closed" && !action) {
    return {
      error:
        "Say what was done about it before closing it. An incident closed with nothing written is one nobody learns from.",
    };
  }

  await connectDB();
  const incident = await Incident.findById(id);
  if (!incident) return { error: "That incident no longer exists." };

  await audited(actor, async (session) => {
    const was = incident.status;

    // added to, never overwritten: the history of an incident is the point
    if (action && action !== incident.action) {
      incident.action = incident.action
        ? `${incident.action}\n\n${action}`
        : action;
    }
    if (notified && notified !== incident.notified) {
      incident.notified = notified;
      incident.notifiedAt = incident.notifiedAt ?? new Date();
    }

    incident.status = status;
    if (status === "Closed") incident.closedAt = new Date();
    incident.updatedBy = actor.id;
    await incident.save({ session });

    if (was !== status) {
      await recordAudit(
        {
          action: ACTIONS.statusChange,
          entityType: "Incident",
          entityId: incident._id,
          note: `${actor.name} moved the incident "${incident.summary}" from ${was} to ${status}`,
        },
        session,
      );
    }
  });

  revalidatePath("/settings/security");
  return { ok: "Updated." };
}

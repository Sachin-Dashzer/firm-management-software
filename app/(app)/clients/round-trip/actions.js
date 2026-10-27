"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan, can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Client from "@/models/Client";
import Branch from "@/models/Branch";
import HeldChange from "@/models/HeldChange";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import { clientListFilter } from "@/lib/access/clientAccess";
import { findDuplicates } from "@/lib/clients/duplicates";
import { prepareRoundTrip, DIFF_FIELDS } from "@/lib/clients/roundTrip";

/**
 * Updating clients from a spreadsheet (P3-18a).
 *
 * The import (Step 3) creates; this changes what is already there, which is
 * a different risk and has three answers to it:
 *
 *  - a row finds its client by **our own code** and nothing else
 *  - nothing is written that was not **ticked field by field** in the
 *    preview, so a column dragged down by accident is refused one field at
 *    a time
 *  - **identity waits for a partner** (`isHeld`), as a held change carrying
 *    both values
 *
 * A blank cell never clears a field. `prepareRoundTrip` drops it, because a
 * sheet with empty columns must not empty forty records.
 */

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 5000;

async function readSheet(actor, formData) {
  const file = formData.get("file");
  if (!file || typeof file === "string" || file.size === 0) {
    return { error: "Choose a CSV file first." };
  }
  if (file.size > MAX_BYTES) {
    return { error: "That file is over 2 MB. Split it and do it in parts." };
  }

  await connectDB();

  const branches = await Branch.find(
    actor.role === "partner" ? {} : { _id: { $in: actor.branchIds } },
  )
    .select("code name")
    .lean();

  /**
   * Only clients this person may see. A code they cannot open must not be
   * matchable from a sheet — otherwise the spreadsheet is a way round the
   * access rules.
   */
  const clients = await Client.find(await clientListFilter(actor))
    .select(
      "code legalName tradeName entityType branchId pan tan cin gstins status risk creditDays industry turnoverBand tags invoiceEmail",
    )
    .limit(10000)
    .lean();

  const prepared = prepareRoundTrip(await file.text(), {
    branches: branches.map((row) => ({
      id: String(row._id),
      code: row.code,
      name: row.name,
    })),
    clients,
    actor,
  });

  if (prepared.rows.length === 0) {
    return {
      error:
        "No rows found. Check the file has a header row and was saved as CSV UTF-8.",
    };
  }
  if (prepared.rows.length > MAX_ROWS) {
    return {
      error: `That file has ${prepared.rows.length} rows; the limit is ${MAX_ROWS}.`,
    };
  }

  return { prepared };
}

/** What would change, field by field. Nothing is written. */
export async function previewRoundTrip(_prev, formData) {
  const actor = await requireUser();
  assertCan(actor, "edit", "clients");

  const { error, prepared } = await readSheet(actor, formData);
  if (error) return { error };

  return {
    ok: true,
    rows: prepared.rows
      .filter((row) => row.kind !== "new" || row.errors.length)
      .map((row) => ({
        line: row.line,
        kind: row.kind,
        name: row.name,
        code: row.code,
        clientId: row.clientId ?? "",
        errors: row.errors,
        changes: row.changes.map((change) => ({
          field: change.field,
          label: change.label,
          from: change.from,
          to: change.to,
          held: change.held,
        })),
      })),
    newCount: prepared.newCount,
    updateCount: prepared.updateCount,
    unchangedCount: prepared.unchangedCount,
    heldCount: prepared.heldCount,
    errorCount: prepared.errorCount,
    unknownHeaders: prepared.unknownHeaders,
  };
}

/**
 * Apply what was ticked.
 *
 * The file is read again rather than parked on the server between the two
 * calls, and the ticks arrive as `clientId:field` pairs — so what is
 * written is the intersection of what the sheet says and what somebody
 * looked at.
 */
export async function commitRoundTrip(_prev, formData) {
  const actor = await requireUser();
  assertCan(actor, "edit", "clients");

  const { error, prepared } = await readSheet(actor, formData);
  if (error) return { error };

  const ticked = new Set(formData.getAll("apply").map(String));
  if (ticked.size === 0) {
    return { error: "Nothing is ticked, so there is nothing to change." };
  }

  let applied = 0;
  let held = 0;
  /** @type {string[]} */
  const skipped = [];
  /** @type {Array<{clientId: string, field: string, label: string, from: string, to: string, name: string}>} */
  const done = [];

  for (const row of prepared.rows) {
    if (row.kind !== "update" || row.errors.length) continue;

    const wanted = row.changes.filter((change) =>
      ticked.has(`${row.clientId}:${change.field}`),
    );
    if (wanted.length === 0) continue;

    const direct = wanted.filter((change) => !change.held);
    const waiting = wanted.filter((change) => change.held);

    /**
     * The duplicate check still runs, on the values as they would be after
     * the change: a sheet is not a reason to let two clients share a PAN.
     */
    if (direct.length || waiting.length) {
      const after = Object.fromEntries(
        wanted.map((change) => [change.field, change.afterValue]),
      );
      if (after.pan || after.gstins) {
        const { blocking } = await findDuplicates(after, row.clientId);
        if (blocking.length) {
          skipped.push(`Row ${row.line} (${row.name}): ${blocking[0].message}`);
          continue;
        }
      }
    }

    try {
      await audited(actor, async (session) => {
        if (direct.length) {
          const set = Object.fromEntries(
            direct.map((change) => [change.field, change.afterValue]),
          );
          await Client.findOneAndUpdate(
            { _id: row.clientId },
            { $set: { ...set, updatedBy: actor.id } },
            { session, runValidators: true },
          );
        }

        for (const change of waiting) {
          await HeldChange.create(
            [
              {
                clientId: row.clientId,
                clientName: row.name,
                field: change.field,
                label: change.label,
                from: change.beforeValue,
                to: change.afterValue,
                fromText: change.from,
                toText: change.to,
                source: "Bulk sheet",
                askedBy: actor.id,
                askedByName: actor.name,
                createdBy: actor.id,
                updatedBy: actor.id,
              },
            ],
            { session },
          );
        }

        await recordAudit(
          {
            action: ACTIONS.update,
            entityType: "Client",
            entityId: row.clientId,
            clientId: row.clientId,
            note: `From a spreadsheet: ${
              direct.length
                ? `${direct.map((change) => change.label).join(", ")} changed`
                : ""
            }${direct.length && waiting.length ? "; " : ""}${
              waiting.length
                ? `${waiting.map((change) => change.label).join(", ")} held for a partner`
                : ""
            }`,
          },
          session,
        );
      });

      applied += direct.length;
      held += waiting.length;
      for (const change of direct) {
        done.push({
          clientId: row.clientId,
          field: change.field,
          label: change.label,
          from: change.from,
          to: change.to,
          name: row.name,
        });
      }
    } catch (err) {
      skipped.push(`Row ${row.line} (${row.name}): ${err.message}`);
    }
  }

  revalidatePath("/clients");
  revalidatePath("/clients/changes");

  return {
    ok: [
      `${applied} ${applied === 1 ? "field" : "fields"} changed`,
      held
        ? `${held} ${held === 1 ? "change is" : "changes are"} waiting for a partner`
        : "",
      skipped.length ? `${skipped.length} skipped` : "",
    ]
      .filter(Boolean)
      .join(", ") + ".",
    applied,
    held,
    skipped,
    done,
  };
}

/**
 * Put one field back to what it was (P3-18a).
 *
 * Offered on the result of the batch that changed it, from the value that
 * was recorded at the time. It is deliberately not a general "undo
 * anything": once you leave the page, what changed is a question for the
 * audit log, which has every field-level before and after already.
 */
export async function undoFieldChange(clientId, field) {
  const actor = await requireUser();

  await connectDB();
  const client = await Client.findById(clientId)
    .select("branchId legalName tradeName")
    .lean();
  if (!client) return { error: "That client no longer exists." };

  assertCan(actor, "edit", "clients", { branchId: String(client.branchId) });

  const spec = DIFF_FIELDS.find((row) => row.field === field);
  if (!spec) return { error: "That is not a field a sheet can change." };

  /**
   * Undo reads the previous value out of the audit log, and the log does
   * not keep every value as it was: a PAN is stored redacted and a long
   * list becomes "[3 items]". Writing either of those back would put a lie
   * into the record — so undo covers the plain fields a sheet applies
   * directly, and an identity field is changed on the client's own page,
   * where the proper form and the duplicate check are.
   */
  if (spec.held || spec.list) {
    return {
      error: `${spec.label} is not undone from here: the audit log does not keep its old value in a form that can be written back. Change it on the client's own page — what the sheet did is on the record either way.`,
    };
  }

  /**
   * The previous value comes from the audit log rather than the browser:
   * the page could have been open for an hour, and the log is the record
   * of what this change actually was.
   */
  const { default: AuditLog } = await import("@/models/AuditLog");
  const entry = await AuditLog.findOne({
    entityType: "Client",
    entityId: clientId,
    [`diff.${field}`]: { $exists: true },
  })
    .sort({ ts: -1 })
    .select("diff")
    .lean();

  const previous = entry?.diff?.[field]?.[0];
  if (previous === undefined) {
    return {
      error:
        "The audit log has no earlier value for that field, so there is nothing to put back.",
    };
  }

  await audited(actor, async (session) => {
    await Client.findOneAndUpdate(
      { _id: clientId },
      { $set: { [field]: previous, updatedBy: actor.id } },
      { session, runValidators: true },
    );

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Client",
        entityId: clientId,
        clientId,
        note: `${spec.label} put back to what it was before the spreadsheet changed it`,
      },
      session,
    );
  });

  revalidatePath("/clients");
  return { ok: `${spec.label} put back.` };
}

/** A partner decides on one held change. */
export async function decideHeldChange(id, verdict, formData) {
  const actor = await requireUser();
  assertCan(actor, "approve", "feeWriteOff");

  await connectDB();
  const row = await HeldChange.findById(id);
  if (!row) return { error: "That change is gone." };
  if (row.state !== "pending") {
    return { error: `That one was already ${row.state}.` };
  }

  const reason = String(formData?.get("reason") ?? "").trim();
  if (verdict === "decline" && reason.length < 3) {
    return {
      error:
        "Say why. Whoever sent the sheet is told, and a refusal with no reason comes straight back as the same row.",
    };
  }

  if (verdict === "apply") {
    const client = await Client.findById(row.clientId).select("branchId").lean();
    if (!client) return { error: "That client no longer exists." };

    if (row.field === "pan" || row.field === "gstins") {
      const { blocking } = await findDuplicates(
        { [row.field]: row.to },
        String(row.clientId),
      );
      if (blocking.length) return { error: blocking[0].message };
    }
  }

  await audited(actor, async (session) => {
    if (verdict === "apply") {
      await Client.findOneAndUpdate(
        { _id: row.clientId },
        { $set: { [row.field]: row.to, updatedBy: actor.id } },
        { session, runValidators: true },
      );
    }

    row.state = verdict === "apply" ? "applied" : "declined";
    row.decidedBy = actor.id;
    row.decidedByName = actor.name;
    row.decidedAt = new Date();
    row.reason = reason;
    row.updatedBy = actor.id;
    await row.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Client",
        entityId: row.clientId,
        clientId: row.clientId,
        note:
          verdict === "apply"
            ? `${row.label} changed from "${row.fromText}" to "${row.toText}", approved by ${actor.name} (asked for by ${row.askedByName})`
            : `${row.label} left as "${row.fromText}" — ${actor.name} declined the change ${row.askedByName} asked for: ${reason}`,
      },
      session,
    );
  });

  revalidatePath("/clients/changes");
  revalidatePath(`/clients/${row.clientId}`);
  return {
    ok:
      verdict === "apply"
        ? `${row.label} changed.`
        : `${row.label} left as it was.`,
  };
}

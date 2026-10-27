"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { connectDB } from "@/lib/db";
import Procedure from "@/models/Procedure";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import {
  screenFor,
  mayWrite,
  mayReview,
  isStale,
} from "@/lib/learning/screens";

/**
 * Writing down how the firm does something (P3-19).
 *
 * **A CA or a partner writes; a partner says it is still true.** Two acts,
 * deliberately split: writing a procedure is the work of whoever does the
 * job most often, and standing behind it a year later is a partner's.
 *
 * Nothing is seeded, ever. A screen with no row says so.
 */

/** What the panel shows for one screen. Readable by everybody. */
export async function procedureFor(key) {
  const actor = await requireUser();
  await connectDB();

  const row = await Procedure.findOne({ key }).lean();
  if (!row) return { written: false, mayWrite: mayWrite(actor) };

  return {
    written: true,
    mayWrite: mayWrite(actor),
    mayReview: mayReview(actor),
    stale: isStale(row),
    procedure: {
      key: row.key,
      kind: row.kind,
      title: row.title,
      intro: row.intro,
      steps: (row.steps ?? []).map((step) => ({
        id: String(step._id),
        text: step.text,
        note: step.note ?? "",
      })),
      notFor: row.notFor ?? [],
      writtenByName: row.writtenByName,
      reviewedByName: row.reviewedByName,
      reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    },
  };
}

/**
 * Write or rewrite one.
 *
 * The steps arrive as plain lines, one per line, because that is how
 * somebody writes a procedure when they are thinking about the work rather
 * than about a form. A line beginning `—` is a note on the step above it.
 */
export async function saveProcedure(key, formData) {
  const actor = await requireUser();
  if (!mayWrite(actor)) {
    return {
      error:
        "A CA or a partner writes these. Tell one what the steps are — it is their job to stand behind the words.",
    };
  }

  const kind = String(formData.get("kind") ?? "screen");
  if (kind === "screen" && !screenFor(key)) {
    return { error: "That is not a screen this system has." };
  }

  const title = String(formData.get("title") ?? "").trim();
  if (kind === "playbook" && title.length < 4) {
    return { error: "Give the playbook a name." };
  }

  /** One step per line; a line starting with — is a note on the one above. */
  const steps = [];
  for (const raw of String(formData.get("steps") ?? "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^[—-]\s*/.test(line) && steps.length) {
      steps[steps.length - 1].note = line.replace(/^[—-]\s*/, "");
      continue;
    }
    steps.push({ text: line.replace(/^\d+[.)]\s*/, ""), note: "" });
  }

  if (steps.length === 0) {
    return { error: "Write at least one step. An empty procedure is worse than none." };
  }

  const notFor = String(formData.get("notFor") ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  await connectDB();

  await audited(actor, async (session) => {
    const row = await Procedure.findOneAndUpdate(
      { key },
      {
        $set: {
          kind,
          title: title || screenFor(key)?.label || key,
          intro: String(formData.get("intro") ?? "").trim(),
          steps,
          notFor,
          whenItHappens: String(formData.get("whenItHappens") ?? "").trim(),
          decisions: String(formData.get("decisions") ?? "").trim(),
          mistakes: String(formData.get("mistakes") ?? "").trim(),
          example: String(formData.get("example") ?? "").trim(),
          screens: formData.getAll("screens").map(String),
          writtenBy: actor.id,
          writtenByName: actor.name,
          updatedBy: actor.id,
          /**
           * Rewriting it clears the review. A partner said the old words
           * were how the firm works; they have not said that about these.
           */
          reviewedAt: null,
          reviewedBy: null,
          reviewedByName: "",
        },
        $setOnInsert: { key, createdBy: actor.id },
      },
      { new: true, upsert: true, session },
    );

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Procedure",
        entityId: row._id,
        note: `${row.kind === "playbook" ? "Playbook" : "Procedure"} "${row.title}" written by ${actor.name} — ${steps.length} steps`,
      },
      session,
    );
  });

  revalidatePath("/learning");
  revalidatePath(`/learning/${key}`);
  return { ok: "Written. A partner can mark it reviewed." };
}

/** A partner says it is still how the firm works. */
export async function markReviewed(key) {
  const actor = await requireUser();
  if (!mayReview(actor)) {
    return { error: "A partner says whether this is still how the firm works." };
  }

  await connectDB();
  const row = await Procedure.findOne({ key });
  if (!row) return { error: "Nobody has written that one yet." };

  await audited(actor, async (session) => {
    row.reviewedAt = new Date();
    row.reviewedBy = actor.id;
    row.reviewedByName = actor.name;
    row.updatedBy = actor.id;
    await row.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Procedure",
        entityId: row._id,
        note: `${actor.name} read "${row.title}" and says it is still how the firm works`,
      },
      session,
    );
  });

  revalidatePath("/learning");
  revalidatePath(`/learning/${key}`);
  return { ok: "Marked as read and still true." };
}

/** Take one down. A soft delete: what the firm told people is part of it. */
export async function retireProcedure(key, reason) {
  const actor = await requireUser();
  if (!mayReview(actor)) {
    return { error: "A partner takes one down." };
  }

  const why = String(reason ?? "").trim();
  if (why.length < 3) return { error: "Say why it is coming down." };

  await connectDB();
  const row = await Procedure.findOne({ key });
  if (!row) return { error: "It is already gone." };

  await audited(actor, async (session) => {
    await recordAudit(
      {
        action: ACTIONS.softDelete,
        entityType: "Procedure",
        entityId: row._id,
        note: `"${row.title}" taken down — ${why}`,
      },
      session,
    );
    await row.softDelete(actor.id, { session });
  });

  revalidatePath("/learning");
  return { ok: "Down. It stays on the record." };
}

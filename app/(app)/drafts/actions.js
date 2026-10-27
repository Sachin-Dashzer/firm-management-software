"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { connectDB } from "@/lib/db";
import FormDraft from "@/models/FormDraft";
import { DRAFT_KINDS, scrubDraft, worthKeeping } from "@/lib/forms/draft";

/**
 * Keeping and discarding an unfinished form (P3-18b).
 *
 * No permission check beyond "is this yours": a draft belongs to one
 * person, the query is always scoped to them, and there is nothing a role
 * could widen. Nothing here is audited either — somebody's half-typed form
 * is not a change to the firm's records, and the client it becomes is
 * audited the moment it is created.
 */

/**
 * Keep what has been typed so far. One row per person per kind, replaced
 * each time, because this is "carry on with that" and not a library.
 */
export async function keepDraft(kind, formData) {
  const actor = await requireUser();
  if (!DRAFT_KINDS.includes(kind)) return { error: "Unknown kind of form." };

  const values = {};
  for (const [field, value] of formData.entries()) {
    if (typeof value === "string") values[field] = value;
  }

  const { payload, dropped } = scrubDraft(values);
  if (!worthKeeping(payload)) {
    return { error: "There is nothing in it yet." };
  }

  await connectDB();
  await FormDraft.findOneAndUpdate(
    { userId: actor.id, kind },
    { $set: { payload, dropped } },
    { upsert: true, new: true },
  );

  revalidatePath("/clients/new");
  return {
    ok: dropped.length
      ? `Kept. ${dropped.join(" and ")} ${dropped.length === 1 ? "is" : "are"} not kept in a draft — type ${dropped.length === 1 ? "it" : "them"} in when you come back.`
      : "Kept. Come back to it from the New client screen.",
  };
}

/** Throw it away. */
export async function dropDraft(kind) {
  const actor = await requireUser();
  if (!DRAFT_KINDS.includes(kind)) return { error: "Unknown kind of form." };

  await connectDB();
  await FormDraft.deleteOne({ userId: actor.id, kind });

  revalidatePath("/clients/new");
  return { ok: "Discarded." };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/auth";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import SavedView from "@/models/SavedView";

/**
 * Saved views (spec section 10).
 *
 * Any signed-in person may save their own; only a Partner may share one
 * with the firm, because a shared view appears on everybody's screen and
 * a badly named one is a small piece of confusion for forty people.
 *
 * Deleting is the soft delete every other collection uses, so a view
 * somebody relied on can be brought back.
 */

const input = z.object({
  name: z.string().trim().min(1, "Give the view a name").max(60),
  screen: z.string().trim().min(1).max(60),
  search: z.string().trim().max(1000),
  shared: z.boolean(),
});

/** The views for one screen: mine, plus the firm's. */
export async function listViews(actor, screen) {
  await connectDB();

  const views = await SavedView.find({
    screen,
    $or: [{ ownerId: actor.id }, { shared: true }],
  })
    .sort({ shared: 1, name: 1 })
    .limit(50)
    .lean();

  return views.map((view) => ({
    id: String(view._id),
    name: view.name,
    search: view.search,
    shared: view.shared,
    mine: String(view.ownerId) === String(actor.id),
    by: view.ownerName,
  }));
}

/** @param {FormData} formData */
export async function saveView(formData) {
  const actor = await requireUser();

  const parsed = input.safeParse({
    name: formData.get("name") ?? "",
    screen: formData.get("screen") ?? "",
    search: formData.get("search") ?? "",
    shared: formData.get("shared") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { name, screen, search, shared } = parsed.data;

  if (shared && actor.role !== "partner") {
    return { error: "Only a partner can share a view with the firm." };
  }

  await connectDB();

  // saving the same name again replaces it, which is what "save" means to
  // somebody adjusting a filter they already keep
  const existing = await SavedView.findOne({
    screen,
    name,
    ownerId: actor.id,
  });

  await audited(actor, async (session) => {
    const view = existing ?? new SavedView({ screen, name, ownerId: actor.id });
    view.search = search;
    view.shared = shared;
    view.ownerName = actor.name;
    view.createdBy = view.createdBy ?? actor.id;
    view.updatedBy = actor.id;
    await view.save({ session });
  });

  revalidatePath(`/reports/${screen}`);
  revalidatePath("/engagements");
  return {
    ok: existing ? `“${name}” updated.` : `Saved as “${name}”.`,
  };
}

/** @param {string} id */
export async function deleteView(id) {
  const actor = await requireUser();

  await connectDB();
  const view = await SavedView.findById(id);
  if (!view) return { error: "That view is already gone." };

  const mine = String(view.ownerId) === String(actor.id);
  if (!mine && actor.role !== "partner") {
    return { error: "That view belongs to somebody else." };
  }

  const screen = view.screen;

  await audited(actor, async (session) => {
    view.updatedBy = actor.id;
    await view.softDelete(actor.id, { session });
    await recordAudit(
      {
        action: ACTIONS.softDelete,
        entityType: "SavedView",
        entityId: view._id,
        note: `${actor.name} removed the saved view “${view.name}”`,
      },
      session,
    );
  });

  revalidatePath(`/reports/${screen}`);
  revalidatePath("/engagements");
  return { ok: "Removed." };
}

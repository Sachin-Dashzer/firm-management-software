"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import DocTemplate, { DOC_KINDS } from "@/models/DocTemplate";
import { placeholdersIn } from "@/lib/docs/resolve";

/**
 * Template admin (P2-8b).
 *
 * Two things happen here and they are deliberately separate acts: **editing**
 * the wording, which anybody with the area may do, and **approving** it,
 * which is what lets the template produce a signed document at all. Editing
 * an approved template takes the approval away again — the words somebody
 * read are no longer the words on the page.
 */

/** Create or rewrite a template. */
export async function saveTemplate(id, formData) {
  const actor = await requireUser();
  assertCan(actor, "edit", "docTemplates");
  await connectDB();

  const fields = {
    code: String(formData.get("code") ?? "").trim().toUpperCase(),
    name: String(formData.get("name") ?? "").trim(),
    kind: String(formData.get("kind") ?? "Correspondence"),
    description: String(formData.get("description") ?? "").trim(),
    title: String(formData.get("title") ?? "").trim(),
    body: String(formData.get("body") ?? ""),
    partnerOnly: formData.get("partnerOnly") === "on",
    udinRequired: formData.get("udinRequired") === "on",
  };

  if (!fields.code) return { error: "Give it a short code." };
  if (!fields.name) return { error: "Give it a name." };
  if (!DOC_KINDS.includes(fields.kind)) return { error: "Unknown kind." };
  if (!fields.body.trim()) return { error: "The body cannot be empty." };

  // a placeholder no field answers to would print as {{...}} on a letter
  const { unknown } = placeholdersIn(fields.body);
  if (unknown.length) {
    return {
      error: `These fields do not exist: ${unknown.map((u) => `{{${u}}}`).join(", ")}. The list of what can be used is beside the editor.`,
    };
  }

  const existing = id ? await DocTemplate.findById(id) : null;
  if (id && !existing) return { error: "That template no longer exists." };

  const clash = await DocTemplate.findOne({
    code: fields.code,
    ...(id ? { _id: { $ne: id } } : {}),
  }).lean();
  if (clash) return { error: `${fields.code} is already in use.` };

  await audited(actor, async (session) => {
    if (!existing) {
      await DocTemplate.create(
        [{ ...fields, createdBy: actor.id, updatedBy: actor.id }],
        { session },
      );
      return;
    }

    /**
     * Changing the words of an approved template un-approves it. The
     * approval is of a wording, not of a name on a list — and a template
     * that quietly kept its tick after being rewritten would be the exact
     * hole this screen exists to close.
     */
    const rewritten =
      existing.body !== fields.body || existing.title !== fields.title;
    Object.assign(existing, fields);
    if (rewritten) {
      existing.version = (existing.version ?? 1) + 1;
      existing.verifiedAt = null;
      existing.verifiedBy = null;
      existing.verifiedByName = "";
    }
    existing.updatedBy = actor.id;
    await existing.save({ session });
  });

  revalidatePath("/settings/doc-templates");
  return {
    ok: existing
      ? "Saved. Approve the wording again before it can be issued."
      : "Template added. It makes drafts only until it is approved.",
  };
}

/**
 * Approve the wording. Only a partner — this is the act that lets the
 * firm's name go on the letter, so it is checked here and again at issue.
 */
export async function approveTemplate(id) {
  const actor = await requireUser();
  assertCan(actor, "edit", "docTemplates");
  if (actor.role !== "partner") {
    return { error: "Only a partner approves a template's wording." };
  }
  await connectDB();

  const template = await DocTemplate.findById(id);
  if (!template) return { error: "That template no longer exists." };
  if (template.verifiedAt) return { error: "That is already approved." };

  await audited(actor, async (session) => {
    template.verifiedAt = new Date();
    template.verifiedBy = actor.id;
    template.verifiedByName = actor.name;
    template.updatedBy = actor.id;
    await template.save({ session });
  });

  revalidatePath("/settings/doc-templates");
  return { ok: `${template.name} approved. It can now be issued.` };
}

/** Hide a template from the pick list; documents made from it stay. */
export async function archiveTemplate(id, active) {
  const actor = await requireUser();
  assertCan(actor, "edit", "docTemplates");
  await connectDB();

  const template = await DocTemplate.findById(id);
  if (!template) return { error: "That template no longer exists." };

  await audited(actor, async (session) => {
    template.active = Boolean(active);
    template.updatedBy = actor.id;
    await template.save({ session });
  });

  revalidatePath("/settings/doc-templates");
  return { ok: active ? "Back in the list." : "Hidden from the list." };
}

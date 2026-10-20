"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan, can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import DocTemplate from "@/models/DocTemplate";
import GeneratedDoc from "@/models/GeneratedDoc";
import { buildDocument, loadEngagementForDoc } from "@/lib/docs/build";
import { checkIssue } from "@/lib/docs/rules";

/**
 * Generating documents from templates (P2-8b).
 *
 * A draft is cheap and reversible: it holds no words of its own and
 * re-reads live data every time it is opened. Issuing is the act that
 * matters — it freezes the text, names the signatory, and is checked three
 * ways on the server (`lib/docs/rules.js`), because the screen hiding a
 * button is not a lock (CLAUDE.md rule 1).
 */

/** The engagement and the permission check both doors need. */
async function loadForDoc(actor, engagementId, action = "edit") {
  await connectDB();
  const engagement = await loadEngagementForDoc(engagementId);
  if (!engagement) {
    const err = new Error("That engagement no longer exists.");
    err.code = "NOT_FOUND";
    throw err;
  }
  assertCan(actor, action, "docGenerate", {
    branchId: String(engagement.branchId),
    assigneeId: String(engagement.assigneeId ?? ""),
    reviewerId: String(engagement.reviewerId ?? ""),
  });
  return engagement;
}

/** Start a draft from a template, against a piece of work. */
export async function createDraft(engagementId, templateId) {
  const actor = await requireUser();
  const engagement = await loadForDoc(actor, engagementId);

  const template = await DocTemplate.findById(templateId).lean();
  if (!template || !template.active) {
    return { error: "That template is not available." };
  }

  await audited(actor, async (session) => {
    await GeneratedDoc.create(
      [
        {
          templateId: template._id,
          templateCode: template.code,
          templateName: template.name,
          templateVersion: template.version ?? 1,
          clientId: engagement.clientId,
          engagementId: engagement._id,
          branchId: engagement.branchId,
          state: "draft",
          title: template.title || template.name,
          createdBy: actor.id,
          updatedBy: actor.id,
        },
      ],
      { session },
    );
  });

  revalidatePath(`/engagements/${engagementId}`);
  return { ok: `Draft ${template.name} started.` };
}

/**
 * Issue a draft: the moment the firm's name goes on it.
 *
 * The words are resolved once more and **stored**, so the document can be
 * reprinted years later exactly as it was signed, whatever has happened to
 * the client record since.
 */
export async function issueDoc(id) {
  const actor = await requireUser();
  await connectDB();

  const doc = await GeneratedDoc.findById(id);
  if (!doc) return { error: "That document no longer exists." };
  if (doc.state === "final") return { error: "That has already been issued." };

  const engagement = doc.engagementId
    ? await loadForDoc(actor, String(doc.engagementId), "edit")
    : null;
  if (!engagement) {
    assertCan(actor, "approve", "docGenerate", {
      branchId: String(doc.branchId),
    });
  }

  const template = await DocTemplate.findById(doc.templateId).lean();
  if (!template) return { error: "That template no longer exists." };

  const built = await buildDocument({ template, engagement, actor });

  const allowed = checkIssue(
    actor,
    template,
    engagement
      ? {
          level: engagement.templateSnapshot?.level ?? "",
          udin: engagement.udin ?? "",
        }
      : null,
    built,
  );
  if (!allowed.ok) return { error: allowed.error };

  // a placeholder nobody ever added a field for would print as {{...}} on a
  // signed letter, which is worse than any blank
  if (built.unknown.length) {
    return {
      error: `This template uses fields that do not exist: ${built.unknown.join(", ")}. A partner has to correct it in Settings → Document templates.`,
    };
  }

  await audited(actor, async (session) => {
    doc.state = "final";
    doc.title = built.title;
    doc.bodyText = built.text;
    doc.templateVersion = template.version ?? 1;
    doc.udin = engagement?.udin ?? "";
    doc.signatoryName = built.signatory?.name ?? actor.name;
    doc.signatoryDesignation = built.signatory?.designation ?? "";
    doc.signatoryMembershipNo = built.signatory?.membershipNo ?? "";
    doc.issuedAt = new Date();
    doc.issuedBy = actor.id;
    doc.issuedByName = actor.name;
    doc.updatedBy = actor.id;
    await doc.save({ session });

    await recordAudit(
      {
        action: ACTIONS.statusChange,
        entityType: "GeneratedDoc",
        entityId: String(doc._id),
        note: `${template.name} issued for ${engagement?.code ?? "a client"}`,
      },
      session,
    );
  });

  if (doc.engagementId) revalidatePath(`/engagements/${doc.engagementId}`);
  return { ok: "Issued. The wording is now fixed." };
}

/**
 * Withdraw a draft. A final is never deleted — it was sent, and the record
 * of having sent it is the point (CLAUDE.md rule 3 means soft delete, and
 * this is softer still: finals cannot be removed at all).
 */
export async function discardDraft(id) {
  const actor = await requireUser();
  await connectDB();

  const doc = await GeneratedDoc.findById(id);
  if (!doc) return { error: "That document no longer exists." };
  if (doc.state === "final") {
    return { error: "An issued document stays on the file." };
  }
  if (doc.engagementId) await loadForDoc(actor, String(doc.engagementId));
  else assertCan(actor, "edit", "docGenerate", { branchId: String(doc.branchId) });

  await audited(actor, (session) => doc.softDelete(actor.id, { session }));

  if (doc.engagementId) revalidatePath(`/engagements/${doc.engagementId}`);
  return { ok: "Draft discarded." };
}

/**
 * The draft as it reads right now, for the panel's preview — resolved live,
 * never stored, so a draft cannot quietly go stale against the record.
 */
export async function previewDoc(id) {
  const actor = await requireUser();
  await connectDB();

  const doc = await GeneratedDoc.findById(id).lean();
  if (!doc) return { error: "That document no longer exists." };

  const engagement = doc.engagementId
    ? await loadEngagementForDoc(String(doc.engagementId))
    : null;
  const target = {
    branchId: String(doc.branchId),
    assigneeId: String(engagement?.assigneeId ?? ""),
    reviewerId: String(engagement?.reviewerId ?? ""),
  };
  if (!can(actor, "view", "docGenerate", target)) {
    return { error: "Not allowed." };
  }

  if (doc.state === "final") {
    return { ok: true, text: doc.bodyText, title: doc.title, gaps: [], unknown: [] };
  }

  const template = await DocTemplate.findById(doc.templateId).lean();
  if (!template) return { error: "That template no longer exists." };
  const built = await buildDocument({ template, engagement, actor });
  return {
    ok: true,
    text: built.text,
    title: built.title,
    gaps: built.gaps,
    unknown: built.unknown,
  };
}

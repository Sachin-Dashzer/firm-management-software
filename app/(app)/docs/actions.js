"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import DocTemplate from "@/models/DocTemplate";
import GeneratedDoc from "@/models/GeneratedDoc";
import { buildDocument, loadEngagementForDoc } from "@/lib/docs/build";
import { checkIssue } from "@/lib/docs/rules";
import Client from "@/models/Client";
import Engagement from "@/models/Engagement";
import { accept, rowForLetter } from "@/lib/engagements/checklist";
import { documentToClient } from "@/lib/mailer/events";

/**
 * Generating documents from templates (P2-8b).
 *
 * A draft is cheap and reversible: it holds no words of its own and
 * re-reads live data every time it is opened. Issuing is the act that
 * matters — it freezes the text, names the signatory, and is checked three
 * ways on the server (`lib/docs/rules.js`), because the screen hiding a
 * button is not a lock (CLAUDE.md rule 1).
 */

/**
 * The engagement and the permission check every door here needs.
 *
 * ## It returns a refusal; it does not throw one
 *
 * It used to `assertCan`, which raises a bare `Error("Not allowed")`.
 * Nothing caught it, so a refusal crashed the server action and the screen
 * said "An unexpected response was received from the server" — a sentence
 * that tells somebody nothing and reads like a broken application rather
 * than a rule. Five actions route through here, so returning the refusal
 * fixes the message on all five at once.
 *
 * ## It passes `assignedUserIds`
 *
 * And this was the actual fault behind that crash. The engagement page
 * computes its permission target with `assignedUserIds` — the helpers on
 * the job, who are on it as far as access goes — and this check left them
 * out. So a helper saw every control on the Letters panel (the page said
 * they could) and every one of them crashed (this said they could not).
 * The two checks have to be asked the same question; now they are.
 *
 * @returns {Promise<{engagement: any, error?: undefined} | {engagement?: undefined, error: string}>}
 */
async function loadForDoc(actor, engagementId, action = "edit") {
  await connectDB();
  const engagement = await loadEngagementForDoc(engagementId);
  if (!engagement) return { error: "That engagement no longer exists." };

  if (
    !can(actor, action, "docGenerate", {
      branchId: String(engagement.branchId),
      assigneeId: String(engagement.assigneeId ?? ""),
      reviewerId: String(engagement.reviewerId ?? ""),
      // the others working on it, exactly as the page's own target reads
      assignedUserIds: (engagement.helperIds ?? []).map(String),
    })
  ) {
    return {
      error:
        action === "approve"
          ? "Issuing a document is the firm putting its name on it — only the people who may sign this tier of work can."
          : "This job is in a branch you cannot write documents for.",
    };
  }

  return { engagement };
}

/**
 * May this person write to this document?
 *
 * A document on a job is checked against the job — branch, assignee,
 * reviewer and the helpers on it. A loose one has only its branch to go
 * on. Three actions asked this question in three slightly different ways,
 * and the `else` branch of each one still used `assertCan`, so the one
 * case nobody tested crashed instead of refusing.
 */
async function guardDoc(actor, doc) {
  if (doc.engagementId) {
    return loadForDoc(actor, String(doc.engagementId));
  }
  if (!can(actor, "edit", "docGenerate", { branchId: String(doc.branchId) })) {
    return { error: "This document belongs to a branch you cannot write to." };
  }
  return { engagement: null };
}

/** Start a draft from a template, against a piece of work. */
export async function createDraft(engagementId, templateId, checklistItemId) {
  const actor = await requireUser();
  const allowed = await loadForDoc(actor, engagementId);
  if (allowed.error) return allowed;
  const engagement = allowed.engagement;

  const template = await DocTemplate.findById(templateId).lean();
  if (!template || !template.active) {
    return { error: "That template is not available." };
  }

  let created = null;
  await audited(actor, async (session) => {
    const [made] = await GeneratedDoc.create(
      [
        {
          templateId: template._id,
          templateCode: template.code,
          templateName: template.name,
          templateVersion: template.version ?? 1,
          clientId: engagement.clientId,
          engagementId: engagement._id,
          /*
            Which row asked for it (owner, 13-11-2026). A checklist row
            may now leave its template open, so matching a letter back to
            its row by template no longer works — the row's own id does.
            It is checked against this engagement's checklist rather than
            trusted, because it arrives from the browser.
          */
          checklistItemId:
            checklistItemId &&
            (engagement.checklist ?? []).some(
              (row) => String(row._id) === String(checklistItemId),
            )
              ? checklistItemId
              : null,
          branchId: engagement.branchId,
          state: "draft",
          title: template.title || template.name,
          createdBy: actor.id,
          updatedBy: actor.id,
        },
      ],
      { session },
    );
    created = made;
  });

  revalidatePath(`/engagements/${engagementId}`);
  /*
    The id comes back now (owner, 13-11-2026). The Letters tab walks
    somebody through writing a letter one step at a time, and step two is
    "check the wording" — which has to know which document step one just
    started. Reading it back off the refreshed list would pick the wrong
    one the moment two people draft at the same time.
  */
  return {
    ok: `Draft ${template.name} started.`,
    id: String(created._id),
  };
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

  /*
    A document on a job is checked against the job; a loose one against
    the branch alone. Either way a refusal comes back as a sentence — this
    used to `assertCan` and crash the action (03-11-2026).
  */
  let engagement = null;
  if (doc.engagementId) {
    const allowed = await loadForDoc(actor, String(doc.engagementId), "edit");
    if (allowed.error) return allowed;
    engagement = allowed.engagement;
  } else if (
    !can(actor, "approve", "docGenerate", { branchId: String(doc.branchId) })
  ) {
    return {
      error:
        "This document is not attached to a job, so only somebody who may issue for its branch can.",
    };
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

  /** The checklist row this letter closes, if it closes one. */
  let closed = "";

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

    /**
     * The step that asked for this letter is satisfied by it (owner,
     * 12-11-2026).
     *
     * A `doc` row on the checklist names the template it is drafted from,
     * so issuing the letter *is* the row being done — and leaving it to be
     * ticked by hand afterwards meant a finished certificate sitting on a
     * step the job still called outstanding. Matched by template, which is
     * the only thing the row says about it, and only a row nobody has
     * settled already: a second letter from the same template does not
     * un-accept the first.
     *
     * It rides inside this transaction, so the letter, the row and both
     * audit entries land together or not at all (CLAUDE.md rule 2).
     */
    if (doc.engagementId) {
      const job = await Engagement.findById(doc.engagementId).session(session);
      const row = rowForLetter(job?.checklist, doc.templateId);
      if (row && accept(row, { id: actor.id, name: actor.name }).ok) {
        job.updatedBy = actor.id;
        await job.save({ session });
        closed = row.name;
      }
    }

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
  return {
    ok: closed
      ? `Issued. The wording is now fixed, and “${closed}” is done.`
      : "Issued. The wording is now fixed.",
  };
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
  const allowed = await guardDoc(actor, doc);
  if (allowed.error) return allowed;

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
    // the helpers on the job, the same as every other check here
    assignedUserIds: (engagement?.helperIds ?? []).map(String),
  };
  if (!can(actor, "view", "docGenerate", target)) {
    return { error: "Not allowed." };
  }

  if (doc.state === "final") {
    return { ok: true, text: doc.bodyText, title: doc.title, gaps: [], unknown: [] };
  }

  /**
   * A draft somebody has written in reads back as **their** words.
   *
   * Re-resolving over a hand-edited draft would throw the edit away every
   * time the panel was opened, which is the one way this feature could
   * lose work. `gaps` is empty on purpose: the resolver's idea of a blank
   * belongs to text the resolver produced, and square brackets a person
   * typed themselves are theirs to keep.
   */
  if (doc.edited) {
    return {
      ok: true,
      text: doc.bodyText,
      title: doc.title,
      edited: true,
      editedByName: doc.editedByName ?? "",
      gaps: [],
      unknown: [],
    };
  }

  const template = await DocTemplate.findById(doc.templateId).lean();
  if (!template) return { error: "That template no longer exists." };
  const built = await buildDocument({ template, engagement, actor });
  return {
    ok: true,
    text: built.text,
    title: built.title,
    edited: false,
    gaps: built.gaps,
    unknown: built.unknown,
  };
}

/**
 * Edit a draft's words in place (owner request, 03-11-2026).
 *
 * A template cannot know everything a particular letter has to say, and
 * the workaround people actually used was the Word button, an edit on a
 * laptop, and a file the firm has no record of having sent. So the draft
 * is editable here, and what goes out is the thing on the record.
 *
 * **Editing stops the re-resolving.** A draft normally re-reads the client
 * record every time it is opened, which is right while nobody has written
 * in it and wrong the moment somebody has — re-reading would throw their
 * paragraph away. So `edited` latches true and from then on the stored
 * text *is* the draft. `resetDraftText` is the way back.
 *
 * A **final** is never editable. It was issued under somebody's name and
 * may have gone to a client; the way to change one is to issue a fresh
 * document that says it replaces it.
 */
export async function saveDraftText(id, formData) {
  const actor = await requireUser();
  await connectDB();

  const doc = await GeneratedDoc.findById(id);
  if (!doc) return { error: "That document no longer exists." };
  if (doc.state === "final") {
    return {
      error:
        "An issued document is not edited — issue a fresh one, and say on it that it replaces this.",
    };
  }

  const allowed = await guardDoc(actor, doc);
  if (allowed.error) return allowed;

  const title = String(formData.get("title") ?? "").trim();
  const bodyText = String(formData.get("bodyText") ?? "");
  if (!bodyText.trim()) {
    return { error: "A letter with no words in it cannot be saved." };
  }
  if (bodyText.length > 40000) {
    return {
      error: "That is longer than a letter can be (40,000 characters).",
    };
  }

  await audited(actor, async (session) => {
    doc.title = title || doc.title;
    doc.bodyText = bodyText;
    doc.edited = true;
    doc.editedAt = new Date();
    doc.editedBy = actor.id;
    doc.editedByName = actor.name;
    doc.updatedBy = actor.id;
    await doc.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "GeneratedDoc",
        entityId: String(doc._id),
        clientId: doc.clientId,
        note: `${doc.templateName || "Draft"} wording edited by hand`,
      },
      session,
    );
  });

  if (doc.engagementId) revalidatePath(`/engagements/${doc.engagementId}`);
  return { ok: "Saved. This wording is what will be issued." };
}

/**
 * Throw away the hand edits and go back to the template.
 *
 * The other half of `saveDraftText`: once `edited` latches, nothing would
 * ever re-read the record again, and somebody who has made a mess of a
 * letter needs a way back that is not "discard it and start again" —
 * because discarding loses the draft's place on the job.
 */
export async function resetDraftText(id) {
  const actor = await requireUser();
  await connectDB();

  const doc = await GeneratedDoc.findById(id);
  if (!doc) return { error: "That document no longer exists." };
  if (doc.state === "final") return { error: "An issued document is fixed." };
  if (!doc.edited) return { error: "This draft has not been edited." };

  const allowed = await guardDoc(actor, doc);
  if (allowed.error) return allowed;

  await audited(actor, async (session) => {
    doc.bodyText = "";
    doc.edited = false;
    doc.editedAt = null;
    doc.editedBy = null;
    doc.editedByName = "";
    doc.updatedBy = actor.id;
    await doc.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "GeneratedDoc",
        entityId: String(doc._id),
        clientId: doc.clientId,
        note: `${doc.templateName || "Draft"} reset to the template wording`,
      },
      session,
    );
  });

  if (doc.engagementId) revalidatePath(`/engagements/${doc.engagementId}`);
  return { ok: "Back to the template wording." };
}

/**
 * Email an issued document to the client (owner request, 03-11-2026).
 *
 * **Only a final goes out.** `issueDoc` is the gate — the tier's
 * signatory, the UDIN where one is required, no unresolved placeholders —
 * so mailing a draft would be a way round all three, and a draft is
 * watermarked working paper anyway. The owner's "update it and send it" is
 * one button in the panel, which issues and then calls this; it is not a
 * shortcut past the gate.
 *
 * The permission is `approve`, not `edit`: sending to a client is the firm
 * speaking, and that is the same ladder that issues.
 */
export async function sendDocToClient(id, formData) {
  const actor = await requireUser();
  await connectDB();

  const doc = await GeneratedDoc.findById(id);
  if (!doc) return { error: "That document no longer exists." };
  if (doc.state !== "final") {
    return {
      error:
        "Issue it first. A draft is a working paper and carries a watermark — issuing is what puts the firm's name on it.",
    };
  }

  /*
    The same `approve` ladder that issues, asked through the same funnel as
    everything else here — so the helpers on a job are counted the way the
    engagement page counts them, and a refusal is a sentence rather than a
    crash.
  */
  if (doc.engagementId) {
    const allowed = await loadForDoc(
      actor,
      String(doc.engagementId),
      "approve",
    );
    if (allowed.error) return allowed;
  } else if (
    !can(actor, "approve", "docGenerate", { branchId: String(doc.branchId) })
  ) {
    return {
      error:
        "Sending a document to a client is the firm speaking — only somebody who may issue for its branch can.",
    };
  }

  const client = await Client.findById(doc.clientId)
    .select("legalName tradeName contacts")
    .lean();
  if (!client) return { error: "That client no longer exists." };

  const note = String(formData?.get?.("note") ?? "").trim();

  /** @type {{sent: string[], error?: string}} */
  let outcome = { sent: [] };
  await audited(actor, async (session) => {
    outcome = await documentToClient(doc, client, actor, note, session);
    if (outcome.error) return;

    doc.sentAt = new Date();
    doc.sentBy = actor.id;
    doc.sentByName = actor.name;
    doc.sentTo = outcome.sent;
    doc.updatedBy = actor.id;
    await doc.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "GeneratedDoc",
        entityId: String(doc._id),
        clientId: doc.clientId,
        note: `${doc.templateName || "Document"} emailed to ${
          outcome.sent.length
        } contact${outcome.sent.length === 1 ? "" : "s"}`,
      },
      session,
    );
  });

  if (outcome.error) return { error: outcome.error };

  if (doc.engagementId) revalidatePath(`/engagements/${doc.engagementId}`);
  return {
    ok: `Sent to ${outcome.sent.length} contact${
      outcome.sent.length === 1 ? "" : "s"
    } at ${client.tradeName || client.legalName}.`,
  };
}

/**
 * Issue it and send it — the owner's "update it here and send to clients
 * directly", as one button.
 *
 * It calls the two existing actions rather than opening a third path, so
 * there is exactly one place that issues and one that sends, and neither
 * gate can be skipped by whichever somebody reaches first.
 */
export async function issueAndSend(id, formData) {
  const issued = await issueDoc(id);
  if (issued.error) return issued;

  const sent = await sendDocToClient(id, formData);
  if (sent.error) {
    /*
      The issue stuck and only the sending failed. Saying "that did not
      work" would have somebody issue it a second time, and a second final
      of the same letter is the thing finals exist to prevent.
    */
    return { error: `Issued, but not sent: ${sent.error}` };
  }
  return { ok: `Issued. ${sent.ok}` };
}

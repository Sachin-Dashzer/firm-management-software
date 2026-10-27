"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import Engagement from "@/models/Engagement";
import RuleConfirmation from "@/models/RuleConfirmation";
import { readGstWorkbook } from "@/lib/gst/read";
import { validateGstSheets, summariseIssues } from "@/lib/gst/validate";
import { computeGst, SET_OFF_ORDER } from "@/lib/gst/compute";
import { checklistReplacement } from "@/lib/mailer/events";

/**
 * The month's GST preparation (P3-12).
 *
 * One action does the whole middle of the cycle: the workbook comes in, it
 * is checked, and either it is sent back with a list the client's
 * bookkeeper can work through, or the indicative computation is worked out
 * from it.
 *
 * The confirmations for the set-off order are read from the same collection
 * the notice-law table uses, under the kind `GST-SETOFF`. One place where
 * the firm says "a partner has read this rule" is better than two.
 */

/**
 * The kind these confirmations are filed under in
 * `noticeLawConfirmations`. Not exported: a `"use server"` file may only
 * export async functions, and nothing outside needs it.
 */
const SETOFF_KIND = "GST-SETOFF";

async function loadForWork(actor, id) {
  await connectDB();
  const engagement = await Engagement.findById(id);
  if (!engagement) {
    const err = new Error("That engagement no longer exists.");
    err.code = "NOT_FOUND";
    throw err;
  }
  assertCan(actor, "edit", "engagementsWork", {
    branchId: String(engagement.branchId),
    assigneeId: String(engagement.assigneeId ?? ""),
    reviewerId: String(engagement.reviewerId ?? ""),
  });
  return engagement;
}

/** The set-off rules a partner has confirmed, for `computeGst`. */
export async function setOffConfirmations() {
  await connectDB();
  const rows = await RuleConfirmation.find({ kind: SETOFF_KIND })
    .select("key confirmedAt confirmedByName note")
    .lean();
  return rows.map((row) => ({
    key: row.key,
    confirmedAt: row.confirmedAt,
    confirmedByName: row.confirmedByName,
    note: row.note,
  }));
}

/**
 * A partner confirms one rule of the set-off order.
 *
 * Partner-only and recorded with their name, exactly as the notice-law
 * table works (P3-11, D48). The arithmetic runs without it — a bookkeeper
 * needs the figures — but the computation is marked unconfirmed until all
 * three rules are ticked, and the screen will not offer it to a client in
 * that state.
 */
export async function confirmSetOffRule(key, formData) {
  const actor = await requireUser();
  assertCan(actor, "approve", "feeWriteOff");

  const rule = SET_OFF_ORDER.rules.find((row) => row.key === key);
  if (!rule) return { error: "No such rule." };

  await connectDB();
  const note = String(formData?.get("note") ?? "").trim();

  await audited(actor, async (session) => {
    const row = await RuleConfirmation.findOneAndUpdate(
      { kind: SETOFF_KIND, key },
      {
        $set: {
          text: rule.text,
          cite: rule.cite,
          note,
          confirmedAt: new Date(),
          confirmedBy: actor.id,
          confirmedByName: actor.name,
          updatedBy: actor.id,
        },
        $setOnInsert: { kind: SETOFF_KIND, key, createdBy: actor.id },
      },
      { new: true, upsert: true, session },
    );

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "RuleConfirmation",
        entityId: row._id,
        note: `GST set-off rule "${key}" confirmed: ${rule.cite}${note ? ` — ${note}` : ""}`,
      },
      session,
    );
  });

  revalidatePath("/engagements", "layout");
  return { ok: "Confirmed, with your name against it." };
}

/**
 * The client's workbook arrives: check it, then either send it back or work
 * out what the month looks like.
 *
 * The file itself is not stored by this action — uploads go through the
 * storage adapter and the document list, which is the one way in (spec
 * §14). What is stored here is the reading of it.
 */
export async function uploadGstWorkbook(id, formData) {
  const actor = await requireUser();
  const engagement = await loadForWork(actor, id);

  const file = formData.get("workbook");
  if (!file || typeof file.arrayBuffer !== "function") {
    return { error: "Choose the workbook the client sent." };
  }
  if (file.size > 12 * 1024 * 1024) {
    return {
      error:
        "That file is over 12 MB. Ask for the data as a workbook rather than a scan.",
    };
  }

  let read;
  try {
    read = await readGstWorkbook(Buffer.from(await file.arrayBuffer()));
  } catch {
    return {
      error:
        "That file could not be opened as a workbook. If the client sent a PDF or a photo, ask for the spreadsheet.",
    };
  }

  if (read.missing.length === Object.keys(read.sheets).length) {
    return {
      error: `None of the sheets we asked for are in that file (${read.missing.join(", ")}). It may be the wrong attachment.`,
    };
  }

  const checked = validateGstSheets(read.sheets);
  const confirmations = await setOffConfirmations();
  const computation = checked.ok
    ? computeGst(read.sheets, confirmations)
    : null;

  const before = engagement.gstPrep?.submissionCount ?? 0;

  await audited(actor, async (session) => {
    engagement.gstPrep = {
      ...(engagement.gstPrep?.toObject?.() ?? engagement.gstPrep ?? {}),
      fileName: file.name ?? "",
      uploadedAt: new Date(),
      uploadedBy: actor.id,
      uploadedByName: actor.name,
      counts: checked.counts,
      missingSheets: read.missing,
      issues: checked.issues,
      submissionCount: before + 1,
      computation,
      computedAt: computation ? new Date() : null,
    };
    engagement.updatedBy = actor.id;
    await engagement.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Engagement",
        entityId: engagement._id,
        clientId: engagement.clientId,
        note: checked.ok
          ? `GST data checked and accepted (submission ${before + 1}): ${Object.entries(
              checked.counts,
            )
              .map(([key, n]) => `${key} ${n}`)
              .join(", ")}`
          : `GST data checked (submission ${before + 1}): ${checked.issues.length} ${
              checked.issues.length === 1 ? "thing" : "things"
            } to correct`,
      },
      session,
    );
  });

  revalidatePath(`/engagements/${id}`);

  if (!checked.ok) {
    return {
      ok: `${checked.issues.length} ${checked.issues.length === 1 ? "thing" : "things"} to correct. Send it back to the client with the list, or fix it yourself and upload again.`,
      issues: summariseIssues(checked.issues),
    };
  }

  return {
    ok: `Checked and clean. ${
      computation.confirmed
        ? "The indicative computation is below."
        : "The indicative computation is below, and the set-off order still needs a partner's confirmation."
    }`,
  };
}

/**
 * Send the list back to the client, in their own bookkeeper's terms.
 *
 * It goes through the mail queue like everything else, and the client-facing
 * gate at P3-10 governs it — this is one message about one file rather than
 * a batch, so it is not held for approval.
 */
export async function sendGstDataBack(id) {
  const actor = await requireUser();
  const engagement = await loadForWork(actor, id);

  const issues = engagement.gstPrep?.issues ?? [];
  if (!issues.length) {
    return { error: "There is nothing to send back — the file was clean." };
  }

  const grouped = summariseIssues(issues);
  const body = grouped
    .map((group) => `${group.sheet}:\n  ${group.lines.join("\n  ")}`)
    .join("\n\n");

  await audited(actor, async (session) => {
    engagement.gstPrep.sentBackAt = new Date();
    engagement.gstPrep.sentBackCount =
      (engagement.gstPrep.sentBackCount ?? 0) + 1;
    engagement.updatedBy = actor.id;
    await engagement.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Engagement",
        entityId: engagement._id,
        clientId: engagement.clientId,
        note: `GST data sent back with ${issues.length} corrections`,
      },
      session,
    );
  });

  /**
   * Reuses the replacement-requested message: it is the same act — a file
   * came in, it is not right, and here is why in words the client can use.
   * The mailer's own guard decides whether it reaches a client at all.
   */
  await checklistReplacement(engagement, {
    name: `GST data for ${engagement.periodLabel || engagement.period}`,
    rejectReason: body,
  }).catch(() => {});

  revalidatePath(`/engagements/${id}`);
  return {
    ok: "Sent back with the list. It is on the record, so the next file can be checked against it.",
  };
}

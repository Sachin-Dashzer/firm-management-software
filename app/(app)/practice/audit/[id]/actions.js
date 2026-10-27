"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import { toPaise } from "@/lib/money";
import Engagement from "@/models/Engagement";
import AuditFile from "@/models/AuditFile";
import RuleConfirmation from "@/models/RuleConfirmation";
import {
  AUDIT_STAGES,
  CONFIRM_KIND,
  buildAuditAreas,
  AUDIT_AREAS,
} from "@/lib/audit-studio/standards";
import {
  moveException,
  checkStageMove,
  RISKS,
} from "@/lib/audit-studio/exceptions";
import { buildLedgerTests } from "@/lib/audit-studio/tests";
import { buildReportAnswers } from "@/lib/audit-studio/reporting";

/**
 * Working an audit file (P3-13).
 *
 * The gates here are the ones a peer reviewer would ask about: an exception
 * is closed by a partner or not at all, and nothing reaches a signed report
 * while something is open. Both live in `lib/audit-studio/exceptions.js` so
 * the screen and the server ask the same function.
 */

async function loadFile(actor, engagementId, { create = false } = {}) {
  await connectDB();
  const engagement = await Engagement.findById(engagementId)
    .select(
      "clientId branchId assigneeId reviewerId templateSnapshot code periodLabel period",
    )
    .lean();
  if (!engagement) {
    const err = new Error("That engagement no longer exists.");
    err.code = "NOT_FOUND";
    throw err;
  }

  assertCan(actor, "edit", "practice", {
    branchId: String(engagement.branchId),
    assigneeId: String(engagement.assigneeId ?? ""),
    reviewerId: String(engagement.reviewerId ?? ""),
  });

  let file = await AuditFile.findOne({ engagementId });
  if (!file && create) {
    file = new AuditFile({
      engagementId,
      clientId: engagement.clientId,
      branchId: engagement.branchId,
      areas: buildAuditAreas(),
      // the testing programme and the clause list are copied in at the same
      // moment and for the same reason (P3-14): changing either next year
      // must not reach back into a file that has been signed
      tests: buildLedgerTests(),
      reportAnswers: buildReportAnswers(),
      createdBy: actor.id,
      updatedBy: actor.id,
    });
  }
  return { engagement, file };
}

/** Make up the file, with the programme copied in from the index. */
export async function openAuditFile(engagementId) {
  const actor = await requireUser();
  const { file } = await loadFile(actor, engagementId, { create: true });
  if (!file.isNew) return { error: "The file is already open." };

  await audited(actor, async (session) => {
    await file.save({ session });
    await recordAudit(
      {
        action: ACTIONS.create,
        entityType: "AuditFile",
        entityId: file._id,
        clientId: file.clientId,
        note: `Audit file opened: ${file.areas.length} areas, ${file.tests.length} tests, ${file.reportAnswers.length} clauses`,
      },
      session,
    );
  });

  revalidatePath(`/practice/audit/${engagementId}`);
  return { ok: "File opened. The programme is copied in as it stands today." };
}

/** Tick one question on an area's programme, or put it back. */
export async function setAuditQuestion(
  engagementId,
  areaId,
  questionId,
  done,
  formData,
) {
  const actor = await requireUser();
  const { file } = await loadFile(actor, engagementId);
  if (!file) return { error: "No file yet." };

  const area = file.areas.id(areaId);
  const question = area?.questions.id(questionId);
  if (!question) return { error: "That question is gone." };

  await audited(actor, async (session) => {
    question.done = Boolean(done);
    question.doneAt = done ? new Date() : null;
    question.doneBy = done ? actor.id : null;
    question.doneByName = done ? actor.name : "";
    const note = String(formData?.get("note") ?? "").trim();
    if (note) question.note = note;
    file.updatedBy = actor.id;
    await file.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "AuditFile",
        entityId: file._id,
        clientId: file.clientId,
        note: `${area.key} · ${question.text}: ${done ? "done" : "reopened"}`,
      },
      session,
    );
  });

  revalidatePath(`/practice/audit/${engagementId}`);
  return { ok: done ? "Ticked." : "Reopened." };
}

/** Materiality, with the basis — SA 320 wants the reasoning, not the figure. */
export async function setMateriality(engagementId, formData) {
  const actor = await requireUser();
  const { file } = await loadFile(actor, engagementId);
  if (!file) return { error: "No file yet." };

  const basis = String(formData.get("basis") ?? "").trim();
  if (basis.length < 10) {
    return {
      error:
        "Write the basis, not only the figure. A materiality nobody can explain is a materiality nobody can defend.",
    };
  }

  const read = (name) => {
    const raw = String(formData.get(name) ?? "").trim();
    if (!raw) return 0;
    try {
      return toPaise(raw);
    } catch {
      return null;
    }
  };

  const overall = read("materiality");
  const performance = read("performance");
  const trivial = read("trivial");
  if (overall === null || performance === null || trivial === null) {
    return { error: "One of those figures is not an amount." };
  }
  if (overall > 0 && performance > overall) {
    return {
      error:
        "Performance materiality is lower than overall materiality, not higher.",
    };
  }

  await audited(actor, async (session) => {
    file.materialityPaise = overall;
    file.materialityBasis = basis;
    file.performanceMaterialityPaise = performance;
    file.trivialPaise = trivial;
    file.updatedBy = actor.id;
    await file.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "AuditFile",
        entityId: file._id,
        clientId: file.clientId,
        note: `Materiality set — ${basis}`,
      },
      session,
    );
  });

  revalidatePath(`/practice/audit/${engagementId}`);
  return { ok: "Materiality and its basis are on the file." };
}

/** Something the audit has found. */
export async function raiseException(engagementId, formData) {
  const actor = await requireUser();
  const { file } = await loadFile(actor, engagementId);
  if (!file) return { error: "No file yet." };

  const what = String(formData.get("what") ?? "").trim();
  if (what.length < 10) {
    return { error: "Say what was found, in enough words to be read later." };
  }
  const risk = String(formData.get("risk") ?? "Medium");
  if (!RISKS.includes(risk)) return { error: "Unknown risk." };

  let amountPaise = 0;
  const raw = String(formData.get("amount") ?? "").trim();
  if (raw) {
    try {
      amountPaise = toPaise(raw);
    } catch {
      return { error: "That amount is not an amount." };
    }
  }

  await audited(actor, async (session) => {
    file.exceptions.push({
      area: String(formData.get("area") ?? "").trim(),
      what,
      risk,
      amountPaise,
      state: "Open",
      raisedBy: actor.id,
      raisedByName: actor.name,
    });
    file.updatedBy = actor.id;
    await file.save({ session });

    await recordAudit(
      {
        action: ACTIONS.create,
        entityType: "AuditFile",
        entityId: file._id,
        clientId: file.clientId,
        note: `Exception raised (${risk}): ${what}`,
      },
      session,
    );
  });

  revalidatePath(`/practice/audit/${engagementId}`);
  return { ok: "Raised. It stays open until it is verified or explained." };
}

/** Move an exception along its life. */
export async function moveAuditException(
  engagementId,
  exceptionId,
  action,
  formData,
) {
  const actor = await requireUser();
  const { file } = await loadFile(actor, engagementId);
  if (!file) return { error: "No file yet." };

  const row = file.exceptions.id(exceptionId);
  if (!row) return { error: "That exception is gone." };

  let amountPaise;
  const raw = String(formData?.get("amount") ?? "").trim();
  if (raw) {
    try {
      amountPaise = toPaise(raw);
    } catch {
      return { error: "That amount is not an amount." };
    }
  }

  const result = moveException(
    row,
    action,
    { reason: formData?.get("reason") ?? "", amountPaise },
    { id: actor.id, name: actor.name, role: actor.role },
  );
  if (!result.ok) return { error: result.error };

  await audited(actor, async (session) => {
    file.updatedBy = actor.id;
    await file.save({ session });
    await recordAudit(
      {
        action: ACTIONS.statusChange,
        entityType: "AuditFile",
        entityId: file._id,
        clientId: file.clientId,
        diff: { exception: [result.from, result.to] },
        note: `${row.what}: ${result.from} → ${result.to}${row.lastReason ? ` — ${row.lastReason}` : ""}`,
      },
      session,
    );
  });

  revalidatePath(`/practice/audit/${engagementId}`);
  return { ok: `Moved to ${result.to}.` };
}

/** Move the file to the next stage, if the exceptions allow it. */
export async function setAuditStage(engagementId, stage) {
  const actor = await requireUser();
  const { file } = await loadFile(actor, engagementId);
  if (!file) return { error: "No file yet." };
  if (!AUDIT_STAGES.includes(stage)) return { error: "Unknown stage." };

  const allowed = checkStageMove(stage, file.exceptions);
  if (!allowed.ok) return { error: allowed.error };

  const from = file.stage;

  await audited(actor, async (session) => {
    file.stage = stage;
    file.stageHistory.push({
      at: new Date(),
      from,
      to: stage,
      byId: actor.id,
      byName: actor.name,
    });
    file.updatedBy = actor.id;
    await file.save({ session });

    await recordAudit(
      {
        action: ACTIONS.statusChange,
        entityType: "AuditFile",
        entityId: file._id,
        clientId: file.clientId,
        diff: { stage: [from, stage] },
      },
      session,
    );
  });

  revalidatePath(`/practice/audit/${engagementId}`);
  return { ok: `Moved to ${stage}.` };
}

/**
 * A partner confirms the standards an area answers to (P3-13, D48's rule
 * again).
 *
 * The references are pointers taken from the design prototype. Until a
 * partner has read the standard and said the programme does answer to it,
 * the area says so on screen rather than implying the firm has complied.
 */
export async function confirmAuditArea(areaKey, formData) {
  const actor = await requireUser();
  assertCan(actor, "approve", "feeWriteOff");

  const area = AUDIT_AREAS.find((row) => row.key === areaKey);
  if (!area) return { error: "No such area." };

  await connectDB();
  const note = String(formData?.get("note") ?? "").trim();

  await audited(actor, async (session) => {
    const row = await RuleConfirmation.findOneAndUpdate(
      { kind: CONFIRM_KIND, key: areaKey },
      {
        $set: {
          text: `${area.name}: the programme answers to ${area.standards}`,
          cite: area.standards,
          note,
          confirmedAt: new Date(),
          confirmedBy: actor.id,
          confirmedByName: actor.name,
          updatedBy: actor.id,
        },
        $setOnInsert: { kind: CONFIRM_KIND, key: areaKey, createdBy: actor.id },
      },
      { new: true, upsert: true, session },
    );

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "RuleConfirmation",
        entityId: row._id,
        note: `Audit area ${areaKey} confirmed against ${area.standards}${note ? ` — ${note}` : ""}`,
      },
      session,
    );
  });

  revalidatePath("/practice/audit", "layout");
  return { ok: `${area.name} confirmed against ${area.standards}.` };
}

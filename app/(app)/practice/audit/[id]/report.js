"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import Engagement from "@/models/Engagement";
import AuditFile from "@/models/AuditFile";
import {
  OPINION_TYPES,
  isLocked,
  signReport,
  openAmendment,
  conclusionSignature,
} from "@/lib/audit-studio/reporting";
import { checkUdinShape } from "@/lib/practice/udin";
import {
  reportFrom,
  reportText,
  unwritten,
} from "@/lib/audit-studio/report700";

/**
 * The reporting half of an audit file (P3-14).
 *
 * Separate from `actions.js` because it is a separate question: that file is
 * about doing the audit, this one about what the firm says at the end of it
 * — and the rules are different. Almost everything here refuses to run once
 * the report is signed, because a signed report is a snapshot and the way
 * to change one is an amendment.
 */

async function loadFile(actor, engagementId) {
  await connectDB();
  const engagement = await Engagement.findById(engagementId)
    .select("branchId assigneeId reviewerId")
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
  return AuditFile.findOne({ engagementId });
}

/** Refuse anything that would change a signed report. */
function lockedError(file) {
  if (!isLocked(file)) return null;
  return {
    error: `Version ${file.signed.version} is signed and locked. Open an amendment to change the file.`,
  };
}

/** Record what one of the sixteen ledger tests was run over, and found. */
export async function recordLedgerTest(engagementId, testId, formData) {
  const actor = await requireUser();
  const file = await loadFile(actor, engagementId);
  if (!file) return { error: "No file yet." };
  const locked = lockedError(file);
  if (locked) return locked;

  const row = file.tests.id(testId);
  if (!row) return { error: "That test is not on this file." };

  const population = String(formData.get("population") ?? "").trim();
  if (!population) {
    return {
      error:
        "Say what it was run over. A test with no population recorded tells a reviewer nothing about scope.",
    };
  }

  /**
   * Not a checkbox, because a checkbox defaults to one of the answers. "The
   * whole population" and "a sample" are different audits, and which one it
   * was is not something to inherit from a default.
   */
  const whole = String(formData.get("whole") ?? "");
  if (whole !== "yes" && whole !== "no") {
    return {
      error:
        "Say whether this was the whole population or a sample. The two are different audits.",
    };
  }

  const flags = Number(String(formData.get("flags") ?? "").trim());
  if (!Number.isInteger(flags) || flags < 0) {
    return { error: "How many did it flag? Zero is an answer." };
  }

  await audited(actor, async (session) => {
    row.population = population;
    row.wholePopulation = whole === "yes";
    row.flags = flags;
    row.note = String(formData.get("note") ?? "").trim();
    row.ranAt = new Date();
    row.ranBy = actor.id;
    row.ranByName = actor.name;
    file.updatedBy = actor.id;
    await file.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "AuditFile",
        entityId: file._id,
        clientId: file.clientId,
        note: `${row.key} run over ${population}${whole === "no" ? " (a sample)" : ""}: ${flags} flagged`,
      },
      session,
    );
  });

  revalidatePath(`/practice/audit/${engagementId}`);
  return {
    ok:
      flags > 0
        ? `${flags} flagged. Raise each one as an exception — a test that found things with nothing against it is the worst state a file can be in.`
        : "Recorded.",
  };
}

/** Answer one CARO or 3CD clause, or mark it not applicable. */
export async function answerClause(engagementId, answerId, formData) {
  const actor = await requireUser();
  const file = await loadFile(actor, engagementId);
  if (!file) return { error: "No file yet." };
  const locked = lockedError(file);
  if (locked) return locked;

  const row = file.reportAnswers.id(answerId);
  if (!row) return { error: "That clause is not on this file." };

  const notApplicable = String(formData.get("notApplicable") ?? "") === "1";
  const answer = String(formData.get("answer") ?? "").trim();
  if (!notApplicable && !answer) {
    return { error: "Answer it, or mark it not applicable." };
  }

  await audited(actor, async (session) => {
    row.answer = answer;
    row.notApplicable = notApplicable;
    row.answeredBy = actor.id;
    row.answeredByName = actor.name;
    row.answeredAt = new Date();
    file.updatedBy = actor.id;
    await file.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "AuditFile",
        entityId: file._id,
        clientId: file.clientId,
        note: `${row.key} answered${notApplicable ? " — not applicable" : ""}`,
      },
      session,
    );
  });

  revalidatePath(`/practice/audit/${engagementId}`);
  return { ok: `${row.key} answered.` };
}

/** What a matter does to the report, where it does anything. */
export async function setReportEffect(engagementId, exceptionId, formData) {
  const actor = await requireUser();
  const file = await loadFile(actor, engagementId);
  if (!file) return { error: "No file yet." };
  const locked = lockedError(file);
  if (locked) return locked;

  const row = file.exceptions.id(exceptionId);
  if (!row) return { error: "That matter is gone." };

  const effect = String(formData.get("effect") ?? "").trim();
  if (effect && !["Qualify", "Adverse", "Emphasis"].includes(effect)) {
    return { error: "Unknown effect on the report." };
  }
  const wording = String(formData.get("wording") ?? "").trim();
  if (effect && wording.length < 10) {
    return {
      error:
        "Write the words the report will carry. A matter that changes an opinion has to be describable in the report itself.",
    };
  }

  await audited(actor, async (session) => {
    row.reportEffect = effect;
    row.reportWording = effect ? wording : "";
    file.updatedBy = actor.id;
    await file.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "AuditFile",
        entityId: file._id,
        clientId: file.clientId,
        note: effect
          ? `${row.what}: carries into the report as ${effect}`
          : `${row.what}: does not reach the report`,
      },
      session,
    );
  });

  revalidatePath(`/practice/audit/${engagementId}`);
  return {
    ok: effect
      ? `Carried into the report as ${effect}. The overall conclusion will need giving again.`
      : "Does not reach the report.",
  };
}

/** Layer three: the opinion the firm will sign, and its UDIN. */
export async function setOpinion(engagementId, formData) {
  const actor = await requireUser();
  const file = await loadFile(actor, engagementId);
  if (!file) return { error: "No file yet." };
  const locked = lockedError(file);
  if (locked) return locked;

  const type = String(formData.get("type") ?? "");
  if (!OPINION_TYPES.includes(type)) return { error: "Choose an opinion." };

  const basis = String(formData.get("basis") ?? "").trim();
  if (type !== "Unmodified" && basis.length < 10) {
    return {
      error:
        "A modified opinion needs its basis, in the words the report will carry (SA 705).",
    };
  }

  const udin = String(formData.get("udin") ?? "").trim();
  if (udin) {
    const shape = checkUdinShape(udin);
    if (!shape.ok) return { error: shape.error };
  }

  await audited(actor, async (session) => {
    file.opinion = {
      type,
      basis,
      emphasis: String(formData.get("emphasis") ?? "").trim(),
      udin,
    };
    file.updatedBy = actor.id;
    await file.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "AuditFile",
        entityId: file._id,
        clientId: file.clientId,
        note: `Opinion set to ${type}${udin ? ` · UDIN ${udin}` : ""}`,
      },
      session,
    );
  });

  revalidatePath(`/practice/audit/${engagementId}`);
  return {
    ok: "Opinion recorded. The overall conclusion is given against it, so it needs giving again.",
  };
}

/**
 * Layer two: the reviewer's own conclusion, stamped with a fingerprint of
 * what it was given about.
 */
export async function recordOverall(engagementId, formData) {
  const actor = await requireUser();
  const file = await loadFile(actor, engagementId);
  if (!file) return { error: "No file yet." };
  const locked = lockedError(file);
  if (locked) return locked;

  const text = String(formData.get("text") ?? "").trim();
  if (text.length < 20) {
    return {
      error:
        "Write the conclusion. What the matters suggest is arithmetic; this is the judgement, and it is the one a reviewer reads.",
    };
  }

  await audited(actor, async (session) => {
    file.overall = {
      text,
      signature: conclusionSignature(file),
      byId: actor.id,
      byName: actor.name,
      at: new Date(),
    };
    file.updatedBy = actor.id;
    await file.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "AuditFile",
        entityId: file._id,
        clientId: file.clientId,
        note: `Overall conclusion recorded: ${text.slice(0, 120)}`,
      },
      session,
    );
  });

  revalidatePath(`/practice/audit/${engagementId}`);
  return { ok: "Recorded against the file as it now stands." };
}

/**
 * The switches that restructure the report (P3-15).
 *
 * Saved together, because they are read together: the screen says what
 * each one will add or take away before anybody flips it, and a half-saved
 * set of switches would be a report nobody asked for.
 */
export async function setReportStructure(engagementId, formData) {
  const actor = await requireUser();
  const file = await loadFile(actor, engagementId);
  if (!file) return { error: "No file yet." };
  const locked = lockedError(file);
  if (locked) return locked;

  const was = reportFrom(file).map((row) => row.key);

  await audited(actor, async (session) => {
    file.reportSwitches = {
      goingConcern: formData.get("goingConcern") === "on",
      listed: formData.get("listed") === "on",
      companiesAct: formData.get("companiesAct") === "on",
      otherInformation: formData.get("otherInformation") === "on",
      otherMatter: String(formData.get("otherMatter") ?? "").trim(),
    };
    file.updatedBy = actor.id;
    await file.save({ session });

    const now = reportFrom(file).map((row) => row.key);
    const added = now.filter((key) => !was.includes(key));
    const removed = was.filter((key) => !now.includes(key));

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "AuditFile",
        entityId: file._id,
        clientId: file.clientId,
        note: `Report structure changed${added.length ? ` — added ${added.join(", ")}` : ""}${removed.length ? ` — removed ${removed.join(", ")}` : ""}`,
      },
      session,
    );
  });

  revalidatePath(`/practice/audit/${engagementId}`);
  return { ok: "The report's sections now follow those switches." };
}

/** Write one of the report's open sections. */
export async function saveReportSection(engagementId, key, formData) {
  const actor = await requireUser();
  const file = await loadFile(actor, engagementId);
  if (!file) return { error: "No file yet." };
  const locked = lockedError(file);
  if (locked) return locked;

  const section = reportFrom(file).find((row) => row.key === key);
  if (!section) {
    return { error: "That section is not in this report." };
  }
  /**
   * The server's own refusal. A locked section is the standard's wording,
   * and the point of a generator is that nobody improves it by hand.
   */
  if (section.locked) {
    return {
      error: `"${section.title}" is the standard's own wording and is not edited here.`,
    };
  }

  const body = String(formData.get("body") ?? "").trim();

  await audited(actor, async (session) => {
    const existing = (file.reportSections ?? []).find((row) => row.key === key);
    if (existing) existing.body = body;
    else file.reportSections.push({ key, body });
    file.updatedBy = actor.id;
    await file.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "AuditFile",
        entityId: file._id,
        clientId: file.clientId,
        note: `Report section "${section.title}" written`,
      },
      session,
    );
  });

  revalidatePath(`/practice/audit/${engagementId}`);
  return { ok: `${section.title} saved.` };
}

/** Sign it. The file becomes a snapshot and locks. */
export async function signAuditReport(engagementId, formData) {
  const actor = await requireUser();
  const file = await loadFile(actor, engagementId);
  if (!file) return { error: "No file yet." };

  /**
   * The report itself, assembled in SA 700's order (P3-15). What gets
   * snapshotted is the report, not a note about it — and a section the
   * standard puts in this report and nobody has written is a refusal
   * here, because an empty heading in an issued report is worse than a
   * missing one.
   */
  const sections = reportFrom(file);
  const missing = unwritten(sections);
  if (missing.length) {
    return {
      error: `The report has ${missing.length} ${missing.length === 1 ? "section" : "sections"} the standard puts in it that nobody has written: ${missing.join("; ")}.`,
    };
  }

  const result = signReport(
    file,
    { id: actor.id, name: actor.name, role: actor.role },
    { text: reportText(sections) },
  );
  if (!result.ok) return { error: result.error };

  await audited(actor, async (session) => {
    file.stage = "Report + UDIN";
    file.updatedBy = actor.id;
    await file.save({ session });

    await recordAudit(
      {
        action: ACTIONS.statusChange,
        entityType: "AuditFile",
        entityId: file._id,
        clientId: file.clientId,
        note: `Report version ${result.version} signed — ${result.snapshot.opinionType}, UDIN ${result.snapshot.udin}`,
      },
      session,
    );
  });

  revalidatePath(`/practice/audit/${engagementId}`);
  return {
    ok: `Version ${result.version} is signed and locked. Changing anything now is an amendment, and it needs its own UDIN.`,
  };
}

/** Open an amendment on a signed report. */
export async function amendAuditReport(engagementId, formData) {
  const actor = await requireUser();
  const file = await loadFile(actor, engagementId);
  if (!file) return { error: "No file yet." };

  const result = openAmendment(file, formData?.get("reason") ?? "", {
    id: actor.id,
    name: actor.name,
    role: actor.role,
  });
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
        note: `Amendment opened for version ${result.version} — ${file.amendmentReason}`,
      },
      session,
    );
  });

  revalidatePath(`/practice/audit/${engagementId}`);
  return {
    ok: `Version ${result.version} is open. The earlier version stays on the file exactly as it was issued, and this one needs a new UDIN.`,
  };
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { assertCan, can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import { toPaise } from "@/lib/money";
import { parseCSVObjects } from "@/lib/csv";
import Engagement from "@/models/Engagement";
import AuditFile from "@/models/AuditFile";
import Sample from "@/models/Sample";
import {
  METHOD_KEYS,
  csvFromPaste,
  draw,
  newSeed,
  projected,
  readPopulation,
} from "@/lib/practice/sampling";

/**
 * Drawing a sample and vouching it (P3-30, SA 530).
 *
 * The gates here are the ones a peer reviewer would ask about:
 *
 *  - **A locked sample cannot be redrawn.** Redrawing after seeing an
 *    exception is how a sample stops being a sample, so the lock refuses
 *    it rather than warning about it.
 *  - **A locked sample's columns cannot change either**, because a mark
 *    recorded against "GRN" that silently becomes a mark against
 *    "Approval" is worse than no mark.
 *  - **An exception needs words before it can be sent on.** A matter on
 *    the misstatement summary that says only "item 17" is a matter nobody
 *    can answer in three years.
 */

const GONE = { error: "That sample no longer exists." };

/** The sample, and the permission to touch it. */
async function load(actor, id, { forEdit = true } = {}) {
  await connectDB();
  const sample = await Sample.findById(String(id ?? ""));
  if (!sample) return null;

  const engagement = await Engagement.findById(sample.engagementId)
    .select("branchId assigneeId reviewerId status code periodLabel period")
    .lean();

  const target = {
    branchId: String(sample.branchId),
    assigneeId: String(engagement?.assigneeId ?? ""),
    reviewerId: String(engagement?.reviewerId ?? ""),
  };
  assertCan(actor, forEdit ? "edit" : "view", "practice", target);

  return { sample, engagement };
}

function touch(sample) {
  revalidatePath("/practice/sampling");
  revalidatePath(`/practice/sampling/${sample._id}`);
  revalidatePath(`/practice/audit/${sample.engagementId}`);
}

/**
 * Start a working paper.
 *
 * It needs an audit engagement: a sample is evidence on a file, and one
 * floating free is a spreadsheet with extra steps.
 */
export async function startSample(_prev, formData) {
  const actor = await requireUser();
  assertCan(actor, "edit", "practice");

  const engagementId = String(formData.get("engagementId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!engagementId) return { error: "Which audit is this for?" };
  if (name.length < 3) {
    return { error: "Say what is being sampled — purchases, repairs, wages." };
  }

  await connectDB();
  const engagement = await Engagement.findById(engagementId)
    .select("clientId branchId assigneeId reviewerId")
    .lean();
  if (!engagement) return { error: "That audit no longer exists." };

  assertCan(actor, "edit", "practice", {
    branchId: String(engagement.branchId),
    assigneeId: String(engagement.assigneeId ?? ""),
    reviewerId: String(engagement.reviewerId ?? ""),
  });

  /**
   * The audit file has to exist first. Not created silently here: opening
   * a file copies in the whole programme as it stands today, which is a
   * deliberate act with its own audit entry, and doing it as a side effect
   * of starting a working paper would hide it.
   */
  const file = await AuditFile.findOne({ engagementId }).select("_id").lean();
  if (!file) {
    return {
      error:
        "There is no audit file on that engagement yet. Open the file first, so this sample has a programme to sit in.",
    };
  }

  let sample;
  await audited(actor, async (session) => {
    [sample] = await Sample.create(
      [
        {
          engagementId,
          clientId: engagement.clientId,
          branchId: engagement.branchId,
          name,
          ref: String(formData.get("ref") ?? "").trim(),
          area: String(formData.get("area") ?? "").trim(),
          seed: newSeed(),
          attributes: DEFAULT_ATTRIBUTES,
          createdBy: actor.id,
          createdByName: actor.name ?? "",
          updatedBy: actor.id,
        },
      ],
      { session, ordered: true },
    );
  });

  revalidatePath("/practice/sampling");
  /* Redirected from the action rather than pushed from an effect: the
     revalidation of the list and the push race, and the race is
     winnable either way. */
  redirect(`/practice/sampling/${sample._id}`);
}

/**
 * The attributes most vouching starts from.
 *
 * Five, and every one of them is a question with a yes or no answer — the
 * grid is worthless the moment a column needs a sentence. They are a
 * starting point, not a rule: the firm edits them before locking.
 */
const DEFAULT_ATTRIBUTES = [
  "Invoice seen",
  "Goods received",
  "Approved",
  "Correct period",
  "Paid as recorded",
];

/** The design: the judgement, recorded. */
export async function saveDesign(id, formData) {
  const actor = await requireUser();
  const found = await load(actor, id);
  if (!found) return GONE;
  const { sample } = found;

  const method = String(formData.get("method") ?? "");
  if (!METHOD_KEYS.includes(method)) return { error: "Unknown method." };

  const size = Number(formData.get("size") ?? 0);
  if (!Number.isInteger(size) || size < 1 || size > 2000) {
    return { error: "A sample size is a whole number from 1 to 2000." };
  }

  let tolerablePaise = 0;
  let keyAbovePaise = 0;
  try {
    const tol = String(formData.get("tolerable") ?? "").trim();
    const keyAbove = String(formData.get("keyAbove") ?? "").trim();
    if (tol) tolerablePaise = toPaise(tol);
    if (keyAbove) keyAbovePaise = toPaise(keyAbove);
  } catch {
    return { error: "One of those amounts is not an amount." };
  }

  const reconciled = String(formData.get("reconciledToTb") ?? "");

  if (sample.locked) {
    return {
      error:
        "This sample is locked. The design is part of the evidence now — unlock it only to redraw, and say why.",
    };
  }

  await audited(actor, async (session) => {
    sample.set({
      population: String(formData.get("population") ?? "").trim(),
      reconciledToTb:
        reconciled === "yes" ? true : reconciled === "no" ? false : null,
      method,
      confidence: String(formData.get("confidence") ?? "").trim(),
      tolerablePaise,
      basis: String(formData.get("basis") ?? "").trim(),
      keyAbovePaise,
      size,
      updatedBy: actor.id,
    });
    await sample.save({ session });
  });

  touch(sample);
  return { ok: "Design saved. Nothing is drawn until you draw it." };
}

/** The grid's columns. */
export async function saveAttributes(id, formData) {
  const actor = await requireUser();
  const found = await load(actor, id);
  if (!found) return GONE;
  const { sample } = found;

  if (sample.locked) {
    return {
      error:
        "The columns cannot change on a locked sample: a tick recorded against one question must not become a tick against another.",
    };
  }

  const attributes = String(formData.get("attributes") ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);

  if (attributes.length === 0) {
    return { error: "A vouching grid needs at least one question." };
  }
  if (new Set(attributes).size !== attributes.length) {
    return { error: "Two columns with the same name cannot be told apart." };
  }

  await audited(actor, async (session) => {
    sample.attributes = attributes;
    /* The marks go with the columns they were made against. Keeping them
       and re-cutting the array would move a tick from one question to
       another, which is exactly what the lock exists to prevent. */
    for (const item of sample.items) {
      item.marks = attributes.map(() => null);
    }
    sample.updatedBy = actor.id;
    await sample.save({ session });
  });

  touch(sample);
  return { ok: "Columns saved." };
}

/**
 * Draw the sample.
 *
 * The population comes in as pasted text rather than through the file
 * gateway, because what arrives is a ledger dump out of Tally, Busy or
 * Zoho — thirty rows or thirty thousand — and the firm already has it on
 * screen in Excel. Every refused row is named with its line number: a
 * population that quietly loses nine rows is a sample of the wrong
 * population, and it is the one mistake here nobody would catch.
 */
export async function drawSample(id, formData) {
  const actor = await requireUser();
  const found = await load(actor, id);
  if (!found) return GONE;
  const { sample } = found;

  if (sample.locked) {
    return {
      error:
        "This sample is locked and cannot be redrawn. Redrawing after seeing an exception is how a sample stops being a sample.",
    };
  }
  if (!sample.size) {
    return { error: "Save the design first, so there is a size to draw." };
  }

  /**
   * Once a single cell has been marked, drawing again is refused.
   *
   * A redraw replaces every row, so it throws away the vouching already
   * done — and it does it silently, which is the worst version. It is
   * also the thing SA 530 is most pointed about: choosing a different
   * sample once you have started looking at this one is not sampling.
   *
   * This is the rule the lock exists to make permanent; the lock is for
   * after the draw is settled, and this is for the hour in between.
   */
  const marked = sample.items.filter((item) =>
    (item.marks ?? []).some((mark) => mark === 0 || mark === 1),
  );
  if (marked.length > 0) {
    return {
      error: `Vouching has already started — ${marked.length} ${
        marked.length === 1 ? "row has" : "rows have"
      } marks on them. Drawing again would replace every row and throw that away. Lock this sample, or take the paper off and start another.`,
    };
  }

  const text = String(formData.get("population") ?? "").trim();
  if (!text) return { error: "Paste the population first." };
  if (text.length > 4_000_000) {
    return { error: "That is more than four megabytes of text." };
  }

  let objects;
  try {
    objects = parseCSVObjects(csvFromPaste(text)).rows;
  } catch {
    return { error: "That does not read as a table of comma-separated rows." };
  }

  const { rows, refused } = readPopulation(objects);
  if (rows.length === 0) {
    return {
      error:
        "No row in that had both a party and an amount. The first line has to be the column names — a reference, a party, a date and an amount, in any order.",
    };
  }

  const result = draw({
    rows,
    method: sample.method,
    size: sample.size,
    seed: sample.seed,
    keyAbovePaise: sample.keyAbovePaise,
  });

  await audited(actor, async (session) => {
    sample.entries = result.populationCount;
    sample.valuePaise = result.populationPaise;
    sample.intervalPaise = Math.round(result.interval);
    sample.drawNote = result.note;
    sample.drawnAt = new Date();
    sample.items = result.items.map((row, index) => ({
      no: index + 1,
      ref: row.ref,
      party: row.party,
      on: row.on,
      amountPaise: row.amountPaise,
      key: row.key,
      keyReason: row.keyReason,
      marks: sample.attributes.map(() => null),
    }));
    sample.updatedBy = actor.id;
    await sample.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Sample",
        entityId: sample._id,
        clientId: sample.clientId,
        note: `Sample drawn from ${result.populationCount} entries, seed ${sample.seed}: ${result.note}`,
      },
      session,
    );
  });

  touch(sample);
  return {
    ok: `${result.items.length} selected from ${result.populationCount} entries.`,
    refused: refused.slice(0, 20),
    refusedCount: refused.length,
  };
}

/** A new seed, so the same design draws a different sample. */
export async function reseedSample(id) {
  const actor = await requireUser();
  const found = await load(actor, id);
  if (!found) return GONE;
  const { sample } = found;

  if (sample.locked) {
    return { error: "A locked sample keeps its seed. That is the lock." };
  }

  await audited(actor, async (session) => {
    sample.seed = newSeed();
    sample.updatedBy = actor.id;
    await sample.save({ session });
  });

  touch(sample);
  return {
    ok: `New seed ${sample.seed}. Paste the population and draw again.`,
  };
}

/** Fix the design and the rows. After this, only the marks move. */
export async function lockSample(id) {
  const actor = await requireUser();
  const found = await load(actor, id);
  if (!found) return GONE;
  const { sample } = found;

  if (sample.locked) return { error: "Already locked." };
  if (sample.items.length === 0) {
    return { error: "There is nothing to lock: draw the sample first." };
  }
  if (sample.reconciledToTb !== true) {
    return {
      error:
        "Say whether the population agrees to the trial balance first. A sample drawn from a population that does not agree to the books is evidence about nothing.",
    };
  }

  await audited(actor, async (session) => {
    sample.locked = true;
    sample.lockedAt = new Date();
    sample.lockedBy = actor.id;
    sample.lockedByName = actor.name ?? "";
    sample.updatedBy = actor.id;
    await sample.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Sample",
        entityId: sample._id,
        clientId: sample.clientId,
        note: `Sample locked: ${sample.items.length} items, ${sample.method}, seed ${sample.seed}`,
      },
      session,
    );
  });

  touch(sample);
  return { ok: "Locked. The design and the rows are evidence now." };
}

/**
 * Unlock, with a reason.
 *
 * Only a CA or a partner, and the reason is mandatory and audited: an
 * unlocked sample is the single most questionable thing that can happen to
 * this working paper, so it has to be the hardest thing to do quietly.
 */
export async function unlockSample(id, reason) {
  const actor = await requireUser();
  const found = await load(actor, id);
  if (!found) return GONE;
  const { sample } = found;

  if (!["partner", "ca"].includes(actor.role)) {
    return { error: "Only a CA or a partner can unlock a sample." };
  }
  if (!sample.locked) return { error: "It is not locked." };

  const why = String(reason ?? "").trim();
  if (why.length < 15) {
    return {
      error: "Say why it is being unlocked, in enough words to read later.",
    };
  }

  await audited(actor, async (session) => {
    sample.locked = false;
    sample.lockedAt = null;
    sample.lockedBy = null;
    sample.lockedByName = "";
    sample.updatedBy = actor.id;
    await sample.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Sample",
        entityId: sample._id,
        clientId: sample.clientId,
        note: `Sample unlocked by ${actor.name}: ${why}`,
      },
      session,
    );
  });

  touch(sample);
  return { ok: "Unlocked, and the reason is in the log." };
}

/** One cell: fine, an exception, or back to not looked at. */
export async function markCell(id, itemId, column, value) {
  const actor = await requireUser();
  const found = await load(actor, id);
  if (!found) return GONE;
  const { sample } = found;

  const item = sample.items.id(String(itemId ?? ""));
  if (!item) return { error: "That row is not in this sample." };

  const index = Number(column);
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= sample.attributes.length
  ) {
    return { error: "That column is not in this sample." };
  }
  if (![0, 1, null].includes(value)) return { error: "Unknown mark." };

  await audited(actor, async (session) => {
    /**
     * A whole new array, not `marks[index] = value`.
     *
     * Assigning into a Mongoose array by index does not mark the path
     * modified, so the write is accepted, the screen refreshes, and the
     * mark is silently not there — which on a vouching grid means a tick
     * somebody made and the file does not have. Replacing the array
     * registers properly.
     *
     * It is also padded here: a row drawn before a column was added has a
     * shorter array than there are columns.
     */
    const next = sample.attributes.map((_, i) => item.marks?.[i] ?? null);
    next[index] = value;
    item.marks = next;
    item.markedBy = actor.id;
    item.markedByName = actor.name ?? "";
    item.markedAt = new Date();
    sample.updatedBy = actor.id;
    await sample.save({ session });
  });

  touch(sample);
  return { ok: "Marked." };
}

/** What the exception was, and what it is worth. */
export async function saveItemNote(id, itemId, formData) {
  const actor = await requireUser();
  const found = await load(actor, id);
  if (!found) return GONE;
  const { sample } = found;

  const item = sample.items.id(String(itemId ?? ""));
  if (!item) return { error: "That row is not in this sample." };

  let errorPaise = 0;
  const raw = String(formData.get("errorAmount") ?? "").trim();
  if (raw) {
    try {
      errorPaise = toPaise(raw);
    } catch {
      return { error: "That amount is not an amount." };
    }
  }

  await audited(actor, async (session) => {
    item.note = String(formData.get("note") ?? "")
      .trim()
      .slice(0, 1000);
    item.errorPaise = errorPaise;
    sample.updatedBy = actor.id;
    await sample.save({ session });
  });

  touch(sample);
  return { ok: "Saved." };
}

/**
 * Send the exceptions to the audit file's misstatement summary.
 *
 * **Each row carries its words across, and a row with none is refused.**
 * The summary is what the opinion is built on; a line on it reading "item
 * 17" is a line nobody can answer later.
 *
 * The projection goes with them, as a projection and labelled as one: a
 * sample that found ₹4.85 lakh wrong in a tenth of the value is evidence
 * of something nearer ₹48 lakh, and that is the figure SA 530 asks to be
 * compared with tolerable misstatement.
 */
export async function sendExceptions(id) {
  const actor = await requireUser();
  const found = await load(actor, id);
  if (!found) return GONE;
  const { sample } = found;

  const open = sample.items.filter(
    (item) => (item.marks ?? []).includes(0) && !item.exceptionId,
  );
  if (open.length === 0) {
    return { error: "No exception on this sheet is waiting to be sent." };
  }

  const silent = open.filter((item) => item.note.trim().length < 10);
  if (silent.length > 0) {
    return {
      error: `Say what was wrong on ${silent.length === 1 ? "row" : "rows"} ${silent
        .map((item) => item.no)
        .join(
          ", ",
        )} first. A matter on the summary that says only the row number cannot be answered later.`,
    };
  }

  await connectDB();
  const file = await AuditFile.findOne({ engagementId: sample.engagementId });
  if (!file) return { error: "The audit file is gone." };

  const estimate = projected(
    sample.items.map((item) => ({
      marks: item.marks,
      amountPaise: item.amountPaise,
      key: item.key,
      errorPaise: item.errorPaise,
    })),
    sample.valuePaise,
  );

  await audited(actor, async (session) => {
    for (const item of open) {
      const which = (item.marks ?? [])
        .map((mark, index) => (mark === 0 ? sample.attributes[index] : null))
        .filter(Boolean)
        .join(", ");

      file.exceptions.push({
        area: sample.area,
        test: sample.ref ? `${sample.ref} ${sample.name}` : sample.name,
        what: `${item.party}${item.ref ? ` (${item.ref})` : ""}: ${item.note}${
          which ? ` — failed: ${which}` : ""
        }`,
        risk: "Medium",
        amountPaise: item.errorPaise || Math.abs(item.amountPaise),
        state: "Open",
        raisedBy: actor.id,
        raisedByName: actor.name ?? "",
      });
      const raised = file.exceptions[file.exceptions.length - 1];
      item.exceptionId = String(raised._id);
    }

    file.updatedBy = actor.id;
    await file.save({ session });
    sample.updatedBy = actor.id;
    await sample.save({ session });

    await recordAudit(
      {
        action: ACTIONS.create,
        entityType: "AuditFile",
        entityId: file._id,
        clientId: sample.clientId,
        note: `${open.length} sampling exception${open.length === 1 ? "" : "s"} from ${sample.ref || sample.name}; found ${Math.round(estimate.foundPaise / 100)}, projected ${Math.round(estimate.projectedPaise / 100)} rupees`,
      },
      session,
    );
  });

  touch(sample);
  return {
    ok: `${open.length} sent to the misstatement summary. The projected effect went with them.`,
  };
}

/** Take the whole working paper off. Soft delete, like everything else. */
export async function removeSample(id) {
  const actor = await requireUser();
  const found = await load(actor, id);
  if (!found) return GONE;
  const { sample } = found;

  if (sample.locked && !["partner", "ca"].includes(actor.role)) {
    return { error: "Only a CA or a partner can remove a locked sample." };
  }

  await audited(actor, async (session) => {
    sample.updatedBy = actor.id;
    await sample.softDelete(actor.id, { session });
  });

  revalidatePath("/practice/sampling");
  return { ok: "Taken off. It stays readable in the log." };
}

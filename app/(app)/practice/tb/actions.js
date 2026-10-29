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
import { financialYearLabel } from "@/lib/dates";
import Engagement from "@/models/Engagement";
import AuditFile from "@/models/AuditFile";
import TrialBalance, { ADJUSTMENT_STATES } from "@/models/TrialBalance";
import RuleConfirmation from "@/models/RuleConfirmation";
import { csvFromPaste } from "@/lib/practice/sampling";
import {
  CONFIRM_KEY,
  CONFIRM_KIND,
  HEAD_BY_KEY,
  HEAD_KEYS,
  HEADS,
  mappingProgress,
  outOfBalance,
  readTrialBalance,
  statements,
  suggestHeads,
} from "@/lib/practice/scheduleIII";

/**
 * Building the financial statements (P3-32).
 *
 * The gates here are the ones a reviewer would ask about:
 *
 *  - **an unmapped ledger blocks the statements**, rather than producing a
 *    balance sheet with a hole the size of its balance;
 *  - **a suggestion is not a mapping** until a person confirms it, so the
 *    firm can always say who decided where a figure went;
 *  - **only an entry passed in the books moves a figure**; an unadjusted
 *    one goes to the audit file's misstatement summary instead;
 *  - **a locked set does not re-import**, because a trial balance replaced
 *    after the notes are built is a set of statements that no longer
 *    matches the papers behind it.
 */

const GONE = { error: "That trial balance no longer exists." };

async function load(actor, id) {
  await connectDB();
  const tb = await TrialBalance.findById(String(id ?? ""));
  if (!tb) return null;

  const engagement = await Engagement.findById(tb.engagementId)
    .select("branchId assigneeId reviewerId periodLabel period")
    .lean();

  assertCan(actor, "edit", "practice", {
    branchId: String(tb.branchId),
    assigneeId: String(engagement?.assigneeId ?? ""),
    reviewerId: String(engagement?.reviewerId ?? ""),
  });

  return { tb, engagement };
}

function touch(tb) {
  revalidatePath("/practice/tb");
  revalidatePath(`/practice/tb/${tb._id}`);
  revalidatePath(`/practice/audit/${tb.engagementId}`);
}

const LOCKED = {
  error:
    "These statements are locked. Unlock them to change the trial balance — and say why, because a set of statements that no longer matches its papers is worse than one that is out of date.",
};

/**
 * A partner confirms the Schedule III head list (CLAUDE.md rule 8).
 *
 * The same shape as the due-date master and the notice limitation periods:
 * the table lives in code so nobody can edit it into something
 * plausible-looking, and the confirmation is a fact about a person and a
 * date. Until it exists, every screen reading the list says so.
 */
export async function confirmHeads(formData) {
  const actor = await requireUser();
  assertCan(actor, "edit", "firmProfile");

  await connectDB();
  const note = String(formData?.get?.("note") ?? "").trim();

  await audited(actor, async (session) => {
    await RuleConfirmation.findOneAndUpdate(
      { kind: CONFIRM_KIND, key: CONFIRM_KEY },
      {
        $set: {
          text: `${HEADS.length} summary heads, Schedule III Division I`,
          cite: "Companies Act 2013, Schedule III, Division I",
          confirmedAt: new Date(),
          confirmedBy: actor.id,
          confirmedByName: actor.name ?? "",
          note,
          updatedBy: actor.id,
        },
        $setOnInsert: { createdBy: actor.id },
      },
      { upsert: true, session },
    );
  });

  revalidatePath("/practice/tb", "layout");
  return {
    ok: "Confirmed. The head list is the firm's now, with your name on it.",
  };
}

/** Start a set of statements on an audit that has a file open. */
export async function startTrialBalance(_prev, formData) {
  const actor = await requireUser();
  assertCan(actor, "edit", "practice");

  const engagementId = String(formData.get("engagementId") ?? "").trim();
  if (!engagementId) return { error: "Which audit is this for?" };

  await connectDB();
  const engagement = await Engagement.findById(engagementId)
    .select("clientId branchId assigneeId reviewerId periodLabel period")
    .lean();
  if (!engagement) return { error: "That audit no longer exists." };

  assertCan(actor, "edit", "practice", {
    branchId: String(engagement.branchId),
    assigneeId: String(engagement.assigneeId ?? ""),
    reviewerId: String(engagement.reviewerId ?? ""),
  });

  const file = await AuditFile.findOne({ engagementId }).select("_id").lean();
  if (!file) {
    return {
      error:
        "There is no audit file on that engagement yet. Open the file first — an unadjusted entry has to have a misstatement summary to go to.",
    };
  }

  const already = await TrialBalance.findOne({ engagementId })
    .select("_id")
    .lean();
  if (already) redirect(`/practice/tb/${already._id}`);

  let tb;
  await audited(actor, async (session) => {
    [tb] = await TrialBalance.create(
      [
        {
          engagementId,
          clientId: engagement.clientId,
          branchId: engagement.branchId,
          fyLabel:
            engagement.periodLabel ||
            engagement.period ||
            financialYearLabel(new Date()),
          source: String(formData.get("source") ?? "").trim(),
          createdBy: actor.id,
          createdByName: actor.name ?? "",
          updatedBy: actor.id,
        },
      ],
      { session, ordered: true },
    );
  });

  revalidatePath("/practice/tb");
  /* A redirect from the action, not an id for the client to push on.
     Revalidating the list and pushing from an effect race each other,
     and the race is lost often enough that somebody who has just
     started a set of statements is left looking at the list. */
  redirect(`/practice/tb/${tb._id}`);
}

/**
 * 1 · Import the trial balance.
 *
 * Pasted rather than uploaded, for the same reason as a sampling
 * population: what the firm has is the client's export open in Excel, and
 * what Excel puts on the clipboard is tab-separated.
 *
 * Every refused row is named with its line number. A trial balance that
 * quietly loses three ledgers produces a balance sheet that does not
 * balance and gives no hint why — and the out-of-balance figure is
 * reported rather than the import being refused, because a trial balance
 * that does not add to zero is the client's problem to explain and the
 * firm needs to see it to ask.
 */
export async function importTrialBalance(id, formData) {
  const actor = await requireUser();
  const found = await load(actor, id);
  if (!found) return GONE;
  const { tb } = found;
  if (tb.locked) return LOCKED;

  const text = String(formData.get("rows") ?? "").trim();
  if (!text) return { error: "Paste the trial balance first." };
  if (text.length > 4_000_000) {
    return { error: "That is more than four megabytes of text." };
  }

  let objects;
  try {
    objects = parseCSVObjects(csvFromPaste(text)).rows;
  } catch {
    return { error: "That does not read as a table of rows." };
  }

  const { rows, refused } = readTrialBalance(objects);
  if (rows.length === 0) {
    return {
      error:
        "No row in that had a ledger name and a balance. The first line has to be the column names — a ledger, a group, and either a closing balance or a debit and a credit.",
    };
  }

  /**
   * Last year's mapping for this client, by ledger name.
   *
   * Only lines a person settled are remembered: a suggestion nobody
   * confirmed last year is not evidence of anything this year.
   */
  const previous = await TrialBalance.find({
    clientId: tb.clientId,
    _id: { $ne: tb._id },
  })
    .sort({ createdAt: -1 })
    .select("lines fyLabel")
    .limit(1)
    .lean();

  const lastYear = new Map();
  for (const line of previous[0]?.lines ?? []) {
    if (line.headKey && ["confirmed", "remembered"].includes(line.status)) {
      lastYear.set(line.ledger.trim().toLowerCase(), line.headKey);
    }
  }

  const suggestions = suggestHeads(rows, lastYear);

  await audited(actor, async (session) => {
    tb.lines = rows.map((row, index) => ({
      ledger: row.ledger,
      group: row.group,
      closingPaise: row.closingPaise,
      headKey: suggestions[index].headKey,
      status: suggestions[index].status,
    }));
    tb.source = String(formData.get("source") ?? tb.source ?? "").trim();
    tb.importedAt = new Date();
    tb.importedBy = actor.id;
    tb.importedByName = actor.name ?? "";
    tb.updatedBy = actor.id;
    await tb.save({ session });

    const difference = outOfBalance(rows);
    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "TrialBalance",
        entityId: tb._id,
        clientId: tb.clientId,
        note: `${rows.length} ledgers imported${
          difference === 0
            ? ", totalling to zero"
            : `, out of balance by ${(difference / 100).toFixed(2)}`
        }${previous.length ? `; mapping remembered from ${previous[0].fyLabel}` : ""}`,
      },
      session,
    );
  });

  const remembered = suggestions.filter(
    (s) => s.status === "remembered",
  ).length;
  const difference = outOfBalance(rows);

  return {
    ok: `${rows.length} ledgers read${
      remembered ? `, ${remembered} mapped from last year` : ""
    }.`,
    difference,
    refused: refused.slice(0, 20),
    refusedCount: refused.length,
  };
}

/** 2 · Map one ledger to a head, which is always a person's decision. */
export async function mapLine(id, lineId, headKey) {
  const actor = await requireUser();
  const found = await load(actor, id);
  if (!found) return GONE;
  const { tb } = found;
  if (tb.locked) return LOCKED;

  const line = tb.lines.id(String(lineId ?? ""));
  if (!line) return { error: "That ledger is not in this trial balance." };

  const key = String(headKey ?? "");
  if (key && !HEAD_KEYS.includes(key)) return { error: "Unknown head." };

  await audited(actor, async (session) => {
    line.headKey = key;
    line.status = key ? "confirmed" : "unmapped";
    line.mappedBy = actor.id;
    line.mappedByName = actor.name ?? "";
    tb.updatedBy = actor.id;
    await tb.save({ session });
  });

  touch(tb);
  return { ok: "" };
}

/**
 * Confirm every suggestion at once.
 *
 * The one bulk action on this screen, and it is safe to be one because a
 * suggestion is already on the screen beside the ledger it is for: the
 * person is confirming a list they can read, not asking the software to
 * decide. Remembered lines are confirmed too — they were a person's
 * decision last year and the person is now saying it still holds.
 */
export async function confirmSuggestions(id) {
  const actor = await requireUser();
  const found = await load(actor, id);
  if (!found) return GONE;
  const { tb } = found;
  if (tb.locked) return LOCKED;

  const waiting = tb.lines.filter(
    (line) => line.headKey && ["suggested", "remembered"].includes(line.status),
  );
  if (waiting.length === 0) {
    return { error: "Nothing is waiting to be confirmed." };
  }

  await audited(actor, async (session) => {
    for (const line of waiting) {
      line.status = "confirmed";
      line.mappedBy = actor.id;
      line.mappedByName = actor.name ?? "";
    }
    tb.updatedBy = actor.id;
    await tb.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "TrialBalance",
        entityId: tb._id,
        clientId: tb.clientId,
        note: `${waiting.length} mappings confirmed by ${actor.name}`,
      },
      session,
    );
  });

  touch(tb);
  return {
    ok: `${waiting.length} confirmed. Your name is on each of them.`,
  };
}

/** 3 · An adjusting entry. */
export async function addAdjustment(id, formData) {
  const actor = await requireUser();
  const found = await load(actor, id);
  if (!found) return GONE;
  const { tb } = found;
  if (tb.locked) return LOCKED;

  const description = String(formData.get("description") ?? "").trim();
  if (description.length < 10) {
    return { error: "Say what the entry is, in enough words to read later." };
  }

  let amountPaise;
  try {
    amountPaise = toPaise(String(formData.get("amount") ?? ""));
  } catch {
    return { error: "That amount is not an amount." };
  }
  if (!amountPaise) return { error: "An entry needs an amount." };

  const state = String(formData.get("state") ?? "Proposed");
  if (!ADJUSTMENT_STATES.includes(state)) return { error: "Unknown state." };

  const headKey = String(formData.get("headKey") ?? "");
  const counterHeadKey = String(formData.get("counterHeadKey") ?? "");
  for (const key of [headKey, counterHeadKey]) {
    if (key && !HEAD_KEYS.includes(key)) return { error: "Unknown head." };
  }

  /**
   * An entry that is going to move the figures needs both sides.
   *
   * A one-sided journal would unbalance the balance sheet by its own
   * amount, and the screen would then report that the mapping is wrong.
   * A proposal or an unadjusted entry does not move anything, so it may be
   * written down before anybody has decided which heads it touches.
   */
  if (state === "Passed in books" && (!headKey || !counterHeadKey)) {
    return {
      error:
        "An entry passed in the books needs both heads — what is debited and what is credited — or the balance sheet would be out by its amount.",
    };
  }

  await audited(actor, async (session) => {
    tb.adjustments.push({
      description,
      amountPaise,
      headKey,
      counterHeadKey,
      state,
      source: String(formData.get("source") ?? "").trim(),
      byId: actor.id,
      byName: actor.name ?? "",
    });
    tb.updatedBy = actor.id;
    await tb.save({ session });
  });

  touch(tb);
  return { ok: "On the journal." };
}

/** Move an entry along: proposed, passed, or left unadjusted. */
export async function setAdjustmentState(id, entryId, state) {
  const actor = await requireUser();
  const found = await load(actor, id);
  if (!found) return GONE;
  const { tb } = found;
  if (tb.locked) return LOCKED;

  const entry = tb.adjustments.id(String(entryId ?? ""));
  if (!entry) return { error: "That entry is not on this journal." };
  if (!ADJUSTMENT_STATES.includes(String(state))) {
    return { error: "Unknown state." };
  }
  if (
    state === "Passed in books" &&
    (!entry.headKey || !entry.counterHeadKey)
  ) {
    return {
      error:
        "Set both heads on the entry first — what is debited and what is credited.",
    };
  }

  await audited(actor, async (session) => {
    entry.state = String(state);
    entry.byId = actor.id;
    entry.byName = actor.name ?? "";
    tb.updatedBy = actor.id;
    await tb.save({ session });
  });

  touch(tb);
  return { ok: `Marked ${String(state).toLowerCase()}.` };
}

/** Take an entry off. Soft delete is for documents; a journal line goes. */
export async function removeAdjustment(id, entryId) {
  const actor = await requireUser();
  const found = await load(actor, id);
  if (!found) return GONE;
  const { tb } = found;
  if (tb.locked) return LOCKED;

  const entry = tb.adjustments.id(String(entryId ?? ""));
  if (!entry) return { error: "That entry is not on this journal." };
  if (entry.exceptionId) {
    return {
      error:
        "That entry is already on the audit file's misstatement summary. Answer it there — removing it here would leave the summary pointing at nothing.",
    };
  }

  const what = entry.description;
  await audited(actor, async (session) => {
    tb.adjustments.pull({ _id: entry._id });
    tb.updatedBy = actor.id;
    await tb.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "TrialBalance",
        entityId: tb._id,
        clientId: tb.clientId,
        note: `Adjustment removed: ${what}`,
      },
      session,
    );
  });

  touch(tb);
  return { ok: "Taken off the journal." };
}

/**
 * Send the unadjusted entries to the audit file's misstatement summary.
 *
 * This is the whole reason the journal has three states rather than two.
 * An entry the firm proposed and the client would not pass is a
 * misstatement the firm has decided to live with, and the place that
 * decision is weighed against materiality is the audit file — not here.
 */
export async function sendUnadjusted(id) {
  const actor = await requireUser();
  const found = await load(actor, id);
  if (!found) return GONE;
  const { tb } = found;

  const open = tb.adjustments.filter(
    (entry) => entry.state === "Unadjusted" && !entry.exceptionId,
  );
  if (open.length === 0) {
    return { error: "No unadjusted entry is waiting to be sent." };
  }

  await connectDB();
  const file = await AuditFile.findOne({ engagementId: tb.engagementId });
  if (!file) return { error: "The audit file is gone." };

  await audited(actor, async (session) => {
    for (const entry of open) {
      file.exceptions.push({
        area: "",
        test: `Financial statements ${tb.fyLabel}`,
        what: `Unadjusted: ${entry.description}${
          entry.source ? ` (${entry.source})` : ""
        }`,
        risk: "Medium",
        amountPaise: Math.abs(entry.amountPaise),
        state: "Open",
        raisedBy: actor.id,
        raisedByName: actor.name ?? "",
      });
      const raised = file.exceptions[file.exceptions.length - 1];
      entry.exceptionId = String(raised._id);
    }

    file.updatedBy = actor.id;
    await file.save({ session });
    tb.updatedBy = actor.id;
    await tb.save({ session });

    await recordAudit(
      {
        action: ACTIONS.create,
        entityType: "AuditFile",
        entityId: file._id,
        clientId: tb.clientId,
        note: `${open.length} unadjusted ${open.length === 1 ? "entry" : "entries"} from the ${tb.fyLabel} statements`,
      },
      session,
    );
  });

  touch(tb);
  return {
    ok: `${open.length} sent to the misstatement summary, where they are weighed against materiality.`,
  };
}

/** 4 · Which notes this company needs. */
export async function setNoteAnswer(id, key, value) {
  const actor = await requireUser();
  const found = await load(actor, id);
  if (!found) return GONE;
  const { tb } = found;
  if (tb.locked) return LOCKED;

  await audited(actor, async (session) => {
    /* A new object, because Mongoose does not watch a Mixed path for a
       key being set on it in place. */
    tb.noteAnswers = { ...(tb.noteAnswers ?? {}), [String(key)]: value };
    tb.markModified("noteAnswers");
    tb.updatedBy = actor.id;
    await tb.save({ session });
  });

  touch(tb);
  return { ok: "" };
}

/**
 * 5 · Settle the statements.
 *
 * Refused while anything is unmapped, and refused while the two sides do
 * not agree: a set of statements that does not balance is not a set of
 * statements, and locking one would put it in the file as though it were.
 */
export async function lockTrialBalance(id) {
  const actor = await requireUser();
  const found = await load(actor, id);
  if (!found) return GONE;
  const { tb } = found;
  if (tb.locked) return { error: "Already locked." };

  const progress = mappingProgress(tb.lines);
  if (progress.blocked) {
    return {
      error: `${progress.unmapped} ${progress.unmapped === 1 ? "ledger is" : "ledgers are"} still unmapped. The statements would be out by their balance.`,
    };
  }

  const result = statements(tb.lines, tb.adjustments);
  if (!result.balanced) {
    return {
      error: `The two sides differ by ${(result.difference / 100).toFixed(2)}. Check the mapping and the journal — a set of statements that does not balance cannot go in the file.`,
    };
  }

  await audited(actor, async (session) => {
    tb.locked = true;
    tb.lockedAt = new Date();
    tb.lockedBy = actor.id;
    tb.lockedByName = actor.name ?? "";
    tb.updatedBy = actor.id;
    await tb.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "TrialBalance",
        entityId: tb._id,
        clientId: tb.clientId,
        note: `${tb.fyLabel} statements locked: assets ${(result.assets / 100).toFixed(2)}, profit ${(result.profit / 100).toFixed(2)}`,
      },
      session,
    );
  });

  touch(tb);
  return { ok: "Locked. The figures are the firm's now." };
}

/** Unlock, with a reason. Only a CA or a partner. */
export async function unlockTrialBalance(id, reason) {
  const actor = await requireUser();
  const found = await load(actor, id);
  if (!found) return GONE;
  const { tb } = found;

  if (!["partner", "ca"].includes(actor.role)) {
    return { error: "Only a CA or a partner can unlock a set of statements." };
  }
  if (!tb.locked) return { error: "It is not locked." };

  const why = String(reason ?? "").trim();
  if (why.length < 15) {
    return {
      error: "Say why, in enough words to be read a year from now.",
    };
  }

  await audited(actor, async (session) => {
    tb.locked = false;
    tb.lockedAt = null;
    tb.lockedBy = null;
    tb.lockedByName = "";
    tb.updatedBy = actor.id;
    await tb.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "TrialBalance",
        entityId: tb._id,
        clientId: tb.clientId,
        note: `${tb.fyLabel} statements unlocked by ${actor.name}: ${why}`,
      },
      session,
    );
  });

  touch(tb);
  return { ok: "Unlocked, and the reason is in the log." };
}

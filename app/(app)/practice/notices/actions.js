"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan, can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import { toPaise } from "@/lib/money";
import { istInputDate } from "@/lib/dates";
import Client from "@/models/Client";
import Notice from "@/models/Notice";
import RuleConfirmation from "@/models/RuleConfirmation";
import {
  NOTICE_KINDS,
  NOTICE_STAGES,
  SUBMISSION_TYPES,
} from "@/lib/practice/noticeLaw";
import { checkPlainWords } from "@/lib/practice/notices";

/**
 * Working a notice (P3-11).
 *
 * Two things here are not like the rest of the system and both are
 * CLAUDE.md rule 8 doing its job:
 *
 *  - **confirming a law rule is a partner's act**, recorded with their name,
 *    and nothing computes a limitation date until they have done it
 *  - **the client's paragraph is checked for jargon**, because a paragraph
 *    with "s.148A" in it is not a paragraph for a client
 */

const readDate = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const date = new Date(`${raw}T00:00:00+05:30`);
  return Number.isNaN(date.valueOf()) ? undefined : date;
};

async function loadForWork(actor, id, action = "edit") {
  await connectDB();
  const notice = await Notice.findById(id);
  if (!notice) {
    const err = new Error("That notice no longer exists.");
    err.code = "NOT_FOUND";
    throw err;
  }
  assertCan(actor, action, "practice", {
    branchId: String(notice.branchId),
    assigneeId: String(notice.assigneeId ?? ""),
  });
  return notice;
}

function touched(notice, actor) {
  notice.updatedBy = actor.id;
}

/** Start a matter from a notice that has arrived. */
export async function createNotice(_prev, formData) {
  const actor = await requireUser();
  await connectDB();

  const clientId = String(formData.get("clientId") ?? "");
  const client = await Client.findById(clientId).select("branchId").lean();
  if (!client) return { error: "Choose a client." };

  assertCan(actor, "edit", "practice", { branchId: String(client.branchId) });

  const kind = String(formData.get("kind") ?? "");
  const entry = NOTICE_KINDS[kind];
  if (!entry) return { error: "Choose what kind of notice this is." };

  const noticeDate = readDate(formData.get("noticeDate"));
  const servedOn = readDate(formData.get("servedOn"));
  if (noticeDate === undefined || servedOn === undefined) {
    return { error: "One of those dates is not a date." };
  }

  const din = String(formData.get("din") ?? "").trim();
  if (din) {
    const clash = await Notice.findOne({ din }).select("_id clientId").lean();
    if (clash) {
      return {
        error:
          "A notice with that document number is already on the books. Two matters with one DIN means the same notice has been entered twice.",
      };
    }
  }

  let stakePaise = 0;
  try {
    const raw = String(formData.get("stake") ?? "").trim();
    if (raw) stakePaise = toPaise(raw);
  } catch {
    return { error: "That amount at stake is not an amount." };
  }

  let created;
  try {
    await audited(actor, async (session) => {
      const [doc] = await Notice.create(
        [
          {
            clientId: client._id,
            branchId: client.branchId,
            law: entry.law,
            kind,
            section: String(formData.get("section") ?? "").trim(),
            period: String(formData.get("period") ?? "").trim(),
            din,
            authority: String(formData.get("authority") ?? "").trim(),
            noticeDate,
            servedOn,
            annualReturnDue: readDate(formData.get("annualReturnDue")) ?? null,
            issue: String(formData.get("issue") ?? "").trim(),
            stakePaise,
            stage: "Notice received",
            risk: String(formData.get("risk") ?? "").trim(),
            partnerId: String(formData.get("partnerId") ?? "") || null,
            assigneeId: String(formData.get("assigneeId") ?? "") || null,
            createdBy: actor.id,
            updatedBy: actor.id,
          },
        ],
        { session },
      );
      created = doc;

      await recordAudit(
        {
          action: ACTIONS.create,
          entityType: "Notice",
          entityId: doc._id,
          clientId: client._id,
          note: `${entry.label}${din ? ` · ${din}` : ""}`,
        },
        session,
      );
    });
  } catch (err) {
    return { error: err.message };
  }

  revalidatePath("/practice/notices");
  return { ok: "Matter opened.", id: String(created._id) };
}

/** Something the firm now owes, with the date the department gave. */
export async function addSubmission(id, formData) {
  const actor = await requireUser();
  const notice = await loadForWork(actor, id);

  const type = String(formData.get("type") ?? "");
  if (!SUBMISSION_TYPES.includes(type)) {
    return { error: "Choose what is being filed." };
  }
  const dueDate = readDate(formData.get("dueDate"));
  if (dueDate === undefined) return { error: "That date is not a date." };

  await audited(actor, async (session) => {
    notice.submissions.push({
      type,
      dueDate,
      note: String(formData.get("note") ?? "").trim(),
      preparedBy: actor.id,
      preparedByName: actor.name,
    });
    touched(notice, actor);
    await notice.save({ session });
    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Notice",
        entityId: notice._id,
        clientId: notice.clientId,
        note: `${type} added, due ${dueDate ? istInputDate(dueDate) : "no date"}`,
      },
      session,
    );
  });

  revalidatePath(`/practice/notices/${id}`);
  return { ok: `${type} added.` };
}

/**
 * Record that a submission went in.
 *
 * The acknowledgement is mandatory, for the same reason it is on a filing
 * milestone (P3-1): a submission nobody can evidence is a claim, and the
 * department's own portal is the only thing that can settle a dispute about
 * whether a reply was filed in time.
 */
export async function fileSubmission(id, submissionId, formData) {
  const actor = await requireUser();
  const notice = await loadForWork(actor, id);

  const row = notice.submissions.id(submissionId);
  if (!row) return { error: "That submission is gone." };
  if (row.filedOn) {
    return { error: `${row.type} is already recorded as filed.` };
  }

  const ackNo = String(formData.get("ackNo") ?? "").trim();
  if (!ackNo) {
    return {
      error: `Enter the acknowledgement for the ${row.type.toLowerCase()}. Without it there is nothing to show it went in.`,
    };
  }
  const filedOn = readDate(formData.get("filedOn"));
  if (filedOn === undefined) return { error: "That date is not a date." };
  if (!filedOn) return { error: "Enter the date it was filed." };
  if (filedOn.getTime() > Date.now()) {
    return { error: "A filing date cannot be in the future." };
  }

  const late =
    row.dueDate && filedOn.getTime() > new Date(row.dueDate).getTime();

  await audited(actor, async (session) => {
    row.filedOn = filedOn;
    row.ackNo = ackNo;
    row.filedBy = actor.id;
    row.filedByName = actor.name;
    touched(notice, actor);
    await notice.save({ session });
    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Notice",
        entityId: notice._id,
        clientId: notice.clientId,
        note: `${row.type} filed ${istInputDate(filedOn)}, acknowledgement ${ackNo}${late ? " — after the date given" : ""}`,
      },
      session,
    );
  });

  revalidatePath(`/practice/notices/${id}`);
  return {
    ok: late
      ? `${row.type} recorded — after the date the department gave. The timeline shows it.`
      : `${row.type} recorded.`,
  };
}

/** A hearing has been listed. */
export async function addHearing(id, formData) {
  const actor = await requireUser();
  const notice = await loadForWork(actor, id);

  const on = readDate(formData.get("on"));
  if (on === undefined) return { error: "That date is not a date." };
  if (!on) return { error: "Enter the date it is listed for." };

  await audited(actor, async (session) => {
    notice.hearings.push({
      on,
      mode: String(formData.get("mode") ?? "").trim(),
    });
    if (notice.stage === "Notice received" || notice.stage === "Reply") {
      notice.stage = "Hearing";
    }
    touched(notice, actor);
    await notice.save({ session });
    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Notice",
        entityId: notice._id,
        clientId: notice.clientId,
        note: `Hearing listed for ${istInputDate(on)}`,
      },
      session,
    );
  });

  revalidatePath(`/practice/notices/${id}`);
  return { ok: "Hearing listed." };
}

/**
 * What happened at the hearing — including, when it is the answer, that it
 * was put off.
 *
 * An adjournment is a counted fact and not a note, because the law caps how
 * many the firm gets (s.75(5) CGST, where that rule is confirmed) and the
 * count has to be readable off the record.
 */
export async function recordHearing(id, hearingId, formData) {
  const actor = await requireUser();
  const notice = await loadForWork(actor, id);

  const row = notice.hearings.id(hearingId);
  if (!row) return { error: "That hearing is gone." };

  const heldOn = readDate(formData.get("heldOn"));
  if (heldOn === undefined) return { error: "That date is not a date." };

  const adjourned = String(formData.get("adjourned") ?? "") === "1";
  const reason = String(formData.get("reason") ?? "").trim();
  const outcome = String(formData.get("outcome") ?? "").trim();

  if (adjourned && reason.length < 5) {
    return { error: "Say why it was put off. The count is read with it." };
  }
  if (!adjourned && !outcome) {
    return { error: "Say what happened at the hearing." };
  }

  await audited(actor, async (session) => {
    row.heldOn = heldOn ?? new Date();
    row.attendedBy = actor.id;
    row.attendedByName = actor.name;
    row.adjourned = adjourned;
    row.adjournmentReason = adjourned ? reason : "";
    row.adjournedBy = adjourned
      ? String(formData.get("adjournedBy") ?? "").trim()
      : "";
    row.outcome = adjourned ? "" : outcome;
    touched(notice, actor);
    await notice.save({ session });

    const used = notice.hearings.filter((h) => h.adjourned).length;
    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Notice",
        entityId: notice._id,
        clientId: notice.clientId,
        note: adjourned
          ? `Hearing adjourned (${used} so far) — ${reason}`
          : `Hearing held — ${outcome}`,
      },
      session,
    );
  });

  revalidatePath(`/practice/notices/${id}`);
  return {
    ok: adjourned ? "Adjournment recorded and counted." : "Hearing recorded.",
  };
}

/** A point in dispute and the firm's answer to it. */
export async function saveGround(id, formData) {
  const actor = await requireUser();
  const notice = await loadForWork(actor, id);

  const groundId = String(formData.get("groundId") ?? "");
  const point = String(formData.get("point") ?? "").trim();
  if (!point) return { error: "What is the point in dispute?" };

  await audited(actor, async (session) => {
    const fields = {
      point,
      ourGround: String(formData.get("ourGround") ?? "").trim(),
      evidence: String(formData.get("evidence") ?? "").trim(),
      settled: String(formData.get("settled") ?? "") === "1",
    };
    const existing = groundId ? notice.grounds.id(groundId) : null;
    if (existing) Object.assign(existing, fields);
    else notice.grounds.push(fields);

    touched(notice, actor);
    await notice.save({ session });
    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Notice",
        entityId: notice._id,
        clientId: notice.clientId,
        note: `Ground: ${point}`,
      },
      session,
    );
  });

  revalidatePath(`/practice/notices/${id}`);
  return { ok: "Saved." };
}

/** The same matter in words the client can act on. */
export async function savePlainWords(id, formData) {
  const actor = await requireUser();
  const notice = await loadForWork(actor, id);

  const words = String(formData.get("plainWords") ?? "").trim();
  const check = checkPlainWords(words);
  if (!check.ok) return { error: check.error };

  await audited(actor, async (session) => {
    notice.plainWords = words;
    touched(notice, actor);
    await notice.save({ session });
    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Notice",
        entityId: notice._id,
        clientId: notice.clientId,
        note: "The client's paragraph was written or changed",
      },
      session,
    );
  });

  revalidatePath(`/practice/notices/${id}`);
  return { ok: "Saved. This is what the client is told." };
}

/** Add a paper to the bundle's index, in reading order. */
export async function addPaper(id, formData) {
  const actor = await requireUser();
  const notice = await loadForWork(actor, id);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name the paper." };

  await audited(actor, async (session) => {
    notice.paperBook.push({
      name,
      order: notice.paperBook.length + 1,
      pages: String(formData.get("pages") ?? "").trim(),
      note: String(formData.get("note") ?? "").trim(),
    });
    touched(notice, actor);
    await notice.save({ session });
    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Notice",
        entityId: notice._id,
        clientId: notice.clientId,
        note: `Paper book: ${name}`,
      },
      session,
    );
  });

  revalidatePath(`/practice/notices/${id}`);
  return { ok: "Added to the bundle." };
}

/** Move the matter along, or record the order, or close it. */
export async function setStage(id, formData) {
  const actor = await requireUser();
  const notice = await loadForWork(actor, id);

  const stage = String(formData.get("stage") ?? "");
  if (!NOTICE_STAGES.includes(stage)) return { error: "Unknown stage." };

  const orderDate = readDate(formData.get("orderDate"));
  if (orderDate === undefined) return { error: "That date is not a date." };

  const from = notice.stage;

  await audited(actor, async (session) => {
    notice.stage = stage;
    if (orderDate) notice.orderDate = orderDate;
    const orderNote = String(formData.get("orderNote") ?? "").trim();
    if (orderNote) notice.orderNote = orderNote;
    const demand = String(formData.get("demand") ?? "").trim();
    if (demand) {
      try {
        notice.demandPaise = toPaise(demand);
      } catch {
        // left alone: the message below says nothing about it, and a bad
        // figure is better refused than guessed
      }
    }
    if (stage === "Closed") {
      notice.closedAt = new Date();
      notice.closedNote = String(formData.get("closedNote") ?? "").trim();
    }
    touched(notice, actor);
    await notice.save({ session });
    await recordAudit(
      {
        action: ACTIONS.statusChange,
        entityType: "Notice",
        entityId: notice._id,
        clientId: notice.clientId,
        diff: { stage: [from, stage] },
        note: orderDate ? `Order dated ${istInputDate(orderDate)}` : "",
      },
      session,
    );
  });

  revalidatePath(`/practice/notices/${id}`);
  revalidatePath("/practice/notices");
  return { ok: `Moved to ${stage}.` };
}

/**
 * A partner confirms one rule of the law table (P3-11, CLAUDE.md rule 8).
 *
 * Until this exists for a rule, nothing on any screen turns it into a date.
 * Partner-only, and recorded with their name — the firm is going to rely on
 * this, and "the system said so" is not an answer anybody can give a client.
 */
export async function confirmLawRule(kind, key, formData) {
  const actor = await requireUser();
  assertCan(actor, "approve", "feeWriteOff");

  const entry = NOTICE_KINDS[kind];
  const rule = entry?.rules.find((row) => row.key === key);
  if (!rule) return { error: "No such rule." };

  await connectDB();
  const note = String(formData?.get("note") ?? "").trim();

  await audited(actor, async (session) => {
    const row = await RuleConfirmation.findOneAndUpdate(
      { kind, key },
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
        $setOnInsert: { kind, key, createdBy: actor.id },
      },
      { new: true, upsert: true, session },
    );

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "RuleConfirmation",
        entityId: row._id,
        note: `${kind}/${key} confirmed: ${rule.cite}${note ? ` — ${note}` : ""}`,
      },
      session,
    );
  });

  revalidatePath("/practice/notices", "layout");
  return {
    ok: "Confirmed. Dates that follow from this rule will now be shown, with your name against them.",
  };
}

/** Everyone who may be put on a matter, for the pickers. */
export async function noticePeople() {
  const actor = await requireUser();
  if (!can(actor, "view", "practice")) return [];
  await connectDB();
  const { default: User } = await import("@/models/User");
  const people = await User.find({ active: true })
    .select("name role")
    .sort({ name: 1 })
    .lean();
  return people.map((person) => ({
    id: String(person._id),
    name: person.name,
    role: person.role,
  }));
}

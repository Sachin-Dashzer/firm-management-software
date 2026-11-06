"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan, can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import Potential, { POTENTIAL_STATUSES } from "@/models/Potential";
import Client from "@/models/Client";
import { checkMobile, checkEmail } from "@/lib/validators";
import { istDayFromInput, istInputDate, formatISTDate } from "@/lib/dates";

/**
 * The potential register's own server side (owner request, 04-11-2026).
 *
 * Four fields and three verbs: write one down, keep the remarks up to
 * date, and say it is not going anywhere. The fourth thing somebody does
 * with a row — turning it into a client — is not here: it goes through the
 * onboarding wizard, which is the only path into the client list, and the
 * wizard marks the row on its way out (`clients/new/actions.js`).
 *
 * Every action is audited like any other change (CLAUDE.md rule 2) and
 * checked against the matrix on the server (rule 1). The register is
 * wider than the client list — an employee may write in their office's —
 * so the scope is checked against the row, not just the area.
 */

/**
 * The row, and whether this person may change it.
 *
 * `own` scope answers through `createdBy`: an intern keeps their own
 * conversations and does not edit somebody else's.
 */
async function mine(actor, id) {
  /* an id that is not one goes nowhere near findById, where a bad string
     is a CastError rather than "no such row" */
  if (!/^[a-f\d]{24}$/i.test(String(id ?? ""))) return null;

  await connectDB();
  const row = await Potential.findById(String(id));
  if (!row) return null;

  assertCan(actor, "edit", "potentials", {
    branchId: String(row.branchId ?? ""),
    userId: String(row.createdBy ?? ""),
  });
  return row;
}

/** Read the fields off the form, and say what is wrong in words. */
function read(formData) {
  const name = String(formData.get("name") ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) return { error: "A name, at least — who is this?" };
  if (name.length > 120) return { error: "That name is too long." };

  const rawMobile = String(formData.get("mobile") ?? "").trim();
  const rawEmail = String(formData.get("email") ?? "").trim();

  /*
   * A name with no way to reach it is a note, not a lead. This is the one
   * rule the register enforces, because the whole point of writing a
   * conversation down is being able to pick it up again.
   */
  if (!rawMobile && !rawEmail) {
    return {
      error: "A mobile number or an email — something to ring or write to.",
    };
  }

  let mobile = "";
  if (rawMobile) {
    const checked = checkMobile(rawMobile);
    if (!checked.ok) return { error: checked.reason };
    mobile = checked.value;
  }

  let email = "";
  if (rawEmail) {
    const checked = checkEmail(rawEmail);
    if (!checked.ok) return { error: checked.reason };
    email = checked.value;
  }

  /*
   * A date box sends "" when it is empty, and empty is a real answer here —
   * plenty of enquiries are "he will ring us". `istDayFromInput` tells the
   * two apart: null for an empty box, false for something that is not a
   * date, and the IST day itself otherwise.
   */
  const followUpOn = istDayFromInput(formData.get("followUp"));
  if (followUpOn === false) return { error: "That is not a date." };

  return {
    ok: true,
    name,
    mobile,
    email,
    followUpOn,
    remarks: String(formData.get("remarks") ?? "")
      .trim()
      .slice(0, 2000),
  };
}

/** Write one down. */
export async function addPotential(_prev, formData) {
  const actor = await requireUser();
  assertCan(actor, "edit", "potentials");

  const input = read(formData);
  if (!input.ok) return { error: input.error };

  await connectDB();

  /**
   * Are we already talking to this person?
   *
   * The register is read by a whole office, so two people taking the same
   * enquiry is the normal failure, not a rare one. Blocking rather than
   * warning: a register with the same number in it twice is one nobody
   * trusts, and the row that exists already has the remarks on it.
   *
   * Deliberately **not** branch-filtered. Somebody writing down a number
   * that the Delhi office is already chasing needs to be told, even
   * though they cannot read that row — so the message names the office
   * and the person, and not the row's remarks.
   */
  const reach = [
    ...(input.mobile ? [{ mobile: input.mobile }] : []),
    ...(input.email ? [{ email: input.email }] : []),
  ];
  const already = await Potential.findOne({ $or: reach })
    .select("name status createdByName")
    .lean();
  if (already) {
    return {
      error:
        `${already.name} is already in the register with that number or email` +
        (already.createdByName
          ? `, written down by ${already.createdByName}`
          : "") +
        (already.status === "Talking"
          ? "."
          : ` (${already.status.toLowerCase()}).`),
    };
  }

  /** And are they a client already? Worth saying, not worth refusing. */
  const client = await Client.findOne({
    $or: [
      ...(input.mobile ? [{ "contacts.mobile": input.mobile }] : []),
      ...(input.email ? [{ "contacts.email": input.email }] : []),
    ],
  })
    .select("legalName tradeName")
    .lean();

  const row = await audited(actor, async (session) => {
    const [created] = await Potential.create(
      [
        {
          name: input.name,
          mobile: input.mobile,
          email: input.email,
          remarks: input.remarks,
          followUpOn: input.followUpOn,
          status: "Talking",
          /* the office of whoever took the call; a partner with no branch
             leaves it unset, and a partner reads the register unfiltered */
          branchId: actor.branchIds?.[0] ?? null,
          createdBy: actor.id,
          createdByName: actor.name ?? "",
          updatedBy: actor.id,
        },
      ],
      { session, ordered: true },
    );
    return created;
  });

  revalidatePath("/potentials");
  return {
    ok: client
      ? `Written down. Note that ${client.tradeName || client.legalName} is already a client on that number or email.`
      : input.followUpOn
        ? `Written down. Next call ${formatISTDate(input.followUpOn)}.`
        : "Written down.",
    id: String(row._id),
  };
}

/**
 * Change the remarks, the follow-up date, or both.
 *
 * The two fields that are edited rather than written once, and they are
 * edited together because they are the same act: you put the phone down,
 * you write what was said and when to ring again. One form in the row, one
 * save, one audit entry.
 *
 * Neither previous value is lost — the audit entry carries the before and
 * after, which is the conversation's history kept somewhere nobody can
 * tidy it up.
 */
export async function updatePotential(id, formData) {
  const actor = await requireUser();
  const row = await mine(actor, id);
  if (!row) return { error: "That one is no longer in the register." };

  const remarks = String(formData.get("remarks") ?? "")
    .trim()
    .slice(0, 2000);
  const followUpOn = istDayFromInput(formData.get("followUp"));
  if (followUpOn === false) return { error: "That is not a date." };

  /* compared as the day each one names, not as two instants: a stored IST
     midnight and what a date box just sent are the same day in different
     shapes, and would otherwise read as a change on every save */
  const dateChanged = istInputDate(row.followUpOn) !== istInputDate(followUpOn);
  if (remarks === row.remarks && !dateChanged) {
    return { ok: "Nothing changed." };
  }

  await audited(actor, async (session) => {
    row.remarks = remarks;
    row.followUpOn = followUpOn;
    row.updatedBy = actor.id;
    await row.save({ session });
  });

  revalidatePath("/potentials");
  return {
    ok: !dateChanged
      ? "Saved."
      : followUpOn
        ? `Saved. Next call ${formatISTDate(followUpOn)}.`
        : "Saved, and the follow-up date is off.",
  };
}

/**
 * Still talking, or not going ahead.
 *
 * **`Converted` is not settable here.** A row says converted when a client
 * record exists and is linked to it, which only the onboarding wizard can
 * do — otherwise the register would be able to claim a client the client
 * list has never heard of.
 */
export async function setPotentialStatus(id, status) {
  const actor = await requireUser();

  const wanted = String(status ?? "");
  if (!POTENTIAL_STATUSES.includes(wanted)) {
    return { error: "There is no such state." };
  }
  if (wanted === "Converted") {
    return {
      error:
        "Converting goes through onboarding, so the client record exists. Use “Convert to client”.",
    };
  }

  const row = await mine(actor, id);
  if (!row) return { error: "That one is no longer in the register." };
  if (row.status === "Converted") {
    return { error: "They are a client now, so this row stays as it is." };
  }
  if (row.status === wanted) return { ok: "Nothing changed." };

  await audited(actor, async (session) => {
    row.status = wanted;
    row.updatedBy = actor.id;
    await row.save({ session });
  });

  revalidatePath("/potentials");
  return {
    ok:
      wanted === "Dropped"
        ? "Marked as not going ahead. It stays on the register."
        : "Back on the list of conversations.",
  };
}

/**
 * Take one off the register for good.
 *
 * Soft delete, like everything else (CLAUDE.md rule 3) — "who was that
 * person we spoke to in March" is exactly the kind of thing asked later.
 * For a lead who said no, **Dropped** is the right answer and keeps them
 * in sight; this is for the row typed in twice or into the wrong field.
 */
export async function removePotential(id) {
  const actor = await requireUser();
  const row = await mine(actor, id);
  if (!row) return { error: "That one is no longer in the register." };

  if (row.status === "Converted" && !can(actor, "edit", "clients")) {
    return {
      error: "They became a client, so this row is part of that record.",
    };
  }

  await audited(actor, async (session) => {
    row.updatedBy = actor.id;
    await row.softDelete(actor.id, { session });
  });

  revalidatePath("/potentials");
  return { ok: "Taken off the register." };
}

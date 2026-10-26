"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan, can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import { toPaise } from "@/lib/money";
import Invoice from "@/models/Invoice";
import Client from "@/models/Client";
import Branch from "@/models/Branch";
import Engagement from "@/models/Engagement";
import { applyTotals, reasonsNotIssuable, stateName } from "@/lib/billing/gst";
import { nextInvoiceNumber } from "@/lib/billing/number";
import { invoicePdfAttachment } from "@/lib/billing/attachment";
import { invoiceIssued } from "@/lib/mailer/events";
import { checkPromise } from "@/lib/billing/promise";
import { istInputDate } from "@/lib/dates";

/**
 * Invoices (spec section 7).
 *
 * The shape of this file follows one rule: **a draft is soft and an issued
 * invoice is hard.** Anything can change while it is a draft. Once it is
 * issued it has a number in a statutory series, and the only way to change
 * it is a credit note — so `issueInvoice` is the one-way door, and
 * everything after it refuses to edit.
 */

/** A discount beyond this needs a partner to approve it (spec section 7). */
const DISCOUNT_NEEDS_APPROVAL = Number(
  process.env.DISCOUNT_APPROVAL_PERCENT || 10,
);

async function loadForWrite(actor, id) {
  await connectDB();
  const invoice = await Invoice.findById(id);
  if (!invoice) throw new Error("That invoice no longer exists.");
  assertCan(actor, "edit", "invoices", {
    branchId: String(invoice.branchId),
  });
  return invoice;
}

/**
 * Start a draft, optionally from engagements that have not been billed.
 * @param {object} input
 */
export async function createDraft(input) {
  const actor = await requireUser();
  await connectDB();

  const client = await Client.findById(input.clientId).lean();
  if (!client) return { error: "That client no longer exists." };

  assertCan(actor, "edit", "invoices", { branchId: String(client.branchId) });

  const branch = await Branch.findById(client.branchId).lean();

  // the place of supply for a service is the recipient's state: their
  // billing GSTIN if they have one, their registered address if not
  const billingGstin = (client.gstins ?? [])[0]?.gstin ?? "";
  const addressState = (client.addresses ?? [])[0]?.stateCode ?? "";
  const placeOfSupply = billingGstin
    ? String(billingGstin).slice(0, 2)
    : addressState;

  const engagements = input.engagementIds?.length
    ? await Engagement.find({
        _id: { $in: input.engagementIds },
        clientId: client._id,
      }).lean()
    : [];

  const creditDays = Number(client.creditDays ?? 0);
  const date = new Date();

  const draft = await audited(actor, async (session) => {
    const [doc] = await Invoice.create(
      [
        {
          type: input.type ?? "Tax invoice",
          status: "Draft",
          date,
          dueDate: creditDays
            ? new Date(date.getTime() + creditDays * 86_400_000)
            : null,
          clientId: client._id,
          branchId: client.branchId,
          supplierGstin: branch?.gstin ?? "",
          billingGstin,
          placeOfSupply,
          placeOfSupplyName: stateName(placeOfSupply),
          billingName: client.legalName,
          billingAddress: (client.addresses ?? [])[0]?.line1 ?? "",
          lines: engagements.map((engagement) => ({
            engagementId: engagement._id,
            description: `${engagement.templateSnapshot?.name ?? "Professional services"} — ${engagement.periodLabel || engagement.period}`,
            sac: engagement.templateSnapshot?.sac ?? "",
            amountPaise: engagement.feePaise ?? 0,
            gstRate: engagement.templateSnapshot?.gstRate ?? 18,
          })),
          createdBy: actor.id,
          updatedBy: actor.id,
        },
      ],
      { session },
    );

    const branchDoc = branch;
    applyTotals(doc, branchDoc, client);
    await doc.save({ session });
    return doc;
  });

  revalidatePath("/invoices");
  return { ok: "Draft created.", id: String(draft._id) };
}

/** Change a draft. Refuses once the invoice has been issued. */
export async function updateDraft(id, input) {
  const actor = await requireUser();
  const invoice = await loadForWrite(actor, id);

  if (invoice.status !== "Draft") {
    return {
      error:
        "This invoice has been issued. Raise a credit note instead of changing it.",
    };
  }

  const discount = Number(input.discountPercent ?? invoice.discountPercent);
  if (
    discount > DISCOUNT_NEEDS_APPROVAL &&
    actor.role !== "partner" &&
    !invoice.discountApprovedBy
  ) {
    return {
      error: `A discount above ${DISCOUNT_NEEDS_APPROVAL}% needs a partner to approve it.`,
    };
  }

  const [branch, client] = await Promise.all([
    Branch.findById(invoice.branchId).lean(),
    Client.findById(invoice.clientId).lean(),
  ]);

  await audited(actor, async (session) => {
    if (input.lines) {
      invoice.lines = input.lines.map((line) => ({
        engagementId: line.engagementId || null,
        description: String(line.description ?? "").trim(),
        sac: String(line.sac ?? "").trim(),
        amountPaise: toPaise(line.amount ?? "0"),
        gstRate: Number(line.gstRate ?? 18),
      }));
    }
    if (input.reimbursements) {
      invoice.reimbursements = input.reimbursements.map((item) => ({
        description: String(item.description ?? "").trim(),
        amountPaise: toPaise(item.amount ?? "0"),
      }));
    }
    if (input.notes !== undefined) invoice.notes = String(input.notes).trim();
    if (input.dueDate !== undefined) {
      invoice.dueDate = input.dueDate
        ? new Date(`${input.dueDate}T00:00:00+05:30`)
        : null;
    }
    if (input.placeOfSupply !== undefined) {
      invoice.placeOfSupply = String(input.placeOfSupply);
      invoice.placeOfSupplyName = stateName(input.placeOfSupply);
    }
    invoice.discountPercent = discount;
    if (discount > DISCOUNT_NEEDS_APPROVAL && actor.role === "partner") {
      invoice.discountApprovedBy = actor.id;
    }

    // the branch GSTIN is re-read on every save, so filling it in later
    // fixes a draft that could not be issued
    invoice.supplierGstin = branch?.gstin ?? "";
    applyTotals(invoice, branch, client);
    invoice.updatedBy = actor.id;
    await invoice.save({ session });
  });

  revalidatePath(`/invoices/${id}`);
  return { ok: "Draft saved." };
}

/**
 * Issue it. This is the one-way door: the number is taken here, inside the
 * transaction that writes the invoice, so the series cannot gap.
 */
export async function issueInvoice(id) {
  const actor = await requireUser();
  const invoice = await loadForWrite(actor, id);

  if (invoice.status !== "Draft") {
    return {
      error: `This invoice is already ${invoice.status.toLowerCase()}.`,
    };
  }

  const [branch, client] = await Promise.all([
    Branch.findById(invoice.branchId).lean(),
    Client.findById(invoice.clientId).lean(),
  ]);

  const reasons = reasonsNotIssuable(invoice, branch);
  if (reasons.length > 0) return { error: reasons.join(" "), reasons };

  try {
    await audited(actor, async (session) => {
      // recompute once more: the figures that get a number are the figures
      // that were checked a line above, not whatever was stored earlier
      applyTotals(invoice, branch, client);

      const { number, series, seq } = await nextInvoiceNumber(
        branch.invoicePrefix || branch.code,
        invoice.date,
        session,
      );

      invoice.number = number;
      invoice.series = series;
      invoice.seq = seq;
      invoice.status = "Sent";
      invoice.issuedAt = new Date();
      invoice.issuedBy = actor.id;
      invoice.supplierGstin = branch.gstin;
      invoice.updatedBy = actor.id;
      await invoice.save({ session });

      await recordAudit(
        {
          action: ACTIONS.invoiceIssue,
          entityType: "Invoice",
          entityId: invoice._id,
          clientId: invoice.clientId,
          note: `${number} issued for ${(invoice.totalPaise / 100).toFixed(2)}`,
        },
        session,
      );

      // the engagements on it are now billed (spec section 5)
      const engagementIds = invoice.lines
        .map((line) => line.engagementId)
        .filter(Boolean);
      for (const engagementId of engagementIds) {
        const engagement =
          await Engagement.findById(engagementId).session(session);
        if (!engagement) continue;
        engagement.billingStatus = "Billed";
        engagement.updatedBy = actor.id;
        await engagement.save({ session });
      }

      // the client is emailed the invoice with its PDF attached — held
      // back by the guard until client email is switched on
      await invoiceIssued(
        invoice,
        client,
        await invoicePdfAttachment(invoice),
        session,
      );
    });
  } catch (err) {
    return { error: err.message };
  }

  revalidatePath(`/invoices/${id}`);
  revalidatePath("/invoices");
  return { ok: `Issued as ${invoice.number}.` };
}

/**
 * Cancel or reduce an issued invoice with a credit note (spec section 7).
 * The original is never edited and never deleted.
 */
export async function raiseCreditNote(id, { reason, amount }) {
  const actor = await requireUser();
  const invoice = await loadForWrite(actor, id);

  if (invoice.status === "Draft") {
    return { error: "A draft can simply be changed — no credit note needed." };
  }
  if (invoice.cancelledBy) {
    return { error: "A credit note has already been raised for this." };
  }
  if (!String(reason ?? "").trim()) {
    return { error: "Say why the credit note is being raised." };
  }

  const full = !amount;
  let creditPaise;
  try {
    creditPaise = full ? invoice.totalPaise : toPaise(amount);
  } catch {
    return { error: "That is not an amount." };
  }
  if (creditPaise <= 0 || creditPaise > invoice.totalPaise) {
    return { error: "A credit note cannot exceed the invoice." };
  }

  const branch = await Branch.findById(invoice.branchId).lean();

  let note;
  try {
    note = await audited(actor, async (session) => {
      const { number, series, seq } = await nextInvoiceNumber(
        branch.invoicePrefix || branch.code,
        new Date(),
        session,
      );

      const [doc] = await Invoice.create(
        [
          {
            number,
            series,
            seq,
            type: "Credit note",
            status: "Sent",
            date: new Date(),
            clientId: invoice.clientId,
            branchId: invoice.branchId,
            supplierGstin: invoice.supplierGstin,
            billingGstin: invoice.billingGstin,
            placeOfSupply: invoice.placeOfSupply,
            placeOfSupplyName: invoice.placeOfSupplyName,
            billingName: invoice.billingName,
            billingAddress: invoice.billingAddress,
            creditNoteFor: invoice._id,
            notes: reason,
            lines: [
              {
                description: `Credit against ${invoice.number}: ${reason}`,
                sac: invoice.lines[0]?.sac ?? "",
                amountPaise: creditPaise,
                gstRate: 0,
                netPaise: creditPaise,
                totalPaise: creditPaise,
              },
            ],
            subtotalPaise: creditPaise,
            totalPaise: creditPaise,
            issuedAt: new Date(),
            issuedBy: actor.id,
            createdBy: actor.id,
            updatedBy: actor.id,
          },
        ],
        { session },
      );

      if (full) {
        invoice.status = "Cancelled";
        invoice.cancelledBy = doc._id;
        invoice.updatedBy = actor.id;
        await invoice.save({ session });
      }

      await recordAudit(
        {
          action: ACTIONS.invoiceCancel,
          entityType: "Invoice",
          entityId: invoice._id,
          clientId: invoice.clientId,
          note: `${full ? "cancelled" : "credited"} by ${number}: ${reason}`,
        },
        session,
      );

      return doc;
    });
  } catch (err) {
    return { error: err.message };
  }

  revalidatePath(`/invoices/${id}`);
  revalidatePath("/invoices");
  return { ok: `Credit note ${note.number} raised.`, id: String(note._id) };
}

/** Mark a query from the client, which keeps it out of reminders. */
export async function setDisputed(id, disputed, reason = "") {
  const actor = await requireUser();
  const invoice = await loadForWrite(actor, id);

  await audited(actor, async (session) => {
    invoice.status = disputed ? "Disputed" : "Sent";
    invoice.notes = reason
      ? `${invoice.notes}\n${disputed ? "Disputed" : "Dispute resolved"}: ${reason}`.trim()
      : invoice.notes;
    invoice.updatedBy = actor.id;
    await invoice.save({ session });
  });

  revalidatePath(`/invoices/${id}`);
  return { ok: disputed ? "Marked disputed." : "Dispute cleared." };
}

/** Write a debt off. Partner only (spec section 2: feeWriteOff). */
export async function writeOff(id, reason) {
  const actor = await requireUser();
  assertCan(actor, "approve", "feeWriteOff");

  const invoice = await loadForWrite(actor, id);
  if (!String(reason ?? "").trim()) {
    return { error: "A write-off needs a reason." };
  }

  await audited(actor, async (session) => {
    invoice.status = "Written off";
    invoice.writtenOffReason = String(reason).trim();
    invoice.updatedBy = actor.id;
    await invoice.save({ session });

    await recordAudit(
      {
        action: ACTIONS.writeOff,
        entityType: "Invoice",
        entityId: invoice._id,
        clientId: invoice.clientId,
        note: `${invoice.number}: ${reason}`,
      },
      session,
    );
  });

  revalidatePath(`/invoices/${id}`);
  return { ok: "Written off." };
}

/** Completed engagements with nothing billed against them (spec §7). */
export async function unbilledFor(clientId) {
  const actor = await requireUser();
  if (!can(actor, "view", "invoices")) return [];

  await connectDB();
  const engagements = await Engagement.find({
    clientId,
    billingStatus: "Unbilled",
    status: { $in: ["Filed / delivered", "Completed"] },
  })
    .select("code templateSnapshot periodLabel period feePaise")
    .sort({ completedAt: -1 })
    .limit(100)
    .lean();

  return engagements.map((e) => ({
    id: String(e._id),
    code: e.code,
    label: `${e.templateSnapshot?.name ?? "Work"} — ${e.periodLabel || e.period}`,
    feePaise: e.feePaise ?? 0,
  }));
}

/**
 * Record the date a client has given for paying one invoice (P3-3).
 *
 * Automatic chasing stops for that invoice until the day after, then starts
 * again by itself — the sweep reads the date rather than a flag anybody has
 * to clear, so nothing has to be remembered.
 *
 * Per invoice on purpose: a client can be good for one bill and arguing
 * about another, and a promise about the first should not buy silence on
 * the second.
 */
export async function recordPromise(id, formData) {
  const actor = await requireUser();
  const invoice = await loadForWrite(actor, id);

  const text = String(formData.get("date") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const date = text ? new Date(`${text}T00:00:00+05:30`) : null;
  if (text && Number.isNaN(date?.valueOf())) {
    return { error: "That is not a date." };
  }

  const checked = checkPromise(date);
  if (!checked.ok) return { error: checked.error };

  const before = invoice.promise?.date ?? null;

  await audited(actor, async (session) => {
    invoice.promise = {
      date,
      note,
      byId: actor.id,
      byName: actor.name,
      at: new Date(),
    };
    invoice.updatedBy = actor.id;
    await invoice.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Invoice",
        entityId: invoice._id,
        clientId: invoice.clientId,
        diff: {
          promise: [istInputDate(before), istInputDate(date)],
        },
        note: `Client promised to pay by ${istInputDate(date)}${note ? `: ${note}` : ""}. Automatic reminders pause until the day after.`,
      },
      session,
    );
  });

  revalidatePath(`/invoices/${id}`);
  revalidatePath("/invoices/receivables");
  return {
    ok: `Noted. ${invoice.number} will not be chased automatically until ${istInputDate(date)} has passed.`,
  };
}

/**
 * Take a promise off, because the client has moved it or paid.
 *
 * Clearing it by hand is not usually needed — a promise expires the day
 * after its date — but a client who rings to say "actually, next month"
 * should not leave the old date on the record.
 */
export async function clearPromise(id) {
  const actor = await requireUser();
  const invoice = await loadForWrite(actor, id);
  if (!invoice.promise)
    return { error: "There is no promise on that invoice." };

  const was = invoice.promise.date;

  await audited(actor, async (session) => {
    invoice.promise = null;
    invoice.updatedBy = actor.id;
    await invoice.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Invoice",
        entityId: invoice._id,
        clientId: invoice.clientId,
        diff: { promise: [istInputDate(was), ""] },
        note: "Payment promise removed; ordinary reminders resume.",
      },
      session,
    );
  });

  revalidatePath(`/invoices/${id}`);
  revalidatePath("/invoices/receivables");
  return { ok: "Promise removed. Reminders resume on the usual cadence." };
}

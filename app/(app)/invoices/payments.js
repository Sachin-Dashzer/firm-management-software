"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan, can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import { toPaise } from "@/lib/money";
import Payment from "@/models/Payment";
import Invoice from "@/models/Invoice";
import Client from "@/models/Client";
import { paymentReceived } from "@/lib/mailer/events";
import {
  PAYMENT_MODES,
  checkAllocation,
  statusAfterPayment,
  suggestAllocation,
  outstandingOf,
} from "@/lib/billing/allocation";

/**
 * Receipts and what they settle (spec section 7).
 *
 * Every write here moves two things at once — the payment and the invoices
 * it touches — so they all run inside one `audited()` transaction. A
 * payment recorded without its invoices updating, or the reverse, would
 * leave the firm chasing money it has, which is the failure this is built
 * to avoid.
 */

/** Apply a payment's allocations to the invoices, and set their statuses. */
async function applyToInvoices(
  payment,
  session,
  actorId,
  { reverse = false } = {},
) {
  const sign = reverse ? -1 : 1;

  for (const allocation of payment.allocations) {
    const invoice = await Invoice.findById(allocation.invoiceId).session(
      session,
    );
    if (!invoice) continue;

    invoice.paidPaise = Math.max(
      0,
      (invoice.paidPaise ?? 0) + sign * (allocation.amountPaise ?? 0),
    );
    invoice.tdsCreditedPaise = Math.max(
      0,
      (invoice.tdsCreditedPaise ?? 0) + sign * (allocation.tdsPaise ?? 0),
    );
    invoice.status = statusAfterPayment(invoice);
    invoice.updatedBy = actorId;
    await invoice.save({ session });
  }
}

/** The open invoices for a client, oldest first — what a receipt can go on. */
export async function openInvoicesFor(clientId) {
  const actor = await requireUser();
  if (!can(actor, "view", "invoices")) return [];

  await connectDB();
  const invoices = await Invoice.find({
    clientId,
    status: { $in: ["Sent", "Partially paid", "Disputed"] },
    type: { $ne: "Credit note" },
  })
    .sort({ date: 1 })
    .limit(200)
    .lean();

  return invoices.map((invoice) => ({
    id: String(invoice._id),
    number: invoice.number,
    date: invoice.date,
    totalPaise: invoice.totalPaise ?? 0,
    paidPaise: invoice.paidPaise ?? 0,
    tdsCreditedPaise: invoice.tdsCreditedPaise ?? 0,
    outstandingPaise: outstandingOf(invoice),
  }));
}

/** What the screen offers before anyone types: oldest invoices first. */
export async function suggestFor(clientId, amount, tds) {
  const invoices = await openInvoicesFor(clientId);
  let amountPaise = 0;
  let tdsPaise = 0;
  try {
    amountPaise = toPaise(amount || "0");
    tdsPaise = toPaise(tds || "0");
  } catch {
    return { error: "That is not an amount." };
  }
  return { ok: true, ...suggestAllocation(amountPaise, invoices, tdsPaise) };
}

/**
 * Record a receipt and put it against invoices (spec section 7).
 * @param {object} input
 */
export async function recordPayment(input) {
  const actor = await requireUser();
  await connectDB();

  const client = await Client.findById(input.clientId)
    .select("branchId legalName")
    .lean();
  if (!client) return { error: "That client no longer exists." };

  assertCan(actor, "edit", "invoices", { branchId: String(client.branchId) });

  let amountPaise;
  let tdsPaise;
  try {
    amountPaise = toPaise(input.amount || "0");
    tdsPaise = toPaise(input.tds || "0");
  } catch {
    return { error: "That is not an amount." };
  }

  if (!PAYMENT_MODES.includes(input.mode)) {
    return { error: "Unknown payment mode." };
  }

  const date = input.date
    ? new Date(`${input.date}T00:00:00+05:30`)
    : new Date();
  if (Number.isNaN(date.valueOf())) return { error: "That is not a date." };
  if (date > new Date(Date.now() + 86_400_000)) {
    return { error: "That date is in the future." };
  }

  const allocations = (input.allocations ?? [])
    .map((a) => ({
      invoiceId: a.invoiceId,
      amountPaise: toPaise(a.amount || "0"),
      tdsPaise: toPaise(a.tds || "0"),
    }))
    .filter((a) => a.amountPaise > 0 || a.tdsPaise > 0);

  const invoices = await Invoice.find({
    _id: { $in: allocations.map((a) => a.invoiceId) },
  }).lean();
  const byId = new Map(invoices.map((i) => [String(i._id), i]));

  const problems = checkAllocation({
    amountPaise,
    tdsPaise,
    allocations,
    invoices: byId,
  });
  if (problems.length > 0) return { error: problems.join(" "), problems };

  const payment = await audited(actor, async (session) => {
    const [doc] = await Payment.create(
      [
        {
          clientId: client._id,
          branchId: client.branchId,
          date,
          amountPaise,
          tdsPaise,
          mode: input.mode,
          reference: String(input.reference ?? "").trim(),
          notes: String(input.notes ?? "").trim(),
          allocations,
          createdBy: actor.id,
          updatedBy: actor.id,
        },
      ],
      { session },
    );

    await applyToInvoices(doc, session, actor.id);

    await recordAudit(
      {
        action: ACTIONS.paymentEntry,
        entityType: "Payment",
        entityId: doc._id,
        clientId: client._id,
        note: `${(amountPaise / 100).toFixed(2)} by ${input.mode}${
          tdsPaise ? `, TDS ${(tdsPaise / 100).toFixed(2)}` : ""
        }, against ${allocations.length} ${allocations.length === 1 ? "invoice" : "invoices"}`,
      },
      session,
    );

    // what the client still owes after this, for the message
    const open = await Invoice.find({
      clientId: client._id,
      status: { $in: ["Sent", "Partially paid", "Disputed"] },
      type: { $ne: "Credit note" },
    }).session(session);
    const balance = open.reduce((sum, i) => sum + outstandingOf(i), 0);

    await paymentReceived(doc, client, balance, session);

    return doc;
  });

  const unallocated =
    amountPaise - allocations.reduce((s, a) => s + a.amountPaise, 0);

  revalidatePath("/invoices");
  revalidatePath(`/clients/${input.clientId}`);
  return {
    ok:
      unallocated > 0
        ? `Payment recorded. ₹${(unallocated / 100).toLocaleString("en-IN")} is unallocated and sits as credit on the client.`
        : "Payment recorded.",
    id: String(payment._id),
  };
}

/**
 * Change where an existing payment was applied.
 *
 * The old allocations are taken off the invoices before the new ones go
 * on, inside the same transaction — otherwise a correction would leave
 * double credit behind.
 */
export async function reallocatePayment(id, allocations) {
  const actor = await requireUser();
  await connectDB();

  const payment = await Payment.findById(id);
  if (!payment) return { error: "That payment no longer exists." };
  assertCan(actor, "edit", "invoices", {
    branchId: String(payment.branchId ?? ""),
  });

  const parsed = (allocations ?? [])
    .map((a) => ({
      invoiceId: a.invoiceId,
      amountPaise: toPaise(a.amount || "0"),
      tdsPaise: toPaise(a.tds || "0"),
    }))
    .filter((a) => a.amountPaise > 0 || a.tdsPaise > 0);

  const invoices = await Invoice.find({
    _id: { $in: parsed.map((a) => a.invoiceId) },
  }).lean();

  // check against what the invoices would look like with this payment
  // taken back off, or a correction looks like an overpayment
  const byId = new Map(
    invoices.map((invoice) => {
      const old = payment.allocations.find(
        (a) => String(a.invoiceId) === String(invoice._id),
      );
      return [
        String(invoice._id),
        {
          ...invoice,
          paidPaise: (invoice.paidPaise ?? 0) - (old?.amountPaise ?? 0),
          tdsCreditedPaise:
            (invoice.tdsCreditedPaise ?? 0) - (old?.tdsPaise ?? 0),
        },
      ];
    }),
  );

  const problems = checkAllocation({
    amountPaise: payment.amountPaise,
    tdsPaise: payment.tdsPaise,
    allocations: parsed,
    invoices: byId,
  });
  if (problems.length > 0) return { error: problems.join(" ") };

  await audited(actor, async (session) => {
    await applyToInvoices(payment, session, actor.id, { reverse: true });
    payment.allocations = parsed;
    payment.updatedBy = actor.id;
    await payment.save({ session });
    await applyToInvoices(payment, session, actor.id);
  });

  revalidatePath("/invoices");
  revalidatePath(`/clients/${payment.clientId}`);
  return { ok: "Payment reallocated." };
}

/** Undo a payment entered in error: the invoices go back as they were. */
export async function deletePayment(id, reason) {
  const actor = await requireUser();
  await connectDB();

  const payment = await Payment.findById(id);
  if (!payment) return { error: "Already gone." };
  assertCan(actor, "edit", "invoices", {
    branchId: String(payment.branchId ?? ""),
  });
  if (!String(reason ?? "").trim()) {
    return { error: "Say why the payment is being removed." };
  }

  await audited(actor, async (session) => {
    await applyToInvoices(payment, session, actor.id, { reverse: true });

    await recordAudit(
      {
        action: ACTIONS.softDelete,
        entityType: "Payment",
        entityId: payment._id,
        clientId: payment.clientId,
        note: `payment of ${(payment.amountPaise / 100).toFixed(2)} removed: ${reason}`,
      },
      session,
    );

    payment.updatedBy = actor.id;
    await payment.softDelete(actor.id, { session });
  });

  revalidatePath("/invoices");
  revalidatePath(`/clients/${payment.clientId}`);
  return { ok: "Payment removed and the invoices put back." };
}

/** Tick the TDS off against Form 26AS (spec section 7, manual in v1). */
export async function setTds26AS(id, seen) {
  const actor = await requireUser();
  await connectDB();

  const payment = await Payment.findById(id);
  if (!payment) return { error: "That payment no longer exists." };
  assertCan(actor, "edit", "invoices", {
    branchId: String(payment.branchId ?? ""),
  });

  await audited(actor, async (session) => {
    payment.tdsSeenIn26AS = Boolean(seen);
    payment.updatedBy = actor.id;
    await payment.save({ session });
  });

  revalidatePath("/invoices/payments");
  return { ok: seen ? "Marked as seen in 26AS." : "Unticked." };
}

import Link from "next/link";
import { can, whyNot } from "@/lib/permissions";
import Payment from "@/models/Payment";
import Client from "@/models/Client";
import Invoice from "@/models/Invoice";
import { formatISTDate, financialQuarterLabel } from "@/lib/dates";
import TdsRows from "./TdsRows";

/**
 * TDS the client deducted and the firm has not yet seen in Form 26AS
 * (spec section 7, P3-22b).
 *
 * `setTds26AS` was written at Step 8b and has never had a screen — the tick
 * existed as a server action and nothing called it, so a receipt short-paid
 * by TDS stayed on the books with no way to say the credit had arrived.
 * This is that screen, and nothing about the reconciliation is automatic:
 * somebody opens the traces portal, reads the quarter, and ticks.
 *
 * Grouped by the quarter the receipt falls in, because 26AS is filed and
 * read a quarter at a time.
 */
export default async function TdsToMatch({ actor, scope, showMatched }) {
  const payments = await Payment.find({
    ...scope,
    tdsPaise: { $gt: 0 },
    tdsSeenIn26AS: Boolean(showMatched),
  })
    .sort({ date: -1 })
    .limit(500)
    .lean();

  const [clients, invoices] = await Promise.all([
    Client.find({ _id: { $in: payments.map((p) => p.clientId) } })
      .select("legalName tradeName")
      .lean(),
    Invoice.find({
      _id: {
        $in: payments.flatMap((p) =>
          (p.allocations ?? [])
            .filter((a) => (a.tdsPaise ?? 0) > 0)
            .map((a) => a.invoiceId),
        ),
      },
    })
      .select("number")
      .lean(),
  ]);

  const clientName = new Map(
    clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );
  const invoiceNumber = new Map(
    invoices.map((i) => [String(i._id), i.number ?? "draft"]),
  );

  const rows = payments.map((payment) => ({
    id: String(payment._id),
    clientId: String(payment.clientId),
    client: clientName.get(String(payment.clientId)) ?? "Client",
    date: formatISTDate(payment.date),
    quarter: financialQuarterLabel(payment.date),
    reference: payment.reference || payment.mode || "",
    tdsPaise: payment.tdsPaise ?? 0,
    against: (payment.allocations ?? [])
      .filter((a) => (a.tdsPaise ?? 0) > 0)
      .map((a) => ({
        id: String(a.invoiceId),
        number: invoiceNumber.get(String(a.invoiceId)) ?? "—",
      })),
  }));

  return (
    <>
      <p className="text-14 max-w-[75ch]">
        {showMatched
          ? "TDS already ticked off against Form 26AS. Untick one if it turns out not to be there."
          : "TDS a client deducted, which has not been found in Form 26AS yet. Read the quarter in the traces portal, then tick what is there."}{" "}
        <Link
          href={
            showMatched ? "/billing?tab=tds" : "/billing?tab=tds&matched=yes"
          }
          className="text-13 text-ink-muted underline underline-offset-4"
        >
          {showMatched ? "Show what is still to match" : "Show what is matched"}
        </Link>
      </p>

      <TdsRows
        rows={rows}
        matched={Boolean(showMatched)}
        canTick={can(actor, "edit", "invoices")}
        whyNot={whyNot(actor, "edit", "invoices")}
      />
    </>
  );
}

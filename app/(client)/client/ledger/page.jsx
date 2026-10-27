import { requireClientUser } from "@/auth";
import { connectDB } from "@/lib/db";
import Invoice from "@/models/Invoice";
import Payment from "@/models/Payment";
import { invoiceScope, paymentScope } from "@/lib/access/clientScope";
import { buildLedger } from "@/lib/billing/allocation";
import { formatPaise } from "@/lib/money";
import { formatISTDate } from "@/lib/dates";

export const metadata = { title: "Your account" };
export const dynamic = "force-dynamic";

/**
 * The client's statement of account (P2-9b).
 *
 * The same `buildLedger()` the firm's own ledger panel uses, on the same
 * two collections — so the balance a client reads here is the balance the
 * firm reads, to the paisa. A client statement that disagreed with the
 * firm's would be worse than no statement at all.
 */
export default async function ClientLedgerPage() {
  const person = await requireClientUser();
  await connectDB();

  const [invoices, payments] = await Promise.all([
    Invoice.find(invoiceScope(person)).lean(),
    Payment.find(paymentScope(person)).lean(),
  ]);

  const ledger = buildLedger(invoices, payments);
  const entries = Array.isArray(ledger) ? ledger : (ledger.entries ?? []);
  const closing = entries.at(-1)?.balancePaise ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-24 font-bold tracking-tight">
            Your account
          </h1>
          <p className="text-14 text-ink-muted">
            Bills raised, payments received, and what is left.
          </p>
        </div>
        <p className="text-14">
          <span className="text-ink-muted">Balance </span>
          <span className="num text-20 font-medium">
            {formatPaise(Math.abs(closing))}
          </span>
          <span className="text-13 text-ink-muted">
            {closing > 0 ? " owing" : closing < 0 ? " in credit" : ""}
          </span>
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="text-14 text-ink-muted rounded-ledger border-rule border border-dashed p-6">
          Nothing on the account yet.
        </p>
      ) : (
        <div className="rounded-table border-rule overflow-x-auto border">
          <table className="text-14 w-full border-collapse">
            <caption className="sr-only">Statement of account</caption>
            <thead>
              <tr className="border-rule bg-surface border-b text-left">
                {[
                  "Date",
                  "What",
                  "Reference",
                  "Charged",
                  "Paid",
                  "Balance",
                ].map((head) => (
                  <th
                    key={head}
                    scope="col"
                    className="text-13 text-ink-muted px-3 py-2 font-medium"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-rule border-b last:border-0"
                >
                  <td className="px-3 py-2">{formatISTDate(entry.date)}</td>
                  <td className="px-3 py-2">{entry.kind}</td>
                  <td className="px-3 py-2 font-mono">
                    {entry.reference || (
                      <span className="text-ink-muted font-sans">—</span>
                    )}
                  </td>
                  <td className="num px-3 py-2">
                    {entry.debitPaise ? (
                      formatPaise(entry.debitPaise)
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="num px-3 py-2">
                    {entry.creditPaise ? (
                      formatPaise(entry.creditPaise)
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="num px-3 py-2 font-medium">
                    {formatPaise(entry.balancePaise ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-13 text-ink-muted">
        TDS you have deducted appears as a credit on the day the payment was
        recorded. If anything here looks wrong, tell us on{" "}
        <a href="/client/profile" className="underline underline-offset-4">
          your details
        </a>{" "}
        and we will check it.
      </p>
    </div>
  );
}

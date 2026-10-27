import { requireClientUser } from "@/auth";
import { connectDB } from "@/lib/db";
import Invoice from "@/models/Invoice";
import { invoiceScope } from "@/lib/access/clientScope";
import { outstandingOf, outstandingSummary } from "@/lib/billing/allocation";
import { formatPaise } from "@/lib/money";
import { formatISTDate, daysUntil } from "@/lib/dates";

export const metadata = { title: "Invoices" };
export const dynamic = "force-dynamic";

/**
 * The client's own bills (P2-9b).
 *
 * **Issued only.** A draft is the firm thinking aloud about a number and a
 * cancelled one is a mistake being corrected; neither is a bill, and
 * `invoiceScope()` keeps both off this page. What is shown is what was
 * sent, with the same PDF the firm holds.
 */
export default async function ClientInvoicesPage() {
  const person = await requireClientUser();
  await connectDB();

  const invoices = await Invoice.find(invoiceScope(person))
    .select(
      "number type date dueDate status totalPaise paidPaise tdsCreditedPaise writtenOffPaise",
    )
    .sort({ date: -1 })
    .limit(500)
    .lean();

  const money = outstandingSummary(invoices);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-24 font-bold tracking-tight">
            Invoices
          </h1>
          <p className="text-14 text-ink-muted">
            Every bill we have raised for you.
          </p>
        </div>
        {money.totalPaise > 0 && (
          <p className="text-14">
            <span className="text-ink-muted">Outstanding </span>
            <span className="num text-20 font-medium">
              {formatPaise(money.totalPaise)}
            </span>
          </p>
        )}
      </div>

      {invoices.length === 0 ? (
        <p className="text-14 text-ink-muted rounded-ledger border-rule border border-dashed p-6">
          No invoices yet.
        </p>
      ) : (
        <div className="rounded-table border-rule overflow-x-auto border">
          <table className="text-14 w-full border-collapse">
            <thead>
              <tr className="border-rule bg-surface border-b text-left">
                {[
                  "Number",
                  "Date",
                  "Due",
                  "Total",
                  "Outstanding",
                  "Status",
                  "",
                ].map((head, index) => (
                  <th
                    key={head || index}
                    scope="col"
                    className="text-13 text-ink-muted px-3 py-2 font-medium"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const left = outstandingOf(invoice);
                const overdue =
                  left > 0 && invoice.dueDate && daysUntil(invoice.dueDate) < 0;
                return (
                  <tr
                    key={String(invoice._id)}
                    className="border-rule border-b last:border-0"
                  >
                    <td className="px-3 py-2 font-mono">{invoice.number}</td>
                    <td className="px-3 py-2">{formatISTDate(invoice.date)}</td>
                    <td className="px-3 py-2">
                      {invoice.dueDate ? (
                        <span className={overdue ? "text-redpen" : ""}>
                          {formatISTDate(invoice.dueDate)}
                        </span>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="num px-3 py-2">
                      {formatPaise(invoice.totalPaise ?? 0)}
                    </td>
                    <td className="num px-3 py-2">
                      {left > 0 ? (
                        formatPaise(left)
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{invoice.status}</td>
                    <td className="px-3 py-2">
                      <a
                        href={`/client/invoices/${invoice._id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-4"
                      >
                        PDF
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

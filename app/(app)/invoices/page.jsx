import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, branchFilter } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Invoice from "@/models/Invoice";
import Client from "@/models/Client";
import Branch from "@/models/Branch";
import { formatPaise } from "@/lib/money";
import { formatISTDate, daysUntil } from "@/lib/dates";
import { INVOICE_STATUSES } from "@/models/Invoice";
import { InvoiceStatusChip } from "./chips";

export const metadata = { title: "Billing · PHMG" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/**
 * The invoice list (spec section 7).
 *
 * Overdue is worked out as the page is drawn rather than stored, so it is
 * never a day stale — an invoice does not need touching at midnight to
 * become overdue.
 */
export default async function InvoicesPage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "invoices")) redirect("/today");

  const params = (await searchParams) ?? {};
  const page = Math.max(1, Number(params.page) || 1);
  const search = String(params.q ?? "").trim();

  await connectDB();

  /** @type {Record<string, any>} */
  const query = { ...(branchFilter(actor, "invoices") ?? {}) };
  if (params.status) query.status = params.status;
  if (params.branch) query.branchId = params.branch;

  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const loose = new RegExp(escaped, "i");
    const clients = await Client.find({
      $or: [{ legalName: loose }, { tradeName: loose }, { code: loose }],
    })
      .select("_id")
      .limit(500)
      .lean();
    query.$or = [
      { number: loose },
      { clientId: { $in: clients.map((c) => c._id) } },
    ];
  }

  const [invoices, total, branches] = await Promise.all([
    Invoice.find(query)
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    Invoice.countDocuments(query),
    Branch.find({}).select("code gstin").sort({ code: 1 }).lean(),
  ]);

  const clients = await Client.find({
    _id: { $in: invoices.map((i) => i.clientId) },
  })
    .select("legalName tradeName")
    .lean();
  const clientName = new Map(
    clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );

  const now = new Date();
  const rows = invoices.map((invoice) => {
    const outstanding = Math.max(
      0,
      (invoice.totalPaise ?? 0) -
        (invoice.paidPaise ?? 0) -
        (invoice.tdsCreditedPaise ?? 0),
    );
    const overdue =
      invoice.dueDate &&
      outstanding > 0 &&
      !["Paid", "Cancelled", "Written off", "Draft"].includes(invoice.status) &&
      new Date(invoice.dueDate) < now;

    return {
      id: String(invoice._id),
      number: invoice.number,
      type: invoice.type,
      client: clientName.get(String(invoice.clientId)) ?? "Client",
      date: formatISTDate(invoice.date),
      dueDate: invoice.dueDate ? formatISTDate(invoice.dueDate) : null,
      overdueDays: overdue ? Math.abs(daysUntil(invoice.dueDate, now)) : 0,
      status: overdue ? "Overdue" : invoice.status,
      total: formatPaise(invoice.totalPaise ?? 0),
      outstanding: formatPaise(outstanding),
    };
  });

  const unregistered = branches.filter((b) => !b.gstin);
  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-28 font-semibold">Billing</h1>
          <p className="num text-13 text-ink-muted">
            {total.toLocaleString("en-IN")}{" "}
            {total === 1 ? "invoice" : "invoices"}
          </p>
        </div>
        <a
          href="/invoices/export"
          className="rounded-ledger border-rule text-14 hover:bg-carbon-wash h-9 border px-3 leading-9"
        >
          Export to Excel
        </a>
        <Link
          href="/invoices/receivables"
          className="rounded-ledger border-rule text-14 hover:bg-carbon-wash h-9 border px-3 leading-9"
        >
          Where the money is
        </Link>
        {can(actor, "edit", "invoices") && (
          <Link
            href="/invoices/new"
            className="rounded-ledger bg-carbon text-14 h-9 px-3 leading-9 font-medium text-white"
          >
            New invoice
          </Link>
        )}
      </div>

      {unregistered.length > 0 && can(actor, "edit", "usersSettings") && (
        <p className="rounded-ledger border-waiting bg-waiting-wash text-13 border px-3 py-2">
          {unregistered.map((b) => b.code).join(", ")}{" "}
          {unregistered.length === 1 ? "has" : "have"} no GSTIN, so invoices
          from {unregistered.length === 1 ? "that branch" : "those branches"}{" "}
          can be drafted but not issued.{" "}
          <Link
            href="/settings/branches"
            className="underline underline-offset-4"
          >
            Add it in Settings → Branches
          </Link>
          .
        </p>
      )}

      <form
        method="get"
        className="rounded-ledger border-rule bg-surface grid gap-3 border p-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="flex flex-col gap-1 lg:col-span-2">
          <span className="text-13 text-ink-muted font-medium">
            Invoice number or client
          </span>
          <input
            name="q"
            defaultValue={search}
            placeholder="NOI/26-27/0087, ABC Traders…"
            className="rounded-ledger border-rule bg-paper text-14 h-9 border px-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">Status</span>
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="rounded-ledger border-rule bg-paper text-14 h-9 border px-2"
          >
            <option value="">Any</option>
            {INVOICE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-ledger bg-carbon text-14 h-9 px-3 font-medium text-white"
          >
            Filter
          </button>
          <Link
            href="/invoices"
            className="rounded-ledger border-rule text-14 hover:bg-carbon-wash h-9 border px-3 leading-9"
          >
            Clear
          </Link>
        </div>
      </form>

      <div className="rounded-ledger border-rule bg-surface overflow-x-auto border">
        <table className="text-14 w-full">
          <thead>
            <tr className="border-rule text-12 text-ink-muted border-b text-left tracking-wide uppercase">
              <th className="px-3 py-2 font-medium">Number</th>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Due</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="px-3 py-2 text-right font-medium">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-rule border-b last:border-0">
                <td className="px-3 py-2">
                  <Link
                    href={`/invoices/${r.id}`}
                    className="font-mono underline underline-offset-4"
                  >
                    {r.number ?? "draft"}
                  </Link>
                  {r.type !== "Tax invoice" && (
                    <span className="text-12 text-ink-muted"> · {r.type}</span>
                  )}
                </td>
                <td className="px-3 py-2">{r.client}</td>
                <td className="num text-13 px-3 py-2">{r.date}</td>
                <td className="num text-13 px-3 py-2">
                  {r.dueDate ?? "—"}
                  {r.overdueDays > 0 && (
                    <span className="text-redpen">
                      {" "}
                      · {r.overdueDays}d late
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <InvoiceStatusChip status={r.status} />
                </td>
                <td className="num px-3 py-2 text-right">{r.total}</td>
                <td className="num px-3 py-2 text-right">{r.outstanding}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="text-ink-muted px-3 py-6 text-center"
                >
                  No invoices yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav className="text-14 flex items-center gap-3" aria-label="Pages">
          {page > 1 && (
            <Link
              href={`/invoices?page=${page - 1}`}
              className="underline underline-offset-4"
            >
              Previous
            </Link>
          )}
          <span className="text-13 text-ink-muted">
            Page {page} of {pages}
          </span>
          {page < pages && (
            <Link
              href={`/invoices?page=${page + 1}`}
              className="underline underline-offset-4"
            >
              Next
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}

import Link from "next/link";
import { can } from "@/lib/permissions";
import Invoice from "@/models/Invoice";
import Client from "@/models/Client";
import Branch from "@/models/Branch";
import { formatPaise } from "@/lib/money";
import { formatISTDate, daysUntil } from "@/lib/dates";
import { INVOICE_STATUSES } from "@/models/Invoice";
/* the ssr entry: the package index is a client module (it calls
   createContext), and this file is a server component */
import { CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";
import { InvoiceStatusChip } from "../invoices/chips";
import FilterBar, { FilterSelect } from "@/components/ui/FilterBar";
import Chip from "@/components/ui/Chip";
import Notice from "@/components/ui/Notice";
import {
  TableShell,
  Table,
  Head,
  Th,
  Tr,
  Td,
  Meta,
  Num,
  Foot,
  Empty,
} from "@/components/ui/Table";

const PAGE_SIZE = 50;

/**
 * The invoice list (spec section 7), the Invoices tab of Billing since
 * P3-22b — the same screen it was at `/invoices`, moved rather than copied.
 *
 * Overdue is worked out as the page is drawn rather than stored, so it is
 * never a day stale — an invoice does not need touching at midnight to
 * become overdue.
 *
 * Redrawn 02-11-2026 on the shared blocks: the hand-built four-column
 * filter form is the kit's `FilterBar`, the money columns are a tabular
 * block of their own with the page's totals under them, and the number is
 * the only link in the row — a row where the client, the number and the
 * status are all underlined is a row with no primary action.
 */
export default async function InvoiceList({ actor, params, scope }) {
  const page = Math.max(1, Number(params.page) || 1);
  const search = String(params.q ?? "").trim();

  /** @type {Record<string, any>} */
  const query = { ...scope };
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
      openingBalance: Boolean(invoice.isOpeningBalance),
      client: clientName.get(String(invoice.clientId)) ?? "Client",
      clientId: String(invoice.clientId),
      date: formatISTDate(invoice.date),
      dueDate: invoice.dueDate ? formatISTDate(invoice.dueDate) : null,
      overdueDays: overdue ? Math.abs(daysUntil(invoice.dueDate, now)) : 0,
      status: overdue ? "Overdue" : invoice.status,
      totalPaise: invoice.totalPaise ?? 0,
      outstandingPaise: outstanding,
    };
  });

  const pageTotal = rows.reduce((sum, row) => sum + row.totalPaise, 0);
  const pageOutstanding = rows.reduce(
    (sum, row) => sum + row.outstandingPaise,
    0,
  );

  const unregistered = branches.filter((b) => !b.gstin);
  const pages = Math.ceil(total / PAGE_SIZE);

  // a group filter set on the tabs above has to survive a page turn
  const keepGroup = params.group ? `&group=${params.group}` : "";
  const pageHref = (n) =>
    `/billing?tab=invoices&page=${n}${keepGroup}` +
    `${search ? `&q=${encodeURIComponent(search)}` : ""}` +
    `${params.status ? `&status=${encodeURIComponent(params.status)}` : ""}`;

  return (
    <>
      {unregistered.length > 0 && can(actor, "edit", "usersSettings") && (
        <Notice
          tone="warn"
          title={`${unregistered.map((b) => b.code).join(", ")} ${
            unregistered.length === 1 ? "has" : "have"
          } no GSTIN`}
        >
          <p>
            Invoices from {unregistered.length === 1 ? "that branch" : "those branches"}{" "}
            can be drafted but not issued.{" "}
            <Link
              href="/settings/branches"
              className="underline underline-offset-4"
            >
              Add it in Settings → Branches
            </Link>
            .
          </p>
        </Notice>
      )}

      <FilterBar
        action="/billing"
        label="Invoice number or client"
        placeholder="NOI/26-27/0087, ABC Traders…"
        value={search}
        active={Boolean(search || params.status)}
        hidden={
          <>
            <input type="hidden" name="tab" value="invoices" />
            {params.group && (
              <input type="hidden" name="group" value={params.group} />
            )}
          </>
        }
        primary={
          <FilterSelect
            label="Status"
            name="status"
            value={params.status ?? ""}
            options={INVOICE_STATUSES}
          />
        }
      />

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="num text-13 text-ink-muted">
          {total.toLocaleString("en-IN")} {total === 1 ? "invoice" : "invoices"}
          {pages > 1 && ` · page ${page} of ${pages}`}
        </p>
        <p className="num text-13 text-ink-muted">
          This page: <span className="text-ink">{formatPaise(pageTotal)}</span>{" "}
          billed · {formatPaise(pageOutstanding)} outstanding
        </p>
      </div>

      <TableShell>
        <Table
          fixed
          caption={`Invoices, newest first${search ? `, matching “${search}”` : ""}`}
        >
          {/* declared once, so a column cannot move between page one and two */}
          <colgroup>
            <col className="w-[11rem]" />
            <col />
            <col className="w-[7.5rem]" />
            <col className="w-[8.5rem]" />
            <col className="w-[9rem]" />
            <col className="w-[9.5rem]" />
            <col className="w-[10rem]" />
          </colgroup>
          <Head>
            <Th>Number</Th>
            <Th>Client</Th>
            <Th>Raised</Th>
            <Th>Due</Th>
            <Th>Status</Th>
            <Th align="right" rule>
              Total
            </Th>
            <Th align="right">Outstanding</Th>
          </Head>
          <tbody>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td>
                  <Link
                    href={`/invoices/${r.id}`}
                    className="num text-13 underline-offset-4 hover:underline"
                  >
                    {r.number ?? "Draft"}
                  </Link>
                  {(r.type !== "Tax invoice" || r.openingBalance) && (
                    <Meta>{r.openingBalance ? "Opening balance" : r.type}</Meta>
                  )}
                </Td>
                <Td className="truncate">
                  <span className="font-medium">{r.client}</span>
                </Td>
                <Td className="num text-13 text-ink-muted">{r.date}</Td>
                <Td className="text-13">
                  <span className={`num ${r.overdueDays > 0 ? "text-redpen" : ""}`}>
                    {r.dueDate ?? "—"}
                  </span>
                  {r.overdueDays > 0 && (
                    <Meta className="text-redpen">
                      {r.overdueDays} {r.overdueDays === 1 ? "day" : "days"}{" "}
                      late
                    </Meta>
                  )}
                </Td>
                <Td>
                  <InvoiceStatusChip status={r.status} />
                </Td>
                <Td align="right" rule>
                  <Num paise={r.totalPaise} />
                </Td>
                <Td align="right">
                  <Num
                    paise={r.outstandingPaise}
                    strong
                    zero="settled"
                    tone={r.overdueDays > 0 ? "late" : undefined}
                  />
                </Td>
              </Tr>
            ))}
            {rows.length === 0 && (
              <Empty colSpan={7}>
                {search || params.status
                  ? "No invoice matches that."
                  : "No invoices yet."}
              </Empty>
            )}
          </tbody>
          {rows.length > 0 && (
            <Foot>
              <Td colSpan={5} className="text-ink-muted">
                {rows.length === total ? "All of it" : `These ${rows.length} rows`}
              </Td>
              <Td align="right" rule>
                <Num paise={pageTotal} strong />
              </Td>
              <Td align="right">
                <Num paise={pageOutstanding} strong />
              </Td>
            </Foot>
          )}
        </Table>
      </TableShell>

      {pages > 1 && (
        <nav
          className="flex flex-wrap items-center gap-3"
          aria-label="Invoice pages"
        >
          {page > 1 ? (
            <Link
              href={pageHref(page - 1)}
              className="rounded-control border-rule text-13 hover:bg-carbon-wash flex h-9 items-center gap-1.5 border px-3"
            >
              <CaretLeft size={12} weight="bold" aria-hidden="true" />
              Newer
            </Link>
          ) : (
            <span className="text-13 text-faint flex h-9 items-center gap-1.5 px-3">
              <CaretLeft size={12} weight="bold" aria-hidden="true" />
              Newer
            </span>
          )}
          <Chip mono tone="neutral">
            {page} / {pages}
          </Chip>
          {page < pages ? (
            <Link
              href={pageHref(page + 1)}
              className="rounded-control border-rule text-13 hover:bg-carbon-wash flex h-9 items-center gap-1.5 border px-3"
            >
              Older
              <CaretRight size={12} weight="bold" aria-hidden="true" />
            </Link>
          ) : (
            <span className="text-13 text-faint flex h-9 items-center gap-1.5 px-3">
              Older
              <CaretRight size={12} weight="bold" aria-hidden="true" />
            </span>
          )}
        </nav>
      )}
    </>
  );
}

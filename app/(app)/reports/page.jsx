import Link from "next/link";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";

export const metadata = { title: "Reports · PHMG" };

/**
 * The reports index (spec section 10).
 *
 * Grouped by the question each one answers rather than by where the data
 * lives, and each line says in one sentence what the report is for — a
 * list of eight nouns helps nobody choose.
 *
 * The four reports that already have screens of their own are linked here
 * rather than rebuilt: the compliance grid, the client ledger and the two
 * on the receivables screen. One report, one home.
 */

const GROUPS = [
  {
    title: "Work",
    reports: [
      {
        href: "/reports/status",
        area: "engagementsWork",
        name: "Engagement status",
        what: "Every job with its status, dates and who has it.",
      },
      {
        href: "/reports/overdue",
        area: "engagementsWork",
        name: "Overdue work",
        what: "Everything past its date and not filed, latest first.",
      },
      {
        href: "/reports/pending-documents",
        area: "documents",
        name: "Documents awaited from clients",
        what: "What each client still owes us, and whether we have asked.",
      },
      {
        href: "/calendar?view=grid",
        area: "engagementsWork",
        name: "Compliance status grid",
        what: "Clients down the side, periods across the top — the fastest way to spot a month nobody filed.",
      },
      {
        href: "/reports/turnaround",
        area: "engagementsWork",
        name: "Turnaround per service",
        what: "How long work actually takes, against the standard we set.",
      },
    ],
  },
  {
    title: "Money",
    reports: [
      {
        href: "/reports/revenue",
        area: "invoices",
        name: "Revenue",
        what: "Billed work by client, service, branch or month.",
      },
      {
        href: "/reports/receivables",
        area: "invoices",
        name: "Receivables",
        what: "Every unpaid invoice, what is left on it and how late.",
      },
      {
        href: "/invoices/receivables",
        area: "invoices",
        name: "Receivables ageing",
        what: "The same money in 30-day buckets, with the unbilled tab beside it.",
      },
      {
        href: "/reports/unbilled",
        area: "invoices",
        name: "Unbilled work",
        what: "Finished jobs nobody has invoiced yet.",
      },
    ],
  },
  {
    title: "The practice",
    reports: [
      {
        href: "/reports/clients",
        area: "clients",
        name: "New and lost clients",
        what: "Clients taken on and clients closed, by month.",
      },
    ],
  },
];

export default async function ReportsPage() {
  const actor = await requireUser();

  const groups = GROUPS.map((group) => ({
    ...group,
    reports: group.reports.filter((report) =>
      can(actor, "view", report.area),
    ),
  })).filter((group) => group.reports.length > 0);

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="font-display text-28 font-semibold">Reports</h1>
        <p className="text-13 text-ink-muted">
          Each one can be narrowed by date, branch, client, service or person,
          and downloaded as a spreadsheet.
        </p>
      </div>

      {groups.map((group) => (
        <section key={group.title} className="flex flex-col gap-2">
          <h2 className="font-display text-20">{group.title}</h2>
          <ul className="rounded-ledger border-rule bg-surface border">
            {group.reports.map((report) => (
              <li
                key={report.href}
                className="border-rule border-b last:border-0"
              >
                <Link
                  href={report.href}
                  className="hover:bg-carbon-wash focus-visible:outline-brass block px-4 py-3 focus-visible:outline-2"
                >
                  <span className="text-14 font-medium underline underline-offset-4">
                    {report.name}
                  </span>
                  <span className="text-13 text-ink-muted block">
                    {report.what}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="text-12 text-ink-muted">
        Timesheets, utilisation, realisation, client profitability and the
        intern exposure report all need time tracking, which is Phase 2
        (spec section 9). They are not here rather than here and empty.
      </p>
    </div>
  );
}

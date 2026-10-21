import Link from "next/link";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { reportHeadlines } from "@/lib/reports/headlines";

export const metadata = { title: "Reports · PHMG" };
export const dynamic = "force-dynamic";

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
      {
        href: "/reports/rework",
        area: "dashboards",
        name: "Work sent back from review",
        what: "How often finished work came back, by the person who did it.",
      },
      {
        href: "/reports/tier-mix",
        area: "dashboards",
        name: "Work by tier",
        what: "A, B and C work per person: who is carrying the senior jobs.",
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
    title: "Compliance",
    reports: [
      {
        href: "/reports/punctuality",
        area: "engagementsWork",
        name: "Filing punctuality",
        what: "What went in on time, what went in late, and by how long.",
      },
      {
        href: "/reports/opinions",
        area: "practice",
        name: "Audit opinions",
        what: "Every audit, its type, and what the report said.",
      },
      {
        href: "/reports/udin-summary",
        area: "udin",
        name: "UDINs issued",
        what: "What the firm has signed this year, and who signed it.",
      },
      {
        href: "/reports/certificates",
        area: "dsc",
        name: "Certificates expiring",
        what: "Digital signature certificates, soonest first.",
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
      {
        href: "/reports/grants",
        area: "clientAccess",
        name: "Client access grants",
        what: "Who can see a client they do not work on, and why they were given it.",
      },
      {
        href: "/reports/portal",
        area: "clientPortalUsers",
        name: "Client portal accounts",
        what: "Who outside the firm can sign in, and when they last did.",
      },
    ],
  },
];

export default async function ReportsPage() {
  const actor = await requireUser();

  const groups = GROUPS.map((group) => ({
    ...group,
    reports: group.reports.filter((report) => can(actor, "view", report.area)),
  })).filter((group) => group.reports.length > 0);

  await connectDB();
  const headlines = await reportHeadlines(actor);

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="font-display text-28 font-semibold">Reports</h1>
        <p className="text-13 text-ink-muted">
          Each one can be narrowed by date, branch, client, service or person,
          and downloaded as a spreadsheet.
        </p>
      </div>

      {/* the headline figures, each a link to the report behind it. They
          come from the same helpers the dashboard uses, so the two cannot
          disagree about the same number */}
      {headlines.length > 0 && (
        <dl className="border-rule divide-rule flex flex-wrap divide-x border-y py-3">
          {headlines.map((tile) => (
            <div key={tile.key} className="px-4 first:pl-0">
              <dt className="text-12 text-ink-muted uppercase">{tile.label}</dt>
              <dd className="text-20">
                <Link
                  href={tile.href}
                  className={`num font-medium ${tile.tone === "late" ? "text-redpen" : ""}`}
                >
                  {tile.value}
                </Link>
              </dd>
            </div>
          ))}
        </dl>
      )}

      {/* the categories, so a long index can be skipped rather than read */}
      <nav
        aria-label="Report categories"
        className="text-14 flex flex-wrap gap-2"
      >
        {groups.map((group) => (
          <a
            key={group.title}
            href={`#${slug(group.title)}`}
            className="rounded-ledger border-rule hover:bg-carbon-wash border px-3 py-1"
          >
            {group.title}
          </a>
        ))}
      </nav>

      {groups.map((group) => (
        <section
          key={group.title}
          id={slug(group.title)}
          className="flex scroll-mt-4 flex-col gap-2"
        >
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
        intern exposure report all need time tracking, which is Phase 2 (spec
        section 9). They are not here rather than here and empty.
      </p>
    </div>
  );
}
/** A heading as an anchor: "The practice" becomes "the-practice". */
function slug(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

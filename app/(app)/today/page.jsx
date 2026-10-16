import { formatISTDate, financialYearLabel } from "@/lib/dates";

export const metadata = { title: "Today · PHMG" };

/* Step 0 is the shell only: the three columns and the statutory ledger line
   are laid out here, and each step fills its own column with real data. */
const COLUMNS = [
  { title: "Due today", empty: "Nothing due today." },
  { title: "Waiting on clients", empty: "No documents pending from clients." },
  { title: "Awaiting my review", empty: "Nothing waiting for your review." },
];

export default function TodayPage() {
  const now = new Date();
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-28 font-semibold">Today</h1>
        <p className="num text-13 text-ink-muted">
          {formatISTDate(now)} · FY {financialYearLabel(now)}
        </p>
      </div>

      {/* The week's statutory dates: one ledger line across the top (spec 15). */}
      <section
        aria-label="Statutory dates this week"
        className="rounded-ledger border-rule bg-surface border px-4 py-3"
      >
        <p className="text-13 text-ink-muted">
          Statutory dates for this week appear here once the due-date master is
          seeded (Step 7).
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => (
          <section
            key={col.title}
            className="rounded-ledger border-rule bg-surface flex min-h-56 flex-col border"
          >
            <h2 className="border-rule text-13 text-ink-muted border-b px-4 py-2 font-medium tracking-wide uppercase">
              {col.title}
            </h2>
            <div className="ledger-rule flex-1 px-4 py-3">
              <p className="text-14 text-ink-muted">{col.empty}</p>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

import Link from "next/link";
import StatusGrid from "@/components/compliance/StatusGrid";

/**
 * One client's compliance year: their services down the side, periods across
 * the top (spec section 3, "Compliance calendar" on the client page).
 *
 * **One grid per recurrence.** A monthly return and an annual audit cannot
 * honestly share twelve columns, and stretching one across the other's
 * periods would invent holes that do not exist — the thing this grid is for
 * is showing real ones.
 *
 * @param {object} props
 * @param {string} props.clientId
 * @param {number} props.fyStart the calendar year the financial year starts in
 * @param {Array<{recurrence: string, label: string, periods: any[], grid: any}>} props.sections
 * @param {number[]} props.years the years to offer
 * @param {number} props.totalMissing
 */
export default function ClientCompliance({
  clientId,
  fyStart,
  sections,
  years,
  totalMissing,
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="font-display text-20">
            Compliance for {fyStart}–{String(fyStart + 1).slice(2)}
          </h2>
          <p className="text-13 text-ink-muted">
            {totalMissing === 0
              ? "Every period that has ended has work against it."
              : `${totalMissing} ${
                  totalMissing === 1 ? "period has" : "periods have"
                } no work against ${totalMissing === 1 ? "it" : "them"} at all.`}
          </p>
        </div>

        {/* the financial year, April to March */}
        <div className="flex flex-wrap items-center gap-2">
          {years.map((year) => (
            <Link
              key={year}
              href={`/clients/${clientId}?tab=compliance&fy=${year}`}
              aria-current={year === fyStart ? "page" : undefined}
              className={`rounded-ledger text-13 h-8 border px-2 leading-8 ${
                year === fyStart
                  ? "border-carbon bg-carbon-wash text-carbon"
                  : "border-rule hover:bg-carbon-wash"
              }`}
            >
              {year}–{String(year + 1).slice(2)}
            </Link>
          ))}
        </div>
      </div>

      {sections.length === 0 && (
        <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border p-6">
          This client is signed up for no services, and has no work in {fyStart}
          –{String(fyStart + 1).slice(2)}. Add a service on the Engagements tab
          and the grid fills itself.
        </p>
      )}

      {sections.map((section) => (
        <section key={section.recurrence} className="flex flex-col gap-2">
          <h3 className="text-12 text-ink-muted font-medium tracking-wide uppercase">
            {section.label}
          </h3>
          <StatusGrid
            periods={section.periods}
            rows={section.grid.rows}
            caption={`${section.label} services for this client, by period.`}
            rowHeading="Service"
            emptyText="No service of this kind."
          />
        </section>
      ))}
    </div>
  );
}

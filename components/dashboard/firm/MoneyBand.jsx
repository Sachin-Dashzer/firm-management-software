import Link from "next/link";
import Panel from "@/components/ui/Panel";
import StackedBar from "@/components/ui/StackedBar";
import Figure from "@/components/dashboard/Figure";
import { formatPaise } from "@/lib/money";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Billed, collected, owed (P3-34 phase 3).
 *
 * Three figures that are routinely confused for one another, so they sit
 * side by side with their own words: what the firm **asked for** this
 * month, what **reached the bank** this month, and what is **still owed**
 * from any month.
 *
 * The unmatched-receipts strip is the one line here that is an instruction
 * rather than a figure. Money received and not put against an invoice is
 * money the firm thinks it is still owed, so it appears on both sides of
 * this panel at once — and it stays wrong until somebody allocates it.
 */
export default function MoneyBand({ money }) {
  const ageing = money?.ageing;
  if (!money) return null;

  return (
    <Panel
      title={`Money · ${MONTHS[money.month - 1]}`}
      link={{ href: "/reports", label: "Revenue report" }}
    >
      <div className="grid grid-cols-3 gap-2">
        <Mini label="Billed" paise={money.billedPaise} />
        <Mini label="Collected" paise={money.collectedPaise} />
        <Mini label="Receivable" paise={money.receivablePaise} />
      </div>

      {money.unallocatedPaise > 0 && (
        <p className="rounded-control border-waiting/30 bg-waiting-wash text-13 flex flex-wrap items-center justify-between gap-2 border px-3 py-2">
          <span>
            <span className="num font-semibold">
              {formatPaise(money.unallocatedPaise)}
            </span>{" "}
            of receipts not matched to any invoice
          </span>
          <Link
            href="/billing/desk"
            className="text-carbon font-medium underline-offset-4 hover:underline"
          >
            Allocate
          </Link>
        </p>
      )}

      {ageing && (
        <div className="flex flex-col gap-2">
          <p className="text-12 text-ink-muted font-medium">
            Receivables by age
          </p>
          <StackedBar segments={ageing} label="Receivables by age" />
        </div>
      )}

      <Link
        href="/billing?tab=collections"
        className="text-13 text-carbon underline-offset-4 hover:underline"
      >
        Chase overdue invoices
      </Link>
    </Panel>
  );
}

function Mini({ label, paise }) {
  return (
    <span className="rounded-control border-rule bg-sunk/50 flex flex-col gap-1 border px-3 py-2">
      <span className="text-12 text-ink-muted">{label}</span>
      <Figure
        value={paise}
        paise
        className="num font-display text-20 leading-none font-semibold"
      />
    </span>
  );
}

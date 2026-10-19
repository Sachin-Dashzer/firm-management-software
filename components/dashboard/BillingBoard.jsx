import { MoneyTile, CountTile, Panel } from "./Tiles";

/**
 * The accounts dashboard (spec section 10): what to bill, what to chase,
 * what came in today, and what TDS still has to be matched up.
 */
export default function BillingBoard({
  unbilled,
  receivables,
  paymentsToday,
  tds,
}) {
  return (
    <Panel title="Billing" what="Every figure opens its list.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MoneyTile
          label="To be invoiced"
          paise={unbilled.paise}
          note={`${unbilled.count} finished ${unbilled.count === 1 ? "job" : "jobs"}`}
          href={unbilled.href}
        />
        <MoneyTile
          label="Overdue invoices"
          paise={receivables.overduePaise}
          note={`${receivables.overdueCount} past their due date`}
          href={receivables.href}
          tone={receivables.overdueCount > 0 ? "late" : undefined}
        />
        <MoneyTile
          label="Received today"
          paise={paymentsToday.paise}
          note={`${paymentsToday.count} ${paymentsToday.count === 1 ? "payment" : "payments"} entered`}
          href={paymentsToday.href}
        />
        <CountTile
          label="TDS to reconcile"
          value={tds.count}
          note="invoices where the deduction has not been credited"
          href={tds.href}
        />
      </div>
    </Panel>
  );
}

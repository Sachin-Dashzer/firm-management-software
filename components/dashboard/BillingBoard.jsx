import {
  Receipt,
  WarningCircle,
  Bank,
  ArrowsLeftRight,
} from "@phosphor-icons/react/dist/ssr";
import { MoneyTile, CountTile, FeatureTile, Panel } from "./Tiles";

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
          icon={Receipt}
          paise={unbilled.paise}
          note={`${unbilled.count} finished ${unbilled.count === 1 ? "job" : "jobs"}`}
          href={unbilled.href}
        />
        {receivables.overdueCount > 0 ? (
          <FeatureTile
            label="Overdue invoices"
            icon={WarningCircle}
            paise={receivables.overduePaise}
            note={`${receivables.overdueCount} past their due date`}
            href={receivables.href}
            cta="Chase these"
          />
        ) : (
          <MoneyTile
            label="Overdue invoices"
            icon={WarningCircle}
            paise={receivables.overduePaise}
            note="nothing past its due date"
            href={receivables.href}
          />
        )}
        <MoneyTile
          label="Received today"
          icon={Bank}
          paise={paymentsToday.paise}
          note={`${paymentsToday.count} ${paymentsToday.count === 1 ? "payment" : "payments"} entered`}
          href={paymentsToday.href}
        />
        <CountTile
          label="TDS to reconcile"
          icon={ArrowsLeftRight}
          value={tds.count}
          note="invoices where the deduction has not been credited"
          href={tds.href}
        />
      </div>
    </Panel>
  );
}

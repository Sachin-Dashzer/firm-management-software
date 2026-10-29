import { can, whyNot } from "@/lib/permissions";
import Engagement from "@/models/Engagement";
import Client from "@/models/Client";
import { formatISTDate } from "@/lib/dates";
import { feeState, pendingWaiver } from "@/lib/engagements/scope";
import UnbilledWork from "./UnbilledWork";

/**
 * Finished work nobody has billed — the Ready to bill tab (P3-22b), which
 * is the "Done but not billed" half of the old receivables screen under the
 * name the prototype's menu gives it.
 *
 * The filter is the one `navCounts` counts with, so the badge on the menu
 * and the rows on this page cannot disagree.
 */
export default async function ReadyToBill({ actor, scope }) {
  const engagements = await Engagement.find({
    ...scope,
    billingStatus: "Unbilled",
    status: { $in: ["Filed / delivered", "Completed"] },
  })
    .sort({ completedAt: 1 })
    .limit(500)
    .lean();

  // a waiver somebody is waiting on outranks the oldest unbilled job (P3-4)
  engagements.sort(
    (a, b) =>
      Number(Boolean(pendingWaiver(b))) - Number(Boolean(pendingWaiver(a))),
  );

  const clients = await Client.find({
    _id: { $in: engagements.map((e) => e.clientId) },
  })
    .select("legalName tradeName")
    .lean();
  const clientName = new Map(
    clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );

  return (
    <UnbilledWork
      canPrice={can(actor, "edit", "invoices")}
      isPartner={can(actor, "approve", "feeWriteOff")}
      whyNoPricing={whyNot(actor, "edit", "invoices")}
      rows={engagements.map((e) => {
        const state = feeState(e);
        const pending = pendingWaiver(e);
        return {
          id: String(e._id),
          clientId: String(e.clientId),
          client: clientName.get(String(e.clientId)) ?? "Client",
          work: e.templateSnapshot?.name ?? "Work",
          period: e.periodLabel || e.period,
          finished: e.completedAt ? formatISTDate(e.completedAt) : "",
          feePaise: e.feePaise ?? 0,
          scope: state.scope,
          stateLabel: state.label,
          stateDetail: state.detail,
          blocked: state.pending,
          waiver: pending
            ? {
                reason: pending.reason,
                requestedByName: pending.requestedByName || "Staff",
              }
            : null,
        };
      })}
    />
  );
}

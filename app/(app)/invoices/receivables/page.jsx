import { redirect } from "next/navigation";

/**
 * "Where the money is" became two tabs of `/billing` (P3-22b): the ageing
 * is Collections, and the unbilled list is Ready to bill.
 *
 * Ten places in the app linked here — Issues, the dashboards, the reports
 * index, the group page, the headline figures — and a redirect is one
 * change rather than ten. The group filter is carried across with the tab.
 */
export default async function ReceivablesPage({ searchParams }) {
  const params = (await searchParams) ?? {};
  const query = new URLSearchParams([
    ["tab", params.tab === "unbilled" ? "ready" : "collections"],
    ...(params.group ? [["group", String(params.group)]] : []),
  ]);
  redirect(`/billing?${query.toString()}`);
}

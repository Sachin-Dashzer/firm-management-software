import { redirect } from "next/navigation";

/**
 * The invoice list is now the Invoices tab of `/billing` (P3-22b).
 *
 * The query string is carried across, so a bookmarked filter — a status, a
 * search, a page — still opens on the same rows. `/invoices/[id]`,
 * `/invoices/new` and the Excel export stay where they are: it is the list
 * that moved, not the invoice.
 */
export default async function InvoicesPage({ searchParams }) {
  const params = new URLSearchParams(
    Object.entries((await searchParams) ?? {}).map(([key, value]) => [
      key,
      String(value),
    ]),
  );
  params.set("tab", "invoices");
  redirect(`/billing?${params.toString()}`);
}

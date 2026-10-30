import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import HeldChange from "@/models/HeldChange";
import { formatISTDateTime } from "@/lib/dates";
import HeldChanges from "./HeldChanges";

export const metadata = { title: "Changes waiting · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Client changes waiting for a partner (P3-18a).
 *
 * One row per field rather than per sheet or per client, because that is
 * how the decision is actually made: a legal name correction is obvious, a
 * PAN beside it is not, and approving them together is how the second one
 * goes through unread.
 */
export default async function ChangesPage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "clients")) redirect("/issues");

  const params = (await searchParams) ?? {};
  const show = params.show === "decided" ? "decided" : "pending";

  await connectDB();
  const rows = await HeldChange.find(
    show === "pending" ? { state: "pending" } : { state: { $ne: "pending" } },
  )
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-5 p-4 md:p-6">
      <div>
        <Link href="/clients" className="text-13 underline underline-offset-4">
          Clients
        </Link>
        <h1 className="font-display text-24 font-bold tracking-tight">
          Changes waiting
        </h1>
        <p className="text-13 text-ink-muted max-w-[70ch]">
          A legal name, a PAN, a GSTIN, the office, the group or the status,
          changed by somebody who is not a partner — usually from a
          spreadsheet. Each one is decided on its own.
        </p>
      </div>

      <HeldChanges
        rows={rows.map((row) => ({
          id: String(row._id),
          clientId: String(row.clientId),
          client: row.clientName || "A client",
          label: row.label || row.field,
          from: row.fromText || "—",
          to: row.toText || "—",
          askedByName: row.askedByName,
          source: row.source,
          at: formatISTDateTime(row.createdAt),
          state: row.state,
          decidedByName: row.decidedByName,
          decidedAt: row.decidedAt ? formatISTDateTime(row.decidedAt) : "",
          reason: row.reason ?? "",
        }))}
        show={show}
        mayDecide={can(actor, "approve", "feeWriteOff")}
      />
    </div>
  );
}


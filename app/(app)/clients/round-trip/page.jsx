import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, seesOnlyOwnRecords } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import HeldChange from "@/models/HeldChange";
import { HELD_FIELDS, DIFF_FIELDS } from "@/lib/clients/roundTrip";
import RoundTrip from "./RoundTrip";

export const metadata = { title: "Update from a spreadsheet · PHMG" };
export const dynamic = "force-dynamic";

/**
 * The bulk client round-trip (P3-18a).
 *
 * The import screen (Step 3) adds clients. This one changes the ones that
 * are already there, which is a different risk: nobody mistypes forty PANs
 * by hand, and everybody has dragged a cell down a column by accident.
 */
export default async function RoundTripPage() {
  const actor = await requireUser();
  if (!can(actor, "edit", "clients") || seesOnlyOwnRecords(actor, "clients")) {
    redirect("/clients");
  }

  await connectDB();
  const waiting = await HeldChange.countDocuments({ state: "pending" });

  const isPartner = actor.role === "partner";
  const heldLabels = DIFF_FIELDS.filter((row) =>
    HELD_FIELDS.includes(row.field),
  ).map((row) => row.label);

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 p-4 md:p-6">
      <div>
        <Link href="/clients" className="text-13 underline underline-offset-4">
          Clients
        </Link>
        <h1 className="font-display text-24 font-bold tracking-tight">
          Update from a spreadsheet
        </h1>
        <p className="text-13 text-ink-muted max-w-[70ch]">
          Download the list, correct it in Excel, send it back. Every change is
          shown field by field before anything is written, and a row finds its
          client by the client code in the first column — never by name or by
          PAN.
        </p>
      </div>

      {isPartner ? (
        <p className="rounded-ledger border-rule bg-sunk text-13 border px-3 py-2">
          You are a partner, so your own sheet applies in full, including{" "}
          {heldLabels.join(", ").toLowerCase()}. A sheet from anybody else
          holds those for you to decide on.
        </p>
      ) : (
        <p className="rounded-ledger border-waiting bg-waiting-wash text-13 border px-3 py-2">
          Changes to {heldLabels.join(", ").toLowerCase()} do not apply when
          you send a sheet: they wait for a partner, one at a time. Everything
          else applies as soon as you tick it.
        </p>
      )}

      {waiting > 0 && (
        <p className="text-13">
          <Link
            href="/clients/changes"
            className="underline underline-offset-4"
          >
            {waiting} {waiting === 1 ? "change is" : "changes are"} waiting for
            a partner
          </Link>
          .
        </p>
      )}

      <RoundTrip />
    </div>
  );
}

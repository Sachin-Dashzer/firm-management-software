import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, seesOnlyOwnRecords, ROLE_LABELS } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import { firmProfile } from "@/lib/firm/settings";
import { hasCpeTarget } from "@/lib/firm/profile";
import { cpeByYear } from "@/lib/firm/cpe";
import { formatISTDate, istInputDate } from "@/lib/dates";
import FirmForm from "./FirmForm";
import Members from "./Members";

export const metadata = { title: "ICAI · PHMG" };
export const dynamic = "force-dynamic";

/**
 * The firm's professional record (P2-6).
 *
 * Three things on one screen because they are asked about together: who the
 * firm is to the ICAI, where each member stands on membership and CPE, and
 * the firm's own notes on the obligations spec section 16 lists as acceptance
 * criteria.
 *
 * Everybody may read the firm's half — it is the letterhead. A CA keeps their
 * own membership and CPE log; a Partner keeps everybody's. The accounts role
 * has no business here at all.
 */
export default async function IcaiPage() {
  const actor = await requireUser();
  if (!can(actor, "view", "icai", { userId: actor.id })) redirect("/settings");

  const mayEditFirm = can(actor, "edit", "firmProfile");
  const ownOnly = seesOnlyOwnRecords(actor, "icai");

  await connectDB();
  const [firm, people] = await Promise.all([
    firmProfile({ fresh: true }),
    User.find(
      ownOnly
        ? { _id: actor.id }
        : // the people who can hold a membership, plus anybody with a log
          {
            active: true,
            $or: [
              { role: { $in: ["partner", "ca"] } },
              { "cpe.0": { $exists: true } },
            ],
          },
    )
      .select("name role icai cpe")
      .sort({ role: 1, name: 1 })
      .lean(),
  ]);

  const members = people.map((person) => ({
    id: String(person._id),
    name: person.name,
    roleLabel: ROLE_LABELS[person.role] ?? person.role,
    mine: String(person._id) === actor.id,
    mayEdit: can(actor, "edit", "icai", { userId: String(person._id) }),
    icai: {
      membershipNo: person.icai?.membershipNo ?? "",
      grade: person.icai?.grade ?? "",
      admittedOn: toInput(person.icai?.admittedOn),
      copHeld: Boolean(person.icai?.copHeld),
      copFrom: toInput(person.icai?.copFrom),
    },
    years: cpeByYear(person.cpe ?? [], firm),
    entries: (person.cpe ?? [])
      .slice()
      .sort((a, b) => new Date(b.on) - new Date(a.on))
      .map((entry) => ({
        id: String(entry._id),
        on: formatISTDate(entry.on),
        hours: entry.hours,
        kind: entry.kind,
        programme: entry.programme,
        organiser: entry.organiser ?? "",
      })),
  }));

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-6 p-4 md:p-6">
      <div>
        <Link
          href="/settings"
          className="text-13 text-ink-muted underline underline-offset-4"
        >
          Settings
        </Link>
        <h1 className="font-display text-24 font-bold tracking-tight">ICAI</h1>
        <p className="text-13 text-ink-muted">
          The firm&rsquo;s own record, who holds what membership, and the CPE
          log.
        </p>
      </div>

      {!hasCpeTarget(firm) && (
        <p className="rounded-ledger border-waiting bg-waiting-wash text-13 border px-3 py-2">
          <strong>No CPE target is set.</strong> Hours are recorded and totalled
          per year, but nothing here judges whether they are enough — the
          ICAI&rsquo;s requirements are not ours to assume.{" "}
          {mayEditFirm
            ? "Enter the hours your firm works to below."
            : "A partner can enter the firm's figures in these settings."}
        </p>
      )}

      <FirmForm firm={serialise(firm)} mayEdit={mayEditFirm} />

      <Members
        members={members}
        firm={{
          cpeTargetStructured: firm.cpeTargetStructured,
          cpeTargetUnstructured: firm.cpeTargetUnstructured,
          cpeYearBasis: firm.cpeYearBasis,
        }}
        ownOnly={ownOnly}
      />
    </div>
  );
}

/** `<input type="date">` wants YYYY-MM-DD and nothing else. */
function toInput(date) {
  return istInputDate(date);
}

/** Dates cross into the client component as date-input strings. */
function serialise(firm) {
  return {
    ...firm,
    peerReviewValidTill: toInput(firm.peerReviewValidTill),
  };
}

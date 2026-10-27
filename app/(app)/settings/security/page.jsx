import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Incident from "@/models/Incident";
import { securitySignals } from "@/lib/security/signals";
import { formatISTDate, formatISTDateTime } from "@/lib/dates";
import SecurityBoard from "./SecurityBoard";

export const metadata = { title: "Security · PHMG" };
export const dynamic = "force-dynamic";

/**
 * One screen for the two things spec section 16 asks for beyond the
 * controls already in the app: breach detection, and an incident log.
 *
 * The signals are read out of the audit log rather than from anything new,
 * because the audit log already records every sign-in, every credential
 * reveal and every document download. What was missing was somebody
 * looking at it, and that is what this screen is.
 */
export default async function SecurityPage() {
  const actor = await requireUser();
  if (!can(actor, "edit", "usersSettings")) redirect("/issues");

  await connectDB();
  const [signals, incidents] = await Promise.all([
    securitySignals(),
    Incident.find({}).sort({ status: 1, occurredAt: -1 }).limit(100).lean(),
  ]);

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="font-display text-24 font-bold tracking-tight">
          Security
        </h1>
        <p className="text-13 text-ink-muted">
          What the portal log is showing, and the firm&rsquo;s record of
          anything that went wrong.{" "}
          <Link href="/portal-log" className="underline underline-offset-4">
            The full audit log
          </Link>{" "}
          is where the detail is.
        </p>
      </div>

      <SecurityBoard
        signals={signals.signals}
        counts={signals.counts}
        since={formatISTDate(signals.since)}
        incidents={incidents.map((incident) => ({
          id: String(incident._id),
          summary: incident.summary,
          severity: incident.severity,
          status: incident.status,
          occurredAt: formatISTDate(incident.occurredAt),
          noticed: formatISTDateTime(incident.noticedAt),
          detail: incident.detail,
          personalData: incident.personalData,
          clientsAffected: incident.clientsAffected,
          notified: incident.notified,
          action: incident.action,
          by: incident.raisedByName,
        }))}
      />
    </div>
  );
}

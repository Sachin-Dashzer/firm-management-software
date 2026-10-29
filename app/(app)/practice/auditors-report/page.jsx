import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import AuditFiles from "../audit/AuditFiles";

export const metadata = { title: "Auditor's report (SA 700) · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Where every auditor's report stands (P3-22b).
 *
 * The report is built on the file (P3-15): the switches that restructure it
 * under SA 700, 705, 706, 570, 701 and 720, the three layers of opinion, and
 * the signed snapshot. What this page adds is the firm-wide view — which
 * reports are signed, which are waiting, and on what — because a partner
 * signing in October wants the list, not eleven files.
 *
 * The same rows as the studio, read by report rather than by stage, and the
 * "waiting on" column is `blockingSign()`: the identical list the sign
 * action refuses with, so this page cannot promise a signature the file
 * will not allow.
 */
export default async function AuditorsReportPage() {
  const actor = await requireUser();
  if (!can(actor, "view", "practice")) redirect("/issues");

  await connectDB();

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <Link
            href="/practice/audit"
            className="text-13 text-ink-muted underline underline-offset-4"
          >
            Audit studio
          </Link>
          <h1 className="font-display text-24 font-bold tracking-tight">
            Auditor&rsquo;s report (SA 700)
          </h1>
          <p className="text-13 text-ink-muted max-w-[70ch]">
            Every audit file and where its report has got to. Signing, and the
            reasons it can be refused, stay on the file itself.
          </p>
        </div>
      </div>

      <AuditFiles actor={actor} view="report" />
    </div>
  );
}

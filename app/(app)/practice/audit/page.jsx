import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import AuditFiles from "./AuditFiles";

export const metadata = { title: "Audit studio · PHMG" };
export const dynamic = "force-dynamic";

/**
 * The audit studio's front door (P3-22b).
 *
 * Seven stages, acceptance to file closure, with every file sitting at the
 * one it has reached. The file itself (P3-13 to P3-15) is unchanged — this
 * page only finds it, because until today the only way to reach a file was
 * to remember which engagement it hung off.
 */
export default async function AuditStudioPage() {
  const actor = await requireUser();
  if (!can(actor, "view", "practice")) redirect("/issues");

  await connectDB();

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-24 font-bold tracking-tight">
            Audit studio
          </h1>
          <p className="text-13 text-ink-muted max-w-[70ch]">
            Every audit file by the stage it has reached. Open one to work in it
            — the programme, the exceptions, the tests and the report are all on
            the file.
          </p>
        </div>
        <Link
          href="/practice/auditors-report"
          className="rounded-control border-rule text-14 hover:bg-carbon-wash h-9 border px-3 leading-9"
        >
          Where the reports stand
        </Link>
      </div>

      <AuditFiles actor={actor} view="stages" />
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, branchFilter } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Client from "@/models/Client";
import User from "@/models/User";
import { NOTICE_KINDS } from "@/lib/practice/noticeLaw";
import NewNotice from "./NewNotice";

export const metadata = { title: "Open a matter · PHMG" };
export const dynamic = "force-dynamic";

/** A notice has arrived; this is where it becomes a matter (P3-11). */
export default async function NewNoticePage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "edit", "practice")) redirect("/practice/notices");

  const params = (await searchParams) ?? {};
  await connectDB();
  const scope = branchFilter(actor, "practice") ?? {};

  const [clients, people] = await Promise.all([
    Client.find({ ...scope, status: { $ne: "Closed" } })
      .select("legalName tradeName code")
      .sort({ legalName: 1 })
      .limit(2000)
      .lean(),
    User.find({ active: true }).select("name role").sort({ name: 1 }).lean(),
  ]);

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-6 p-4 md:p-6">
      <div>
        <Link
          href="/practice/notices"
          className="text-13 text-ink-muted underline underline-offset-4"
        >
          Notices
        </Link>
        <h1 className="font-display text-24 font-bold tracking-tight">
          Open a matter
        </h1>
        <p className="text-13 text-ink-muted max-w-[70ch]">
          Enter it from the notice itself. The dates the department gave go in
          here; the dates the statute gives are worked out separately, and only
          from rules a partner has confirmed.
        </p>
      </div>

      <NewNotice
        clients={clients.map((row) => ({
          id: String(row._id),
          name: `${row.tradeName || row.legalName} (${row.code})`,
        }))}
        people={people.map((row) => ({
          id: String(row._id),
          name: row.name,
          role: row.role,
        }))}
        kinds={Object.entries(NOTICE_KINDS).map(([key, entry]) => ({
          key,
          label: entry.label,
          law: entry.law,
          /** Whether any of its rules count from the annual return's date. */
          needsAnnualReturn: entry.rules.some(
            (rule) => rule.offset?.from === "annualReturnDue",
          ),
        }))}
        client={params.client ?? ""}
      />
    </div>
  );
}

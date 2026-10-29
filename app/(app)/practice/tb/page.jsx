import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Engagement from "@/models/Engagement";
import Client from "@/models/Client";
import AuditFile from "@/models/AuditFile";
import TrialBalance from "@/models/TrialBalance";
import RuleConfirmation from "@/models/RuleConfirmation";
import { engagementQuery } from "@/lib/engagements/filter";
import { formatISTDate } from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import {
  CONFIRM_KEY,
  CONFIRM_KIND,
  HEADS,
  mappingProgress,
  statements,
} from "@/lib/practice/scheduleIII";
import StartTb from "./StartTb";
import ConfirmHeads from "./ConfirmHeads";

export const metadata = { title: "Financial statements · PHMG" };
export const dynamic = "force-dynamic";

/**
 * The trial balance to the financial statements (P3-32).
 *
 * The front door: which sets of statements the firm is building, how far
 * each has got, and the one thing a partner has to confirm before any of
 * it can be relied on — the Schedule III head list.
 */
export default async function TbPage() {
  const actor = await requireUser();
  if (!can(actor, "view", "practice")) redirect("/issues");
  const editable = can(actor, "edit", "practice");

  await connectDB();

  const engagements = await Engagement.find({
    ...engagementQuery(actor, { closed: "yes" }),
    "templateSnapshot.category": "Audit and Assurance",
  })
    .select("clientId templateSnapshot periodLabel period")
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();

  const ids = engagements.map((e) => e._id);

  const [clients, files, sets, confirmation] = await Promise.all([
    Client.find({ _id: { $in: engagements.map((e) => e.clientId) } })
      .select("legalName tradeName")
      .lean(),
    AuditFile.find({ engagementId: { $in: ids } })
      .select("engagementId")
      .lean(),
    TrialBalance.find({ engagementId: { $in: ids } })
      .sort({ createdAt: -1 })
      .limit(300)
      .lean(),
    RuleConfirmation.findOne({ kind: CONFIRM_KIND, key: CONFIRM_KEY }).lean(),
  ]);

  const clientName = new Map(
    clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );
  const hasFile = new Set(files.map((f) => String(f.engagementId)));
  const started = new Set(sets.map((s) => String(s.engagementId)));

  const options = engagements
    .filter((e) => hasFile.has(String(e._id)) && !started.has(String(e._id)))
    .map((e) => ({
      id: String(e._id),
      label: `${clientName.get(String(e.clientId)) ?? "Client"} · ${
        e.templateSnapshot?.name ?? "Audit"
      } · ${e.periodLabel || e.period}`,
    }));

  const rows = sets.map((set) => {
    const progress = mappingProgress(set.lines ?? []);
    const result = statements(set.lines ?? [], set.adjustments ?? []);
    return {
      id: String(set._id),
      client: clientName.get(String(set.clientId)) ?? "Client",
      fy: set.fyLabel,
      ledgers: progress.total,
      unmapped: progress.unmapped,
      waiting: progress.suggested + progress.remembered,
      locked: Boolean(set.locked),
      lockedAt: set.lockedAt ? formatISTDate(set.lockedAt) : "",
      lockedBy: set.lockedByName ?? "",
      imported: set.importedAt ? formatISTDate(set.importedAt) : "",
      balanced: progress.total > 0 && result.balanced,
      difference: result.difference,
      unadjusted: (set.adjustments ?? []).filter(
        (entry) => entry.state === "Unadjusted",
      ).length,
    };
  });

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="font-display text-24 font-bold tracking-tight">
          Financial statements
        </h1>
        <p className="text-13 text-ink-muted max-w-[76ch]">
          A trial balance in, the balance sheet and the profit and loss out.
          Five steps: import, map each ledger to a Schedule III head, pass the
          adjustments, settle which notes this company needs, and export.
        </p>
      </div>

      {/*
        Rule 8, on the one table in this feature that is statutory. The head
        list lives in code so nobody can edit it into something
        plausible-looking; the confirmation is a fact about a person and a
        date, like the due-date master and the notice limitation periods.
      */}
      {confirmation?.confirmedAt ? (
        <p className="text-13 text-ink-muted">
          Schedule III Division I · <span className="num">{HEADS.length}</span>{" "}
          summary heads, confirmed {formatISTDate(confirmation.confirmedAt)} by{" "}
          {confirmation.confirmedByName}
          {confirmation.note ? ` · ${confirmation.note}` : ""}
        </p>
      ) : (
        <ConfirmHeads
          count={HEADS.length}
          mayConfirm={can(actor, "edit", "firmProfile")}
        />
      )}

      {editable && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-15 font-semibold">
            Start a set of statements
          </h2>
          {options.length === 0 ? (
            <p className="text-13 text-ink-muted">
              Every audit with a file open already has one.{" "}
              <Link
                href="/practice/audit"
                className="underline underline-offset-4"
              >
                The audit studio
              </Link>{" "}
              lists the audits and whether their files are open — a set of
              statements needs one, because an unadjusted entry has to have a
              misstatement summary to go to.
            </p>
          ) : (
            <StartTb engagements={options} />
          )}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-15 font-semibold">
          In progress
          {rows.length > 0 && (
            <span className="num text-ink-muted font-normal">
              {" "}
              · {rows.length}
            </span>
          )}
        </h2>

        {rows.length === 0 ? (
          <p className="text-13 text-ink-muted">
            No set of statements has been started.
          </p>
        ) : (
          <div className="rounded-table border-rule bg-surface overflow-x-auto border">
            <table className="text-14 w-full">
              <thead>
                <tr className="border-rule text-12 text-faint border-b text-left">
                  <th className="px-3 py-2 font-medium">Client</th>
                  <th className="px-3 py-2 font-medium">Year</th>
                  <th className="px-3 py-2 text-right font-medium">Ledgers</th>
                  <th className="px-3 py-2 font-medium">Mapping</th>
                  <th className="px-3 py-2 font-medium">Balances</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-rule border-b last:border-0"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/practice/tb/${row.id}`}
                        className="font-medium underline underline-offset-4"
                      >
                        {row.client}
                      </Link>
                      <div className="text-12 text-faint">
                        {row.locked
                          ? `locked ${row.lockedAt} by ${row.lockedBy}`
                          : row.imported
                            ? `imported ${row.imported}`
                            : "nothing imported yet"}
                      </div>
                    </td>
                    <td className="num text-13 px-3 py-2">{row.fy}</td>
                    <td className="num px-3 py-2 text-right">
                      {row.ledgers || "—"}
                    </td>
                    <td className="text-13 px-3 py-2">
                      {row.ledgers === 0 ? (
                        <span className="text-faint">—</span>
                      ) : row.unmapped > 0 ? (
                        <span className="text-redpen">
                          <span className="num">{row.unmapped}</span> unmapped
                        </span>
                      ) : row.waiting > 0 ? (
                        <span className="text-waiting">
                          <span className="num">{row.waiting}</span> to confirm
                        </span>
                      ) : (
                        <span className="text-filed">all confirmed</span>
                      )}
                      {row.unadjusted > 0 && (
                        <div className="text-12 text-ink-muted">
                          <span className="num">{row.unadjusted}</span>{" "}
                          unadjusted
                        </div>
                      )}
                    </td>
                    <td className="text-13 px-3 py-2">
                      {row.ledgers === 0 ? (
                        <span className="text-faint">—</span>
                      ) : row.balanced ? (
                        <span className="text-filed">to the rupee</span>
                      ) : (
                        <span className="num text-redpen">
                          out by {formatPaise(Math.abs(row.difference))}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import TrialBalance from "@/models/TrialBalance";
import Engagement from "@/models/Engagement";
import Client from "@/models/Client";
import RuleConfirmation from "@/models/RuleConfirmation";
import { formatISTDate } from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import {
  BALANCE_GROUPS,
  CONFIRM_KEY,
  CONFIRM_KIND,
  HEADS,
  NOTE_QUESTIONS,
  mappingProgress,
  notesNeeded,
  outOfBalance,
  statements,
} from "@/lib/practice/scheduleIII";
import Import from "./Import";
import Mapping from "./Mapping";
import Journal from "./Journal";
import Notes from "./Notes";
import Settle from "./Settle";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { id } = await params;
  await connectDB();
  const tb = await TrialBalance.findById(id).select("fyLabel").lean();
  return {
    title: tb
      ? `Statements ${tb.fyLabel} · PHMG`
      : "Financial statements · PHMG",
  };
}

const STEPS = [
  "Import the trial balance",
  "Map the ledgers",
  "Adjustments",
  "Notes",
  "Review and export",
];

/**
 * One set of financial statements, in five steps (P3-32).
 *
 * The steps are the order the work runs in and each one depends on the one
 * before, so the screen shows one at a time rather than a scroll — this is
 * the only screen in the application that does, because it is the only one
 * where doing step four before step two produces a wrong answer rather
 * than an empty one.
 *
 * The step numbers carry their state: how many ledgers are still unmapped,
 * how many entries are unadjusted, whether the two sides agree. A person
 * coming back to this after a week should be able to see where they left
 * off without opening anything.
 */
export default async function TbSetPage({ params, searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "practice")) redirect("/issues");

  const { id } = await params;
  const query = (await searchParams) ?? {};

  await connectDB();
  const tb = await TrialBalance.findById(id).lean();
  if (!tb) notFound();

  const engagement = await Engagement.findById(tb.engagementId)
    .select("clientId branchId assigneeId reviewerId periodLabel period")
    .lean();

  const target = {
    branchId: String(tb.branchId),
    assigneeId: String(engagement?.assigneeId ?? ""),
    reviewerId: String(engagement?.reviewerId ?? ""),
  };
  if (!can(actor, "view", "practice", target)) redirect("/issues");
  const editable = can(actor, "edit", "practice", target) && !tb.locked;

  const [client, confirmation] = await Promise.all([
    Client.findById(tb.clientId).select("legalName tradeName").lean(),
    RuleConfirmation.findOne({ kind: CONFIRM_KIND, key: CONFIRM_KEY }).lean(),
  ]);
  const clientName = client?.tradeName || client?.legalName || "Client";

  const lines = tb.lines ?? [];
  const adjustments = tb.adjustments ?? [];
  const progress = mappingProgress(lines);
  const result = statements(lines, adjustments);
  const tbDifference = outOfBalance(lines);

  const unadjusted = adjustments.filter(
    (entry) => entry.state === "Unadjusted",
  );
  const unsent = unadjusted.filter((entry) => !entry.exceptionId);

  /* A step that cannot be worked yet says so rather than showing an empty
     screen: step 2 needs an import, and 3 to 5 need the mapping finished. */
  const asked = Number(query.step);
  const step = Number.isInteger(asked) && asked >= 1 && asked <= 5 ? asked : 1;

  const heads = HEADS.map((head) => ({
    key: head.key,
    name: head.name,
    group: head.group,
    cite: head.cite,
  }));

  const headName = new Map(HEADS.map((head) => [head.key, head.name]));

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 p-4 md:p-6">
      <nav className="text-13 text-ink-muted flex flex-wrap gap-x-2">
        <Link href="/practice/tb" className="underline underline-offset-4">
          Financial statements
        </Link>
        <span aria-hidden>/</span>
        <Link
          href={`/practice/audit/${tb.engagementId}`}
          className="underline underline-offset-4"
        >
          {clientName} · {engagement?.periodLabel || engagement?.period}
        </Link>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-24 font-bold tracking-tight">
            {clientName} · {tb.fyLabel}
          </h1>
          <p className="text-13 text-ink-muted">
            Schedule III Division I
            {confirmation?.confirmedAt
              ? `, confirmed by ${confirmation.confirmedByName}`
              : " — not yet confirmed by a partner"}
            {tb.source ? ` · ${tb.source}` : ""}
            {tb.importedAt ? ` · imported ${formatISTDate(tb.importedAt)}` : ""}
          </p>
        </div>
        {tb.locked && (
          <span className="rounded-chip border-filed bg-filed-wash text-filed text-13 border px-2 py-0.5">
            Locked {formatISTDate(tb.lockedAt)} by {tb.lockedByName}
          </span>
        )}
      </div>

      {/* The five steps, each carrying what is left to do in it. */}
      <nav aria-label="Steps" className="flex flex-wrap gap-2">
        {STEPS.map((label, index) => {
          const number = index + 1;
          const state =
            number === 2 && progress.unmapped > 0
              ? `${progress.unmapped} left`
              : number === 2 && progress.suggested + progress.remembered > 0
                ? `${progress.suggested + progress.remembered} to confirm`
                : number === 3 && unsent.length > 0
                  ? `${unsent.length} to send`
                  : number === 5 && lines.length > 0 && !result.balanced
                    ? "out of balance"
                    : "";
          return (
            <Link
              key={label}
              href={`/practice/tb/${id}?step=${number}`}
              aria-current={step === number ? "step" : undefined}
              className={`rounded-control text-13 flex h-9 items-center gap-2 border px-3 ${
                step === number
                  ? "border-carbon bg-carbon text-on-carbon font-medium"
                  : "border-rule hover:bg-carbon-wash"
              }`}
            >
              <span className="num">{number}</span>
              {label}
              {state && (
                <span
                  className={
                    step === number ? "text-feature-ink-soft" : "text-redpen"
                  }
                >
                  · {state}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {step === 1 && (
        <Import
          id={id}
          editable={editable}
          locked={Boolean(tb.locked)}
          source={tb.source ?? ""}
          ledgers={lines.length}
          difference={tbDifference}
          imported={tb.importedAt ? formatISTDate(tb.importedAt) : ""}
          importedBy={tb.importedByName ?? ""}
          remembered={progress.remembered}
        />
      )}

      {step === 2 &&
        (lines.length === 0 ? (
          <Empty step={1} id={id}>
            Nothing is imported yet, so there is nothing to map.
          </Empty>
        ) : (
          <Mapping
            id={id}
            editable={editable}
            heads={heads}
            progress={progress}
            unmappedTotal={formatPaise(Math.abs(progress.unmappedPaise))}
            rows={lines.map((line) => ({
              id: String(line._id),
              ledger: line.ledger,
              group: line.group ?? "",
              amount: formatPaise(Math.abs(line.closingPaise)),
              credit: line.closingPaise < 0,
              headKey: line.headKey ?? "",
              status: line.status,
              by: line.mappedByName ?? "",
            }))}
          />
        ))}

      {step === 3 &&
        (lines.length === 0 ? (
          <Empty step={1} id={id}>
            Nothing is imported yet, so there is nothing to adjust.
          </Empty>
        ) : (
          <Journal
            id={id}
            editable={editable}
            heads={heads}
            unsent={unsent.length}
            rows={adjustments.map((entry, index) => ({
              id: String(entry._id),
              no: index + 1,
              description: entry.description,
              amount: formatPaise(Math.abs(entry.amountPaise)),
              head: headName.get(entry.headKey) ?? "",
              counterHead: headName.get(entry.counterHeadKey) ?? "",
              state: entry.state,
              source: entry.source ?? "",
              by: entry.byName ?? "",
              sent: Boolean(entry.exceptionId),
            }))}
          />
        ))}

      {step === 4 && (
        <Notes
          id={id}
          editable={editable}
          questions={NOTE_QUESTIONS}
          answers={tb.noteAnswers ?? {}}
          notes={notesNeeded(tb.noteAnswers ?? {})}
        />
      )}

      {step === 5 &&
        (progress.blocked ? (
          <Empty step={2} id={id}>
            <span className="num">{progress.unmapped}</span>{" "}
            {progress.unmapped === 1 ? "ledger is" : "ledgers are"} still
            unmapped, worth{" "}
            <span className="num">
              {formatPaise(Math.abs(progress.unmappedPaise))}
            </span>
            . The statements would be out by exactly that, so they are not drawn
            until the mapping is finished.
          </Empty>
        ) : (
          <Settle
            id={id}
            editable={can(actor, "edit", "practice", target)}
            mayUnlock={["partner", "ca"].includes(actor.role)}
            locked={Boolean(tb.locked)}
            fy={tb.fyLabel}
            balanceGroups={BALANCE_GROUPS}
            result={{
              rows: result.rows.map((row) => ({
                ...row,
                amount: formatPaise(row.paise),
              })),
              income: formatPaise(result.income),
              profitBeforeTax: formatPaise(result.profitBeforeTax),
              taxExpense: formatPaise(result.taxExpense),
              profit: formatPaise(result.profit),
              assets: formatPaise(result.assets),
              liabilities: formatPaise(result.liabilitiesWithProfit),
              difference: formatPaise(Math.abs(result.difference)),
              balanced: result.balanced,
            }}
            notes={notesNeeded(tb.noteAnswers ?? {}).length}
            unadjusted={unadjusted.length}
          />
        ))}
    </div>
  );
}

/** A step that cannot be worked yet, and the step that unblocks it. */
function Empty({ step, id, children }) {
  return (
    <p className="rounded-ledger border-waiting bg-waiting-wash text-13 max-w-[76ch] border px-3 py-2">
      {children}{" "}
      <Link
        href={`/practice/tb/${id}?step=${step}`}
        className="underline underline-offset-4"
      >
        Back to step {step}
      </Link>
      .
    </p>
  );
}

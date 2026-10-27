import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, branchFilter } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Notice from "@/models/Notice";
import Client from "@/models/Client";
import User from "@/models/User";
import RuleConfirmation from "@/models/RuleConfirmation";
import { formatISTDate } from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import {
  NOTICE_KINDS,
  NOTICE_STAGES,
  allLawRules,
} from "@/lib/practice/noticeLaw";
import {
  nextDue,
  isOverdue,
  adjournments,
  lawClocks,
} from "@/lib/practice/notices";
import NoticeList from "./NoticeList";

export const metadata = { title: "Notices · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Every notice the firm is answering (P3-11).
 *
 * The starter catalog treats a notice as one job with one due date, which
 * is how you track a letter rather than a matter. This is the register of
 * the matters: what is owed next on each, what is overdue, and how much is
 * at stake.
 */
export default async function NoticesPage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "practice")) redirect("/issues");

  const params = (await searchParams) ?? {};
  const stage = NOTICE_STAGES.includes(params.stage) ? params.stage : "";

  await connectDB();
  const scope = branchFilter(actor, "practice") ?? {};
  const mine = ["employee", "intern"].includes(actor.role);

  const [notices, confirmations] = await Promise.all([
    Notice.find({
      ...scope,
      ...(stage ? { stage } : { stage: { $ne: "Closed" } }),
      ...(mine ? { assigneeId: actor.id } : {}),
    })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean(),
    RuleConfirmation.find({ confirmedAt: { $ne: null } })
      .select("kind key confirmedAt")
      .lean(),
  ]);

  const [clients, people] = await Promise.all([
    Client.find({ _id: { $in: notices.map((row) => row.clientId) } })
      .select("legalName tradeName")
      .lean(),
    User.find({ active: true }).select("name").lean(),
  ]);
  const clientName = new Map(
    clients.map((row) => [String(row._id), row.tradeName || row.legalName]),
  );
  const personName = new Map(people.map((row) => [String(row._id), row.name]));

  const rows = notices.map((notice) => {
    const next = nextDue(notice);
    const clocks = lawClocks(notice, confirmations);
    return {
      id: String(notice._id),
      client: clientName.get(String(notice.clientId)) ?? "Client",
      clientId: String(notice.clientId),
      law: notice.law,
      kindLabel: NOTICE_KINDS[notice.kind]?.label ?? notice.kind,
      section: notice.section,
      period: notice.period,
      din: notice.din,
      stage: notice.stage,
      risk: notice.risk,
      stake: notice.stakePaise ? formatPaise(notice.stakePaise) : "",
      demand: notice.demandPaise ? formatPaise(notice.demandPaise) : "",
      assignee: notice.assigneeId
        ? (personName.get(String(notice.assigneeId)) ?? "")
        : "",
      partner: notice.partnerId
        ? (personName.get(String(notice.partnerId)) ?? "")
        : "",
      next: next
        ? { what: next.what, date: formatISTDate(next.date), days: next.days }
        : null,
      overdue: isOverdue(notice),
      adjournments: adjournments(notice, clocks),
      /** How much of the law behind this matter nobody has checked yet. */
      unconfirmed: clocks.filter((clock) => !clock.confirmed).length,
    };
  });

  // the whole table, so the strip can say how much of it is still unchecked
  const total = allLawRules().length;
  const confirmed = confirmations.length;

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-24 font-bold tracking-tight">
            Notices
          </h1>
          <p className="text-13 text-ink-muted max-w-[70ch]">
            Each one is a matter, not a job: several submissions with their own
            dates and acknowledgements, hearings that get put off, and limits
            that come from the statute rather than from the notice.
          </p>
        </div>
        {can(actor, "edit", "practice") && (
          <Link
            href="/practice/notices/new"
            className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 leading-9 font-medium"
          >
            Open a matter
          </Link>
        )}
      </div>

      {confirmed < total && (
        <p className="rounded-ledger border-waiting bg-waiting-wash text-13 border px-3 py-2">
          <strong>
            {total - confirmed} of {total}
          </strong>{" "}
          rules in the notice-law table have not been confirmed by a partner, so
          no limitation date computed from them is shown anywhere. The wording
          and the sections are a first draft taken from the design prototype — a
          partner has to read each one. Open a matter to confirm the rules that
          apply to it.
        </p>
      )}

      <NoticeList rows={rows} stage={stage} stages={NOTICE_STAGES} />
    </div>
  );
}

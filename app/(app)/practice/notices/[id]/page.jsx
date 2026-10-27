import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Notice from "@/models/Notice";
import Client from "@/models/Client";
import User from "@/models/User";
import RuleConfirmation from "@/models/RuleConfirmation";
import { formatISTDate, istInputDate } from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import {
  NOTICE_KINDS,
  NOTICE_STAGES,
  SUBMISSION_TYPES,
} from "@/lib/practice/noticeLaw";
import {
  lawClocks,
  adjournments,
  timeline,
  nextDue,
} from "@/lib/practice/notices";
import NoticeMatter from "./NoticeMatter";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { id } = await params;
  await connectDB();
  const notice = await Notice.findById(id).select("section kind").lean();
  const label = notice
    ? notice.section || NOTICE_KINDS[notice.kind]?.label || "Notice"
    : "Notice";
  return { title: `${label} · PHMG` };
}

/**
 * One matter (P3-11).
 *
 * Six things on one screen, because they are six answers to the same
 * question — where does this stand: the submissions, the hearings, the law
 * clocks, the grounds, the client's paragraph, and the bundle. The merged
 * timeline is above them, derived rather than stored.
 */
export default async function NoticePage({ params }) {
  const actor = await requireUser();
  const { id } = await params;

  await connectDB();
  const notice = await Notice.findById(id).lean();
  if (!notice) notFound();

  const target = {
    branchId: String(notice.branchId),
    assigneeId: String(notice.assigneeId ?? ""),
  };
  if (!can(actor, "view", "practice", target)) {
    redirect(`/no-access?client=${notice.clientId}`);
  }

  const [client, people, confirmations] = await Promise.all([
    Client.findById(notice.clientId).select("legalName tradeName").lean(),
    User.find({ active: true }).select("name role").lean(),
    RuleConfirmation.find({ kind: notice.kind })
      .select("kind key confirmedAt confirmedByName note")
      .lean(),
  ]);

  const personName = new Map(people.map((row) => [String(row._id), row.name]));
  const clocks = lawClocks(notice, confirmations);
  const confirmedBy = new Map(confirmations.map((row) => [row.key, row]));
  const next = nextDue(notice);

  const view = {
    id: String(notice._id),
    clientId: String(notice.clientId),
    client: client?.tradeName || client?.legalName || "Client",
    law: notice.law,
    kind: notice.kind,
    kindLabel: NOTICE_KINDS[notice.kind]?.label ?? notice.kind,
    section: notice.section,
    period: notice.period,
    din: notice.din,
    authority: notice.authority,
    noticeDate: notice.noticeDate ? formatISTDate(notice.noticeDate) : null,
    servedOn: notice.servedOn ? formatISTDate(notice.servedOn) : null,
    annualReturnDue: notice.annualReturnDue
      ? formatISTDate(notice.annualReturnDue)
      : null,
    orderDate: notice.orderDate ? formatISTDate(notice.orderDate) : null,
    orderNote: notice.orderNote,
    issue: notice.issue,
    stake: notice.stakePaise ? formatPaise(notice.stakePaise) : "",
    demand: notice.demandPaise ? formatPaise(notice.demandPaise) : "",
    stage: notice.stage,
    risk: notice.risk,
    assignee: notice.assigneeId
      ? (personName.get(String(notice.assigneeId)) ?? "")
      : "",
    partner: notice.partnerId
      ? (personName.get(String(notice.partnerId)) ?? "")
      : "",
    plainWords: notice.plainWords ?? "",
    closedNote: notice.closedNote ?? "",
    todayInput: istInputDate(new Date()),

    next: next
      ? { what: next.what, date: formatISTDate(next.date), days: next.days }
      : null,

    submissions: (notice.submissions ?? []).map((row) => ({
      id: String(row._id),
      type: row.type,
      dueDate: row.dueDate ? formatISTDate(row.dueDate) : null,
      dueInput: istInputDate(row.dueDate),
      filedOn: row.filedOn ? formatISTDate(row.filedOn) : null,
      ackNo: row.ackNo,
      note: row.note,
      filedByName: row.filedByName,
      late:
        row.filedOn && row.dueDate
          ? new Date(row.filedOn) > new Date(row.dueDate)
          : false,
    })),

    hearings: (notice.hearings ?? []).map((row) => ({
      id: String(row._id),
      on: formatISTDate(row.on),
      heldOn: row.heldOn ? formatISTDate(row.heldOn) : null,
      mode: row.mode,
      attendedByName: row.attendedByName,
      outcome: row.outcome,
      adjourned: row.adjourned,
      adjournmentReason: row.adjournmentReason,
      adjournedBy: row.adjournedBy,
    })),

    grounds: (notice.grounds ?? []).map((row) => ({
      id: String(row._id),
      point: row.point,
      ourGround: row.ourGround,
      evidence: row.evidence,
      settled: row.settled,
    })),

    paperBook: (notice.paperBook ?? [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((row) => ({
        id: String(row._id),
        name: row.name,
        order: row.order,
        pages: row.pages,
        note: row.note,
      })),

    clocks: clocks.map((clock) => ({
      ...clock,
      date: clock.date ? formatISTDate(clock.date) : null,
      confirmedByName: confirmedBy.get(clock.key)?.confirmedByName ?? "",
      confirmedNote: confirmedBy.get(clock.key)?.note ?? "",
    })),

    adjournments: adjournments(notice, clocks),

    timeline: timeline(notice).map((row) => ({
      at: formatISTDate(row.at),
      what: row.what,
      detail: row.detail,
      kind: row.kind,
    })),
  };

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/practice/notices"
          className="text-13 text-ink-muted underline underline-offset-4"
        >
          Notices
        </Link>
        <h1 className="font-display text-24 font-bold tracking-tight">
          {view.kindLabel}
        </h1>
        <p className="text-13 text-ink-muted">
          <Link
            href={`/clients/${view.clientId}`}
            className="underline underline-offset-4"
          >
            {view.client}
          </Link>
          {[view.section, view.period, view.authority]
            .filter(Boolean)
            .map((part) => ` · ${part}`)
            .join("")}
          {view.din && <span className="font-mono"> · {view.din}</span>}
        </p>
      </div>

      <NoticeMatter
        notice={view}
        mayEdit={can(actor, "edit", "practice", target)}
        isPartner={can(actor, "approve", "feeWriteOff")}
        stages={NOTICE_STAGES}
        submissionTypes={SUBMISSION_TYPES}
      />
    </div>
  );
}

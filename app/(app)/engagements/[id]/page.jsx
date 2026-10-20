import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser, requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Engagement from "@/models/Engagement";
import Client from "@/models/Client";
import User from "@/models/User";
import Comment from "@/models/Comment";
import DocumentModel from "@/models/Document";
import DocRequest from "@/models/DocRequest";
import AuditLog from "@/models/AuditLog";
import ActivityFeed from "@/components/audit/ActivityFeed";
import TierBadge from "@/components/ledger/TierBadge";
import {
  formatISTDate,
  formatISTDateTime,
  daysUntil,
  istParts,
} from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import { nextStatuses, canEditWork } from "@/lib/engagements/status";
import EngagementWork from "./EngagementWork";
import RequestPanel from "./RequestPanel";
import { DueChip, StatusChip } from "../chips";
import { bookOf, BOOKS } from "@/lib/practice/books";

/** A date as an `<input type="date">` wants it: yyyy-mm-dd, in IST. */
function dateInput(date) {
  if (!date) return "";
  const { year, month, day } = istParts(new Date(date));
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export const dynamic = "force-dynamic";

/** The code names the client's branch and service, so it is checked like the page. */
export async function generateMetadata({ params }) {
  const generic = { title: "Engagement · PHMG" };
  const actor = await currentUser();
  if (!actor) return generic;

  const { id } = await params;
  await connectDB();
  const engagement = await Engagement.findById(id)
    .select("code branchId assigneeId reviewerId")
    .lean();
  if (!engagement) return generic;

  const maySee = can(actor, "view", "engagementsWork", {
    branchId: String(engagement.branchId),
    assigneeId: String(engagement.assigneeId ?? ""),
    reviewerId: String(engagement.reviewerId ?? ""),
  });

  return maySee ? { title: `${engagement.code} · PHMG` } : generic;
}

export default async function EngagementPage({ params }) {
  const actor = await requireUser();
  const { id } = await params;

  await connectDB();
  const engagement = await Engagement.findById(id).lean();
  if (!engagement) notFound();

  const target = {
    branchId: String(engagement.branchId),
    assigneeId: String(engagement.assigneeId ?? ""),
    reviewerId: String(engagement.reviewerId ?? ""),
  };
  if (!can(actor, "view", "engagementsWork", target)) redirect("/engagements");

  const [
    client,
    assignee,
    reviewer,
    team,
    comments,
    audit,
    documents,
    requests,
  ] = await Promise.all([
    Client.findById(engagement.clientId)
      .select("legalName tradeName code branchId")
      .lean(),
    engagement.assigneeId
      ? User.findById(engagement.assigneeId).select("name role").lean()
      : null,
    engagement.reviewerId
      ? User.findById(engagement.reviewerId).select("name role").lean()
      : null,
    User.find({ active: true })
      .select("name role branchIds")
      .sort({ name: 1 })
      .lean(),
    Comment.find({ entityType: "Engagement", entityId: engagement._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean(),
    AuditLog.find({ entityType: "Engagement", entityId: engagement._id })
      .sort({ ts: -1 })
      .limit(50)
      .lean(),
    DocumentModel.find({ engagementId: engagement._id })
      .sort({ createdAt: -1 })
      .lean(),
    DocRequest.find({ engagementId: engagement._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
  ]);

  const mayWork = can(actor, "edit", "engagementsWork", target);
  const mayManage = can(actor, "edit", "engagementsCreate", {
    branchId: String(engagement.branchId),
  });
  const isReviewer = target.reviewerId === actor.id || actor.role === "partner";

  const view = {
    id: String(engagement._id),
    code: engagement.code,
    status: engagement.status,
    priority: engagement.priority,
    service: engagement.templateSnapshot?.name ?? "Service",
    serviceCode: engagement.templateSnapshot?.code ?? "",
    templateVersion: engagement.templateSnapshot?.version ?? 1,
    level: engagement.templateSnapshot?.level ?? "",
    // the floor a step falls back to when it names no role of its own
    minExecRole: engagement.templateSnapshot?.minExecRole ?? "intern",
    udinRequired: Boolean(engagement.templateSnapshot?.udinRequired),
    periodLabel: engagement.periodLabel || engagement.period,
    fee: formatPaise(engagement.feePaise ?? 0),
    billingStatus: engagement.billingStatus,
    ackNo: engagement.ackNo ?? "",
    udin: engagement.udin ?? "",
    // the filing panel's date inputs want yyyy-mm-dd; everything the firm
    // reads is still formatted in IST
    filedOnInput: dateInput(engagement.filedOn),
    todayInput: dateInput(new Date()),
    filedOn: engagement.filedOn ? formatISTDate(engagement.filedOn) : "",
    // the assurance block is for audit work and nothing else (P2-8a)
    isAudit: bookOf(engagement.templateSnapshot?.category ?? "") === "audits",
    book: bookOf(engagement.templateSnapshot?.category ?? ""),
    assurance: {
      auditType: engagement.assurance?.auditType ?? "",
      appointmentDate: dateInput(engagement.assurance?.appointmentDate),
      reportDate: dateInput(engagement.assurance?.reportDate),
      opinion: engagement.assurance?.opinion ?? "",
      qualificationNote: engagement.assurance?.qualificationNote ?? "",
    },
    reworkCount: engagement.reworkCount ?? 0,
    // for the completion stamp (spec section 15)
    completedOn: engagement.completedAt
      ? formatISTDate(engagement.completedAt)
      : "",
    // the name comes from the status history: `completedBy` holds an id
    completedBy:
      (engagement.statusHistory ?? [])
        .filter((event) => event.to === "Completed")
        .at(-1)?.byName ?? "",
    internalDue: engagement.internalDue
      ? formatISTDate(engagement.internalDue)
      : null,
    internalDueInput: engagement.internalDue
      ? engagement.internalDue.toISOString().slice(0, 10)
      : "",
    internalDueDays: engagement.internalDue
      ? daysUntil(engagement.internalDue)
      : null,
    statutoryDue: engagement.statutoryDue
      ? formatISTDate(engagement.statutoryDue)
      : null,
    statutoryDueDays: engagement.statutoryDue
      ? daysUntil(engagement.statutoryDue)
      : null,
    assigneeId: target.assigneeId,
    reviewerId: target.reviewerId,
    assigneeName: assignee?.name ?? "Nobody yet",
    reviewerName: reviewer?.name ?? "Nobody yet",
    tasks: (engagement.tasks ?? []).map((t) => ({
      id: String(t._id),
      name: t.name,
      done: t.done,
      // empty means the step inherits the service's own floor
      minRole: t.minRole || "",
      assigneeId: t.assigneeId ? String(t.assigneeId) : "",
    })),
    checklist: (engagement.checklist ?? []).map((c) => ({
      id: String(c._id),
      name: c.name,
      side: c.side,
      mandatory: c.mandatory,
      status: c.status,
    })),
    reviewChecklist: (engagement.reviewChecklist ?? []).map((r) => ({
      id: String(r._id),
      name: r.name,
      checked: r.checked,
    })),
    statusHistory: (engagement.statusHistory ?? []).map((e) => ({
      from: e.from,
      to: e.to,
      at: formatISTDateTime(e.at),
      byName: e.byName,
      reason: e.reason,
    })),
  };

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/engagements"
          className="text-13 text-ink-muted underline underline-offset-4"
        >
          Engagements
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="font-display text-28 font-semibold">
              {view.service}
            </h1>
            <p className="text-13 text-ink-muted">
              <Link
                href={`/clients/${engagement.clientId}`}
                className="underline underline-offset-4"
              >
                {client?.tradeName || client?.legalName}
              </Link>{" "}
              · {view.periodLabel} ·{" "}
              <span className="font-mono">{view.code}</span>
              {view.book && can(actor, "view", "practice", target) && (
                <>
                  {" · "}
                  <Link
                    href={`/practice/${view.book}`}
                    className="underline underline-offset-4"
                  >
                    {BOOKS[view.book].title} register
                  </Link>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TierBadge level={view.level} withLabel />
            <StatusChip status={view.status} />
            {view.statutoryDue ? (
              <DueChip
                label="Statutory"
                date={view.statutoryDue}
                days={view.statutoryDueDays}
              />
            ) : (
              <span className="rounded-ledger border-rule text-13 text-ink-muted border px-2 py-0.5">
                Statutory date: Step 7
              </span>
            )}
            {view.internalDue && (
              <DueChip
                label="Internal"
                date={view.internalDue}
                days={view.internalDueDays}
              />
            )}
          </div>
        </div>
      </div>

      <EngagementWork
        engagement={view}
        nextStatuses={nextStatuses(actor, {
          status: engagement.status,
          assigneeId: target.assigneeId,
          reviewerId: target.reviewerId,
          minReviewRole: engagement.templateSnapshot?.minReviewRole ?? "",
          level: engagement.templateSnapshot?.level ?? "",
        })}
        canEditWork={mayWork && canEditWork(actor, engagement)}
        mayManage={mayManage}
        isReviewer={isReviewer}
        actorRole={actor.role}
        documents={documents.map((d) => ({
          id: String(d._id),
          name: d.name,
          size: d.size,
          mime: d.mime,
          checklistItemId: d.checklistItemId ? String(d.checklistItemId) : null,
          versions: (d.versions ?? []).length,
          uploadedByName: d.uploadedByName,
        }))}
        mayAttach={can(actor, "edit", "documents", target)}
        team={team.map((u) => ({
          id: String(u._id),
          name: u.name,
          role: u.role,
        }))}
        comments={comments.map((c) => ({
          id: String(c._id),
          body: c.body,
          by: c.createdByName || "Someone",
          at: formatISTDateTime(c.createdAt),
          internal: c.internal,
        }))}
      />

      <RequestPanel
        engagementId={view.id}
        mayRequest={can(actor, "edit", "documents", target)}
        outstanding={
          (engagement.checklist ?? []).filter(
            (item) =>
              item.side === "client" &&
              !["Received", "Verified"].includes(item.status),
          ).length
        }
        requests={requests.map((r) => ({
          id: String(r._id),
          hint: r.tokenHint,
          items: (r.items ?? []).length,
          uploads: r.uploadCount ?? 0,
          expiresAt: new Date(r.expiresAt).toISOString(),
          open: !r.revokedAt && new Date(r.expiresAt) > new Date(),
          revoked: Boolean(r.revokedAt),
        }))}
      />

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-20">Activity</h2>
        <ActivityFeed entries={JSON.parse(JSON.stringify(audit))} />
      </section>
    </div>
  );
}

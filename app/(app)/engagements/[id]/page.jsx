import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser, requireUser } from "@/auth";
import { can, whyNot } from "@/lib/permissions";
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
  istInputDate,
} from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import {
  offeredStatuses,
  canEditWork,
  checkReviewer,
} from "@/lib/engagements/status";
import { feeState, pendingWaiver, scopeLine } from "@/lib/engagements/scope";
import {
  isApproved,
  isClientConfirmed,
  needsClientConfirmation,
  blocksFiling,
  versionOf,
} from "@/lib/engagements/gates";
import { atRisk } from "@/lib/engagements/risk";
import { nextStep } from "@/lib/issues/next";
import { outsideViewNote } from "@/lib/access/view";
import { OutsideView } from "@/components/shell/ViewNote";
import Branch from "@/models/Branch";
import DocTemplate from "@/models/DocTemplate";
import GeneratedDoc from "@/models/GeneratedDoc";
import EngagementWork from "./EngagementWork";
import NotifyPanel from "./NotifyPanel";
import { notifyAudience } from "./notify";
import RequestPanel from "./RequestPanel";
import DocsPanel from "./DocsPanel";
import { issuerFor } from "@/lib/docs/rules";
import { DueChip, StatusChip } from "../chips";
import { bookOf, BOOKS } from "@/lib/practice/books";
import {
  latenessDays,
  milestoneState,
  filingProgress,
  proofPending,
} from "@/lib/engagements/milestones";

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
  if (!can(actor, "view", "engagementsWork", target)) {
    redirect(`/no-access?client=${engagement.clientId}`);
  }

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

  // documents generated from the firm's templates (P2-8b)
  const mayGenerate = can(actor, "edit", "docGenerate", target);
  const [docTemplates, generated] = await Promise.all([
    mayGenerate
      ? DocTemplate.find({ active: true })
          .select("name kind verifiedAt")
          .sort({ kind: 1, name: 1 })
          .lean()
      : [],
    can(actor, "view", "docGenerate", target)
      ? GeneratedDoc.find({ engagementId: engagement._id })
          .sort({ createdAt: -1 })
          .limit(50)
          .lean()
      : [],
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
    feePaise: engagement.feePaise ?? 0,
    billingStatus: engagement.billingStatus,
    /** How this job is paid for, and what that is waiting on (P3-4). */
    money: (() => {
      const state = feeState(engagement);
      const pending = pendingWaiver(engagement);
      return {
        scope: state.scope,
        label: state.label,
        detail: state.detail,
        blocked: state.pending,
        waiver: pending
          ? {
              reason: pending.reason,
              requestedByName: pending.requestedByName || "Staff",
            }
          : null,
        line: scopeLine(engagement),
        // why the controls are absent, rather than their simply being absent
        whyNoPricing: whyNot(actor, "edit", "invoices", {
          branchId: String(engagement.branchId),
        }),
      };
    })(),
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
    /**
     * The gates before a filing (P3-5). `cannotApprove` is the sentence the
     * server would refuse with, worked out here so the button is disabled
     * with the reason rather than offered and then refused.
     */
    gates: (() => {
      const approved = isApproved(engagement);
      const confirmed = isClientConfirmed(engagement);
      const identity = checkReviewer(
        actor,
        {
          status: engagement.status,
          assigneeId: target.assigneeId,
          reviewerId: target.reviewerId,
          minReviewRole: engagement.templateSnapshot?.minReviewRole ?? "",
          level: engagement.templateSnapshot?.level ?? "",
        },
        { act: "approve it", instead: "approve it", only: "approve this" },
      );
      return {
        version: versionOf(engagement),
        approved,
        approvedByName: approved ? engagement.review.approvedByName : "",
        approvedVersion: approved ? engagement.review.version : null,
        approvedOn: approved
          ? formatISTDate(engagement.review.approvedAt)
          : null,
        needsClient: needsClientConfirmation(engagement),
        confirmation: confirmed
          ? {
              who: engagement.clientConfirmation.who,
              when: formatISTDate(engagement.clientConfirmation.when),
              evidence: engagement.clientConfirmation.evidence,
              version: engagement.clientConfirmation.version,
              recordedByName: engagement.clientConfirmation.recordedByName,
            }
          : null,
        blocksFiling: blocksFiling(engagement),
        /**
         * In order: may this person approve anything at all, then may they
         * approve *this*, then is it even submitted. The first comes from
         * the matrix (P3-8), the second from maker-checker, and saying the
         * wrong one first would send somebody to ask for a permission they
         * already have.
         */
        cannotApprove:
          whyNot(actor, "approve", "engagementsReview", target) ??
          (identity.ok
            ? engagement.status !== "Under review"
              ? "Send the work for review first."
              : null
            : identity.error),
      };
    })(),
    atRisk: atRisk(engagement),
    /**
     * The monthly GST cycle (P3-12). Only on GST work: every other
     * service would get a panel asking for sheets it does not need.
     */
    isGst: /GSTR|GST/i.test(engagement.templateSnapshot?.code ?? ""),
    gst: engagement.gstPrep
      ? {
          fileName: engagement.gstPrep.fileName ?? "",
          uploadedAt: engagement.gstPrep.uploadedAt
            ? formatISTDateTime(engagement.gstPrep.uploadedAt)
            : null,
          uploadedByName: engagement.gstPrep.uploadedByName ?? "",
          counts: engagement.gstPrep.counts ?? {},
          missingSheets: engagement.gstPrep.missingSheets ?? [],
          issues: engagement.gstPrep.issues ?? [],
          submissionCount: engagement.gstPrep.submissionCount ?? 0,
          sentBackAt: engagement.gstPrep.sentBackAt
            ? formatISTDate(engagement.gstPrep.sentBackAt)
            : null,
          sentBackCount: engagement.gstPrep.sentBackCount ?? 0,
          computation: engagement.gstPrep.computation ?? null,
        }
      : {
          issues: [],
          counts: {},
          missingSheets: [],
          computation: null,
          uploadedAt: null,
        },
    /**
     * The one next thing on this job, read for this reader (P3-6). The same
     * conditions Issues computes firm-wide, for one engagement.
     */
    next: nextStep(engagement, actor, {
      assigneeName: assignee?.name,
      reviewerName: reviewer?.name,
    }),
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
    internalDueInput: istInputDate(engagement.internalDue),
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
    /**
     * The statutory filings this work owes (P3-1). Two for monthly GST, one
     * for most things, none when the service's due-date rule has not been
     * confirmed — and that last case is why `milestones` can be empty and
     * the panel says so rather than showing nothing.
     */
    milestones: (engagement.milestones ?? []).map((m) => ({
      id: String(m._id),
      name: m.name,
      dueDate: m.dueDate ? formatISTDate(m.dueDate) : null,
      dueDateDays: m.dueDate ? daysUntil(m.dueDate) : null,
      filedOn: m.filedOn ? formatISTDate(m.filedOn) : null,
      ackNo: m.ackNo ?? "",
      lateBy: latenessDays(m),
      state: milestoneState(m),
      hasProof: Boolean(m.proofDocumentId),
      filedByName: m.filedByName ?? "",
      history: (m.history ?? []).map((h) => ({
        ackNo: h.ackNo ?? "",
        filedOn: h.filedOn ? formatISTDate(h.filedOn) : null,
        reason: h.reason,
        correctedByName: h.correctedByName ?? "",
        correctedAt: h.correctedAt ? formatISTDate(h.correctedAt) : null,
      })),
    })),
    filingProgress: filingProgress(engagement),
    proofPending: proofPending(engagement),
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
      /** Which submission, why it went back, and what the client said (P3-2). */
      submissionCount: c.submissionCount ?? 0,
      acceptedSubmission: c.acceptedSubmission ?? null,
      acceptedByName: c.acceptedByName ?? "",
      rejectReason: c.rejectReason ?? "",
      notRequiredReason: c.notRequiredReason ?? "",
      clientReply: c.clientReply
        ? {
            kind: c.clientReply.kind,
            note: c.clientReply.note ?? "",
            delegateName: c.clientReply.delegateName ?? "",
            delegateContact: c.clientReply.delegateContact ?? "",
            question: c.clientReply.question ?? "",
            answer: c.clientReply.answer ?? "",
            byName: c.clientReply.byName ?? "",
          }
        : null,
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

  /**
   * Opened from a link or a search while the top bar says one branch
   * (P3-7). The record is shown — access allowed it — and the line says
   * why, rather than leaving the selector looking as though it lied.
   */
  const branches = await Branch.find(
    actor.role === "partner" ? {} : { _id: { $in: actor.branchIds } },
  )
    .select("name")
    .lean();
  const outside = outsideViewNote(
    actor.view,
    String(engagement.branchId),
    branches.map((b) => ({ id: String(b._id), name: b.name })),
  );

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6 p-4 md:p-6">
      <OutsideView note={outside} />
      <div className="flex flex-col gap-2">
        <Link
          href="/engagements"
          className="text-13 text-ink-muted underline underline-offset-4"
        >
          Engagements
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="font-display text-24 font-bold tracking-tight">
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
              <span className="rounded-chip border-rule text-13 text-ink-muted border px-2 py-0.5">
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
        moves={offeredStatuses(actor, {
          status: engagement.status,
          assigneeId: target.assigneeId,
          reviewerId: target.reviewerId,
          minReviewRole: engagement.templateSnapshot?.minReviewRole ?? "",
          level: engagement.templateSnapshot?.level ?? "",
        })}
        canEditWork={mayWork && canEditWork(actor, engagement)}
        mayManage={mayManage}
        mayPrice={can(actor, "edit", "invoices", {
          branchId: String(engagement.branchId),
        })}
        isPartner={can(actor, "approve", "feeWriteOff")}
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
          /** P3-17b: whether it reached them, and whether they wrote it. */
          sentAt: c.sentToClientAt ? formatISTDateTime(c.sentToClientAt) : "",
          fromClient: c.kind === "Client message",
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

      <DocsPanel
        templates={docTemplates.map((t) => ({
          id: String(t._id),
          name: t.name,
          verified: Boolean(t.verifiedAt),
        }))}
        mayGenerate={mayGenerate}
        // the tier rule: a partner issues an A-tier job's letters, a CA the
        // rest — the same ladder that signs the work off (P2-4)
        mayIssue={
          can(actor, "approve", "docGenerate", target) &&
          (issuerFor(engagement.templateSnapshot?.level ?? "") !== "partner" ||
            actor.role === "partner")
        }
        docs={{
          engagementId: view.id,
          rows: generated.map((d) => ({
            id: String(d._id),
            name: d.templateName,
            final: d.state === "final",
            version: d.templateVersion,
            udin: d.udin,
            byName: d.createdBy === actor.id ? "you" : "a colleague",
            issuedByName: d.issuedByName,
            issuedOn: d.issuedAt ? formatISTDate(d.issuedAt) : "",
          })),
        }}
      />

      {/* --- telling somebody about it (P3-17a) ------------------------- */}
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border p-4">
        <div>
          <h2 className="font-display text-15 font-semibold">Notify</h2>
          <p className="text-13 text-ink-muted max-w-[70ch]">
            One message, to the people on this job and to the client&rsquo;s own
            contacts, in your words. You see exactly what each of them will get
            before any of it is sent.
          </p>
        </div>
        <NotifyPanel {...await notifyAudience(id)} id={id} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-15 font-semibold">Activity</h2>
        <ActivityFeed entries={JSON.parse(JSON.stringify(audit))} />
      </section>
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser, requireUser } from "@/auth";
import { can, whyNot } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Engagement from "@/models/Engagement";
import Client from "@/models/Client";
import User from "@/models/User";
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
import { isGstWork } from "@/lib/gst/cycle";
import { nextStep } from "@/lib/issues/next";
import { outsideViewNote } from "@/lib/access/view";
import { OutsideView } from "@/components/shell/ViewNote";
import Branch from "@/models/Branch";
import DocTemplate from "@/models/DocTemplate";
import GeneratedDoc from "@/models/GeneratedDoc";
import EngagementWork from "./EngagementWork";
import { notifyAudience } from "./notify";
import LettersTab from "./LettersTab";
import MessageLog from "@/models/MessageLog";
import Tabs from "./Tabs";
import { issuerFor } from "@/lib/docs/rules";
import { dueTone, dueWords } from "../chips";
import StatusMenu from "./StatusMenu";
import { bookOf, BOOKS } from "@/lib/practice/books";
import { isId } from "@/lib/routes/id";
import {
  latenessDays,
  milestoneState,
  filingProgress,
  proofPending,
} from "@/lib/engagements/milestones";
import { itemLink } from "@/lib/services/catalog";

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
  // a mistyped URL is not a page title (#7)
  if (!isId(id)) return generic;
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

/**
 * The five faces of one job (owner, 03-11-2026).
 *
 * This screen had thirteen panels down one column: the next action, the
 * stamp, the pipeline, the steps, the checklist, the fee, the assignment,
 * the audit file, the GST data, the two folded records, the document
 * requests, the letters, the notify box and the activity feed. Everything
 * the firm knows about a job, all of it at once, and the one thing
 * somebody opened the page for somewhere in the middle of it.
 *
 * So it is five tabs, grouped by what somebody came to do rather than by
 * what the data is:
 *
 *  - **Work** — the step you are on and the controls that move it. The
 *    default, because it is the answer to "what now?".
 *  - **Files** — what the client owes, what has arrived, what we asked
 *    for. Things coming in.
 *  - **Letters** — documents generated, edited and sent. Things going out.
 *  - **Setup** — the fee, who it is on, when it is due. Settings on the
 *    job, read once a month rather than once an hour.
 *  - **Activity** — the audit trail.
 *
 * The tab lives in the URL, so a link to a job's letters is a link to a
 * job's letters, the back button works, and none of it needs client state.
 */
const TABS = ["work", "files", "letters", "setup", "activity"];

export default async function EngagementPage({ params, searchParams }) {
  const actor = await requireUser();
  const { id } = await params;
  // a mistyped URL is a 404, not a cast error (#7)
  if (!isId(id)) notFound();
  const query = (await searchParams) ?? {};
  const tab = TABS.includes(query.tab) ? query.tab : "work";

  await connectDB();
  const engagement = await Engagement.findById(id).lean();
  if (!engagement) notFound();

  const target = {
    branchId: String(engagement.branchId),
    assigneeId: String(engagement.assigneeId ?? ""),
    reviewerId: String(engagement.reviewerId ?? ""),
    // the others working on it, who are on it as far as access goes
    assignedUserIds: (engagement.helperIds ?? []).map(String),
  };
  if (!can(actor, "view", "engagementsWork", target)) {
    redirect(`/no-access?client=${engagement.clientId}`);
  }

  const [client, assignee, reviewer, team, audit, documents, requests] =
    await Promise.all([
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

  /**
   * What this job has actually sent (owner, 13-11-2026).
   *
   * Two places record it, because two different things send: the mail
   * queue logs every message against the engagement, and a document
   * emailed to the client is logged against the document. The Letters
   * tab asks one question — "what left this job?" — so both are read and
   * merged.
   *
   * A held or failed message is read too. A firm that believes it told a
   * client something it did not is in a worse position than one that
   * knows it never sent it.
   */
  const mail = await MessageLog.find({
    $or: [
      { entityType: "Engagement", entityId: engagement._id },
      ...(generated.length
        ? [
            {
              entityType: "GeneratedDoc",
              entityId: { $in: generated.map((d) => d._id) },
            },
          ]
        : []),
    ],
  })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  /** The register at the top of Letters: mail, newest first. */
  const sentOut = mail.map((row) => ({
    id: String(row._id),
    kind: row.entityType === "GeneratedDoc" ? "doc" : "mail",
    subject: row.subject || row.template || "Message",
    to: row.sentTo || row.to,
    body: row.body || "",
    status: row.status,
    heldReason: row.heldReason || "",
    by: "",
    when: formatISTDate(row.sentAt ?? row.createdAt),
    href: row.entityType === "GeneratedDoc" ? `/docs/${row.entityId}/pdf` : "",
  }));

  /**
   * The letters, as one prop (owner, 12-11-2026).
   *
   * They used to be assembled inline for the Letters tab alone. The step
   * that asks for a letter and the reviewer's step both draw the same
   * panel now, so the data is built once here and handed to all three —
   * a second copy of this mapping is a second place for a row to go stale.
   */
  const letters = {
    mayGenerate,
    // the tier rule: a partner issues an A-tier job's letters, a CA the
    // rest — the same ladder that signs the work off (P2-4)
    mayIssue:
      can(actor, "approve", "docGenerate", target) &&
      (issuerFor(engagement.templateSnapshot?.level ?? "") !== "partner" ||
        actor.role === "partner"),
    templates: docTemplates.map((t) => ({
      id: String(t._id),
      name: t.name,
      verified: Boolean(t.verifiedAt),
    })),
    docs: {
      engagementId: String(engagement._id),
      rows: generated.map((d) => ({
        id: String(d._id),
        /** Which template it came from; kept for letters made before 13-11-2026. */
        templateId: d.templateId ? String(d.templateId) : "",
        /** Which checklist row asked for it, which is how a row finds its own. */
        checklistItemId: d.checklistItemId ? String(d.checklistItemId) : "",
        name: d.templateName,
        final: d.state === "final",
        version: d.templateVersion,
        udin: d.udin,
        byName: d.createdBy === actor.id ? "you" : "a colleague",
        issuedByName: d.issuedByName,
        issuedOn: d.issuedAt ? formatISTDate(d.issuedAt) : "",
        /** Somebody has written in this draft, so it no longer re-resolves. */
        edited: Boolean(d.edited),
        editedByName: d.editedByName ?? "",
        /** Whether the client has actually been sent it, and where to. */
        sentOn: d.sentAt ? formatISTDate(d.sentAt) : "",
        sentTo: d.sentTo ?? [],
        /** Sorts the Files tab's one list against the uploaded files. */
        at: d.createdAt ? new Date(d.createdAt).toISOString() : "",
      })),
    },
  };

  const mayWork = can(actor, "edit", "engagementsWork", target);
  const mayManage = can(actor, "edit", "engagementsCreate", {
    branchId: String(engagement.branchId),
  });
  const isReviewer = target.reviewerId === actor.id || actor.role === "partner";

  /**
   * Every move this status could make, each with its refusal or null (P3-8).
   * Read twice — the head's status menu offers them, and the last step's
   * own button asks this whether Completing is on the table — so it is
   * computed once.
   */
  const moves = offeredStatuses(actor, {
    status: engagement.status,
    assigneeId: target.assigneeId,
    reviewerId: target.reviewerId,
    minReviewRole: engagement.templateSnapshot?.minReviewRole ?? "",
    level: engagement.templateSnapshot?.level ?? "",
  });

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
    isGst: isGstWork(engagement),
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
    /** The others on the job, named from the team list already loaded. */
    helperIds: target.assignedUserIds,
    helperNames: target.assignedUserIds
      .map(
        (helperId) =>
          team.find((person) => String(person._id) === helperId)?.name,
      )
      .filter(Boolean),
    /** Has anybody said this work needs no UDIN? (02-11-2026) */
    udinNotRequired: Boolean(engagement.udinNotRequired),
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
      /** Ordinary work, or `udin` — the step that carries the number. */
      kind: t.kind || "",
      assigneeId: t.assigneeId ? String(t.assigneeId) : "",
      /** Who ticked it and when, which the stepper shows on a done step. */
      doneOn: t.doneAt ? formatISTDate(t.doneAt) : "",
      doneByName:
        team.find((person) => String(person._id) === String(t.doneBy ?? ""))
          ?.name ?? "",
    })),
    checklist: (engagement.checklist ?? []).map((c) => ({
      id: String(c._id),
      name: c.name,
      side: c.side,
      mandatory: c.mandatory,
      /**
       * Which step asks for it. `null` — every row written before the
       * catalog could divide a checklist — is shown on step one, where the
       * single undivided list used to sit.
       */
      stepIndex: Number.isInteger(c.stepIndex) ? c.stepIndex : null,
      /**
       * What the row asks for: a document, a tick, a trip to another
       * screen, or a letter from a template (12-11-2026). The link is
       * resolved here — the screen it points at and the ids it needs are
       * the server's business, not something a client component should be
       * assembling out of strings.
       */
      kind: c.kind || "upload",
      link:
        c.kind === "link"
          ? itemLink(c.linkTo, {
              clientId: String(engagement.clientId),
              engagementId: String(engagement._id),
            })
          : null,
      docTemplateId: c.docTemplateId ? String(c.docTemplateId) : "",
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
    /**
     * How many of the client's mandatory documents are still outstanding,
     * for the badge on the Files tab. A tab people cannot see into has to
     * say whether there is anything behind it.
     */
    checklistOutstanding: (engagement.checklist ?? []).filter(
      (item) =>
        item.side === "client" &&
        item.mandatory &&
        ["Pending", "Requested", "Replacement requested"].includes(item.status),
    ).length,

    /*
      `statusHistory` is no longer serialised for the screen (owner,
      03-11-2026): the Pipeline history panel that read it is gone, and
      `auditLogs` holds every status change with its reason and its hash
      anyway — the Activity tab is the one place that tells that story.

      The stored array itself is untouched; `completedBy` above still reads
      it for the completion stamp.
    */
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
    <div className="mx-auto flex max-w-[1060px] flex-col gap-5 p-4 md:p-6">
      <OutsideView note={outside} />

      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/engagements"
            className="text-13 text-ink-muted hover:text-ink"
          >
            ← Engagements
          </Link>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <h1 className="font-display text-24 align-baseline font-bold tracking-tight">
              {view.service}
              <StatusMenu id={view.id} status={view.status} moves={moves} />
            </h1>
            <p className="text-13 text-ink-muted mt-2">
              <Link
                href={`/clients/${engagement.clientId}`}
                className="text-ink underline-offset-4 hover:underline"
              >
                {client?.tradeName || client?.legalName}
              </Link>{" "}
              <TierBadge level={view.level} withLabel />· {view.periodLabel} ·{" "}
              <span className="num">{view.code}</span>
              {view.book && can(actor, "view", "practice", target) && (
                <>
                  {" · "}
                  <Link
                    href={`/practice/${view.book}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {BOOKS[view.book].title} register
                  </Link>
                </>
              )}
            </p>
          </div>
          <Tabs
            id={id}
            tab={tab}
            /*
              The badges count what the tab now holds (owner,
              13-11-2026). Files was badged with what the client still
              owed, which was true of the checklist and is no longer
              true of the tab: the checklist is on the step. Letters was
              badged with every generated document, most of which had
              never been sent.
            */
            badges={{
              files:
                documents.length + generated.length
                  ? { value: documents.length + generated.length }
                  : undefined,
              letters: sentOut.length ? { value: sentOut.length } : undefined,
            }}
          />
        </div>

        {/*
          The dates, as one line. "Statutory date: Step 7" was a note to
          whoever was building this, left on a screen the firm reads
          (QA 09-11-2026, #21 and #34); when there is no date this says so
          and where one comes from.
        */}
        <p className="text-13 text-ink-muted">
          {view.statutoryDue ? (
            <>
              Statutory{" "}
              <span className="num text-ink">{view.statutoryDue}</span>
              {" · "}
              <span className={dueTone(view.statutoryDueDays)}>
                {dueWords(view.statutoryDueDays)}
              </span>
            </>
          ) : (
            <span title="A statutory date appears here once a partner has confirmed the due-date rule for this service in Settings → Due dates.">
              No statutory date yet
            </span>
          )}
          {view.internalDue && (
            <>
              {" · internal "}
              <span className="num">{view.internalDue}</span>
              {" · "}
              <span className={dueTone(view.internalDueDays)}>
                {dueWords(view.internalDueDays)}
              </span>
            </>
          )}
        </p>
      </header>

      {/*
        The one line that has to survive tabbing away from the work.

        Splitting a page into tabs costs something: the thing you were not
        looking at is now invisible rather than merely further down. The
        next action is the one piece that cannot afford that, so it is
        stated here — but only on the tabs that are not Work, because on
        Work it is inside the step card, under the name of the step it
        belongs to, and the same sentence twice on one screen is what made
        this page read as busy.
      */}
      {tab !== "work" && view.next && view.next.stance !== "done" && (
        <p className="text-13 text-ink-muted">
          <span className="text-ink font-medium">Next:</span> {view.next.text}
          {" · "}
          <Link
            href={`/engagements/${id}`}
            className="hover:text-carbon underline underline-offset-4"
          >
            go to Work
          </Link>
        </p>
      )}

      <EngagementWork
        tab={tab}
        engagement={view}
        moves={moves}
        canEditWork={mayWork && canEditWork(actor, engagement)}
        mayManage={mayManage}
        mayPrice={can(actor, "edit", "invoices", {
          branchId: String(engagement.branchId),
        })}
        isPartner={can(actor, "approve", "feeWriteOff")}
        mayDelete={can(actor, "approve", "deleteRecord")}
        isReviewer={isReviewer}
        actorRole={actor.role}
        // a `doc` row on the checklist drafts a letter, and the reviewer
        // reads and corrects it on their own step: the same panel and the
        // same permissions the Letters tab uses
        mayGenerate={mayGenerate}
        letters={letters}
        documents={documents.map((d) => ({
          id: String(d._id),
          name: d.name,
          size: d.size,
          mime: d.mime,
          checklistItemId: d.checklistItemId ? String(d.checklistItemId) : null,
          versions: (d.versions ?? []).length,
          uploadedByName: d.uploadedByName,
          // whose paper it is: the Files tab's two sides read this
          origin: d.origin === "firm" ? "firm" : "client",
          // for the Files tab: one list, newest first, in words
          uploadedOn: d.createdAt ? formatISTDate(d.createdAt) : "",
          at: d.createdAt ? new Date(d.createdAt).toISOString() : "",
        }))}
        mayAttach={can(actor, "edit", "documents", target)}
        /*
          The upload links we have given the client, as data rather than
          as a rendered panel (owner-reported console error, 13-11-2026).

          It was `requestPanel={<RequestPanel …/>}`: an element built in
          this server component, handed to a client component, and placed
          by a third among its own children. React could not account for
          where it came from and asked for a key on every render. An
          element is not a prop worth passing anyway — the panel is a
          client component, so the client component that draws it can
          import it, and only its figures have to cross the boundary.
        */
        docRequests={{
          mayRequest: can(actor, "edit", "documents", target),
          outstanding: (engagement.checklist ?? []).filter(
            (item) =>
              item.side === "client" &&
              !["Received", "Verified"].includes(item.status),
          ).length,
          requests: requests.map((r) => ({
            id: String(r._id),
            hint: r.tokenHint,
            items: (r.items ?? []).length,
            uploads: r.uploadCount ?? 0,
            expiresAt: new Date(r.expiresAt).toISOString(),
            open: !r.revokedAt && new Date(r.expiresAt) > new Date(),
            revoked: Boolean(r.revokedAt),
          })),
        }}
        team={team.map((u) => ({
          id: String(u._id),
          name: u.name,
          role: u.role,
        }))}
      />

      {/* --- things going out: Letters -------------------------------- */}
      {tab === "letters" && (
        <LettersTab
          engagementId={view.id}
          sent={sentOut}
          letters={letters}
          notify={await notifyAudience(id)}
        />
      )}

      {/* --- how it got here: Activity -------------------------------- */}
      {tab === "activity" && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-15 font-semibold">Activity</h2>
          <p className="text-13 text-ink-muted max-w-[72ch]">
            Every create, change, status move and download on this job, in
            order, each entry sealed against the one before it.
          </p>
          <ActivityFeed entries={JSON.parse(JSON.stringify(audit))} />
        </section>
      )}
    </div>
  );
}

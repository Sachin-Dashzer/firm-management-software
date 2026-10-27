import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Engagement from "@/models/Engagement";
import Client from "@/models/Client";
import AuditFile from "@/models/AuditFile";
import RuleConfirmation from "@/models/RuleConfirmation";
import { formatPaise } from "@/lib/money";
import { formatISTDate } from "@/lib/dates";
import {
  AUDIT_STAGES,
  CONFIRM_KIND,
  areaProgress,
  allStandardRules,
} from "@/lib/audit-studio/standards";
import {
  exceptionCounts,
  openByArea,
  movesFrom,
  isUnresolved,
  checkStageMove,
  RISKS,
} from "@/lib/audit-studio/exceptions";
import {
  OPINION_TYPES,
  isLocked,
  readiness,
  blockingSign,
  conclusionStands,
  suggestedOpinion,
  closureClock,
  prefillFor,
} from "@/lib/audit-studio/reporting";
import {
  LEDGER_TESTS,
  testingProgress,
  flagsWithoutExceptions,
} from "@/lib/audit-studio/tests";
import { formatISTDateTime } from "@/lib/dates";
import {
  buildReport,
  reportFrom,
  diffReport,
  unwritten,
} from "@/lib/audit-studio/report700";
import AuditStudio from "./AuditStudio";
import ReportPanel from "./ReportPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit file · PHMG" };

/**
 * The report sections for this file, with what flipping each switch would
 * do to them (P3-15).
 *
 * Computed on the server rather than in the browser because the answer is
 * the standard, not the screen: the same function decides what gets signed.
 */
function structureOf(file) {
  const switches = {
    goingConcern: Boolean(file.reportSwitches?.goingConcern),
    listed: Boolean(file.reportSwitches?.listed),
    companiesAct: Boolean(file.reportSwitches?.companiesAct),
    otherInformation: Boolean(file.reportSwitches?.otherInformation),
    otherMatter: file.reportSwitches?.otherMatter ?? "",
  };
  const sections = reportFrom(file);
  const opinionType = file.opinion?.type;

  /**
   * What turning each one the other way would add or take away, in the
   * sections own words rather than as keys.
   */
  const effect = {};
  for (const key of [
    "goingConcern",
    "listed",
    "companiesAct",
    "otherInformation",
  ]) {
    const flipped = { ...switches, [key]: !switches[key], opinionType };
    const moved = diffReport({ ...switches, opinionType }, flipped);
    const titles = new Map(
      [
        ...buildReport({ ...switches, opinionType }),
        ...buildReport(flipped),
      ].map((row) => [row.key, row.title]),
    );
    effect[key] = {
      added: moved.added.map((row) => titles.get(row) ?? row),
      removed: moved.removed.map((row) => titles.get(row) ?? row),
    };
  }

  return {
    switches,
    effect,
    unwritten: unwritten(sections),
    sections: sections.map((row) => ({
      key: row.key,
      title: row.title,
      cite: row.cite,
      body: row.body ?? "",
      locked: row.locked,
      why: row.why ?? "",
    })),
  };
}

/**
 * One audit's working-paper file (P3-13).
 *
 * Its own screen rather than a panel on the engagement, because an audit
 * file is read as a file — stage by stage, area by area — and it is opened
 * two years later by somebody who does not care what the engagement's
 * billing status was.
 */
export default async function AuditFilePage({ params }) {
  const actor = await requireUser();
  const { id } = await params;

  await connectDB();
  const engagement = await Engagement.findById(id)
    .select(
      "clientId branchId assigneeId reviewerId code periodLabel period templateSnapshot status udin",
    )
    .lean();
  if (!engagement) notFound();

  const target = {
    branchId: String(engagement.branchId),
    assigneeId: String(engagement.assigneeId ?? ""),
    reviewerId: String(engagement.reviewerId ?? ""),
  };
  if (!can(actor, "view", "practice", target)) {
    redirect(`/no-access?client=${engagement.clientId}`);
  }

  const [client, file, confirmations] = await Promise.all([
    Client.findById(engagement.clientId).select("legalName tradeName").lean(),
    AuditFile.findOne({ engagementId: id }).lean(),
    RuleConfirmation.find({ kind: CONFIRM_KIND, confirmedAt: { $ne: null } })
      .select("key confirmedByName note")
      .lean(),
  ]);

  const confirmed = new Map(confirmations.map((row) => [row.key, row]));
  const openPerArea = openByArea(file?.exceptions ?? []);
  const counts = exceptionCounts(file?.exceptions ?? []);

  const view = {
    engagementId: id,
    code: engagement.code,
    service: engagement.templateSnapshot?.name ?? "Audit",
    period: engagement.periodLabel || engagement.period || "",
    client: client?.tradeName || client?.legalName || "Client",
    clientId: String(engagement.clientId),
    open: Boolean(file),
    stage: file?.stage ?? AUDIT_STAGES[0],
    stages: AUDIT_STAGES.map((stage) => ({
      name: stage,
      why: checkStageMove(stage, file?.exceptions ?? []).error ?? null,
    })),
    materiality: file?.materialityPaise
      ? formatPaise(file.materialityPaise)
      : "",
    materialityBasis: file?.materialityBasis ?? "",
    performance: file?.performanceMaterialityPaise
      ? formatPaise(file.performanceMaterialityPaise)
      : "",
    trivial: file?.trivialPaise ? formatPaise(file.trivialPaise) : "",
    counts: {
      ...counts,
      adjustments: formatPaise(counts.adjustmentsPaise),
      unadjusted: formatPaise(counts.unadjustedPaise),
    },
    areas: (file?.areas ?? []).map((area) => {
      const openHere = openPerArea.get(area.key) ?? 0;
      const progress = areaProgress(area, openHere);
      const tick = confirmed.get(area.key);
      return {
        id: String(area._id),
        key: area.key,
        name: area.name,
        standards: area.standards,
        stage: area.stage,
        ...progress,
        confirmedByName: tick?.confirmedByName ?? "",
        confirmedNote: tick?.note ?? "",
        questions: area.questions.map((row) => ({
          id: String(row._id),
          text: row.text,
          done: row.done,
          doneByName: row.doneByName ?? "",
          note: row.note ?? "",
        })),
      };
    }),
    exceptions: (file?.exceptions ?? []).map((row) => ({
      id: String(row._id),
      area: row.area,
      what: row.what,
      risk: row.risk,
      amount: row.amountPaise ? formatPaise(row.amountPaise) : "",
      state: row.state,
      unresolved: isUnresolved(row),
      explanation: row.explanation ?? "",
      declineReason: row.declineReason ?? "",
      moves: movesFrom(row.state),
      trail: (row.trail ?? []).map((step) => ({
        at: formatISTDate(step.at),
        from: step.from,
        to: step.to,
        byName: step.byName,
        reason: step.reason,
      })),
    })),
    risks: RISKS,
    /** How much of the standards index nobody has confirmed yet. */
    unconfirmed: allStandardRules().filter((rule) => !confirmed.has(rule.key))
      .length,
    totalAreas: allStandardRules().length,
  };

  /** The reporting half (P3-14), read off the same file. */
  const feeds = new Map(LEDGER_TESTS.map((test) => [test.key, test.feeds]));
  const report = file
    ? {
        locked: isLocked(file),
        signed: file.signed
          ? {
              version: file.signed.version,
              opinionType: file.signed.opinionType,
            }
          : null,
        history: (file.signedHistory ?? []).map((row) => ({
          version: row.version,
          signedAt: formatISTDate(row.signedAt),
          signedByName: row.signedByName,
          udin: row.udin,
          opinionType: row.opinionType,
          matters: row.matters ?? [],
          overall: row.overall ?? "",
        })),
        clock: closureClock(file),
        testing: testingProgress(file.tests ?? []),
        unraisedFlags: flagsWithoutExceptions(
          file.tests ?? [],
          file.exceptions ?? [],
        ),
        tests: (file.tests ?? []).map((row) => ({
          id: String(row._id),
          key: row.key,
          area: row.area,
          name: row.name,
          ref: row.ref,
          feeds: feeds.get(row.key) ?? [],
          population: row.population,
          wholePopulation: row.wholePopulation,
          flags: row.flags,
          ranAt: row.ranAt ? formatISTDate(row.ranAt) : null,
        })),
        matters: (file.exceptions ?? [])
          .filter((row) => !isUnresolved(row))
          .map((row) => ({
            id: String(row._id),
            what: row.what,
            effect: row.reportEffect ?? "",
            wording: row.reportWording ?? "",
          })),
        answers: (file.reportAnswers ?? []).map((row) => ({
          id: String(row._id),
          key: row.key,
          what: row.what,
          kind: row.kind,
          answer: row.answer,
          notApplicable: row.notApplicable,
          prefill: prefillFor(row.key, file.tests ?? [], file.exceptions ?? []),
        })),
        suggested: suggestedOpinion(file.exceptions ?? []),
        opinion: {
          type: file.opinion?.type ?? "",
          basis: file.opinion?.basis ?? "",
          emphasis: file.opinion?.emphasis ?? "",
          udin: file.opinion?.udin ?? "",
        },
        opinionTypes: OPINION_TYPES,
        overall: file.overall
          ? {
              text: file.overall.text,
              byName: file.overall.byName,
              at: file.overall.at ? formatISTDateTime(file.overall.at) : "",
            }
          : null,
        conclusionStands: conclusionStands(file),
        readiness: readiness(file),
        blocking: blockingSign(file),
        /** The report in SA 700s order, and what each switch would do (P3-15). */
        structure: structureOf(file),
      }
    : null;
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <Link
          href={`/engagements/${id}`}
          className="text-13 text-ink-muted underline underline-offset-4"
        >
          {view.service} · {view.period}
        </Link>
        <h1 className="font-display text-24 font-bold tracking-tight">
          Audit file
        </h1>
        <p className="text-13 text-ink-muted">
          <Link
            href={`/clients/${view.clientId}`}
            className="underline underline-offset-4"
          >
            {view.client}
          </Link>{" "}
          · <span className="font-mono">{view.code}</span>
        </p>
      </div>

      <AuditStudio
        file={view}
        mayEdit={can(actor, "edit", "practice", target)}
        isPartner={can(actor, "approve", "feeWriteOff")}
      />

      {report && (
        <ReportPanel
          report={report}
          engagementId={id}
          mayEdit={can(actor, "edit", "practice", target)}
          isPartner={can(actor, "approve", "feeWriteOff")}
        />
      )}
    </div>
  );
}

import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import DueDateRule from "@/models/DueDateRule";
import ServiceTemplate from "@/models/ServiceTemplate";
import { formatISTDate } from "@/lib/dates";
import { periodFor } from "@/lib/engagements/period";
import { statutoryDueFor } from "@/lib/compliance/dueDate";
import DueDates from "./DueDates";

export const metadata = { title: "Due dates · PHMG" };
export const dynamic = "force-dynamic";

/**
 * The statutory due-date master (spec section 8). Partner only.
 *
 * Each rule shows what it would produce for the current period, so the
 * person confirming it is looking at a date rather than a formula.
 */
export default async function DueDatesPage() {
  const actor = await requireUser();
  if (!can(actor, "edit", "usersSettings")) redirect("/today");

  await connectDB();
  const [rules, templates] = await Promise.all([
    DueDateRule.find({}).sort({ serviceCode: 1 }).lean(),
    ServiceTemplate.find({}).select("code name recurrence").lean(),
  ]);

  const recurrenceOf = new Map(
    templates.map((t) => [t.code, t.recurrence ?? "annual"]),
  );

  const rows = rules.map((rule) => {
    const recurrence = recurrenceOf.get(rule.serviceCode) ?? "annual";
    const period = periodFor(recurrence === "one-time" ? "annual" : recurrence);
    // show what it *would* give, so a partner can judge it before confirming
    const preview = statutoryDueFor(
      { ...rule, verifiedAt: rule.verifiedAt ?? new Date() },
      period.code,
    );

    return {
      id: String(rule._id),
      serviceCode: rule.serviceCode,
      name: rule.name,
      periodType: rule.periodType,
      formula: rule.formula,
      variants: (rule.variants ?? []).map((v) => ({
        id: String(v._id),
        match: v.match,
        note: v.note,
        formula: v.formula,
      })),
      overrides: (rule.overrides ?? []).map((o) => ({
        id: String(o._id),
        period: o.period,
        dueDate: formatISTDate(new Date(o.dueDate)),
        reason: o.reason,
        byName: o.byName,
      })),
      source: rule.source,
      sourceUrl: rule.sourceUrl,
      caution: rule.caution,
      notes: rule.notes,
      verified: Boolean(rule.verifiedAt),
      verifiedBy: rule.verifiedByName,
      verifiedOn: rule.verifiedAt ? formatISTDate(rule.verifiedAt) : null,
      samplePeriod: period.label,
      samplePeriodCode: period.code,
      sampleDate: preview.date ? formatISTDate(preview.date) : null,
      sampleWhy: preview.why ?? "",
      describes: describe(rule.formula),
    };
  });

  return (
    <DueDates rows={rows} unverified={rows.filter((r) => !r.verified).length} />
  );
}

/** The formula as a sentence, because a partner should not read JSON. */
function describe(formula) {
  if (!formula) return "No rule set.";
  if (formula.kind === "daysAfterEvent") {
    return `${formula.days} days after the ${formula.event || "event"}.`;
  }
  const day = formula.day;
  const months = formula.monthsAfter ?? 0;
  const ordinal =
    day === 1
      ? "1st"
      : day === 2
        ? "2nd"
        : day === 3
          ? "3rd"
          : day === 31
            ? "last day"
            : `${day}th`;
  if (months === 0) return `The ${ordinal} of the month the period ends.`;
  if (months === 1) return `The ${ordinal} of the following month.`;
  return `The ${ordinal} of the month ${months} months after the period ends.`;
}

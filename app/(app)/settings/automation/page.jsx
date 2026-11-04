import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import SendBatch from "@/models/SendBatch";
import MessageLog from "@/models/MessageLog";
import FirmSettings from "@/models/FirmSettings";
import { loadRules, rulesForDisplay } from "@/lib/mailer/rules";
import { TEMPLATES } from "@/lib/mailer/templates";
import { formatISTDateTime, startOfISTDay } from "@/lib/dates";
import {
  ALWAYS_APPROVE_OVER,
  MONTHLY_CAP,
  QUIET_FROM_HOUR,
  QUIET_UNTIL_HOUR,
} from "@/lib/mailer/gate";
import { clientMailFrom, mailSettings } from "@/lib/mailer/guard";
import { transportName } from "@/lib/mailer";
import { FirmWide } from "@/components/shell/ViewNote";
import AutomationBoard from "./AutomationBoard";
import SettingsScreen from "../Shell";

export const metadata = { title: "Automation runs and approvals · PHMG" };
export const dynamic = "force-dynamic";

/**
 * How automation runs (the owner's screen of 02-11-2026).
 *
 * The screen opens with **the pipeline**, because the complaint it answers
 * is not "what went out" but "what is this thing going to do behind my
 * back". Every rule in the firm goes through the same six steps, the
 * fourth of which is the gate: internal work flows, anything a client will
 * read waits for a partner unless that rule has been trusted.
 *
 * Then four figures, then the three lists that need a person — what is
 * waiting, what failed, and the log nobody can edit.
 *
 * Every limit quoted on the screen is read from `lib/mailer/gate.js`, so
 * the description and the sender cannot drift apart.
 */
export default async function AutomationPage() {
  const actor = await requireUser();
  if (!can(actor, "view", "usersSettings")) redirect("/issues");
  const mayDecide = can(actor, "approve", "feeWriteOff");

  await connectDB();

  const now = new Date();
  const dayStart = startOfISTDay(now);
  const monthStart = new Date(dayStart);
  monthStart.setDate(1);

  const [queued, log, firm, rules, runsToday, failed, autoSent] =
    await Promise.all([
      SendBatch.find({ status: "queued" })
        .sort({ createdAt: 1 })
        .limit(50)
        .lean(),
      SendBatch.find({ status: { $ne: "queued" } })
        .sort({ createdAt: -1 })
        .limit(60)
        .lean(),
      FirmSettings.findOne({ key: "firm" })
        .select(
          "automationPaused automationPausedAt clientMailOn clientMailByName clientMailAt",
        )
        .lean(),
      loadRules({ fresh: true }),
      SendBatch.countDocuments({ createdAt: { $gte: dayStart } }),
      MessageLog.find({ status: "failed" })
        .sort({ createdAt: -1 })
        .limit(25)
        .lean(),
      SendBatch.aggregate([
        { $match: { status: "auto-sent", createdAt: { $gte: monthStart } } },
        { $unwind: "$items" },
        { $match: { "items.outcome": "sent" } },
        { $count: "n" },
      ]),
    ]);

  /**
   * The recipes, in the prototype's sentence shape — *when* this happens,
   * *if* this is true, *then* we do this — built from the rule's own
   * timing and template rather than from a second list that could disagree
   * with what the sender does.
   */
  const display = rulesForDisplay(rules);
  const recipes = display.map((rule) => ({
    key: rule.key,
    audience: rule.audience,
    when: rule.timing,
    about: rule.audience === "client" ? "it is a client's" : "it is the team's",
    then: rule.what,
    to: rule.to,
    enabled: rule.enabled !== false,
    trusted: Boolean(rule.trusted),
    trustedByName: rule.trustedByName ?? "",
  }));

  return (
    <SettingsScreen
      wide
      title="Automation runs and approvals"
      sub="Every recipe goes through the same six steps. Internal work flows freely; anything a client will read waits at the gate unless a partner has trusted that recipe."
    >
      <FirmWide />

      <AutomationBoard
        queued={queued.map(shapeBatch)}
        log={log.map(shapeBatch)}
        recipes={recipes}
        failed={failed.map((row) => ({
          id: String(row._id),
          rule: TEMPLATES[row.template]?.what ?? row.template,
          to: row.sentTo || row.to,
          subject: row.subject,
          error: row.error,
          at: formatISTDateTime(row.createdAt),
        }))}
        clientMail={{
          on: clientMailFrom(firm),
          /* two things upstream of this switch that would stop the post
             anyway, so throwing it is not mistaken for being finished */
          systemOff: !mailSettings().enabled,
          noMailbox: transportName() === "log",
          /* nobody has thrown it either way, so the deployment's own
             default is still answering and the screen should say so */
          never: typeof firm?.clientMailOn !== "boolean",
          byName: firm?.clientMailByName ?? "",
          at: firm?.clientMailAt ? formatISTDateTime(firm.clientMailAt) : null,
        }}
        paused={Boolean(firm?.automationPaused)}
        pausedAt={
          firm?.automationPausedAt
            ? formatISTDateTime(firm.automationPausedAt)
            : null
        }
        mayDecide={mayDecide}
        tiles={{
          runsToday,
          waiting: queued.length,
          failed: failed.length,
          autoSent: autoSent[0]?.n ?? 0,
        }}
        limits={{
          over: ALWAYS_APPROVE_OVER,
          cap: MONTHLY_CAP,
          quietFrom: QUIET_FROM_HOUR,
          quietUntil: QUIET_UNTIL_HOUR,
        }}
      />
    </SettingsScreen>
  );
}

function shapeBatch(batch) {
  const counted = (outcome) =>
    batch.items.filter((item) => item.outcome === outcome).length;

  return {
    id: String(batch._id),
    rule: batch.rule,
    label: TEMPLATES[batch.rule]?.what ?? batch.rule,
    status: batch.status,
    why: batch.why ?? "",
    at: formatISTDateTime(batch.createdAt),
    decidedByName: batch.decidedByName ?? "",
    decidedAt: batch.decidedAt ? formatISTDateTime(batch.decidedAt) : null,
    declineReason: batch.declineReason ?? "",
    notBefore: batch.notBefore ? formatISTDateTime(batch.notBefore) : null,
    preview: batch.preview ?? null,
    total: batch.items.length,
    cappedCount: batch.cappedCount ?? 0,
    sent: counted("sent"),
    cancelled: counted("cancelled"),
    held: counted("held"),
    recipients: batch.items.map((item) => ({
      to: item.to,
      clientName: item.clientName,
      outcome: item.outcome ?? "",
      outcomeWhy: item.outcomeWhy ?? "",
    })),
  };
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import SendBatch from "@/models/SendBatch";
import FirmSettings from "@/models/FirmSettings";
import { loadRules } from "@/lib/mailer/rules";
import { TEMPLATES } from "@/lib/mailer/templates";
import { formatISTDateTime } from "@/lib/dates";
import {
  ALWAYS_APPROVE_OVER,
  MONTHLY_CAP,
  QUIET_FROM_HOUR,
  QUIET_UNTIL_HOUR,
} from "@/lib/mailer/gate";
import { FirmWide } from "@/components/shell/ViewNote";
import AutomationBoard from "./AutomationBoard";

export const metadata = { title: "Automatic messages · PHMG" };
export const dynamic = "force-dynamic";

/**
 * What the firm sends its clients without anybody pressing send (P3-10).
 *
 * The screen is in three parts and they answer three different questions:
 * what is waiting for me, which rules may run on their own, and what has
 * actually gone out. The last one is the point — it is the evidence a peer
 * reviewer reads when they ask how the firm communicates with its clients,
 * and nothing in it is ever deleted or rewritten.
 */
export default async function AutomationPage() {
  const actor = await requireUser();
  if (!can(actor, "view", "usersSettings")) redirect("/issues");
  const mayDecide = can(actor, "approve", "feeWriteOff");

  await connectDB();
  const [queued, log, firm, rules] = await Promise.all([
    SendBatch.find({ status: "queued" })
      .sort({ createdAt: 1 })
      .limit(50)
      .lean(),
    SendBatch.find({ status: { $ne: "queued" } })
      .sort({ createdAt: -1 })
      .limit(60)
      .lean(),
    FirmSettings.findOne({ key: "firm" })
      .select("automationPaused automationPausedAt")
      .lean(),
    loadRules({ fresh: true }),
  ]);

  // only the rules that can actually write to a client are trustable
  const clientRules = Object.values(rules)
    .filter((rule) => TEMPLATES[rule.key]?.audience === "client")
    .map((rule) => ({
      key: rule.key,
      label: TEMPLATES[rule.key]?.what ?? rule.key,
      to: rule.to,
      enabled: rule.enabled !== false,
      trusted: Boolean(rule.trusted),
      trustedByName: rule.trustedByName ?? "",
    }));

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-6 p-4 md:p-6">
      <div>
        <Link
          href="/settings"
          className="text-13 text-ink-muted underline underline-offset-4"
        >
          Settings
        </Link>
        <h1 className="font-display text-24 font-bold tracking-tight">
          Automatic messages
        </h1>
        <p className="text-14 text-ink-muted max-w-[70ch]">
          A rule that writes to clients does not reach them until somebody has
          either approved the batch or decided the rule can be trusted. What
          went out, and what did not, is kept below for good.
        </p>
        <FirmWide />
      </div>

      <AutomationBoard
        queued={queued.map(shapeBatch)}
        log={log.map(shapeBatch)}
        rules={clientRules}
        paused={Boolean(firm?.automationPaused)}
        pausedAt={
          firm?.automationPausedAt
            ? formatISTDateTime(firm.automationPausedAt)
            : null
        }
        mayDecide={mayDecide}
        limits={{
          over: ALWAYS_APPROVE_OVER,
          cap: MONTHLY_CAP,
          quietFrom: QUIET_FROM_HOUR,
          quietUntil: QUIET_UNTIL_HOUR,
        }}
      />
    </div>
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

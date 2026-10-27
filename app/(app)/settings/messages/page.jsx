import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import MessageLog from "@/models/MessageLog";
import { formatISTDateTime } from "@/lib/dates";
import { mailSettings, HOURLY_LIMIT } from "@/lib/mailer/guard";
import { transportName, verifyTransport } from "@/lib/mailer";
import { loadRules, rulesForDisplay } from "@/lib/mailer/rules";
import Messages from "./Messages";

export const metadata = { title: "Messages · PHMG" };
export const dynamic = "force-dynamic";

/**
 * What the system has sent, and what it has not (spec section 12).
 *
 * The held-back column is the important one: while client email is
 * switched off, messages are composed and logged but not delivered, and
 * this is where that is visible. A firm should never discover by accident
 * that a client was not told something.
 */
export default async function MessagesPage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "edit", "usersSettings")) redirect("/issues");

  const params = (await searchParams) ?? {};

  await connectDB();
  const query = params.status ? { status: params.status } : {};
  const [rows, counts, transport, rules] = await Promise.all([
    MessageLog.find(query).sort({ createdAt: -1 }).limit(200).lean(),
    MessageLog.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    verifyTransport(),
    loadRules({ fresh: true }),
  ]);

  const settings = mailSettings();

  return (
    <Messages
      rows={rows.map((row) => ({
        id: String(row._id),
        template: row.template,
        audience: row.audience,
        to: row.to,
        sentTo: row.sentTo,
        subject: row.subject,
        status: row.status,
        heldReason: row.heldReason,
        error: row.error,
        at: formatISTDateTime(row.createdAt),
      }))}
      counts={Object.fromEntries(counts.map((c) => [c._id, c.n]))}
      settings={{
        ...settings,
        transport: transportName(),
        transportOk: transport.ok,
        transportNote: transport.note,
        hourlyLimit: HOURLY_LIMIT,
      }}
      rules={rulesForDisplay(rules)}
      mayEdit={can(actor, "edit", "usersSettings")}
      status={params.status ?? ""}
    />
  );
}

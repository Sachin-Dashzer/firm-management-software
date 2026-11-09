import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import MessageLog from "@/models/MessageLog";
import Comment from "@/models/Comment";
import Client from "@/models/Client";
import ClientUser from "@/models/ClientUser";
import { formatISTDateTime } from "@/lib/dates";
import {
  mailSettings,
  clientMailAllowed,
  HOURLY_LIMIT,
} from "@/lib/mailer/guard";
import { transportName, verifyTransport } from "@/lib/mailer";
import { loadRules, rulesForDisplay } from "@/lib/mailer/rules";
import { QUIET_FROM_HOUR, QUIET_UNTIL_HOUR } from "@/lib/mailer/gate";
import { clientListFilter } from "@/lib/access/clientAccess";
import Messages from "./Messages";

export const metadata = { title: "Email and WhatsApp · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Email and WhatsApp (the owner's screen of 02-11-2026).
 *
 * Every message to and from clients in one place, in three tabs that
 * answer three different questions:
 *
 *  - **the log** — what has actually gone out, and what was held back.
 *    The held column is the important one: while client email is switched
 *    off, messages are composed and logged but not delivered, and a firm
 *    should never discover by accident that a client was not told
 *    something.
 *  - **the templates** — the wording behind each one, and the switch.
 *  - **the channels** — which address and which number the firm speaks
 *    from, when it stays quiet, and who at each client has agreed to hear
 *    from us on what.
 *
 * The figures are the system's own: the quiet hours are
 * `lib/mailer/gate.js`'s constants rather than a sentence typed here, so
 * the screen cannot describe a rule the sender does not follow.
 */

const TABS = ["log", "templates", "channels"];
const CHANNELS = ["", "whatsapp", "email", "in"];

export default async function MessagesPage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "edit", "usersSettings")) redirect("/issues");

  const params = (await searchParams) ?? {};
  const tab = TABS.includes(params.tab) ? params.tab : "log";
  const channel = CHANNELS.includes(params.ch) ? params.ch : "";
  const status = params.status ?? "";

  await connectDB();

  /** The outbound log, narrowed by whichever chip is lit. */
  const query = {
    ...(status ? { status } : {}),
    ...(channel === "whatsapp" || channel === "email" ? { channel } : {}),
  };

  const [sent, replies, counts, byChannel, transport, rules, lastSent] =
    await Promise.all([
      channel === "in"
        ? []
        : MessageLog.find(query).sort({ createdAt: -1 }).limit(120).lean(),
      // their half of the conversation: a client message is never internal
      Comment.find({ kind: { $in: ["Client message", "Change request"] } })
        .sort({ createdAt: -1 })
        .limit(channel === "in" ? 120 : 20)
        .lean(),
      MessageLog.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
      MessageLog.aggregate([{ $group: { _id: "$channel", n: { $sum: 1 } } }]),
      verifyTransport(),
      loadRules({ fresh: true }),
      /*
       * What the sender actually did, not what this screen believes it is
       * configured to do (#2). The two ran in different processes and
       * disagreed; this is the half that cannot be wrong.
       */
      MessageLog.findOne({ status: "sent" })
        .sort({ sentAt: -1 })
        .select("via sentTo to sentAt")
        .lean(),
    ]);

  /** Names for the rows that carry a client, in one query. */
  const clientIds = [
    ...new Set(
      [...sent, ...replies]
        .map((row) => String(row.clientId ?? ""))
        .filter(Boolean),
    ),
  ];
  const named = clientIds.length
    ? await Client.find({ _id: { $in: clientIds } })
        .select("legalName tradeName")
        .lean()
    : [];
  const clientName = new Map(
    named.map((row) => [String(row._id), row.tradeName || row.legalName]),
  );

  const log = [
    ...sent.map((row) => ({
      id: String(row._id),
      direction: "out",
      channel: row.channel ?? "email",
      client: clientName.get(String(row.clientId ?? "")) ?? "",
      audience: row.audience,
      /* both, when the test redirect sent it somewhere else: "we emailed
         you on the 14th" has to be checkable (#2) */
      to:
        row.sentTo && row.sentTo !== row.to
          ? `${row.sentTo} (meant for ${row.to})`
          : row.to,
      subject: row.subject,
      text: row.body,
      status: row.status,
      why: row.heldReason || row.error || "",
      at: formatISTDateTime(row.createdAt),
      sortAt: new Date(row.createdAt).getTime(),
    })),
    ...replies.map((row) => ({
      id: String(row._id),
      direction: "in",
      channel: "portal",
      client: clientName.get(String(row.clientId ?? "")) ?? "",
      audience: "client",
      to: row.createdByName,
      subject: row.kind === "Change request" ? "Change request" : "",
      text: row.body,
      status: "received",
      why: "",
      at: formatISTDateTime(row.createdAt),
      sortAt: new Date(row.createdAt).getTime(),
    })),
  ].sort((a, b) => b.sortAt - a.sortAt);

  /**
   * Who receives what, per client: the contact a document request goes to,
   * the portal account that may confirm figures, and whether we hold a
   * WhatsApp number they have not opted out of.
   */
  const clients =
    tab === "channels"
      ? await Client.find(await clientListFilter(actor))
          .select("legalName tradeName contacts status")
          .sort({ legalName: 1 })
          .limit(400)
          .lean()
      : [];

  const approvers =
    clients.length > 0
      ? await ClientUser.find({
          clientId: { $in: clients.map((row) => row._id) },
          active: true,
          mayConfirmFigures: true,
        })
          .select("clientId name designation")
          .lean()
      : [];
  const approverFor = new Map();
  for (const row of approvers) {
    const key = String(row.clientId);
    if (!approverFor.has(key)) approverFor.set(key, row);
  }

  const audience = clients.map((row) => {
    const contacts = row.contacts ?? [];
    const first = contacts.find((c) => c.primary) ?? contacts[0] ?? null;
    const approver = approverFor.get(String(row._id));
    const optedIn = contacts.filter(
      (c) => (c.whatsapp || c.mobile) && !c.whatsappOptOut,
    ).length;
    return {
      id: String(row._id),
      name: row.tradeName || row.legalName,
      requestsTo: first
        ? {
            name: first.name,
            email: first.email ?? "",
            mobile: first.whatsapp || first.mobile || "",
          }
        : null,
      approvalsTo: approver
        ? `${approver.name}${approver.designation ? ` · ${approver.designation}` : ""}`
        : "",
      email: contacts.some((c) => c.email),
      whatsapp: optedIn > 0,
      optedOut: contacts.filter((c) => c.whatsappOptOut).length,
      contacts: contacts.length,
    };
  });

  // the firm's switch, not the environment variable it used to be: see
  // `clientMailAllowed` in lib/mailer/guard.js
  const settings = {
    ...mailSettings(),
    clientsEnabled: await clientMailAllowed(),
  };
  const contactsWithWhatsapp = audience.filter((row) => row.whatsapp).length;

  return (
    <Messages
      tab={tab}
      channel={channel}
      status={status}
      log={log}
      counts={Object.fromEntries(counts.map((row) => [row._id, row.n]))}
      channels={Object.fromEntries(byChannel.map((row) => [row._id, row.n]))}
      replyCount={replies.length}
      rules={rulesForDisplay(rules)}
      audience={audience}
      settings={{
        ...settings,
        transport: transportName(),
        transportOk: transport.ok,
        transportNote: transport.note,
        hasMailbox: Boolean(process.env.SMTP_HOST),
        lastSent: lastSent
          ? {
              via: lastSent.via || "unrecorded",
              to: lastSent.sentTo || lastSent.to,
              at: formatISTDateTime(lastSent.sentAt),
            }
          : null,
        hourlyLimit: HOURLY_LIMIT,
        quietFrom: QUIET_FROM_HOUR,
        quietUntil: QUIET_UNTIL_HOUR,
        whatsappReady: false,
        contactsWithWhatsapp,
        clientCount: audience.length,
      }}
      mayEdit={can(actor, "edit", "usersSettings")}
    />
  );
}

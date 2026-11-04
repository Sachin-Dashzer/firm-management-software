import Link from "next/link";
import Chip from "@/components/ui/Chip";
import Panel from "@/components/ui/Panel";
import Segmented from "@/components/ui/Segmented";
import FilterChip from "@/components/ui/FilterChip";
import {
  TableShell,
  Table,
  Head,
  Th,
  Tr,
  Td,
  Meta,
  Empty,
} from "@/components/ui/Table";
import SettingsScreen from "../Shell";
import Rules from "./Rules";

/**
 * Email and WhatsApp, in three tabs.
 *
 * The **log** is cards rather than a table on purpose: a message has a
 * subject and a body, and the question somebody opens this screen with is
 * "what did the client actually read" — which a 40-character cell in a
 * row cannot answer. Inbound sits in the same stream, tinted and marked
 * *From*, because a reply is part of the same conversation as the thing
 * it replies to.
 *
 * **Channels** states what the firm speaks through, and it says plainly
 * where WhatsApp stands: there is no provider connected, so anything that
 * would have gone on WhatsApp goes by email. A screen that drew an
 * "Approved" chip against a template nobody can send would be the one
 * kind of untruth that matters here.
 */

const CHANNEL_LABEL = {
  email: "Email",
  whatsapp: "WhatsApp",
  portal: "Portal",
};

const STATUS_TONE = {
  sent: "good",
  received: "good",
  held: "soon",
  queued: "neutral",
  failed: "late",
};

const STATUS_WORD = {
  sent: "sent",
  received: "received",
  held: "held back",
  queued: "queued",
  failed: "failed",
};

export default function Messages({
  tab,
  channel,
  status,
  log,
  counts,
  channels,
  replyCount,
  rules,
  audience,
  settings,
  mayEdit,
}) {
  const href = (next) => {
    const query = new URLSearchParams();
    if (next.tab && next.tab !== "log") query.set("tab", next.tab);
    if (next.ch) query.set("ch", next.ch);
    if (next.status) query.set("status", next.status);
    const string = query.toString();
    return `/settings/messages${string ? `?${string}` : ""}`;
  };

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return (
    <SettingsScreen
      wide
      title="Email and WhatsApp"
      sub="Every message to and from clients in one place — sent by the rules and the monthly cycle, or by somebody from a job."
    >
      <Segmented
        label="What to look at"
        variant="underline"
        value={tab}
        items={[
          {
            key: "log",
            label: "Message log",
            href: href({ tab: "log" }),
            badge: { value: total },
          },
          {
            key: "templates",
            label: "Templates",
            href: href({ tab: "templates" }),
          },
          {
            key: "channels",
            label: "Channels and consent",
            href: href({ tab: "channels" }),
          },
        ]}
      />

      {tab === "log" && (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              {[
                ["", "All", total + replyCount],
                ["email", "Email", channels.email ?? 0],
                ["whatsapp", "WhatsApp", channels.whatsapp ?? 0],
                ["in", "Replies from clients", replyCount],
              ].map(([value, label, count]) => (
                <FilterChip
                  key={value || "all"}
                  on={channel === value}
                  href={href({ tab: "log", ch: value, status })}
                  count={count}
                >
                  {label}
                </FilterChip>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                ["", "Any state"],
                ["sent", "Sent"],
                ["held", "Held back"],
                ["queued", "Queued"],
                ["failed", "Failed"],
              ].map(([value, label]) => (
                <FilterChip
                  key={value || "any"}
                  on={status === value}
                  href={href({ tab: "log", ch: channel, status: value })}
                  count={value ? (counts[value] ?? 0) : undefined}
                >
                  {label}
                </FilterChip>
              ))}
            </div>
          </div>

          {!settings.clientsEnabled && (
            <p className="rounded-ledger border-waiting bg-waiting-wash text-13 border px-3 py-2">
              <strong>Clients are not being emailed yet.</strong> Messages to
              clients are composed and logged here but not delivered — they show
              as held back. Messages to the team{" "}
              {settings.enabled ? "are being sent" : "are switched off"}. A
              partner switches client email on from{" "}
              <Link
                href="/settings/automation"
                className="hover:text-carbon underline underline-offset-4"
              >
                Automation runs and approvals
              </Link>
              .
            </p>
          )}

          {log.length === 0 ? (
            <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border px-4 py-8 text-center">
              Nothing has been sent yet. Messages appear here when a rule fires,
              when a batch is approved, or when somebody writes to a client from
              a job.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {log.map((row) => (
                <li
                  key={row.id}
                  className={`rounded-ledger bg-surface flex flex-col gap-1 border px-3 py-2.5 ${
                    row.direction === "in"
                      ? "border-rule bg-sunk border-s-filed border-s-4"
                      : "border-rule border-s-carbon border-s-4"
                  }`}
                >
                  <div className="text-12 flex flex-wrap items-center gap-2">
                    <Chip tone={row.channel === "whatsapp" ? "good" : "info"}>
                      {CHANNEL_LABEL[row.channel] ?? row.channel}
                    </Chip>
                    <strong className="text-13">
                      {row.direction === "in" ? "From" : "To"}{" "}
                      {row.client ||
                        (row.audience === "team" ? "the team" : "a client")}
                    </strong>
                    {row.to && <span className="text-faint">{row.to}</span>}
                    <span className="ms-auto flex items-center gap-2">
                      <Chip tone={STATUS_TONE[row.status] ?? "neutral"}>
                        {STATUS_WORD[row.status] ?? row.status}
                      </Chip>
                      <span className="num text-faint">{row.at}</span>
                    </span>
                  </div>
                  {row.subject && (
                    <p className="text-14 font-semibold">{row.subject}</p>
                  )}
                  {row.text && (
                    <p className="text-13 whitespace-pre-wrap">
                      {row.text.length > 600
                        ? `${row.text.slice(0, 600)}…`
                        : row.text}
                    </p>
                  )}
                  {row.why && (
                    <p
                      className={`text-12 ${
                        row.status === "failed"
                          ? "text-redpen"
                          : "text-ink-muted"
                      }`}
                    >
                      {row.why}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tab === "templates" && (
        <>
          <Panel
            title="Every message the system can send"
            count={`${rules.length} templates`}
          >
            <TableShell>
              <Table caption="The firm's messages, what each one says and which channel it goes on">
                <Head>
                  <Th>Message</Th>
                  <Th>Channel</Th>
                  <Th>What it says</Th>
                  <Th>WhatsApp</Th>
                </Head>
                <tbody>
                  {rules.map((rule) => (
                    <Tr key={rule.key}>
                      <Td>
                        <strong className="text-14">{rule.what}</strong>
                        <Meta className="num">
                          {rule.placeholders.join(" ")}
                        </Meta>
                      </Td>
                      <Td>
                        <Chip tone="info">Email</Chip>
                        {rule.audience === "team" && (
                          <Meta>and in the inbox</Meta>
                        )}
                      </Td>
                      <Td className="text-13">
                        {rule.subject || rule.defaultSubject}
                        <Meta>
                          {rule.to} · {rule.timing}
                        </Meta>
                      </Td>
                      <Td>
                        <span className="text-ink-muted">—</span>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableShell>
            <p className="text-12 text-ink-muted">
              WhatsApp is not connected, so the column is empty rather than
              hopeful. When a provider is added, a message the firm starts has
              to use a template approved by WhatsApp beforehand — free text is
              only allowed inside the 24 hours after the client writes to us —
              and a Hindi version can sit beside each one.
            </p>
          </Panel>

          <Rules rules={rules} mayEdit={mayEdit} />
        </>
      )}

      {tab === "channels" && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Email">
              <dl className="text-13 flex flex-col gap-2">
                <Line term="Sends from" value={settings.from} />
                <Line
                  term="Delivery"
                  value={
                    settings.transport === "log"
                      ? "Nothing is actually posted — messages are written to the server log, because no mailbox is configured yet."
                      : `Through the firm's mailbox. ${settings.transportNote}`
                  }
                  tone={
                    settings.transport !== "log" && !settings.transportOk
                      ? "bad"
                      : ""
                  }
                />
                <Line
                  term="To clients"
                  value={
                    settings.clientsEnabled
                      ? "On. Messages to clients are delivered as well as logged."
                      : "Off. Composed, logged, not delivered. A partner switches it on from Settings → Automation runs and approvals."
                  }
                />
                <Line
                  term="Rate"
                  value={`At most ${settings.hourlyLimit} messages an hour, so a burst cannot get the firm's domain throttled.`}
                />
                {settings.redirectTo && (
                  <Line
                    term="Redirected"
                    value={`Everything is being sent to ${settings.redirectTo} instead of the real address — turn this off before go-live.`}
                    tone="bad"
                  />
                )}
                <Line
                  term="Attachments in"
                  value="Clients send files on the portal's upload link, not by replying to a message. A reply reaches the mailbox and is read by a person."
                />
              </dl>
            </Panel>

            <Panel title="WhatsApp">
              <dl className="text-13 flex flex-col gap-2">
                <Line
                  term="Status"
                  value="No provider connected. Anything that would go on WhatsApp is sent by email instead, and the log says which channel it went on."
                  tone="warn"
                />
                <Line
                  term="Needs"
                  value="A WhatsApp Business Platform account — Meta's Cloud API or an Indian partner — a verified firm number, and templates approved before the first message."
                />
                <Line
                  term="Quiet hours"
                  value={`${String(settings.quietFrom).padStart(2, "0")}:00–${String(
                    settings.quietUntil,
                  ).padStart(
                    2,
                    "0",
                  )}:00 IST, and Sundays. Automated messages wait rather than queue; a statutory deadline is the exception.`}
                />
                <Line
                  term="Numbers held"
                  value={`${settings.contactsWithWhatsapp} of ${settings.clientCount} clients have a contact with a number and no opt-out.`}
                />
                <Line
                  term="Opting out"
                  value="A client can stop WhatsApp without stopping email: the opt-out is per contact on their record, and the sender reads it."
                />
              </dl>
            </Panel>
          </div>

          <Panel
            title="Who receives what"
            count={`${audience.length} clients`}
            hint="From each client's own record"
          >
            <TableShell>
              <Table caption="Which contact at each client gets document requests, and who may approve figures">
                <Head>
                  <Th>Client</Th>
                  <Th>Document requests to</Th>
                  <Th>Approvals to</Th>
                  <Th>Channel</Th>
                  <Th>Consent</Th>
                </Head>
                <tbody>
                  {audience.length === 0 ? (
                    <Empty colSpan={5}>No clients yet.</Empty>
                  ) : (
                    audience.map((row) => (
                      <Tr key={row.id}>
                        <Td>{row.name}</Td>
                        <Td>
                          {row.requestsTo ? (
                            <>
                              {row.requestsTo.name}
                              <Meta>
                                {[row.requestsTo.email, row.requestsTo.mobile]
                                  .filter(Boolean)
                                  .join(" · ") || "no address or number"}
                              </Meta>
                            </>
                          ) : (
                            <span className="text-redpen">
                              Nobody — add a contact
                            </span>
                          )}
                        </Td>
                        <Td>
                          {row.approvalsTo || (
                            <span className="text-waiting">
                              Nobody may confirm figures
                            </span>
                          )}
                        </Td>
                        <Td>
                          <span className="flex flex-wrap gap-1">
                            {row.email && <Chip tone="info">Email</Chip>}
                            {row.whatsapp && (
                              <Chip tone="neutral">Number held</Chip>
                            )}
                            {!row.email && !row.whatsapp && (
                              <span className="text-redpen text-13">
                                No way to reach them
                              </span>
                            )}
                          </span>
                        </Td>
                        <Td>
                          {row.optedOut > 0 ? (
                            <Chip tone="soon">
                              {row.optedOut} opted out of WhatsApp
                            </Chip>
                          ) : (
                            <span className="text-ink-muted text-13">
                              No opt-out recorded
                            </span>
                          )}
                        </Td>
                      </Tr>
                    ))
                  )}
                </tbody>
              </Table>
            </TableShell>
            <p className="text-12 text-ink-muted">
              Consent is recorded on the client&rsquo;s own record when they are
              taken on, which is what the DPDP Act and WhatsApp&rsquo;s own
              policy ask for. A client who asks to stop keeps getting email: the
              two are separate switches, and neither is a reason to stop telling
              somebody their return was filed.
            </p>
          </Panel>
        </>
      )}
    </SettingsScreen>
  );
}

/** A term and what is true of it, as one row of a definition list. */
function Line({ term, value, tone = "" }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <dt className="text-12 text-ink-muted w-[9rem] shrink-0 uppercase">
        {term}
      </dt>
      <dd
        className={`min-w-[14rem] flex-1 ${
          tone === "bad" ? "text-redpen" : tone === "warn" ? "text-waiting" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

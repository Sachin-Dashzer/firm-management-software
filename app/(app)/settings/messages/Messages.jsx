"use client";

import Link from "next/link";
import Rules from "./Rules";

/**
 * What the system is sending, and whether it is reaching anyone.
 *
 * The top panel answers the question a partner actually has before
 * go-live: *are we emailing clients yet, and if not, why not* — in
 * sentences rather than in environment variables.
 */
export default function Messages({
  rows,
  counts,
  settings,
  rules,
  mayEdit,
  status,
}) {
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5 p-4 md:p-6">
      <div>
        <h1 className="font-display text-28 font-semibold">Messages</h1>
        <p className="text-13 text-ink-muted">
          Everything the system has sent, and everything it has held back.
        </p>
      </div>

      <section
        className={`rounded-ledger border p-4 ${
          settings.clientsEnabled
            ? "border-filed bg-filed-wash"
            : "border-waiting bg-waiting-wash"
        }`}
      >
        <p className="text-14 font-medium">
          {settings.clientsEnabled
            ? "Clients are being emailed."
            : "Clients are not being emailed yet."}
        </p>
        <ul className="text-13 mt-1 flex flex-col gap-0.5">
          <li>
            {settings.clientsEnabled
              ? "Messages to clients are delivered as well as logged."
              : "Messages to clients are composed and logged here, but not delivered. Set EMAIL_CLIENTS_ENABLED to turn them on at go-live."}
          </li>
          <li>
            Internal messages to staff{" "}
            {settings.enabled ? "are being sent" : "are switched off"}.
          </li>
          <li>
            Delivery:{" "}
            {settings.transport === "log" ? (
              <>
                nothing is actually posted — messages are written to the server
                log, because no mailbox is configured yet.
              </>
            ) : (
              <>
                through the firm&rsquo;s mailbox.{" "}
                <span className={settings.transportOk ? "" : "text-redpen"}>
                  {settings.transportNote}
                </span>
              </>
            )}
          </li>
          {settings.redirectTo && (
            <li className="text-redpen">
              Everything is being redirected to {settings.redirectTo} — turn
              this off before go-live.
            </li>
          )}
          <li className="text-ink-muted">
            Sending is limited to {settings.hourlyLimit} messages an hour, so a
            burst cannot get the firm&rsquo;s domain throttled.
          </li>
        </ul>
      </section>

      <div className="flex flex-wrap gap-2">
        {["", "sent", "held", "queued", "failed"].map((value) => (
          <Link
            key={value || "all"}
            href={
              value
                ? `/settings/messages?status=${value}`
                : "/settings/messages"
            }
            aria-current={status === value ? "page" : undefined}
            className={`rounded-ledger text-14 h-9 border px-3 leading-9 ${
              status === value
                ? "border-carbon bg-carbon-wash text-carbon"
                : "border-rule hover:bg-carbon-wash"
            }`}
          >
            {value ? value[0].toUpperCase() + value.slice(1) : "All"}
            {value && counts[value] ? ` (${counts[value]})` : ""}
          </Link>
        ))}
      </div>

      <div className="rounded-ledger border-rule bg-surface overflow-x-auto border">
        <table className="text-14 w-full">
          <thead>
            <tr className="border-rule text-12 text-ink-muted border-b text-left tracking-wide uppercase">
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">To</th>
              <th className="px-3 py-2 font-medium">Subject</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-rule border-b last:border-0">
                <td className="num text-13 px-3 py-2">{row.at}</td>
                <td className="text-13 px-3 py-2">
                  {row.to}
                  {row.sentTo && row.sentTo !== row.to && (
                    <span className="text-ink-muted"> → {row.sentTo}</span>
                  )}
                  <br />
                  <span className="text-12 text-ink-muted">{row.audience}</span>
                </td>
                <td className="px-3 py-2">{row.subject}</td>
                <td className="text-13 px-3 py-2">
                  <StatusChip status={row.status} />
                  {row.heldReason && (
                    <p className="text-12 text-ink-muted">{row.heldReason}</p>
                  )}
                  {row.error && (
                    <p className="text-12 text-redpen">{row.error}</p>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="text-ink-muted px-3 py-6 text-center"
                >
                  Nothing has been sent yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Rules rules={rules} mayEdit={mayEdit} />
    </div>
  );
}

function StatusChip({ status }) {
  const tone = {
    sent: "border-filed bg-filed-wash text-filed",
    held: "border-waiting bg-waiting-wash text-waiting",
    queued: "border-rule text-ink-muted",
    failed: "border-redpen bg-redpen-wash text-redpen",
  }[status];

  return (
    <span className={`rounded-ledger text-13 border px-2 py-0.5 ${tone}`}>
      {status}
    </span>
  );
}

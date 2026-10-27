"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveBatch,
  declineBatch,
  setRuleTrusted,
  setAutomationPaused,
} from "./actions";

/**
 * The approval queue, the trusted rules and the run log (P3-10).
 *
 * The queue shows **the first real message**, not a template with braces in
 * it: a partner approving nine letters should read the one the client will
 * read. And every recipient is named, because "9 clients" is not something
 * anybody can check.
 */

const STATUS_WORDS = {
  queued: "Waiting for a partner",
  sent: "Approved and sent",
  "auto-sent": "Sent by a trusted rule",
  declined: "Declined",
  deferred: "Waiting for business hours",
  paused: "Held by the firm-wide pause",
};

const STATUS_TONE = {
  queued: "border-waiting bg-waiting-wash text-waiting",
  sent: "border-filed bg-filed-wash text-filed",
  "auto-sent": "border-filed bg-filed-wash text-filed",
  declined: "border-rule text-ink-muted",
  deferred: "border-rule text-ink-muted",
  paused: "border-redpen bg-redpen-wash text-redpen",
};

export default function AutomationBoard({
  queued,
  log,
  rules,
  paused,
  pausedAt,
  mayDecide,
  limits,
}) {
  const router = useRouter();
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(null);
  const [declining, setDeclining] = useState(null);
  const [reason, setReason] = useState("");

  function run(action) {
    startTransition(async () => {
      const result = await action();
      setMessage(result);
      if (result?.ok) {
        setDeclining(null);
        setReason("");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {message?.ok && (
        <p
          role="status"
          className="rounded-ledger border-filed bg-filed-wash text-13 text-filed border px-3 py-2"
        >
          {message.ok}
        </p>
      )}
      {message?.error && (
        <p
          role="alert"
          className="rounded-ledger border-redpen bg-redpen-wash text-13 text-redpen border px-3 py-2"
        >
          {message.error}
        </p>
      )}

      {/* --- the pause ---------------------------------------------------- */}
      <section
        className={`rounded-ledger flex flex-wrap items-center justify-between gap-3 border p-4 ${
          paused ? "border-redpen bg-redpen-wash" : "border-rule bg-surface"
        }`}
      >
        <div>
          <h2 className="text-16 font-semibold">
            {paused
              ? "Automatic messages to clients are paused"
              : "Automatic messages to clients are running"}
          </h2>
          <p className="text-13 text-ink-muted max-w-[60ch]">
            {paused
              ? `Paused ${pausedAt}. Rules still work out what is due and it is still recorded below — nothing leaves the building.`
              : "One switch for the morning somebody notices a rule is wrong. Nothing has to be edited rule by rule."}
          </p>
        </div>
        {mayDecide && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setAutomationPaused(!paused))}
            className={`rounded-control text-14 h-9 px-3 font-medium disabled:opacity-60 ${
              paused
                ? "bg-carbon text-on-carbon"
                : "border-redpen text-redpen border"
            }`}
          >
            {paused ? "Start sending again" : "Pause everything"}
          </button>
        )}
      </section>

      {/* --- the queue ---------------------------------------------------- */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-display text-15 font-semibold">
            Waiting for you · {queued.length}
          </h2>
          <p className="text-13 text-ink-muted max-w-[70ch]">
            Approving sends them now. Each one is checked again as it goes: a
            client who has sent their documents in the meantime is not chased
            for them.
          </p>
        </div>

        {queued.length === 0 ? (
          <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border px-3 py-6 text-center">
            Nothing is waiting.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {queued.map((batch) => (
              <li
                key={batch.id}
                className="rounded-ledger border-waiting bg-surface flex flex-col gap-3 border p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="text-14 font-medium">
                      {batch.label}{" "}
                      <span className="text-ink-muted">
                        · {batch.total}{" "}
                        {batch.total === 1 ? "client" : "clients"}
                      </span>
                    </p>
                    <p className="text-12 text-ink-muted">
                      Worked out {batch.at} · {batch.why}
                    </p>
                  </div>
                  {mayDecide && declining !== batch.id && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => approveBatch(batch.id))}
                        className="rounded-control bg-carbon text-13 text-on-carbon h-8 px-3 font-medium disabled:opacity-60"
                      >
                        Approve and send
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          setDeclining(batch.id);
                          setReason("");
                        }}
                        className="rounded-control border-rule text-13 h-8 border px-3 disabled:opacity-60"
                      >
                        Decline
                      </button>
                    </div>
                  )}
                </div>

                {declining === batch.id && (
                  <div className="flex flex-col gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-12 text-ink-muted font-medium">
                        Why not? The run log is read by people.
                      </span>
                      <textarea
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        rows={2}
                        className="rounded-control border-rule bg-paper text-14 border px-2 py-1"
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={pending || reason.trim().length < 5}
                        onClick={() =>
                          run(() => declineBatch(batch.id, reason))
                        }
                        className="rounded-control bg-carbon text-13 text-on-carbon h-8 px-3 font-medium disabled:opacity-60"
                      >
                        Decline the batch
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeclining(null)}
                        className="text-13 text-ink-muted underline underline-offset-4"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {batch.preview && (
                  <div className="rounded-ledger border-rule bg-paper flex flex-col gap-1 border p-3">
                    <p className="text-12 text-ink-muted">
                      What the first of them reads — {batch.preview.to}
                    </p>
                    <p className="text-14 font-medium">
                      {batch.preview.subject}
                    </p>
                    <pre className="text-13 font-sans whitespace-pre-wrap">
                      {batch.preview.body}
                    </pre>
                  </div>
                )}

                <details>
                  <summary className="text-13 cursor-pointer">
                    Everybody it would go to ({batch.total})
                  </summary>
                  <ul className="text-13 mt-2 flex flex-col gap-1">
                    {batch.recipients.map((person) => (
                      <li key={person.to} className="flex flex-wrap gap-2">
                        <span>{person.clientName || person.to}</span>
                        <span className="text-ink-muted font-mono">
                          {person.to}
                        </span>
                        {person.outcome === "capped" && (
                          <span className="text-12 text-ink-muted">
                            — {person.outcomeWhy}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- which rules may run alone ------------------------------------ */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-display text-15 font-semibold">
            Rules you trust
          </h2>
          <p className="text-13 text-ink-muted max-w-[70ch]">
            A trusted rule sends without waiting for you. It is still not
            unlimited: anything above <strong>{limits.over} clients</strong>{" "}
            waits for a partner whatever its standing, no client gets more than{" "}
            <strong>{limits.cap} automatic messages a month</strong>, nothing
            goes out between <strong>{limits.quietFrom}:00</strong> and{" "}
            <strong>0{limits.quietUntil}:00</strong> or on a Sunday, and the
            pause above stops everything.
          </p>
        </div>

        <ul className="rounded-ledger border-rule bg-surface flex flex-col border">
          {rules.map((rule) => (
            <li
              key={rule.key}
              className="border-rule flex flex-wrap items-center justify-between gap-3 border-b p-3 last:border-0"
            >
              <div>
                <p className="text-14">
                  {rule.label}{" "}
                  {!rule.enabled && (
                    <span className="text-12 text-ink-muted">
                      · switched off
                    </span>
                  )}
                </p>
                <p className="text-12 text-ink-muted">
                  To {rule.to}
                  {rule.trusted && rule.trustedByName
                    ? ` · trusted by ${rule.trustedByName}`
                    : ""}
                </p>
              </div>
              {mayDecide ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(() => setRuleTrusted(rule.key, !rule.trusted))
                  }
                  className="rounded-control border-rule text-13 h-8 border px-3 disabled:opacity-60"
                >
                  {rule.trusted ? "Make it wait for me" : "Trust this rule"}
                </button>
              ) : (
                <span className="text-12 text-ink-muted">
                  {rule.trusted ? "Trusted" : "Waits for a partner"} · only a
                  Partner / Admin can change this
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* --- the run log -------------------------------------------------- */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-display text-15 font-semibold">Run log</h2>
            <p className="text-13 text-ink-muted max-w-[70ch]">
              Every batch this firm has proposed, what was decided and what
              actually went out. Nothing here is deleted or rewritten — it is
              what a peer reviewer reads when they ask how you talk to your
              clients.
            </p>
          </div>
          <a
            href="/settings/automation/export"
            className="rounded-control border-rule text-13 h-8 border px-3 leading-8"
          >
            Export
          </a>
        </div>

        {log.length === 0 ? (
          <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border px-3 py-6 text-center">
            Nothing has run yet.
          </p>
        ) : (
          <ul className="rounded-ledger border-rule bg-surface flex flex-col border">
            {log.map((batch) => (
              <li
                key={batch.id}
                className="border-rule flex flex-col gap-1 border-b p-3 last:border-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-chip text-12 border px-2 py-0.5 ${STATUS_TONE[batch.status] ?? "border-rule"}`}
                  >
                    {STATUS_WORDS[batch.status] ?? batch.status}
                  </span>
                  <span className="text-14">{batch.label}</span>
                  <span className="text-12 text-ink-muted num">{batch.at}</span>
                </div>
                <p className="text-13 text-ink-muted">
                  {batch.total} proposed
                  {batch.sent ? ` · ${batch.sent} sent` : ""}
                  {batch.cancelled
                    ? ` · ${batch.cancelled} no longer needed`
                    : ""}
                  {batch.held ? ` · ${batch.held} held` : ""}
                  {batch.cappedCount
                    ? ` · ${batch.cappedCount} over the monthly limit`
                    : ""}
                  {batch.decidedByName ? ` · by ${batch.decidedByName}` : ""}
                  {batch.notBefore ? ` · not before ${batch.notBefore}` : ""}
                </p>
                {batch.declineReason && (
                  <p className="text-13">Declined: {batch.declineReason}</p>
                )}
                {batch.status !== "sent" && batch.why && (
                  <p className="text-12 text-ink-muted">{batch.why}</p>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(open === batch.id ? null : batch.id)}
                  className="text-12 text-ink-muted w-fit underline underline-offset-4"
                >
                  {open === batch.id ? "Hide" : "Who it went to"}
                </button>
                {open === batch.id && (
                  <ul className="text-13 flex flex-col gap-1">
                    {batch.recipients.map((person) => (
                      <li key={person.to}>
                        {person.clientName || person.to}
                        <span className="text-ink-muted">
                          {" "}
                          — {person.outcome || "not decided"}
                          {person.outcomeWhy ? `: ${person.outcomeWhy}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

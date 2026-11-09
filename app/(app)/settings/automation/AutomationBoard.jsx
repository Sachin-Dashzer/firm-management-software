"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Result } from "@/components/ui/Notice";
import Chip from "@/components/ui/Chip";
import StatTile from "@/components/ui/StatTile";
import MailModeBanner from "@/components/ui/MailModeBanner";
import {
  approveBatch,
  declineBatch,
  setRuleTrusted,
  setRuleEnabled,
  setAutomationPaused,
  setClientMail,
  retryMessage,
} from "./actions";

/**
 * The pipeline, the figures, the queue, the failures and the log (P3-10,
 * redrawn to the owner's screen of 02-11-2026).
 *
 * The queue shows **the first real message**, not a template with braces in
 * it: a partner approving nine letters should read the one the client will
 * read. And every recipient is named, because "9 clients" is not something
 * anybody can check.
 *
 * The recipes read as sentences — *when* this happens, *if* this is true,
 * *then* this — with two switches that do different jobs: **on** is the
 * kill switch and **trusted** decides only whether a partner sees it
 * first. Both are a partner's.
 *
 * Above them are the two switches that govern the lot (04-11-2026). They
 * sit side by side because they are constantly mistaken for each other,
 * and a sentence each is the only way to tell them apart: **client email**
 * is the channel, and **the pause** is the automatic senders. Switching
 * client email on is the one control on this screen that cannot be undone
 * quietly — a letter a client has read has been read — so it asks twice.
 */

const STATUS_WORDS = {
  queued: "Waiting for a partner",
  sent: "Approved and sent",
  "auto-sent": "Sent by a trusted recipe",
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

/** The six steps every recipe goes through, in order. */
const PIPELINE = [
  ["1 Trigger", "an event, or the clock"],
  ["2 Conditions", "client, service, amount"],
  ["3 De-duplicate", "same client, same period — skip"],
  ["4 Approval gate", "anything a client reads waits"],
  ["5 Execute", "3 tries, then Failed"],
  ["6 Log", "append-only, exportable"],
];

export default function AutomationBoard({
  queued,
  log,
  recipes,
  failed,
  clientMail,
  paused,
  pausedAt,
  mayDecide,
  tiles,
  limits,
}) {
  const router = useRouter();
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(null);
  const [declining, setDeclining] = useState(null);
  const [reason, setReason] = useState("");
  const [arming, setArming] = useState(false);

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

  const quiet = `${String(limits.quietFrom).padStart(2, "0")}:00–${String(
    limits.quietUntil,
  ).padStart(2, "0")}:00`;

  return (
    <div className="flex flex-col gap-6">
      <Result message={message} />

      {/* --- the six steps ------------------------------------------------ */}
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
        <ol className="flex flex-wrap items-stretch gap-2">
          {PIPELINE.map(([step, what], index) => (
            <li
              key={step}
              className={`rounded-ledger min-w-[7.5rem] flex-1 border px-3 py-2 ${
                index === 3
                  ? "border-carbon bg-carbon-wash border-2"
                  : "border-rule"
              }`}
            >
              <span className="text-13 block font-semibold">{step}</span>
              <span className="text-12 text-ink-muted block">{what}</span>
            </li>
          ))}
        </ol>
        <p className="text-12 text-ink-muted">
          Quiet hours {quiet} IST and Sundays (a statutory deadline is the
          exception) · a send above <strong>{limits.over} clients</strong>{" "}
          always needs approval, trusted or not · at most{" "}
          <strong>{limits.cap}</strong> automated messages to one client in a
          calendar month.
        </p>
      </section>

      {/* --- the two switches over everything ----------------------------- */}
      <div className="grid items-stretch gap-3 md:grid-cols-2">
        {/* the channel: may a client be written to at all */}
        <section
          className={`rounded-ledger flex flex-col gap-3 border p-4 ${
            clientMail.on
              ? "border-rule bg-surface"
              : "border-waiting bg-waiting-wash"
          }`}
        >
          <div className="flex flex-col gap-1">
            <h2 className="text-16 font-semibold">
              {clientMail.on
                ? "Client email is on"
                : "Clients are not being emailed"}
            </h2>
            <p className="text-13 text-ink-muted">
              {clientMail.on
                ? "Messages to clients are delivered as well as logged. Every limit on this screen still applies."
                : "Messages to clients are composed and kept on the log, and nothing is delivered. Messages to the team are unaffected."}
            </p>
            {clientMail.on && clientMail.never && (
              <p className="text-12 text-ink-muted">
                Switched on by the deployment&rsquo;s own setting, not from this
                screen.
              </p>
            )}
            {clientMail.on && clientMail.at && (
              <p className="text-12 text-ink-muted">
                On since {clientMail.at}
                {clientMail.byName ? ` · ${clientMail.byName}` : ""}
              </p>
            )}
            {/* this switch is not the last word: two settings upstream of it
                would stop the post anyway, and a firm that threw it should
                not have to work out why nothing arrived */}
            {/* the banner states which of the three modes email is in; the
                switch above it is only the client half of the question */}
            <MailModeBanner
              redirectTo={clientMail.redirectTo}
              transport={clientMail.transport}
              enabled={clientMail.enabled}
            />
          </div>

          {mayDecide &&
            (arming ? (
              <div className="flex flex-col gap-2">
                <p className="text-13">
                  From now on, clients receive the invoices, reminders and
                  letters these recipes produce. Nothing already on the log is
                  sent again.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setArming(false);
                      run(() => setClientMail(true));
                    }}
                    className="rounded-control bg-carbon text-on-carbon text-14 h-9 px-4 font-medium disabled:opacity-60"
                  >
                    Yes — email clients
                  </button>
                  <button
                    type="button"
                    onClick={() => setArming(false)}
                    className="rounded-control border-rule text-14 h-9 border px-4 font-medium"
                  >
                    Not yet
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  clientMail.on
                    ? run(() => setClientMail(false))
                    : setArming(true)
                }
                className={`rounded-control text-14 mt-auto h-9 w-fit px-4 font-medium disabled:opacity-60 ${
                  clientMail.on
                    ? "border-redpen text-redpen border"
                    : "bg-carbon text-on-carbon"
                }`}
              >
                {clientMail.on
                  ? "Stop emailing clients"
                  : "Switch client email on"}
              </button>
            ))}
        </section>

        {/* the senders: is the automation running */}
        <section
          className={`rounded-ledger flex flex-col gap-3 border p-4 ${
            paused ? "border-redpen bg-redpen-wash" : "border-rule bg-surface"
          }`}
        >
          <div className="flex flex-col gap-1">
            <h2 className="text-16 font-semibold">
              {paused
                ? "Everything automatic is paused"
                : "Automation is running"}
            </h2>
            <p className="text-13 text-ink-muted">
              {paused
                ? `Paused ${pausedAt ?? ""}. Nothing automated reaches a client until this is lifted. Anything a person sends by hand still goes.`
                : "The one switch that stops every automatic message at once — for the morning a client list has gone in wrong. A person can still write by hand."}
            </p>
          </div>
          {mayDecide && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => setAutomationPaused(!paused))}
              className={`rounded-control text-14 mt-auto h-9 w-fit px-4 font-medium disabled:opacity-60 ${
                paused
                  ? "bg-carbon text-on-carbon"
                  : "border-redpen text-redpen border"
              }`}
            >
              {paused ? "Start sending again" : "Pause everything"}
            </button>
          )}
        </section>
      </div>

      {/* --- the four figures --------------------------------------------- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Runs today"
          value={tiles.runsToday}
          note="batches worked out since midnight"
          href="#run-log"
        />
        <StatTile
          label="Waiting for approval"
          value={tiles.waiting}
          note="nothing reaches a client until you decide"
          tone="soon"
          href="#queue"
        />
        <StatTile
          label="Failed"
          value={tiles.failed}
          note="tried three times and gave up"
          tone="late"
          href="#failed"
        />
        <StatTile
          label="Sent on their own"
          value={tiles.autoSent}
          note="this month, by a trusted recipe, with nobody pressing send"
          href="#recipes"
        />
      </div>

      {/* --- the queue ---------------------------------------------------- */}
      <section id="queue" className="flex scroll-mt-4 flex-col gap-3">
        <div>
          <h2 className="font-display text-15 font-semibold">
            Approval queue · {queued.length}
          </h2>
          <p className="text-13 text-ink-muted max-w-[70ch]">
            Nothing here reaches a client until you approve it. Approving sends
            them now, and each one is checked again as it goes: a client who has
            sent their documents in the meantime is not chased for them.
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

      {/* --- what failed -------------------------------------------------- */}
      <section id="failed" className="flex scroll-mt-4 flex-col gap-3">
        <div>
          <h2 className="font-display text-15 font-semibold">
            Failed runs · {failed.length}
          </h2>
          <p className="text-13 text-ink-muted max-w-[70ch]">
            The runner tries three times with a widening gap before a message
            lands here, so anything on this list failed for a reason that did
            not fix itself — usually an address. Sending it again does not
            rewrite it, and the failure stays on the record.
          </p>
        </div>

        {failed.length === 0 ? (
          <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border px-3 py-6 text-center">
            Nothing has failed.
          </p>
        ) : (
          <ul className="rounded-ledger border-rule bg-surface flex flex-col border">
            {failed.map((row) => (
              <li
                key={row.id}
                className="border-rule flex flex-wrap items-center justify-between gap-3 border-b p-3 last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-14">
                    {row.rule}
                    <span className="text-ink-muted"> · {row.to}</span>
                  </p>
                  <p className="text-12 text-redpen">{row.error}</p>
                  <p className="text-12 text-ink-muted num">{row.at}</p>
                </div>
                {mayDecide && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => retryMessage(row.id))}
                    className="rounded-control border-rule text-13 h-8 border px-3 disabled:opacity-60"
                  >
                    Send it again
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- the recipes themselves --------------------------------------- */}
      <section id="recipes" className="flex scroll-mt-4 flex-col gap-3">
        <div>
          <h2 className="font-display text-15 font-semibold">
            Recipes · {recipes.filter((r) => r.enabled).length} of{" "}
            {recipes.length} on
          </h2>
          <p className="text-13 text-ink-muted max-w-[70ch]">
            <strong>On</strong> is the kill switch: off means it runs for
            nobody. <strong>Trusted</strong> decides something narrower — that a
            partner does not read it first — and it is still bound by the limits
            above. Both are a partner&rsquo;s.
          </p>
          <p className="text-13 text-ink-muted max-w-[70ch]">
            Every rule that <strong>fires by itself</strong> — the chasers, the
            reminders, the digests — starts <strong>Off</strong>, and the firm
            turns them on one at a time once each has been watched. The ones a
            person sets off, and the bell that says work is yours, run as
            normal. Switching one on here is all that is needed; it holds from
            the next run.
          </p>
        </div>

        <ul className="rounded-ledger border-rule bg-surface flex flex-col border">
          {recipes.map((recipe) => (
            <li
              key={recipe.key}
              className="border-rule flex flex-wrap items-center justify-between gap-3 border-b p-3 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <p className="text-14">
                  <span className="text-ink-muted">When</span> {recipe.when}
                  <span className="text-ink-muted">, if</span> {recipe.about}
                  <span className="text-ink-muted">, then</span> {recipe.then}
                </p>
                <p className="text-12 text-ink-muted">
                  To {recipe.to}
                  {recipe.trusted && recipe.trustedByName
                    ? ` · trusted by ${recipe.trustedByName}`
                    : ""}
                  {!recipe.enabled && " · switched off"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {recipe.audience === "client" ? (
                  mayDecide ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(() => setRuleTrusted(recipe.key, !recipe.trusted))
                      }
                      className={`rounded-chip text-12 border px-2.5 py-1 disabled:opacity-60 ${
                        recipe.trusted
                          ? "border-filed/40 bg-filed-soft text-filed"
                          : "border-rule text-ink-muted"
                      }`}
                    >
                      {recipe.trusted ? "Trusted" : "Needs approval"}
                    </button>
                  ) : (
                    <Chip tone={recipe.trusted ? "good" : "neutral"}>
                      {recipe.trusted ? "Trusted" : "Needs approval"}
                    </Chip>
                  )
                ) : (
                  <Chip tone="neutral" title="Internal work does not wait">
                    Internal
                  </Chip>
                )}
                {mayDecide ? (
                  <button
                    type="button"
                    disabled={pending}
                    aria-pressed={recipe.enabled}
                    onClick={() =>
                      run(() => setRuleEnabled(recipe.key, !recipe.enabled))
                    }
                    className={`rounded-control text-13 h-8 border px-3 disabled:opacity-60 ${
                      recipe.enabled
                        ? "border-rule"
                        : "border-redpen text-redpen"
                    }`}
                  >
                    {recipe.enabled ? "On" : "Off"}
                  </button>
                ) : (
                  <Chip tone={recipe.enabled ? "neutral" : "late"}>
                    {recipe.enabled ? "On" : "Off"}
                  </Chip>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* --- the run log -------------------------------------------------- */}
      <section id="run-log" className="flex scroll-mt-4 flex-col gap-3">
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
            Export CSV
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

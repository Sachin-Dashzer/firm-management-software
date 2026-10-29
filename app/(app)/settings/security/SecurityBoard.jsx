"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { raiseIncident, updateIncident } from "./actions";
import { SEVERITIES, INCIDENT_STATES } from "@/lib/security/incidents";

/**
 * Breach detection and the incident log (spec section 16).
 *
 * The signals read as sentences rather than as a dashboard of gauges,
 * because every one of them needs a human judgement — "Neha revealed 31
 * client passwords this week" is either a busy filing week or something
 * serious, and only a partner knows which. Each one links to the audit
 * entries behind it.
 */
export default function SecurityBoard({ signals, counts, since, incidents }) {
  const router = useRouter();
  const [raising, setRaising] = useState(false);
  const [open, setOpen] = useState(null);
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  const live = incidents.filter((i) => i.status !== "Closed");
  const closed = incidents.filter((i) => i.status === "Closed");

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

      {/* --- what the log is showing ------------------------------------- */}
      <section className="flex flex-col gap-2">
        <div>
          <h2 className="font-display text-15 font-semibold">
            Worth a second look
          </h2>
          <p className="text-13 text-ink-muted">
            Since {since}: {counts.failures} failed sign-ins, {counts.reveals}{" "}
            portal passwords revealed, {counts.downloads} documents downloaded,
            across {counts.staff} people.
          </p>
        </div>

        {signals.length === 0 ? (
          <p className="rounded-ledger border-filed bg-filed-wash text-14 text-filed border px-3 py-2">
            Nothing stands out this week. That is the usual answer, and it is
            the one worth seeing.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {signals.map((signal) => (
              <li
                key={signal.key}
                className={`rounded-ledger border p-3 ${
                  signal.level === "serious"
                    ? "border-redpen bg-redpen-wash"
                    : "border-waiting bg-waiting-wash"
                }`}
              >
                <p className="text-14 font-medium">{signal.what}</p>
                <p className="text-13 text-ink-muted">{signal.why}</p>
                <Link
                  href={signal.href}
                  className="text-13 underline underline-offset-4"
                >
                  See the entries
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- the incident log -------------------------------------------- */}
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-display text-15 font-semibold">Incident log</h2>
            <p className="text-13 text-ink-muted">
              A laptop left on a train, a password sent over WhatsApp, an email
              that went to the wrong client. Write it down even when it came to
              nothing.
            </p>
          </div>
          {!raising && (
            <button
              type="button"
              onClick={() => setRaising(true)}
              className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium"
            >
              Record something
            </button>
          )}
        </div>

        {raising && (
          <form
            action={(formData) =>
              startTransition(async () => {
                const result = await raiseIncident(formData);
                setMessage(result);
                if (result?.ok) {
                  setRaising(false);
                  router.refresh();
                }
              })
            }
            className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4"
          >
            <label className="flex flex-col gap-1">
              <span className="text-13 font-medium">
                What happened, in one line
              </span>
              <input
                name="summary"
                required
                maxLength={200}
                placeholder="Engagement letter for the wrong client attached to an email"
                className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-13 font-medium">How serious</span>
                <select
                  name="severity"
                  defaultValue="Noted"
                  className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                >
                  {SEVERITIES.map((severity) => (
                    <option key={severity} value={severity}>
                      {severity}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-13 font-medium">When it happened</span>
                <input
                  type="date"
                  name="occurredAt"
                  className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-13 font-medium">Clients affected</span>
                <input
                  type="number"
                  name="clientsAffected"
                  min="0"
                  defaultValue="0"
                  className="rounded-control border-rule bg-paper text-14 h-9 w-28 border px-2"
                />
              </label>
            </div>

            <label className="text-14 flex items-start gap-2">
              <input
                type="checkbox"
                name="personalData"
                className="mt-1 size-4"
              />
              <span>
                Somebody&rsquo;s personal data was involved — a name, a PAN, an
                Aadhaar, a bank detail, a document.
                <span className="text-13 text-ink-muted block">
                  This is the question the DPDP Rules turn on, so it is asked
                  plainly.
                </span>
              </span>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-13 font-medium">
                The whole story, as far as it is known
              </span>
              <textarea
                name="detail"
                rows={4}
                className="rounded-control border-rule bg-paper text-14 border px-2 py-1"
              />
            </label>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={pending}
                className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium disabled:opacity-60"
              >
                {pending ? "Recording…" : "Record it"}
              </button>
              <button
                type="button"
                onClick={() => setRaising(false)}
                className="text-13 underline underline-offset-4"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {incidents.length === 0 && !raising && (
          <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border px-3 py-3">
            Nothing has been recorded. An empty log is good news only if
            everybody knows to use it.
          </p>
        )}

        {[...live, ...closed].map((incident) => (
          <article
            key={incident.id}
            className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border p-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <p className="text-14 font-medium">{incident.summary}</p>
                <p className="text-12 text-ink-muted">
                  {incident.occurredAt} · raised by {incident.by} ·{" "}
                  {incident.severity}
                  {incident.personalData && (
                    <span className="text-redpen">
                      {" "}
                      · personal data involved
                      {incident.clientsAffected > 0 &&
                        `, ${incident.clientsAffected} ${incident.clientsAffected === 1 ? "client" : "clients"}`}
                    </span>
                  )}
                </p>
              </div>
              <span
                className={`rounded-chip text-13 border px-2 py-0.5 ${
                  incident.status === "Closed"
                    ? "border-filed bg-filed-wash text-filed"
                    : incident.status === "Contained"
                      ? "border-waiting bg-waiting-wash text-waiting"
                      : "border-redpen bg-redpen-wash text-redpen"
                }`}
              >
                {incident.status}
              </span>
            </div>

            {incident.detail && (
              <p className="text-13 whitespace-pre-line">{incident.detail}</p>
            )}
            {incident.action && (
              <div className="border-rule border-l-2 pl-3">
                <p className="text-12 text-ink-muted">
                  What was done
                </p>
                <p className="text-13 whitespace-pre-line">{incident.action}</p>
              </div>
            )}
            {incident.notified && (
              <p className="text-13">
                <span className="text-ink-muted">Told: </span>
                {incident.notified}
              </p>
            )}

            {incident.status !== "Closed" && (
              <>
                {open === incident.id ? (
                  <form
                    action={(formData) =>
                      startTransition(async () => {
                        const result = await updateIncident(
                          incident.id,
                          formData,
                        );
                        setMessage(result);
                        if (result?.ok) {
                          setOpen(null);
                          router.refresh();
                        }
                      })
                    }
                    className="bg-paper rounded-ledger flex flex-col gap-2 p-3"
                  >
                    <label className="flex flex-col gap-1">
                      <span className="text-13 font-medium">
                        What has been done since
                      </span>
                      <textarea
                        name="action"
                        rows={3}
                        className="rounded-control border-rule bg-surface text-14 border px-2 py-1"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-13 font-medium">
                        Who has been told
                      </span>
                      <input
                        name="notified"
                        defaultValue={incident.notified}
                        placeholder="The client, by phone, on 18-10-2026"
                        className="rounded-control border-rule bg-surface text-14 h-9 border px-2"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-13 font-medium">Status</span>
                      <select
                        name="status"
                        defaultValue={incident.status}
                        className="rounded-control border-rule bg-surface text-14 h-9 w-44 border px-2"
                      >
                        {INCIDENT_STATES.map((state) => (
                          <option key={state} value={state}>
                            {state}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={pending}
                        className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium disabled:opacity-60"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setOpen(null)}
                        className="text-13 underline underline-offset-4"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpen(incident.id)}
                    className="text-13 self-start underline underline-offset-4"
                  >
                    Add to this
                  </button>
                )}
              </>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}

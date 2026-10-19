"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  extendPeriod,
  removeOverride,
  unverifyRule,
  updateRule,
  verifyRule,
} from "./actions";

/**
 * The due-date master (spec section 8).
 *
 * The screen is built around one question per rule: *is this right?* Each
 * card shows the date the rule would produce for the period in hand, where
 * the draft came from, and what we were unsure about — then asks for a
 * yes. Nothing drives a deadline until that yes.
 */
export default function DueDates({ rows, unverified }) {
  const router = useRouter();
  const [message, setMessage] = useState(null);
  const [open, setOpen] = useState(null);
  const [pending, startTransition] = useTransition();

  function run(action) {
    startTransition(async () => {
      setMessage(await action());
      setOpen(null);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-5 p-4 md:p-6">
      <div>
        <h1 className="font-display text-28 font-semibold">
          Statutory due dates
        </h1>
        <p className="text-13 text-ink-muted">
          What the system believes about each deadline — and whether anyone has
          checked.
        </p>
      </div>

      {unverified > 0 && (
        <div className="rounded-ledger border-waiting bg-waiting-wash flex flex-col gap-1 border p-4">
          <p className="text-14 font-medium">
            {unverified} {unverified === 1 ? "rule has" : "rules have"} not been
            confirmed.
          </p>
          <p className="text-13">
            These were drafted from tax calendars found on the web in October
            2026.{" "}
            <strong>No official notification was found for any of them.</strong>{" "}
            Until a partner confirms a rule, work on that service is still
            created on time but carries no statutory date — the system will not
            state a deadline nobody has checked.
          </p>
        </div>
      )}

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

      {rows.map((rule) => (
        <section
          key={rule.id}
          className={`rounded-ledger flex flex-col gap-3 border p-4 ${
            rule.verified
              ? "border-rule bg-surface"
              : "border-waiting bg-surface"
          }`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="font-display text-20">{rule.name}</h2>
              <p className="text-13 text-ink-muted font-mono">
                {rule.serviceCode} · {rule.periodType}
              </p>
            </div>
            {rule.verified ? (
              <span className="rounded-ledger border-filed bg-filed-wash text-13 text-filed border px-2 py-0.5">
                Confirmed by {rule.verifiedBy} on {rule.verifiedOn}
              </span>
            ) : (
              <span className="rounded-ledger border-waiting bg-waiting-wash text-waiting text-13 border px-2 py-0.5">
                Not confirmed
              </span>
            )}
          </div>

          <dl className="text-14 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            <Pair label="The rule" value={rule.describes} />
            <Pair
              label={`For ${rule.samplePeriod}`}
              value={
                rule.sampleDate ?? (
                  <span className="text-ink-muted">{rule.sampleWhy}</span>
                )
              }
              strong
            />
          </dl>

          {rule.variants.length > 0 && (
            <ul className="text-13 text-ink-muted flex flex-col gap-0.5">
              {rule.variants.map((v) => (
                <li key={v.id}>
                  Except <span className="font-mono">{v.match}</span>:{" "}
                  {v.note || "a different formula applies."}
                </li>
              ))}
            </ul>
          )}

          {rule.caution && (
            <p className="rounded-ledger border-rule bg-paper text-13 border border-dashed p-2">
              <strong>Check this:</strong> {rule.caution}
            </p>
          )}

          <p className="text-12 text-ink-muted">
            Drafted from: {rule.source}
            {rule.sourceUrl && (
              <>
                {" · "}
                <a
                  href={rule.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline underline-offset-4"
                >
                  official portal
                </a>
              </>
            )}
          </p>

          {rule.overrides.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className="text-12 text-ink-muted font-medium tracking-wide uppercase">
                Extensions recorded
              </h3>
              <ul className="flex flex-col">
                {rule.overrides.map((o) => (
                  <li
                    key={o.id}
                    className="border-rule text-13 flex flex-wrap items-center justify-between gap-2 border-b py-1 last:border-0"
                  >
                    <span>
                      <span className="font-mono">{o.period}</span> →{" "}
                      <strong>{o.dueDate}</strong>
                      <span className="text-ink-muted">
                        {" "}
                        · {o.reason} · {o.byName}
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => removeOverride(rule.id, o.id))}
                      className="underline underline-offset-4 disabled:opacity-60"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {rule.verified ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => unverifyRule(rule.id))}
                className="text-13 underline underline-offset-4 disabled:opacity-60"
              >
                Withdraw confirmation
              </button>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => verifyRule(rule.id))}
                className="rounded-ledger bg-carbon text-14 h-9 px-3 font-medium text-white disabled:opacity-60"
              >
                This is right — confirm it
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                setOpen(open === `edit-${rule.id}` ? null : `edit-${rule.id}`)
              }
              className="text-13 underline underline-offset-4"
            >
              Correct the rule
            </button>
            <button
              type="button"
              onClick={() =>
                setOpen(open === `ext-${rule.id}` ? null : `ext-${rule.id}`)
              }
              className="text-13 underline underline-offset-4"
            >
              Record an extension
            </button>
          </div>

          {open === `edit-${rule.id}` && (
            <form
              action={(formData) =>
                startTransition(async () => {
                  setMessage(await updateRule(rule.id, formData));
                  setOpen(null);
                  router.refresh();
                })
              }
              className="rounded-ledger border-rule bg-paper grid gap-3 border p-3 sm:grid-cols-3"
            >
              <label className="flex flex-col gap-1">
                <span className="text-13 text-ink-muted font-medium">
                  Worked out from
                </span>
                <select
                  name="kind"
                  defaultValue={rule.formula?.kind ?? "dayOfMonth"}
                  className="rounded-ledger border-rule bg-paper text-14 h-9 border px-2"
                >
                  <option value="dayOfMonth">A day of the month</option>
                  <option value="daysAfterEvent">Days after an event</option>
                </select>
              </label>
              <Field
                label="Day of the month"
                name="day"
                type="number"
                min={1}
                max={31}
                defaultValue={rule.formula?.day ?? ""}
              />
              <Field
                label="Months after the period ends"
                name="monthsAfter"
                type="number"
                min={0}
                max={24}
                defaultValue={rule.formula?.monthsAfter ?? 0}
              />
              <Field
                label="Event (if any)"
                name="event"
                defaultValue={rule.formula?.event ?? ""}
                placeholder="AGM"
              />
              <Field
                label="Days after the event"
                name="days"
                type="number"
                min={0}
                max={400}
                defaultValue={rule.formula?.days ?? ""}
              />
              <Field
                label="Note"
                name="notes"
                defaultValue={rule.notes}
                className="sm:col-span-3"
              />
              <div className="sm:col-span-3">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-ledger bg-carbon text-14 h-9 px-3 font-medium text-white disabled:opacity-60"
                >
                  Save the correction
                </button>
                <span className="text-12 text-ink-muted ml-3">
                  Saving marks the rule unconfirmed again.
                </span>
              </div>
            </form>
          )}

          {open === `ext-${rule.id}` && (
            <form
              action={(formData) =>
                startTransition(async () => {
                  setMessage(await extendPeriod(rule.id, formData));
                  setOpen(null);
                  router.refresh();
                })
              }
              className="rounded-ledger border-rule bg-paper grid gap-3 border p-3 sm:grid-cols-3"
            >
              <Field
                label="Period"
                name="period"
                defaultValue={rule.samplePeriodCode}
                inputClassName="font-mono"
              />
              <Field label="New due date" name="dueDate" type="date" />
              <Field
                label="Which notification?"
                name="reason"
                placeholder="CBIC Notification 12/2026"
              />
              <div className="sm:col-span-3">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-ledger bg-carbon text-14 h-9 px-3 font-medium text-white disabled:opacity-60"
                >
                  Move this period
                </button>
                <span className="text-12 text-ink-muted ml-3">
                  Every open engagement on this service and period moves with
                  it, and each change is logged.
                </span>
              </div>
            </form>
          )}
        </section>
      ))}

      {rows.length === 0 && (
        <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border p-6">
          No due-date rules yet. Run the seed script to load the draft table.
        </p>
      )}
    </div>
  );
}

function Pair({ label, value, strong = false }) {
  return (
    <div className="flex gap-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={strong ? "font-medium" : ""}>{value}</dd>
    </div>
  );
}

function Field({ label, className = "", inputClassName = "", ...rest }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-13 text-ink-muted font-medium">{label}</span>
      <input
        className={`rounded-ledger border-rule bg-paper text-14 h-9 border px-2 ${inputClassName}`}
        {...rest}
      />
    </label>
  );
}

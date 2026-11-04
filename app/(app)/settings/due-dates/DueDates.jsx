"use client";

import { saving } from "@/lib/forms/saving";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Result } from "@/components/ui/Notice";
import Notice from "@/components/ui/Notice";
import SettingsScreen from "../Shell";
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
 * The screen is built around one question per rule: *is this right?* It
 * shows the date the rule would produce for the period in hand, where the
 * draft came from, and what we were unsure about — then asks for a yes.
 * Nothing drives a deadline until that yes.
 *
 * ## The redraw of 04-11-2026
 *
 * It was eleven cards down a 1120px column, each fully expanded: the rule,
 * the sample date, the variants, the caution, the source, the recorded
 * extensions, three buttons and two collapsed forms. Eleven of those is a
 * page nobody reaches the bottom of, and the question the screen exists
 * for — *which of these has nobody confirmed?* — needed eleven separate
 * readings to answer.
 *
 * Now the eleven are a **table**, and the answer is a column. What a rule
 * says, what it would produce for the period in hand, and whether anybody
 * has signed for it are the three things on every row; everything else —
 * the source, the caution, the variants, the extensions, and the two
 * forms — opens on the row that is being questioned.
 *
 * **Unconfirmed sort first**, because an unconfirmed rule is the only kind
 * that needs anything doing. The order underneath is the service code, so
 * a rule does not move once it is confirmed except to the bottom half.
 */
export default function DueDates({ rows, unverified }) {
  const router = useRouter();
  const [message, setMessage] = useState(null);
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState(null);
  const [pending, startTransition] = useTransition();

  function run(action) {
    const answer = action();
    startTransition(async () => {
      setMessage(await answer);
      setForm(null);
      router.refresh();
    });
    // the answer goes back to the caller: a form clears itself only on a save
    return answer;
  }

  /* Unconfirmed first; the service code decides the rest. `rows` arrives
     sorted by code, so this is a stable partition rather than a re-sort. */
  const ordered = [
    ...rows.filter((r) => !r.verified),
    ...rows.filter((r) => r.verified),
  ];

  return (
    <SettingsScreen
      wide
      title="Statutory due dates"
      sub={
        rows.length ? (
          <>
            <span className="num">{rows.length}</span> rules.{" "}
            {unverified ? (
              <>
                <span className="num">{unverified}</span> of them drive no
                deadline until somebody confirms them.
              </>
            ) : (
              "Every one of them has been confirmed by a partner."
            )}
          </>
        ) : (
          "What the system believes about each deadline — and whether anyone has checked."
        )
      }
    >
      {unverified > 0 && (
        <Notice
          tone="warn"
          title={`${unverified} ${unverified === 1 ? "rule has" : "rules have"} not been confirmed.`}
        >
          <p>
            These were drafted from tax calendars found on the web in October
            2026.{" "}
            <strong>No official notification was found for any of them.</strong>{" "}
            Until a partner confirms a rule, work on that service is still
            created on time but carries no statutory date — the system will not
            state a deadline nobody has checked.
          </p>
        </Notice>
      )}

      <Result message={message} />

      <TableShell>
        <Table caption="Statutory due-date rules, unconfirmed first">
          <colgroup>
            <col className="w-[26%]" />
            <col />
            <col className="w-[18%]" />
            <col className="w-[16%]" />
          </colgroup>
          <Head>
            <Th>Service</Th>
            <Th>What the rule says</Th>
            {/* not "For Oct 2026": the sample period is worked out from
                each service's own recurrence, so a monthly rule and an
                annual one are being shown different periods and no single
                header can name them. Each cell says which. */}
            <Th rule align="right">
              What it gives
            </Th>
            <Th align="right">Confirmed</Th>
          </Head>
          <tbody>
            {ordered.length === 0 && (
              <Empty colSpan={4}>
                No due-date rules yet. Run the seed script to load the draft
                table.
              </Empty>
            )}

            {ordered.map((rule) => {
              const isOpen = open === rule.id;
              const extras = rule.variants.length + rule.overrides.length;

              return [
                /*
                 * No tint for unconfirmed. Ten of the eleven seeded rules
                 * are unconfirmed, so tinting them amber tinted the whole
                 * table and the mark stopped marking anything — the band
                 * above says it once, and the Confirmed column says it per
                 * row. The only tint left is the row being read.
                 */
                <Tr key={rule.id} tint={isOpen ? "bg-carbon-wash/60" : ""}>
                  <Td>
                    {/* the whole name is the control: a caret alone is a
                        4mm target, and the row is what somebody means to
                        open */}
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : rule.id)}
                      aria-expanded={isOpen}
                      className="text-left"
                    >
                      <span className="hover:text-carbon font-medium underline decoration-transparent underline-offset-4 transition-colors duration-150 hover:decoration-current">
                        {rule.name}
                      </span>
                      <Meta>
                        <span className="num">{rule.serviceCode}</span> ·{" "}
                        {rule.periodType}
                        {/* exceptions and recorded extensions only. The
                            caution was counted here too, and every seeded
                            rule has one — so all eleven rows read "1 note"
                            and the hint told nobody which row to open. */}
                        {extras > 0 && (
                          <>
                            {" · "}
                            <span className="num">{extras}</span>{" "}
                            {extras === 1 ? "exception" : "exceptions"}
                          </>
                        )}
                      </Meta>
                    </button>
                  </Td>
                  <Td className="text-ink-muted">{rule.describes}</Td>
                  <Td rule align="right">
                    {rule.sampleDate ? (
                      <>
                        <span className="num font-medium">
                          {rule.sampleDate}
                        </span>
                        <Meta>for {rule.samplePeriod}</Meta>
                      </>
                    ) : (
                      <>
                        <span className="text-faint">no date</span>
                        <Meta>
                          {rule.sampleWhy || `for ${rule.samplePeriod}`}
                        </Meta>
                      </>
                    )}
                  </Td>
                  <Td align="right">
                    {rule.verified ? (
                      <>
                        <span className="text-filed font-medium">Yes</span>
                        <Meta>
                          {rule.verifiedBy} ·{" "}
                          <span className="num">{rule.verifiedOn}</span>
                        </Meta>
                      </>
                    ) : (
                      <span className="text-waiting font-medium">Not yet</span>
                    )}
                  </Td>
                </Tr>,

                isOpen && (
                  <Tr key={`${rule.id}-open`}>
                    <Td colSpan={4} className="bg-sunk">
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-wrap gap-x-10 gap-y-3">
                          <Fact label="Drafted from">
                            {rule.source}
                            {rule.sourceUrl && (
                              <>
                                {" · "}
                                <a
                                  href={rule.sourceUrl}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="text-carbon hover:text-carbon-ink underline underline-offset-4"
                                >
                                  official portal
                                </a>
                              </>
                            )}
                          </Fact>
                          {rule.notes && <Fact label="Note">{rule.notes}</Fact>}
                        </div>

                        {rule.caution && (
                          <p className="border-waiting text-13 max-w-[80ch] border-s-2 ps-3">
                            <strong>Check this:</strong> {rule.caution}
                          </p>
                        )}

                        {rule.variants.length > 0 && (
                          <div className="flex flex-col gap-1">
                            <Label>Exceptions</Label>
                            <ul className="text-13 text-ink-muted flex flex-col gap-0.5">
                              {rule.variants.map((v) => (
                                <li key={v.id}>
                                  <span className="num">{v.match}</span>:{" "}
                                  {v.note || "a different formula applies."}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {rule.overrides.length > 0 && (
                          <div className="flex flex-col gap-1">
                            <Label>Extensions recorded</Label>
                            <ul className="flex flex-col">
                              {rule.overrides.map((o) => (
                                <li
                                  key={o.id}
                                  className="border-rule text-13 flex flex-wrap items-baseline justify-between gap-2 border-b py-1.5 last:border-0"
                                >
                                  <span>
                                    <span className="num">{o.period}</span>{" "}
                                    moved to{" "}
                                    <strong className="num">{o.dueDate}</strong>
                                    <span className="text-ink-muted">
                                      {" "}
                                      · {o.reason} · {o.byName}
                                    </span>
                                  </span>
                                  <button
                                    type="button"
                                    disabled={pending}
                                    onClick={() =>
                                      run(() => removeOverride(rule.id, o.id))
                                    }
                                    className="text-ink-muted hover:text-redpen underline underline-offset-4 disabled:opacity-60"
                                  >
                                    Remove
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="border-rule flex flex-wrap items-center gap-4 border-t pt-3">
                          {rule.verified ? (
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => run(() => unverifyRule(rule.id))}
                              className="text-13 text-ink-muted hover:text-redpen underline underline-offset-4 disabled:opacity-60"
                            >
                              Withdraw confirmation
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => run(() => verifyRule(rule.id))}
                              className="rounded-control bg-carbon text-14 text-on-carbon hover:bg-carbon-ink h-9 px-3 font-medium transition-colors duration-150 disabled:opacity-60"
                            >
                              {pending
                                ? "Confirming…"
                                : "This is right — confirm it"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setForm(
                                form === `edit-${rule.id}`
                                  ? null
                                  : `edit-${rule.id}`,
                              )
                            }
                            aria-expanded={form === `edit-${rule.id}`}
                            className="text-13 text-carbon hover:text-carbon-ink underline underline-offset-4"
                          >
                            Correct the rule
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setForm(
                                form === `ext-${rule.id}`
                                  ? null
                                  : `ext-${rule.id}`,
                              )
                            }
                            aria-expanded={form === `ext-${rule.id}`}
                            className="text-13 text-carbon hover:text-carbon-ink underline underline-offset-4"
                          >
                            Record an extension
                          </button>
                        </div>

                        {form === `edit-${rule.id}` && (
                          <form
                            onSubmit={saving((formData) =>
                              startTransition(async () => {
                                setMessage(await updateRule(rule.id, formData));
                                setForm(null);
                                router.refresh();
                              }),
                            )}
                            className="rounded-ledger border-rule bg-surface grid gap-3 border p-3 sm:grid-cols-3"
                          >
                            <label className="flex flex-col gap-1">
                              <span className="text-13 font-medium">
                                Worked out from
                              </span>
                              <select
                                name="kind"
                                defaultValue={
                                  rule.formula?.kind ?? "dayOfMonth"
                                }
                                className="rounded-control border-rule bg-surface text-14 focus:border-carbon h-9 border px-2 outline-none"
                              >
                                <option value="dayOfMonth">
                                  A day of the month
                                </option>
                                <option value="daysAfterEvent">
                                  Days after an event
                                </option>
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
                            <div className="flex items-center gap-3 sm:col-span-3">
                              <button
                                type="submit"
                                disabled={pending}
                                className="rounded-control bg-carbon text-14 text-on-carbon hover:bg-carbon-ink h-9 px-3 font-medium transition-colors duration-150 disabled:opacity-60"
                              >
                                {pending ? "Saving…" : "Save the correction"}
                              </button>
                              <span className="text-12 text-ink-muted">
                                Saving marks the rule unconfirmed again.
                              </span>
                            </div>
                          </form>
                        )}

                        {form === `ext-${rule.id}` && (
                          <form
                            onSubmit={saving((formData) =>
                              startTransition(async () => {
                                setMessage(
                                  await extendPeriod(rule.id, formData),
                                );
                                setForm(null);
                                router.refresh();
                              }),
                            )}
                            className="rounded-ledger border-rule bg-surface grid gap-3 border p-3 sm:grid-cols-3"
                          >
                            <Field
                              label="Period"
                              name="period"
                              defaultValue={rule.samplePeriodCode}
                              inputClassName="font-mono"
                            />
                            <Field
                              label="New due date"
                              name="dueDate"
                              type="date"
                            />
                            <Field
                              label="Which notification?"
                              name="reason"
                              placeholder="CBIC Notification 12/2026"
                            />
                            <div className="flex items-center gap-3 sm:col-span-3">
                              <button
                                type="submit"
                                disabled={pending}
                                className="rounded-control bg-carbon text-14 text-on-carbon hover:bg-carbon-ink h-9 px-3 font-medium transition-colors duration-150 disabled:opacity-60"
                              >
                                {pending ? "Moving…" : "Move this period"}
                              </button>
                              <span className="text-12 text-ink-muted">
                                Every open engagement on this service and period
                                moves with it, and each change is logged.
                              </span>
                            </div>
                          </form>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ),
              ];
            })}
          </tbody>
        </Table>
      </TableShell>
    </SettingsScreen>
  );
}

function Label({ children }) {
  return (
    <span className="text-11 text-ink-muted font-semibold tracking-wide uppercase">
      {children}
    </span>
  );
}

function Fact({ label, children }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <Label>{label}</Label>
      <span className="text-13 max-w-[60ch]">{children}</span>
    </div>
  );
}

function Field({ label, className = "", inputClassName = "", ...rest }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-13 font-medium">{label}</span>
      <input
        className={`rounded-control border-rule bg-surface text-14 focus:border-carbon h-9 border px-2 outline-none ${inputClassName}`}
        {...rest}
      />
    </label>
  );
}

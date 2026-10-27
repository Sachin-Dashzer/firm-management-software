"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addSubmission,
  fileSubmission,
  addHearing,
  recordHearing,
  saveGround,
  savePlainWords,
  addPaper,
  setStage,
  confirmLawRule,
} from "../actions";

/**
 * One matter, worked (P3-11).
 *
 * The section that matters most is **The law behind this**, and it is the
 * one that shows the least. Every rule is words and a section until a
 * partner confirms it; only then does it become a date. That is CLAUDE.md
 * rule 8 on screen: an unchecked limitation date is worse than none,
 * because a date gets diarised and then relied on.
 */
export default function NoticeMatter({
  notice,
  mayEdit,
  isPartner,
  stages,
  submissionTypes,
}) {
  const router = useRouter();
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(null);

  function run(action) {
    startTransition(async () => {
      const result = await action();
      setMessage(result);
      if (result?.ok) {
        setOpen(null);
        router.refresh();
      }
    });
  }

  const form = (action) => (formData) => run(() => action(formData));

  return (
    <div className="flex flex-col gap-5">
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

      {/* --- where it stands ------------------------------------------- */}
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-15 font-semibold">{notice.stage}</h2>
          {notice.next && (
            <p
              className={`text-14 ${notice.next.days < 0 ? "text-redpen" : ""}`}
            >
              Next: <strong>{notice.next.what}</strong> · {notice.next.date}
              {notice.next.days < 0
                ? ` — ${Math.abs(notice.next.days)} days past`
                : notice.next.days === 0
                  ? " — today"
                  : ` — in ${notice.next.days} days`}
            </p>
          )}
        </div>

        {notice.issue && <p className="text-14">{notice.issue}</p>}

        <dl className="text-13 grid gap-x-6 gap-y-1 sm:grid-cols-3">
          <Pair label="Dated" value={notice.noticeDate} />
          <Pair label="Served" value={notice.servedOn} />
          <Pair label="At stake" value={notice.stake} />
          <Pair label="Demand" value={notice.demand} />
          <Pair label="Annual return due" value={notice.annualReturnDue} />
          <Pair label="Order" value={notice.orderDate} />
          <Pair label="Working it" value={notice.assignee} />
          <Pair label="Partner" value={notice.partner} />
          <Pair label="Risk" value={notice.risk} />
        </dl>

        {mayEdit && (
          <form action={form(setStage.bind(null, notice.id))}>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-12 text-ink-muted font-medium">
                  Move it to
                </span>
                <select
                  name="stage"
                  defaultValue={notice.stage}
                  className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                >
                  {stages.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-12 text-ink-muted font-medium">
                  Order dated
                </span>
                <input
                  type="date"
                  name="orderDate"
                  max={notice.todayInput}
                  className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                />
              </label>
              <label className="flex min-w-40 flex-1 flex-col gap-1">
                <span className="text-12 text-ink-muted font-medium">
                  Demand raised
                </span>
                <input
                  name="demand"
                  inputMode="numeric"
                  className="rounded-control border-rule bg-paper num text-14 h-9 border px-2"
                />
              </label>
              <button
                type="submit"
                disabled={pending}
                className="rounded-control border-rule text-14 h-9 border px-3 disabled:opacity-60"
              >
                Save
              </button>
            </div>
          </form>
        )}
      </section>

      {/* --- the law ---------------------------------------------------- */}
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
        <div>
          <h2 className="font-display text-15 font-semibold">
            The law behind this
          </h2>
          <p className="text-13 text-ink-muted max-w-[70ch]">
            A first draft, taken from the design prototype, which carries
            &ldquo;to be verified by a practising CA before use&rdquo;
            throughout.{" "}
            <strong>
              No date is shown until a partner has read the rule and confirmed
              it
            </strong>{" "}
            — an unchecked limitation date is worse than none, because a date
            gets diarised.
          </p>
        </div>

        <ul className="flex flex-col gap-2">
          {notice.clocks.map((clock) => (
            <li
              key={clock.key}
              className={`rounded-ledger flex flex-col gap-1 border p-3 ${
                clock.confirmed
                  ? "border-rule bg-paper"
                  : "border-waiting bg-waiting-wash"
              }`}
            >
              <p className="text-14">{clock.text}</p>
              <p className="text-12 text-ink-muted font-mono">{clock.cite}</p>

              {clock.date ? (
                <p className="text-14">
                  <strong className="num">{clock.date}</strong>
                  <span className="text-12 text-ink-muted">
                    {" "}
                    · confirmed by {clock.confirmedByName}
                    {clock.confirmedNote ? ` — ${clock.confirmedNote}` : ""}
                  </span>
                </p>
              ) : (
                <p className="text-13 text-ink-muted">{clock.why}</p>
              )}

              {!clock.confirmed &&
                (isPartner ? (
                  open === clock.key ? (
                    <form
                      action={form(
                        confirmLawRule.bind(null, notice.kind, clock.key),
                      )}
                    >
                      <div className="flex flex-wrap items-end gap-2">
                        <label className="flex min-w-60 flex-1 flex-col gap-1">
                          <span className="text-12 text-ink-muted font-medium">
                            Anything to note — a proviso, a case, the date you
                            checked it to
                          </span>
                          <input
                            name="note"
                            className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                          />
                        </label>
                        <button
                          type="submit"
                          disabled={pending}
                          className="rounded-control bg-carbon text-13 text-on-carbon h-8 px-3 font-medium disabled:opacity-60"
                        >
                          I confirm this rule
                        </button>
                        <button
                          type="button"
                          onClick={() => setOpen(null)}
                          className="text-13 text-ink-muted underline underline-offset-4"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOpen(clock.key)}
                      className="rounded-control border-rule bg-paper text-13 h-8 w-fit border px-3"
                    >
                      Confirm this rule
                    </button>
                  )
                ) : (
                  <p className="text-12 text-ink-muted">
                    Only a Partner / Admin can confirm a rule of law.
                  </p>
                ))}
            </li>
          ))}
        </ul>

        {notice.adjournments.warning && (
          <p className="rounded-ledger border-waiting bg-waiting-wash text-13 border px-3 py-2">
            {notice.adjournments.warning}
          </p>
        )}
      </section>

      {/* --- submissions ------------------------------------------------ */}
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
        <div>
          <h2 className="font-display text-15 font-semibold">Submissions</h2>
          <p className="text-13 text-ink-muted">
            Each with its own date and its own acknowledgement. A submission
            nobody can evidence is a claim.
          </p>
        </div>

        {notice.submissions.length === 0 ? (
          <p className="text-13 text-ink-muted">Nothing filed or owed yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {notice.submissions.map((row) => (
              <li
                key={row.id}
                className="rounded-ledger border-rule bg-paper flex flex-col gap-2 border p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-14 font-medium">{row.type}</p>
                  <p className="text-13">
                    {row.filedOn ? (
                      <span className={row.late ? "text-redpen" : "text-filed"}>
                        Filed {row.filedOn}
                        {row.late ? " — after the date given" : ""}
                        {row.ackNo && (
                          <span className="font-mono"> · {row.ackNo}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-ink-muted">
                        Due {row.dueDate ?? "no date"}
                      </span>
                    )}
                  </p>
                </div>
                {row.note && (
                  <p className="text-13 text-ink-muted">{row.note}</p>
                )}
                {row.filedByName && (
                  <p className="text-12 text-ink-muted">
                    Recorded by {row.filedByName}
                  </p>
                )}

                {!row.filedOn && mayEdit && (
                  <form
                    action={form(fileSubmission.bind(null, notice.id, row.id))}
                  >
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-12 text-ink-muted font-medium">
                          Acknowledgement
                        </span>
                        <input
                          name="ackNo"
                          required
                          className="rounded-control border-rule bg-paper text-14 h-9 min-w-40 border px-2 font-mono"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-12 text-ink-muted font-medium">
                          Filed on
                        </span>
                        <input
                          type="date"
                          name="filedOn"
                          required
                          max={notice.todayInput}
                          defaultValue={notice.todayInput}
                          className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={pending}
                        className="rounded-control bg-carbon text-13 text-on-carbon h-9 px-3 font-medium disabled:opacity-60"
                      >
                        Record it
                      </button>
                    </div>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {mayEdit && (
          <form
            action={form(addSubmission.bind(null, notice.id))}
            className="border-rule flex flex-wrap items-end gap-2 border-t pt-3"
          >
            <label className="flex flex-col gap-1">
              <span className="text-12 text-ink-muted font-medium">
                What is owed
              </span>
              <select
                name="type"
                className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
              >
                {submissionTypes.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-12 text-ink-muted font-medium">
                By when
              </span>
              <input
                type="date"
                name="dueDate"
                className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
              />
            </label>
            <label className="flex min-w-50 flex-1 flex-col gap-1">
              <span className="text-12 text-ink-muted font-medium">
                What it covers
              </span>
              <input
                name="note"
                className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
              />
            </label>
            <button
              type="submit"
              disabled={pending}
              className="rounded-control border-rule text-14 h-9 border px-3 disabled:opacity-60"
            >
              Add
            </button>
          </form>
        )}
      </section>

      {/* --- hearings --------------------------------------------------- */}
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-15 font-semibold">Hearings</h2>
          <p className="text-13 text-ink-muted">
            {notice.adjournments.used} adjourned
            {notice.adjournments.cap !== null
              ? ` of ${notice.adjournments.cap} allowed`
              : " · the limit is not confirmed"}
          </p>
        </div>

        {notice.hearings.length === 0 ? (
          <p className="text-13 text-ink-muted">None listed.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {notice.hearings.map((row) => (
              <li
                key={row.id}
                className="rounded-ledger border-rule bg-paper flex flex-col gap-2 border p-3"
              >
                <p className="text-14">
                  {row.on}
                  {row.mode && (
                    <span className="text-ink-muted"> · {row.mode}</span>
                  )}
                </p>
                {row.heldOn ? (
                  <p className="text-13">
                    {row.adjourned ? (
                      <span className="text-waiting">
                        Adjourned {row.heldOn} — {row.adjournmentReason}
                        {row.adjournedBy ? ` (${row.adjournedBy})` : ""}
                      </span>
                    ) : (
                      <span>
                        Held {row.heldOn} — {row.outcome}
                      </span>
                    )}
                    {row.attendedByName && (
                      <span className="text-ink-muted">
                        {" "}
                        · {row.attendedByName}
                      </span>
                    )}
                  </p>
                ) : (
                  mayEdit && (
                    <form
                      action={form(recordHearing.bind(null, notice.id, row.id))}
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="flex flex-col gap-1">
                            <span className="text-12 text-ink-muted font-medium">
                              On
                            </span>
                            <input
                              type="date"
                              name="heldOn"
                              max={notice.todayInput}
                              defaultValue={notice.todayInput}
                              className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                            />
                          </label>
                          <label className="flex min-w-50 flex-1 flex-col gap-1">
                            <span className="text-12 text-ink-muted font-medium">
                              What happened
                            </span>
                            <input
                              name="outcome"
                              className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                            />
                          </label>
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="text-13 flex items-center gap-2">
                            <input type="checkbox" name="adjourned" value="1" />
                            It was put off
                          </label>
                          <label className="flex min-w-50 flex-1 flex-col gap-1">
                            <span className="text-12 text-ink-muted font-medium">
                              If so, why — the count is read with it
                            </span>
                            <input
                              name="reason"
                              className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-12 text-ink-muted font-medium">
                              Whose doing
                            </span>
                            <select
                              name="adjournedBy"
                              defaultValue=""
                              className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                            >
                              <option value="">—</option>
                              <option value="we asked">we asked</option>
                              <option value="the department">
                                the department
                              </option>
                              <option value="neither">neither</option>
                            </select>
                          </label>
                          <button
                            type="submit"
                            disabled={pending}
                            className="rounded-control bg-carbon text-13 text-on-carbon h-9 px-3 font-medium disabled:opacity-60"
                          >
                            Record
                          </button>
                        </div>
                      </div>
                    </form>
                  )
                )}
              </li>
            ))}
          </ul>
        )}

        {mayEdit && (
          <form
            action={form(addHearing.bind(null, notice.id))}
            className="border-rule flex flex-wrap items-end gap-2 border-t pt-3"
          >
            <label className="flex flex-col gap-1">
              <span className="text-12 text-ink-muted font-medium">
                Listed for
              </span>
              <input
                type="date"
                name="on"
                required
                className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-12 text-ink-muted font-medium">How</span>
              <input
                name="mode"
                placeholder="Video, or in person"
                className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
              />
            </label>
            <button
              type="submit"
              disabled={pending}
              className="rounded-control border-rule text-14 h-9 border px-3 disabled:opacity-60"
            >
              List a hearing
            </button>
          </form>
        )}
      </section>

      {/* --- grounds ---------------------------------------------------- */}
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
        <div>
          <h2 className="font-display text-15 font-semibold">
            What is in dispute
          </h2>
          <p className="text-13 text-ink-muted">
            Each point, our answer to it, and what backs the answer.
          </p>
        </div>

        {notice.grounds.length === 0 ? (
          <p className="text-13 text-ink-muted">Nothing set out yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {notice.grounds.map((row) => (
              <li
                key={row.id}
                className="rounded-ledger border-rule bg-paper flex flex-col gap-1 border p-3"
              >
                <p className="text-14 font-medium">
                  {row.point}
                  {row.settled && (
                    <span className="text-12 text-filed"> · settled</span>
                  )}
                </p>
                {row.ourGround && <p className="text-13">{row.ourGround}</p>}
                {row.evidence && (
                  <p className="text-12 text-ink-muted">
                    Backed by: {row.evidence}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        {mayEdit && (
          <form
            action={form(saveGround.bind(null, notice.id))}
            className="border-rule flex flex-col gap-2 border-t pt-3"
          >
            <input
              name="point"
              required
              placeholder="The point they are making"
              className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
            />
            <textarea
              name="ourGround"
              rows={2}
              placeholder="Our answer to it"
              className="rounded-control border-rule bg-paper text-14 border px-2 py-1"
            />
            <div className="flex flex-wrap items-end gap-2">
              <input
                name="evidence"
                placeholder="What backs it — cash book, GSTR-3B, bank statements"
                className="rounded-control border-rule bg-paper text-14 h-9 min-w-60 flex-1 border px-2"
              />
              <label className="text-13 flex items-center gap-2">
                <input type="checkbox" name="settled" value="1" />
                Settled
              </label>
              <button
                type="submit"
                disabled={pending}
                className="rounded-control border-rule text-14 h-9 border px-3 disabled:opacity-60"
              >
                Add
              </button>
            </div>
          </form>
        )}
      </section>

      {/* --- the client's words ----------------------------------------- */}
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
        <div>
          <h2 className="font-display text-15 font-semibold">
            What the client is told
          </h2>
          <p className="text-13 text-ink-muted max-w-[70ch]">
            The same matter in words they can act on: what the department
            thinks, what we are doing, and whether money is due now. Section
            numbers are refused here — they belong above.
          </p>
        </div>

        {mayEdit ? (
          <form action={form(savePlainWords.bind(null, notice.id))}>
            <div className="flex flex-col gap-2">
              <textarea
                name="plainWords"
                rows={4}
                defaultValue={notice.plainWords}
                placeholder="The department thinks ₹48.6 lakh of cash deposited in 2018-19 was not explained. We reply by 27 October with your cash book and sales records. No payment is due now."
                className="rounded-control border-rule bg-paper text-14 border px-2 py-1"
              />
              <button
                type="submit"
                disabled={pending}
                className="rounded-control border-rule text-14 h-9 w-fit border px-3 disabled:opacity-60"
              >
                Save
              </button>
            </div>
          </form>
        ) : (
          <p className="text-14">
            {notice.plainWords || "Nothing written yet."}
          </p>
        )}
      </section>

      {/* --- the bundle ------------------------------------------------- */}
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
        <div>
          <h2 className="font-display text-15 font-semibold">Paper book</h2>
          <p className="text-13 text-ink-muted max-w-[70ch]">
            The index, in the order it is to be read. Binding the PDF itself is
            not done here — this is the list you check against the bundle.
          </p>
        </div>

        {notice.paperBook.length === 0 ? (
          <p className="text-13 text-ink-muted">Nothing in the bundle yet.</p>
        ) : (
          <ol className="text-14 flex flex-col gap-1">
            {notice.paperBook.map((row) => (
              <li key={row.id} className="flex flex-wrap gap-2">
                <span className="num text-ink-muted">{row.order}.</span>
                <span>{row.name}</span>
                {row.pages && (
                  <span className="text-12 text-ink-muted num">
                    pp. {row.pages}
                  </span>
                )}
                {row.note && (
                  <span className="text-12 text-ink-muted">{row.note}</span>
                )}
              </li>
            ))}
          </ol>
        )}

        {mayEdit && (
          <form
            action={form(addPaper.bind(null, notice.id))}
            className="border-rule flex flex-wrap items-end gap-2 border-t pt-3"
          >
            <input
              name="name"
              required
              placeholder="Cash book FY 2018-19"
              className="rounded-control border-rule bg-paper text-14 h-9 min-w-50 flex-1 border px-2"
            />
            <input
              name="pages"
              placeholder="1–14"
              className="rounded-control border-rule bg-paper num text-14 h-9 w-24 border px-2"
            />
            <input
              name="note"
              placeholder="Why it is in"
              className="rounded-control border-rule bg-paper text-14 h-9 min-w-40 border px-2"
            />
            <button
              type="submit"
              disabled={pending}
              className="rounded-control border-rule text-14 h-9 border px-3 disabled:opacity-60"
            >
              Add
            </button>
          </form>
        )}
      </section>

      {/* --- the timeline ----------------------------------------------- */}
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
        <div>
          <h2 className="font-display text-15 font-semibold">
            What has happened
          </h2>
          <p className="text-13 text-ink-muted">
            The submissions, the hearings and the notice&rsquo;s own dates in
            one order. Worked out from the record rather than kept separately,
            so it cannot drift from it.
          </p>
        </div>

        <ol className="border-rule flex flex-col gap-2 border-l pl-4">
          {notice.timeline.map((row, index) => (
            <li key={`${row.at}-${index}`} className="text-14">
              <span className="num text-13 text-ink-muted">{row.at}</span>{" "}
              <span
                className={
                  row.kind === "adjourned"
                    ? "text-waiting"
                    : row.kind === "due"
                      ? "text-ink-muted"
                      : ""
                }
              >
                {row.what}
              </span>
              {row.detail && (
                <span className="text-13 text-ink-muted"> — {row.detail}</span>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Pair({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="num">{value}</dd>
    </div>
  );
}

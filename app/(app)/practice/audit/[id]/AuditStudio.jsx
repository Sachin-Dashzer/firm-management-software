"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  openAuditFile,
  setAuditQuestion,
  setMateriality,
  raiseException,
  moveAuditException,
  setAuditStage,
  confirmAuditArea,
} from "./actions";

/**
 * The audit file, worked (P3-13).
 *
 * Two things on this screen are the whole point of it.
 *
 * The working-paper index shows **per cent done and open exceptions side by
 * side**, and an area at 100% with something open does not say it is
 * complete. A bar that fills to the end while an exception sits unresolved
 * is the thing that lets a file look finished when it is not.
 *
 * And the stage buttons to **Report + UDIN** and **File closure** are
 * disabled with the count of what is still open — the P3-8 pattern, on the
 * move that matters most.
 */

const STATE_TONE = {
  Open: "border-redpen bg-redpen-wash text-redpen",
  "Asked client": "border-waiting bg-waiting-wash text-waiting",
  "With partner": "border-waiting bg-waiting-wash text-waiting",
  Proposed: "border-carbon bg-carbon-wash text-carbon",
  "Accepted by management": "border-carbon bg-carbon-wash text-carbon",
  Posted: "border-carbon bg-carbon-wash text-carbon",
  Verified: "border-filed bg-filed-wash text-filed",
  "Declined by management": "border-redpen bg-redpen-wash text-redpen",
  Explained: "border-rule text-ink-muted",
};

export default function AuditStudio({ file, mayEdit, isPartner }) {
  const router = useRouter();
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();
  /** Which area's programme is expanded. */
  const [open, setOpen] = useState(null);
  /** The one move waiting for words: `{ id, action, label, save }`. */
  const [asking, setAsking] = useState(null);

  function run(action) {
    startTransition(async () => {
      const result = await action();
      setMessage(result);
      if (result?.ok) {
        setAsking(null);
        router.refresh();
      }
    });
  }

  if (!file.open) {
    return (
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
        <h2 className="font-display text-15 font-semibold">No file yet</h2>
        <p className="text-14 max-w-[70ch]">
          Opening the file copies the firm&rsquo;s programme in as it stands
          today — ten areas and the standards each answers to. It is a copy, so
          changing the programme next year cannot reach back into a file that
          has been signed.
        </p>
        {message?.error && (
          <p role="alert" className="text-13 text-redpen">
            {message.error}
          </p>
        )}
        {mayEdit && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => openAuditFile(file.engagementId))}
            className="rounded-control bg-carbon text-14 text-on-carbon h-9 w-fit px-3 font-medium disabled:opacity-60"
          >
            Open the file
          </button>
        )}
      </section>
    );
  }

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

      {file.unconfirmed > 0 && (
        <p className="rounded-ledger border-waiting bg-waiting-wash text-13 border px-3 py-2">
          <strong>
            {file.unconfirmed} of {file.totalAreas}
          </strong>{" "}
          areas have standards nobody at the firm has confirmed. The references
          are pointers taken from the design prototype, not a statement that
          this programme complies with them — a partner reads the standard and
          confirms the area.
        </p>
      )}

      {/* --- stage ------------------------------------------------------- */}
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-15 font-semibold">{file.stage}</h2>
          <p className="text-13 text-ink-muted">
            {file.counts.open} open
            {file.counts.highOpen > 0 &&
              ` · ${file.counts.highOpen} high`} · {file.counts.resolved}{" "}
            resolved · adjustments{" "}
            <span className="num">{file.counts.adjustments}</span> · unadjusted{" "}
            <span className="num">{file.counts.unadjusted}</span>
          </p>
        </div>

        {mayEdit && (
          <div className="flex flex-wrap gap-2">
            {file.stages.map((stage) => (
              <span key={stage.name} className="flex flex-col gap-1">
                <button
                  type="button"
                  disabled={
                    pending || stage.name === file.stage || Boolean(stage.why)
                  }
                  aria-describedby={stage.why ? `why-${stage.name}` : undefined}
                  onClick={() =>
                    run(() => setAuditStage(file.engagementId, stage.name))
                  }
                  className={`rounded-control text-13 h-8 border px-3 disabled:opacity-60 ${
                    stage.name === file.stage
                      ? "border-carbon bg-carbon-wash text-carbon font-medium"
                      : "border-rule bg-paper"
                  }`}
                >
                  {stage.name}
                </button>
                {stage.why && (
                  <span
                    id={`why-${stage.name}`}
                    className="text-12 text-ink-muted max-w-[22ch]"
                  >
                    {stage.why}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* --- materiality ------------------------------------------------- */}
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
        <div>
          <h2 className="font-display text-15 font-semibold">Materiality</h2>
          <p className="text-13 text-ink-muted">
            The basis, not only the figure — a materiality nobody can explain is
            one nobody can defend.
          </p>
        </div>

        {file.materiality && (
          <p className="text-14">
            <strong className="num">{file.materiality}</strong>
            {file.performance && (
              <span className="text-ink-muted">
                {" "}
                · performance <span className="num">{file.performance}</span>
              </span>
            )}
            {file.trivial && (
              <span className="text-ink-muted">
                {" "}
                · trivial below <span className="num">{file.trivial}</span>
              </span>
            )}
            <span className="text-13 text-ink-muted block">
              {file.materialityBasis}
            </span>
          </p>
        )}

        {mayEdit && (
          <form
            action={(formData) =>
              run(() => setMateriality(file.engagementId, formData))
            }
            className="flex flex-col gap-2"
          >
            <div className="flex flex-wrap items-end gap-2">
              <Money name="materiality" label="Overall" />
              <Money name="performance" label="Performance" />
              <Money name="trivial" label="Trivial below" />
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-12 text-ink-muted font-medium">
                How it was arrived at
              </span>
              <input
                name="basis"
                required
                placeholder="1% of turnover of ₹58.2 crore, rounded down; profit is volatile this year"
                className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
              />
            </label>
            <button
              type="submit"
              disabled={pending}
              className="rounded-control border-rule text-14 h-9 w-fit border px-3 disabled:opacity-60"
            >
              Save
            </button>
          </form>
        )}
      </section>

      {/* --- the working-paper index ------------------------------------- */}
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
        <div>
          <h2 className="font-display text-15 font-semibold">Working papers</h2>
          <p className="text-13 text-ink-muted">
            Per cent done and what is open, side by side. An area with
            everything ticked and an exception still open is not complete.
          </p>
        </div>

        <ul className="flex flex-col gap-2">
          {file.areas.map((area) => (
            <li
              key={area.id}
              className="rounded-ledger border-rule bg-paper flex flex-col gap-2 border p-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-14">
                  <span className="num font-mono">{area.key}</span>{" "}
                  <strong>{area.name}</strong>
                  <span className="text-12 text-ink-muted block font-mono">
                    {area.standards}
                    {area.confirmedByName
                      ? ` · confirmed by ${area.confirmedByName}`
                      : " · not confirmed"}
                  </span>
                </p>
                <p className="text-13">
                  <span className={area.complete ? "text-filed" : ""}>
                    <span className="num">{area.percent}%</span>
                  </span>
                  {area.openExceptions > 0 && (
                    <span className="text-redpen">
                      {" "}
                      · {area.openExceptions} open
                    </span>
                  )}
                  {area.why && (
                    <span className="text-12 text-ink-muted block">
                      {area.why}
                    </span>
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setOpen(open === `area-${area.id}` ? null : `area-${area.id}`)
                }
                className="text-13 text-ink-muted w-fit underline underline-offset-4"
              >
                {open === `area-${area.id}` ? "Hide" : "The programme"}
              </button>

              {open === `area-${area.id}` && (
                <>
                  <ul className="flex flex-col gap-1">
                    {area.questions.map((question) => (
                      <li
                        key={question.id}
                        className="text-14 flex items-start gap-2"
                      >
                        <input
                          type="checkbox"
                          id={`q-${question.id}`}
                          checked={question.done}
                          disabled={!mayEdit || pending}
                          onChange={(event) =>
                            run(() =>
                              setAuditQuestion(
                                file.engagementId,
                                area.id,
                                question.id,
                                event.target.checked,
                              ),
                            )
                          }
                          className="mt-1"
                        />
                        <label htmlFor={`q-${question.id}`} className="flex-1">
                          {question.text}
                          {question.done && question.doneByName && (
                            <span className="text-12 text-ink-muted">
                              {" "}
                              · {question.doneByName}
                            </span>
                          )}
                          {question.note && (
                            <span className="text-12 text-ink-muted block">
                              {question.note}
                            </span>
                          )}
                        </label>
                      </li>
                    ))}
                  </ul>

                  {!area.confirmedByName && isPartner && (
                    <form
                      action={(formData) =>
                        run(() => confirmAuditArea(area.key, formData))
                      }
                      className="flex flex-wrap items-end gap-2"
                    >
                      <input
                        name="note"
                        placeholder="Anything to note about the programme"
                        className="rounded-control border-rule bg-paper text-14 h-8 min-w-50 flex-1 border px-2"
                      />
                      <button
                        type="submit"
                        disabled={pending}
                        className="rounded-control bg-carbon text-13 text-on-carbon h-8 px-3 font-medium disabled:opacity-60"
                      >
                        Confirm against {area.standards}
                      </button>
                    </form>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* --- exceptions -------------------------------------------------- */}
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
        <div>
          <h2 className="font-display text-15 font-semibold">
            What the audit found
          </h2>
          <p className="text-13 text-ink-muted max-w-[70ch]">
            Each one ends in one of two places: adjusted and{" "}
            <strong>verified in the revised trial balance</strong>, or{" "}
            <strong>explained</strong> by a partner with a reason. With the
            partner or with the client is not an ending.
          </p>
        </div>

        {file.exceptions.length === 0 ? (
          <p className="text-13 text-ink-muted">Nothing raised yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {file.exceptions.map((row) => (
              <li
                key={row.id}
                className="rounded-ledger border-rule bg-paper flex flex-col gap-2 border p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-14 flex-1">
                    {row.area && (
                      <span className="text-12 text-ink-muted font-mono">
                        {row.area}{" "}
                      </span>
                    )}
                    {row.what}
                    {row.amount && (
                      <span className="num text-13 text-ink-muted">
                        {" "}
                        · {row.amount}
                      </span>
                    )}
                  </p>
                  <span className="flex flex-wrap gap-2">
                    <span className="text-12 text-ink-muted">{row.risk}</span>
                    <span
                      className={`rounded-chip text-12 border px-2 py-0.5 ${STATE_TONE[row.state] ?? "border-rule"}`}
                    >
                      {row.state}
                    </span>
                  </span>
                </div>

                {row.explanation && (
                  <p className="text-13">Explained: {row.explanation}</p>
                )}
                {row.declineReason && (
                  <p className="text-13">
                    Management declined: {row.declineReason}
                  </p>
                )}

                {mayEdit && row.moves.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {asking?.id === row.id ? (
                      <form
                        action={(formData) =>
                          run(() =>
                            moveAuditException(
                              file.engagementId,
                              row.id,
                              asking.action,
                              formData,
                            ),
                          )
                        }
                        className="flex flex-col gap-2"
                      >
                        <label className="flex flex-col gap-1">
                          <span className="text-12 text-ink-muted font-medium">
                            {asking.label}
                          </span>
                          <textarea
                            name="reason"
                            rows={2}
                            autoFocus
                            className="rounded-control border-rule bg-paper text-14 border px-2 py-1"
                          />
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={pending}
                            className="rounded-control bg-carbon text-13 text-on-carbon h-8 px-3 font-medium disabled:opacity-60"
                          >
                            {asking.save}
                          </button>
                          <button
                            type="button"
                            onClick={() => setAsking(null)}
                            className="text-13 text-ink-muted underline underline-offset-4"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {row.moves.map((move) => (
                          <button
                            key={move.action}
                            type="button"
                            disabled={pending}
                            onClick={() => {
                              if (PROMPTS[move.to]) {
                                setAsking({
                                  id: row.id,
                                  action: move.action,
                                  label: PROMPTS[move.to],
                                  save: move.label,
                                });
                                return;
                              }
                              run(() =>
                                moveAuditException(
                                  file.engagementId,
                                  row.id,
                                  move.action,
                                  new FormData(),
                                ),
                              );
                            }}
                            className="rounded-control border-rule bg-paper text-13 h-8 border px-3 disabled:opacity-60"
                          >
                            {move.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {row.trail.length > 0 && (
                  <details>
                    <summary className="text-12 text-ink-muted cursor-pointer">
                      How it got here ({row.trail.length})
                    </summary>
                    <ul className="text-12 text-ink-muted mt-1 flex flex-col">
                      {row.trail.map((step, index) => (
                        <li key={index}>
                          <span className="num">{step.at}</span> · {step.from} →{" "}
                          {step.to} · {step.byName}
                          {step.reason ? ` — ${step.reason}` : ""}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}

        {mayEdit && (
          <form
            action={(formData) =>
              run(() => raiseException(file.engagementId, formData))
            }
            className="border-rule flex flex-col gap-2 border-t pt-3"
          >
            <input
              name="what"
              required
              placeholder="What was found, in enough words to be read in two years"
              className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
            />
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-12 text-ink-muted font-medium">Area</span>
                <select
                  name="area"
                  defaultValue=""
                  className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                >
                  <option value="">—</option>
                  {file.areas.map((area) => (
                    <option key={area.key} value={area.key}>
                      {area.key} · {area.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-12 text-ink-muted font-medium">Risk</span>
                <select
                  name="risk"
                  defaultValue="Medium"
                  className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                >
                  {file.risks.map((risk) => (
                    <option key={risk} value={risk}>
                      {risk}
                    </option>
                  ))}
                </select>
              </label>
              <Money name="amount" label="Effect" />
              <button
                type="submit"
                disabled={pending}
                className="rounded-control border-rule text-14 h-9 border px-3 disabled:opacity-60"
              >
                Raise it
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

/**
 * The moves that cannot happen without words, and what to ask for.
 *
 * `moveException` on the server refuses these without a reason too — that is
 * the rule — so this is the P3-8 courtesy of asking before refusing, not a
 * second copy of it.
 */
const PROMPTS = {
  Explained: "Why is this not an issue? This reason is the audit evidence.",
  "Declined by management": "What did management say?",
  "Asked client": "What is being asked for?",
};

function Money({ name, label }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-12 text-ink-muted font-medium">{label}</span>
      <input
        name={name}
        inputMode="numeric"
        className="rounded-control border-rule bg-paper num text-14 h-9 w-32 border px-2"
      />
    </label>
  );
}

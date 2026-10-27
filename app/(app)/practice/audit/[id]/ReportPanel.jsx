"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Circle } from "@phosphor-icons/react";
import {
  recordLedgerTest,
  answerClause,
  setReportEffect,
  setOpinion,
  recordOverall,
  signAuditReport,
  amendAuditReport,
  setReportStructure,
  saveReportSection,
} from "./report";

/**
 * What the firm says at the end of the audit (P3-14).
 *
 * The three layers of the opinion are shown as three separate things on
 * purpose, and in this order: what the matters suggest, what the reviewer
 * concluded, what is being signed. A system that records only the last is
 * how a qualified matter ends up under a clean opinion with nobody having
 * said anything about it.
 *
 * And when the overall conclusion has gone stale — because a matter or the
 * opinion moved since it was given — it says so and asks again, rather than
 * carrying a judgement about a file that no longer exists.
 */
/** The four switches, with the standard each one answers to (P3-15). */
const SWITCHES = [
  {
    name: "goingConcern",
    label: "There is a material uncertainty about going concern",
    cite: "SA 570 — its own section, never an emphasis of matter",
  },
  {
    name: "listed",
    label: "A listed entity — key audit matters are reported",
    cite: "SA 701",
  },
  {
    name: "companiesAct",
    label: "The s.143(3) report and the CARO annexure are required",
    cite: "Companies Act 2013",
  },
  {
    name: "otherInformation",
    label: "There is other information to report on",
    cite: "SA 720",
  },
];

export default function ReportPanel({
  report,
  engagementId,
  mayEdit,
  isPartner,
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

  const locked = report.locked;
  const editable = mayEdit && !locked;

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

      {/* --- the signed versions ---------------------------------------- */}
      {report.history.length > 0 && (
        <section className="rounded-ledger border-filed bg-filed-wash flex flex-col gap-3 border p-4">
          <h2 className="font-display text-15 font-semibold">
            {locked
              ? `Version ${report.signed.version} is signed and locked`
              : `Amendment open — this will be version ${report.history.length + 1}`}
          </h2>
          <p className="text-13 max-w-[70ch]">
            Each version is kept exactly as it was issued. A revised report does
            not replace the earlier one: the earlier one went out, somebody
            relied on it, and that stays true whatever the firm thinks now.
          </p>

          <ul className="flex flex-col gap-2">
            {report.history.map((version) => (
              <li
                key={version.version}
                className="rounded-ledger border-rule bg-paper flex flex-col gap-1 border p-3"
              >
                <p className="text-14">
                  <strong>Version {version.version}</strong> ·{" "}
                  {version.opinionType} · signed {version.signedAt} by{" "}
                  {version.signedByName}
                  <span className="text-12 text-ink-muted block font-mono">
                    UDIN {version.udin}
                  </span>
                </p>
                {version.matters.length > 0 && (
                  <ul className="text-13 text-ink-muted list-disc pl-5">
                    {version.matters.map((matter) => (
                      <li key={matter}>{matter}</li>
                    ))}
                  </ul>
                )}
                {version.overall && (
                  <p className="text-13">Conclusion: {version.overall}</p>
                )}
              </li>
            ))}
          </ul>

          {report.clock && (
            <p className="text-13 text-ink-muted">{report.clock.note}</p>
          )}

          {locked && isPartner && (
            <>
              {open === "amend" ? (
                <form
                  action={(formData) =>
                    run(() => amendAuditReport(engagementId, formData))
                  }
                  className="flex flex-col gap-2"
                >
                  <label className="flex flex-col gap-1">
                    <span className="text-12 text-ink-muted font-medium">
                      Why is the signed report being amended?
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
                      Open the amendment
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
                  onClick={() => setOpen("amend")}
                  className="rounded-control border-rule bg-paper text-13 h-8 w-fit border px-3"
                >
                  Amend the signed report
                </button>
              )}
            </>
          )}
        </section>
      )}

      {/* --- the sixteen tests ------------------------------------------ */}
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
        <div>
          <h2 className="font-display text-15 font-semibold">
            Tests over the ledger
          </h2>
          <p className="text-13 text-ink-muted max-w-[70ch]">
            This system does not hold the client&rsquo;s vouchers, so it does
            not run these — the firm&rsquo;s own tool does, and what is recorded
            here is{" "}
            <strong>what each test was run over and what it found</strong>.
            &ldquo;All 14,286 vouchers&rdquo; and &ldquo;twenty-five of
            them&rdquo; are different audits, and the file has to say which.
          </p>
          <p className="text-13">
            {report.testing.run} of {report.testing.total} run
            {report.testing.sampled > 0 && (
              <span className="text-waiting">
                {" "}
                · {report.testing.sampled} over a sample
              </span>
            )}
            {report.testing.totalFlags > 0 && (
              <span> · {report.testing.totalFlags} flagged in all</span>
            )}
            {report.testing.why && (
              <span className="text-12 text-ink-muted block">
                {report.testing.why}
              </span>
            )}
          </p>
        </div>

        {report.unraisedFlags.length > 0 && (
          <p className="rounded-ledger border-redpen bg-redpen-wash text-13 text-redpen border px-3 py-2">
            <strong>
              {report.unraisedFlags.length}{" "}
              {report.unraisedFlags.length === 1 ? "test" : "tests"} found
              something with nothing raised against{" "}
              {report.unraisedFlags.length === 1 ? "it" : "them"}
            </strong>{" "}
            —{" "}
            {report.unraisedFlags
              .map((row) => `${row.key} (${row.flags})`)
              .join(", ")}
            . That is the worst state a file can be in: it says the firm looked,
            found things, and wrote none of them down.
          </p>
        )}

        <ul className="flex flex-col gap-1">
          {report.tests.map((test) => (
            <li
              key={test.id}
              className="border-rule flex flex-col gap-1 border-b py-2 last:border-0"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-14">
                  <span className="num font-mono">{test.key}</span> {test.name}
                  <span className="text-12 text-ink-muted block font-mono">
                    {test.area} · {test.ref}
                    {test.feeds.length > 0 &&
                      ` · feeds ${test.feeds.join(", ")}`}
                  </span>
                </p>
                <p className="text-13">
                  {test.ranAt ? (
                    <>
                      <span
                        className={
                          test.flags > 0 ? "text-redpen" : "text-filed"
                        }
                      >
                        {test.flags} flagged
                      </span>
                      <span className="text-12 text-ink-muted block">
                        over {test.population}
                        {test.wholePopulation === false && " (a sample)"}
                      </span>
                    </>
                  ) : (
                    <span className="text-ink-muted">not run</span>
                  )}
                </p>
              </div>

              {editable && (
                <>
                  {open === `test-${test.id}` ? (
                    <form
                      action={(formData) =>
                        run(() =>
                          recordLedgerTest(engagementId, test.id, formData),
                        )
                      }
                      className="flex flex-wrap items-end gap-2"
                    >
                      <label className="flex flex-col gap-1">
                        <span className="text-12 text-ink-muted font-medium">
                          Run over
                        </span>
                        <input
                          name="population"
                          required
                          autoFocus
                          placeholder="14,286 vouchers"
                          className="rounded-control border-rule bg-paper text-14 h-8 border px-2"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-12 text-ink-muted font-medium">
                          All of it?
                        </span>
                        <select
                          name="whole"
                          defaultValue=""
                          required
                          className="rounded-control border-rule bg-paper text-14 h-8 border px-2"
                        >
                          <option value="">—</option>
                          <option value="yes">the whole population</option>
                          <option value="no">a sample</option>
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-12 text-ink-muted font-medium">
                          Flagged
                        </span>
                        <input
                          name="flags"
                          inputMode="numeric"
                          required
                          className="rounded-control border-rule bg-paper num text-14 h-8 w-20 border px-2"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={pending}
                        className="rounded-control bg-carbon text-13 text-on-carbon h-8 px-3 font-medium disabled:opacity-60"
                      >
                        Record
                      </button>
                      <button
                        type="button"
                        onClick={() => setOpen(null)}
                        className="text-13 text-ink-muted underline underline-offset-4"
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOpen(`test-${test.id}`)}
                      className="text-13 text-ink-muted hover:text-ink w-fit underline underline-offset-4"
                    >
                      {test.ranAt ? "Record it again" : "Record what it found"}
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* --- what carries into the report ------------------------------- */}
      {report.matters.length > 0 && (
        <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
          <div>
            <h2 className="font-display text-15 font-semibold">
              What carries into the report
            </h2>
            <p className="text-13 text-ink-muted">
              Most matters do not. Which ones do has to be said rather than
              assumed, and the words the report will carry are written here.
            </p>
          </div>

          <ul className="flex flex-col gap-2">
            {report.matters.map((row) => (
              <li
                key={row.id}
                className="rounded-ledger border-rule bg-paper flex flex-col gap-2 border p-3"
              >
                <p className="text-14">
                  {row.what}
                  {row.effect ? (
                    <span className="text-waiting"> · {row.effect}</span>
                  ) : (
                    <span className="text-12 text-ink-muted">
                      {" "}
                      · does not reach the report
                    </span>
                  )}
                </p>
                {row.wording && <p className="text-13">{row.wording}</p>}

                {editable && (
                  <form
                    action={(formData) =>
                      run(() => setReportEffect(engagementId, row.id, formData))
                    }
                    className="flex flex-wrap items-end gap-2"
                  >
                    <label className="flex flex-col gap-1">
                      <span className="text-12 text-ink-muted font-medium">
                        Effect
                      </span>
                      <select
                        name="effect"
                        defaultValue={row.effect}
                        className="rounded-control border-rule bg-paper text-14 h-8 border px-2"
                      >
                        <option value="">none</option>
                        <option value="Emphasis">Emphasis</option>
                        <option value="Qualify">Qualify</option>
                        <option value="Adverse">Adverse</option>
                      </select>
                    </label>
                    <label className="flex min-w-50 flex-1 flex-col gap-1">
                      <span className="text-12 text-ink-muted font-medium">
                        The words the report will carry
                      </span>
                      <input
                        name="wording"
                        defaultValue={row.wording}
                        className="rounded-control border-rule bg-paper text-14 h-8 border px-2"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={pending}
                      className="rounded-control border-rule text-13 h-8 border px-3 disabled:opacity-60"
                    >
                      Save
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* --- CARO and 3CD ----------------------------------------------- */}
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
        <div>
          <h2 className="font-display text-15 font-semibold">CARO and 3CD</h2>
          <p className="text-13 text-ink-muted max-w-[70ch]">
            Where a test feeds a clause, what it found is offered — so an answer
            comes off the evidence rather than out of memory. Every clause is
            still answered by a person.
          </p>
        </div>

        <ul className="flex flex-col gap-1">
          {report.answers.map((row) => (
            <li
              key={row.id}
              className="border-rule flex flex-col gap-1 border-b py-2 last:border-0"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-14 flex-1">
                  <span className="font-mono">{row.key}</span> {row.what}
                </p>
                <p className="text-13">
                  {row.notApplicable ? (
                    <span className="text-ink-muted">not applicable</span>
                  ) : row.answer ? (
                    <span className="text-filed">answered</span>
                  ) : (
                    <span className="text-redpen">unanswered</span>
                  )}
                </p>
              </div>

              {row.answer && <p className="text-13">{row.answer}</p>}

              {row.prefill && (
                <div className="rounded-control border-rule bg-paper text-12 border px-2 py-1">
                  <p className="text-ink-muted">
                    From {row.prefill.tests.join(", ")}:
                  </p>
                  <ul className="list-disc pl-4">
                    {row.prefill.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}

              {editable &&
                (open === `clause-${row.id}` ? (
                  <form
                    action={(formData) =>
                      run(() => answerClause(engagementId, row.id, formData))
                    }
                    className="flex flex-col gap-2"
                  >
                    <textarea
                      name="answer"
                      rows={2}
                      autoFocus
                      defaultValue={
                        row.answer ||
                        (row.prefill ? row.prefill.lines.join(" ") : "")
                      }
                      className="rounded-control border-rule bg-paper text-14 border px-2 py-1"
                    />
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="text-13 flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="notApplicable"
                          value="1"
                          defaultChecked={row.notApplicable}
                        />
                        Not applicable
                      </label>
                      <button
                        type="submit"
                        disabled={pending}
                        className="rounded-control bg-carbon text-13 text-on-carbon h-8 px-3 font-medium disabled:opacity-60"
                      >
                        Save
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
                    onClick={() => setOpen(`clause-${row.id}`)}
                    className="text-13 text-ink-muted hover:text-ink w-fit underline underline-offset-4"
                  >
                    {row.answer || row.notApplicable
                      ? "Change it"
                      : "Answer it"}
                  </button>
                ))}
            </li>
          ))}
        </ul>
      </section>

      {/* --- the three layers ------------------------------------------- */}
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-4 border p-4">
        <div>
          <h2 className="font-display text-15 font-semibold">The opinion</h2>
          <p className="text-13 text-ink-muted max-w-[70ch]">
            Three layers, and they are allowed to disagree. The system records
            the disagreement; resolving it is a person&rsquo;s job.
          </p>
        </div>

        <div className="rounded-ledger border-rule bg-paper flex flex-col gap-1 border p-3">
          <p className="text-12 text-ink-muted font-medium tracking-wide uppercase">
            One — what the matters suggest
          </p>
          <p className="text-14">
            {report.suggested.type ?? "Nothing yet"}
            <span className="text-13 text-ink-muted block">
              {report.suggested.why}
            </span>
          </p>
        </div>

        <div className="rounded-ledger border-rule bg-paper flex flex-col gap-2 border p-3">
          <p className="text-12 text-ink-muted font-medium tracking-wide uppercase">
            Three — the opinion being signed
          </p>
          {report.opinion.type ? (
            <p className="text-14">
              <strong>{report.opinion.type}</strong>
              {report.opinion.basis && (
                <span className="text-13 block">{report.opinion.basis}</span>
              )}
              {report.opinion.emphasis && (
                <span className="text-13 block">
                  Emphasis: {report.opinion.emphasis}
                </span>
              )}
              {report.opinion.udin && (
                <span className="text-12 text-ink-muted block font-mono">
                  UDIN {report.opinion.udin}
                </span>
              )}
            </p>
          ) : (
            <p className="text-13 text-ink-muted">Not chosen yet.</p>
          )}

          {editable && (
            <form
              action={(formData) =>
                run(() => setOpinion(engagementId, formData))
              }
              className="flex flex-col gap-2"
            >
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-12 text-ink-muted font-medium">
                    Opinion
                  </span>
                  <select
                    name="type"
                    defaultValue={report.opinion.type}
                    className="rounded-control border-rule bg-paper text-14 h-8 border px-2"
                  >
                    <option value="">—</option>
                    {report.opinionTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-12 text-ink-muted font-medium">
                    UDIN
                  </span>
                  <input
                    name="udin"
                    defaultValue={report.opinion.udin}
                    className="rounded-control border-rule bg-paper text-14 h-8 border px-2 font-mono"
                  />
                </label>
              </div>
              <input
                name="basis"
                defaultValue={report.opinion.basis}
                placeholder="Basis for the modification, in the report's own words (SA 705)"
                className="rounded-control border-rule bg-paper text-14 h-8 border px-2"
              />
              <input
                name="emphasis"
                defaultValue={report.opinion.emphasis}
                placeholder="Emphasis of matter, if any"
                className="rounded-control border-rule bg-paper text-14 h-8 border px-2"
              />
              <button
                type="submit"
                disabled={pending}
                className="rounded-control border-rule text-13 h-8 w-fit border px-3 disabled:opacity-60"
              >
                Save the opinion
              </button>
            </form>
          )}
        </div>

        <div
          className={`rounded-ledger flex flex-col gap-2 border p-3 ${
            report.conclusionStands
              ? "border-rule bg-paper"
              : "border-waiting bg-waiting-wash"
          }`}
        >
          <p className="text-12 text-ink-muted font-medium tracking-wide uppercase">
            Two — the reviewer&rsquo;s overall conclusion
          </p>
          {report.overall?.text && report.conclusionStands ? (
            <p className="text-14">
              {report.overall.text}
              <span className="text-12 text-ink-muted block">
                {report.overall.byName} · {report.overall.at}
              </span>
            </p>
          ) : (
            <p className="text-13">
              {report.overall?.text
                ? "A conclusion was recorded, but a matter or the opinion has moved since. It is about a file that no longer exists, so it has to be given again."
                : "Not recorded for this version of the file."}
            </p>
          )}

          {editable && !report.conclusionStands && (
            <form
              action={(formData) =>
                run(() => recordOverall(engagementId, formData))
              }
              className="flex flex-col gap-2"
            >
              <textarea
                name="text"
                rows={3}
                defaultValue={report.overall?.text ?? ""}
                placeholder="Taking the matters above together, and having considered them against materiality…"
                className="rounded-control border-rule bg-paper text-14 border px-2 py-1"
              />
              <button
                type="submit"
                disabled={pending}
                className="rounded-control border-rule text-13 h-8 w-fit border px-3 disabled:opacity-60"
              >
                Record the conclusion
              </button>
            </form>
          )}
        </div>
      </section>

      {/* --- the report itself, in SA 700's order (P3-15) ----------------- */}
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
        <div>
          <h2 className="font-display text-15 font-semibold">
            The report, in the order SA 700 puts it
          </h2>
          <p className="text-13 text-ink-muted max-w-[70ch]">
            The switches are not formatting. Each one adds or takes away a
            section the standards require in a fixed place, which is the thing a
            template with blanks in it gets wrong. The opinion and its basis
            come from the opinion above, so there is one answer to what the
            opinion is.
          </p>
        </div>

        {editable && (
          <form
            action={(formData) =>
              run(() => setReportStructure(engagementId, formData))
            }
            className="flex flex-col gap-2"
          >
            {SWITCHES.map((row) => {
              const moved = report.structure.effect[row.name];
              const on = report.structure.switches[row.name];
              return (
                <label key={row.name} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    name={row.name}
                    defaultChecked={on}
                    className="mt-1"
                  />
                  <span className="text-14">
                    {row.label}
                    <span className="text-12 text-ink-muted block">
                      {row.cite}
                      {moved?.added?.length
                        ? ` · turning this ${on ? "off" : "on"} adds ${moved.added.join(", ")}`
                        : ""}
                      {moved?.removed?.length
                        ? ` · turning this ${on ? "off" : "on"} removes ${moved.removed.join(", ")}`
                        : ""}
                    </span>
                  </span>
                </label>
              );
            })}

            <label className="flex flex-col gap-1">
              <span className="text-13 font-medium">
                Other matter paragraph
              </span>
              <textarea
                name="otherMatter"
                rows={2}
                defaultValue={report.structure.switches.otherMatter}
                placeholder="Something not presented in the statements that the reader needs. Not an emphasis of matter."
                className="rounded-control border-rule bg-paper text-14 border px-2 py-1"
              />
            </label>

            <button
              type="submit"
              disabled={pending}
              className="rounded-control border-rule text-13 h-8 w-fit border px-3 disabled:opacity-60"
            >
              Save the structure
            </button>
          </form>
        )}

        <ol className="flex flex-col gap-2">
          {report.structure.sections.map((section) => (
            <li
              key={section.key}
              className="rounded-ledger border-rule bg-paper flex flex-col gap-1 border px-3 py-2"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-14 font-medium">{section.title}</h3>
                <span className="text-12 text-ink-muted">
                  {section.cite}
                  {section.locked ? " · the standard's own wording" : ""}
                </span>
              </div>
              {section.why && (
                <p className="text-12 text-ink-muted">{section.why}</p>
              )}
              <p
                className={`text-14 whitespace-pre-line ${
                  section.body ? "" : "text-redpen"
                }`}
              >
                {section.body || "Not written yet."}
              </p>
              {editable && !section.locked && section.key !== "basis" && (
                <>
                  {open === `section:${section.key}` ? (
                    <form
                      action={(formData) =>
                        run(() =>
                          saveReportSection(
                            engagementId,
                            section.key,
                            formData,
                          ),
                        )
                      }
                      className="flex flex-col gap-2"
                    >
                      <textarea
                        name="body"
                        rows={3}
                        defaultValue={section.body}
                        aria-label={section.title}
                        className="rounded-control border-rule bg-paper text-14 border px-2 py-1"
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={pending}
                          className="rounded-control bg-carbon text-13 text-on-carbon h-8 px-3 font-medium disabled:opacity-60"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setOpen(null)}
                          className="rounded-control border-rule text-13 h-8 border px-3"
                        >
                          Leave it
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOpen(`section:${section.key}`)}
                      className="rounded-control border-rule text-13 h-8 w-fit border px-3"
                    >
                      {section.body ? "Rewrite" : "Write it"}
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* --- signing ----------------------------------------------------- */}
      {!locked && (
        <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
          <div>
            <h2 className="font-display text-15 font-semibold">
              {report.history.length > 0
                ? `Sign version ${report.history.length + 1}`
                : "Sign the report"}
            </h2>
            <p className="text-13 text-ink-muted">
              Everything below has to be true. The list is the same one the
              server checks, so the button and the refusal can never disagree.
            </p>
          </div>

          <ul className="flex flex-col gap-1">
            {report.readiness.map((row) => (
              <li key={row.what} className="text-14 flex items-start gap-2">
                {row.ok ? (
                  <Check
                    size={16}
                    aria-hidden
                    className="text-filed mt-0.5 shrink-0"
                  />
                ) : (
                  <Circle
                    size={16}
                    aria-hidden
                    className="text-redpen mt-0.5 shrink-0"
                  />
                )}
                <span className={row.ok ? "" : "text-redpen"}>{row.what}</span>
              </li>
            ))}
          </ul>

          {isPartner ? (
            <form
              action={(formData) =>
                run(() => signAuditReport(engagementId, formData))
              }
              className="flex flex-col gap-2"
            >
              <p className="text-13 text-ink-muted max-w-[70ch]">
                What is signed is the report above, assembled in the
                standard&rsquo;s order and kept exactly as it was issued. A
                section the standard puts in this report that nobody has written
                is refused.
                {report.structure.unwritten.length > 0 && (
                  <strong className="text-redpen block">
                    Still to write: {report.structure.unwritten.join("; ")}.
                  </strong>
                )}
              </p>
              <span className="flex flex-col gap-1">
                <button
                  type="submit"
                  disabled={
                    pending ||
                    report.blocking.length > 0 ||
                    report.structure.unwritten.length > 0
                  }
                  aria-describedby={
                    report.blocking.length > 0 ? "sign-why" : undefined
                  }
                  className="rounded-control bg-carbon text-14 text-on-carbon h-9 w-fit px-3 font-medium disabled:opacity-60"
                >
                  Sign and lock it
                </button>
                {report.blocking.length > 0 && (
                  <span id="sign-why" className="text-12 text-ink-muted">
                    {report.blocking.length}{" "}
                    {report.blocking.length === 1 ? "thing" : "things"} above
                    are not true yet.
                  </span>
                )}
              </span>
            </form>
          ) : (
            <p className="text-12 text-ink-muted">
              Only a partner signs an audit report.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

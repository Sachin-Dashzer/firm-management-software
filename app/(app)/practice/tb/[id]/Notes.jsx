"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setNoteAnswer } from "../actions";

/**
 * 4 · which notes this company needs (P3-32).
 *
 * The prototype's promise is "no more copying a listed company's annual
 * report", and the honest half of that is this: answer what applies, and
 * the firm gets the list of notes **this** company needs, each with the
 * authority for it. Nine are always needed; the rest depend on what the
 * company actually did.
 *
 * **It does not write a note.** The figures for the nine come from the
 * mapped trial balance and are on step 5 with the statements; the wording
 * of a note is the firm's, and generating one would put sentences into a
 * signed financial statement that nobody had drafted. Said on the screen,
 * because a builder that stops short of the thing people expect has to
 * explain itself.
 */
export default function Notes({ id, editable, questions, answers, notes }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState(null);

  const run = (key, value) =>
    start(async () => {
      try {
        const said = await setNoteAnswer(id, key, value);
        if (said?.error) setState(said);
      } catch (error) {
        setState({ error: error?.message ?? "That did not save." });
      }
      router.refresh();
    });

  const extra = notes.filter((note) => !note.always);
  const unanswered = questions.filter(
    (question) => answers[question.key] === undefined,
  );

  return (
    <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="flex min-w-0 flex-col gap-3">
        <div>
          <h2 className="font-display text-18">4 · Notes</h2>
          <p className="text-13 text-ink-muted max-w-[76ch]">
            Answer what applies to this company. Only the notes it actually
            needs go on the list, each with the authority beside it.
          </p>
        </div>

        {unanswered.length > 0 && (
          <p className="text-12 text-faint">
            <span className="num">{unanswered.length}</span> of{" "}
            <span className="num">{questions.length}</span> not answered yet. An
            unanswered question is not a no — it is left off the list and said
            to be unanswered, because a note missed because nobody was asked is
            the commonest hole in a small company&rsquo;s accounts.
          </p>
        )}

        <ul className="rounded-ledger border-rule bg-surface divide-rule divide-y border">
          {questions.map((question) => {
            const answer = answers[question.key];
            return (
              <li
                key={question.key}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="text-14">{question.question}</span>
                  <span className="text-12 text-faint block">
                    {question.note} · {question.cite}
                  </span>
                </span>
                <span
                  role="group"
                  aria-label={question.question}
                  className="flex shrink-0 gap-1"
                >
                  {[
                    [true, "Yes"],
                    [false, "No"],
                  ].map(([value, label]) => (
                    <button
                      key={label}
                      type="button"
                      disabled={!editable || pending}
                      aria-pressed={answer === value}
                      onClick={() => run(question.key, value)}
                      className={`rounded-control text-13 h-8 border px-3 disabled:opacity-60 ${
                        answer === value
                          ? "border-carbon bg-carbon text-on-carbon font-medium"
                          : "border-rule text-ink-muted"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>

        {state?.error && (
          <p role="alert" className="text-13 text-redpen">
            {state.error}
          </p>
        )}
      </div>

      <aside className="flex flex-col gap-3">
        <div className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border p-4">
          <h3 className="font-display text-15 font-semibold">
            Notes this company needs
            <span className="num text-ink-muted font-normal">
              {" "}
              · {notes.length}
            </span>
          </h3>
          <p className="text-12 text-faint">
            Nine are needed by every set of statements under Schedule III.
            {extra.length > 0 && ` ${extra.length} more from the answers.`}
          </p>
          <ol className="text-13 flex flex-col gap-1">
            {notes.map((note, index) => (
              <li
                key={`${note.key}-${index}`}
                className="border-rule-soft flex items-baseline justify-between gap-3 border-b pb-1 last:border-0"
              >
                <span>
                  {note.name}
                  <span className="text-12 text-faint block">{note.cite}</span>
                </span>
                {!note.always && (
                  <span className="text-12 text-carbon shrink-0">
                    from an answer
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>

        <p className="text-12 text-faint max-w-[44ch]">
          <strong>This lists the notes; it does not write them.</strong> The
          figures for the nine standard notes come from the mapped trial balance
          and are on step 5. The wording of a note is the firm&rsquo;s own
          judgement about this company, and generating a paragraph for a
          statement somebody is going to sign is not something this application
          will do.
        </p>
      </aside>
    </section>
  );
}

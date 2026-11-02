import Chip from "@/components/ui/Chip";
import Panel from "@/components/ui/Panel";

/**
 * A procedure or a playbook as the library draws it (02-11-2026).
 *
 * Two shapes, one file, because they are the same document read at two
 * lengths: the **road** across the top is where you are in the work, and
 * everything under it is in the order somebody doing the work needs it —
 * when, the steps, how you know it is done, what to avoid, who to ask.
 *
 * The draft banner is never suppressed. A procedure a partner has not read
 * says so every time it is opened, because the moment that banner can be
 * turned off is the moment the firm starts treating drafted words as its
 * own.
 */

/** The strip of steps across the top. */
export function Road({ road = [] }) {
  if (road.length === 0) return null;
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {road.map((step, index) => (
        <li key={step} className="flex items-center gap-2">
          {index > 0 && (
            <span aria-hidden="true" className="text-faint">
              ›
            </span>
          )}
          <span className="bg-sunk text-13 rounded-full px-2.5 py-1">
            <span className="text-faint num me-1">{index + 1}</span>
            {step}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** The firm's starting draft for a screen. */
export default function StarterSop({ sop, note }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-ledger border-carbon/30 bg-carbon-wash text-13 border px-3 py-2">
        <strong>The firm&rsquo;s starting draft.</strong> {note}
      </p>

      <Road road={sop.road} />

      <Panel title="Your part">
        <dl className="text-14 flex flex-col gap-2">
          {sop.you.staff && (
            <div>
              <dt className="text-12 text-ink-muted uppercase">
                Staff and articles
              </dt>
              <dd>{sop.you.staff}</dd>
            </div>
          )}
          {sop.you.partner && (
            <div>
              <dt className="text-12 text-ink-muted uppercase">
                Managers and partners
              </dt>
              <dd>{sop.you.partner}</dd>
            </div>
          )}
        </dl>
      </Panel>

      <Panel title="When" count={sop.steps.length + " steps"}>
        <p className="text-14">{sop.when}</p>
        <ol className="text-14 flex list-decimal flex-col gap-1.5 pl-5">
          {sop.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2">
        <Panel title="Done when">
          <p className="text-14">{sop.done}</p>
        </Panel>
        <Panel title="Ask for help">
          <p className="text-14">{sop.ask}</p>
        </Panel>
      </div>

      {sop.avoid.length > 0 && (
        <Panel title="Avoid">
          <ul className="text-14 flex list-disc flex-col gap-1.5 pl-5">
            {sop.avoid.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

/** A playbook: the same document, longer. */
export function PlaybookView({ book, verify }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-ledger border-carbon/30 bg-carbon-wash text-13 border px-3 py-2">
        <strong>Applies to:</strong> {book.applies}
        <span className="text-ink-muted block">{verify}</span>
      </p>

      {book.steps?.length > 0 && (
        <Panel title="The work, step by step" count={`${book.steps.length} steps`}>
          <ol className="flex flex-col gap-3">
            {book.steps.map((step, index) => (
              <li
                key={step.t}
                className="border-rule rounded-ledger border p-3"
              >
                <p className="text-14 font-semibold">
                  <span className="num text-faint me-2">{index + 1}</span>
                  {step.t}
                </p>
                <dl className="mt-1.5 flex flex-col gap-1.5">
                  {step.why && <Line term="Why it matters" value={step.why} />}
                  <Line term="How" value={step.how} />
                  <Line term="Produce" value={step.out} />
                  {step.chk && <Line term="Check" value={step.chk} />}
                  {step.ask && <Line term="Ask when" value={step.ask} />}
                </dl>
              </li>
            ))}
          </ol>
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {book.calendar?.length > 0 && (
          <Panel title="When it happens">
            <ul className="flex flex-col gap-1.5">
              {book.calendar.map(([when, what]) => (
                <li key={when + what} className="text-13 flex gap-3">
                  <span className="text-carbon w-[11rem] shrink-0 font-medium">
                    {when}
                  </span>
                  <span>{what}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {book.raci?.length > 0 && (
          <Panel title="Who does what">
            <ul className="flex flex-col gap-1.5">
              {book.raci.map(([role, duty, code]) => (
                <li key={role} className="text-13 flex items-start gap-2">
                  <Chip
                    tone={code === "A" ? "info" : "neutral"}
                    title={
                      { A: "Accountable", R: "Does the work", C: "Consulted", I: "Informed" }[
                        code
                      ]
                    }
                  >
                    {code}
                  </Chip>
                  <span>
                    <strong>{role}</strong>
                    <span className="text-ink-muted block">{duty}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {book.inputs?.length > 0 && (
          <Panel title="What to ask the client for">
            <ul className="text-13 flex list-disc flex-col gap-1 pl-5">
              {book.inputs.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Panel>
        )}

        {book.outputs?.length > 0 && (
          <Panel title="What comes out">
            <ul className="text-13 flex list-disc flex-col gap-1 pl-5">
              {book.outputs.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Panel>
        )}

        {book.decisions?.length > 0 && (
          <Panel title="The judgements">
            <dl className="flex flex-col gap-2">
              {book.decisions.map(([question, answer]) => (
                <div key={question}>
                  <dt className="text-13 font-semibold">{question}</dt>
                  <dd className="text-13 text-ink-muted">{answer}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        )}

        {book.controls?.length > 0 && (
          <Panel title="What the reviewer checks">
            <ul className="text-13 flex list-disc flex-col gap-1 pl-5">
              {book.controls.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Panel>
        )}

        {book.mistakes?.length > 0 && (
          <Panel title="What usually goes wrong">
            <ul className="text-13 flex list-disc flex-col gap-1 pl-5">
              {book.mistakes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Panel>
        )}

        {book.refs?.length > 0 && (
          <Panel title="What to read" hint="Pointers, not statements of law">
            <ul className="text-13 flex list-disc flex-col gap-1 pl-5">
              {book.refs.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Panel>
        )}
      </div>

      {book.worked?.length > 0 && (
        <Panel title="A worked example">
          <ol className="text-14 flex list-decimal flex-col gap-1.5 pl-5">
            {book.worked.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </Panel>
      )}

      {book.exercise && (
        <Panel title="Try it" hint="The answers are under each line">
          <p className="text-14">{book.exercise.q}</p>
          <ol className="flex flex-col gap-2">
            {book.exercise.items.map((item) => (
              <li key={item.t} className="text-13">
                <details>
                  <summary className="cursor-pointer">{item.t}</summary>
                  <p
                    className={`mt-1 ${item.ok ? "text-filed" : "text-redpen"}`}
                  >
                    {item.ok ? "Yes" : "No"} — {item.why}
                  </p>
                </details>
              </li>
            ))}
          </ol>
        </Panel>
      )}
    </div>
  );
}

function Line({ term, value }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="text-11 text-ink-muted w-[7rem] shrink-0 pt-0.5 font-semibold tracking-wide uppercase">
        {term}
      </dt>
      <dd className="text-13 min-w-[14rem] flex-1">{value}</dd>
    </div>
  );
}

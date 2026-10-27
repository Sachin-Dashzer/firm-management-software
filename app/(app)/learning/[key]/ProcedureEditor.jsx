"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveProcedure, markReviewed } from "../actions";

/**
 * Reading a procedure, and writing one (P3-19).
 *
 * The editor is **one textarea for the steps**, one line each, with a line
 * starting `—` as a note on the step above. Somebody writing down how the
 * firm does GST is thinking about GST, not about a form with an Add step
 * button; a box they can paste their own notes into is the difference
 * between a procedure getting written and not.
 */
export default function ProcedureEditor({
  procedureKey,
  kind,
  canWrite,
  canReview,
  screens,
  current,
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(!current);
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();
  const [slug, setSlug] = useState(procedureKey);

  const isPlaybook = kind === "playbook";

  function onSave(formData) {
    const key =
      procedureKey ||
      slug ||
      String(formData.get("title") ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60);

    if (!key) {
      setMessage({ error: "Give it a name first." });
      return;
    }

    startTransition(async () => {
      const result = await saveProcedure(key, formData);
      setMessage(result);
      if (result?.ok) {
        setEditing(false);
        if (!procedureKey) router.push(`/learning/${key}`);
        else router.refresh();
      }
    });
  }

  if (!editing && current) {
    return (
      <div className="flex flex-col gap-4">
        {message?.ok && (
          <p
            role="status"
            className="rounded-ledger border-filed bg-filed-wash text-13 text-filed border px-3 py-2"
          >
            {message.ok}
          </p>
        )}

        {current.intro && <p className="text-14">{current.intro}</p>}

        <ol className="flex list-decimal flex-col gap-2 pl-5">
          {readSteps(current.steps).map((step, index) => (
            <li key={index} className="text-14">
              {step.text}
              {step.note && (
                <span className="text-13 text-ink-muted block">
                  {step.note}
                </span>
              )}
            </li>
          ))}
        </ol>

        {current.notFor && (
          <div className="rounded-ledger border-rule bg-sunk flex flex-col gap-1 border px-3 py-2">
            <p className="text-13 font-medium">What this is not for</p>
            <ul className="text-13 list-disc pl-5">
              {current.notFor
                .split("\n")
                .filter(Boolean)
                .map((line) => (
                  <li key={line}>{line}</li>
                ))}
            </ul>
          </div>
        )}

        {isPlaybook && (
          <>
            <Section title="When it happens" body={current.whenItHappens} />
            <Section title="Where the decisions are" body={current.decisions} />
            <Section title="What usually goes wrong" body={current.mistakes} />
            <Section title="A worked example" body={current.example} />
          </>
        )}

        <p className="text-12 text-ink-muted">
          Written by {current.writtenByName}
          {current.reviewedOn
            ? ` · read and confirmed by ${current.reviewedByName} on ${current.reviewedOn}`
            : " · no partner has confirmed it yet"}
        </p>

        <div className="flex flex-wrap gap-2">
          {canWrite && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-control border-rule bg-surface text-14 h-9 border px-3"
            >
              Rewrite it
            </button>
          )}
          {canReview && !current.reviewedOn && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setMessage(await markReviewed(procedureKey));
                  router.refresh();
                })
              }
              className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium disabled:opacity-60"
            >
              I have read it — it is still how we work
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!canWrite) {
    return (
      <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border px-3 py-4">
        Nobody has written this one yet. A CA or a partner writes these —
        ask whoever does this job most often.
      </p>
    );
  }

  return (
    <form action={onSave} className="flex flex-col gap-3">
      <input type="hidden" name="kind" value={kind} />

      {message?.error && (
        <p
          role="alert"
          className="rounded-ledger border-redpen bg-redpen-wash text-13 text-redpen border px-3 py-2"
        >
          {message.error}
        </p>
      )}

      {isPlaybook && (
        <label className="flex flex-col gap-1">
          <span className="text-13 font-medium">What it is called</span>
          <input
            name="title"
            required
            defaultValue={current?.title ?? ""}
            onChange={(event) =>
              !procedureKey &&
              setSlug(
                event.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-|-$/g, "")
                  .slice(0, 60),
              )
            }
            placeholder="Monthly GST, start to finish"
            className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
          />
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-13 font-medium">What it is for, in a line</span>
        <input
          name="intro"
          defaultValue={current?.intro ?? ""}
          className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-13 font-medium">The steps</span>
        <textarea
          name="steps"
          rows={10}
          required
          defaultValue={current?.steps ?? ""}
          placeholder={
            "One step per line, in the order you do them.\nA line starting with — is a note on the step above it."
          }
          className="rounded-control border-rule bg-paper text-14 border px-2 py-1"
        />
        <span className="text-12 text-ink-muted">
          Your words, not the system&rsquo;s. Write it the way you would say
          it to somebody on their first week.
        </span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-13 font-medium">
          What this is <em>not</em> for
        </span>
        <textarea
          name="notFor"
          rows={2}
          defaultValue={current?.notFor ?? ""}
          placeholder="One per line. The half of every procedure that gets left out."
          className="rounded-control border-rule bg-paper text-14 border px-2 py-1"
        />
      </label>

      {isPlaybook && (
        <>
          <Field
            label="When it happens"
            name="whenItHappens"
            defaultValue={current?.whenItHappens}
          />
          <Field
            label="Where the decisions are"
            name="decisions"
            defaultValue={current?.decisions}
          />
          <Field
            label="What usually goes wrong"
            name="mistakes"
            defaultValue={current?.mistakes}
          />
          <Field
            label="A worked example"
            name="example"
            rows={6}
            defaultValue={current?.example}
          />

          <fieldset className="flex flex-col gap-1">
            <legend className="text-13 font-medium">
              Screens its steps happen on
            </legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {screens.map((screen) => (
                <label key={screen.key} className="text-13 flex gap-2">
                  <input
                    type="checkbox"
                    name="screens"
                    value={screen.key}
                    defaultChecked={current?.screens?.includes(screen.key)}
                  />
                  {screen.label}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-4 font-medium disabled:opacity-60"
        >
          Save it
        </button>
        {current && (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-control border-rule bg-surface text-14 h-9 border px-3"
          >
            Leave it as it was
          </button>
        )}
      </div>

      <p className="text-12 text-ink-muted">
        Saving clears the partner&rsquo;s confirmation: they said the old
        words were how the firm works, not these.
      </p>
    </form>
  );
}

/**
 * The same parse the server does, for reading: one step per line, and a
 * line starting `—` is a note on the one above.
 */
function readSteps(text) {
  const steps = [];
  for (const raw of String(text ?? "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^[—-]\s*/.test(line) && steps.length) {
      steps[steps.length - 1].note = line.replace(/^[—-]\s*/, "");
      continue;
    }
    steps.push({ text: line, note: "" });
  }
  return steps;
}

function Section({ title, body }) {
  if (!body) return null;
  return (
    <section className="flex flex-col gap-1">
      <h2 className="text-14 font-medium">{title}</h2>
      <p className="text-14 whitespace-pre-line">{body}</p>
    </section>
  );
}

function Field({ label, name, defaultValue, rows = 3 }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-13 font-medium">{label}</span>
      <textarea
        name={name}
        rows={rows}
        defaultValue={defaultValue ?? ""}
        className="rounded-control border-rule bg-paper text-14 border px-2 py-1"
      />
    </label>
  );
}

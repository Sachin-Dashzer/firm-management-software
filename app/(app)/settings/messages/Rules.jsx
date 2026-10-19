"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveRule } from "./actions";

/**
 * The switches behind every message (spec section 12).
 *
 * One row per rule, reading as a sentence: who it goes to and when. A rule
 * opens to show its timing and its wording, so the common act — switching
 * something off because it is nagging people — takes one click, and the
 * rarer act of rewriting a letter to clients is still here.
 */
export default function Rules({ rules, mayEdit }) {
  const [open, setOpen] = useState(null);
  const [message, setMessage] = useState(null);

  return (
    <section className="flex flex-col gap-2">
      <div>
        <h2 className="font-display text-20">When the system speaks</h2>
        <p className="text-13 text-ink-muted">
          Every message the system sends, and the switch behind it. Switching
          one off stops it for everybody.
        </p>
      </div>

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

      <div className="rounded-ledger border-rule bg-surface border">
        <ul>
          {rules.map((rule) => (
            <li key={rule.key} className="border-rule border-b last:border-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-14">
                    {rule.what}
                    {!rule.enabled && (
                      <span className="text-13 text-redpen">
                        {" "}
                        — switched off
                      </span>
                    )}
                  </p>
                  <p className="text-12 text-ink-muted">
                    {rule.timing} · {rule.to} ·{" "}
                    {rule.audience === "client"
                      ? "goes to a client"
                      : "internal"}
                  </p>
                </div>
                <button
                  type="button"
                  aria-expanded={open === rule.key}
                  onClick={() => setOpen(open === rule.key ? null : rule.key)}
                  className="text-13 underline underline-offset-4"
                >
                  {open === rule.key ? "Close" : mayEdit ? "Change" : "Look"}
                </button>
              </div>

              {open === rule.key && (
                <RuleForm
                  rule={rule}
                  mayEdit={mayEdit}
                  onSaved={(result) => {
                    setMessage(result);
                    if (result?.ok) setOpen(null);
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function RuleForm({ rule, mayEdit, onSaved }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          const result = await saveRule(rule.key, formData);
          onSaved(result);
          if (result?.ok) router.refresh();
        })
      }
      className="bg-paper border-rule flex flex-col gap-3 border-t px-3 py-3"
    >
      <label className="text-14 flex items-center gap-2">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={rule.enabled}
          disabled={!mayEdit}
          className="size-4"
        />
        Send this message
      </label>

      <div className="flex flex-wrap gap-3">
        {rule.when === "before" || rule.when === "repeat" ? (
          <Field
            label="Days before"
            hint="Separate several with a comma, e.g. 5, 1"
            name="daysBefore"
            defaultValue={(rule.daysBefore ?? []).join(", ")}
            disabled={!mayEdit}
          />
        ) : null}

        {rule.when === "repeat" ? (
          <>
            <Field
              label="Then every (days)"
              name="everyDays"
              type="number"
              min="1"
              max="90"
              defaultValue={rule.everyDays ?? ""}
              disabled={!mayEdit}
            />
            {rule.maxReminders !== undefined && (
              <Field
                label="At most (times)"
                name="maxReminders"
                type="number"
                min="1"
                max="20"
                defaultValue={rule.maxReminders ?? ""}
                disabled={!mayEdit}
              />
            )}
          </>
        ) : null}

        {rule.when === "time" ? (
          <Field
            label="Time (IST)"
            name="atIST"
            type="time"
            defaultValue={rule.atIST ?? "09:00"}
            disabled={!mayEdit}
          />
        ) : null}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-13 text-ink-muted font-medium">Subject</span>
        <input
          name="subject"
          defaultValue={rule.subject || rule.defaultSubject}
          disabled={!mayEdit}
          className="rounded-ledger border-rule bg-surface text-14 h-9 border px-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-13 text-ink-muted font-medium">Message</span>
        <textarea
          name="body"
          rows={10}
          defaultValue={rule.body || rule.defaultBody}
          disabled={!mayEdit}
          className="rounded-ledger border-rule bg-surface text-14 border px-2 py-1 font-mono"
        />
      </label>

      {rule.placeholders.length > 0 && (
        <p className="text-12 text-ink-muted">
          You can use: {rule.placeholders.join(" ")} — each is filled in when
          the message is sent. Leave the wording exactly as it came and the
          system keeps using its own.
        </p>
      )}

      {mayEdit && (
        <div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-ledger bg-carbon text-14 h-9 px-3 font-medium text-white disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </form>
  );
}

function Field({ label, hint, ...props }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-13 text-ink-muted font-medium">{label}</span>
      <input
        {...props}
        className="rounded-ledger border-rule bg-surface text-14 h-9 w-40 border px-2"
      />
      {hint && <span className="text-12 text-ink-muted">{hint}</span>}
    </label>
  );
}

"use client";

import { useState, useTransition } from "react";
import { approveTemplate, archiveTemplate, saveTemplate } from "./actions";

/**
 * Editing and approving the firm's letters (P2-8b).
 *
 * The unapproved ones are at the top and said plainly, because the eight
 * that ship with the system are drafted wording and the firm has to read
 * them before anything goes out over its name.
 */
export default function TemplateAdmin({
  rows,
  kinds,
  fields,
  mayEdit,
  mayApprove,
}) {
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  const unapproved = rows.filter((row) => !row.verified && row.active);

  function run(work) {
    startTransition(async () => {
      const result = await work();
      setMessage(result);
      if (result?.ok) setEditing(null);
    });
  }

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-28 font-semibold">
            Document templates
          </h1>
          <p className="text-13 text-ink-muted max-w-[70ch]">
            Letters and certificates the firm writes often. A template makes
            watermarked drafts until a partner has read the wording and
            approved it — and editing an approved one takes the approval away
            again.
          </p>
        </div>
        {mayEdit && (
          <button
            type="button"
            onClick={() =>
              setEditing(editing === "new" ? null : "new")
            }
            className="rounded-ledger bg-carbon text-14 h-9 px-3 font-medium text-white"
          >
            {editing === "new" ? "Cancel" : "Add a template"}
          </button>
        )}
      </div>

      {message && (
        <p
          role={message.error ? "alert" : "status"}
          className={`text-14 ${message.error ? "text-redpen" : ""}`}
        >
          {message.error ?? message.ok}
        </p>
      )}

      {unapproved.length > 0 && (
        <p className="rounded-ledger border-waiting text-14 border border-dashed p-3">
          <span className="num font-medium">{unapproved.length}</span> of these
          have never been approved. They produce drafts only. The wording that
          ships with the system is a starting point written plainly — it is not
          an ICAI pro forma, and the letters to another member or to a
          regulator in particular want a partner&rsquo;s own words.
        </p>
      )}

      {editing === "new" && (
        <Editor
          row={null}
          kinds={kinds}
          fields={fields}
          pending={pending}
          onSave={(formData) => run(() => saveTemplate("", formData))}
        />
      )}

      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li
            key={row.id}
            className={`rounded-ledger border p-4 ${
              row.active ? "border-rule bg-surface" : "border-rule opacity-60"
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="font-display text-18">
                  {row.name}{" "}
                  <span className="text-13 text-ink-muted font-mono">
                    {row.code}
                  </span>
                </h2>
                <p className="text-13 text-ink-muted">{row.description}</p>
                <p className="text-12 text-ink-muted">
                  {row.kind} · version {row.version}
                  {row.partnerOnly && " · partner issues it"}
                  {row.udinRequired && " · needs a UDIN"}
                  {!row.active && " · hidden"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-12 rounded-ledger border px-2 py-0.5 ${
                    row.verified
                      ? "border-rule text-ink-muted"
                      : "border-waiting text-waiting"
                  }`}
                >
                  {row.verified
                    ? `Approved ${row.verifiedOn} by ${row.verifiedByName}`
                    : "Not approved — drafts only"}
                </span>
                {mayEdit && (
                  <button
                    type="button"
                    onClick={() =>
                      setEditing(editing === row.id ? null : row.id)
                    }
                    className="rounded-ledger border-rule text-13 h-8 border px-2"
                  >
                    {editing === row.id ? "Close" : "Edit"}
                  </button>
                )}
                {mayApprove && !row.verified && row.active && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => approveTemplate(row.id))}
                    className="rounded-ledger bg-carbon text-13 h-8 px-2 font-medium text-white disabled:opacity-60"
                  >
                    Approve the wording
                  </button>
                )}
                {mayEdit && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => archiveTemplate(row.id, !row.active))}
                    className="rounded-ledger border-rule text-13 h-8 border px-2"
                  >
                    {row.active ? "Hide" : "Restore"}
                  </button>
                )}
              </div>
            </div>

            {row.sourceNote && !row.verified && (
              <p className="text-13 text-ink-muted mt-2 italic">
                {row.sourceNote}
              </p>
            )}

            {editing === row.id && (
              <Editor
                row={row}
                kinds={kinds}
                fields={fields}
                pending={pending}
                onSave={(formData) => run(() => saveTemplate(row.id, formData))}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The editor, shared by "add" and "edit". */
function Editor({ row, kinds, fields, pending, onSave }) {
  return (
    <form action={onSave} className="mt-3 flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">Code</span>
          <input
            name="code"
            defaultValue={row?.code ?? ""}
            required
            className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2 font-mono uppercase"
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-13 text-ink-muted font-medium">Name</span>
          <input
            name="name"
            defaultValue={row?.name ?? ""}
            required
            className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">Kind</span>
          <select
            name="kind"
            defaultValue={row?.kind ?? kinds[kinds.length - 1]}
            className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
          >
            {kinds.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-13 text-ink-muted font-medium">
            One line about it
          </span>
          <input
            name="description"
            defaultValue={row?.description ?? ""}
            className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-3">
          <span className="text-13 text-ink-muted font-medium">
            Heading printed on the document
          </span>
          <input
            name="title"
            defaultValue={row?.title ?? ""}
            className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="text-14 flex items-center gap-2">
          <input
            type="checkbox"
            name="partnerOnly"
            defaultChecked={row?.partnerOnly ?? false}
          />
          Only a partner may issue it
        </label>
        <label className="text-14 flex items-center gap-2">
          <input
            type="checkbox"
            name="udinRequired"
            defaultChecked={row?.udinRequired ?? false}
          />
          Needs a UDIN on the engagement
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-13 text-ink-muted font-medium">The wording</span>
        <textarea
          name="body"
          rows={18}
          defaultValue={row?.body ?? ""}
          required
          className="rounded-ledger border-rule bg-paper text-13 border p-3 font-mono"
        />
      </label>

      <details className="text-13">
        <summary className="cursor-pointer">
          Fields you can use ({fields.length})
        </summary>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {fields.map((field) => (
            <li key={field.key} className="text-ink-muted">
              <code className="font-mono">{`{{${field.key}}}`}</code> —{" "}
              {field.label}
            </li>
          ))}
        </ul>
        <p className="text-ink-muted mt-2">
          Nothing sensitive is on this list on purpose: a PAN, an Aadhaar or a
          portal password cannot be put into a letter by a template.
        </p>
      </details>

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-ledger bg-carbon text-14 h-9 px-3 font-medium text-white disabled:opacity-60"
        >
          {row ? "Save the wording" : "Add the template"}
        </button>
      </div>
    </form>
  );
}

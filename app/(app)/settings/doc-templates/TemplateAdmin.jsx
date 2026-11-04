"use client";

import { saving } from "@/lib/forms/saving";
import { useMemo, useState, useTransition } from "react";
import { approveTemplate, archiveTemplate, saveTemplate } from "./actions";

/**
 * Editing and approving the firm's letters (P2-8b, redrawn 03-11-2026).
 *
 * ## What was wrong with it
 *
 * The screen rendered a **second `SettingsScreen` inside the page's own**,
 * so it printed two headings — "Templates" from the page and "Document
 * templates" from here — inside two nested max-width columns. The one
 * control that starts a new template was in the inner header, under the
 * outer one, which is why it read as missing.
 *
 * Below that, two dozen letters were a flat stack of equal cards, each
 * four lines tall with four buttons crowded along its right edge. Nothing
 * said which of them needed a partner, nothing could be searched, and the
 * editor expanded *inside* a card and pushed the rest of the list off the
 * screen.
 *
 * ## What it is now
 *
 * The page owns the heading; this owns a toolbar and a list. **New
 * template** sits in the toolbar beside the search box and the filters,
 * which is where somebody looks when a list has not got what they want.
 *
 * The filters are counted, because "21 of these have never been approved"
 * is the one fact a partner opens this screen for, and a count you can
 * click is more use than a paragraph saying the same thing.
 *
 * Rows are grouped by kind and are two lines rather than four: the words
 * that identify a letter, then its state. The editor opens **above** the
 * list, not inside a row, so starting a new template and editing an
 * existing one are the same shape in the same place and the list never
 * jumps.
 */
export default function TemplateAdmin({
  rows,
  kinds,
  fields,
  mayEdit,
  mayApprove,
}) {
  /** `"new"`, a template id, or null. One editor at a time, by design. */
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const counts = useMemo(
    () => ({
      all: rows.length,
      unapproved: rows.filter((row) => !row.verified && row.active).length,
      approved: rows.filter((row) => row.verified && row.active).length,
      hidden: rows.filter((row) => !row.active).length,
    }),
    [rows],
  );

  /**
   * Filter, then search, then group — in that order, so the counts on the
   * chips describe the whole library and not whatever is typed in the box.
   */
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = rows.filter((row) => {
      if (filter === "unapproved" && (row.verified || !row.active))
        return false;
      if (filter === "approved" && (!row.verified || !row.active)) return false;
      if (filter === "hidden" && row.active) return false;
      if (!needle) return true;
      return (
        row.name.toLowerCase().includes(needle) ||
        row.code.toLowerCase().includes(needle) ||
        row.description.toLowerCase().includes(needle)
      );
    });

    const byKind = new Map();
    for (const row of matches) {
      if (!byKind.has(row.kind)) byKind.set(row.kind, []);
      byKind.get(row.kind).push(row);
    }
    // the model's own order, so the groups read the same every time
    return kinds
      .filter((kind) => byKind.has(kind))
      .map((kind) => [kind, byKind.get(kind)]);
  }, [rows, kinds, filter, query]);

  const shown = groups.reduce((n, [, list]) => n + list.length, 0);

  function run(work) {
    const answer = work();
    startTransition(async () => {
      const result = await answer;
      setMessage(result);
      if (result?.ok) setEditing(null);
    });
    // the answer goes back to the caller: a form clears itself only on a save
    return answer;
  }

  const open = editing === "new" ? null : rows.find((r) => r.id === editing);

  return (
    <div className="flex flex-col gap-4">
      {/* --- toolbar ------------------------------------------------------ */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Search the templates</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, code or description"
              className="rounded-control border-rule bg-paper text-14 h-9 w-full min-w-[12rem] border px-2"
            />
          </label>
          {mayEdit && (
            <button
              type="button"
              onClick={() => setEditing(editing === "new" ? null : "new")}
              aria-expanded={editing === "new"}
              className="rounded-control bg-carbon text-14 text-on-carbon hover:bg-carbon-ink h-9 shrink-0 px-3 font-medium"
            >
              {editing === "new" ? "Cancel" : "New template"}
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Chip
            on={filter === "all"}
            onClick={() => setFilter("all")}
            count={counts.all}
          >
            All
          </Chip>
          <Chip
            on={filter === "unapproved"}
            onClick={() => setFilter("unapproved")}
            count={counts.unapproved}
            tone="warn"
          >
            Needs a partner
          </Chip>
          <Chip
            on={filter === "approved"}
            onClick={() => setFilter("approved")}
            count={counts.approved}
          >
            Approved
          </Chip>
          <Chip
            on={filter === "hidden"}
            onClick={() => setFilter("hidden")}
            count={counts.hidden}
          >
            Hidden
          </Chip>
        </div>
      </div>

      {message && (
        <p
          role={message.error ? "alert" : "status"}
          className={`rounded-ledger text-13 border px-3 py-2 ${
            message.error
              ? "border-redpen bg-redpen-wash text-redpen"
              : "border-filed bg-filed-wash text-filed"
          }`}
        >
          {message.error ?? message.ok}
        </p>
      )}

      {counts.unapproved > 0 && filter !== "unapproved" && (
        <p className="rounded-ledger border-waiting bg-waiting-wash text-13 border px-3 py-2">
          <span className="num font-medium">{counts.unapproved}</span> of these
          have never been approved, and they produce watermarked drafts only.
          The wording that ships with the system is a starting point written
          plainly — it is not an ICAI pro forma, and the letters to another
          member or to a regulator in particular want a partner&rsquo;s own
          words.
        </p>
      )}

      {/* --- the editor, above the list rather than inside a row --------- */}
      {(editing === "new" || open) && (
        <section className="rounded-ledger border-carbon bg-carbon-wash flex flex-col gap-3 border p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-16 font-semibold">
              {open ? `Editing ${open.name}` : "New template"}
            </h2>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="text-13 text-ink-muted hover:text-ink underline underline-offset-4"
            >
              Close
            </button>
          </div>
          {open?.verified && (
            <p className="text-13 text-waiting">
              This one is approved. Saving a change takes the approval away
              again, and it will make watermarked drafts until a partner reads
              the new wording.
            </p>
          )}
          <Editor
            // remounts between templates, so the fields re-read their
            // defaults instead of keeping the last letter's words
            key={open?.id ?? "new"}
            row={open ?? null}
            kinds={kinds}
            fields={fields}
            pending={pending}
            onSave={(formData) =>
              run(() => saveTemplate(open?.id ?? "", formData))
            }
          />
        </section>
      )}

      {/* --- the library -------------------------------------------------- */}
      {shown === 0 ? (
        <p className="text-13 text-ink-muted rounded-ledger border-rule border border-dashed px-3 py-6 text-center">
          {query.trim()
            ? `Nothing matches “${query.trim()}”.`
            : "Nothing in this filter."}
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(([kind, list]) => (
            <section key={kind} className="flex flex-col gap-1.5">
              <h2 className="text-12 text-ink-muted font-medium tracking-wide uppercase">
                {kind}
                <span className="num text-faint ml-1.5">{list.length}</span>
              </h2>
              <ul className="rounded-ledger border-rule bg-surface flex flex-col border">
                {list.map((row) => (
                  <Row
                    key={row.id}
                    row={row}
                    editing={editing === row.id}
                    mayEdit={mayEdit}
                    mayApprove={mayApprove}
                    pending={pending}
                    onEdit={() =>
                      setEditing(editing === row.id ? null : row.id)
                    }
                    onApprove={() => run(() => approveTemplate(row.id))}
                    onArchive={() =>
                      run(() => archiveTemplate(row.id, !row.active))
                    }
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** A counted filter. A count you can click beats a sentence saying it. */
function Chip({ on, count, tone, children, ...rest }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={`rounded-chip text-13 border px-2.5 py-0.5 ${
        on
          ? "border-carbon bg-carbon text-on-carbon"
          : tone === "warn" && count > 0
            ? "border-waiting text-waiting hover:bg-waiting-wash"
            : "border-rule text-ink-muted hover:bg-carbon-wash"
      }`}
      {...rest}
    >
      {children}
      <span className="num ml-1.5 opacity-70">{count}</span>
    </button>
  );
}

/**
 * One letter: the words that identify it, then its state, then what can be
 * done to it. Two lines, not four — a library is read by scanning.
 */
function Row({
  row,
  editing,
  mayEdit,
  mayApprove,
  pending,
  onEdit,
  onApprove,
  onArchive,
}) {
  return (
    <li
      className={`border-rule flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-3 py-2.5 last:border-0 ${
        editing ? "bg-carbon-wash" : ""
      } ${row.active ? "" : "opacity-60"}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-14 flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{row.name}</span>
          <span className="text-12 text-ink-muted font-mono">{row.code}</span>
          {!row.active && <span className="text-12 text-faint">hidden</span>}
        </p>
        <p className="text-12 text-ink-muted">
          {row.description || "No description"}
          {" · "}
          <span className="num">v{row.version}</span>
          {row.partnerOnly && " · partner issues it"}
          {row.udinRequired && " · needs a UDIN"}
          {row.uses.length > 0 && (
            <>
              {" · "}
              <span className="num">{row.uses.length}</span> fields filled in
            </>
          )}
        </p>
        {row.sourceNote && !row.verified && (
          <p className="text-12 text-faint italic">{row.sourceNote}</p>
        )}
      </div>

      <span
        className={`text-12 rounded-chip shrink-0 border px-2 py-0.5 ${
          row.verified
            ? "border-filed text-filed"
            : "border-waiting text-waiting"
        }`}
      >
        {row.verified
          ? `Approved ${row.verifiedOn}${row.verifiedByName ? ` · ${row.verifiedByName}` : ""}`
          : "Drafts only"}
      </span>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {mayApprove && !row.verified && row.active && (
          <button
            type="button"
            disabled={pending}
            onClick={onApprove}
            className="rounded-control bg-carbon text-13 text-on-carbon h-8 px-2 font-medium disabled:opacity-60"
          >
            Approve
          </button>
        )}
        {mayEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-expanded={editing}
            className="rounded-control border-rule hover:bg-carbon-wash text-13 h-8 border px-2"
          >
            {editing ? "Editing" : "Edit"}
          </button>
        )}
        {mayEdit && (
          <button
            type="button"
            disabled={pending}
            onClick={onArchive}
            className="rounded-control border-rule hover:bg-carbon-wash text-13 h-8 border px-2 disabled:opacity-60"
          >
            {row.active ? "Hide" : "Restore"}
          </button>
        )}
      </div>
    </li>
  );
}

/** The editor, shared by "new" and "edit". */
function Editor({ row, kinds, fields, pending, onSave }) {
  return (
    <form onSubmit={saving(onSave)} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">Code</span>
          <input
            name="code"
            defaultValue={row?.code ?? ""}
            required
            placeholder="ENG-LTR"
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2 font-mono uppercase"
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-13 text-ink-muted font-medium">Name</span>
          <input
            name="name"
            defaultValue={row?.name ?? ""}
            required
            placeholder="Engagement letter"
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">Kind</span>
          <select
            name="kind"
            defaultValue={row?.kind ?? kinds[kinds.length - 1]}
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
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
            placeholder="Sent when a new client is taken on"
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-3">
          <span className="text-13 text-ink-muted font-medium">
            Heading printed on the document
          </span>
          <input
            name="title"
            defaultValue={row?.title ?? ""}
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
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
          placeholder={"Dear {{client.name}},\n\n…"}
          className="rounded-ledger border-rule bg-paper text-13 border p-3 font-mono"
        />
      </label>

      <details className="text-13">
        <summary className="text-ink-muted hover:text-ink cursor-pointer">
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
          className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium disabled:opacity-60"
        >
          {pending
            ? "Saving…"
            : row
              ? "Save the wording"
              : "Create the template"}
        </button>
      </div>
    </form>
  );
}

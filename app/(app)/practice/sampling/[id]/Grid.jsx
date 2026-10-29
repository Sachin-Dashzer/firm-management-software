"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, X } from "@phosphor-icons/react";
import Uploader from "@/components/documents/Uploader";
import {
  markCell,
  saveAttributes,
  saveItemNote,
  sendExceptions,
} from "../actions";

/**
 * 2 · the vouching grid (P3-30).
 *
 * One row per selected item, one column per question, and every cell is
 * one of three states: ✓ fine, ✗ an exception, · not looked at. **Three
 * and not two** — a blank that means "fine" is how a half-finished sheet
 * gets signed off, so "not looked at" has to be a value of its own, and
 * the counts at the top read it.
 *
 * A cell is a button and the click cycles · → ✓ → ✗ → ·. Nothing
 * animates: this is a grid somebody works down for an hour at a client's
 * office, and a transition on every tick is a tax on every tick.
 *
 * The voucher photograph goes **on its row**, not on the engagement:
 * "show me the voucher for item 17" is the question, and a folder of forty
 * photographs does not answer it.
 */
export default function Grid({
  id,
  engagementId,
  clientId,
  attributes,
  items,
  counts,
  editable,
  locked,
  canSend,
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState(null);
  const [open, setOpen] = useState(null);
  const [columns, setColumns] = useState(false);

  /**
   * A server action that throws must say so on screen.
   *
   * Without the catch a refused write looks exactly like a write that
   * worked and then refreshed: the page comes back unchanged and nobody
   * can tell whether the tick was recorded. On a vouching grid that is the
   * worst possible failure, so the error is shown rather than swallowed.
   */
  const run = (fn) =>
    start(async () => {
      try {
        const result = await fn();
        if (result?.error || result?.ok) setState(result);
      } catch (error) {
        setState({ error: error?.message ?? "That did not save." });
      }
      router.refresh();
    });

  /** · → ✓ → ✗ → · */
  const nextMark = (mark) => (mark === null ? 1 : mark === 1 ? 0 : null);

  if (items.length === 0) {
    return (
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
        <h2 className="font-display text-15 font-semibold">
          2 · Vouching grid
        </h2>
        <p className="text-13 text-ink-muted">
          Nothing is drawn yet. Save the design, then paste the population and
          draw — the rows appear here.
        </p>
        {editable && !locked && (
          <ColumnEditor
            attributes={attributes}
            onSave={(formData) => run(() => saveAttributes(id, formData))}
            pending={pending}
          />
        )}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="font-display text-15 font-semibold">
            2 · Vouching grid
          </h2>
          <p className="text-13 text-ink-muted">
            Click a cell to mark it ✓ fine, again for ✗ an exception, again to
            clear it.
          </p>
        </div>
        <div className="text-13 flex flex-wrap items-center gap-x-3">
          <span className="text-filed">
            <span className="num">{counts.cleared}</span> cleared
          </span>
          <span
            className={counts.exceptions > 0 ? "text-redpen" : "text-faint"}
          >
            <span className="num">{counts.exceptions}</span>{" "}
            {counts.exceptions === 1 ? "exception" : "exceptions"}
          </span>
          <span className="text-ink-muted">
            <span className="num">{counts.pending}</span> to do
          </span>
          {editable && canSend && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => sendExceptions(id))}
              className="rounded-control bg-carbon text-on-carbon text-14 h-9 px-3 font-medium disabled:opacity-60"
            >
              Send exceptions to the audit file
            </button>
          )}
        </div>
      </div>

      {editable && !locked && (
        <ColumnEditor
          attributes={attributes}
          onSave={(formData) => run(() => saveAttributes(id, formData))}
          pending={pending}
        />
      )}

      <div className="rounded-table border-rule bg-surface overflow-x-auto border">
        <table className="text-14 w-full min-w-[760px]">
          <thead>
            <tr className="border-rule text-12 text-faint border-b text-left">
              <th className="px-2 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Party · date</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              {attributes.map((attribute) => (
                <th
                  key={attribute}
                  scope="col"
                  className="px-1 py-2 text-center font-medium"
                >
                  {attribute}
                </th>
              ))}
              <th className="px-2 py-2 font-medium">
                <span className="sr-only">Voucher and note</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const exception = item.marks.includes(0);
              return (
                <Rows
                  key={item.id}
                  item={item}
                  attributes={attributes}
                  exception={exception}
                  expanded={open === item.id}
                  editable={editable}
                  pending={pending}
                  onToggle={() => setOpen(open === item.id ? null : item.id)}
                  onMark={(index) =>
                    run(() =>
                      markCell(id, item.id, index, nextMark(item.marks[index])),
                    )
                  }
                  onNote={(formData) =>
                    run(() => saveItemNote(id, item.id, formData))
                  }
                  engagementId={engagementId}
                  clientId={clientId}
                  refresh={() => router.refresh()}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {state?.error && (
        <p role="alert" className="text-13 text-redpen">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="text-13 text-filed">
          {state.ok}
        </p>
      )}
    </section>
  );
}

/** One item: its row, and the drawer under it. */
function Rows({
  item,
  attributes,
  exception,
  expanded,
  editable,
  pending,
  onToggle,
  onMark,
  onNote,
  engagementId,
  clientId,
  refresh,
}) {
  return (
    <>
      <tr
        className={`border-rule border-b last:border-0 ${
          exception ? "bg-redpen-wash" : ""
        }`}
      >
        <td className="num text-ink-muted px-2 py-2">{item.no}</td>
        <td className="px-3 py-2">
          <span className="font-medium">{item.party}</span>
          <div className="text-12 text-faint">
            {[item.ref, item.on].filter(Boolean).join(" · ")}
            {item.key && (
              <>
                {" · "}
                <span title={item.keyReason}>examined in full</span>
              </>
            )}
          </div>
        </td>
        <td className="num px-3 py-2 text-right">{item.amount}</td>

        {attributes.map((attribute, index) => {
          const mark = item.marks[index];
          const said =
            mark === 1 ? "fine" : mark === 0 ? "an exception" : "not checked";
          return (
            <td key={attribute} className="px-1 py-2 text-center">
              <button
                type="button"
                disabled={!editable || pending}
                onClick={() => onMark(index)}
                aria-label={`${attribute} for ${item.party}: ${said}`}
                className={`rounded-control grid size-7 place-items-center border disabled:opacity-60 ${
                  mark === 1
                    ? "border-filed bg-filed-soft text-filed"
                    : mark === 0
                      ? "border-redpen bg-redpen-soft text-redpen"
                      : "border-rule text-faint"
                }`}
              >
                {mark === 1 ? (
                  <Check size={14} weight="bold" />
                ) : mark === 0 ? (
                  <X size={14} weight="bold" />
                ) : (
                  <span aria-hidden>·</span>
                )}
              </button>
            </td>
          );
        })}

        <td className="px-2 py-2 text-right">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="text-12 text-ink-muted inline-flex items-center gap-1 underline underline-offset-4"
          >
            <Camera size={14} />
            {item.photos > 0 && <span className="num">{item.photos}</span>}
            {item.note ? "note" : "add"}
          </button>
        </td>
      </tr>

      {expanded && (
        <tr className={exception ? "bg-redpen-wash" : ""}>
          <td colSpan={attributes.length + 4} className="px-3 pt-0 pb-3">
            <div className="flex flex-col gap-3 lg:flex-row">
              <form
                action={onNote}
                className="flex min-w-0 flex-1 flex-col gap-2"
              >
                <label className="flex flex-col gap-1">
                  <span className="text-13 text-ink-muted">
                    What was found on this one
                  </span>
                  <textarea
                    name="note"
                    defaultValue={item.note}
                    rows={2}
                    maxLength={1000}
                    disabled={!editable || item.sent}
                    placeholder="Invoice dated 04-04-2026, booked 29-03-2026 — goods received after the year end."
                    className="rounded-control border-rule bg-paper text-13 border px-2 py-1.5 disabled:opacity-70"
                  />
                </label>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-13 text-ink-muted">
                      Money in question (₹)
                    </span>
                    <input
                      name="errorAmount"
                      defaultValue={item.errorAmount}
                      disabled={!editable || item.sent}
                      inputMode="decimal"
                      placeholder={String(
                        Math.round(Math.abs(item.amountPaise) / 100),
                      )}
                      className="rounded-control border-rule bg-paper num text-14 h-9 w-32 border px-2 disabled:opacity-70"
                    />
                  </label>
                  {editable && !item.sent && (
                    <button
                      type="submit"
                      disabled={pending}
                      className="rounded-control border-rule text-14 h-9 border px-3 disabled:opacity-60"
                    >
                      Save
                    </button>
                  )}
                  {item.sent && (
                    <span className="text-13 text-ink-muted">
                      Sent to the misstatement summary — it is answered on the
                      audit file now, not here.
                    </span>
                  )}
                </div>
                <p className="text-12 text-faint max-w-[70ch]">
                  Leave the amount blank if the whole entry is in question,
                  which is the usual case. Fill it in when only part of it is —
                  the projection to the population uses this figure.
                </p>
              </form>

              {editable && (
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-13 text-ink-muted">
                    Voucher photograph
                  </span>
                  <Uploader
                    engagementId={engagementId}
                    clientId={clientId}
                    sampleItemId={item.id}
                    label="Attach the voucher"
                    onDone={refresh}
                  />
                  <p className="text-12 text-faint">
                    A photograph taken on a phone at the client&rsquo;s office
                    attaches to this row, so the file can produce the voucher
                    for item {item.no} without anybody going back.
                  </p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/** The columns, one per line. */
function ColumnEditor({ attributes, onSave, pending }) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <p className="text-12 text-faint">
        {attributes.length} {attributes.length === 1 ? "question" : "questions"}{" "}
        on each item ·{" "}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="underline underline-offset-4"
        >
          change them
        </button>
      </p>
    );
  }

  return (
    <form
      action={(formData) => {
        onSave(formData);
        setEditing(false);
      }}
      className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border p-3"
    >
      <label className="flex flex-col gap-1">
        <span className="text-13 text-ink-muted font-medium">
          One question per line
        </span>
        <textarea
          name="attributes"
          defaultValue={attributes.join("\n")}
          rows={6}
          className="rounded-control border-rule bg-paper text-13 border px-2 py-1.5"
        />
      </label>
      {/* outside the label, so it is not read as the field's own name */}
      <p className="text-12 text-faint max-w-[70ch]">
        Every one has to be answerable yes or no — the grid is worthless the
        moment a column needs a sentence. Changing them clears the marks,
        because a tick made against one question must not quietly become a tick
        against another, and they cannot be changed at all once the sample is
        locked.
      </p>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-control border-rule text-14 h-9 border px-3 disabled:opacity-60"
        >
          Save the columns
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-control text-14 text-ink-muted h-9 px-3"
        >
          Leave them
        </button>
      </div>
    </form>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addAdjustment,
  removeAdjustment,
  sendUnadjusted,
  setAdjustmentState,
} from "../actions";

/**
 * 3 · the adjustments journal (P3-32).
 *
 * Three states, and the three are the point:
 *
 *  - **Proposed** — the firm has asked for it and nobody has decided.
 *  - **Passed in books** — the client passed it, so it moves the figures.
 *  - **Unadjusted** — the client would not pass it, so it does *not* move
 *    the figures and goes to the audit file's misstatement summary, where
 *    it is weighed against materiality.
 *
 * A journal with two states cannot tell the third story, which is the one
 * the opinion turns on.
 */
export default function Journal({ id, editable, heads, rows, unsent }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState(null);
  const [open, setOpen] = useState(false);

  const run = (fn) =>
    start(async () => {
      try {
        const said = await fn();
        if (said?.error || said?.ok) setState(said);
      } catch (error) {
        setState({ error: error?.message ?? "That did not save." });
      }
      router.refresh();
    });

  const byGroup = heads.reduce((map, head) => {
    const list = map.get(head.group) ?? [];
    list.push(head);
    map.set(head.group, list);
    return map;
  }, new Map());

  const headOptions = [...byGroup.entries()].map(([group, list]) => (
    <optgroup key={group} label={group}>
      {list.map((head) => (
        <option key={head.key} value={head.key}>
          {head.name}
        </option>
      ))}
    </optgroup>
  ));

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="font-display text-18">3 · Adjustments</h2>
          <p className="text-13 text-ink-muted max-w-[76ch]">
            Only an entry the client passed in the books moves a figure. One the
            firm proposed and the client would not pass is a misstatement the
            firm has decided to live with — and that belongs on the audit file,
            where it is weighed against materiality.
          </p>
        </div>
        {editable && unsent > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => sendUnadjusted(id))}
            className="rounded-control bg-carbon text-on-carbon text-14 h-9 px-3 font-medium disabled:opacity-60"
          >
            Send {unsent} unadjusted to the audit file
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-13 text-ink-muted">Nothing on the journal yet.</p>
      ) : (
        <div className="rounded-table border-rule bg-surface overflow-x-auto border">
          <table className="text-14 w-full min-w-[860px]">
            <thead>
              <tr className="border-rule text-12 text-faint border-b text-left">
                <th className="px-2 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Entry</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Heads</th>
                <th className="px-3 py-2 font-medium">State</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-rule border-b align-top last:border-0"
                >
                  <td className="num text-ink-muted px-2 py-2">{row.no}</td>
                  <td className="px-3 py-2">
                    {row.description}
                    {(row.source || row.by) && (
                      <div className="text-12 text-faint">
                        {[row.source, row.by].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </td>
                  <td className="num px-3 py-2 text-right">{row.amount}</td>
                  <td className="text-12 text-ink-muted px-3 py-2">
                    {row.head || row.counterHead ? (
                      <>
                        Dr {row.head || "—"}
                        <br />
                        Cr {row.counterHead || "—"}
                      </>
                    ) : (
                      "not set"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <label className="sr-only" htmlFor={`state-${row.id}`}>
                      State of entry {row.no}
                    </label>
                    <select
                      id={`state-${row.id}`}
                      value={row.state}
                      disabled={!editable || pending || row.sent}
                      onChange={(event) =>
                        run(() =>
                          setAdjustmentState(id, row.id, event.target.value),
                        )
                      }
                      className={`rounded-control bg-paper text-13 h-8 border px-2 disabled:opacity-70 ${
                        row.state === "Passed in books"
                          ? "border-filed"
                          : row.state === "Unadjusted"
                            ? "border-redpen"
                            : "border-waiting"
                      }`}
                    >
                      <option>Proposed</option>
                      <option>Passed in books</option>
                      <option>Unadjusted</option>
                    </select>
                    {row.sent && (
                      <div className="text-12 text-ink-muted mt-1">
                        on the misstatement summary
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {editable && !row.sent && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => removeAdjustment(id, row.id))}
                        className="text-12 text-ink-muted hover:text-redpen underline underline-offset-4 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editable && (
        <>
          {open ? (
            <form
              action={(formData) =>
                run(async () => {
                  const said = await addAdjustment(id, formData);
                  if (said?.ok) setOpen(false);
                  return said;
                })
              }
              className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4"
            >
              <label className="flex flex-col gap-1">
                <span className="text-13 text-ink-muted font-medium">
                  What the entry is
                </span>
                <textarea
                  name="description"
                  required
                  rows={2}
                  maxLength={600}
                  placeholder="Purchase booked 29-03-2026, goods received 04-04-2026 — reverse from this year"
                  className="rounded-control border-rule bg-paper text-13 border px-2 py-1.5"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-13 text-ink-muted font-medium">
                    Amount (₹)
                  </span>
                  <input
                    name="amount"
                    required
                    inputMode="decimal"
                    className="rounded-control border-rule bg-paper num text-14 h-9 border px-2"
                  />
                </label>

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="adj-state"
                    className="text-13 text-ink-muted font-medium"
                  >
                    State
                  </label>
                  <select
                    id="adj-state"
                    name="state"
                    defaultValue="Proposed"
                    className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                  >
                    <option>Proposed</option>
                    <option>Passed in books</option>
                    <option>Unadjusted</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="adj-dr"
                    className="text-13 text-ink-muted font-medium"
                  >
                    Debit
                  </label>
                  <select
                    id="adj-dr"
                    name="headKey"
                    defaultValue=""
                    className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                  >
                    <option value="">— not set —</option>
                    {headOptions}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="adj-cr"
                    className="text-13 text-ink-muted font-medium"
                  >
                    Credit
                  </label>
                  <select
                    id="adj-cr"
                    name="counterHeadKey"
                    defaultValue=""
                    className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                  >
                    <option value="">— not set —</option>
                    {headOptions}
                  </select>
                </div>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-13 text-ink-muted font-medium">
                  Where it came from
                </span>
                <input
                  name="source"
                  maxLength={200}
                  placeholder="Vouching exception, working paper H-4"
                  className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                />
              </label>

              <p className="text-12 text-faint max-w-[76ch]">
                Both heads are needed only for an entry passed in the books — a
                one-sided journal would put the balance sheet out by its own
                amount, and the screen would then report that the mapping is
                wrong.
              </p>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-control bg-carbon text-on-carbon text-14 h-9 px-3 font-medium disabled:opacity-60"
                >
                  Add to the journal
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-control border-rule text-14 text-ink-muted h-9 border px-3"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-control border-rule text-14 h-9 self-start border px-3"
            >
              Add an entry
            </button>
          )}
        </>
      )}

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

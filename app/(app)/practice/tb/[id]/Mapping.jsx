"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmSuggestions, mapLine } from "../actions";

/**
 * 2 · each ledger to a Schedule III head (P3-32).
 *
 * The step the whole feature exists for, and the one that is tedious the
 * first year and ten minutes every year after — because last year's
 * mapping for the same ledger name is offered as `remembered`.
 *
 * **A suggestion is not a mapping.** The status on every row says where
 * the head came from: unmapped, suggested from the client's own group
 * name, remembered from last year, or confirmed by a person on this set.
 * Only confirmed means somebody decided, and the firm can always say who —
 * which matters because a wrong head moves money between the balance sheet
 * and the profit and loss.
 */
export default function Mapping({
  id,
  editable,
  heads,
  rows,
  progress,
  unmappedTotal,
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState(null);
  const [only, setOnly] = useState("all");

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

  const shown = rows.filter((row) =>
    only === "all"
      ? true
      : only === "unmapped"
        ? row.status === "unmapped"
        : row.status === "suggested" || row.status === "remembered",
  );

  /* The heads grouped the way the statements read them, so the dropdown is
     a balance sheet and a profit and loss rather than an alphabet. */
  const byGroup = heads.reduce((map, head) => {
    const list = map.get(head.group) ?? [];
    list.push(head);
    map.set(head.group, list);
    return map;
  }, new Map());

  const waiting = progress.suggested + progress.remembered;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="font-display text-18">2 · Map the ledgers</h2>
          <p className="text-13 text-ink-muted max-w-[76ch]">
            A head for every ledger. Nothing is mapped without a person saying
            so — a suggestion from the client&rsquo;s own group names, or last
            year&rsquo;s decision, is offered and waits to be confirmed.
          </p>
        </div>
        <div className="text-13 flex flex-wrap items-center gap-x-3 gap-y-2">
          {progress.unmapped > 0 && (
            <span className="text-redpen">
              <span className="num">{progress.unmapped}</span> unmapped ·{" "}
              <span className="num">{unmappedTotal}</span>
            </span>
          )}
          {progress.suggested > 0 && (
            <span className="text-waiting">
              <span className="num">{progress.suggested}</span> suggested
            </span>
          )}
          {progress.remembered > 0 && (
            <span className="text-ink-muted">
              <span className="num">{progress.remembered}</span> from last year
            </span>
          )}
          {progress.confirmed > 0 && (
            <span className="text-filed">
              <span className="num">{progress.confirmed}</span> confirmed
            </span>
          )}
          {editable && waiting > 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => confirmSuggestions(id))}
              className="rounded-control bg-carbon text-on-carbon text-14 h-9 px-3 font-medium disabled:opacity-60"
            >
              Confirm all {waiting}
            </button>
          )}
        </div>
      </div>

      <div className="text-13 flex flex-wrap gap-2">
        {[
          ["all", `All ${rows.length}`],
          ["unmapped", `Unmapped ${progress.unmapped}`],
          ["waiting", `To confirm ${waiting}`],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setOnly(key)}
            aria-pressed={only === key}
            className={`rounded-control h-8 border px-2 ${
              only === key
                ? "border-carbon bg-carbon-wash text-ink"
                : "border-rule text-ink-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-table border-rule bg-surface overflow-x-auto border">
        <table className="text-14 w-full min-w-[820px]">
          <thead>
            <tr className="border-rule text-12 text-faint border-b text-left">
              <th className="px-3 py-2 font-medium">Ledger</th>
              <th className="px-3 py-2 font-medium">Their group</th>
              <th className="px-3 py-2 text-right font-medium">Closing</th>
              <th className="px-3 py-2 font-medium">Schedule III head</th>
              <th className="px-3 py-2 font-medium">Where from</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr
                key={row.id}
                className={`border-rule border-b last:border-0 ${
                  row.status === "unmapped" ? "bg-redpen-wash" : ""
                }`}
              >
                <td className="px-3 py-2 font-medium">{row.ledger}</td>
                <td className="text-13 text-ink-muted px-3 py-2">
                  {row.group || "—"}
                </td>
                <td className="num px-3 py-2 text-right">
                  {row.credit ? `(${row.amount})` : row.amount}
                </td>
                <td className="px-3 py-2">
                  <label className="sr-only" htmlFor={`head-${row.id}`}>
                    Head for {row.ledger}
                  </label>
                  <select
                    id={`head-${row.id}`}
                    value={row.headKey}
                    disabled={!editable || pending}
                    onChange={(event) =>
                      run(() => mapLine(id, row.id, event.target.value))
                    }
                    className={`rounded-control bg-paper text-13 h-8 max-w-[18rem] border px-2 disabled:opacity-70 ${
                      row.status === "unmapped"
                        ? "border-redpen"
                        : row.status === "confirmed"
                          ? "border-rule"
                          : "border-waiting"
                    }`}
                  >
                    <option value="">— choose a head —</option>
                    {[...byGroup.entries()].map(([group, list]) => (
                      <optgroup key={group} label={group}>
                        {list.map((head) => (
                          <option key={head.key} value={head.key}>
                            {head.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </td>
                <td className="text-12 px-3 py-2">
                  {row.status === "unmapped" ? (
                    <span className="text-redpen">nobody has said</span>
                  ) : row.status === "suggested" ? (
                    <span className="text-waiting">
                      guessed from their group — confirm it
                    </span>
                  ) : row.status === "remembered" ? (
                    <span className="text-waiting">
                      last year&rsquo;s — confirm it
                    </span>
                  ) : (
                    <span className="text-filed">
                      {row.by ? `confirmed by ${row.by}` : "confirmed"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {shown.length === 0 && (
        <p className="text-13 text-ink-muted">Nothing in that filter.</p>
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

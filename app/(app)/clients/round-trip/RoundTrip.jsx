"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  previewRoundTrip,
  commitRoundTrip,
  undoFieldChange,
} from "./actions";

/**
 * Upload, look at every change, tick what to apply (P3-18a).
 *
 * The ticks are the point. A row-level "import this row" is what the
 * existing import offers and it is right for *creating*; for changing, the
 * thing that goes wrong is one column — a formula filled down, a date
 * Excel reformatted, a trailing space on a status — and refusing a whole
 * row to stop one bad field is how people end up applying it anyway.
 *
 * Everything is ticked when the preview opens, because the ordinary case is
 * a sheet somebody has already corrected deliberately. A held change shows
 * its tick too: ticking it sends it to a partner rather than writing it.
 */
export default function RoundTrip() {
  const router = useRouter();
  const formRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [off, setOff] = useState(() => new Set());
  const [pending, startTransition] = useTransition();

  const key = (row, change) => `${row.clientId}:${change.field}`;

  function onPreview(formData) {
    startTransition(async () => {
      setError("");
      setResult(null);
      const response = await previewRoundTrip(null, formData);
      if (response.error) {
        setPreview(null);
        setError(response.error);
        return;
      }
      setOff(new Set());
      setPreview(response);
    });
  }

  function onCommit() {
    startTransition(async () => {
      setError("");
      const formData = new FormData(formRef.current);
      for (const row of preview.rows) {
        for (const change of row.changes) {
          if (!off.has(key(row, change))) {
            formData.append("apply", key(row, change));
          }
        }
      }
      const response = await commitRoundTrip(null, formData);
      if (response.error) {
        setError(response.error);
        return;
      }
      setResult(response);
      setPreview(null);
      router.refresh();
    });
  }

  function undo(change) {
    startTransition(async () => {
      const response = await undoFieldChange(change.clientId, change.field);
      if (response.error) {
        setError(response.error);
        return;
      }
      setResult((current) => ({
        ...current,
        done: current.done.filter(
          (row) =>
            !(row.clientId === change.clientId && row.field === change.field),
        ),
        ok: response.ok,
      }));
      router.refresh();
    });
  }

  const changed = preview?.rows.filter((row) => row.changes.length > 0) ?? [];
  const problems = preview?.rows.filter((row) => row.errors.length > 0) ?? [];
  const ticked =
    changed.reduce(
      (sum, row) =>
        sum + row.changes.filter((change) => !off.has(key(row, change))).length,
      0,
    ) ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p
          role="alert"
          className="rounded-ledger border-redpen bg-redpen-wash text-13 text-redpen border px-3 py-2"
        >
          {error}
        </p>
      )}

      <form
        ref={formRef}
        action={onPreview}
        className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4"
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-13 font-medium">The corrected sheet</span>
            <input
              type="file"
              name="file"
              accept=".csv,text/csv"
              required
              className="text-14"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-control border-rule bg-surface text-14 h-9 border px-3 disabled:opacity-60"
          >
            Show me what would change
          </button>
        </div>
        <p className="text-12 text-ink-muted">
          <Link
            href="/clients/round-trip/template"
            className="underline underline-offset-4"
          >
            Download the list first
          </Link>
          , correct it, and save it as CSV UTF-8. A blank cell changes
          nothing — it never clears a field.
        </p>
      </form>

      {result && (
        <div className="flex flex-col gap-2">
          <p
            role="status"
            className="rounded-ledger border-filed bg-filed-wash text-13 text-filed border px-3 py-2"
          >
            {result.ok}
          </p>

          {result.done?.length > 0 && (
            <>
              <h2 className="text-15 font-bold">What changed</h2>
              <ul className="rounded-table border-rule bg-surface divide-rule divide-y border">
                {result.done.map((change) => (
                  <li
                    key={`${change.clientId}:${change.field}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2"
                  >
                    <span className="text-14">
                      {change.name} · {change.label}
                      <span className="text-12 text-ink-muted block">
                        {change.from} → {change.to}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => undo(change)}
                      disabled={pending}
                      className="rounded-control border-rule bg-surface text-13 h-8 border px-3 disabled:opacity-60"
                    >
                      Put it back
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-12 text-ink-muted">
                Undo is for this batch. Once you leave the page, what changed
                is on each client&rsquo;s own Activity tab, where it is kept
                for good.
              </p>
            </>
          )}

          {result.held > 0 && (
            <p className="text-13">
              <Link
                href="/clients/changes"
                className="underline underline-offset-4"
              >
                {result.held} {result.held === 1 ? "change is" : "changes are"}{" "}
                waiting for a partner
              </Link>
              .
            </p>
          )}

          {result.skipped?.length > 0 && (
            <ul className="text-13 text-redpen list-disc pl-5">
              {result.skipped.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {preview && (
        <div className="flex flex-col gap-3">
          <p className="rounded-ledger border-rule bg-sunk text-13 border px-3 py-2">
            <strong>{preview.updateCount}</strong> clients have something to
            change, <strong>{preview.unchangedCount}</strong> are the same as
            the sheet, <strong>{preview.newCount}</strong> rows have no client
            code
            {preview.newCount > 0 && (
              <>
                {" "}
                — those are ignored here;{" "}
                <Link
                  href="/clients/import"
                  className="underline underline-offset-4"
                >
                  add new clients on the import screen
                </Link>
              </>
            )}
            {preview.heldCount > 0 && (
              <>
                . <strong>{preview.heldCount}</strong> of the changes are
                identity and will wait for a partner
              </>
            )}
            .
          </p>

          {preview.unknownHeaders?.length > 0 && (
            <p className="text-13 text-waiting">
              Columns nobody reads, so nothing in them is used:{" "}
              {preview.unknownHeaders.join(", ")}.
            </p>
          )}

          {problems.length > 0 && (
            <ul className="text-13 text-redpen list-disc pl-5">
              {problems.map((row) => (
                <li key={row.line}>
                  Row {row.line} ({row.name}): {row.errors[0]}
                </li>
              ))}
            </ul>
          )}

          {changed.map((row) => (
            <section
              key={row.line}
              className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border p-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-14 font-medium">{row.name}</h3>
                <span className="text-12 text-ink-muted font-mono">
                  {row.code} · row {row.line}
                </span>
              </div>

              <ul className="flex flex-col gap-1">
                {row.changes.map((change) => {
                  const id = key(row, change);
                  return (
                    <li key={id}>
                      <label className="text-14 flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={!off.has(id)}
                          onChange={(event) =>
                            setOff((all) => {
                              const next = new Set(all);
                              if (event.target.checked) next.delete(id);
                              else next.add(id);
                              return next;
                            })
                          }
                          className="mt-1"
                        />
                        <span>
                          {change.label}
                          <span className="text-13 block">
                            <span className="text-ink-muted">
                              {change.from}
                            </span>{" "}
                            → <strong>{change.to}</strong>
                          </span>
                          {change.held && (
                            <span className="text-12 text-waiting block">
                              identity — a partner decides on this one
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {changed.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onCommit}
                disabled={pending || ticked === 0}
                className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-4 font-medium disabled:opacity-60"
              >
                Apply {ticked} {ticked === 1 ? "change" : "changes"}
              </button>
              <span className="text-13 text-ink-muted">
                Untick anything you do not want. Nothing else in the sheet is
                read.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importTrialBalance } from "../actions";

/**
 * 1 · the trial balance in (P3-32).
 *
 * Pasted, not uploaded, for the same reason as a sampling population: what
 * the firm has is the client's export open in Excel, and what Excel puts
 * on the clipboard is tab-separated.
 *
 * **An out-of-balance trial balance is reported, not refused.** A trial
 * balance that does not add to zero is the client's problem to explain,
 * and the firm needs to see the figure to ask about it — refusing the
 * import would leave them with nothing to point at.
 */
export default function Import({
  id,
  editable,
  locked,
  source,
  ledgers,
  difference,
  imported,
  importedBy,
  remembered,
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState(null);
  const [rows, setRows] = useState("");

  function run() {
    start(async () => {
      const body = new FormData();
      body.set("rows", rows);
      body.set("source", source);
      try {
        setState(await importTrialBalance(id, body));
      } catch (error) {
        setState({ error: error?.message ?? "That did not import." });
      }
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-18">1 · Import the trial balance</h2>
        <p className="text-13 text-ink-muted max-w-[76ch]">
          Tally, Busy, Zoho Books, or any spreadsheet with a ledger, a group,
          and either a closing balance or a debit and a credit. Select the range
          in Excel, copy, and paste it here — the columns are found by name, in
          any order, and anything else on the row is ignored.
        </p>
      </div>

      {ledgers > 0 && (
        <div className="rounded-ledger border-rule bg-surface flex flex-col gap-1 border p-4">
          <p className="text-14">
            <span className="num font-medium">{ledgers}</span> ledgers
            {imported && (
              <>
                {" "}
                · imported {imported}
                {importedBy ? ` by ${importedBy}` : ""}
              </>
            )}
            {remembered > 0 && (
              <>
                {" "}
                · <span className="num">{remembered}</span> mapped from last
                year
              </>
            )}
          </p>
          <p
            className={`text-13 ${difference === 0 ? "text-filed" : "text-redpen"}`}
          >
            {difference === 0
              ? "The trial balance totals to zero."
              : `Out of balance by ₹${Math.abs(difference / 100).toLocaleString("en-IN")}. ` +
                "A rupee or two is usually a rounding column the export dropped; anything larger is a ledger that did not come across, and the balance sheet will be out by the same figure."}
          </p>
        </div>
      )}

      {locked ? (
        <p className="text-13 text-ink-muted">
          These statements are locked, so the trial balance cannot be replaced.
          Unlock them on step 5 and say why.
        </p>
      ) : editable ? (
        <div className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border p-4">
          <label className="flex flex-col gap-1">
            <span className="text-13 text-ink-muted font-medium">
              {ledgers > 0
                ? "Paste a new trial balance to replace this one"
                : "Paste the trial balance"}
            </span>
            <textarea
              value={rows}
              onChange={(event) => setRows(event.target.value)}
              rows={10}
              spellCheck={false}
              placeholder={
                "Ledger\tGroup\tClosing\nShare Capital\tCapital Account\t10,00,000 Cr\nPlant and Machinery\tFixed Assets\t12,00,000"
              }
              className="rounded-control border-rule bg-paper text-12 border px-2 py-1.5 font-mono"
            />
          </label>
          <p className="text-12 text-faint max-w-[76ch]">
            A credit may be written with a minus, in brackets, or with
            &ldquo;Cr&rdquo; after it — all three are read the same way. Total
            rows and nil balances are left out, and every row that cannot be
            read is listed with its line number rather than silently dropped.
            {ledgers > 0 &&
              " Importing again replaces every line, and the mapping with it."}
          </p>
          <button
            type="button"
            onClick={run}
            disabled={pending || !rows.trim()}
            className="rounded-control bg-carbon text-on-carbon text-14 h-9 self-start px-3 font-medium disabled:opacity-60"
          >
            {pending ? "Reading…" : "Import"}
          </button>
        </div>
      ) : (
        <p className="text-13 text-ink-muted">
          You can read this set of statements but not change it.
        </p>
      )}

      {state?.error && (
        <p role="alert" className="text-13 text-redpen">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <div className="flex flex-col gap-1">
          <p role="status" className="text-13 text-filed">
            {state.ok}
          </p>
          {state.refusedCount > 0 && (
            <div className="rounded-ledger border-waiting bg-waiting-wash text-12 max-w-[76ch] border px-2 py-1.5">
              <strong>
                {state.refusedCount}{" "}
                {state.refusedCount === 1 ? "row was" : "rows were"} not read:
              </strong>
              <ul className="mt-1 flex flex-col">
                {state.refused.map((row) => (
                  <li key={`${row.line}-${row.why}`}>
                    line <span className="num">{row.line}</span> — {row.why}
                  </li>
                ))}
              </ul>
              {state.refusedCount > state.refused.length && (
                <p className="mt-1">
                  …and {state.refusedCount - state.refused.length} more.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

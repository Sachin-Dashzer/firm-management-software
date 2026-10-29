"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { lockTrialBalance, unlockTrialBalance } from "../actions";

/**
 * 5 · the statements, and settling them (P3-32).
 *
 * The balance sheet and the profit and loss as they fall out of the
 * mapping, with the one figure that matters most at the bottom: whether
 * the two sides agree. They are drawn only once every ledger has a head,
 * because a balance sheet with an unmapped ledger is out by exactly its
 * balance and looks like a balance sheet all the same.
 *
 * **Locking is refused while they do not balance.** A set that does not
 * balance is not a set of statements, and putting it in the file as though
 * it were is the one thing this step must not allow.
 */
export default function Settle({
  id,
  editable,
  mayUnlock,
  locked,
  fy,
  balanceGroups,
  result,
  notes,
  unadjusted,
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState(null);
  const [unlocking, setUnlocking] = useState(false);
  const [why, setWhy] = useState("");

  const run = (fn) =>
    start(async () => {
      try {
        setState(await fn());
      } catch (error) {
        setState({ error: error?.message ?? "That did not go through." });
      }
      router.refresh();
    });

  const liabilityGroups = balanceGroups.filter((group) =>
    result.rows.some((row) => row.group === group && row.side === "liability"),
  );
  const assetGroups = balanceGroups.filter((group) =>
    result.rows.some((row) => row.group === group && row.side === "asset"),
  );

  const income = result.rows.filter((row) => row.side === "income");
  const expenses = result.rows.filter(
    (row) => row.side === "expense" && row.key !== "tax",
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="font-display text-18">5 · Review and export</h2>
          <p className="text-13 text-ink-muted max-w-[76ch]">
            As they fall out of the mapping and the journal. Only entries passed
            in the books have moved a figure.
          </p>
        </div>
        <a
          href={`/practice/tb/${id}/export`}
          className="rounded-control border-rule text-14 hover:bg-carbon-wash h-9 border px-3 leading-9"
        >
          Export to Excel
        </a>
      </div>

      <div
        className={`rounded-ledger text-13 border px-3 py-2 ${
          result.balanced
            ? "border-filed bg-filed-wash"
            : "border-redpen bg-redpen-wash"
        }`}
      >
        {result.balanced ? (
          <>
            <strong>Balanced to the rupee.</strong> Assets{" "}
            <span className="num">{result.assets}</span>, equity and liabilities{" "}
            <span className="num">{result.liabilities}</span> including the
            profit for the year.
          </>
        ) : (
          <>
            <strong>
              The two sides differ by{" "}
              <span className="num">{result.difference}</span>.
            </strong>{" "}
            Every ledger has a head, so this is either a trial balance that did
            not add to zero to begin with, or a one-sided entry on the journal.
            Both are on the earlier steps.
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Statement title={`Balance sheet as at the end of ${fy}`}>
          <Section label="Equity and liabilities" />
          {liabilityGroups.map((group) => (
            <Group
              key={group}
              label={group}
              rows={result.rows.filter(
                (row) => row.group === group && row.side === "liability",
              )}
            />
          ))}
          <Line
            label="Profit for the year, into reserves"
            amount={result.profit}
            note="A trial balance is struck before this entry is passed."
          />
          <Total label="Total" amount={result.liabilities} />

          <Section label="Assets" />
          {assetGroups.map((group) => (
            <Group
              key={group}
              label={group}
              rows={result.rows.filter(
                (row) => row.group === group && row.side === "asset",
              )}
            />
          ))}
          <Total label="Total" amount={result.assets} />
        </Statement>

        <Statement title={`Statement of profit and loss for ${fy}`}>
          <Section label="Income" />
          {income.map((row) => (
            <Line key={row.key} label={row.name} amount={row.amount} />
          ))}
          <Total label="Total income" amount={result.income} />

          <Section label="Expenses" />
          {expenses.map((row) => (
            <Line key={row.key} label={row.name} amount={row.amount} />
          ))}
          <Total label="Profit before tax" amount={result.profitBeforeTax} />
          <Line label="Tax expense" amount={result.taxExpense} />
          <Total label="Profit for the year" amount={result.profit} />
        </Statement>
      </div>

      <p className="text-13 text-ink-muted max-w-[76ch]">
        <span className="num">{notes}</span> notes are needed with these
        statements (step 4). The export carries the balance sheet, the profit
        and loss, the mapped trial balance and the journal —{" "}
        <strong>it does not carry the notes themselves</strong>, because their
        wording is the firm&rsquo;s and this application does not draft
        sentences for a statement somebody will sign.
      </p>

      {unadjusted > 0 && (
        <p className="text-13 max-w-[76ch]">
          <span className="num">{unadjusted}</span> unadjusted{" "}
          {unadjusted === 1 ? "entry has" : "entries have"} not moved these
          figures. They belong on the audit file&rsquo;s misstatement summary,
          where they are weighed against materiality — step 3 sends them.
        </p>
      )}

      {editable && !locked && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={pending || !result.balanced}
            onClick={() => run(() => lockTrialBalance(id))}
            className="rounded-control bg-carbon text-on-carbon text-14 h-9 self-start px-3 font-medium disabled:opacity-60"
          >
            Lock these statements
          </button>
          {!result.balanced && (
            <span className="text-12 text-ink-muted">
              Not while the two sides differ.
            </span>
          )}
        </div>
      )}

      {locked && mayUnlock && (
        <div className="flex flex-col gap-2">
          {unlocking ? (
            <>
              <label className="flex max-w-[48rem] flex-col gap-1">
                <span className="text-13 text-ink-muted">
                  Why are they being unlocked?
                </span>
                <textarea
                  value={why}
                  onChange={(event) => setWhy(event.target.value)}
                  rows={2}
                  className="rounded-control border-rule bg-paper text-13 border px-2 py-1.5"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending || why.trim().length < 15}
                  onClick={() =>
                    run(async () => {
                      const said = await unlockTrialBalance(id, why);
                      if (said?.ok) {
                        setUnlocking(false);
                        setWhy("");
                      }
                      return said;
                    })
                  }
                  className="rounded-control border-redpen text-redpen text-14 h-9 border px-3 disabled:opacity-60"
                >
                  Unlock
                </button>
                <button
                  type="button"
                  onClick={() => setUnlocking(false)}
                  className="rounded-control border-rule text-14 text-ink-muted h-9 border px-3"
                >
                  Keep them locked
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setUnlocking(true)}
              className="text-13 text-ink-muted self-start underline underline-offset-4"
            >
              Unlock, with a reason
            </button>
          )}
        </div>
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

function Statement({ title, children }) {
  return (
    <div className="rounded-ledger border-rule bg-surface flex flex-col border p-4">
      <h3 className="font-display text-15 mb-2 font-semibold">{title}</h3>
      <dl className="flex flex-col">{children}</dl>
    </div>
  );
}

function Section({ label }) {
  return (
    <div className="border-rule text-12 text-faint mt-3 border-b pb-1 first:mt-0">
      {label}
    </div>
  );
}

function Group({ label, rows }) {
  return (
    <>
      <div className="text-12 text-ink-muted mt-2">{label}</div>
      {rows.map((row) => (
        <Line key={row.key} label={row.name} amount={row.amount} />
      ))}
    </>
  );
}

function Line({ label, amount, note }) {
  return (
    <div className="border-rule-soft flex flex-col border-b py-1 last:border-0">
      <div className="text-14 flex items-baseline justify-between gap-3">
        <dt className="min-w-0">{label}</dt>
        <dd className="num shrink-0">{amount}</dd>
      </div>
      {note && <p className="text-12 text-faint">{note}</p>}
    </div>
  );
}

function Total({ label, amount }) {
  return (
    <div className="border-rule text-14 flex items-baseline justify-between gap-3 border-t py-1 font-semibold">
      <dt>{label}</dt>
      <dd className="num">{amount}</dd>
    </div>
  );
}

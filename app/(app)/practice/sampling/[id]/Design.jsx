"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { METHODS } from "@/lib/practice/sampling";
import {
  saveDesign,
  drawSample,
  reseedSample,
  lockSample,
  unlockSample,
} from "../actions";

/**
 * 1 · the design, and the draw (P3-30).
 *
 * The design is a judgement being recorded, not a calculator: nothing here
 * works out a sample size from a confidence level, because SA 530 gives no
 * formula and inventing one would put a made-up professional rule on a
 * working paper. The confidence and the tolerable misstatement sit beside
 * the size as the reasoning for it.
 *
 * The population is pasted rather than uploaded, because what the firm has
 * is a ledger on screen in Excel and a tab-separated paste is one keypress
 * away. Every row the reader refuses is named with its line number.
 */
export default function Design({ id, sample, editable, mayUnlock }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState(null);
  const [method, setMethod] = useState(sample.method);
  const [population, setPopulation] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [why, setWhy] = useState("");

  const run = (fn) =>
    start(async () => {
      const result = await fn();
      setState(result ?? null);
      router.refresh();
    });

  const locked = sample.locked;
  const chosen = METHODS.find((row) => row.key === method);

  return (
    <aside className="flex flex-col gap-4">
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
        <h2 className="font-display text-15 font-semibold">
          1 · Sample design
        </h2>

        <form
          action={(formData) => run(() => saveDesign(id, formData))}
          className="flex flex-col gap-3"
        >
          <label className="flex flex-col gap-1">
            <span className="text-13 text-ink-muted">
              Where the population came from
            </span>
            <input
              name="population"
              defaultValue={sample.population}
              disabled={!editable || locked}
              maxLength={300}
              placeholder="Purchase register, Tally, 01-04-2025 to 31-03-2026"
              className="rounded-control border-rule bg-paper text-14 h-9 border px-2 disabled:opacity-70"
            />
          </label>

          {/*
            The explanation is a sibling of the label, not inside it.

            A `<span>` of help text inside a wrapping `<label>` becomes part
            of the control's accessible name, so a screen reader announces
            the whole paragraph every time the select takes focus — and
            "Method" stops being findable by its own name at all.
          */}
          {/*
            A select is labelled by `htmlFor`, not by being wrapped.

            Wrapping it puts the option text inside the label's own text,
            so the control ends up announced as "Method Monetary unit
            Random Systematic" — and it cannot be found by its own name at
            all. The explanation is a sibling for the same reason.
          */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="sample-reconciled"
              className="text-13 text-ink-muted"
            >
              Does it agree to the trial balance?
            </label>
            <select
              id="sample-reconciled"
              name="reconciledToTb"
              defaultValue={sample.reconciledToTb}
              disabled={!editable || locked}
              className="rounded-control border-rule bg-paper text-14 h-9 border px-2 disabled:opacity-70"
            >
              <option value="">— nobody has said —</option>
              <option value="yes">Yes, agreed</option>
              <option value="no">No, it does not</option>
            </select>
            <p className="text-12 text-faint">
              A sample from a population that does not agree to the books is
              evidence about nothing, so this has to be answered before the
              sample can be locked.
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="sample-method" className="text-13 text-ink-muted">
              Method
            </label>
            <select
              id="sample-method"
              name="method"
              value={method}
              onChange={(event) => setMethod(event.target.value)}
              disabled={!editable || locked}
              className="rounded-control border-rule bg-paper text-14 h-9 border px-2 disabled:opacity-70"
            >
              {METHODS.map((row) => (
                <option key={row.key} value={row.key}>
                  {row.name}
                </option>
              ))}
            </select>
            {chosen && <p className="text-12 text-faint">{chosen.what}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-13 text-ink-muted">Sample size</span>
              <input
                name="size"
                type="number"
                min={1}
                max={2000}
                defaultValue={sample.size}
                disabled={!editable || locked}
                className="rounded-control border-rule bg-paper num text-14 h-9 border px-2 disabled:opacity-70"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-13 text-ink-muted">Confidence</span>
              <input
                name="confidence"
                defaultValue={sample.confidence}
                disabled={!editable || locked}
                maxLength={40}
                placeholder="95%"
                className="rounded-control border-rule bg-paper text-14 h-9 border px-2 disabled:opacity-70"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-13 text-ink-muted">
                Tolerable misstatement (₹)
              </span>
              <input
                name="tolerable"
                defaultValue={sample.tolerable}
                disabled={!editable || locked}
                inputMode="decimal"
                className="rounded-control border-rule bg-paper num text-14 h-9 border px-2 disabled:opacity-70"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-13 text-ink-muted">
                Key items above (₹)
              </span>
              <input
                name="keyAbove"
                defaultValue={sample.keyAbove}
                disabled={!editable || locked}
                inputMode="decimal"
                className="rounded-control border-rule bg-paper num text-14 h-9 border px-2 disabled:opacity-70"
              />
            </label>
          </div>

          <div className="flex flex-col gap-1">
            <label className="flex flex-col gap-1">
              <span className="text-13 text-ink-muted">
                Why this size, and this method
              </span>
              <textarea
                name="basis"
                defaultValue={sample.basis}
                disabled={!editable || locked}
                rows={3}
                maxLength={1000}
                placeholder="Controls over purchases tested and found reliable; analytical review covers the rest of the year; 25 items off the firm's table at this risk level."
                className="rounded-control border-rule bg-paper text-13 border px-2 py-1.5 disabled:opacity-70"
              />
            </label>
            <p className="text-12 text-faint">
              Nothing here works out a size from the confidence level. SA 530
              gives no formula, so the number is the firm&rsquo;s judgement and
              this is where the judgement is recorded.
            </p>
          </div>

          {editable && !locked && (
            <button
              type="submit"
              disabled={pending}
              className="rounded-control border-rule text-14 h-9 self-start border px-3 disabled:opacity-60"
            >
              Save the design
            </button>
          )}
        </form>
      </section>

      {/* --- the draw --- */}
      {editable && !locked && (
        <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
          <h2 className="font-display text-15 font-semibold">
            Draw the sample
          </h2>
          <p className="text-12 text-faint">
            Paste the population from Excel — the first row the column names,
            and among them a party, an amount, and a reference and date if you
            have them. Anything else on the row is ignored.
          </p>
          <textarea
            value={population}
            onChange={(event) => setPopulation(event.target.value)}
            rows={6}
            spellCheck={false}
            aria-label="The population, pasted"
            placeholder={
              "Voucher no\tParty\tDate\tAmount\nPV-1\tKumar Packaging\t04-04-2026\t485000"
            }
            className="rounded-control border-rule bg-paper text-12 border px-2 py-1.5 font-mono"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || !population.trim()}
              onClick={() =>
                run(() => {
                  const body = new FormData();
                  body.set("population", population);
                  return drawSample(id, body);
                })
              }
              className="rounded-control bg-carbon text-on-carbon text-14 h-9 px-3 font-medium disabled:opacity-60"
            >
              {pending ? "Drawing…" : "Draw"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => reseedSample(id))}
              className="rounded-control border-rule text-14 text-ink-muted h-9 border px-3 disabled:opacity-60"
            >
              New seed
            </button>
          </div>
          <p className="text-12 text-faint">
            Drawing again with the same seed gives the same rows. A new seed
            gives a different sample — which is a thing to do before looking,
            not after.
          </p>
        </section>
      )}

      {/* --- what was drawn --- */}
      {sample.drawn > 0 && (
        <section className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border p-4">
          <h2 className="font-display text-15 font-semibold">What was drawn</h2>
          <dl className="text-13 flex flex-col gap-1">
            <Row
              label="Entries in the population"
              value={sample.entries.toLocaleString("en-IN")}
            />
            <Row label="Value" value={sample.value} />
            <Row label="Selected" value={String(sample.drawn)} />
            {sample.keyCount > 0 && (
              <Row
                label="Of those, taken in full"
                value={String(sample.keyCount)}
              />
            )}
            {sample.interval && (
              <Row label="Sampling interval" value={sample.interval} />
            )}
            {sample.drawnAt && <Row label="Drawn" value={sample.drawnAt} />}
          </dl>
          {sample.drawNote && (
            <p className="text-12 text-faint">{sample.drawNote}</p>
          )}

          {editable && !locked && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => lockSample(id))}
              className="rounded-control bg-carbon text-on-carbon text-14 mt-1 h-9 self-start px-3 font-medium disabled:opacity-60"
            >
              Lock the sample
            </button>
          )}

          {locked && mayUnlock && (
            <div className="mt-1 flex flex-col gap-2">
              {unlocking ? (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-13 text-ink-muted">
                      Why is it being unlocked?
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
                          const result = await unlockSample(id, why);
                          if (result?.ok) {
                            setUnlocking(false);
                            setWhy("");
                          }
                          return result;
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
                      Keep it locked
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
        </section>
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
            <div className="rounded-ledger border-waiting bg-waiting-wash text-12 border px-2 py-1.5">
              <strong>
                {state.refusedCount}{" "}
                {state.refusedCount === 1 ? "row was" : "rows were"} not read
                and so are not in the population:
              </strong>
              <ul className="mt-1 flex flex-col">
                {state.refused.map((row) => (
                  <li key={row.line}>
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
    </aside>
  );
}

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div className="border-rule-soft flex items-baseline justify-between gap-3 border-b pb-1 last:border-0">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="num">{value}</dd>
    </div>
  );
}

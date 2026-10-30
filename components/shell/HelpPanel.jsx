"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Question, X } from "@phosphor-icons/react";
import { screenKeyFor, screenFor } from "@/lib/learning/screens";
import { procedureFor } from "@/app/(app)/learning/actions";

/**
 * How the firm does *this*, beside the work (P3-19).
 *
 * The panel knows which screen it is on and asks for that procedure when
 * it opens — not on every page load, because most of the time nobody wants
 * it and a query per screen for a panel nobody opened is a tax on every
 * page in the system.
 *
 * An unwritten procedure is a **state with words**, not a blank: it says
 * nobody has written it and who could. The system never fills that silence
 * with something plausible, which is the whole of D65.
 */
export default function HelpPanel() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(null);
  const [pending, startTransition] = useTransition();

  const key = screenKeyFor(pathname);
  const screen = key ? screenFor(key) : null;

  // a different screen means a different procedure
  useEffect(() => {
    setState(null);
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open || state || !key) return;
    startTransition(async () => {
      setState(await procedureFor(key));
    });
  }, [open, state, key]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="How we do this"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        className="rounded-control text-ink-muted hover:bg-carbon-wash hover:text-ink grid size-9 place-items-center transition-colors duration-150"
      >
        <Question size={18} />
      </button>

      {open && (
        <aside
          aria-label="How we do this"
          className="border-rule bg-surface fixed top-0 right-0 bottom-0 z-40 flex w-full max-w-[380px] flex-col gap-3 overflow-y-auto border-l p-4 shadow-lg"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-12 text-ink-muted">How we do this</p>
              <h2 className="font-display text-15 font-semibold">
                {screen?.label ?? "This screen"}
              </h2>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="rounded-ledger text-ink-muted hover:bg-carbon-wash grid size-8 place-items-center"
            >
              <X size={16} />
            </button>
          </div>

          {!key && (
            <p className="text-14 text-ink-muted">
              This screen is not one the firm keeps a procedure for.{" "}
              <Link href="/learning" className="underline underline-offset-4">
                The ones it does
              </Link>
              .
            </p>
          )}

          {key && pending && !state && (
            <p className="text-14 text-ink-muted">Looking…</p>
          )}

          {key && state && !state.written && (
            <div className="flex flex-col gap-2">
              <p className="text-14">
                Nobody at the firm has written this one up yet.
              </p>
              <p className="text-13 text-ink-muted">
                Nothing is filled in for you here: a procedure written by the
                system would be somebody&rsquo;s guess at how PHMG works, and
                people follow what they read.
              </p>
              {state.mayWrite ? (
                <Link
                  href={`/learning/${key}`}
                  className="rounded-control bg-carbon text-13 text-on-carbon h-8 w-fit px-3 leading-8 font-medium"
                >
                  Write it
                </Link>
              ) : (
                <p className="text-13 text-ink-muted">
                  A CA or a partner writes these — ask whoever does this job
                  most often.
                </p>
              )}
            </div>
          )}

          {key && state?.written && (
            <div className="flex flex-col gap-3">
              {state.stale && (
                <p className="rounded-ledger border-waiting bg-waiting-wash text-12 border px-2 py-1">
                  No partner has confirmed this in the last year.
                </p>
              )}

              {state.procedure.intro && (
                <p className="text-14">{state.procedure.intro}</p>
              )}

              <ol className="flex list-decimal flex-col gap-2 pl-5">
                {state.procedure.steps.map((step) => (
                  <li key={step.id} className="text-14">
                    {step.text}
                    {step.note && (
                      <span className="text-13 text-ink-muted block">
                        {step.note}
                      </span>
                    )}
                  </li>
                ))}
              </ol>

              {state.procedure.notFor.length > 0 && (
                <div className="rounded-ledger border-rule bg-sunk flex flex-col gap-1 border px-3 py-2">
                  <p className="text-13 font-medium">What this is not for</p>
                  <ul className="text-13 list-disc pl-5">
                    {state.procedure.notFor.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-12 text-ink-muted">
                {state.procedure.writtenByName
                  ? `Written by ${state.procedure.writtenByName}`
                  : "Written at the firm"}
                {state.procedure.reviewedByName &&
                  ` · confirmed by ${state.procedure.reviewedByName}`}
                {" · "}
                <Link
                  href={`/learning/${key}`}
                  className="underline underline-offset-4"
                >
                  open it
                </Link>
              </p>
            </div>
          )}
        </aside>
      )}
    </>
  );
}

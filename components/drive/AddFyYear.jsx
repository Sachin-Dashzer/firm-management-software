"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "@phosphor-icons/react";
import { addFyFolder, fyOptions } from "@/app/(app)/documents/folders/actions";

/**
 * A financial year on a client's service, before the job exists (brief §4).
 *
 * Papers arrive early — the bank statements for a year whose audit has not
 * been raised yet — and they have to go somewhere that is not "unfiled".
 * This makes that somewhere. When the job appears later, the year is the
 * same node, and the job's folder offers to take the papers (it does not
 * take them by itself: decision D-F4).
 *
 * The years it offers come from the server, which leaves out the ones
 * already there, so the button cannot make a second 2025-26.
 */
export default function AddFyYear({ servicePath }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [years, setYears] = useState(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open || years) return;
    fyOptions(servicePath).then((result) => {
      if (result?.error) setError(result.error);
      else setYears(result);
    });
  }, [open, years, servicePath]);

  function add(fy) {
    setError("");
    start(async () => {
      const result = await addFyFolder({ servicePath, fy });
      if (result?.error) return setError(result.error);
      setOpen(false);
      setYears(null);
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        className="rounded-control border-carbon text-carbon hover:bg-carbon-soft text-13 flex h-8 items-center gap-1 border px-3 font-medium transition-colors duration-150 ease-out"
      >
        <Plus size={13} weight="bold" aria-hidden="true" />
        FY Year
      </button>

      {open && (
        <div className="rounded-ledger border-rule bg-surface absolute top-10 right-0 z-30 w-56 border p-2">
          {error && (
            <p role="alert" className="text-13 text-redpen px-1 py-1">
              {error}
            </p>
          )}
          {!years && !error && (
            <p className="text-13 text-ink-muted px-1 py-1">Reading…</p>
          )}
          {years?.length === 0 && (
            <p className="text-13 text-ink-muted px-1 py-1">
              Every year this service offers is already here.
            </p>
          )}
          <ul>
            {(years ?? []).map((year) => (
              <li key={year.fy}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => add(year.fy)}
                  className="hover:bg-sunk rounded-control num text-13 w-full px-2 py-1.5 text-left transition-colors duration-150 ease-out disabled:opacity-60"
                >
                  {year.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

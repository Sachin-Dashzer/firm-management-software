"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash } from "@phosphor-icons/react";
import { removeTime } from "./actions";

/**
 * The week's lines, with a way to take one off (P3-28).
 *
 * Grouped by day with a total on each, because the question somebody asks
 * their own timesheet is "does Tuesday add up to a day" and not "what did
 * I do forty lines ago".
 */
export default function Lines({ days }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  function drop(id) {
    start(async () => {
      const result = await removeTime(id);
      setError(result?.error ?? "");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-13 text-redpen">
          {error}
        </p>
      )}
      {days.map((day) => (
        <div key={day.key} className="flex flex-col gap-1">
          <h3 className="text-13 border-rule flex items-baseline justify-between gap-3 border-b pb-1">
            <span className={day.today ? "font-semibold" : "text-ink-muted"}>
              {day.label}
            </span>
            <span className="num text-ink-muted">
              {day.rows.length === 0 ? "—" : `${day.hours} h`}
            </span>
          </h3>
          {day.rows.length === 0 ? (
            <p className="text-13 text-faint">Nothing recorded.</p>
          ) : (
            <ul className="flex flex-col">
              {day.rows.map((row) => (
                <li
                  key={row.id}
                  className="text-14 flex items-baseline gap-3 py-1"
                >
                  <span className="num w-12 shrink-0 text-right">
                    {row.hours}
                  </span>
                  <span className="min-w-0 flex-1">
                    {row.href ? (
                      <Link
                        href={row.href}
                        className="underline underline-offset-4"
                      >
                        {row.what}
                      </Link>
                    ) : (
                      row.what
                    )}
                    {!row.chargeable && (
                      <span className="text-12 text-faint">
                        {" "}
                        · not chargeable
                      </span>
                    )}
                  </span>
                  {row.mayChange && (
                    <button
                      type="button"
                      onClick={() => drop(row.id)}
                      disabled={pending}
                      aria-label={`Take off ${row.hours} hours on ${row.what}`}
                      className="rounded-control text-ink-muted hover:text-redpen grid size-7 shrink-0 place-items-center disabled:opacity-50"
                    >
                      <Trash size={15} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

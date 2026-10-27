"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import TierBadge from "@/components/ledger/TierBadge";
import { setServiceActive } from "./actions";

/**
 * The catalog grouped by category, the way the firm thinks about its work,
 * rather than one long alphabetical list.
 */
export default function CatalogList({ rows, categories, editable }) {
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? rows.filter((r) =>
        `${r.name} ${r.code} ${r.category}`.toLowerCase().includes(needle),
      )
    : rows;

  return (
    <div className="flex flex-col gap-5">
      <label className="flex flex-col gap-1">
        <span className="sr-only">Search services</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or code"
          className="rounded-control border-rule bg-paper text-14 h-10 max-w-sm border px-3"
        />
      </label>

      {message?.ok && (
        <p
          role="status"
          className="rounded-ledger border-filed bg-filed-wash text-13 text-filed border px-3 py-2"
        >
          {message.ok}
        </p>
      )}
      {message?.error && (
        <p
          role="alert"
          className="rounded-ledger border-redpen bg-redpen-wash text-13 text-redpen border px-3 py-2"
        >
          {message.error}
        </p>
      )}

      {categories.map((category) => {
        const group = matches.filter((r) => r.category === category);
        if (group.length === 0) return null;
        return (
          <section key={category} className="flex flex-col gap-2">
            <h2 className="text-12 text-ink-muted font-medium tracking-wide uppercase">
              {category}
            </h2>
            <div className="rounded-table border-rule bg-surface overflow-x-auto border">
              <table className="text-14 w-full">
                <thead>
                  <tr className="border-rule bg-sunk text-12 text-ink-muted border-b text-left tracking-wide uppercase">
                    <Th>Service</Th>
                    <Th>Tier</Th>
                    <Th>Recurrence</Th>
                    <Th>Turnaround</Th>
                    <Th>Default fee</Th>
                    <Th>SAC</Th>
                    <Th>Checklist</Th>
                    <Th>Ver.</Th>
                    {editable && <Th>Actions</Th>}
                  </tr>
                </thead>
                <tbody>
                  {group.map((r) => (
                    <tr
                      key={r.id}
                      className="border-rule border-b last:border-0"
                    >
                      <Td>
                        <span className="font-medium">{r.name}</span>
                        {!r.active && (
                          <span className="text-12 text-ink-muted">
                            {" "}
                            · archived
                          </span>
                        )}
                        {r.udinRequired && (
                          <span className="text-12 text-brass-ink">
                            {" "}
                            · UDIN required
                          </span>
                        )}
                        <br />
                        <span className="text-13 text-ink-muted font-mono">
                          {r.code}
                        </span>
                      </Td>
                      <Td>
                        <TierBadge level={r.level} />
                      </Td>
                      <Td>{r.recurrence}</Td>
                      <Td className="text-13">{r.turnaround}</Td>
                      <Td className="num text-13">{r.fee}</Td>
                      <Td className="text-13 font-mono">
                        {r.sac || <span className="text-waiting">not set</span>}
                      </Td>
                      <Td className="text-13">
                        {r.checklistCount} items · {r.stepCount} steps
                        {r.strictSteps > 0 && (
                          <span className="text-brass-ink">
                            {" "}
                            · {r.strictSteps} restricted
                          </span>
                        )}
                      </Td>
                      <Td className="num text-13">v{r.version}</Td>
                      {editable && (
                        <Td>
                          <div className="text-13 flex flex-wrap gap-2">
                            <Link
                              href={`/settings/services/${r.id}`}
                              className="underline underline-offset-4"
                            >
                              Edit
                            </Link>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() =>
                                startTransition(async () =>
                                  setMessage(
                                    await setServiceActive(r.id, !r.active),
                                  ),
                                )
                              }
                              className="underline underline-offset-4 disabled:opacity-60"
                            >
                              {r.active ? "Archive" : "Restore"}
                            </button>
                          </div>
                        </Td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {matches.length === 0 && (
        <p className="text-ink-muted rounded-ledger border-rule border border-dashed px-3 py-6 text-center">
          {rows.length === 0
            ? "The catalog is empty. Run the seed script to load the starter services."
            : "Nothing matches that search."}
        </p>
      )}
    </div>
  );
}

function Th({ children }) {
  return <th className="px-3 py-2 font-medium">{children}</th>;
}

function Td({ children, className = "", ...rest }) {
  return (
    <td className={`px-3 py-2 align-top ${className}`} {...rest}>
      {children}
    </td>
  );
}

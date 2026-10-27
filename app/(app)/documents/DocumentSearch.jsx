"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { linkToDocument } from "./actions";

/**
 * Finding a file across the firm (spec section 6): by name, client,
 * financial year or service.
 *
 * As everywhere else, no download link is rendered into the page — opening
 * one asks the server, which checks permission and writes the audit entry
 * before handing back a link that lives five minutes.
 */
export default function DocumentSearch({ rows, filters, years, services }) {
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  function open(row, inline) {
    startTransition(async () => {
      const result = await linkToDocument(row.id, { inline });
      if (result?.error) {
        setMessage(result);
        return;
      }
      window.open(result.url, inline ? "_blank" : "_self");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        method="get"
        className="rounded-ledger border-rule bg-surface grid gap-3 border p-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        <label className="flex flex-col gap-1 lg:col-span-2">
          <span className="text-13 text-ink-muted font-medium">
            File name or client
          </span>
          <input
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="Form 16, ABC Traders…"
            className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">
            Financial year
          </span>
          <select
            name="fy"
            defaultValue={filters.fy}
            className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
          >
            <option value="">Any</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">Service</span>
          <select
            name="service"
            defaultValue={filters.service}
            className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
          >
            <option value="">Any</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-13 flex items-center gap-2">
            <input
              type="checkbox"
              name="permanent"
              value="1"
              defaultChecked={filters.permanent}
            />
            Permanent file only
          </label>
          <button
            type="submit"
            className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium"
          >
            Search
          </button>
        </div>
      </form>

      {message?.error && (
        <p
          role="alert"
          className="rounded-ledger border-redpen bg-redpen-wash text-13 text-redpen border px-3 py-2"
        >
          {message.error}
        </p>
      )}

      <div className="rounded-table border-rule bg-surface overflow-x-auto border">
        <table className="text-14 w-full">
          <thead>
            <tr className="border-rule bg-sunk text-12 text-ink-muted border-b text-left tracking-wide uppercase">
              <th className="px-3 py-2 font-medium">File</th>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Where</th>
              <th className="px-3 py-2 font-medium">Year</th>
              <th className="px-3 py-2 font-medium">Added</th>
              <th className="px-3 py-2 font-medium">Open</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-rule border-b last:border-0">
                <td className="px-3 py-2">
                  {r.name}
                  {r.versions > 0 && (
                    <span className="text-12 text-ink-muted">
                      {" "}
                      · {r.versions} earlier
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/clients/${r.clientId}?tab=documents`}
                    className="underline underline-offset-4"
                  >
                    {r.client}
                  </Link>
                </td>
                <td className="text-13 px-3 py-2">
                  {r.engagementId ? (
                    <Link
                      href={`/engagements/${r.engagementId}`}
                      className="underline underline-offset-4"
                    >
                      {r.where}
                    </Link>
                  ) : (
                    r.where
                  )}
                </td>
                <td className="text-13 px-3 py-2 font-mono">{r.fy}</td>
                <td className="num text-13 px-3 py-2">{r.added}</td>
                <td className="px-3 py-2">
                  <span className="text-13 flex gap-3">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => open(r, true)}
                      className="underline underline-offset-4 disabled:opacity-60"
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => open(r, false)}
                      className="underline underline-offset-4 disabled:opacity-60"
                    >
                      Download
                    </button>
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="text-ink-muted px-3 py-6 text-center"
                >
                  Nothing matches.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

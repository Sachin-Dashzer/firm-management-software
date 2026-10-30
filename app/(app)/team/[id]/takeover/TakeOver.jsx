"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { reassign } from "../../../engagements/actions";

/**
 * Moving work, one row at a time or all of it at once (P3-16).
 *
 * `reassign` is the same action the engagement screen, the bulk list and
 * the offboarding wizard call, so every rule — the minimum role, maker is
 * not checker, the audit entry, the mail to both people — applies here
 * exactly as it does there. This screen adds no new way into an engagement.
 *
 * "Give everything to one person" is offered and **does not pretend**: the
 * cover may not legally take an A-tier review, so those rows are left
 * behind and named rather than skipped quietly.
 */
export default function TakeOver({ name, rows, suggestedId, suggestedName }) {
  const router = useRouter();
  const [outstanding, setOutstanding] = useState(rows);
  const [picked, setPicked] = useState(() =>
    Object.fromEntries(
      rows
        .filter((row) => row.candidates.some((c) => c.id === suggestedId))
        .map((row) => [row.id, suggestedId]),
    ),
  );
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  const first = name.split(" ")[0];

  function move(row, to) {
    return reassign(
      row.id,
      row.role === "assignee" ? { assigneeId: to } : { reviewerId: to },
    );
  }

  function moveOne(row) {
    const to = picked[row.id];
    if (!to) {
      setMessage({ error: `Choose who takes ${row.code}.` });
      return;
    }
    startTransition(async () => {
      const result = await move(row, to);
      if (result?.error) {
        setMessage({ error: `${row.code}: ${result.error}` });
        return;
      }
      setOutstanding((list) => list.filter((r) => r.id !== row.id));
      setMessage({ ok: `${row.code} is theirs now.` });
      router.refresh();
    });
  }

  function moveAllToCover() {
    const can = outstanding.filter((row) =>
      row.candidates.some((candidate) => candidate.id === suggestedId),
    );
    const cannot = outstanding.filter(
      (row) =>
        !row.candidates.some((candidate) => candidate.id === suggestedId),
    );

    startTransition(async () => {
      const moved = new Set();
      const failed = [];
      for (const row of can) {
        const result = await move(row, suggestedId);
        if (result?.error) failed.push(`${row.code}: ${result.error}`);
        else moved.add(row.id);
      }

      setOutstanding((list) => list.filter((row) => !moved.has(row.id)));
      setMessage(
        failed.length
          ? { error: failed.join(" · ") }
          : {
              ok: `${moved.size} moved to ${suggestedName}.${
                cannot.length
                  ? ` ${cannot.length} left with ${first}: ${cannot
                      .map((row) => `${row.code} needs a ${row.needs}`)
                      .join(", ")}.`
                  : ""
              }`,
            },
      );
      router.refresh();
    });
  }

  if (outstanding.length === 0) {
    return (
      <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border px-3 py-6 text-center">
        Nothing open is {first}&rsquo;s. Every engagement they were on is closed
        or somebody else&rsquo;s now.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
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

      {suggestedId && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={moveAllToCover}
            disabled={pending}
            className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium disabled:opacity-60"
          >
            Give everything to {suggestedName}
          </button>
          <span className="text-13 text-ink-muted">
            Work {suggestedName} may not legally take is left with {first} and
            named.
          </span>
        </div>
      )}

      <div className="rounded-table border-rule bg-surface overflow-x-auto border">
        <table className="text-14 w-full">
          <caption className="sr-only">
            Open engagements {name} is on, and who can take each
          </caption>
          <thead>
            <tr className="border-rule text-12 text-faint border-b text-left font-normal">
              <th scope="col" className="px-3 py-2 font-medium">
                Work
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Client
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Their part
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Due
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Goes to
              </th>
              <th scope="col" className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {outstanding.map((row) => (
              <tr key={row.id} className="border-rule border-b last:border-0">
                <td className="px-3 py-2 align-top">
                  <Link
                    href={`/engagements/${row.id}`}
                    className="underline underline-offset-4"
                  >
                    {row.service}
                  </Link>
                  <span className="text-12 text-ink-muted block">
                    {row.period} · {row.level} · {row.status}
                  </span>
                </td>
                <td className="text-13 px-3 py-2 align-top">{row.client}</td>
                <td className="text-13 px-3 py-2 align-top">
                  {row.role === "assignee" ? "Preparing" : "Reviewing"}
                  <span className="text-12 text-ink-muted block">
                    needs a {row.needs}
                  </span>
                </td>
                <td className="text-13 px-3 py-2 align-top">{row.dueLabel}</td>
                <td className="px-3 py-2 align-top">
                  <label className="sr-only" htmlFor={`to-${row.id}`}>
                    Who takes {row.service} for {row.client}
                  </label>
                  <select
                    id={`to-${row.id}`}
                    value={picked[row.id] ?? ""}
                    onChange={(event) =>
                      setPicked((all) => ({
                        ...all,
                        [row.id]: event.target.value,
                      }))
                    }
                    className="rounded-control border-rule bg-paper text-13 h-8 border px-2"
                  >
                    <option value="">— choose —</option>
                    {row.candidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name}
                      </option>
                    ))}
                  </select>
                  {row.candidates.length === 0 && (
                    <span className="text-12 text-redpen block">
                      Nobody in reach may take this — it needs a {row.needs}.
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right align-top">
                  <button
                    type="button"
                    onClick={() => moveOne(row)}
                    disabled={pending || !picked[row.id]}
                    className="rounded-control border-rule bg-surface text-13 h-8 border px-3 disabled:opacity-60"
                  >
                    Move
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reassign } from "../../../engagements/actions";
import { offboard } from "../../actions";

/**
 * The four steps. Reassigning is per engagement rather than one bulk
 * dropdown: each row has its own minimum role, and offering one person for
 * all of them would mean offering somebody who cannot legally take half.
 *
 * `reassign` is the same action the engagement screen and the bulk list use,
 * so every rule — minimum role, maker ≠ checker, the audit entry, the
 * notification to both people — applies here exactly as it does there. The
 * wizard adds no new path into an engagement.
 */
export default function Offboard({ userId, name, rows, grants }) {
  const router = useRouter();
  const [outstanding, setOutstanding] = useState(rows);
  const [picked, setPicked] = useState({});
  const [message, setMessage] = useState(null);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const first = name.split(" ")[0];
  const clear = outstanding.length === 0;

  function moveOne(row) {
    const to = picked[row.id];
    if (!to) {
      setMessage({ error: `Choose who takes ${row.code}.` });
      return;
    }

    startTransition(async () => {
      const result = await reassign(
        row.id,
        row.role === "assignee" ? { assigneeId: to } : { reviewerId: to },
      );
      if (result?.error) {
        setMessage({ error: `${row.code}: ${result.error}` });
        return;
      }
      setOutstanding((list) => list.filter((r) => r.id !== row.id));
      setMessage({ ok: `${row.code} moved.` });
    });
  }

  function finish() {
    startTransition(async () => {
      const result = await offboard(userId, reason);
      setMessage(result);
      if (result?.ok) {
        setDone(true);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
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

      {/* --- 1. the work --- */}
      <Step
        number={1}
        title="Hand over their open work"
        done={clear}
        summary={
          clear ? "Nothing open is theirs." : `${outstanding.length} to move.`
        }
      >
        {clear ? (
          <p className="text-14 text-ink-muted">
            Every engagement {first} was on is either closed or somebody
            else&rsquo;s now.
          </p>
        ) : (
          <div className="rounded-table border-rule bg-surface overflow-x-auto border">
            <table className="text-14 w-full">
              <caption className="sr-only">
                Open engagements still assigned to {name}
              </caption>
              <thead>
                <tr className="border-rule text-13 text-ink-muted border-b text-left">
                  <th scope="col" className="px-3 py-2 font-normal">
                    Work
                  </th>
                  <th scope="col" className="px-3 py-2 font-normal">
                    Client
                  </th>
                  <th scope="col" className="px-3 py-2 font-normal">
                    Their part
                  </th>
                  <th scope="col" className="px-3 py-2 font-normal">
                    Due
                  </th>
                  <th scope="col" className="px-3 py-2 font-normal">
                    Goes to
                  </th>
                  <th scope="col" className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {outstanding.map((row) => (
                  <tr
                    key={row.id}
                    className="border-rule border-b align-top last:border-0"
                  >
                    <td className="px-3 py-2">
                      {row.service}
                      <span className="text-13 text-ink-muted block font-mono">
                        {row.code} · {row.period}
                      </span>
                    </td>
                    <td className="text-13 px-3 py-2">{row.client}</td>
                    <td className="text-13 px-3 py-2">
                      {row.role === "assignee" ? "Doing it" : "Reviewing it"}
                      <span className="text-ink-muted block">{row.level}</span>
                    </td>
                    <td className="text-13 px-3 py-2 font-mono">
                      {row.dueLabel}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={picked[row.id] ?? ""}
                        onChange={(e) =>
                          setPicked((p) => ({ ...p, [row.id]: e.target.value }))
                        }
                        className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                      >
                        <option value="">Choose…</option>
                        {row.candidates.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      {row.candidates.length === 0 && (
                        <span className="text-13 text-redpen mt-1 block">
                          Nobody in your branches may take this: it needs at
                          least {row.needs}.
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        disabled={pending || !picked[row.id]}
                        onClick={() => moveOne(row)}
                        className="rounded-control border-rule text-13 hover:bg-carbon-wash h-9 border px-3 disabled:opacity-50"
                      >
                        Move
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Step>

      {/* --- 2. the grants --- */}
      <Step
        number={2}
        title="Revoke their client access"
        done={false}
        summary={
          grants.length === 0
            ? "They hold none."
            : `${grants.length} will be revoked by the last step.`
        }
      >
        {grants.length === 0 ? (
          <p className="text-14 text-ink-muted">
            {first} holds no client access grants.
          </p>
        ) : (
          <ul className="rounded-ledger border-rule bg-surface divide-rule divide-y border">
            {grants.map((grant) => (
              <li key={grant.id} className="px-3 py-2">
                <p className="text-14">{grant.client}</p>
                <p className="text-13 text-ink-muted">{grant.sections}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="text-13 text-ink-muted mt-2">
          These are revoked in the same transaction as the last step, so they
          cannot be left behind by a half-finished offboarding.
        </p>
      </Step>

      {/* --- 3 and 4 --- */}
      <Step
        number={3}
        title="Switch off the account and close the record"
        done={done}
        summary={
          done
            ? "Done."
            : clear
              ? "Ready."
              : "Waiting for their work to be handed over."
        }
      >
        {done ? (
          <p className="text-14">
            {name} has been offboarded. Everything they did is still on the
            record under their name, and their email address can be used again
            for somebody new.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-14 max-w-[68ch]">
              This deactivates the account — which bites on their very next
              request, not in half an hour — revokes the grants above, and soft
              deletes the record so they drop out of the lists. It cannot be
              undone from a screen.
            </p>
            <label className="flex flex-col gap-1">
              <span className="text-13 text-ink-muted">
                Why they are leaving — kept on the audit entry
              </span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Resigned, last working day 31-10-2026"
                className="rounded-control border-rule bg-paper text-14 h-9 max-w-md border px-2"
              />
            </label>
            <button
              type="button"
              disabled={pending || !clear || reason.trim().length < 3}
              onClick={finish}
              className="rounded-control border-redpen text-redpen text-14 h-9 self-start border px-4 disabled:opacity-50"
            >
              {pending ? "Offboarding…" : `Offboard ${first}`}
            </button>
            {!clear && (
              <p className="text-13 text-waiting">
                Hand over the {outstanding.length} open{" "}
                {outstanding.length === 1 ? "engagement" : "engagements"} above
                first.
              </p>
            )}
          </div>
        )}
      </Step>
    </div>
  );
}

function Step({ number, title, done, summary, children }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <span
          aria-hidden
          className={`rounded-ledger text-13 grid size-7 shrink-0 place-items-center border font-mono ${
            done ? "border-filed text-filed" : "border-rule text-ink-muted"
          }`}
        >
          {number}
        </span>
        <h2 className="font-display text-15 font-semibold">{title}</h2>
        <p className="text-13 text-ink-muted">{summary}</p>
      </div>
      <div className="pl-10">{children}</div>
    </section>
  );
}

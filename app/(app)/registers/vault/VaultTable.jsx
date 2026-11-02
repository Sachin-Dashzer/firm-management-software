"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import Chip from "@/components/ui/Chip";
import SearchBox, { matches } from "@/components/ui/SearchBox";
import { Result } from "@/components/ui/Notice";
import { newVaultChallenge, revealFromVault } from "./actions";

/**
 * The firm's logins, and the one way to see one (P3-22b).
 *
 * Revealing used to be possible only on a client's own page, which was the
 * right instinct — a screen that can decrypt two hundred passwords is a
 * different risk from one that can decrypt one — but in practice it meant
 * opening a client, finding the tab, and revealing from there, so the list
 * that knows which login you want could not give it to you.
 *
 * What makes it safe to do from here is not a confirmation dialog, which
 * people click through, but a code typed by hand: a password is never one
 * stray press away, and the audit entry behind it names somebody who meant
 * it. Everything else is unchanged — the ciphertext is `select: false`, so
 * the page itself still holds no password until the server hands one over,
 * and each reveal clears itself off the screen after a minute.
 */

/** How long a revealed password stays on screen. */
const LIFE_MS = 60_000;

export default function VaultTable({ rows, mayEdit }) {
  const [query, setQuery] = useState("");
  const [asking, setAsking] = useState(null);
  const [answer, setAnswer] = useState("");
  const [shown, setShown] = useState({});
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());

  /** One clock for every revealed row, running only while one is open. */
  const anyShown = Object.keys(shown).length > 0;
  useEffect(() => {
    if (!anyShown) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [anyShown]);

  useEffect(() => {
    setShown((open) => {
      const live = Object.fromEntries(
        Object.entries(open).filter(([, value]) => value.until > Date.now()),
      );
      return Object.keys(live).length === Object.keys(open).length
        ? open
        : live;
    });
  }, [now]);

  function ask(row) {
    setMessage(null);
    startTransition(async () => {
      const challenge = await newVaultChallenge();
      setAnswer("");
      setAsking({ id: row.id, ...challenge });
    });
  }

  function reveal(event) {
    event.preventDefault();
    const { id, token } = asking;
    startTransition(async () => {
      const result = await revealFromVault(id, token, answer);
      if (result?.error) {
        setMessage(result);
        // the code is spent either way: a wrong answer gets a fresh one
        const challenge = await newVaultChallenge();
        setAnswer("");
        setAsking({ id, ...challenge });
        return;
      }
      setMessage(null);
      setAsking(null);
      setAnswer("");
      setShown((open) => ({
        ...open,
        [id]: {
          password: result.password,
          notes: result.notes,
          until: Date.now() + LIFE_MS,
        },
      }));
    });
  }

  const visible = useMemo(
    () =>
      rows.filter((row) =>
        matches([row.client, row.code, row.portal, row.label, row.username], query),
      ),
    [rows, query],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-13 text-ink-muted">
          A reveal is recorded against your name, with the time.
        </p>
        <span className="flex items-center gap-3">
          <SearchBox
            value={query}
            onChange={setQuery}
            label="Search these logins"
          />
          <span className="num text-12 text-ink-muted shrink-0">
            {visible.length === rows.length
              ? `${rows.length} held`
              : `${visible.length} of ${rows.length}`}
          </span>
        </span>
      </div>

      <Result message={message} />

      <div className="rounded-table border-rule bg-surface overflow-x-auto border">
        <table className="text-14 w-full">
          <caption className="sr-only">
            Portal logins the firm holds, by client
          </caption>
          <thead>
            <tr className="border-rule text-12 text-faint bg-sunk border-b text-left font-normal">
              <th scope="col" className="px-3 py-2 font-medium">
                Client
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Portal
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                User id
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Password
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Last revealed
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const open = shown[row.id];
              const left = open
                ? Math.max(0, Math.ceil((open.until - now) / 1000))
                : 0;

              return (
                <tr
                  key={row.id}
                  className="border-rule hover:bg-carbon-wash/60 border-b align-top last:border-0"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/clients/${row.clientId}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {row.client}
                    </Link>
                    {row.code && (
                      <span className="text-12 text-ink-muted block font-mono">
                        {row.code}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Chip tone="info">{row.portal}</Chip>
                    {row.label && (
                      <span className="text-12 text-ink-muted mt-1 block">
                        {row.label}
                      </span>
                    )}
                  </td>
                  <td className="text-13 px-3 py-2 font-mono break-all">
                    {row.username}
                  </td>

                  <td className="px-3 py-2">
                    {open ? (
                      <span className="flex flex-col gap-1">
                        <span className="flex items-center gap-2">
                          <code className="rounded-control border-filed/40 bg-filed-soft text-14 text-ink border px-2 py-1 font-mono break-all">
                            {open.password}
                          </code>
                          <button
                            type="button"
                            onClick={() =>
                              navigator.clipboard
                                ?.writeText(open.password)
                                .then(
                                  () => setMessage({ ok: "Copied." }),
                                  () =>
                                    setMessage({
                                      error:
                                        "This browser would not let the page copy it.",
                                    }),
                                )
                            }
                            className="text-13 text-ink-muted underline-offset-4 hover:underline"
                          >
                            Copy
                          </button>
                        </span>
                        {open.notes && (
                          <span className="text-12 text-ink-muted max-w-[40ch]">
                            {open.notes}
                          </span>
                        )}
                        <span className="num text-12 text-ink-muted">
                          Hidden again in {left}s
                        </span>
                      </span>
                    ) : asking?.id === row.id ? (
                      <form
                        onSubmit={reveal}
                        className="flex flex-wrap items-end gap-2"
                      >
                        <span className="flex flex-col gap-1">
                          <span className="text-12 text-ink-muted">
                            Type this code
                          </span>
                          <span className="rounded-control border-rule bg-sunk text-16 text-ink border border-dashed px-2.5 py-1 font-mono tracking-[0.3em]">
                            {asking.code}
                          </span>
                        </span>
                        <input
                          autoFocus
                          value={answer}
                          onChange={(event) =>
                            setAnswer(event.target.value.toUpperCase())
                          }
                          aria-label="The code shown"
                          maxLength={asking.code.length}
                          className="rounded-control border-rule bg-paper text-14 h-9 w-24 border px-2 font-mono tracking-[0.2em] uppercase"
                        />
                        <button
                          type="submit"
                          disabled={pending || answer.length === 0}
                          className="rounded-control bg-carbon text-13 text-on-carbon h-9 px-3 font-medium disabled:opacity-60"
                        >
                          {pending ? "Checking…" : "Reveal"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAsking(null);
                            setAnswer("");
                          }}
                          className="text-13 text-ink-muted h-9 underline-offset-4 hover:underline"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <span className="flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="text-ink-muted font-mono tracking-[0.2em] select-none"
                        >
                          ••••••••
                        </span>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => ask(row)}
                          className="rounded-control border-rule text-13 hover:bg-carbon-wash h-8 border px-2.5 disabled:opacity-60"
                        >
                          Reveal
                        </button>
                        {mayEdit && (
                          <Link
                            href={`/clients/${row.clientId}`}
                            className="text-13 text-ink-muted underline-offset-4 hover:underline"
                          >
                            Change
                          </Link>
                        )}
                      </span>
                    )}
                  </td>

                  <td className="num text-13 text-ink-muted px-3 py-2">
                    {row.lastRevealed}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="text-14 px-3 py-10 text-center">
                  <span className="text-ink-muted">
                    {rows.length === 0
                      ? "No logins are held yet. They are added on a client's own page."
                      : `Nothing here matches “${query.trim()}”.`}
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatPaise } from "@/lib/money";
import Panel from "@/components/ui/Panel";
import Chip from "@/components/ui/Chip";
import SearchBox, { matches } from "@/components/ui/SearchBox";
import Notice, { Result } from "@/components/ui/Notice";
import {
  TableShell,
  Table,
  Head,
  Th,
  Tr,
  Td,
  Meta,
  Num,
  Foot,
} from "@/components/ui/Table";
import { createDraft } from "../actions";

/**
 * Pick a client, tick the work to bill, get a draft.
 *
 * Choosing the client reloads the page rather than fetching in the
 * background: the unbilled list belongs to the client, the server already
 * knows how to produce it, and a round trip here is cheaper than keeping
 * two copies of that query.
 *
 * Redrawn 02-11-2026. It was a `<select>` of up to two thousand clients
 * followed by a list of checkboxes — which meant the one thing this screen
 * exists to prevent, finishing work and not charging for it, was invisible
 * until you had already guessed which client to look at. **The clients
 * with work waiting are the first thing on it now**, with what they are
 * waiting for, in order of money; the search box reaches every other
 * client for when the invoice is for something nobody has recorded as a
 * job.
 *
 * The two outcomes are two controls. A single button that changed its own
 * label from "Start an empty draft" to "Draft an invoice for 3 jobs"
 * depending on what was ticked is a button nobody can predict.
 */
export default function NewInvoice({
  clients = [],
  chosen = null,
  rows = [],
  missed = false,
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [picked, setPicked] = useState(() => new Set());
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  function chooseClient(id) {
    const next = new URLSearchParams(searchParams);
    if (id) next.set("client", id);
    else next.delete("client");
    setPicked(new Set());
    setMessage(null);
    router.replace(`/invoices/new?${next}`);
  }

  function toggle(id) {
    setPicked((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function draft(ids) {
    startTransition(async () => {
      const result = await createDraft({
        clientId: chosen.id,
        engagementIds: ids,
      });
      setMessage(result);
      if (result?.id) router.push(`/invoices/${result.id}`);
    });
  }

  /** Clients with something waiting, worth the most first. */
  const owing = useMemo(
    () =>
      clients
        .filter((c) => c.waiting)
        .sort(
          (a, b) =>
            b.waiting.paise - a.waiting.paise ||
            b.waiting.count - a.waiting.count,
        ),
    [clients],
  );

  const found = useMemo(() => {
    const text = query.trim();
    if (!text) return owing;
    return clients
      .filter((c) => matches([c.name, c.code], text))
      .sort((a, b) => (b.waiting?.paise ?? -1) - (a.waiting?.paise ?? -1))
      .slice(0, 40);
  }, [clients, owing, query]);

  const billable = rows.filter((row) => !row.blocked);
  const ticked = rows.filter((row) => picked.has(row.id));
  const total = ticked.reduce((sum, row) => sum + row.feePaise, 0);
  const allTicked =
    billable.length > 0 && billable.every((row) => picked.has(row.id));

  if (!chosen) {
    return (
      <div className="flex flex-col gap-4">
        <Result message={message} />

        {missed && (
          <Notice tone="warn" title="That client is not on your list">
            <p>
              The link named a client you cannot bill — a closed one, or one in
              a branch you are not assigned to. Choose another below.
            </p>
          </Notice>
        )}

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 className="font-display text-15 font-semibold">
            {query.trim()
              ? `${found.length} ${found.length === 1 ? "client" : "clients"} match`
              : "Waiting to be billed"}
          </h2>
          <SearchBox
            value={query}
            onChange={setQuery}
            label="Any client, by name or code"
          />
        </div>

        {found.length === 0 ? (
          <Notice tone="flat">
            {query.trim()
              ? `No client matches “${query.trim()}”.`
              : "No client has finished work waiting to be billed. Search above for the client this invoice is for."}
          </Notice>
        ) : (
          <ul className="rounded-ledger border-rule bg-surface divide-rule divide-y border">
            {found.map((client) => (
              <li key={client.id}>
                <button
                  type="button"
                  onClick={() => chooseClient(client.id)}
                  className="hover:bg-carbon-wash/60 focus-visible:outline-brass flex w-full items-center justify-between gap-4 px-4 py-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2"
                >
                  <span className="min-w-0">
                    <span className="text-14 block truncate font-medium">
                      {client.name}
                    </span>
                    {client.code && (
                      <span className="num text-12 text-ink-muted">
                        {client.code}
                      </span>
                    )}
                  </span>

                  {client.waiting ? (
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="text-12 text-ink-muted">
                        <span className="num">{client.waiting.count}</span>{" "}
                        {client.waiting.count === 1 ? "job" : "jobs"}
                        {client.waiting.blocked > 0 && (
                          <>
                            {" · "}
                            <span className="num">
                              {client.waiting.blocked}
                            </span>{" "}
                            on hold
                          </>
                        )}
                      </span>
                      <span className="num text-14 font-medium">
                        {client.waiting.paise > 0
                          ? formatPaise(client.waiting.paise)
                          : "—"}
                      </span>
                    </span>
                  ) : (
                    <span className="text-12 text-faint shrink-0">
                      nothing waiting
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {!query.trim() && owing.length > 0 && (
          <p className="text-13 text-ink-muted">
            Billing something that was never recorded as a job? Search for the
            client above — any client can be invoiced, with or without work on
            this list.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Result message={message} />

      {/* who this is for, and the way back out of it */}
      <div className="rounded-ledger border-carbon bg-carbon-wash flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border px-4 py-3">
        <span>
          <span className="text-11 text-ink-muted block font-semibold tracking-wide uppercase">
            Invoice to
          </span>
          <span className="text-16 font-medium">{chosen.name}</span>
          {chosen.code && (
            <span className="num text-13 text-ink-muted ml-2">
              {chosen.code}
            </span>
          )}
        </span>
        <span className="flex items-center gap-4">
          <span className="text-12 text-ink-muted">
            {chosen.creditDays > 0 ? (
              <>
                Payable in <span className="num">{chosen.creditDays}</span> days
              </>
            ) : (
              "No credit period on record — due on issue"
            )}
          </span>
          <button
            type="button"
            onClick={() => chooseClient("")}
            className="rounded-control border-rule bg-surface text-13 hover:bg-carbon-wash h-8 border px-2.5"
          >
            Change client
          </button>
        </span>
      </div>

      <Panel
        title="Work not yet billed"
        count={String(rows.length)}
        hint="Completed and filed, with no invoice against it"
      >
        {rows.length === 0 ? (
          <p className="text-14 text-ink-muted">
            Nothing is waiting to be billed for this client. An empty draft is
            below — type the lines on it yourself.
          </p>
        ) : (
          <TableShell>
            <Table fixed caption="Work not yet billed, oldest first">
              <colgroup>
                <col className="w-[3rem]" />
                <col />
                <col className="w-[8.5rem]" />
                <col className="w-[10rem]" />
              </colgroup>
              <Head>
                <Th>
                  <label className="flex cursor-pointer items-center justify-center">
                    <span className="sr-only">
                      Tick every job that can be billed
                    </span>
                    <input
                      type="checkbox"
                      className="accent-carbon size-4 disabled:opacity-50"
                      checked={allTicked}
                      disabled={billable.length === 0}
                      onChange={() =>
                        setPicked(
                          allTicked
                            ? new Set()
                            : new Set(billable.map((row) => row.id)),
                        )
                      }
                    />
                  </label>
                </Th>
                <Th>Work</Th>
                <Th>Finished</Th>
                <Th align="right" rule>
                  Fee
                </Th>
              </Head>
              <tbody>
                {rows.map((row) => (
                  <Tr key={row.id}>
                    <Td className="text-center">
                      <input
                        type="checkbox"
                        id={`job-${row.id}`}
                        checked={picked.has(row.id)}
                        disabled={Boolean(row.blocked)}
                        onChange={() => toggle(row.id)}
                        className="accent-carbon size-4 disabled:opacity-50"
                      />
                    </Td>
                    <Td>
                      <label
                        htmlFor={`job-${row.id}`}
                        className={`block ${row.blocked ? "" : "cursor-pointer"}`}
                      >
                        <span className="text-14 font-medium">{row.work}</span>
                        <Meta>
                          {row.period}
                          {row.code && (
                            <span className="num"> · {row.code}</span>
                          )}
                        </Meta>
                      </label>
                      {row.blocked && (
                        <Chip tone="neutral" className="mt-1.5 inline-block">
                          Cannot be billed: {row.blocked}
                        </Chip>
                      )}
                    </Td>
                    <Td className="num text-13 text-ink-muted">
                      {row.finished || "—"}
                    </Td>
                    <Td align="right" rule>
                      <Num paise={row.feePaise} strong={!row.blocked} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
              <Foot>
                <Td colSpan={3} className="text-ink-muted">
                  {ticked.length === 0
                    ? "Nothing ticked yet"
                    : `${ticked.length} ${ticked.length === 1 ? "job" : "jobs"} ticked, before tax`}
                </Td>
                <Td align="right" rule>
                  <Num paise={total} strong />
                </Td>
              </Foot>
            </Table>
          </TableShell>
        )}
      </Panel>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          disabled={pending || ticked.length === 0}
          onClick={() => draft([...picked])}
          className="rounded-control bg-carbon text-14 text-on-carbon h-10 px-4 font-medium disabled:opacity-50"
        >
          {pending
            ? "Creating…"
            : ticked.length === 0
              ? "Draft an invoice"
              : `Draft an invoice for ${ticked.length} ${ticked.length === 1 ? "job" : "jobs"} · ${formatPaise(total)}`}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => draft([])}
          className="rounded-control border-rule text-14 hover:bg-carbon-wash h-10 border px-3 disabled:opacity-50"
        >
          Start an empty draft
        </button>
        <p className="text-12 text-ink-muted">
          Nothing is issued yet. The draft takes its number only when you issue
          it, so everything on it can still change.
        </p>
      </div>
    </div>
  );
}

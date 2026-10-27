"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createDraft } from "../actions";

/**
 * Pick a client, tick the work to bill, get a draft.
 *
 * Choosing the client reloads the page rather than fetching in the
 * background: the unbilled list belongs to the client, the server already
 * knows how to produce it, and a round trip here is cheaper than keeping
 * two copies of that query.
 */
export default function NewInvoice({ clients, selectedClient, unbilled }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [picked, setPicked] = useState(() => new Set());
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  function chooseClient(id) {
    const next = new URLSearchParams(searchParams);
    if (id) next.set("client", id);
    else next.delete("client");
    router.replace(`/invoices/new?${next}`);
  }

  function toggle(id) {
    setPicked((old) => {
      const next = new Set(old);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const total = unbilled
    .filter((e) => picked.has(e.id))
    .reduce((sum, e) => sum + e.fee, 0);

  return (
    <div className="flex flex-col gap-5">
      {message?.error && (
        <p
          role="alert"
          className="rounded-ledger border-redpen bg-redpen-wash text-13 text-redpen border px-3 py-2"
        >
          {message.error}
        </p>
      )}

      <label className="flex max-w-md flex-col gap-1">
        <span className="text-13 text-ink-muted font-medium">Client</span>
        <select
          value={selectedClient}
          onChange={(e) => chooseClient(e.target.value)}
          className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
        >
          <option value="">— choose —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {selectedClient && (
        <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
          <div>
            <h2 className="font-display text-15 font-semibold">
              Work not yet billed
            </h2>
            <p className="text-13 text-ink-muted">
              Completed and filed engagements with no invoice against them.
            </p>
          </div>

          {unbilled.length === 0 ? (
            <p className="text-14 text-ink-muted">
              Nothing is waiting to be billed for this client. You can still
              start an empty invoice and type the lines yourself.
            </p>
          ) : (
            <ul className="flex flex-col">
              {unbilled.map((e) => (
                <li
                  key={e.id}
                  className="border-rule flex items-center justify-between gap-3 border-b py-2 last:border-0"
                >
                  <label
                    className={`flex items-start gap-2 ${e.blocked ? "opacity-70" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={picked.has(e.id)}
                      disabled={Boolean(e.blocked)}
                      title={
                        e.blocked ? `Cannot be billed: ${e.blocked}` : undefined
                      }
                      onChange={() => toggle(e.id)}
                      className="mt-1"
                    />
                    <span className="text-14">
                      {e.label}
                      <span className="text-12 text-ink-muted font-mono">
                        {" "}
                        {e.code}
                      </span>
                      {e.blocked && (
                        <span className="text-12 text-ink-muted block">
                          Cannot be billed: {e.blocked}
                        </span>
                      )}
                    </span>
                  </label>
                  <span className="num text-14">
                    {e.blocked ? "—" : e.fee.toLocaleString("en-IN")}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {picked.size > 0 && (
            <p className="text-14 text-right font-medium">
              {picked.size} selected ·{" "}
              <span className="num">₹{total.toLocaleString("en-IN")}</span>{" "}
              before tax
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await createDraft({
                    clientId: selectedClient,
                    engagementIds: [...picked],
                  });
                  setMessage(result);
                  if (result?.id) router.push(`/invoices/${result.id}`);
                })
              }
              className="rounded-control bg-carbon text-14 text-on-carbon h-10 px-4 font-medium disabled:opacity-60"
            >
              {pending
                ? "Creating…"
                : picked.size > 0
                  ? `Draft an invoice for ${picked.size} ${picked.size === 1 ? "job" : "jobs"}`
                  : "Start an empty draft"}
            </button>
            <p className="text-12 text-ink-muted self-center">
              Nothing is issued yet — you can change everything on the draft.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CLIENT_STATUSES } from "@/lib/validators";
import { setClientStatus, deleteClient } from "../actions";

/**
 * Change status, or (for a partner) move the client to the recycle bin.
 * On hold, Closed and deletion all need a reason, which is recorded.
 */
export default function StatusControl({ clientId, status, canApprove }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState(status);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  const reasonNeeded = ["On hold", "Closed"].includes(next);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="rounded-control border-rule text-14 hover:bg-carbon-wash h-9 border px-3"
      >
        Change status
      </button>

      {open && (
        <div className="rounded-ledger border-rule bg-surface absolute right-0 z-30 mt-1 w-80 border p-3">
          <label className="flex flex-col gap-1">
            <span className="text-13 text-ink-muted font-medium">
              New status
            </span>
            <select
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
            >
              {CLIENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          {reasonNeeded && (
            <label className="mt-2 flex flex-col gap-1">
              <span className="text-13 text-ink-muted font-medium">
                Reason (required)
              </span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Fees overdue; client unresponsive"
                className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
              />
            </label>
          )}

          {next === "Active" && (
            <p className="text-12 text-ink-muted mt-2">
              Activating runs the duplicate check on PAN and GSTIN first.
            </p>
          )}

          {message?.error && (
            <p role="alert" className="text-13 text-redpen mt-2">
              {message.error}
            </p>
          )}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending || next === status}
              onClick={() =>
                startTransition(async () => {
                  const result = await setClientStatus(clientId, next, reason);
                  setMessage(result);
                  if (result?.ok) {
                    setOpen(false);
                    router.refresh();
                  }
                })
              }
              className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium disabled:opacity-60"
            >
              Apply
            </button>

            {canApprove && (
              <button
                type="button"
                disabled={pending || !reason.trim()}
                title={
                  reason.trim()
                    ? undefined
                    : "Type a reason above before deleting"
                }
                onClick={() =>
                  startTransition(async () => {
                    const result = await deleteClient(clientId, reason);
                    setMessage(result);
                    if (result?.ok) router.push("/clients");
                  })
                }
                className="rounded-control border-rule text-14 hover:bg-redpen-wash hover:text-redpen h-9 border px-3 disabled:opacity-60"
              >
                Delete client
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

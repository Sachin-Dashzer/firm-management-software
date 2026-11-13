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
  /**
   * The reason box used to appear only for On hold and Closed, which left a
   * partner having to pick a status they did not want before the Delete
   * button below would unlock (owner, 12-11-2026). It is the same box for
   * both, so a partner always gets it.
   */
  const showReason = reasonNeeded || canApprove;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="rounded-control border-rule text-14 hover:bg-carbon-wash h-9 border px-3"
      >
        {/* a partner's delete lives in here, so the button says so */}
        {canApprove ? "Status or delete" : "Change status"}
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

          {showReason && (
            <label className="mt-2 flex flex-col gap-1">
              <span className="text-13 text-ink-muted font-medium">
                Reason {reasonNeeded ? "(required)" : "(required to delete)"}
              </span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Fees overdue; client unresponsive"
                className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
              />
            </label>
          )}

          {canApprove && (
            <p className="text-12 text-ink-muted mt-2">
              Deleting takes the client&rsquo;s jobs, files, invoices,
              credentials and portal users with it, all recoverable from the
              audit trail. It is refused if an invoice has already gone out or a
              UDIN is on the register — use Closed for those.
            </p>
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

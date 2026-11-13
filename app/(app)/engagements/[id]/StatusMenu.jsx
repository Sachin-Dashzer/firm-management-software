"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import CellPopover from "@/components/ui/CellPopover";
import Action from "@/components/ui/Action";
import { NEEDS_REASON } from "@/lib/engagements/status";
import { STATUS_TONE, StatusChip } from "../chips";
import { changeStatus } from "../actions";

/**
 * Where a job is, and the only control that moves it (owner, 13-11-2026).
 *
 * This used to be a titled panel called "Move this on", a row of up to four
 * buttons and a reason box, sitting between the next action and the steps.
 * It gave the screen two stories about progress — a six-state pipeline and
 * an N-step stepper — and the reader had to reconcile them. The steps are
 * the work; the status is an attribute of the job, so it reads where the
 * job's other attributes read, in the head, and it is actionable there.
 *
 * The refusals are unchanged: every move the server would turn down is
 * still offered, disabled, with its sentence (P3-8). `changeStatus` is the
 * authority either way.
 *
 * `Completed` is reachable from here, but the designed path is the last
 * step's own button inside the work — that one presses the stamp.
 */
export default function StatusMenu({ id, status, moves = [] }) {
  const [asking, setAsking] = useState(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (moves.length === 0) return <StatusChip status={status} />;

  /** Sending work back is a move to "In progress", and reads as one. */
  const labelFor = (to) =>
    to === "In progress" &&
    ["Under review", "Filed / delivered"].includes(status)
      ? "Send back for rework"
      : to;

  const go = (close, to, why) =>
    startTransition(async () => {
      const result = await changeStatus(id, to, why);
      if (result?.ok) {
        setError("");
        setAsking(null);
        setReason("");
        close();
        router.refresh();
      } else {
        setError(result?.error ?? "That did not go through.");
      }
    });

  return (
    <CellPopover
      title="Move this job on"
      triggerLabel={`Status: ${status}. Move this job on`}
      triggerClassName="cursor-pointer"
      trigger={
        <span
          className={`text-13 ml-4 inline-flex gap-1.5 border px-2 py-0.5 ${
            STATUS_TONE[status] ?? "border-rule"
          }`}
        >
          {status}
          <span aria-hidden="true" className="text-11 opacity-70">
            ▾
          </span>
        </span>
      }
    >
      {(close) => (
        <div className="flex flex-col gap-2">
          {asking ? (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-13 font-medium">
                  {asking === "In progress"
                    ? "What needs redoing?"
                    : `Why is this going ${asking.toLowerCase()}?`}
                </span>
                <textarea
                  autoFocus
                  rows={3}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="rounded-control border-rule bg-paper text-14 border px-2 py-1"
                />
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={pending || !reason.trim()}
                  onClick={() => go(close, asking, reason)}
                  className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium disabled:opacity-60"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setAsking(null)}
                  className="text-13 text-ink-muted hover:text-ink underline underline-offset-4"
                >
                  Back
                </button>
              </div>
            </>
          ) : (
            moves.map(({ to, why }) => (
              <Action
                key={to}
                id={`move-${to.replace(/\W/g, "")}`}
                why={why}
                tone="plain"
                pending={pending}
                className="w-full justify-start text-left"
                onClick={() =>
                  NEEDS_REASON.includes(to) ||
                  (to === "In progress" &&
                    ["Under review", "Filed / delivered"].includes(status))
                    ? (setReason(""), setAsking(to))
                    : go(close, to)
                }
              >
                {labelFor(to)}
              </Action>
            ))
          )}

          {error && (
            <p role="alert" className="text-13 text-redpen">
              {error}
            </p>
          )}
        </div>
      )}
    </CellPopover>
  );
}

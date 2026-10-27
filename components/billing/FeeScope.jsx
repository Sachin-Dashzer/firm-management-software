"use client";

import { useState, useTransition } from "react";
import {
  setEngagementFee,
  setEngagementScope,
  requestFeeWaiver,
  decideFeeWaiver,
} from "@/app/(app)/engagements/actions";

/**
 * What one job is worth, and the controls that settle it (P3-4).
 *
 * The same component on the engagement page and on the Billing list, because
 * the prototype's point is that there is *one* waiver process — two copies of
 * these buttons is how two screens come to disagree about who approved what.
 *
 * Who sees which control is decided by `canPrice` and `isPartner`; what is
 * allowed is decided again on the server. A reason box is never optional:
 * every state here that is not "billable at an agreed fee" carries the words
 * that explain it.
 *
 * @param {object} props
 * @param {{ id: string, feePaise: number, scope: string,
 *           waiver: { reason: string, requestedByName: string } | null }} props.money
 *        the state line itself is drawn by the screen around this; what is
 *        needed here is only what decides which controls exist
 * @param {boolean} props.canPrice   may set a fee and move between billable and retainer
 * @param {boolean} props.isPartner  may approve a waiver (`feeWriteOff`)
 * @param {(result: { ok?: string, error?: string }) => void} props.onResult
 */
export default function FeeScope({
  money,
  canPrice,
  isPartner,
  /** The sentence from `whyNot()` when pricing is not theirs (P3-8). */
  whyNoPricing = null,
  onResult = () => {},
}) {
  const [pending, startTransition] = useTransition();
  /** Which box is open: "fee" | "retainer" | "waive" | "decline" | null. */
  const [open, setOpen] = useState(null);
  const [draft, setDraft] = useState("");

  function run(action) {
    startTransition(async () => {
      const result = await action();
      onResult(result);
      if (result?.ok) {
        setOpen(null);
        setDraft("");
      }
    });
  }

  function ask(kind) {
    setOpen(kind);
    setDraft("");
  }

  const waiting = money.waiver;

  if (open === "fee") {
    return (
      <Box
        label="Agreed fee in whole rupees"
        value={draft}
        onChange={setDraft}
        pending={pending}
        disabled={!draft.trim()}
        onCancel={() => setOpen(null)}
        onConfirm={() => {
          const form = new FormData();
          form.set("fee", draft);
          run(() => setEngagementFee(money.id, form));
        }}
        numeric
      />
    );
  }

  if (open === "retainer") {
    return (
      <Box
        label="Which retainer covers this?"
        value={draft}
        onChange={setDraft}
        pending={pending}
        disabled={draft.trim().length < 5}
        onCancel={() => setOpen(null)}
        onConfirm={() =>
          run(() => setEngagementScope(money.id, "retainer", draft))
        }
      />
    );
  }

  if (open === "waive") {
    return (
      <Box
        label={
          isPartner
            ? "Why is the fee waived? The reason is kept with your name."
            : "Why should the fee be waived? A partner reads this and decides."
        }
        value={draft}
        onChange={setDraft}
        pending={pending}
        disabled={draft.trim().length < 5}
        onCancel={() => setOpen(null)}
        onConfirm={() => {
          if (isPartner) {
            run(() => decideFeeWaiver(money.id, true, draft));
          } else {
            const form = new FormData();
            form.set("reason", draft);
            run(() => requestFeeWaiver(money.id, form));
          }
        }}
      />
    );
  }

  if (open === "decline") {
    return (
      <Box
        label="Why is it declined? Whoever asked will read this."
        value={draft}
        onChange={setDraft}
        pending={pending}
        disabled={draft.trim().length < 5}
        onCancel={() => setOpen(null)}
        onConfirm={() => run(() => decideFeeWaiver(money.id, false, draft))}
      />
    );
  }

  // a waiver waiting for a decision is the only thing on offer: the fee and
  // the scope are exactly what the partner is being asked about
  if (waiting) {
    if (!isPartner) {
      return (
        <p className="text-12 text-ink-muted mt-1 max-w-[40ch]">
          Only a Partner / Admin can approve or decline a waiver.
        </p>
      );
    }
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => decideFeeWaiver(money.id, true))}
          className="rounded-control bg-carbon text-13 text-on-carbon h-8 px-3 font-medium disabled:opacity-60"
        >
          Approve the waiver
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => ask("decline")}
          className="rounded-control border-rule bg-paper text-13 h-8 border px-3 disabled:opacity-60"
        >
          Decline
        </button>
      </div>
    );
  }

  /**
   * Not hidden (P3-8): somebody looking at a job with no fee needs to know
   * that agreeing one is not theirs to do, and who to ask. Hiding the
   * controls makes the fee look like an oversight rather than somebody
   * else's job.
   */
  if (!canPrice) {
    return (
      <p className="text-12 text-ink-muted mt-1 max-w-[40ch]">
        {whyNoPricing ??
          "Pricing is for a partner, a CA in this branch, or the accounts team."}
      </p>
    );
  }

  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
      <Act onClick={() => ask("fee")} disabled={pending}>
        {money.feePaise > 0 ? "Change the fee" : "Set the fee"}
      </Act>
      {money.scope === "billable" ? (
        <>
          <Act onClick={() => ask("retainer")} disabled={pending}>
            In retainer
          </Act>
          <Act onClick={() => ask("waive")} disabled={pending}>
            {isPartner ? "Waive the fee" : "Ask a partner to waive it"}
          </Act>
        </>
      ) : (
        <Act
          onClick={() => run(() => setEngagementScope(money.id, "billable"))}
          disabled={pending}
        >
          Make it chargeable again
        </Act>
      )}
    </div>
  );
}

function Act({ onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-13 text-ink-muted hover:text-ink underline underline-offset-4 disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function Box({
  label,
  value,
  onChange,
  pending,
  disabled,
  onCancel,
  onConfirm,
  numeric = false,
}) {
  return (
    <div className="mt-2 flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-12 text-ink-muted font-medium">{label}</span>
        {numeric ? (
          <input
            autoFocus
            inputMode="numeric"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="rounded-control border-rule bg-paper num text-14 h-9 w-40 border px-2"
          />
        ) : (
          <textarea
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={2}
            className="rounded-control border-rule bg-paper text-14 border px-2 py-1"
          />
        )}
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || disabled}
          onClick={onConfirm}
          className="rounded-control bg-carbon text-13 text-on-carbon h-8 px-3 font-medium disabled:opacity-60"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-13 text-ink-muted underline underline-offset-4"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { confirmHeads } from "./actions";

/**
 * The Schedule III head list, waiting for a partner (P3-32, rule 8).
 *
 * Nothing in this feature is refused while it is unconfirmed — a firm
 * halfway through an audit should not be stopped by a settings task — but
 * every screen that reads the list says, in these words, that no partner
 * has looked at it yet. The alternative is a statutory table nobody ever
 * checked, quietly underpinning a signed balance sheet.
 */
export default function ConfirmHeads({ count, mayConfirm }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    async (_prev, formData) => confirmHeads(formData),
    null,
  );

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <div className="rounded-ledger border-waiting bg-waiting-wash flex flex-col gap-2 border px-3 py-2">
      <p className="text-13 max-w-[76ch]">
        <strong>
          No partner has confirmed the Schedule III head list yet.
        </strong>{" "}
        The <span className="num">{count}</span> summary heads below are this
        application&rsquo;s reading of Schedule III, Division I, written down as
        a first draft. The firm should not rely on a statutory table nobody has
        checked, so until a partner confirms it every screen that uses it says
        so.
      </p>
      {mayConfirm ? (
        <form action={action} className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-12 text-ink-muted">
              Anything you want recorded with the confirmation
            </span>
            <input
              name="note"
              maxLength={300}
              placeholder="Checked against Division I as amended to date"
              className="rounded-control border-rule bg-surface text-14 h-9 border px-2"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-control bg-carbon text-on-carbon text-14 h-9 px-3 font-medium disabled:opacity-60"
          >
            {pending ? "Saving…" : "I have read it — confirm"}
          </button>
        </form>
      ) : (
        <p className="text-12 text-ink-muted">Only a partner can confirm it.</p>
      )}
      {state?.error && (
        <p role="alert" className="text-13 text-redpen">
          {state.error}
        </p>
      )}
    </div>
  );
}

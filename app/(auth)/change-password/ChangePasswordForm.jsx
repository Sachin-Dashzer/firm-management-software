"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { changeOwnPassword } from "./actions";

/**
 * Three boxes and a button. The current password is asked for even though the
 * session proves who they are — see the action for why.
 */
export default function ChangePasswordForm({ forced }) {
  const [state, action, pending] = useActionState(changeOwnPassword, null);
  const router = useRouter();

  useEffect(() => {
    if (!state?.ok) return;
    // the layout's redirect is gone now the flag is cleared, so this lands
    const timer = setTimeout(() => router.replace("/me"), 900);
    return () => clearTimeout(timer);
  }, [state?.ok, router]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-13 text-ink-muted">
          {forced ? "The password you were given" : "Current password"}
        </span>
        <input
          type="password"
          name="current"
          required
          autoComplete="current-password"
          autoFocus
          className="rounded-ledger border-rule bg-paper text-14 h-10 border px-3"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-13 text-ink-muted">
          New password — at least 10 characters
        </span>
        <input
          type="password"
          name="next"
          required
          minLength={10}
          autoComplete="new-password"
          className="rounded-ledger border-rule bg-paper text-14 h-10 border px-3"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-13 text-ink-muted">Type it again</span>
        <input
          type="password"
          name="again"
          required
          minLength={10}
          autoComplete="new-password"
          className="rounded-ledger border-rule bg-paper text-14 h-10 border px-3"
        />
      </label>

      {state?.error && (
        <p
          role="alert"
          className="rounded-ledger border-redpen bg-redpen-wash text-13 text-redpen border px-3 py-2"
        >
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p
          role="status"
          className="rounded-ledger border-filed bg-filed-wash text-13 text-filed border px-3 py-2"
        >
          {state.ok} Taking you to your page…
        </p>
      )}

      <button
        type="submit"
        disabled={pending || Boolean(state?.ok)}
        className="rounded-ledger bg-carbon text-surface text-14 h-10 px-4 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Change password"}
      </button>

      {!forced && (
        <a
          href="/me"
          className="text-13 text-ink-muted underline-offset-4 hover:underline"
        >
          Back to my page
        </a>
      )}
    </form>
  );
}

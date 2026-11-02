"use client";

import { useState, useTransition } from "react";
import { setUserActive } from "./actions";

/**
 * Switching one account off, or back on, without leaving the list.
 *
 * The same server action the admin tab uses, which is where the actual
 * rules live — a partner only, never your own account, audited inside the
 * change's own transaction. This is a shortcut to it, not a second path:
 * the owner's reason for wanting it here is that switching somebody off is
 * a decision about the team, and the team is the screen you are on when
 * you make it.
 *
 * **Deactivating asks first.** It signs the person out of the application
 * on their next request, and a row of one-click buttons beside names is
 * exactly the place a mis-click happens. Turning somebody back on asks
 * nothing, because it undoes rather than does.
 */
export default function ActiveToggle({ userId, name, active }) {
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  function go() {
    if (
      active &&
      !window.confirm(
        `Switch off ${name}'s account? They are signed out of the CRM until it is switched back on. Their work and their history stay as they are.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await setUserActive(userId, !active);
      setError(result?.error ?? null);
    });
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={go}
        disabled={pending}
        className={`rounded-control text-13 h-8 border px-2.5 whitespace-nowrap disabled:opacity-60 ${
          active
            ? "border-rule text-ink-muted hover:border-redpen hover:text-redpen"
            : "border-carbon text-carbon hover:bg-carbon-wash"
        }`}
      >
        {pending ? "Saving…" : active ? "Switch off" : "Switch on"}
      </button>
      {error && (
        <span role="alert" className="text-12 text-redpen max-w-[22ch]">
          {error}
        </span>
      )}
    </span>
  );
}

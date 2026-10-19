"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { updateOwnMobile, resetOwn2FA } from "./actions";

/**
 * The parts of your own record you can act on: your mobile number, your
 * password and your authenticator app.
 */
export default function Security({ mobile, twoFactorOn }) {
  const [message, setMessage] = useState(null);
  const [resetting, setResetting] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(work) {
    startTransition(async () => {
      const result = await work();
      setMessage(result);
      if (result?.ok) setResetting(false);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {message?.ok && (
        <p
          role="status"
          className="rounded-ledger border-filed bg-filed-wash text-13 text-filed border px-3 py-2"
        >
          {message.ok}
        </p>
      )}
      {message?.error && (
        <p
          role="alert"
          className="rounded-ledger border-redpen bg-redpen-wash text-13 text-redpen border px-3 py-2"
        >
          {message.error}
        </p>
      )}

      <form
        action={(formData) => run(() => updateOwnMobile(formData))}
        className="flex flex-wrap items-end gap-2"
      >
        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted">My mobile number</span>
          <input
            name="mobile"
            defaultValue={mobile}
            inputMode="numeric"
            placeholder="9811034567"
            className="rounded-ledger border-rule bg-paper text-14 h-9 w-48 border px-2 font-mono"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-ledger border-rule text-14 hover:bg-carbon-wash h-9 border px-3 disabled:opacity-50"
        >
          Save
        </button>
      </form>

      <div className="border-rule flex flex-col gap-3 border-t pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-14">Password</p>
          <Link
            href="/change-password?from=me"
            className="text-13 underline underline-offset-4"
          >
            Change my password
          </Link>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-14">
            Authenticator app
            <span className="text-13 text-ink-muted block">
              {twoFactorOn
                ? "On. Required at every sign-in."
                : "Not set up yet — you will be asked to at your next sign-in."}
            </span>
          </p>
          {twoFactorOn && (
            <button
              type="button"
              onClick={() => setResetting((v) => !v)}
              className="text-13 underline underline-offset-4"
            >
              {resetting ? "Cancel" : "New phone — set it up again"}
            </button>
          )}
        </div>

        {resetting && (
          <form
            action={(formData) => run(() => resetOwn2FA(formData))}
            className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-3"
          >
            <p className="text-13 text-ink-muted max-w-[60ch]">
              This clears the code from your old phone. You will scan a new QR
              code at your next sign-in, so keep this window open until you have
              — otherwise ask a partner to reset it for you.
            </p>
            <label className="flex flex-col gap-1">
              <span className="text-13 text-ink-muted">
                Your password, to confirm it is you
              </span>
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                className="rounded-ledger border-rule bg-paper text-14 h-9 w-64 border px-2"
              />
            </label>
            <button
              type="submit"
              disabled={pending}
              className="rounded-ledger border-redpen text-redpen text-14 h-9 self-start border px-3 disabled:opacity-50"
            >
              {pending ? "Clearing…" : "Clear two-factor"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

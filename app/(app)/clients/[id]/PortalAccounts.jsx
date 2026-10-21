"use client";

import { useState, useTransition } from "react";
import {
  invitePortalUser,
  resetPortalPassword,
  setPortalTwoFactor,
  setPortalUserActive,
} from "./portal";

/**
 * Who outside the firm can sign in to this client's file (P2-9a).
 *
 * It sits on Team & access rather than a tab of its own, because the
 * question it answers is the same one that tab already asks: who can see
 * this client. The firm's people are above; these are the client's own.
 *
 * A one-time password is shown **once**, here, to be read out. Nothing
 * stores it and it cannot be shown again — the next person who needs it
 * gets a new one.
 */
export default function PortalAccounts({ clientId, accounts, mayEdit }) {
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState(null);
  const [password, setPassword] = useState(null);
  const [pending, startTransition] = useTransition();

  function run(work) {
    startTransition(async () => {
      const result = await work();
      setMessage(result);
      setPassword(result?.password ?? null);
      if (result?.ok) setAdding(false);
    });
  }

  return (
    <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-display text-20">
            The client&rsquo;s own logins
          </h2>
          <p className="text-13 text-ink-muted max-w-[65ch]">
            People at the client who can sign in to their portal. They see their
            own company and nothing else, and only documents somebody here has
            marked as shared.
          </p>
        </div>
        {mayEdit && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="rounded-ledger bg-carbon text-14 h-9 px-3 font-medium text-white"
          >
            {adding ? "Cancel" : "Invite somebody"}
          </button>
        )}
      </div>

      {message && (
        <p
          role={message.error ? "alert" : "status"}
          className={`text-14 ${message.error ? "text-redpen" : ""}`}
        >
          {message.error ?? message.ok}
        </p>
      )}

      {password && (
        <div className="rounded-ledger border-brass bg-brass-wash flex flex-col gap-1 border p-3">
          <p className="text-13 font-medium">
            Read this password out to them now. It is not stored anywhere and
            cannot be shown again.
          </p>
          <code className="text-18 font-mono tracking-wide select-all">
            {password}
          </code>
          <p className="text-12 text-ink-muted">
            They will be made to change it the first time they sign in.
          </p>
        </div>
      )}

      {adding && (
        <form
          action={(formData) => run(() => invitePortalUser(clientId, formData))}
          className="grid gap-3 sm:grid-cols-3"
        >
          <label className="flex flex-col gap-1">
            <span className="text-13 text-ink-muted font-medium">Name</span>
            <input
              name="name"
              required
              className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-13 text-ink-muted font-medium">Email</span>
            <input
              name="email"
              type="email"
              required
              className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-13 text-ink-muted font-medium">
              Designation
            </span>
            <input
              name="designation"
              placeholder="Director"
              className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
            />
          </label>
          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-ledger bg-carbon text-14 h-9 px-3 font-medium text-white disabled:opacity-60"
            >
              Create the account
            </button>
          </div>
        </form>
      )}

      {accounts.length === 0 ? (
        <p className="text-13 text-ink-muted">
          Nobody at this client can sign in yet.
        </p>
      ) : (
        <ul className="flex flex-col">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="border-rule flex flex-wrap items-baseline justify-between gap-2 border-b py-3 last:border-0"
            >
              <div>
                <span className="text-14 font-medium">{account.name}</span>
                {!account.active && (
                  <span className="text-12 text-ink-muted"> · closed</span>
                )}
                <p className="text-12 text-ink-muted">
                  {account.email}
                  {account.designation && ` · ${account.designation}`}
                  {account.twoFactor ? " · 2FA required" : ""}
                  {account.mustChangePassword
                    ? " · has not set a password yet"
                    : ""}
                </p>
                <p className="text-12 text-ink-muted">
                  {account.lastLoginAt
                    ? `Last signed in ${account.lastLoginAt}`
                    : "Never signed in"}
                  {account.invitedByName &&
                    ` · invited by ${account.invitedByName}`}
                </p>
              </div>
              {mayEdit && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(() => resetPortalPassword(clientId, account.id))
                    }
                    className="rounded-ledger border-rule text-13 h-8 border px-2"
                  >
                    New password
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        setPortalTwoFactor(
                          clientId,
                          account.id,
                          !account.twoFactor,
                        ),
                      )
                    }
                    className="rounded-ledger border-rule text-13 h-8 border px-2"
                  >
                    {account.twoFactor ? "Stop requiring 2FA" : "Require 2FA"}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        setPortalUserActive(
                          clientId,
                          account.id,
                          !account.active,
                        ),
                      )
                    }
                    className="rounded-ledger border-rule text-13 h-8 border px-2"
                  >
                    {account.active ? "Close access" : "Reopen"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

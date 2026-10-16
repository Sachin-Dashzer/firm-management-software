"use client";

import { useState, useTransition } from "react";
import { ROLE_LABELS, ROLES } from "@/lib/permissions";
import { createUser, resetPassword, reset2FA, setUserActive } from "./actions";

/**
 * The team list, plus the form for adding someone.
 *
 * A one-time password is shown once, here, because there is no mailer until
 * Step 9; the partner reads it out and the user must change it at first
 * sign-in.
 */
export default function UserAdmin({ rows, branches, colleagues }) {
  const [message, setMessage] = useState(null);
  const [adding, setAdding] = useState(false);
  const [role, setRole] = useState("employee");
  const [pending, startTransition] = useTransition();

  function run(action) {
    startTransition(async () => setMessage(await action()));
  }

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-28 font-semibold">Team</h1>
          <p className="text-13 text-ink-muted">
            {rows.length} {rows.length === 1 ? "person" : "people"} · only a
            partner can change this list
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="rounded-ledger bg-carbon text-14 h-9 px-3 font-medium text-white"
        >
          {adding ? "Cancel" : "Add a team member"}
        </button>
      </div>

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

      {adding && (
        <form
          action={(formData) =>
            startTransition(async () => {
              const result = await createUser(null, formData);
              setMessage(result);
              if (result?.ok) setAdding(false);
            })
          }
          className="rounded-ledger border-rule bg-surface grid gap-4 border p-4 sm:grid-cols-2"
        >
          <Field label="Full name" name="name" required />
          <Field label="Email" name="email" type="email" required />
          <Field
            label="Mobile"
            name="mobile"
            inputMode="numeric"
            placeholder="10 digits"
          />
          <label className="flex flex-col gap-1">
            <span className="text-13 text-ink-muted font-medium">Role</span>
            <select
              name="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="flex flex-col gap-1">
            <legend className="text-13 text-ink-muted font-medium">
              Branches
            </legend>
            <div className="flex flex-wrap gap-3 pt-1">
              {branches.map((b) => (
                <label key={b.id} className="text-14 flex items-center gap-2">
                  <input type="checkbox" name="branchIds" value={b.id} />
                  <span>
                    {b.code} <span className="text-ink-muted">({b.name})</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex flex-col gap-1">
            <span className="text-13 text-ink-muted font-medium">
              Reporting CA
            </span>
            <select
              name="reportingTo"
              className="rounded-ledger border-rule bg-paper text-14 h-10 border px-2"
            >
              <option value="">— none —</option>
              {colleagues.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <Field
            label="Capacity (hours per day)"
            name="capacityHours"
            type="number"
            defaultValue={8}
            min={0}
            max={24}
          />

          {role === "intern" && (
            <>
              <Field label="ICAI registration no." name="icaiRegNo" />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Articleship start"
                  name="articleshipStart"
                  type="date"
                />
                <Field label="Expected end" name="articleshipEnd" type="date" />
              </div>
            </>
          )}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-ledger bg-carbon text-14 h-10 px-4 font-medium text-white disabled:opacity-60"
            >
              {pending ? "Adding…" : "Add team member"}
            </button>
          </div>
        </form>
      )}

      <div className="rounded-ledger border-rule bg-surface overflow-x-auto border">
        <table className="text-14 w-full">
          <thead>
            <tr className="border-rule text-12 text-ink-muted border-b text-left tracking-wide uppercase">
              <Th>Name</Th>
              <Th>Role</Th>
              <Th>Branches</Th>
              <Th>2FA</Th>
              <Th>Last sign-in</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-rule border-b last:border-0">
                <Td>
                  <span className="font-medium">{u.name}</span>
                  <br />
                  <span className="text-13 text-ink-muted">{u.email}</span>
                </Td>
                <Td>{u.roleLabel}</Td>
                <Td className="text-13 font-mono">{u.branches.join(" ")}</Td>
                <Td>
                  {u.twoFactor ? (
                    <span className="text-filed">On</span>
                  ) : (
                    <span className="text-waiting">Not set up</span>
                  )}
                </Td>
                <Td className="num text-13">{u.lastLogin}</Td>
                <Td>
                  {u.active ? (
                    <span className="text-filed">Active</span>
                  ) : (
                    <span className="text-ink-muted">Inactive</span>
                  )}
                </Td>
                <Td>
                  <div className="text-13 flex flex-wrap gap-2">
                    <Action onClick={() => run(() => resetPassword(u.id))}>
                      Reset password
                    </Action>
                    <Action onClick={() => run(() => reset2FA(u.id))}>
                      Reset 2FA
                    </Action>
                    {!u.isSelf && (
                      <Action
                        onClick={() =>
                          run(() => setUserActive(u.id, !u.active))
                        }
                      >
                        {u.active ? "Deactivate" : "Activate"}
                      </Action>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="text-ink-muted px-3 py-6 text-center"
                >
                  No team members yet. Run the seed script, or add someone
                  above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, ...rest }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-13 text-ink-muted font-medium">{label}</span>
      <input
        className="rounded-ledger border-rule bg-paper text-14 text-ink h-10 border px-3"
        {...rest}
      />
    </label>
  );
}

function Th({ children }) {
  return <th className="px-3 py-2 font-medium">{children}</th>;
}

function Td({ children, className = "" }) {
  return <td className={`px-3 py-2 align-top ${className}`}>{children}</td>;
}

function Action({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-ledger border-rule hover:bg-carbon-wash border px-2 py-1"
    >
      {children}
    </button>
  );
}

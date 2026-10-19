"use client";

import { useState, useTransition } from "react";
import { ROLE_LABELS, ROLES } from "@/lib/permissions";
import { createUser } from "./actions";

/**
 * Adding somebody to the firm. Moved off `/settings/users` in P2-3; the
 * screen it used to live on is now a redirect here.
 *
 * The one-time password is shown once, in this panel, because there is still
 * no invitation email: the partner reads it out, and the app layout now
 * forces the new person to replace it before they can reach anything.
 */
export default function NewPerson({ branches, seniors }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("employee");
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="rounded-ledger bg-carbon text-surface text-14 h-9 self-start px-3 font-medium"
      >
        {open ? "Cancel" : "Add somebody"}
      </button>

      {(message || open) && (
        <div>
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

          {open && (
            <form
              action={(formData) =>
                startTransition(async () => {
                  const result = await createUser(null, formData);
                  setMessage(result);
                  if (result?.ok) setOpen(false);
                })
              }
              className="rounded-ledger border-rule bg-surface mt-3 grid gap-4 border p-4 sm:grid-cols-2"
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
                  Offices
                </legend>
                <div className="flex flex-wrap gap-3 pt-1">
                  {branches.map((b) => (
                    <label
                      key={b.id}
                      className="text-14 flex items-center gap-2"
                    >
                      <input
                        type="checkbox"
                        name="branchIds"
                        value={b.id}
                        className="accent-carbon"
                      />
                      <span>
                        {b.code}{" "}
                        <span className="text-ink-muted">({b.name})</span>
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
                  {seniors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {role !== "partner" && (
                  <span className="text-13 text-ink-muted">
                    Without one, their &ldquo;My senior CA&rdquo; card is empty.
                  </span>
                )}
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
                    <Field
                      label="Expected end"
                      name="articleshipEnd"
                      type="date"
                    />
                  </div>
                </>
              )}

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-ledger bg-carbon text-surface text-14 h-10 px-4 font-medium disabled:opacity-60"
                >
                  {pending ? "Adding…" : "Add them"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
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

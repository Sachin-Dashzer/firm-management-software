"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateBranch } from "./actions";

/**
 * The offices, and the registration each one bills under.
 *
 * A branch with no GSTIN is called out plainly, because until it has one
 * the firm cannot raise a tax invoice from it at all — and that is not
 * obvious from anywhere else in the app.
 */
export default function Branches({ rows }) {
  const router = useRouter();
  const [message, setMessage] = useState(null);
  const [editing, setEditing] = useState(null);
  const [pending, startTransition] = useTransition();

  const missing = rows.filter((r) => !r.gstin);

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-5 p-4 md:p-6">
      <div>
        <h1 className="font-display text-24 font-bold tracking-tight">
          Branches
        </h1>
        <p className="text-13 text-ink-muted">
          Each office bills under its own GST registration and its own invoice
          series.
        </p>
      </div>

      {missing.length > 0 && (
        <div className="rounded-ledger border-waiting bg-waiting-wash border p-4">
          <p className="text-14 font-medium">
            {missing.length === rows.length
              ? "No branch has a GSTIN yet."
              : `${missing.length} ${missing.length === 1 ? "branch has" : "branches have"} no GSTIN.`}
          </p>
          <p className="text-13">
            The first two digits of the GSTIN say which state is supplying,
            which decides whether an invoice carries CGST and SGST or IGST.
            Until a branch has one, its invoices can be drafted but not issued.
            If the firm bills everything under a single registration, put that
            same GSTIN on each branch.
          </p>
        </div>
      )}

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

      {rows.map((branch) => (
        <section
          key={branch.id}
          className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="font-display text-15 font-semibold">
                {branch.name}
              </h2>
              <p className="text-13 text-ink-muted font-mono">{branch.code}</p>
            </div>
            <p className="text-13 text-ink-muted">
              Series <span className="font-mono">{branch.series}</span> ·{" "}
              {branch.issued} issued
            </p>
          </div>

          {editing === branch.id ? (
            <form
              action={(formData) =>
                startTransition(async () => {
                  setMessage(await updateBranch(branch.id, formData));
                  setEditing(null);
                  router.refresh();
                })
              }
              className="grid gap-3 sm:grid-cols-2"
            >
              <label className="flex flex-col gap-1">
                <span className="text-13 text-ink-muted font-medium">
                  GSTIN
                </span>
                <input
                  name="gstin"
                  defaultValue={branch.gstin}
                  maxLength={15}
                  placeholder="09AABCS1429P1ZZ"
                  className="rounded-control border-rule bg-paper text-14 h-9 border px-2 font-mono uppercase"
                />
                <span className="text-12 text-ink-muted">
                  Checked properly, not just for shape.
                </span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-13 text-ink-muted font-medium">
                  Address on the invoice
                </span>
                <input
                  name="address"
                  defaultValue={branch.address}
                  className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                />
              </label>
              <div className="flex gap-3 sm:col-span-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium disabled:opacity-60"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="text-14 text-ink-muted underline underline-offset-4"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <dl className="text-14 flex flex-wrap gap-x-6 gap-y-1">
                <div className="flex gap-2">
                  <dt className="text-ink-muted">GSTIN</dt>
                  <dd className="font-mono">
                    {branch.gstin || (
                      <span className="text-waiting font-sans">not set</span>
                    )}
                  </dd>
                </div>
                {branch.stateName && (
                  <div className="flex gap-2">
                    <dt className="text-ink-muted">Supplying from</dt>
                    <dd>{branch.stateName}</dd>
                  </div>
                )}
                {branch.address && (
                  <div className="flex gap-2">
                    <dt className="text-ink-muted">Address</dt>
                    <dd>{branch.address}</dd>
                  </div>
                )}
              </dl>
              <button
                type="button"
                onClick={() => setEditing(branch.id)}
                className="text-13 underline underline-offset-4"
              >
                Edit
              </button>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

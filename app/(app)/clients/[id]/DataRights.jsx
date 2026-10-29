"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewRedaction, actionRedaction } from "./dpdp";

/**
 * What to do when a client exercises their rights under the DPDP Act
 * (spec section 16).
 *
 * The export is a link, because it is harmless and often wanted. The
 * deletion is behind a preview that names what will survive and what will
 * not, then a typed reason, then a confirmation — not because a partner
 * cannot be trusted, but because this is the one action in the whole
 * product that cannot be undone, and it should feel like it.
 */
export default function DataRights({ clientId, clientName, redactedAt }) {
  const router = useRouter();
  const [plan, setPlan] = useState(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  if (redactedAt) {
    return (
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border p-4">
        <h2 className="font-display text-15 font-semibold">Data protection</h2>
        <p className="text-14">
          This client&rsquo;s personal data was redacted on a deletion request
          on <strong>{redactedAt}</strong>. The invoices, the work and the audit
          log were kept, as the law requires.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
      <div>
        <h2 className="font-display text-15 font-semibold">Data protection</h2>
        <p className="text-13 text-ink-muted">
          What to do if {clientName} asks for a copy of their data, or asks the
          firm to delete it (Digital Personal Data Protection Act, 2023).
        </p>
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

      <div className="flex flex-wrap gap-2">
        <a
          href={`/clients/${clientId}/export`}
          className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 leading-9 font-medium"
        >
          Download everything we hold
        </a>
        {!plan && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await previewRedaction(clientId);
                if (result?.error) return setMessage(result);
                setPlan(result);
              })
            }
            className="rounded-control border-redpen text-14 text-redpen h-9 border px-3 font-medium"
          >
            They have asked us to delete their data…
          </button>
        )}
      </div>

      {plan && (
        <div className="rounded-ledger border-redpen bg-redpen-wash flex flex-col gap-3 border p-3">
          <p className="text-14 font-medium">
            This cannot be undone. Read what will happen.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <h3 className="text-12 text-redpen mb-1 font-medium">
                Gone for good
              </h3>
              <ul className="text-13 flex flex-col gap-0.5">
                {plan.clears.map(([field, what]) => (
                  <li key={field}>
                    <strong>{field}</strong> — {what}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-12 text-filed mb-1 font-medium">
                Kept, because the law requires it
              </h3>
              <ul className="text-13 flex flex-col gap-0.5">
                {plan.keeps.map(([field, why]) => (
                  <li key={field}>
                    <strong>{field}</strong> — {why}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="text-13">
            For {plan.name}: <strong>{plan.invoices}</strong>{" "}
            {plan.invoices === 1 ? "invoice" : "invoices"} and{" "}
            <strong>{plan.engagements}</strong>{" "}
            {plan.engagements === 1 ? "job" : "jobs"} will be kept.
            {plan.openEngagements > 0 && (
              <span className="text-redpen">
                {" "}
                {plan.openEngagements} of those{" "}
                {plan.openEngagements === 1 ? "is" : "are"} still unfinished, so
                this cannot be done yet.
              </span>
            )}
          </p>

          <label className="flex flex-col gap-1">
            <span className="text-13 font-medium">
              Who asked, and when? This is the only explanation that will be
              left.
            </span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              placeholder="Mr Verma asked by email on 14-10-2026; engagement ended March 2026."
              className="rounded-control border-rule bg-paper text-14 border px-2 py-1"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || plan.openEngagements > 0}
              onClick={() =>
                startTransition(async () => {
                  const result = await actionRedaction(clientId, reason);
                  setMessage(result);
                  if (result?.ok) {
                    setPlan(null);
                    router.refresh();
                  }
                })
              }
              className="rounded-control bg-redpen text-14 h-9 px-3 font-medium text-white disabled:opacity-50"
            >
              {pending ? "Redacting…" : "Redact this client's personal data"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPlan(null);
                setReason("");
              }}
              className="text-13 underline underline-offset-4"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

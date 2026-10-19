"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDocRequest, revokeDocRequest } from "../../documents/requests";

/**
 * Asking the client for what is still outstanding (spec section 6).
 *
 * The link is shown once, here, with a copy button — it is the only
 * credential, so it is never rendered again afterwards; the list below shows
 * only the first few characters, enough to tell two links apart.
 *
 * It can be emailed to the client's main contact — which also starts the
 * three-day follow-ups — or copied and sent however the firm likes.
 * WhatsApp is Phase 2; the record of the request is the same either way.
 */
export default function RequestPanel({
  engagementId,
  outstanding,
  requests,
  mayRequest,
}) {
  const router = useRouter();
  const [message, setMessage] = useState(null);
  const [link, setLink] = useState(null);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function make({ email = false } = {}) {
    startTransition(async () => {
      const result = await createDocRequest(engagementId, {
        message: note,
        email,
      });
      setMessage(result);
      // the action returns the link only when the client has *not* been
      // written to; showing it after an email would invite sending twice
      setLink(result?.link ?? null);
      setCopied(false);
      if (result?.ok) {
        setNote("");
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
      <div>
        <h2 className="font-display text-20">Ask the client</h2>
        <p className="text-13 text-ink-muted">
          {outstanding === 0
            ? "Nothing is outstanding from the client."
            : `${outstanding} ${outstanding === 1 ? "document is" : "documents are"} still to come from the client.`}
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

      {link && (
        <div className="rounded-ledger border-brass bg-surface flex flex-col gap-2 border p-3">
          <p className="text-13 font-medium">
            Send this link to the client. It is shown only now.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={link}
              aria-label="Upload link for the client"
              onFocus={(e) => e.target.select()}
              className="rounded-ledger border-rule bg-paper text-13 h-9 min-w-0 flex-1 border px-2 font-mono"
            />
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
              className="rounded-ledger bg-carbon text-14 h-9 px-3 font-medium text-white"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-12 text-ink-muted">
            Anyone holding this link can upload for seven days, but cannot read
            anything.
          </p>
        </div>
      )}

      {mayRequest && outstanding > 0 && (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-13 text-ink-muted font-medium">
              A note for the client (optional)
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="We need these to file October's return by the 20th."
              className="rounded-ledger border-rule bg-paper text-14 border px-2 py-1"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => make({ email: true })}
              className="rounded-ledger bg-carbon text-14 h-9 px-3 font-medium text-white disabled:opacity-60"
            >
              {pending ? "Working…" : "Email the client a link"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => make()}
              className="rounded-ledger border-rule text-14 h-9 border px-3 font-medium disabled:opacity-60"
            >
              Just make a link
            </button>
          </div>
        </div>
      )}

      {requests.length > 0 && (
        <ul className="flex flex-col">
          {requests.map((r) => (
            <li
              key={r.id}
              className="border-rule flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-0"
            >
              <span className="text-13">
                <span className="font-mono">{r.hint}…</span> · {r.items}{" "}
                {r.items === 1 ? "document" : "documents"} · {r.uploads}{" "}
                received
                <span className="text-ink-muted">
                  {" "}
                  ·{" "}
                  {r.revoked
                    ? "withdrawn"
                    : r.open
                      ? `open until ${new Date(r.expiresAt).toLocaleDateString("en-GB")}`
                      : "expired"}
                </span>
              </span>
              {r.open && mayRequest && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      setMessage(await revokeDocRequest(r.id));
                      setLink(null);
                      router.refresh();
                    })
                  }
                  className="text-13 underline underline-offset-4 disabled:opacity-60"
                >
                  Withdraw
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

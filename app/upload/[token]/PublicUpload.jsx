"use client";

import { useState } from "react";
import { publicConfirmUpload, publicUploadTicket } from "./actions";

/**
 * What the client actually uses: a list of the documents being asked for,
 * each with its own upload button.
 *
 * Deliberately plain. The person using this may be on a phone, in a hurry,
 * and has never seen the CRM — so there is one thing to do per row, the
 * state of each row is in words, and nothing here can fail silently.
 */
export default function PublicUpload({ token, details }) {
  const [items, setItems] = useState(details.items);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  const expires = new Date(details.expiresAt).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  async function send(item, files) {
    if (files.length === 0) return;
    setMessage(null);

    for (const file of [...files]) {
      setBusy(`${item.name}: sending ${file.name}…`);

      const ticket = await publicUploadTicket(token, {
        itemId: item.id,
        filename: file.name,
        mime: file.type,
        size: file.size,
      });
      if (ticket?.error) {
        setBusy(null);
        setMessage({ error: ticket.error });
        return;
      }

      const body = new FormData();
      body.append(ticket.field, file);
      let stored;
      try {
        const response = await fetch(ticket.url, { method: "POST", body });
        stored = await response.json();
        if (!response.ok) throw new Error(stored?.error ?? "Upload refused");
      } catch {
        setBusy(null);
        setMessage({
          error: `${file.name} could not be sent. Please check your connection and try again.`,
        });
        return;
      }

      const saved = await publicConfirmUpload(token, {
        itemId: item.id,
        key: ticket.key,
        fy: ticket.fy,
        filename: file.name,
        mime: stored.mime || file.type,
        size: stored.size ?? file.size,
        checksum: stored.checksum,
      });
      if (saved?.error) {
        setBusy(null);
        setMessage({ error: saved.error });
        return;
      }

      setItems((old) =>
        old.map((row) =>
          row.id === item.id ? { ...row, received: true } : row,
        ),
      );
    }

    setBusy(null);
    setMessage({ ok: "Received, thank you." });
  }

  const outstanding = items.filter((i) => !i.received && i.mandatory).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-24 font-semibold">
          {details.clientName
            ? `Documents for ${details.clientName}`
            : "Documents we need"}
        </h1>
        <p className="text-14 text-ink-muted">
          Please send the documents below. This page works until{" "}
          <strong>{expires}</strong>.
        </p>
        {details.message && (
          <p className="rounded-ledger border-rule bg-surface text-14 border p-3">
            {details.message}
          </p>
        )}
      </div>

      {message?.ok && (
        <p
          role="status"
          className="rounded-ledger border-filed bg-filed-wash text-14 text-filed border px-3 py-2"
        >
          {message.ok}
        </p>
      )}
      {message?.error && (
        <p
          role="alert"
          className="rounded-ledger border-redpen bg-redpen-wash text-14 text-redpen border px-3 py-2"
        >
          {message.error}
        </p>
      )}
      {busy && (
        <p role="status" className="text-14 text-ink-muted">
          {busy}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-ledger border-rule bg-surface flex flex-wrap items-center justify-between gap-3 border p-3"
          >
            <span>
              <span className="text-14 block font-medium">{item.name}</span>
              <span className="text-13 text-ink-muted">
                {item.received
                  ? "Received, thank you"
                  : item.mandatory
                    ? "Needed"
                    : "Optional"}
              </span>
            </span>

            <label className="rounded-control bg-carbon text-14 text-on-carbon h-10 cursor-pointer px-4 leading-10 font-medium">
              {item.received ? "Send another" : "Choose file"}
              <input
                type="file"
                multiple
                aria-label={`Send ${item.name}`}
                disabled={Boolean(busy)}
                onChange={(e) => send(item, e.target.files ?? [])}
                className="sr-only"
              />
            </label>
          </li>
        ))}
      </ul>

      <p className="text-13 text-ink-muted">
        {outstanding === 0
          ? "That is everything we asked for. You can close this page."
          : `${outstanding} still to send. You can come back to this page until ${expires}.`}
      </p>
      <p className="text-12 text-ink-muted">
        PDF, photographs, Excel, Word and ZIP files up to 25 MB each.
      </p>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import {
  confirmUpload,
  requestUpload,
} from "../../app/(app)/documents/actions";

/**
 * Attach files (spec section 6): multi-file, drag-and-drop, and a plain
 * button for anyone not using a mouse.
 *
 * ponytail: the browser's own drag events and file input, no library. The
 * bytes go straight from here to the gateway — the app only signs the ticket
 * and records what the gateway confirms it stored.
 */
export default function Uploader({
  engagementId,
  clientId,
  checklistItemId,
  udinId,
  permanent = false,
  replacesId,
  label = "Attach files",
  onDone,
  disabled = false,
}) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  async function send(files) {
    if (disabled || files.length === 0) return;
    setMessage(null);

    for (const [index, file] of [...files].entries()) {
      setBusy(`${file.name} (${index + 1} of ${files.length})`);

      // 1. ask the app where this may go
      const ticket = await requestUpload({
        engagementId,
        clientId,
        checklistItemId,
        permanent,
        filename: file.name,
        mime: file.type,
        size: file.size,
      });
      if (ticket?.error) {
        setBusy(null);
        setMessage({ error: `${file.name}: ${ticket.error}` });
        return;
      }

      // 2. send the bytes straight to the gateway
      const body = new FormData();
      body.append(ticket.field, file);
      let stored;
      try {
        const response = await fetch(ticket.url, { method: "POST", body });
        stored = await response.json();
        if (!response.ok) throw new Error(stored?.error ?? "Upload refused");
      } catch (err) {
        setBusy(null);
        setMessage({ error: `${file.name}: ${err.message}` });
        return;
      }

      // 3. record it, now that the bytes are really there
      const saved = await confirmUpload({
        engagementId,
        clientId,
        checklistItemId,
        udinId,
        permanent,
        replacesId,
        key: ticket.key,
        fy: ticket.fy,
        filename: file.name,
        name: file.name,
        mime: stored.mime || file.type,
        size: stored.size ?? file.size,
        checksum: stored.checksum,
      });
      if (saved?.error) {
        setBusy(null);
        setMessage({ error: `${file.name}: ${saved.error}` });
        return;
      }
    }

    setBusy(null);
    setMessage({
      ok: `${files.length} file${files.length === 1 ? "" : "s"} attached.`,
    });
    if (input.current) input.current.value = "";
    onDone?.();
  }

  return (
    <div className="flex flex-col gap-1">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          send(e.dataTransfer.files);
        }}
        className={`rounded-ledger flex flex-wrap items-center gap-3 border border-dashed px-3 py-2 ${
          over ? "border-carbon bg-carbon-wash" : "border-rule"
        } ${disabled ? "opacity-60" : ""}`}
      >
        <button
          type="button"
          disabled={disabled || Boolean(busy)}
          onClick={() => input.current?.click()}
          className="rounded-ledger border-rule text-14 h-9 border px-3 disabled:opacity-60"
        >
          {busy ? "Uploading…" : label}
        </button>
        <span className="text-13 text-ink-muted">
          {busy ?? "or drop files here"}
        </span>
        <input
          ref={input}
          type="file"
          multiple={!replacesId}
          aria-label={label}
          disabled={disabled}
          onChange={(e) => send(e.target.files ?? [])}
          className="sr-only"
        />
      </div>

      {message?.ok && (
        <p role="status" className="text-13 text-filed">
          {message.ok}
        </p>
      )}
      {message?.error && (
        <p role="alert" className="text-13 text-redpen">
          {message.error}
        </p>
      )}
    </div>
  );
}

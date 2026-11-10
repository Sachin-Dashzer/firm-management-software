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
  sampleItemId,
  udinId,
  permanent = false,
  replacesId,
  label = "Attach files",
  onDone,
  disabled = false,
  origin: initialOrigin = "client",
}) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);
  /**
   * Whose paper this is. Asked here rather than guessed, because the person
   * holding the file is the only one who knows — and asked *before* the
   * file is chosen, so the answer is not a second step after the upload has
   * already finished.
   */
  const [origin, setOrigin] = useState(initialOrigin);

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
        sampleItemId,
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
        sampleItemId,
        udinId,
        permanent,
        replacesId,
        origin,
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
          className="rounded-control border-rule text-14 h-9 border px-3 disabled:opacity-60"
        >
          {busy ? "Uploading…" : label}
        </button>
        <label className="text-13 text-ink-muted flex items-center gap-1.5">
          <span className="sr-only sm:not-sr-only">Type</span>
          <select
            value={origin}
            disabled={disabled || Boolean(busy)}
            onChange={(event) => setOrigin(event.target.value)}
            aria-label="Whose document this is"
            className="rounded-control border-rule bg-paper text-13 text-ink h-8 border px-1.5 disabled:opacity-60"
          >
            <option value="client">From the client</option>
            <option value="firm">Issued by us</option>
          </select>
        </label>

        <span className="text-13 text-ink-muted">
          {busy ?? "or drop files here"}
        </span>
        <input
          ref={input}
          type="file"
          multiple={!replacesId}
          aria-label={label}
          disabled={disabled}
          onChange={(e) => {
            // emptied before sending, so a file the gateway refuses can be
            // corrected and chosen again under the same name
            const chosen = [...(e.target.files ?? [])];
            e.target.value = "";
            send(chosen);
          }}
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

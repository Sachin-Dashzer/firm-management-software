"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadGstWorkbook, sendGstDataBack, confirmSetOffRule } from "./gst";

/**
 * One month of GST, from the sheet out to the figure (P3-12).
 *
 * The caveat is on the computation and not in a footnote at the bottom of
 * the page, because the figure is the thing somebody screenshots and sends
 * to a client. Wherever the number goes, the sentence goes with it.
 */
export default function GstPanel({ gst, engagementId, mayEdit, isPartner }) {
  const router = useRouter();
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();
  const [openRule, setOpenRule] = useState(null);

  function run(action) {
    startTransition(async () => {
      const result = await action();
      setMessage(result);
      if (result?.ok) {
        setOpenRule(null);
        router.refresh();
      }
    });
  }

  const computation = gst.computation;

  return (
    <section className="rounded-ledger border-rule bg-surface flex flex-col gap-4 border p-4">
      <div>
        <h2 className="font-display text-15 font-semibold">
          This month&rsquo;s GST data
        </h2>
        <p className="text-13 text-ink-muted max-w-[70ch]">
          The workbook goes out, comes back, and is checked before anybody
          prepares from it. Nothing here is a return: the one the firm files is
          prepared from the GSTR-2B reconciliation.
        </p>
      </div>

      {message?.ok && (
        <div
          role="status"
          className="rounded-ledger border-filed bg-filed-wash text-13 text-filed border px-3 py-2"
        >
          <p>{message.ok}</p>
          {message.issues?.length > 0 && (
            <ul className="mt-2 flex flex-col gap-2">
              {message.issues.map((group) => (
                <li key={group.sheet}>
                  <strong>
                    {group.sheet} — {group.count}
                  </strong>
                  <ul className="list-disc pl-5">
                    {group.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {message?.error && (
        <p
          role="alert"
          className="rounded-ledger border-redpen bg-redpen-wash text-13 text-redpen border px-3 py-2"
        >
          {message.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <a
          href={`/engagements/${engagementId}/gst-template`}
          className="rounded-control border-rule bg-paper text-14 h-9 border px-3 leading-9"
        >
          Download the workbook to send
        </a>
        <span className="text-12 text-ink-muted">
          Headed with this client and this period, and stamped &ldquo;not a
          filing file&rdquo;.
        </span>
      </div>

      {mayEdit && (
        <form
          action={(formData) =>
            run(() => uploadGstWorkbook(engagementId, formData))
          }
          className="border-rule flex flex-wrap items-end gap-2 border-t pt-3"
        >
          <label className="flex flex-col gap-1">
            <span className="text-12 text-ink-muted font-medium">
              The workbook the client sent back
            </span>
            <input
              type="file"
              name="workbook"
              required
              accept=".xlsx"
              className="text-14"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium disabled:opacity-60"
          >
            Check it
          </button>
        </form>
      )}

      {gst.uploadedAt && (
        <div className="border-rule flex flex-col gap-2 border-t pt-3">
          <p className="text-13">
            <strong>{gst.fileName || "Workbook"}</strong> — submission{" "}
            {gst.submissionCount}, checked {gst.uploadedAt} by{" "}
            {gst.uploadedByName}
            {gst.counts && (
              <span className="text-ink-muted">
                {" "}
                ·{" "}
                {Object.entries(gst.counts)
                  .map(([key, n]) => `${LABELS[key] ?? key}: ${n}`)
                  .join(", ")}
              </span>
            )}
          </p>

          {gst.missingSheets?.length > 0 && (
            <p className="text-13 text-waiting">
              Sheets missing from the file: {gst.missingSheets.join(", ")}.
            </p>
          )}

          {gst.issues?.length > 0 ? (
            <div className="rounded-ledger border-waiting bg-waiting-wash flex flex-col gap-2 border p-3">
              <p className="text-14 font-medium">
                {gst.issues.length}{" "}
                {gst.issues.length === 1 ? "thing" : "things"} to correct
                {gst.sentBackAt
                  ? ` · sent back ${gst.sentBackAt}${gst.sentBackCount > 1 ? ` (${gst.sentBackCount} times)` : ""}`
                  : ""}
              </p>
              <ul className="text-13 flex flex-col gap-1">
                {gst.issues.slice(0, 12).map((issue, index) => (
                  <li key={`${issue.sheet}-${issue.row}-${index}`}>
                    <span className="num">
                      {issue.sheet}, row {issue.row}
                    </span>{" "}
                    — {issue.column} {issue.says}.{" "}
                    <span className="text-ink-muted">{issue.fix}</span>
                  </li>
                ))}
              </ul>
              {gst.issues.length > 12 && (
                <p className="text-12 text-ink-muted">
                  and {gst.issues.length - 12} more — the message sent back
                  carries all of them.
                </p>
              )}
              {mayEdit && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => sendGstDataBack(engagementId))}
                  className="rounded-control bg-carbon text-13 text-on-carbon h-8 w-fit px-3 font-medium disabled:opacity-60"
                >
                  Send the list back to the client
                </button>
              )}
            </div>
          ) : (
            <p className="text-13 text-filed">
              Nothing to correct in the file as it stands.
            </p>
          )}
        </div>
      )}

      {computation && (
        <div className="border-rule flex flex-col gap-2 border-t pt-3">
          <h3 className="text-16 font-semibold">
            What the month looks like
            {!computation.confirmed && (
              <span className="text-12 text-waiting font-normal">
                {" "}
                · the set-off order is not confirmed
              </span>
            )}
          </h3>

          <div className="rounded-table border-rule overflow-x-auto border">
            <table className="text-14 w-full">
              <thead>
                <tr className="border-rule bg-sunk text-12 text-ink-muted border-b text-left tracking-wide uppercase">
                  <th className="px-3 py-2 font-medium" />
                  <th className="px-3 py-2 text-right font-medium">IGST</th>
                  <th className="px-3 py-2 text-right font-medium">CGST</th>
                  <th className="px-3 py-2 text-right font-medium">SGST</th>
                </tr>
              </thead>
              <tbody>
                <Row label="Output tax" heads={computation.output} />
                <Row label="Eligible credit" heads={computation.credit} />
                <Row label="Credit used" heads={computation.used} />
                <Row label="Payable in cash" heads={computation.cash} strong />
                <Row
                  label="Credit carried forward"
                  heads={computation.carried}
                />
              </tbody>
            </table>
          </div>

          <p className="text-14">
            <strong className="num">
              ₹{Number(computation.total).toLocaleString("en-IN")}
            </strong>{" "}
            to pay in cash, indicatively.
          </p>

          <p className="rounded-ledger border-waiting bg-waiting-wash text-12 border px-3 py-2">
            {computation.caveat}
          </p>

          {computation.excluded?.length > 0 && (
            <div className="text-13">
              <p className="font-medium">
                Credit not taken on {computation.excluded.length}{" "}
                {computation.excluded.length === 1 ? "invoice" : "invoices"}
              </p>
              <ul className="text-ink-muted flex flex-col">
                {computation.excluded.map((row, index) => (
                  <li key={`${row.invoiceNo}-${index}`}>
                    {row.invoiceNo || "(no number)"} — {row.why}
                    {row.amount ? (
                      <span className="num">
                        {" "}
                        · ₹{Number(row.amount).toLocaleString("en-IN")}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {computation.unconfirmed?.length > 0 && (
            <div className="rounded-ledger border-waiting bg-waiting-wash flex flex-col gap-2 border p-3">
              <p className="text-13">
                These rules decide the figures above and nobody at the firm has
                confirmed them yet. The arithmetic still runs — a bookkeeper
                needs it — but do not send a client a figure that rests on an
                unread rule.
              </p>
              <ul className="flex flex-col gap-2">
                {computation.unconfirmed.map((rule) => (
                  <li key={rule.key} className="flex flex-col gap-1">
                    <p className="text-13">{rule.text}</p>
                    <p className="text-12 text-ink-muted font-mono">
                      {rule.cite}
                    </p>
                    {isPartner &&
                      (openRule === rule.key ? (
                        <form
                          action={(formData) =>
                            run(() => confirmSetOffRule(rule.key, formData))
                          }
                          className="flex flex-wrap items-end gap-2"
                        >
                          <input
                            name="note"
                            placeholder="Anything to note"
                            className="rounded-control border-rule bg-paper text-14 h-8 min-w-50 flex-1 border px-2"
                          />
                          <button
                            type="submit"
                            disabled={pending}
                            className="rounded-control bg-carbon text-13 text-on-carbon h-8 px-3 font-medium disabled:opacity-60"
                          >
                            I confirm this rule
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setOpenRule(rule.key)}
                          className="rounded-control border-rule bg-paper text-13 h-8 w-fit border px-3"
                        >
                          Confirm this rule
                        </button>
                      ))}
                  </li>
                ))}
              </ul>
              {!isPartner && (
                <p className="text-12 text-ink-muted">
                  Only a Partner / Admin can confirm a rule of law.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const LABELS = {
  salesB2B: "Sales B2B",
  salesB2C: "Sales B2C",
  purchases: "Purchases",
};

function Row({ label, heads, strong = false }) {
  const cell = (value) => (
    <td className="num px-3 py-2 text-right">
      {strong ? <strong>{fmt(value)}</strong> : fmt(value)}
    </td>
  );
  return (
    <tr className="border-rule border-b last:border-0">
      <td className="px-3 py-2">{strong ? <strong>{label}</strong> : label}</td>
      {cell(heads?.igst)}
      {cell(heads?.cgst)}
      {cell(heads?.sgst)}
    </tr>
  );
}

const fmt = (value) =>
  Number(value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

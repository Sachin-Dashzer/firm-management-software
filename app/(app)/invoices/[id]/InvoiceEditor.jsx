"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { InvoiceStatusChip } from "../chips";
import {
  issueInvoice,
  raiseCreditNote,
  setDisputed,
  recordPromise,
  clearPromise,
  updateDraft,
  writeOff,
} from "../actions";

/**
 * One invoice: editable while it is a draft, read-only once issued.
 *
 * The screen makes that line obvious rather than hiding it — an issued
 * invoice shows its number and a credit-note button where a draft shows
 * input boxes. Nothing about an issued tax invoice can be quietly changed,
 * which is the point.
 */
export default function InvoiceEditor({
  invoice,
  blockers,
  mayEdit,
  mayWriteOff,
  states,
}) {
  const router = useRouter();
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();
  const [lines, setLines] = useState(invoice.lines);
  const [reimbursements, setReimbursements] = useState(invoice.reimbursements);
  const [discount, setDiscount] = useState(invoice.discountPercent);
  const [placeOfSupply, setPlaceOfSupply] = useState(invoice.placeOfSupply);
  const [asking, setAsking] = useState(null);
  const [reason, setReason] = useState("");

  function run(action) {
    startTransition(async () => {
      setMessage(await action());
      setAsking(null);
      setReason("");
      router.refresh();
    });
  }

  function save() {
    run(() =>
      updateDraft(invoice.id, {
        lines,
        reimbursements,
        discountPercent: discount,
        placeOfSupply,
        dueDate: invoice.dueDateInput,
      }),
    );
  }

  return (
    <div className="flex flex-col gap-5">
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

      <div className="flex flex-wrap items-center gap-3">
        <InvoiceStatusChip status={invoice.status} />
        <a
          href={`/invoices/${invoice.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="rounded-ledger border-rule text-13 h-8 border px-3 leading-8"
        >
          {invoice.isDraft ? "Preview the PDF" : "PDF"}
        </a>
        {invoice.cancelled && (
          <span className="text-13 text-redpen">
            Cancelled by a credit note.
          </span>
        )}
        {invoice.creditNoteFor && (
          <Link
            href={`/invoices/${invoice.creditNoteFor}`}
            className="text-13 underline underline-offset-4"
          >
            This is a credit note — see the original
          </Link>
        )}
        {invoice.creditNotes.map((note) => (
          <Link
            key={note.id}
            href={`/invoices/${note.id}`}
            className="text-13 underline underline-offset-4"
          >
            Credit note {note.number}
          </Link>
        ))}
      </div>

      {invoice.isDraft && blockers.length > 0 && (
        <div className="rounded-ledger border-waiting bg-waiting-wash border p-3">
          <p className="text-14 font-medium">
            This cannot be issued yet, because:
          </p>
          <ul className="text-13 ml-4 list-disc">
            {blockers.map((reasonText) => (
              <li key={reasonText}>{reasonText}</li>
            ))}
          </ul>
        </div>
      )}

      {/* --- who and where ------------------------------------------------ */}
      <section className="rounded-ledger border-rule bg-surface grid gap-3 border p-4 sm:grid-cols-3">
        <Pair label="Billed to" value={invoice.client} />
        <Pair
          label="Client GSTIN"
          value={invoice.billingGstin || "unregistered"}
          mono
        />
        <Pair
          label="Our GSTIN"
          value={invoice.supplierGstin || "not set"}
          mono
        />
        {invoice.isDraft && mayEdit ? (
          <label className="flex flex-col gap-1">
            <span className="text-13 text-ink-muted font-medium">
              Place of supply
            </span>
            <select
              value={placeOfSupply ?? ""}
              onChange={(e) => setPlaceOfSupply(e.target.value)}
              className="rounded-ledger border-rule bg-paper text-14 h-9 border px-2"
            >
              <option value="">— choose —</option>
              {states.map(([code, name]) => (
                <option key={code} value={code}>
                  {code} · {name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <Pair
            label="Place of supply"
            value={
              invoice.placeOfSupplyName
                ? `${invoice.placeOfSupply} · ${invoice.placeOfSupplyName}`
                : "not set"
            }
          />
        )}
        <Pair label="Due" value={invoice.dueDate ?? "on receipt"} />
        {invoice.promise && (
          <Pair
            label={
              invoice.promise.holding ? "Promised by" : "Promised by (passed)"
            }
            value={`${invoice.promise.date}${
              invoice.promise.note ? ` · ${invoice.promise.note}` : ""
            }`}
          />
        )}
        <Pair
          label="Tax"
          value={invoice.interState ? "IGST (inter-state)" : "CGST + SGST"}
        />
      </section>

      {/* --- the lines ---------------------------------------------------- */}
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
        <h2 className="font-display text-20">Services</h2>
        <div className="overflow-x-auto">
          <table className="text-14 w-full">
            <thead>
              <tr className="border-rule text-12 text-ink-muted border-b text-left tracking-wide uppercase">
                <th className="px-2 py-2 font-medium">Description</th>
                <th className="px-2 py-2 font-medium">SAC</th>
                <th className="px-2 py-2 text-right font-medium">Amount</th>
                <th className="px-2 py-2 text-right font-medium">GST</th>
                {!invoice.isDraft && (
                  <th className="px-2 py-2 text-right font-medium">Total</th>
                )}
                {invoice.isDraft && mayEdit && <th className="px-2 py-2" />}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={line.id ?? index} className="border-rule border-b">
                  <td className="px-2 py-1">
                    {invoice.isDraft && mayEdit ? (
                      <input
                        aria-label={`Description ${index + 1}`}
                        value={line.description}
                        onChange={(e) =>
                          setLines(
                            lines.map((l, i) =>
                              i === index
                                ? { ...l, description: e.target.value }
                                : l,
                            ),
                          )
                        }
                        className="rounded-ledger border-rule bg-paper text-14 h-9 w-full border px-2"
                      />
                    ) : (
                      line.description
                    )}
                  </td>
                  <td className="px-2 py-1">
                    {invoice.isDraft && mayEdit ? (
                      <input
                        aria-label={`SAC ${index + 1}`}
                        value={line.sac}
                        onChange={(e) =>
                          setLines(
                            lines.map((l, i) =>
                              i === index ? { ...l, sac: e.target.value } : l,
                            ),
                          )
                        }
                        className="rounded-ledger border-rule bg-paper text-14 h-9 w-24 border px-2 font-mono"
                      />
                    ) : (
                      <span className="font-mono">{line.sac}</span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {invoice.isDraft && mayEdit ? (
                      <input
                        aria-label={`Amount ${index + 1}`}
                        value={line.amount}
                        inputMode="decimal"
                        onChange={(e) =>
                          setLines(
                            lines.map((l, i) =>
                              i === index
                                ? { ...l, amount: e.target.value }
                                : l,
                            ),
                          )
                        }
                        className="rounded-ledger border-rule bg-paper text-14 h-9 w-32 border px-2 text-right"
                      />
                    ) : (
                      <span className="num">{line.amountText}</span>
                    )}
                  </td>
                  <td className="num px-2 py-1 text-right">
                    {line.gstRate}%{" "}
                    {!invoice.isDraft && (
                      <span className="text-ink-muted">{line.taxText}</span>
                    )}
                  </td>
                  {!invoice.isDraft && (
                    <td className="num px-2 py-1 text-right">
                      {line.totalText}
                    </td>
                  )}
                  {invoice.isDraft && mayEdit && (
                    <td className="px-2 py-1 text-right">
                      <button
                        type="button"
                        aria-label={`Remove line ${index + 1}`}
                        onClick={() =>
                          setLines(lines.filter((_, i) => i !== index))
                        }
                        className="text-13 underline underline-offset-4"
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {invoice.isDraft && mayEdit && (
          <button
            type="button"
            onClick={() =>
              setLines([
                ...lines,
                { description: "", sac: "", amount: "0", gstRate: 18 },
              ])
            }
            className="rounded-ledger border-rule text-14 h-9 self-start border px-3"
          >
            Add a line
          </button>
        )}
      </section>

      {/* --- reimbursements ------------------------------------------------ */}
      {(invoice.hasReimbursements || (invoice.isDraft && mayEdit)) && (
        <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
          <div>
            <h2 className="font-display text-20">Out-of-pocket costs</h2>
            <p className="text-13 text-ink-muted">
              Government fees, stamp duty and the like, recovered at cost. No
              GST is charged on these.
            </p>
          </div>
          {reimbursements.map((item, index) => (
            <div key={item.id ?? index} className="flex flex-wrap gap-2">
              {invoice.isDraft && mayEdit ? (
                <>
                  <input
                    aria-label={`Cost ${index + 1}`}
                    value={item.description}
                    onChange={(e) =>
                      setReimbursements(
                        reimbursements.map((r, i) =>
                          i === index
                            ? { ...r, description: e.target.value }
                            : r,
                        ),
                      )
                    }
                    className="rounded-ledger border-rule bg-paper text-14 h-9 min-w-0 flex-1 border px-2"
                  />
                  <input
                    aria-label={`Cost amount ${index + 1}`}
                    value={item.amount}
                    inputMode="decimal"
                    onChange={(e) =>
                      setReimbursements(
                        reimbursements.map((r, i) =>
                          i === index ? { ...r, amount: e.target.value } : r,
                        ),
                      )
                    }
                    className="rounded-ledger border-rule bg-paper text-14 h-9 w-32 border px-2 text-right"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setReimbursements(
                        reimbursements.filter((_, i) => i !== index),
                      )
                    }
                    className="text-13 underline underline-offset-4"
                  >
                    Remove
                  </button>
                </>
              ) : (
                <p className="text-14 flex w-full justify-between">
                  <span>{item.description}</span>
                  <span className="num">{item.amountText}</span>
                </p>
              )}
            </div>
          ))}
          {invoice.isDraft && mayEdit && (
            <button
              type="button"
              onClick={() =>
                setReimbursements([
                  ...reimbursements,
                  { description: "", amount: "0" },
                ])
              }
              className="rounded-ledger border-rule text-14 h-9 self-start border px-3"
            >
              Add a cost
            </button>
          )}
        </section>
      )}

      {/* --- the figures --------------------------------------------------- */}
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border p-4">
        {invoice.isDraft && mayEdit && (
          <label className="flex items-center gap-2 self-end">
            <span className="text-13 text-ink-muted font-medium">
              Discount %
            </span>
            <input
              value={discount}
              inputMode="decimal"
              onChange={(e) => setDiscount(e.target.value)}
              className="rounded-ledger border-rule bg-paper text-14 h-9 w-20 border px-2 text-right"
            />
          </label>
        )}
        <Figure label="Taxable value" value={invoice.subtotal} />
        {invoice.interState ? (
          <Figure label="IGST" value={invoice.igst} />
        ) : (
          <>
            <Figure label="CGST" value={invoice.cgst} />
            <Figure label="SGST" value={invoice.sgst} />
          </>
        )}
        {invoice.hasReimbursements && (
          <Figure
            label="Out-of-pocket costs"
            value={invoice.reimbursementTotal}
          />
        )}
        <Figure label="Total" value={invoice.total} strong />
        <p className="text-13 text-ink-muted text-right">
          {invoice.totalInWords}
        </p>
        <div className="border-rule mt-2 border-t pt-2">
          <Figure
            label={`TDS the client is expected to deduct`}
            value={invoice.tdsExpected}
          />
          <Figure
            label="Expected in the bank"
            value={invoice.expectedReceipt}
          />
          {!invoice.isDraft && (
            <Figure label="Outstanding" value={invoice.outstanding} strong />
          )}
        </div>
      </section>

      {/* --- what can be done next ----------------------------------------- */}
      {mayEdit && (
        <div className="flex flex-wrap items-center gap-3">
          {invoice.isDraft ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={save}
                className="rounded-ledger border-rule text-14 h-9 border px-3 disabled:opacity-60"
              >
                Save draft
              </button>
              <button
                type="button"
                disabled={pending || blockers.length > 0}
                onClick={() => run(() => issueInvoice(invoice.id))}
                className="rounded-ledger bg-carbon text-14 h-9 px-3 font-medium text-white disabled:opacity-60"
              >
                Issue this invoice
              </button>
              <span className="text-12 text-ink-muted">
                Issuing takes the next number in the series and locks the
                invoice.
              </span>
            </>
          ) : (
            <>
              {!invoice.cancelled && (
                <button
                  type="button"
                  onClick={() => setAsking("credit")}
                  className="rounded-ledger border-rule text-14 h-9 border px-3"
                >
                  Raise a credit note
                </button>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    setDisputed(invoice.id, invoice.status !== "Disputed"),
                  )
                }
                className="text-13 underline underline-offset-4 disabled:opacity-60"
              >
                {invoice.status === "Disputed"
                  ? "Clear the dispute"
                  : "Mark disputed"}
              </button>
              {/*
                A promise is the softer, commoner case than a dispute: the
                client has given a date, so chasing stops until it passes and
                then resumes by itself (P3-3).
              */}
              {invoice.promise ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => clearPromise(invoice.id))}
                  className="text-13 underline underline-offset-4 disabled:opacity-60"
                >
                  Remove the payment promise
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setAsking("promise")}
                  className="text-13 underline underline-offset-4"
                >
                  Client has promised to pay
                </button>
              )}
              {mayWriteOff && invoice.status !== "Written off" && (
                <button
                  type="button"
                  onClick={() => setAsking("writeoff")}
                  className="text-13 underline underline-offset-4"
                >
                  Write off
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/*
        A promise asks for a date rather than a reason, so it has its own
        form rather than being bent into the credit-note one (P3-3).
      */}
      {asking === "promise" && (
        <form
          action={(formData) => run(() => recordPromise(invoice.id, formData))}
          className="rounded-ledger border-carbon bg-carbon-wash flex flex-col gap-2 border p-3"
        >
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-13 font-medium">
                When did they say they would pay?
              </span>
              <input
                type="date"
                name="date"
                required
                min={invoice.todayInput}
                className="rounded-ledger border-rule bg-paper text-14 h-9 border px-2"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-13 font-medium">
                Who said so, and how (optional)
              </span>
              <input
                name="note"
                placeholder="e.g. Vikas Raj on the phone, 26 Oct"
                className="rounded-ledger border-rule bg-paper text-14 h-9 min-w-48 border px-2"
              />
            </label>
          </div>
          <p className="text-12 text-ink-muted">
            Automatic reminders for this invoice stop until the day after that
            date, then start again on their own. Other invoices are unaffected.
          </p>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-ledger bg-carbon text-14 h-9 px-3 font-medium text-white disabled:opacity-60"
            >
              Record the promise
            </button>
            <button
              type="button"
              onClick={() => setAsking(null)}
              className="text-14 text-ink-muted underline underline-offset-4"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {asking && asking !== "promise" && (
        <div className="rounded-ledger border-waiting bg-waiting-wash flex flex-col gap-2 border p-3">
          <label className="flex flex-col gap-1">
            <span className="text-13 font-medium">
              {asking === "credit"
                ? "Why is a credit note being raised?"
                : "Why is this being written off?"}
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="rounded-ledger border-rule bg-paper text-14 border px-2 py-1"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || !reason.trim()}
              onClick={() =>
                run(() =>
                  asking === "credit"
                    ? raiseCreditNote(invoice.id, { reason })
                    : writeOff(invoice.id, reason),
                )
              }
              className="rounded-ledger bg-carbon text-14 h-9 px-3 font-medium text-white disabled:opacity-60"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setAsking(null)}
              className="text-14 text-ink-muted underline underline-offset-4"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Figure({ label, value, strong = false }) {
  return (
    <p
      className={`text-14 flex justify-between ${strong ? "font-display text-20" : ""}`}
    >
      <span className={strong ? "" : "text-ink-muted"}>{label}</span>
      <span className="num">{value}</span>
    </p>
  );
}

function Pair({ label, value, mono = false }) {
  return (
    <div className="flex flex-col">
      <span className="text-13 text-ink-muted font-medium">{label}</span>
      <span className={`text-14 ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

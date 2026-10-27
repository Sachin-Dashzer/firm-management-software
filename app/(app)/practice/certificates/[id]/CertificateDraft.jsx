"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setAssuranceLevel,
  saveParagraph,
  setEvidence,
  setFigure,
  signCertificate,
  confirmCertificateWording,
} from "../actions";

/**
 * Drafting and signing one certificate (P3-15).
 *
 * The shape of the screen is the shape of the document, in the Guidance
 * Note's order, with the locked paragraphs shown as what they are: text
 * nobody at the firm rewrites. The three things that are not paragraphs —
 * the level of assurance, the evidence and the figure — sit above it,
 * because each of them changes what the document says.
 *
 * Nothing here decides anything. Every refusal on this screen is one the
 * server makes too, and the reason is written next to the disabled control
 * rather than hidden in a tooltip (P3-8).
 */
export default function CertificateDraft({
  id,
  signed,
  certificate,
  levels,
  problems,
  document: parts,
  wording,
  mayEdit,
  maySign,
  isPartner,
}) {
  const router = useRouter();
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(null);

  function run(action) {
    startTransition(async () => {
      const result = await action();
      setMessage(result);
      if (result?.ok) {
        setOpen(null);
        router.refresh();
      }
    });
  }

  const blocked = [
    ...problems.map((row) => row.what),
    ...(wording.confirmed
      ? []
      : ["no partner has confirmed the wording for this kind of certificate"]),
  ];

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

      {signed ? (
        <section className="rounded-ledger border-filed bg-filed-wash flex flex-col gap-1 border px-3 py-2">
          <p className="text-14 font-medium">
            Signed on {certificate.signedOn} by {certificate.signer}
          </p>
          <p className="text-13 text-ink-muted font-mono">
            UDIN {certificate.udin}
            {certificate.membershipNo
              ? ` · M. No. ${certificate.membershipNo}`
              : ""}
          </p>
          <p className="text-13">
            A signed certificate is not edited. If it is wrong, issue a fresh
            one and say on it that it replaces this.
          </p>
        </section>
      ) : (
        <section className="flex flex-col gap-2">
          <h2 className="text-15 font-bold">The level of assurance</h2>
          <p className="text-13 text-ink-muted max-w-[70ch]">
            This is not a preference. Changing it rewrites the conclusion and
            the paragraph about our responsibility, and on limited assurance it
            makes describing the procedures compulsory. What you have written
            into the open paragraphs is kept.
          </p>
          <div className="flex flex-wrap gap-2">
            {levels.map((row) => (
              <button
                key={row.level}
                type="button"
                disabled={
                  !mayEdit || pending || row.level === certificate.level
                }
                onClick={() => run(() => setAssuranceLevel(id, row.level))}
                aria-current={row.level === certificate.level}
                className={`rounded-control text-13 max-w-[34ch] border px-3 py-2 text-left ${
                  row.level === certificate.level
                    ? "border-carbon bg-carbon text-on-carbon"
                    : "border-rule bg-surface disabled:opacity-60"
                }`}
              >
                <span className="block font-medium">{row.level}</span>
                <span className="block">{row.note}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {!wording.confirmed ? (
        <section className="rounded-ledger border-waiting bg-waiting-wash flex flex-col gap-2 border px-3 py-2">
          <p className="text-14 font-medium">
            The wording has not been confirmed by a partner
          </p>
          <p className="text-13 max-w-[70ch]">
            The paragraphs below are a first draft taken from the design
            prototype, which carries &ldquo;to be verified by a practising CA
            before use&rdquo; throughout. On a certificate the wording{" "}
            <em>is</em> the document, so nothing of this kind can be signed
            until a partner has read it. It is confirmed once for this kind of
            certificate, not once per draft.
          </p>
          {isPartner ? (
            <form
              action={(formData) =>
                run(() =>
                  confirmCertificateWording(certificate.typeKey, formData),
                )
              }
              className="flex flex-wrap items-end gap-2"
            >
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-13 font-medium">
                  Anything you want recorded with it (optional)
                </span>
                <input
                  name="note"
                  className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                />
              </label>
              <button
                type="submit"
                disabled={pending}
                className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium disabled:opacity-60"
              >
                I have read it — confirm
              </button>
            </form>
          ) : (
            <p className="text-13">
              A partner has to do this. Ask one to open this draft.
            </p>
          )}
        </section>
      ) : (
        <p className="text-12 text-ink-muted">
          Wording confirmed by {wording.by} on {wording.on}
          {wording.note ? ` — ${wording.note}` : ""}.
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-15 font-bold">What the file holds</h2>
        <p className="text-13 text-ink-muted max-w-[70ch]">
          A certificate rests on what is on the file, not on what was seen. Each
          line is either held, or not applicable with a reason.
        </p>
        <ul className="rounded-table border-rule bg-surface divide-rule divide-y border">
          {certificate.evidence.map((row) => (
            <li key={row.id} className="flex flex-col gap-1 px-3 py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-14">{row.what}</span>
                <span className="text-12 text-ink-muted">
                  {row.held
                    ? "on the file"
                    : row.notApplicable
                      ? "not applicable"
                      : "not held"}
                </span>
              </div>
              {row.note && <p className="text-12 text-ink-muted">{row.note}</p>}
              {mayEdit && (
                <form
                  action={(formData) =>
                    run(() => setEvidence(id, row.id, formData))
                  }
                  className="flex flex-wrap items-end gap-2"
                >
                  <select
                    name="state"
                    aria-label={`${row.what} — is it on the file?`}
                    defaultValue={
                      row.held
                        ? "held"
                        : row.notApplicable
                          ? "not-applicable"
                          : "not-held"
                    }
                    className="rounded-control border-rule bg-paper text-13 h-8 border px-2"
                  >
                    <option value="held">On the file</option>
                    <option value="not-applicable">Not applicable</option>
                    <option value="not-held">Not held</option>
                  </select>
                  <input
                    name="note"
                    defaultValue={row.note}
                    aria-label={`${row.what} — where it is, or why it does not apply`}
                    placeholder="Where it is, or why it does not apply"
                    className="rounded-control border-rule bg-paper text-13 h-8 min-w-[22ch] flex-1 border px-2"
                  />
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-control border-rule bg-surface text-13 h-8 border px-3 disabled:opacity-60"
                  >
                    Save
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>

      {certificate.takesFigure && (
        <section className="flex flex-col gap-2">
          <h2 className="text-15 font-bold">The figure</h2>
          <p className="text-13 text-ink-muted max-w-[70ch]">
            One headline amount, and how it was arrived at. A figure on a
            certificate with no basis is the thing that gets questioned.
          </p>
          {certificate.figure && (
            <p className="text-14">
              <span className="num font-medium">{certificate.figure}</span>
              {certificate.figureBasis ? ` — ${certificate.figureBasis}` : ""}
            </p>
          )}
          {mayEdit && (
            <form
              action={(formData) => run(() => setFigure(id, formData))}
              className="flex flex-wrap items-end gap-2"
            >
              <label className="flex flex-col gap-1">
                <span className="text-13 font-medium">Amount in rupees</span>
                <input
                  name="figure"
                  inputMode="decimal"
                  defaultValue={certificate.figureRupees}
                  className="rounded-control border-rule bg-paper num text-14 h-9 border px-2"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-13 font-medium">
                  How it was arrived at
                </span>
                <input
                  name="basis"
                  defaultValue={certificate.figureBasis}
                  className="rounded-control border-rule bg-paper text-14 h-9 min-w-[28ch] border px-2"
                />
              </label>
              <button
                type="submit"
                disabled={pending}
                className="rounded-control border-rule bg-surface text-14 h-9 border px-3 disabled:opacity-60"
              >
                Save
              </button>
            </form>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-15 font-bold">The certificate</h2>
        {certificate.paragraphs.map((row) => (
          <article
            key={row.id}
            className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border px-3 py-2"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-14 font-medium">{row.title}</h3>
              <span className="text-12 text-ink-muted">
                {row.locked
                  ? "the Guidance Note's own wording"
                  : row.required
                    ? "required"
                    : "optional"}
              </span>
            </div>

            {row.locked ? (
              <p className="text-14 whitespace-pre-line">{row.text}</p>
            ) : open === row.id && mayEdit ? (
              <form
                action={(formData) =>
                  run(() => saveParagraph(id, row.id, formData))
                }
                className="flex flex-col gap-2"
              >
                <textarea
                  name="text"
                  rows={4}
                  defaultValue={row.text}
                  aria-label={row.title}
                  className="rounded-control border-rule bg-paper text-14 border px-2 py-1"
                />
                {row.help && (
                  <p className="text-12 text-ink-muted">{row.help}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-control bg-carbon text-13 text-on-carbon h-8 px-3 font-medium disabled:opacity-60"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(null)}
                    className="rounded-control border-rule bg-surface text-13 h-8 border px-3"
                  >
                    Leave it
                  </button>
                </div>
              </form>
            ) : (
              <>
                <p
                  className={`text-14 whitespace-pre-line ${
                    row.text ? "" : "text-ink-muted"
                  }`}
                >
                  {row.text || row.help || "Not written yet."}
                </p>
                {mayEdit && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setOpen(row.id)}
                      className="rounded-control border-rule bg-surface text-13 h-8 border px-3"
                    >
                      {row.text ? "Rewrite" : "Write it"}
                    </button>
                  </div>
                )}
              </>
            )}
          </article>
        ))}
      </section>

      {!signed && (
        <section className="flex flex-col gap-2">
          <h2 className="text-15 font-bold">Sign it</h2>
          {blocked.length > 0 ? (
            <div
              id="sign-blocked"
              className="rounded-ledger border-waiting bg-waiting-wash text-13 border px-3 py-2"
            >
              <p className="font-medium">
                {blocked.length} {blocked.length === 1 ? "thing" : "things"}{" "}
                before this can be signed
              </p>
              <ul className="list-disc pl-5">
                {blocked.map((what) => (
                  <li key={what}>{what}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-13 text-ink-muted max-w-[70ch]">
              The UDIN is generated on the ICAI portal against your own
              membership. It is checked here against your membership number and
              the year — only the portal can say whether a number was issued.
            </p>
          )}
          <form
            action={(formData) => run(() => signCertificate(id, formData))}
            className="flex flex-wrap items-end gap-2"
          >
            <label className="flex flex-col gap-1">
              <span className="text-13 font-medium">UDIN</span>
              <input
                name="udin"
                required
                maxLength={18}
                className="rounded-control border-rule bg-paper text-14 h-9 w-[24ch] border px-2 font-mono uppercase"
              />
            </label>
            <button
              type="submit"
              disabled={pending || !maySign || blocked.length > 0}
              aria-describedby={blocked.length ? "sign-blocked" : undefined}
              className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium disabled:opacity-60"
            >
              Sign and record the UDIN
            </button>
            {!maySign && (
              <span className="text-13 text-ink-muted">
                Only a CA or a partner signs — a UDIN is generated against a
                member&rsquo;s own ICAI membership.
              </span>
            )}
          </form>
        </section>
      )}

      {parts.length > 0 && (
        <details className="rounded-ledger border-rule bg-surface border px-3 py-2">
          <summary className="text-14 cursor-pointer font-medium">
            Read it as one document
          </summary>
          <div className="mt-2 flex flex-col gap-3">
            {parts.map((part) => (
              <div key={part.title}>
                <h3 className="text-13 font-medium">{part.title}</h3>
                <p className="text-14 whitespace-pre-line">{part.text}</p>
              </div>
            ))}
            <p className="text-13 text-ink-muted">
              For PHMG &amp; Associates, Chartered Accountants
              {certificate.signer ? ` · ${certificate.signer}` : ""}
              {certificate.membershipNo
                ? ` · M. No. ${certificate.membershipNo}`
                : ""}
              {certificate.udin ? ` · UDIN ${certificate.udin}` : ""}
            </p>
          </div>
        </details>
      )}
    </div>
  );
}

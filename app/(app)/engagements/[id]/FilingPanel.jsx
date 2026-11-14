"use client";

import { useState } from "react";
import Link from "next/link";
import { saving } from "@/lib/forms/saving";
import { AUDIT_TYPES, OPINIONS, MODIFIED_OPINIONS } from "@/lib/practice/books";
import Notice from "@/components/ui/Notice";
import { saveFiling, setUdinNotRequired } from "../actions";

/**
 * The filing details, which are now a step rather than a panel (owner
 * request, 03-11-2026).
 *
 * Third from last, and it opens with the only question that has to be
 * answered before a number can be recorded: **does this work need a
 * UDIN?** Yes sends the person to the register, where the number is
 * applied for against a member's own ICAI membership — nothing is
 * generated here and nothing ever will be. No is recorded, so the question
 * is asked once rather than every time the job is opened.
 *
 * The step closes on that answer either way. The acknowledgement number
 * and the filed-on date are recorded here too, but neither can hold the
 * step shut: a certificate is signed, not filed, and a job that never gets
 * an acknowledgement must still be able to reach the end.
 *
 * The audit fieldset rides along because the opinion is part of the same
 * save, and `changeStatus` refuses to complete an audit without one.
 */
export default function FilingPanel({
  engagement,
  team,
  pending,
  startTransition,
  setMessage,
  run,
  /** Heading is dropped when the step's card already carries the name. */
  bare = false,
}) {
  /** Work from before P3-1 has none, and keeps the old single filing box. */
  const hasMilestones = (engagement.milestones ?? []).length > 0;
  /**
   * The opinion decides whether the reason field is on screen, so it is
   * followed here — but the `<select>` below is **not** controlled by it.
   *
   * It used to be, and that was half of the bug this panel is named in
   * (`docs/BUG_AUDIT_OPINION.md`): a form reset empties a select in the DOM
   * without React re-committing a `value` that has not changed, so the
   * screen kept showing a Qualified opinion — reason box and all — while
   * the field it would post had gone blank. State that only decides what is
   * rendered cannot drift apart from the field that way.
   */
  const [opinion, setOpinion] = useState(engagement.assurance?.opinion ?? "");

  return (
    <div className="flex flex-col gap-3">
      {!bare && (
        <h2 className="font-display text-15 font-semibold">
          {hasMilestones ? "UDIN and the report" : "Filing"}
        </h2>
      )}

      {/*
        The UDIN question used to open this panel and hold the step shut
        (owner, 12-11-2026). It is `UdinQuestion` below, exported now and
        rendered on the step the firm marked as its UDIN step — so the
        question is asked where the firm decided the number is generated,
        and not on every job whether it needs one or not.

        The number and the member stay on this form: they are part of the
        filing record, they are how a number recorded before any of this
        existed is still corrected, and `saveFiling` is the one write that
        keeps them and the register in step.
      */}
      <form
        onSubmit={saving(
          async (formData) => {
            const result = await saveFiling(engagement.id, formData);
            setMessage(result);
            /**
             * The panel follows the record rather than the form: what
             * comes back is what the server read out of the database
             * after writing it, so this is the opinion that is actually
             * on file — and it is what decides whether the reason box
             * belongs on screen.
             */
            if (result?.assurance) {
              setOpinion(result.assurance.opinion ?? "");
            }
            return result;
          },
          null,
          startTransition,
        )}
        className="flex flex-col gap-3"
      >
        {/*
          Since P3-1 the acknowledgement belongs to a filing, and the
          Filings panel beside this one records it. Work created before
          P3-1 has no filings listed, so it keeps the single box rather
          than being stranded with nowhere to put its number.
        */}
        {!hasMilestones && (
          <label className="flex flex-col gap-1">
            <span className="text-13 text-ink-muted font-medium">
              Acknowledgement number
            </span>
            <input
              name="ackNo"
              defaultValue={engagement.ackNo}
              className="rounded-control border-rule bg-paper text-14 h-10 border px-2 font-mono"
            />
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">
            UDIN {engagement.udinRequired && "(required for this service)"}
          </span>
          <input
            name="udin"
            defaultValue={engagement.udin}
            maxLength={18}
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2 font-mono uppercase"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">Signed by</span>
          <select
            name="udinMemberId"
            defaultValue=""
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
          >
            <option value="">Choose the partner or CA</option>
            {team
              .filter((person) => ["ca", "partner"].includes(person.role))
              .map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} · {person.role === "partner" ? "Partner" : "CA"}
                </option>
              ))}
          </select>
          <span className="text-12 text-ink-muted">
            A UDIN is generated against a member&rsquo;s own ICAI membership,
            and the register has to say whose. Needed only when the number above
            is entered or changed.
          </span>
        </label>
        {!hasMilestones && (
          <label className="flex flex-col gap-1">
            <span className="text-13 text-ink-muted font-medium">Filed on</span>
            <input
              type="date"
              name="filedOn"
              defaultValue={engagement.filedOnInput}
              max={engagement.todayInput}
              className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
            />
            <span className="text-12 text-ink-muted">
              The day the return or form actually went in — not the day we
              signed it off. Late is measured from here.
            </span>
          </label>
        )}

        {engagement.isAudit && (
          <fieldset className="border-rule flex flex-col gap-3 border-t pt-3">
            <legend className="text-13 text-ink-muted font-medium">
              The audit report
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-13 text-ink-muted font-medium">
                  Audit type
                </span>
                <select
                  name="auditType"
                  defaultValue={engagement.assurance?.auditType ?? ""}
                  className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
                >
                  <option value="">Not said</option>
                  {AUDIT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-13 text-ink-muted font-medium">
                  Opinion
                </span>
                <select
                  name="opinion"
                  defaultValue={engagement.assurance?.opinion ?? ""}
                  onChange={(event) => setOpinion(event.target.value)}
                  className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
                >
                  <option value="">Not said</option>
                  {OPINIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-13 text-ink-muted font-medium">
                  Appointed on
                </span>
                <input
                  type="date"
                  name="appointmentDate"
                  defaultValue={engagement.assurance?.appointmentDate ?? ""}
                  className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-13 text-ink-muted font-medium">
                  Report dated
                </span>
                <input
                  type="date"
                  name="reportDate"
                  defaultValue={engagement.assurance?.reportDate ?? ""}
                  className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
                />
              </label>
            </div>
            {MODIFIED_OPINIONS.includes(opinion) && (
              <label className="flex flex-col gap-1">
                <span className="text-13 text-ink-muted font-medium">
                  What the opinion is modified for
                </span>
                <textarea
                  name="qualificationNote"
                  rows={3}
                  defaultValue={engagement.assurance?.qualificationNote ?? ""}
                  className="rounded-ledger border-rule bg-paper text-14 border px-2 py-2"
                />
                <span className="text-12 text-ink-muted">
                  Required. A report that was not clean has to say why, in the
                  file, at the time.
                </span>
              </label>
            )}
          </fieldset>
        )}
        <div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-control border-rule text-14 h-9 border px-3 disabled:opacity-60"
          >
            Save filing details
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * "Does this work need a UDIN?" — the work of the UDIN step.
 *
 * Shown on the step the service marks as its UDIN step (owner request,
 * 12-11-2026), and nowhere else. It used to open the Filing step on every
 * job: a gate the firm had not asked for, on work that often needed no
 * number, three steps from where anybody would actually get one.
 *
 * *Yes* goes to the register with the client and the engagement already
 * filled in (P2-7) — the number is generated against a member's own ICAI
 * membership, never here. *No* is recorded, and is not offered at all on a
 * service whose steps say a UDIN is required: `setUdinNotRequired` refuses
 * it on the server, and a button that promised something the server will
 * not honour is worse than no button.
 */
export function UdinQuestion({ engagement, pending, run }) {
  if ((engagement.udin ?? "").trim()) {
    return (
      <p className="text-13 text-ink-muted">
        UDIN <span className="num">{engagement.udin}</span> is recorded against
        this work.
      </p>
    );
  }

  if (engagement.udinNotRequired) {
    return (
      <p className="text-13 text-ink-muted flex flex-wrap items-center gap-2">
        Recorded as needing no UDIN.
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setUdinNotRequired(engagement.id, false))}
          className="underline-offset-4 hover:underline disabled:opacity-50"
        >
          Ask again
        </button>
      </p>
    );
  }

  return (
    <Notice tone="warn" title="Does this work need a UDIN?">
      <p>
        {engagement.udinRequired
          ? "This service needs one: it cannot be completed until the number is on the register."
          : "Every certificate, audit report and attestation the firm signs needs one. If this is not one of those, say so and it will not be asked again."}
      </p>
      <span className="mt-2 flex flex-wrap items-center gap-3">
        <Link
          href={`/practice/udin?new=1&client=${engagement.clientId}&engagement=${engagement.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-control bg-carbon text-13 text-on-carbon h-9 px-3 leading-9 font-medium"
        >
          Yes — apply for the UDIN
        </Link>
        {!engagement.udinRequired && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setUdinNotRequired(engagement.id, true))}
            className="rounded-control border-rule text-13 hover:bg-carbon-wash h-9 border px-3 disabled:opacity-50"
          >
            No, it does not need one
          </button>
        )}
      </span>
    </Notice>
  );
}

"use client";

import { useFormAction } from "@/lib/forms/useFormAction";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { addPotential } from "./actions";

/**
 * One row at the top of the register (owner request, 04-11-2026).
 *
 * The four fields the owner asked for and no more, on one line, because
 * the thing this competes with is a note in somebody's phone: a form that
 * takes a screen loses to the phone every time. A name and one way to
 * reach them is a valid row — the server refuses a name on its own, since
 * a lead nobody can ring is a note rather than a lead.
 *
 * The labels are `sr-only` and each control says what it is in its own
 * placeholder, which is how a composer differs from a form: you are
 * writing a line down, not filling in a record. The form clears itself
 * and keeps the focus in the name box, because the way this gets used is
 * three enquiries in a row after a morning of calls.
 */
export default function AddPotential() {
  const router = useRouter();
  const [state, submit, pending] = useFormAction(addPotential, null);
  const form = useRef(null);
  const name = useRef(null);

  useEffect(() => {
    if (state?.ok) {
      form.current?.reset();
      name.current?.focus();
      router.refresh();
    }
  }, [state, router]);

  const field =
    "rounded-control border-rule bg-paper text-13 placeholder:text-faint h-8 min-w-0 border px-2";

  return (
    <form
      ref={form}
      onSubmit={submit}
      className="rounded-ledger border-rule bg-surface flex shrink-0 flex-wrap items-center gap-2 border p-2"
    >
      <label className="flex min-w-[11rem] flex-[2] items-center">
        <span className="sr-only">Who is it</span>
        <input
          ref={name}
          name="name"
          required
          maxLength={120}
          placeholder="Who is it? Rakesh Verma, Verma Textiles"
          className={`${field} w-full`}
        />
      </label>

      <label className="flex min-w-[9rem] items-center">
        <span className="sr-only">Mobile number</span>
        <input
          name="mobile"
          type="tel"
          inputMode="numeric"
          autoComplete="off"
          maxLength={15}
          placeholder="98xxxxxxxx"
          className={`${field} num w-[9rem]`}
        />
      </label>

      <label className="flex min-w-[11rem] flex-1 items-center">
        <span className="sr-only">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="off"
          maxLength={160}
          placeholder="Email, if you have it"
          className={`${field} w-full`}
        />
      </label>

      <label className="flex min-w-[12rem] flex-[3] items-center">
        <span className="sr-only">Remarks</span>
        <input
          name="remarks"
          maxLength={2000}
          placeholder="What do they want? Wants GST + ITR, quoted ₹18,000"
          className={`${field} w-full`}
        />
      </label>

      {/*
        When to ring them back (owner request, 04-11-2026). A native date
        box: it brings its own picker, its own keyboard on a phone and its
        own locale, and an empty one is a real answer — plenty of enquiries
        are "he will ring us".
      */}
      <label className="flex items-center" title="Ring them back on">
        <span className="sr-only">Ring them back on</span>
        <input type="date" name="followUp" className={`${field} num`} />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-control bg-carbon text-13 text-on-carbon h-8 shrink-0 px-3 font-medium disabled:opacity-60"
      >
        Add
      </button>

      {state?.error && (
        <p role="alert" className="text-13 text-redpen basis-full">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="text-13 text-filed basis-full">
          {state.ok}
        </p>
      )}
    </form>
  );
}

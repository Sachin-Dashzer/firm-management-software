"use client";

import { startTransition } from "react";

/**
 * Submit a form without letting React throw away what the user typed.
 *
 * **Why this exists.** React 19 resets a form once its `action` prop has
 * run, and it does so whether the save succeeded or was refused. On a
 * refusal that is silent data loss: every field goes back to its default,
 * and because it is a DOM reset rather than a render, React does not
 * re-commit a controlled `value` either — so the screen can still read as
 * filled in while the *next* submit posts empty fields.
 *
 * That is how an audit opinion came to be stored blank under a "Filing
 * details saved" message: the opinion was chosen, the save was refused for
 * a missing reason, the reset emptied the `<select>` in the DOM while React
 * state still said "Qualified" (so the reason box stayed on screen), and
 * the second submit sent `opinion=""`, which the server had no reason to
 * refuse. Proof and the full trace: `docs/BUG_AUDIT_OPINION.md`.
 *
 * So the submit is owned here instead, and the reset is tied to the
 * server's answer rather than to the mere fact that something was tried:
 *
 * - **refused** — nothing is reset, the fields keep what the user entered,
 *   and the error can be corrected and sent again;
 * - **saved** — the form is reset, which clears an add-a-row form and
 *   re-reads an edit-in-place one from the `defaultValue`s the revalidated
 *   server component has just supplied, i.e. from the persisted record.
 *
 * Nothing is lost by owning the submit: these forms pass a closure rather
 * than a server action reference, so they already needed JavaScript and
 * were never progressively enhanced.
 *
 * ```jsx
 * <form onSubmit={saving((fd) => save(id, fd), setMessage, startTransition)}>
 * ```
 *
 * `run` is given the form element as a second argument, for the handful of
 * callers that do their own tidying up after a save.
 *
 * @template {{ ok?: string, error?: string } | void} R
 * @param {(formData: FormData, form: HTMLFormElement) => R | Promise<R>} run
 * @param {(result: Awaited<R>) => void} [report] where the message goes
 * @param {(fn: () => void) => void} [transition] a `useTransition` `startTransition`,
 *   when the caller wants its own `isPending`. One is always used: see below.
 * @returns {(event: any) => void}
 */
export function saving(run, report, transition) {
  return (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    /**
     * The submitter is passed on purpose. React's `action` includes the
     * clicked button's own name and value in the payload and a bare
     * `new FormData(form)` does not, so leaving it out would quietly change
     * what a multi-button form posts.
     */
    const formData = new FormData(form, event.nativeEvent?.submitter ?? null);
    const go = async () => {
      let result;
      try {
        result = await run(formData, form);
      } catch (error) {
        /**
         * A thrown action is a refusal like any other: it is said out loud
         * and the fields are left alone so the save can be tried again.
         * Callers that report their own errors pass no `report` and have
         * already shown it.
         */
        if (report) report({ error: error?.message ?? "That did not save." });
        return;
      }
      if (report) report(result);
      /**
       * A caller that hands back the server's answer gets the honest rule:
       * cleared when the save went through, left alone when it did not. A
       * caller that hands back nothing cannot tell the two apart, so it
       * keeps React's old always-clear — wrong on a refusal, which is why
       * handing the answer back is worth doing form by form. The ones still
       * to do are listed in `docs/BUG_AUDIT_OPINION.md`.
       */
      if (!result || result.ok) form.reset();
    };
    /**
     * **Always inside a transition.**
     *
     * A `useActionState` dispatch called outside one does not drive its own
     * `isPending`, so thirteen forms — the to-do composer, the timer, both
     * password screens among them — had a submit button that never went
     * disabled and never said it was working. React says so in the console
     * ("An async function with useActionState was called outside of a
     * transition") and then carries on, which is why it went unnoticed.
     *
     * React's top-level `startTransition` is the default rather than
     * something each form must remember to pass. A caller that wants an
     * `isPending` of its own still passes `useTransition`'s.
     */
    (transition ?? startTransition)(go);
  };
}

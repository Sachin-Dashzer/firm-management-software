"use client";

import { useState, useTransition } from "react";
import { saving } from "./saving";

/**
 * A form whose fields survive a refusal (QA 09-11-2026, #10).
 *
 * The shape it replaces, which fourteen forms were written in:
 *
 * ```jsx
 * const [state, action, pending] = useActionState(addPotential, null);
 * <form onSubmit={saving(action)}>
 * ```
 *
 * `useActionState`'s dispatch returns nothing, so `saving` could not tell
 * a save from a refusal and fell back to React's own behaviour — clear the
 * form either way. Enter an invalid mobile number on the potential
 * register and the name, the email, the remarks and the date you had just
 * typed all went with the error message. `lib/forms/saving.js` has said
 * for some time that handing the answer back is worth doing form by form;
 * this is that, done once instead of fourteen times.
 *
 * The return is deliberately the same three values in the same order as
 * `useActionState`, so a form converts by changing one line — except the
 * second value is now the submit handler itself, not a dispatch to wrap.
 *
 * @template {{ ok?: string, error?: string }} S
 * @param {(prev: S|null, formData: FormData, form?: HTMLFormElement) => Promise<S>} action
 *        a server action in the usual `(prevState, formData)` shape
 * @param {S|null} [initial]
 * @returns {[S|null, (event: any) => void, boolean, (next: S|null) => void]}
 *          `[state, onSubmit, pending, setState]`
 */
export function useFormAction(action, initial = null) {
  const [state, setState] = useState(initial);
  const [pending, startTransition] = useTransition();

  const onSubmit = saving(
    (formData, form) => action(state, formData, form),
    setState,
    startTransition,
  );

  return [state, onSubmit, pending, setState];
}

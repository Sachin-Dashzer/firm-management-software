"use client";

import { useRef } from "react";

/**
 * Hold on to a chosen file across a two-step upload.
 *
 * Three screens upload a spreadsheet, show the person what it would do, and
 * only then write anything: the client import, the client round-trip and the
 * data lab. All three read the file twice from the same `<input type="file">`
 * rather than parking it on the server between the two requests, which is the
 * right shape — nothing is stored until somebody has agreed to it.
 *
 * **React 19 broke it.** A form with `action={fn}` is reset once the action
 * returns, and resetting a form empties its file input. So the preview
 * succeeded, the input went blank, and pressing the button that commits
 * reported "The file is no longer attached. Choose it again." — on a screen
 * where the file was plainly still named. All three were broken, and the
 * comment in each said the file would still be there.
 *
 * `keep` is called with the preview's own `FormData`; `restore` puts the file
 * back into the commit's `FormData` only if the input has since been emptied.
 * It restores rather than rebuilds, so every other field on the form — the
 * round-trip's `apply` list, the lab's column choices — survives untouched.
 *
 * The pair is split from the hook so it can be tested without a React
 * renderer, which this project does not have a library for.
 *
 * @param {{ current: File | null }} ref where the file is held between steps
 * @param {string} [name] the file input's name
 */
export function keptFile(ref, name = "file") {
  /** @param {FormData} formData */
  function keep(formData) {
    const file = formData.get(name);
    if (file && typeof file !== "string" && file.size > 0) ref.current = file;
  }

  /**
   * @param {FormData} formData
   * @returns {FormData} the same object, with the file back on it
   */
  function restore(formData) {
    const file = formData.get(name);
    const empty = !file || typeof file === "string" || file.size === 0;
    if (empty && ref.current) formData.set(name, ref.current);
    return formData;
  }

  return { keep, restore };
}

/** @param {string} [name] the file input's name */
export function useKeptFile(name = "file") {
  const ref = useRef(/** @type {File | null} */ (null));
  return keptFile(ref, name);
}

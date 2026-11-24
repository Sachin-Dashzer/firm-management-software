"use server";

import { requireUser } from "@/auth";
import { deleteDocument, shareDocument, updateDocument } from "./actions";
import { moveDocument } from "./folders/actions";

/**
 * Doing one thing to several files (P3-48e).
 *
 * **Every file goes through the action it would have gone through on its
 * own.** Not one query that touches fifty rows: each file is checked for
 * the person's right to it, locked out if its job is completed, and
 * audited, exactly as a single file is. A bulk path with its own
 * permission check is a second place for that check to be wrong, and it is
 * always the looser of the two.
 *
 * So the result is a **count and a list of refusals** rather than a success
 * or a failure: "12 moved, 2 refused — a completed engagement is locked".
 * Selecting thirty files and being told only that something went wrong is
 * how people stop trusting a screen.
 */

/** At most this many in one go, so a click cannot start a long job. */
const LIMIT = 100;

/**
 * @param {string[]} ids
 * @param {(id: string) => Promise<any>} each
 * @param {string} verb past tense: "moved", "shared", "deleted"
 */
async function run(ids, each, verb) {
  const chosen = [...new Set((ids ?? []).map(String))].slice(0, LIMIT);
  if (!chosen.length) return { error: "Nothing was selected." };

  let done = 0;
  /** @type {string[]} */
  const refused = [];

  for (const id of chosen) {
    try {
      const result = await each(id);
      if (result?.error) refused.push(result.error);
      else if (result?.confirm) refused.push(result.confirm);
      else done += 1;
    } catch (err) {
      refused.push(err.message);
    }
  }

  const reasons = [...new Set(refused)];
  return {
    ok: `${done} ${verb}${
      refused.length
        ? `, ${refused.length} refused: ${reasons.slice(0, 3).join("; ")}`
        : "."
    }`,
    done,
    refused: refused.length,
    reasons,
  };
}

/** Move them, which the move rules still hold to one client and one zone. */
export async function bulkMove(ids, targetPath) {
  await requireUser();
  return run(ids, (id) => moveDocument(id, targetPath), "moved");
}

/** Share with the client's portal, or take it back. CA or partner only. */
export async function bulkShare(ids, shared) {
  await requireUser();
  return run(
    ids,
    (id) => shareDocument(id, Boolean(shared)),
    shared ? "shared" : "withdrawn",
  );
}

/** Say what these papers are: PAN card, acknowledgement, engagement letter. */
export async function bulkSetKind(ids, kind) {
  await requireUser();
  const word = String(kind ?? "").trim();
  if (!word) return { error: "Type a word for what these are." };
  return run(ids, (id) => updateDocument(id, { kind: word }), "filed");
}

/** To the recycle bin, one at a time, each with its own audit entry. */
export async function bulkDelete(ids, reason = "") {
  await requireUser();
  return run(ids, (id) => deleteDocument(id, reason), "moved to the bin");
}

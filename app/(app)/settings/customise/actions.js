"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import FirmSettings from "@/models/FirmSettings";
import { clearFirmCache } from "@/lib/firm/settings";
import { RENAMEABLE, WORD_KEYS } from "@/lib/firm/words";

/**
 * The firm's own words (P3-29).
 *
 * Partner only, through `firmProfile` — this is the same permission as the
 * firm's name on its letterhead, and for the same reason: it is what the
 * whole firm reads, not a preference of whoever is signed in.
 *
 * Audited like every other change (rule 2). "Who renamed the clients?" is
 * a question somebody will ask on the morning the menu changes.
 */
export async function saveWords(_prev, formData) {
  const actor = await requireUser();
  assertCan(actor, "edit", "firmProfile");

  /** @type {Record<string, string>} */
  const vocabulary = {};
  for (const key of WORD_KEYS) {
    const given = String(formData.get(key) ?? "").trim();
    if (given.length > 40) {
      return { error: "A word longer than forty letters is not a word." };
    }
    /* Letters, spaces and hyphens. A label is read, not parsed, but it is
       rendered straight into the menu, so anything that is not a word has
       no business being accepted here. */
    if (given && !/^[\p{L}][\p{L} -]*$/u.test(given)) {
      return {
        error: `"${given}" has something in it that is not a word — letters, spaces and hyphens only.`,
      };
    }
    vocabulary[key] = given;
  }

  /* A plural with no singular, or the other way round, renames half the
     menu and reads as a bug. Both or neither. */
  for (const row of RENAMEABLE) {
    const one = vocabulary[row.key];
    const many = vocabulary[row.plural];
    if (Boolean(one) !== Boolean(many)) {
      return {
        error: `Give both words for "${row.one}", or neither — one on its own would rename half the menu.`,
      };
    }
  }

  await connectDB();

  await audited(actor, async (session) => {
    const firm =
      (await FirmSettings.findOne({ key: "firm" }).session(session)) ??
      new FirmSettings({ key: "firm" });
    firm.set({ vocabulary, updatedBy: actor.id });
    await firm.save({ session });
  });

  clearFirmCache();
  /* The menu is rendered in the app layout, so the whole shell is stale. */
  revalidatePath("/", "layout");

  const changed = RENAMEABLE.filter((row) => vocabulary[row.key]);
  return {
    ok: changed.length
      ? `Saved. The menu now says ${changed.map((row) => `${vocabulary[row.plural]}`).join(", ")}.`
      : "Saved. The menu is back to the usual words.",
  };
}

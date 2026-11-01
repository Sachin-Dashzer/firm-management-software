// @ts-check

import { connectDB } from "../db.js";
import FirmSettings from "../../models/FirmSettings.js";
import { withDefaults, FIRM_DEFAULTS } from "./profile.js";
import { MODULES } from "../nav/tree.js";
import { wordChanges } from "./words.js";

/**
 * Reading the firm's own record.
 *
 * It is read by every invoice PDF, every report and every outgoing email, and
 * it changes a few times a decade — so it is cached in the process for a
 * minute, the same way the notification rules are. The settings screen clears
 * its own instance on save; on Vercel another instance can serve the old name
 * for up to a minute, which for a firm's own letterhead is nothing.
 *
 * @type {{ at: number, firm: Record<string, any> | null }}
 */
let cache = { at: 0, firm: null };

export const FIRM_CACHE_MS = 60_000;

/** Called by the settings screen, so a save takes effect at once. */
export function clearFirmCache() {
  cache = { at: 0, firm: null };
}

/**
 * The firm, with every default filled in. Never throws and never returns
 * null: a missing document means the firm has not been to the settings
 * screen yet, which must not stop an invoice being printed.
 *
 * @param {{ fresh?: boolean }} [options]
 * @returns {Promise<Record<string, any>>}
 */
export async function firmProfile(options = {}) {
  if (!options.fresh && cache.firm && Date.now() - cache.at < FIRM_CACHE_MS) {
    return cache.firm;
  }

  let stored = null;
  try {
    await connectDB();
    stored = await FirmSettings.findOne({ key: "firm" }).lean();
  } catch {
    // no database reachable: the defaults are what the app always said
    return withDefaults(null);
  }

  const firm = withDefaults(stored);
  cache = { at: Date.now(), firm };
  return firm;
}

/**
 * The firm's one document, ready to be written to, inside a transaction.
 *
 * **Why this is shared rather than written out twice.** Both writers used
 * `findOne(...) ?? new FirmSettings({ key: "firm" })`, and the schema makes
 * `name` required — so on a database where nobody had saved the ICAI page
 * yet, Settings → Customise died with "FirmSettings validation failed:
 * name is required". Not a test artefact: the firm's own deployment starts
 * with no firm record, and Customise is reachable before ICAI, so a partner
 * renaming a menu item on day one hits it.
 *
 * Creating it carries the default name, which is what every screen already
 * displays through `withDefaults` when the document is missing. So the
 * first write no longer depends on which settings page the partner opened
 * first, and the name on screen does not change when it happens.
 *
 * @param {import("mongoose").ClientSession} session
 * @returns {Promise<any>} the document, existing or new and unsaved
 */
export async function firmDocFor(session) {
  const existing = await FirmSettings.findOne({ key: "firm" }).session(session);
  if (existing) return existing;

  return new FirmSettings({
    key: "firm",
    name: FIRM_DEFAULTS.name,
  });
}

/**
 * The firm's name alone, for the many places that want only that — an email
 * signature, a workbook's author, a PDF title.
 *
 * @returns {Promise<string>}
 */
export async function firmName() {
  return (await firmProfile()).name;
}

/**
 * Which modules are switched on (P3-22a).
 *
 * A module that is off **hides**, never deletes: the pages behind it stay
 * in the build and still answer on the server, which is why they check this
 * for themselves — a bookmarked URL must not be a way round a switch a
 * partner threw.
 *
 * Everything is on until somebody says otherwise, including on a database
 * the field has never been written to.
 *
 * @returns {Promise<Record<string, boolean>>}
 */
/**
 * The firm's own words, as a map from the application's word to theirs
 * (P3-29). Empty when the firm has set none, which is the usual case.
 *
 * Read through `firmProfile`, so it costs nothing: the menu asks for it on
 * every request and the firm's record is already cached for a minute.
 *
 * @returns {Promise<Record<string, string>>}
 */
export async function firmWords() {
  return wordChanges((await firmProfile()).vocabulary);
}

export async function firmModules() {
  const stored = (await firmProfile()).modules ?? {};
  return Object.fromEntries(MODULES.map((key) => [key, stored[key] !== false]));
}

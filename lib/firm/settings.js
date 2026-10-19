// @ts-check

import { connectDB } from "../db.js";
import FirmSettings from "../../models/FirmSettings.js";
import { withDefaults } from "./profile.js";

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
 * The firm's name alone, for the many places that want only that — an email
 * signature, a workbook's author, a PDF title.
 *
 * @returns {Promise<string>}
 */
export async function firmName() {
  return (await firmProfile()).name;
}

// @ts-check

import { startOfISTDay } from "../dates.js";

/**
 * A client's promise to pay, per invoice (P3-3).
 *
 * Spec section 12 chases an overdue invoice on a fixed cadence and offers
 * `Disputed` as the only way to stop — which drops the invoice out of
 * chasing until somebody puts it back. A promise is the commoner and softer
 * case: the client has given a date, so the firm waits, and the waiting
 * **ends by itself** the day after that date rather than needing anybody to
 * remember to undo it.
 *
 * Per invoice, not per client: a client can be good for one bill and
 * arguing about another, and a promise about the first should not buy
 * silence on the second.
 *
 * Pure. The sweep, the actions and the screens all read these.
 */

/** Does a promise currently stop this invoice being chased? */
export function promiseHolds(invoice, now = new Date()) {
  const date = promiseDate(invoice);
  if (!date) return false;
  // the day after the promised date, chasing resumes
  return startOfISTDay(date) >= startOfISTDay(now);
}

/** The promised date, or null. */
export function promiseDate(invoice) {
  const raw = invoice?.promise?.date;
  return raw ? new Date(raw) : null;
}

/** A promise whose date has passed without the money arriving. */
export function promiseBroken(invoice, now = new Date()) {
  const date = promiseDate(invoice);
  if (!date) return false;
  return startOfISTDay(date) < startOfISTDay(now);
}

/**
 * Check a date somebody typed before it becomes a promise.
 *
 * Today counts: a client who rings in the morning saying "this afternoon"
 * has made a promise about today, and refusing it would push the firm into
 * recording tomorrow and chasing a day late.
 *
 * @param {Date|null|undefined} date
 * @param {Date} [now]
 */
export function checkPromise(date, now = new Date()) {
  if (!date) return { ok: false, error: "Pick the date the client gave you." };
  if (startOfISTDay(date) < startOfISTDay(now)) {
    return {
      ok: false,
      error:
        "That date has already passed. Record the date they have actually given you, or chase the invoice.",
    };
  }
  return { ok: true };
}

/**
 * Split invoices into the ones a reminder may go to and the ones a promise
 * is holding, so a bulk chase can say how many it left alone rather than
 * quietly sending fewer than it claimed.
 *
 * @param {Array<any>} invoices
 * @param {Date} [now]
 */
export function splitByPromise(invoices, now = new Date()) {
  const eligible = [];
  const held = [];
  for (const invoice of invoices ?? []) {
    (promiseHolds(invoice, now) ? held : eligible).push(invoice);
  }
  return { eligible, held };
}

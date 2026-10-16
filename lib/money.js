// @ts-check

/**
 * Money is stored everywhere as an integer number of paise, never as a float,
 * so no amount can drift by rounding. Display happens only at the edges.
 */

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const INR_WHOLE = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Format paise as rupees with Indian digit grouping, e.g. 124500000 → ₹12,45,000.
 * Paise are shown only when they are not zero, unless `paise: true` forces them.
 * @param {number} amountPaise
 * @param {{ paise?: boolean }} [options]
 * @returns {string}
 */
export function formatPaise(amountPaise, options = {}) {
  assertPaise(amountPaise);
  const showPaise = options.paise ?? amountPaise % 100 !== 0;
  return (showPaise ? INR : INR_WHOLE).format(amountPaise / 100);
}

/**
 * Convert a rupee amount typed by a user into integer paise.
 * Accepts "12,45,000.50", "1245000.5", 1245000.5.
 * @param {string|number} rupees
 * @returns {number} integer paise
 */
export function toPaise(rupees) {
  const n =
    typeof rupees === "number"
      ? rupees
      : Number(String(rupees).replace(/[₹,\s]/g, ""));
  if (!Number.isFinite(n)) throw new TypeError(`Not an amount: ${rupees}`);
  // round, don't truncate: 0.1 + 0.2 lands at 30.000000000000004 paise
  return Math.round(n * 100);
}

/**
 * Apply a percentage (e.g. a GST rate) to paise and round to the nearest paisa,
 * the rule GST invoices use.
 * @param {number} amountPaise
 * @param {number} percent
 * @returns {number} integer paise
 */
export function percentOf(amountPaise, percent) {
  assertPaise(amountPaise);
  return Math.round((amountPaise * percent) / 100);
}

/** @param {number} amountPaise */
function assertPaise(amountPaise) {
  if (!Number.isInteger(amountPaise)) {
    throw new TypeError(`Amount must be integer paise, got ${amountPaise}`);
  }
}

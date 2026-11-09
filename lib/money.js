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

/**
 * The most any single amount a person types may be: ₹10 crore.
 *
 * Nothing this firm bills comes close, and a figure above it is a typo or a
 * stray paste — the QA run of 09-11-2026 put ₹99,99,99,99,999 on an invoice
 * line and the system took it (#12). A ceiling is not a business rule about
 * the firm's fees; it is a guard against a slipped finger becoming a tax
 * invoice. Raise it here if the firm ever bills more than this on one line.
 */
export const MAX_AMOUNT_PAISE = 10_000_000_000;

/**
 * Read an amount somebody typed, and say what is wrong with it in words
 * they can act on (QA 09-11-2026, #4 and #12).
 *
 * Every screen that takes money goes through here, so a negative or absurd
 * figure is refused by the server action with a sentence, and a Mongoose
 * `min: 0` validation error can never reach the error boundary and throw
 * away what somebody had typed.
 *
 * @param {string|number|null|undefined} typed
 * @param {object} [options]
 * @param {boolean} [options.allowZero] a draft may hold a line at ₹0 while
 *        it is still being worked on; a payment may not be ₹0
 * @param {number} [options.max]
 * @param {string} [options.label] how the amount is named on screen
 * @returns {{ ok: true, paise: number } | { ok: false, reason: string }}
 */
export function readAmount(typed, options = {}) {
  const {
    allowZero = false,
    max = MAX_AMOUNT_PAISE,
    label = "Amount",
  } = options;

  let paise;
  try {
    paise = toPaise(typed ?? "");
  } catch {
    return { ok: false, reason: `${label} is not a number.` };
  }

  if (paise < 0) return { ok: false, reason: `${label} must be more than ₹0.` };
  if (paise === 0 && !allowZero) {
    return { ok: false, reason: `${label} must be more than ₹0.` };
  }
  if (paise > max) {
    return {
      ok: false,
      reason: `${label} cannot be more than ${formatPaise(max)}. Check the figure, or split it across more than one line.`,
    };
  }

  return { ok: true, paise };
}

/** @param {number} amountPaise */
function assertPaise(amountPaise) {
  if (!Number.isInteger(amountPaise)) {
    throw new TypeError(`Amount must be integer paise, got ${amountPaise}`);
  }
}

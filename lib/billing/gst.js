// @ts-check

import { percentOf } from "../money.js";
import { GST_STATES } from "../validators.js";

/**
 * What an invoice adds up to (spec section 7).
 *
 * Two things decide the tax, and both come from data rather than from a
 * setting someone can get wrong:
 *
 *  1. **Where the supply is from** — the first two digits of the GSTIN of
 *     the branch raising the invoice. A branch with no GSTIN cannot issue a
 *     tax invoice at all, which is enforced here rather than hoped for.
 *  2. **Where it goes** — the place of supply, which for a service to a
 *     registered person is the recipient's state.
 *
 * Same state, so the tax stays in the state: CGST and SGST, half each.
 * Different states: IGST, the whole rate.
 *
 * Everything is integer paise. Each line's tax is rounded on its own, the
 * way a GST invoice is read line by line, and the totals are the sums of
 * the rounded figures — so the printed invoice always adds up.
 */

/** TDS under section 194J on professional fees (spec section 7). */
export const TDS_194J_PERCENT = Number(process.env.TDS_194J_PERCENT || 10);

/** @param {string} gstin */
export function stateCodeOf(gstin) {
  const code = String(gstin ?? "").slice(0, 2);
  return GST_STATES[code] ? code : null;
}

/** @param {string} code */
export function stateName(code) {
  return GST_STATES[String(code)] ?? "";
}

/**
 * @typedef {object} InvoiceLine
 * @property {string} [description]
 * @property {string} [sac]
 * @property {number} amountPaise   before tax
 * @property {number} [gstRate]     per cent, 18 unless said otherwise
 *
 * @typedef {object} Reimbursement
 * @property {string} [description]
 * @property {number} amountPaise   government fees and the like: no GST
 */

/**
 * Work out every figure on an invoice.
 *
 * @param {object} input
 * @param {InvoiceLine[]} input.lines
 * @param {Reimbursement[]} [input.reimbursements]
 * @param {string|null} input.supplierGstin   the branch's own GSTIN
 * @param {string|null} input.placeOfSupply   two-digit state code
 * @param {number} [input.discountPercent]
 * @param {boolean} [input.tdsApplies]
 * @returns {object}
 */
export function computeInvoice({
  lines = [],
  reimbursements = [],
  supplierGstin = null,
  placeOfSupply = null,
  discountPercent = 0,
  tdsApplies = true,
}) {
  const supplierState = stateCodeOf(supplierGstin);
  const place = placeOfSupply ? String(placeOfSupply) : null;

  // without both ends we can say what is owed but not which tax it is
  const taxable = Boolean(supplierState && place);
  const interState = taxable ? supplierState !== place : false;

  const discount = Math.min(Math.max(Number(discountPercent) || 0, 0), 100);

  const computed = lines.map((line) => {
    const gross = Math.round(Number(line.amountPaise) || 0);
    // a discount reduces the taxable value, so the tax follows it down
    const discountPaise = discount ? percentOf(gross, discount) : 0;
    const net = gross - discountPaise;
    const rate = Number(line.gstRate ?? 18);

    const tax = taxable ? percentOf(net, rate) : 0;
    // CGST and SGST are half each; the odd paisa goes to CGST, as the
    // halves have to add back to the whole
    const sgst = interState ? 0 : Math.floor(tax / 2);
    const cgst = interState ? 0 : tax - sgst;
    const igst = interState ? tax : 0;

    return {
      ...line,
      amountPaise: gross,
      discountPaise,
      netPaise: net,
      gstRate: rate,
      cgstPaise: cgst,
      sgstPaise: sgst,
      igstPaise: igst,
      totalPaise: net + cgst + sgst + igst,
    };
  });

  const sum = (key) => computed.reduce((total, line) => total + line[key], 0);

  const subtotal = sum("netPaise");
  const discountTotal = sum("discountPaise");
  const cgst = sum("cgstPaise");
  const sgst = sum("sgstPaise");
  const igst = sum("igstPaise");

  // out-of-pocket costs recovered at cost: no GST on these (spec section 7)
  const reimbursementTotal = reimbursements.reduce(
    (total, item) => total + Math.round(Number(item.amountPaise) || 0),
    0,
  );

  const total = subtotal + cgst + sgst + igst + reimbursementTotal;

  // the client deducts this and pays the rest; it is not a discount, so it
  // never changes the invoice total — it only says what to expect in the bank
  const tdsExpected = tdsApplies ? percentOf(subtotal, TDS_194J_PERCENT) : 0;

  return {
    lines: computed,
    supplierState,
    placeOfSupply: place,
    taxable,
    interState,
    discountPercent: discount,
    discountTotalPaise: discountTotal,
    subtotalPaise: subtotal,
    cgstPaise: cgst,
    sgstPaise: sgst,
    igstPaise: igst,
    reimbursementTotalPaise: reimbursementTotal,
    totalPaise: total,
    tdsExpectedPaise: tdsExpected,
    /** What should actually arrive in the bank. */
    expectedReceiptPaise: total - tdsExpected,
  };
}

/**
 * Why an invoice cannot be issued yet. Empty means it can.
 *
 * Kept apart from the sums so a draft can be worked on while incomplete,
 * and the reasons can be listed on screen rather than appearing one at a
 * time as each is fixed.
 *
 * @param {object} invoice
 * @param {{ gstin?: string, code?: string }} branch
 * @returns {string[]}
 */
export function reasonsNotIssuable(invoice, branch) {
  const reasons = [];

  if (!branch?.gstin) {
    reasons.push(
      `The ${branch?.code ?? "branch"} branch has no GSTIN. Add it in Settings → Branches before issuing a tax invoice.`,
    );
  } else if (!stateCodeOf(branch.gstin)) {
    reasons.push(
      `The ${branch.code} branch GSTIN does not start with a valid state code.`,
    );
  }

  if (!invoice.placeOfSupply) {
    reasons.push(
      "No place of supply. It comes from the client's billing GSTIN or address state.",
    );
  }

  if (!invoice.lines?.length) reasons.push("The invoice has no lines.");

  if ((invoice.lines ?? []).some((line) => !line.sac)) {
    reasons.push(
      "Every line needs a SAC code — set them in the service catalog.",
    );
  }

  if ((invoice.lines ?? []).some((line) => !(line.amountPaise > 0))) {
    reasons.push("Every line needs an amount.");
  }

  return reasons;
}

/**
 * The money figures as words for the invoice foot, in the Indian system.
 * @param {number} paise
 */
export function amountInWords(paise) {
  const rupees = Math.floor(Math.abs(paise) / 100);
  const remainder = Math.abs(paise) % 100;

  const words = numberToWords(rupees);
  const paiseWords = remainder ? ` and ${numberToWords(remainder)} paise` : "";
  return `${words} rupees${paiseWords} only`.replace(/^\w/, (c) =>
    c.toUpperCase(),
  );
}

const ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];

/** Lakh and crore, not million — this is an Indian invoice. */
function numberToWords(n) {
  if (n < 20) return ONES[n];
  if (n < 100) {
    return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
  }
  if (n < 1000) {
    return `${ONES[Math.floor(n / 100)]} hundred${
      n % 100 ? ` and ${numberToWords(n % 100)}` : ""
    }`;
  }
  if (n < 100000) {
    return `${numberToWords(Math.floor(n / 1000))} thousand${
      n % 1000 ? ` ${numberToWords(n % 1000)}` : ""
    }`;
  }
  if (n < 10000000) {
    return `${numberToWords(Math.floor(n / 100000))} lakh${
      n % 100000 ? ` ${numberToWords(n % 100000)}` : ""
    }`;
  }
  return `${numberToWords(Math.floor(n / 10000000))} crore${
    n % 10000000 ? ` ${numberToWords(n % 10000000)}` : ""
  }`;
}

/** Recompute and store every figure from the lines as they stand. */
export function applyTotals(invoice, branch, client) {
  const computed = computeInvoice({
    lines: invoice.lines.map((line) => ({
      description: line.description,
      sac: line.sac,
      amountPaise: line.amountPaise,
      gstRate: line.gstRate,
    })),
    reimbursements: invoice.reimbursements,
    supplierGstin: branch?.gstin ?? null,
    placeOfSupply: invoice.placeOfSupply,
    discountPercent: invoice.discountPercent,
    tdsApplies: client?.tdsApplicable !== false,
  });

  invoice.lines.forEach((line, i) => {
    const done = computed.lines[i];
    line.discountPaise = done.discountPaise;
    line.netPaise = done.netPaise;
    line.cgstPaise = done.cgstPaise;
    line.sgstPaise = done.sgstPaise;
    line.igstPaise = done.igstPaise;
    line.totalPaise = done.totalPaise;
  });

  invoice.subtotalPaise = computed.subtotalPaise;
  invoice.cgstPaise = computed.cgstPaise;
  invoice.sgstPaise = computed.sgstPaise;
  invoice.igstPaise = computed.igstPaise;
  invoice.reimbursementTotalPaise = computed.reimbursementTotalPaise;
  invoice.totalPaise = computed.totalPaise;
  invoice.tdsExpectedPaise = computed.tdsExpectedPaise;

  return computed;
}

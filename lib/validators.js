// @ts-check

/**
 * Indian statutory identifiers (spec section 13, "Indian specifics to get
 * right").
 *
 * Format alone catches little: a mistyped GSTIN usually still looks like a
 * GSTIN. Both GSTIN and Aadhaar carry a check digit, so those are verified
 * properly here — it is the difference between catching a typo at the keyboard
 * and discovering it when a return is rejected.
 */

/** GST state codes, which also drive place of supply for invoicing (section 7). */
export const GST_STATES = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  10: "Bihar",
  11: "Sikkim",
  12: "Arunachal Pradesh",
  13: "Nagaland",
  14: "Manipur",
  15: "Mizoram",
  16: "Tripura",
  17: "Meghalaya",
  18: "Assam",
  19: "West Bengal",
  20: "Jharkhand",
  21: "Odisha",
  22: "Chhattisgarh",
  23: "Madhya Pradesh",
  24: "Gujarat",
  25: "Daman and Diu",
  26: "Dadra and Nagar Haveli and Daman and Diu",
  27: "Maharashtra",
  28: "Andhra Pradesh (old)",
  29: "Karnataka",
  30: "Goa",
  31: "Lakshadweep",
  32: "Kerala",
  33: "Tamil Nadu",
  34: "Puducherry",
  35: "Andaman and Nicobar Islands",
  36: "Telangana",
  37: "Andhra Pradesh",
  38: "Ladakh",
  97: "Other territory",
  99: "Centre jurisdiction",
};

/** The 4th character of a PAN says what kind of holder it belongs to. */
const PAN_HOLDER_TYPES = {
  P: "Individual",
  C: "Company",
  H: "HUF",
  F: "Firm / LLP",
  A: "AOP",
  T: "Trust",
  B: "Body of individuals",
  L: "Local authority",
  J: "Artificial juridical person",
  G: "Government",
};

export const ENTITY_TYPES = [
  "Individual",
  "HUF",
  "Partnership Firm",
  "LLP",
  "Private Limited",
  "Public Limited",
  "Trust",
  "Society",
  "AOP",
];

export const CLIENT_STATUSES = [
  "Lead",
  "Active",
  "On hold",
  "Inactive",
  "Closed",
];

export const RISK_RATINGS = ["Low", "Medium", "High"];

export const TURNOVER_BANDS = [
  "Below ₹20 lakh",
  "₹20 lakh – ₹1 crore",
  "₹1 – 5 crore",
  "₹5 – 50 crore",
  "Above ₹50 crore",
];

export const BILLING_CYCLES = [
  "Per engagement",
  "Monthly retainer",
  "Quarterly retainer",
  "Annual retainer",
];

/** The portals a CA office keeps logins for (spec section 3). */
export const PORTALS = [
  "GST",
  "Income Tax",
  "TRACES",
  "MCA / V3",
  "EPFO",
  "ESIC",
  "DGFT / IEC",
  "Udyam",
  "Professional Tax",
  "Other",
];

export const CONTACT_CHANNELS = ["Call", "Meeting", "Email", "WhatsApp"];

/** Strip spaces and upper-case, the way these are always written. */
export function normaliseId(value) {
  return String(value ?? "")
    .replace(/[\s-]/g, "")
    .toUpperCase();
}

// --- PAN -------------------------------------------------------------------

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/**
 * @param {string} value
 * @returns {{ ok: true, value: string, holderType: string } | { ok: false, reason: string }}
 */
export function checkPAN(value) {
  const pan = normaliseId(value);
  if (!pan) return { ok: false, reason: "PAN is empty" };
  if (pan.length !== 10) {
    return { ok: false, reason: "A PAN is 10 characters, e.g. AAAPZ1234C" };
  }
  if (!PAN_RE.test(pan)) {
    return {
      ok: false,
      reason: "A PAN is five letters, four digits, then a letter",
    };
  }
  const holderType = PAN_HOLDER_TYPES[pan[3]];
  if (!holderType) {
    return {
      ok: false,
      reason: `The 4th character of a PAN says the holder type; "${pan[3]}" is not one of them`,
    };
  }
  return { ok: true, value: pan, holderType };
}

/** Does this PAN's holder type agree with the entity type chosen? */
export function panMatchesEntityType(pan, entityType) {
  const result = checkPAN(pan);
  if (!result.ok) return true; // the PAN check itself reports the problem
  const expected = {
    Individual: "P",
    HUF: "H",
    "Partnership Firm": "F",
    LLP: "F",
    "Private Limited": "C",
    "Public Limited": "C",
    Trust: "T",
    Society: "A",
    AOP: "A",
  }[entityType];
  return !expected || pan[3] === expected;
}

// --- GSTIN -----------------------------------------------------------------

const GSTIN_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * The GSTIN check digit: each of the first 14 characters is weighted 1 or 2 by
 * position, the products are reduced base 36 and summed, and the 15th
 * character completes the sum to a multiple of 36.
 *
 * Exported so the sample dataset can *build* a GSTIN rather than guess one:
 * `checkGSTIN` verifies this digit, so a fabricated number typed by hand is
 * rejected by the firm's own form (CLAUDE.md rule 9 asks for correctly
 * formatted fake identifiers, and this is what makes that possible).
 *
 * @param {string} first14
 */
export function gstinCheckDigit(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const value = GSTIN_ALPHABET.indexOf(first14[i]);
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_ALPHABET[(36 - (sum % 36)) % 36];
}

/**
 * @param {string} value
 * @returns {{ ok: true, value: string, stateCode: string, state: string, pan: string }
 *          | { ok: false, reason: string }}
 */
export function checkGSTIN(value) {
  const gstin = normaliseId(value);
  if (!gstin) return { ok: false, reason: "GSTIN is empty" };
  if (gstin.length !== 15) {
    return { ok: false, reason: "A GSTIN is 15 characters" };
  }
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
    return { ok: false, reason: "That is not the shape of a GSTIN" };
  }

  const stateCode = gstin.slice(0, 2);
  const state = GST_STATES[stateCode] ?? GST_STATES[Number(stateCode)];
  if (!state) {
    return { ok: false, reason: `${stateCode} is not a GST state code` };
  }

  const pan = gstin.slice(2, 12);
  const panCheck = checkPAN(pan);
  if (!panCheck.ok) {
    return {
      ok: false,
      reason: `The PAN inside the GSTIN is wrong: ${panCheck.reason}`,
    };
  }

  if (gstinCheckDigit(gstin.slice(0, 14)) !== gstin[14]) {
    return {
      ok: false,
      reason: "The last character does not match the rest — check for a typo",
    };
  }

  return { ok: true, value: gstin, stateCode, state, pan };
}

// --- TAN, CIN, Udyam, IEC --------------------------------------------------

export function checkTAN(value) {
  const tan = normaliseId(value);
  if (!/^[A-Z]{4}[0-9]{5}[A-Z]$/.test(tan)) {
    return {
      ok: false,
      reason: "A TAN is four letters, five digits, then a letter",
    };
  }
  return { ok: true, value: tan };
}

export function checkCIN(value) {
  const cin = normaliseId(value);
  // LLPs have an LLPIN instead, written AAA-1234
  if (/^[A-Z]{3}[0-9]{4}$/.test(cin)) {
    return {
      ok: true,
      value: `${cin.slice(0, 3)}-${cin.slice(3)}`,
      kind: "LLPIN",
    };
  }
  if (!/^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/.test(cin)) {
    return {
      ok: false,
      reason: "A CIN is 21 characters, e.g. U74999DL2019PTC123456",
    };
  }
  return { ok: true, value: cin, kind: "CIN" };
}

export function checkUdyam(value) {
  const udyam = normaliseId(value);
  if (!/^UDYAM[A-Z]{2}[0-9]{2}[0-9]{7}$/.test(udyam)) {
    return {
      ok: false,
      reason: "A Udyam number looks like UDYAM-UP-09-1234567",
    };
  }
  return {
    ok: true,
    value: `UDYAM-${udyam.slice(5, 7)}-${udyam.slice(7, 9)}-${udyam.slice(9)}`,
  };
}

export function checkIEC(value) {
  const iec = normaliseId(value);
  if (!/^[A-Z0-9]{10}$/.test(iec)) {
    return { ok: false, reason: "An IEC is 10 characters" };
  }
  return { ok: true, value: iec };
}

// --- Aadhaar ---------------------------------------------------------------

/** Verhoeff tables: the check digit scheme Aadhaar uses. */
const D5 = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const PERM = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/** @param {string} digits */
function verhoeffIsValid(digits) {
  let c = 0;
  const reversed = [...digits].reverse().map(Number);
  reversed.forEach((digit, i) => {
    c = D5[c][PERM[i % 8][digit]];
  });
  return c === 0;
}

/** @param {string} digits a number without its check digit */
export function verhoeffCheckDigit(digits) {
  let c = 0;
  const reversed = [...digits].reverse().map(Number);
  reversed.forEach((digit, i) => {
    c = D5[c][PERM[(i + 1) % 8][digit]];
  });
  return INV[c];
}

export function checkAadhaar(value) {
  const aadhaar = String(value ?? "").replace(/\D/g, "");
  if (aadhaar.length !== 12) {
    return { ok: false, reason: "An Aadhaar number is 12 digits" };
  }
  if (aadhaar[0] === "0" || aadhaar[0] === "1") {
    return { ok: false, reason: "An Aadhaar number never starts with 0 or 1" };
  }
  if (!verhoeffIsValid(aadhaar)) {
    return { ok: false, reason: "That Aadhaar number fails its check digit" };
  }
  return { ok: true, value: aadhaar };
}

// --- contact details -------------------------------------------------------

export function checkMobile(value) {
  const digits = String(value ?? "")
    .replace(/\D/g, "")
    .replace(/^91(?=\d{10}$)/, "");
  if (!/^[6-9]\d{9}$/.test(digits)) {
    return {
      ok: false,
      reason: "An Indian mobile number is 10 digits starting 6, 7, 8 or 9",
    };
  }
  return { ok: true, value: digits };
}

export function checkEmail(value) {
  const email = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { ok: false, reason: "That is not an email address" };
  }
  return { ok: true, value: email };
}

export function checkIFSC(value) {
  const ifsc = normaliseId(value);
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
    return { ok: false, reason: "An IFSC is 11 characters, e.g. HDFC0001234" };
  }
  return { ok: true, value: ifsc };
}

/**
 * Validate one optional field: empty is fine, wrong is not.
 * @param {(v: unknown) => {ok: boolean, value?: string, reason?: string}} check
 * @param {unknown} value
 */
export function optional(check, value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return { ok: true, value: "" };
  }
  return check(value);
}

// @ts-check

import {
  checkAadhaar,
  checkCIN,
  checkEmail,
  checkGSTIN,
  checkIEC,
  checkMobile,
  checkPAN,
  checkTAN,
  checkUdyam,
  optional,
  panMatchesEntityType,
  ENTITY_TYPES,
  CLIENT_STATUSES,
  RISK_RATINGS,
  BILLING_CYCLES,
  TURNOVER_BANDS,
} from "../validators.js";

/**
 * One validator for a client, used by the onboarding form, the edit screen and
 * the Excel import alike — so the import cannot accept something the form
 * would reject, which is how bad data usually gets in.
 *
 * It returns cleaned values alongside the errors, because every one of these
 * identifiers has a canonical form (upper case, no spaces) and storing the
 * version somebody typed makes duplicate detection useless.
 *
 * @typedef {object} ClientFieldErrors
 * @property {Record<string, string>} errors field name to message
 * @property {Record<string, unknown>} value the cleaned record
 */

/**
 * @param {Record<string, unknown>} input
 * @param {{ partial?: boolean }} [options] partial skips "required" checks,
 *   for editing one section of an existing client
 * @returns {ClientFieldErrors}
 */
export function validateClient(
  input,
  { partial = false, requireGroup = !partial } = {},
) {
  /** @type {Record<string, string>} */
  const errors = {};
  /** @type {Record<string, any>} */
  const value = {};

  const text = (key) => String(input[key] ?? "").trim();

  // --- required identity ---
  const legalName = text("legalName");
  if (!partial || "legalName" in input) {
    if (legalName.length < 3) {
      errors.legalName = "The legal name is too short";
    } else {
      value.legalName = legalName;
    }
  }

  if ("tradeName" in input) value.tradeName = text("tradeName");

  const entityType = text("entityType");
  if (!partial || "entityType" in input) {
    if (!ENTITY_TYPES.includes(entityType)) {
      errors.entityType = "Choose an entity type";
    } else {
      value.entityType = entityType;
    }
  }

  if (!partial && !text("branchId")) {
    errors.branchId = "Choose a branch";
  } else if (text("branchId")) {
    value.branchId = text("branchId");
  }

  // --- statutory identifiers, all optional but all checked when present ---
  for (const [field, check] of [
    ["pan", checkPAN],
    ["tan", checkTAN],
    ["cin", checkCIN],
    ["udyam", checkUdyam],
    ["iec", checkIEC],
  ]) {
    if (!(field in input)) continue;
    const result = optional(check, input[field]);
    if (!result.ok) errors[field] = result.reason;
    else value[field] = result.value;
  }

  // a PAN whose holder type disagrees with the entity type is usually the
  // wrong PAN pasted in, not a new kind of entity
  if (value.pan && entityType && !panMatchesEntityType(value.pan, entityType)) {
    errors.pan = `That PAN belongs to a different kind of entity than ${entityType}`;
  }

  if ("aadhaar" in input) {
    const result = optional(checkAadhaar, input.aadhaar);
    if (!result.ok) errors.aadhaar = result.reason;
    else if (result.value) value.aadhaar = result.value;
  }

  // --- GSTINs: one row per state ---
  if ("gstins" in input) {
    const rows = Array.isArray(input.gstins) ? input.gstins : [];
    /** @type {any[]} */
    const cleaned = [];
    const seen = new Set();

    rows.forEach((row, i) => {
      const raw = typeof row === "string" ? row : row?.gstin;
      if (!String(raw ?? "").trim()) return;

      const result = checkGSTIN(raw);
      if (!result.ok) {
        errors[`gstins.${i}`] = result.reason;
        return;
      }
      if (seen.has(result.value)) {
        errors[`gstins.${i}`] = "That GSTIN is listed twice";
        return;
      }
      seen.add(result.value);

      if (value.pan && result.pan !== value.pan) {
        errors[`gstins.${i}`] =
          "That GSTIN belongs to a different PAN than this client";
        return;
      }

      cleaned.push({
        gstin: result.value,
        state: result.state,
        stateCode: result.stateCode,
        qrmp: Boolean(typeof row === "object" && row?.qrmp),
        active:
          typeof row === "object" && "active" in row
            ? Boolean(row.active)
            : true,
      });
    });

    value.gstins = cleaned;
    // the PAN can be taken from a GSTIN when it was not given separately
    if (!value.pan && cleaned.length)
      value.pan = checkGSTIN(cleaned[0].gstin).pan;
  }

  // --- contacts ---
  if ("contacts" in input) {
    const rows = Array.isArray(input.contacts) ? input.contacts : [];
    /** @type {any[]} */
    const cleaned = [];

    rows.forEach((row, i) => {
      const name = String(row?.name ?? "").trim();
      if (!name && !row?.mobile && !row?.email) return; // an empty row

      if (!name) {
        errors[`contacts.${i}.name`] = "A contact needs a name";
        return;
      }

      const contact = {
        name,
        designation: String(row.designation ?? "").trim(),
        primary: Boolean(row.primary),
        whatsappOptOut: Boolean(row.whatsappOptOut),
        mobile: "",
        whatsapp: "",
        email: "",
      };

      for (const [field, check] of [
        ["mobile", checkMobile],
        ["whatsapp", checkMobile],
        ["email", checkEmail],
      ]) {
        const result = optional(check, row[field]);
        if (!result.ok) errors[`contacts.${i}.${field}`] = result.reason;
        else contact[field] = result.value;
      }

      cleaned.push(contact);
    });

    if (!partial && cleaned.length === 0) {
      errors["contacts.0.name"] = "Add at least one contact person";
    }
    value.contacts = cleaned;
  }

  // --- classification and commercials ---
  if ("status" in input) {
    const status = text("status");
    if (!CLIENT_STATUSES.includes(status)) errors.status = "Unknown status";
    else value.status = status;
  }

  if ("statusReason" in input) value.statusReason = text("statusReason");
  if (["On hold", "Closed"].includes(value.status) && !value.statusReason) {
    errors.statusReason = `A client set to ${value.status} needs a reason`;
  }

  if ("risk" in input) {
    const risk = text("risk") || "Low";
    if (!RISK_RATINGS.includes(risk)) errors.risk = "Unknown risk rating";
    else value.risk = risk;
  }

  if ("turnoverBand" in input) {
    const band = text("turnoverBand");
    if (band && !TURNOVER_BANDS.includes(band)) {
      errors.turnoverBand = "Unknown turnover band";
    } else {
      value.turnoverBand = band;
    }
  }

  if ("billingCycle" in input) {
    const cycle = text("billingCycle") || "Per engagement";
    if (!BILLING_CYCLES.includes(cycle))
      errors.billingCycle = "Unknown billing cycle";
    else value.billingCycle = cycle;
  }

  if ("creditDays" in input) {
    const days = Number(input.creditDays);
    if (!Number.isInteger(days) || days < 0 || days > 365) {
      errors.creditDays = "Credit period is a whole number of days, 0 to 365";
    } else {
      value.creditDays = days;
    }
  }

  if ("invoiceEmail" in input) {
    const result = optional(checkEmail, input.invoiceEmail);
    if (!result.ok) errors.invoiceEmail = result.reason;
    else value.invoiceEmail = result.value;
  }

  for (const field of [
    "industry",
    "referralSource",
    "proposedServices",
    "clientPartnerId",
    "relationshipManagerId",
  ]) {
    if (field in input) value[field] = text(field) || null;
  }

  /**
   * Every new client belongs to a group (owner decision, 24-10-2026): one
   * owner, read together. It is required on creation only — the clients
   * already on the books predate the rule and must stay editable, so an
   * edit that does not mention the group leaves it alone.
   *
   * The Excel import passes `requireGroup: false`: its spreadsheet names a
   * group rather than an id, and the group may not exist yet. It checks the
   * name itself and creates the group as it writes the row.
   */
  if (requireGroup || "groupId" in input) {
    const groupId = text("groupId");
    if (!groupId && requireGroup) {
      errors.groupId = "Choose the group this client belongs to";
    } else if ("groupId" in input) {
      value.groupId = groupId || null;
    }
  }

  if ("tags" in input) {
    value.tags = (
      Array.isArray(input.tags)
        ? input.tags
        : String(input.tags ?? "").split(",")
    )
      .map((t) => String(t).trim())
      .filter(Boolean);
  }

  if ("establishedOn" in input && text("establishedOn")) {
    const date = new Date(text("establishedOn"));
    if (Number.isNaN(date.valueOf()))
      errors.establishedOn = "That is not a date";
    else if (date > new Date())
      errors.establishedOn = "That date is in the future";
    else value.establishedOn = date;
  }

  if ("quotedAmount" in input && text("quotedAmount")) {
    const rupees = Number(text("quotedAmount").replace(/[₹,\s]/g, ""));
    if (!Number.isFinite(rupees) || rupees < 0) {
      errors.quotedAmount = "That is not an amount";
    } else {
      value.quotedAmountPaise = Math.round(rupees * 100);
    }
  }

  if ("addresses" in input && Array.isArray(input.addresses)) {
    value.addresses = input.addresses
      .filter((a) => Object.values(a ?? {}).some((v) => String(v ?? "").trim()))
      .map((a) => ({
        kind: a.kind === "Correspondence" ? "Correspondence" : "Registered",
        line1: String(a.line1 ?? "").trim(),
        line2: String(a.line2 ?? "").trim(),
        city: String(a.city ?? "").trim(),
        state: String(a.state ?? "").trim(),
        pincode: String(a.pincode ?? "").replace(/\D/g, ""),
      }));

    value.addresses.forEach((a, i) => {
      if (a.pincode && !/^\d{6}$/.test(a.pincode)) {
        errors[`addresses.${i}.pincode`] = "A pincode is 6 digits";
      }
    });
  }

  return { errors, value };
}

/** The first error message, for forms that show one line. */
export function firstError(errors) {
  const [key] = Object.keys(errors);
  return key ? errors[key] : null;
}

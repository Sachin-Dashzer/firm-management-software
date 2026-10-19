// @ts-check

import mongoose from "mongoose";
import { auditPlugin } from "./plugins/audit.js";
import {
  FIRM_CONSTITUTIONS,
  CPE_YEAR_BASES,
  FIRM_DEFAULTS,
} from "../lib/firm/profile.js";

/**
 * The firm itself: one document, for ever.
 *
 * Everything here used to be a literal in the source — the name on every
 * invoice, the retention period spec section 6 promised was "configurable in
 * settings", and the ICAI numbers, which were nowhere at all. A firm that
 * changes its name, adds a partner or renews its peer review should not need
 * a developer.
 *
 * `key` is always "firm" and unique, which is how one document stays one
 * document: an upsert on it cannot race into two.
 */
const firmSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "firm", unique: true, immutable: true },

    // --- who the firm is, as it appears to a client ---
    name: { type: String, required: true, trim: true, maxlength: 120 },
    tagline: { type: String, trim: true, default: FIRM_DEFAULTS.tagline },
    pan: {
      type: String,
      uppercase: true,
      trim: true,
      default: "",
      validate: {
        validator: (v) => v === "" || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v),
        message: "Not a valid PAN",
      },
    },
    headOffice: { type: String, trim: true, default: "", maxlength: 300 },
    email: { type: String, trim: true, lowercase: true, default: "" },
    phone: { type: String, trim: true, default: "" },

    // --- ICAI ---
    /** Firm Registration Number, as allotted by the ICAI. */
    frn: { type: String, trim: true, uppercase: true, default: "" },
    constitution: {
      type: String,
      enum: FIRM_CONSTITUTIONS,
      default: FIRM_DEFAULTS.constitution,
    },
    peerReviewValidTill: { type: Date, default: null },
    /**
     * The firm's own record of how it meets the obligations in spec section
     * 16 — confidentiality, working papers, UDIN, the advertising rules.
     * Free text on purpose: it is read by a human reviewer, not by us.
     */
    icaiNotes: { type: String, default: "", maxlength: 8000 },

    /**
     * CPE hours expected in a year. **Zero means the firm has not said.**
     * ICAI's requirements are not seeded here and never guessed at
     * (CLAUDE.md rule 8): a partner enters them, as the owner asked on
     * 19-10-2026.
     */
    cpeTargetStructured: { type: Number, default: 0, min: 0, max: 200 },
    cpeTargetUnstructured: { type: Number, default: 0, min: 0, max: 200 },
    cpeYearBasis: {
      type: String,
      enum: CPE_YEAR_BASES,
      default: FIRM_DEFAULTS.cpeYearBasis,
    },

    /** Spec section 6: documents kept at least this long. */
    retentionYears: { type: Number, default: 8, min: 1, max: 25 },

    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

// no soft-delete plugin: the firm is not a record anyone deletes
firmSettingsSchema.plugin(auditPlugin, { entityType: "FirmSettings" });

export default mongoose.models.FirmSettings ??
  mongoose.model("FirmSettings", firmSettingsSchema);

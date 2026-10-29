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

    /**
     * One switch that stops every automatic message to a client (P3-10).
     *
     * For the morning somebody notices a rule is wrong: the firm can stop
     * the sending without switching rules off one by one, and without
     * anybody editing an environment variable on Vercel.
     */
    /**
     * Which modules are switched on (P3-22a). Absent means on, so a
     * database written before this field existed behaves as it always did.
     * Switching one off hides its menu group and makes its pages answer
     * "switched off" on the server — it never deletes anything.
     */
    modules: {
      type: new mongoose.Schema(
        {
          audit: { type: Boolean, default: true },
          notices: { type: Boolean, default: true },
          lab: { type: Boolean, default: true },
          learning: { type: Boolean, default: true },
          cx: { type: Boolean, default: true },
        },
        { _id: false },
      ),
      default: () => ({}),
    },

    /**
     * The firm's own words (P3-29).
     *
     * Labels only: no field, status, URL or audit entry is renamed, so a
     * vocabulary cannot break a query and clearing it puts every word
     * back. Blank means the application's own word, and singular and
     * plural are separate because a firm that renames "client" to "party"
     * does not want "partys". The list lives in `lib/firm/words.js`.
     */
    vocabulary: {
      type: new mongoose.Schema(
        {
          client: { type: String, trim: true, default: "", maxlength: 40 },
          clients: { type: String, trim: true, default: "", maxlength: 40 },
          job: { type: String, trim: true, default: "", maxlength: 40 },
          jobs: { type: String, trim: true, default: "", maxlength: 40 },
          matter: { type: String, trim: true, default: "", maxlength: 40 },
          matters: { type: String, trim: true, default: "", maxlength: 40 },
          invoice: { type: String, trim: true, default: "", maxlength: 40 },
          invoices: { type: String, trim: true, default: "", maxlength: 40 },
        },
        { _id: false },
      ),
      default: () => ({}),
    },

    automationPaused: { type: Boolean, default: false },
    automationPausedBy: { type: String, default: null },
    automationPausedAt: { type: Date, default: null },
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

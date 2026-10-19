// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";
// relative, not the @/ alias: this file is also loaded by scripts/seed.js and
// the Playwright tests, which run under plain Node and do not know the alias
import { ROLES } from "../lib/permissions.js";

/**
 * Team members (spec section 13 `users`, section 9 team record).
 *
 * `passwordHash` and `totpSecret` are `select: false`: they are never loaded
 * unless a query asks for them by name, so they cannot reach a React page or
 * a log by accident.
 */

/** Articleship details, only for interns (spec section 9). */
const articleshipSchema = new mongoose.Schema(
  {
    principalId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    icaiRegNo: { type: String, trim: true, default: "" },
    start: Date,
    expectedEnd: Date,
    leaveAllowed: { type: Number, default: 156 }, // ICAI permitted days
    leaveTaken: { type: Number, default: 0 },
  },
  { _id: false },
);

/**
 * A member's own ICAI record (P2-6). Separate from `articleship`, which is
 * the intern's side: one is somebody qualifying, the other somebody
 * qualified, and a person is never both at once.
 */
const icaiSchema = new mongoose.Schema(
  {
    membershipNo: { type: String, trim: true, default: "" },
    /** Associate or Fellow — the ICAI's own two grades. */
    grade: { type: String, enum: ["", "ACA", "FCA"], default: "" },
    admittedOn: { type: Date, default: null },
    /** A Certificate of Practice is what lets a member sign as a CA. */
    copHeld: { type: Boolean, default: false },
    copFrom: { type: Date, default: null },
  },
  { _id: false },
);

/**
 * One entry in a member's CPE log (P2-6).
 *
 * A subdocument rather than a collection of its own: a member logs a couple
 * of dozen a year, they are always read with the person, and spec section 13
 * fixes the collection list. Hours are stored in whole and half hours,
 * because that is how a programme is credited.
 */
const cpeEntrySchema = new mongoose.Schema(
  {
    on: { type: Date, required: true },
    hours: { type: Number, required: true, min: 0.5, max: 24 },
    /** The ICAI counts structured and unstructured learning apart. */
    kind: {
      type: String,
      enum: ["structured", "unstructured"],
      default: "structured",
    },
    programme: { type: String, required: true, trim: true, maxlength: 200 },
    organiser: { type: String, trim: true, default: "", maxlength: 200 },
    createdBy: { type: String, default: null },
  },
  { _id: true, timestamps: true },
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Not a valid email address"],
    },
    mobile: {
      type: String,
      trim: true,
      default: "",
      validate: {
        validator: (v) => v === "" || /^[6-9]\d{9}$/.test(v),
        message: "Mobile must be 10 digits starting 6-9",
      },
    },
    role: { type: String, required: true, enum: ROLES },
    branchIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Branch" }],
      validate: {
        validator: (v) => v.length > 0,
        message: "A user must belong to at least one branch",
      },
    },
    reportingTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    capacityHours: { type: Number, default: 8, min: 0, max: 24 },
    skills: { type: [String], default: [] },
    joiningDate: Date,
    active: { type: Boolean, default: true },
    isIntern: { type: Boolean, default: false },
    articleship: { type: articleshipSchema, default: undefined },
    /** Only a qualified member has one; absent for everybody else. */
    icai: { type: icaiSchema, default: undefined },
    cpe: { type: [cpeEntrySchema], default: [] },

    // --- credentials: never selected by default ---
    passwordHash: { type: String, select: false },
    /** TOTP shared secret, AES-256-GCM encrypted (spec section 16). */
    totpSecret: { type: String, select: false, default: null },
    totpEnabledAt: { type: Date, default: null },
    /** Codes already accepted, so a stolen code cannot be replayed. */
    lastTotpCounter: { type: Number, select: false, default: 0 },
    mustChangePassword: { type: Boolean, default: false },

    // --- sign-in safety (spec section 16) ---
    failedLogins: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, default: null, select: false },
    lastLoginAt: { type: Date, default: null },

    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

userSchema.plugin(softDeletePlugin);
userSchema.plugin(auditPlugin, { entityType: "User" });

userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
userSchema.index({ role: 1, active: 1 });
userSchema.index({ branchIds: 1 });

/** 2FA is mandatory for staff, so a user is only fully set up once it is on. */
userSchema.virtual("twoFactorReady").get(function twoFactorReady() {
  return Boolean(this.totpEnabledAt);
});

/** Interns always carry an articleship record (spec section 9). */
userSchema.pre("validate", function requireArticleship() {
  if (this.role === "intern") this.isIntern = true;
  if (this.isIntern && !this.articleship) {
    this.invalidate("articleship", "An intern needs articleship details");
  }
});

export default mongoose.models.User ?? mongoose.model("User", userSchema);

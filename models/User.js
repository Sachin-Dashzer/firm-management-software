// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
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
userSchema.pre("validate", function requireArticleship(next) {
  if (this.role === "intern") this.isIntern = true;
  if (this.isIntern && !this.articleship) {
    this.invalidate("articleship", "An intern needs articleship details");
  }
  next();
});

export default mongoose.models.User ?? mongoose.model("User", userSchema);

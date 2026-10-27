// @ts-check

import mongoose from "mongoose";
import { auditPlugin } from "./plugins/audit.js";

/**
 * The firm's changes to one notification rule (spec section 12).
 *
 * This collection holds **only what the firm has changed**. Every rule
 * exists in code with the spec's own defaults; a row appears here the
 * first time somebody switches a rule off, retimes it or rewrites its
 * wording. So an empty collection is a working system, and a rule the
 * firm has never touched cannot drift.
 *
 * Audited, because "nobody was reminded" and "nobody reworded the
 * reminder" are different conversations.
 */
const notificationRuleSchema = new mongoose.Schema(
  {
    /** The template key: see lib/mailer/rules.js. */
    key: { type: String, required: true, unique: true, trim: true },

    enabled: { type: Boolean, default: true },

    /**
     * A partner has decided this rule may write to clients without being
     * looked at first (P3-10). Off by default, and only a partner can set
     * it — trusting a rule is trusting every message it will ever send.
     *
     * Trusted is not unlimited: a send above 25 clients still queues, and
     * quiet hours, the monthly cap and the firm-wide pause all still apply.
     */
    trusted: { type: Boolean, default: false },
    trustedBy: { type: String, default: null },
    trustedByName: { type: String, default: "" },
    trustedAt: { type: Date, default: null },

    /** How many days before the date it goes out, e.g. [5, 1]. */
    daysBefore: { type: [Number], default: undefined },
    /** How often it repeats once the date has passed. */
    everyDays: { type: Number, default: undefined },
    /** The most reminders one thing ever earns. */
    maxReminders: { type: Number, default: undefined },
    /** "HH:MM" IST, for the digests. */
    atIST: { type: String, default: undefined, trim: true },

    /** The firm's own wording. Empty means "use the one in the code". */
    subject: { type: String, default: "", trim: true },
    body: { type: String, default: "" },

    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

notificationRuleSchema.plugin(auditPlugin, {
  entityType: "NotificationRule",
});

export default mongoose.models.NotificationRule ??
  mongoose.model("NotificationRule", notificationRuleSchema);

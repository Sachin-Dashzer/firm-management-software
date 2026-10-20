// @ts-check

import mongoose from "mongoose";
import { softDeletePlugin } from "./plugins/softDelete.js";
import { auditPlugin } from "./plugins/audit.js";
import { DSC_CLASSES, DSC_HOLDERS } from "../lib/practice/dsc.js";

/**
 * The DSC register (P2-7): whose digital signature certificate expires when.
 *
 * The firm does not hold clients' tokens (owner decision, 19-10-2026), so
 * there is **no custody and no movements log** here — only the certificate,
 * who it belongs to and when it runs out. A filing stopped on the last day
 * because a director's certificate lapsed is the thing this prevents.
 *
 * **No PIN, ever.** A certificate's PIN is a credential; CLAUDE.md rule 7
 * puts credentials in the encrypted vault, not in a plain field on a
 * register that half the firm can read.
 */
const dscSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },

    /**
     * A certificate belongs to a person, not to a company — a company's
     * filings are signed by a director's DSC, so the holder's own name is
     * what the register is read by.
     */
    holderName: { type: String, required: true, trim: true, maxlength: 120 },
    /** Director, Partner, Proprietor, Authorised signatory — their words. */
    holderRole: { type: String, trim: true, default: "", maxlength: 60 },

    certClass: { type: String, enum: ["", ...DSC_CLASSES], default: "Class 3" },
    /** The certifying authority: eMudhra, Sify, Capricorn and so on. */
    issuer: { type: String, trim: true, default: "", maxlength: 80 },
    serial: { type: String, trim: true, default: "", maxlength: 80 },

    validFrom: { type: Date, default: null },
    validTill: { type: Date, required: true },

    /** One fact, not a custody trail. */
    heldBy: { type: String, enum: DSC_HOLDERS, default: "client" },

    note: { type: String, trim: true, default: "", maxlength: 500 },

    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

dscSchema.plugin(softDeletePlugin);
dscSchema.plugin(auditPlugin, { entityType: "Dsc" });

// the register is read by what expires next, and by client
dscSchema.index({ validTill: 1 });
dscSchema.index({ clientId: 1, validTill: 1 });
dscSchema.index({ branchId: 1, validTill: 1 });

export default mongoose.models.Dsc ?? mongoose.model("Dsc", dscSchema);

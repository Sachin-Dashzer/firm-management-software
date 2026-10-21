// @ts-check

import Branch from "../../models/Branch.js";
import { formatPaise } from "../money.js";
import { formatISTDate } from "../dates.js";
import { amountInWords } from "./gst.js";
import { firmProfile } from "../firm/settings.js";

/**
 * One invoice, as the PDF component wants it (P2-9b).
 *
 * Lifted out of the staff download route when the client portal needed the
 * same document. Two copies of this would be two places for a figure to be
 * formatted differently, and the one a client downloads is the one that
 * matters most.
 *
 * **Every figure is read from the stored invoice, never recomputed**: the
 * copy downloaded in 2029 has to match the one issued in 2026, whatever
 * the code does in between.
 *
 * @param {any} invoice a lean Invoice
 */
export async function invoiceView(invoice) {
  const [branch, firm] = await Promise.all([
    Branch.findById(invoice.branchId).lean(),
    firmProfile(),
  ]);

  return {
    number: invoice.number,
    type: invoice.type,
    date: formatISTDate(invoice.date),
    dueDate: invoice.dueDate ? formatISTDate(invoice.dueDate) : null,
    supplierGstin: invoice.supplierGstin || branch?.gstin || "",
    branchAddress: branch?.address ?? "",
    billingName: invoice.billingName,
    billingAddress: invoice.billingAddress,
    billingGstin: invoice.billingGstin,
    placeOfSupply: invoice.placeOfSupply,
    placeOfSupplyName: invoice.placeOfSupplyName,
    interState: Boolean(invoice.igstPaise),
    lines: (invoice.lines ?? []).map((line) => ({
      description: line.description,
      sac: line.sac,
      gstRate: line.gstRate,
      amount: formatPaise(line.netPaise || line.amountPaise || 0),
    })),
    reimbursements: (invoice.reimbursements ?? []).map((item) => ({
      description: item.description,
      amount: formatPaise(item.amountPaise ?? 0),
    })),
    subtotal: formatPaise(invoice.subtotalPaise ?? 0),
    cgst: formatPaise(invoice.cgstPaise ?? 0),
    sgst: formatPaise(invoice.sgstPaise ?? 0),
    igst: formatPaise(invoice.igstPaise ?? 0),
    reimbursementTotal: formatPaise(invoice.reimbursementTotalPaise ?? 0),
    total: formatPaise(invoice.totalPaise ?? 0),
    totalInWords: amountInWords(invoice.totalPaise ?? 0),
    tdsExpected: formatPaise(invoice.tdsExpectedPaise ?? 0),
    expectedReceipt: formatPaise(
      (invoice.totalPaise ?? 0) - (invoice.tdsExpectedPaise ?? 0),
    ),
    zero: formatPaise(0),
    notes: invoice.notes ?? "",
    bankDetails: process.env.FIRM_BANK_DETAILS ?? "",
    // the firm as it is now, not as it was hardcoded (P2-6)
    firm,
  };
}

// @ts-check

import { renderToBuffer } from "@react-pdf/renderer";
import Branch from "../../models/Branch.js";
import { formatPaise } from "../money.js";
import { formatISTDate } from "../dates.js";
import { amountInWords } from "./gst.js";
import { InvoicePdf } from "./invoicePdf.jsx";

/**
 * The invoice PDF as an email attachment (spec section 12: the invoice
 * goes to the client with the PDF).
 *
 * The same component the download route uses, rendered to a buffer the
 * mailer can attach. Figures come from the stored invoice, never
 * recomputed, so what is emailed is what was issued.
 */

/** @param {any} invoice a stored Invoice document */
export async function invoicePdfAttachment(invoice) {
  const branch = await Branch.findById(invoice.branchId).lean();

  const view = {
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
  };

  const content = await renderToBuffer(InvoicePdf({ invoice: view }));

  return [
    {
      filename: `${(invoice.number ?? "invoice").replace(/\//g, "-")}.pdf`,
      content,
      contentType: "application/pdf",
    },
  ];
}

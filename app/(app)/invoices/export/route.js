import { headers } from "next/headers";
import { requireUser } from "@/auth";
import { can, branchFilter } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Invoice from "@/models/Invoice";
import Payment from "@/models/Payment";
import Client from "@/models/Client";
import Branch from "@/models/Branch";
import { buildWorkbook, xlsxResponse } from "@/lib/excel";
import { outstandingOf } from "@/lib/billing/allocation";
import {
  withAudit,
  recordAudit,
  ACTIONS,
  withAuditContext,
  contextFromRequest,
} from "@/lib/audit";

/**
 * Invoices and payments as a spreadsheet (spec section 7).
 *
 * Amounts are written in rupees with two decimals rather than paise: this
 * file is opened by a person and pasted into a return, and a column of
 * paise invites a hundredfold error. Everything else — dates, GSTINs,
 * numbers — is written exactly as it is stored.
 *
 * The Tally or Zoho import format is a separate job, waiting on the firm
 * choosing which; this is the plain export both of them can be built from.
 */

export const dynamic = "force-dynamic";

/** Rupees as a number, not text: the writer formats it so Excel can sum it. */
const rupees = (paise) => (paise ?? 0) / 100;

export async function GET(request) {
  const actor = await requireUser();
  if (!can(actor, "view", "invoices")) {
    return new Response("Not allowed", { status: 403 });
  }

  await connectDB();
  const url = new URL(request.url);
  const what =
    url.searchParams.get("what") === "payments" ? "payments" : "invoices";
  const scope = branchFilter(actor, "invoices") ?? {};

  const [clients, branches] = await Promise.all([
    Client.find({}).select("legalName tradeName code").lean(),
    Branch.find({}).select("code").lean(),
  ]);
  const clientName = new Map(
    clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );
  const clientCode = new Map(clients.map((c) => [String(c._id), c.code]));
  const branchCode = new Map(branches.map((b) => [String(b._id), b.code]));

  let rows;
  let count;

  if (what === "payments") {
    const payments = await Payment.find(scope)
      .sort({ date: -1 })
      .limit(20000)
      .lean();
    count = payments.length;

    rows = [
      [
        "Date",
        "Client",
        "Client code",
        "Branch",
        "Mode",
        "Reference",
        "Amount received",
        "TDS deducted",
        "Allocated",
        "Unallocated",
        "Seen in 26AS",
        "Notes",
      ],
      ...payments.map((p) => {
        const allocated = (p.allocations ?? []).reduce(
          (sum, a) => sum + (a.amountPaise ?? 0),
          0,
        );
        return [
          p.date,
          clientName.get(String(p.clientId)) ?? "",
          clientCode.get(String(p.clientId)) ?? "",
          branchCode.get(String(p.branchId)) ?? "",
          p.mode,
          p.reference ?? "",
          rupees(p.amountPaise),
          rupees(p.tdsPaise),
          rupees(allocated),
          rupees((p.amountPaise ?? 0) - allocated),
          p.tdsSeenIn26AS ? "Yes" : "No",
          p.notes ?? "",
        ];
      }),
    ];
  } else {
    const query = { ...scope };
    if (url.searchParams.get("status")) {
      query.status = url.searchParams.get("status");
    }

    const invoices = await Invoice.find(query)
      .sort({ date: -1 })
      .limit(20000)
      .lean();
    count = invoices.length;

    rows = [
      [
        "Number",
        "Type",
        "Date",
        "Due date",
        "Client",
        "Client code",
        "Client GSTIN",
        "Branch",
        "Our GSTIN",
        "Place of supply",
        "Taxable value",
        "CGST",
        "SGST",
        "IGST",
        "Out-of-pocket",
        "Total",
        "TDS expected",
        "Received",
        "TDS credited",
        "Outstanding",
        "Status",
      ],
      ...invoices.map((i) => [
        i.number ?? "draft",
        i.type,
        i.date,
        i.dueDate ?? "",
        clientName.get(String(i.clientId)) ?? "",
        clientCode.get(String(i.clientId)) ?? "",
        i.billingGstin ?? "",
        branchCode.get(String(i.branchId)) ?? "",
        i.supplierGstin ?? "",
        `${i.placeOfSupply ?? ""} ${i.placeOfSupplyName ?? ""}`.trim(),
        rupees(i.subtotalPaise),
        rupees(i.cgstPaise),
        rupees(i.sgstPaise),
        rupees(i.igstPaise),
        rupees(i.reimbursementTotalPaise),
        rupees(i.totalPaise),
        rupees(i.tdsExpectedPaise),
        rupees(i.paidPaise),
        rupees(i.tdsCreditedPaise),
        rupees(outstandingOf(i)),
        i.status,
      ]),
    ];
  }

  await withAuditContext(
    contextFromRequest(actor, await headers()),
    async () => {
      await withAudit((session) =>
        recordAudit(
          {
            action: ACTIONS.export,
            entityType: what === "payments" ? "Payment" : "Invoice",
            entityId: "export",
            note: `${count} ${what} exported, filters: ${url.search || "none"}`,
          },
          session,
        ),
      );
    },
  );

  // every rupee column goes out as a number Excel can total, and every
  // date as a real date rather than text it has to guess the order of
  const kinds = {
    Date: "date",
    "Due date": "date",
    "Taxable value": "rupees",
    CGST: "rupees",
    SGST: "rupees",
    IGST: "rupees",
    "Out-of-pocket": "rupees",
    Total: "rupees",
    "TDS expected": "rupees",
    Received: "rupees",
    "TDS credited": "rupees",
    Outstanding: "rupees",
    "Amount received": "rupees",
    "TDS deducted": "rupees",
    Allocated: "rupees",
    Unallocated: "rupees",
  };
  const columns = rows[0].map((header) => ({
    header,
    kind: kinds[header] ?? "text",
  }));

  const buffer = await buildWorkbook([
    {
      name: what === "payments" ? "Payments" : "Invoices",
      columns,
      rows: rows.slice(1),
    },
  ]);
  return xlsxResponse(buffer, `phmg-${what}`);
}

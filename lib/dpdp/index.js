// @ts-check

import Client from "../../models/Client.js";
import ClientCredential from "../../models/ClientCredential.js";
import ClientGroup from "../../models/ClientGroup.js";
import ClientService from "../../models/ClientService.js";
import Engagement from "../../models/Engagement.js";
import Invoice from "../../models/Invoice.js";
import Payment from "../../models/Payment.js";
import Document from "../../models/Document.js";
import DocRequest from "../../models/DocRequest.js";
import Comment from "../../models/Comment.js";
import MessageLog from "../../models/MessageLog.js";
import AuditLog from "../../models/AuditLog.js";
import { formatISTDate, formatISTDateTime } from "../dates.js";

/**
 * The Digital Personal Data Protection Act, 2023 (spec section 16).
 *
 * Two obligations the Act puts on the firm, and they pull in opposite
 * directions:
 *
 *  - **give it all back.** A client may ask what is held on them, and the
 *    answer has to be everything, not whatever one screen can show.
 *  - **delete it on a valid request** — but only *where retention
 *    obligations allow*, and a Chartered Accountancy firm has several. An
 *    invoice is required by the GST Act and the Income Tax Act; working
 *    papers are required by the Standards on Auditing for eight years; a
 *    UDIN is a professional record. None of those may be erased because
 *    somebody asked.
 *
 * So deletion here means **redaction**: the personal data that identifies
 * a living person is overwritten, their documents are erased from the
 * vault, and the statutory record stays — invoices, engagements, UDINs and
 * the audit log, which is immutable by design (spec section 11).
 *
 * Note *erased*, not "the key destroyed". There is one storage key for the
 * whole firm, so there is no per-client key to throw away: the only honest
 * way to make one client's files unreadable is to delete the files. The
 * document rows stay, with their names and dates, because the audit trail
 * has to show what was held and that it was erased.
 *
 * That is the firm's decision, recorded on 18-10-2026. It is written down
 * here rather than buried in a form, because the one thing nobody should
 * have to guess at later is what "deleted" meant.
 */

/** The collections that hold something about a client. */
const SOURCES = [
  { name: "Client", model: Client, by: "_id" },
  { name: "Services", model: ClientService, by: "clientId" },
  { name: "Engagements", model: Engagement, by: "clientId" },
  { name: "Invoices", model: Invoice, by: "clientId" },
  { name: "Payments", model: Payment, by: "clientId" },
  { name: "Documents", model: Document, by: "clientId" },
  { name: "Document requests", model: DocRequest, by: "clientId" },
  { name: "Notes and calls", model: Comment, by: "clientId" },
  { name: "Messages sent", model: MessageLog, by: "clientId" },
  { name: "Portal logins", model: ClientCredential, by: "clientId" },
];

/**
 * Everything held on one client, for the export (spec section 16).
 *
 * Encrypted fields are reported as *present*, never decrypted: the point
 * of the export is to tell a person what is held, and handing their
 * Aadhaar number and their portal passwords out in a spreadsheet would be
 * a worse breach than not answering at all. The same goes for documents:
 * the export lists them, and the firm sends the files themselves through
 * the gateway's signed links.
 *
 * @param {string} clientId
 */
export async function buildClientExport(clientId) {
  const client = await Client.findById(clientId).lean();
  if (!client) return null;

  const group = client.groupId
    ? await ClientGroup.findById(client.groupId).select("name").lean()
    : null;

  /** @type {Record<string, any[]>} */
  const data = {};
  for (const source of SOURCES) {
    if (source.by === "_id") continue;
    data[source.name] = await source.model
      .find({ [source.by]: clientId })
      .limit(5000)
      .lean();
  }

  const audit = await AuditLog.find({ clientId })
    .sort({ ts: 1 })
    .limit(10000)
    .lean();

  return {
    client,
    group,
    data,
    audit,
    sheets: exportSheets({ client, group, data, audit }),
  };
}

/** The workbook, one sheet per kind of thing. */
function exportSheets({ client, group, data, audit }) {
  const sheets = [];

  sheets.push({
    name: "The client",
    title: `Everything PHMG & Associates holds on ${client.legalName}, as at ${formatISTDate(new Date())}`,
    columns: [
      { header: "Field", key: "field", width: 28 },
      { header: "Held", key: "value", width: 52 },
    ],
    rows: [
      ["Client code", client.code],
      ["Legal name", client.legalName],
      ["Trade name", client.tradeName],
      ["Type of entity", client.entityType],
      [
        "Established / date of birth",
        client.establishedOn ? formatISTDate(client.establishedOn) : "",
      ],
      ["PAN", client.pan],
      ["TAN", client.tan],
      ["CIN", client.cin],
      ["Udyam", client.udyam],
      ["IEC", client.iec],
      [
        "Aadhaar",
        client.aadhaarLast4
          ? `held, encrypted — ending ${client.aadhaarLast4}`
          : "not held",
      ],
      ["GSTINs", (client.gstins ?? []).map((g) => g.gstin).join(", ")],
      ["Group", group?.name ?? ""],
      ["Status", client.status],
      ["Risk rating", client.risk],
      ["Industry", client.industry],
      ["Turnover band", client.turnoverBand],
      ["Credit days", String(client.creditDays ?? "")],
      ["Tags", (client.tags ?? []).join(", ")],
      ["Taken on", client.onboardedOn ? formatISTDate(client.onboardedOn) : ""],
      ["Record created", formatISTDateTime(client.createdAt)],
      ["Record last changed", formatISTDateTime(client.updatedAt)],
      [
        "Redacted on request",
        client.redactedAt ? formatISTDateTime(client.redactedAt) : "no",
      ],
    ].map(([field, value]) => ({ field, value })),
  });

  sheets.push({
    name: "People",
    columns: [
      { header: "Name", key: "name", width: 26 },
      { header: "Designation", key: "designation" },
      { header: "Mobile", key: "mobile" },
      { header: "WhatsApp", key: "whatsapp" },
      { header: "Email", key: "email", width: 30 },
      { header: "Main contact", key: "primary" },
    ],
    rows: (client.contacts ?? []).map((contact) => ({
      ...contact,
      primary: contact.primary ? "Yes" : "",
    })),
  });

  sheets.push({
    name: "Addresses",
    columns: [
      { header: "Kind", key: "kind" },
      { header: "Line 1", key: "line1", width: 32 },
      { header: "Line 2", key: "line2", width: 32 },
      { header: "City", key: "city" },
      { header: "State", key: "state" },
      { header: "PIN", key: "pin" },
    ],
    rows: client.addresses ?? [],
  });

  sheets.push({
    name: "Work",
    columns: [
      { header: "Code", key: "code" },
      { header: "Service", key: "service", width: 30 },
      { header: "Period", key: "period" },
      { header: "Status", key: "status" },
      { header: "Statutory due", key: "statutoryDue", kind: "date" },
      { header: "Completed", key: "completedAt", kind: "date" },
      { header: "UDIN", key: "udin" },
      { header: "Fee", key: "feePaise", kind: "money" },
    ],
    rows: (data.Engagements ?? []).map((row) => ({
      ...row,
      service: row.templateSnapshot?.name ?? "",
    })),
  });

  sheets.push({
    name: "Invoices",
    columns: [
      { header: "Number", key: "number" },
      { header: "Dated", key: "date", kind: "date" },
      { header: "Due", key: "dueDate", kind: "date" },
      { header: "Total", key: "totalPaise", kind: "money" },
      { header: "Received", key: "paidPaise", kind: "money" },
      { header: "Status", key: "status" },
    ],
    rows: data.Invoices ?? [],
  });

  sheets.push({
    name: "Payments",
    columns: [
      { header: "Dated", key: "date", kind: "date" },
      { header: "Amount", key: "amountPaise", kind: "money" },
      { header: "Mode", key: "mode" },
      { header: "Reference", key: "reference", width: 24 },
      { header: "TDS", key: "tdsPaise", kind: "money" },
    ],
    rows: data.Payments ?? [],
  });

  sheets.push({
    name: "Documents",
    title:
      "The files themselves are encrypted and are sent separately, through a signed link.",
    columns: [
      { header: "Name", key: "name", width: 40 },
      { header: "Kind", key: "kind" },
      { header: "Uploaded", key: "createdAt", kind: "date" },
      { header: "Size (KB)", key: "sizeKb", kind: "int" },
      { header: "In the recycle bin", key: "deleted" },
    ],
    rows: (data.Documents ?? []).map((row) => ({
      ...row,
      sizeKb: Math.round((row.size ?? 0) / 1024),
      deleted: row.deletedAt ? "Yes" : "",
    })),
  });

  sheets.push({
    name: "What we said",
    title: "Every message sent to this client, and every note taken.",
    columns: [
      { header: "When", key: "when", kind: "date" },
      { header: "Kind", key: "kind" },
      { header: "To", key: "to", width: 28 },
      { header: "Subject or note", key: "what", width: 60 },
    ],
    rows: [
      ...(data["Messages sent"] ?? []).map((row) => ({
        when: row.createdAt,
        kind: `email (${row.status})`,
        to: row.to,
        what: row.subject,
      })),
      ...(data["Notes and calls"] ?? []).map((row) => ({
        when: row.occurredAt ?? row.createdAt,
        kind: row.kind ?? "note",
        to: "",
        what: row.body,
      })),
    ].sort((a, b) => new Date(a.when) - new Date(b.when)),
  });

  sheets.push({
    name: "Portal logins",
    title:
      "Passwords are held encrypted and are never exported. Each reveal is in the history below.",
    columns: [
      { header: "Portal", key: "portal" },
      { header: "Label", key: "label", width: 24 },
      { header: "Username", key: "username", width: 28 },
      { header: "Password held", key: "held" },
      { header: "Last revealed", key: "lastRevealedAt", kind: "date" },
    ],
    rows: (data["Portal logins"] ?? []).map((row) => ({
      ...row,
      held: "yes, encrypted",
    })),
  });

  sheets.push({
    name: "History",
    title:
      "Every change to this client's record, from the firm's audit log (spec section 11).",
    columns: [
      { header: "When", key: "ts", kind: "date" },
      { header: "Who", key: "userName", width: 24 },
      { header: "Did what", key: "action" },
      { header: "To what", key: "entityType" },
      { header: "Note", key: "note", width: 60 },
    ],
    rows: audit,
  });

  return sheets;
}

/**
 * The fields a deletion request clears, and the ones it must not.
 *
 * Written as data rather than as code in a function, so a partner or a
 * lawyer can read what will happen without reading JavaScript.
 */
export const REDACTION = {
  clears: [
    ["legalName", "replaced by the client code"],
    ["tradeName", "cleared"],
    ["pan", "cleared"],
    ["tan", "cleared"],
    ["cin", "cleared"],
    ["udyam", "cleared"],
    ["iec", "cleared"],
    ["aadhaarEncrypted", "ciphertext destroyed"],
    ["aadhaarLast4", "cleared"],
    ["contacts", "every name, mobile, WhatsApp number and email removed"],
    ["addresses", "removed"],
    ["establishedOn", "cleared — a date of birth for an individual"],
    ["portal credentials", "username, password and notes destroyed"],
    [
      "documents",
      "erased from the vault; the file list stays, the files do not",
    ],
  ],
  keeps: [
    ["Client code", "the record has to stay findable to stay auditable"],
    ["GSTINs", "a public registration, and required on past invoices"],
    ["Invoices and payments", "GST Act and Income Tax Act"],
    ["Engagements and UDINs", "ICAI, and the Standards on Auditing"],
    [
      "The audit log",
      "immutable by design; it is the record of this very request",
    ],
    ["Document records", "name and date stay; the file itself is unreadable"],
  ],
};

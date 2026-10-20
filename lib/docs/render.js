// @ts-check

import { can } from "../permissions.js";
import { connectDB } from "../db.js";
import GeneratedDoc from "../../models/GeneratedDoc.js";
import DocTemplate from "../../models/DocTemplate.js";
import { firmProfile } from "../firm/settings.js";
import { formatISTDate } from "../dates.js";
import { buildDocument, loadEngagementForDoc } from "./build.js";
import {
  withAudit,
  recordAudit,
  ACTIONS,
  withAuditContext,
  contextFromRequest,
} from "../audit/index.js";

/**
 * Everything a download route needs, whichever file it is making (P2-8c).
 *
 * The PDF route and the Word route ask the same four questions — may this
 * person see it, what does it say, whose letterhead, and what goes in the
 * footer — so they ask them in one place. Two copies would eventually
 * answer the permission question differently, which is the copy that
 * matters.
 *
 * A **final** prints the words stored when it was issued, never re-resolved:
 * a letter signed last year must not change because an address was
 * corrected since. A draft resolves live and is marked as a draft.
 *
 * @param {{id: string, role: string, name: string, branchIds?: string[]}} actor
 * @param {string} id
 * @returns {Promise<{error: string, status: number} | {doc: any, title: string, body: string, gaps: Array<{label: string}>, firm: any, reference: string, filename: string}>}
 */
export async function prepareRender(actor, id) {
  await connectDB();
  const doc = await GeneratedDoc.findById(id).lean();
  if (!doc) return { error: "No such document", status: 404 };

  const engagement = doc.engagementId
    ? await loadEngagementForDoc(String(doc.engagementId))
    : null;

  if (
    !can(actor, "view", "docGenerate", {
      branchId: String(doc.branchId),
      assigneeId: String(engagement?.assigneeId ?? ""),
      reviewerId: String(engagement?.reviewerId ?? ""),
    })
  ) {
    return { error: "Not allowed", status: 403 };
  }

  let body = doc.bodyText;
  let title = doc.title;
  /** @type {Array<{label: string}>} */
  let gaps = [];

  if (doc.state !== "final") {
    const template = await DocTemplate.findById(doc.templateId).lean();
    if (!template) return { error: "No such template", status: 404 };
    const built = await buildDocument({ template, engagement, actor });
    body = built.text;
    title = built.title;
    gaps = built.gaps;
  }

  const firm = await firmProfile();

  return {
    doc,
    title,
    body,
    gaps,
    firm,
    reference: [
      doc.templateCode,
      doc.state === "final" && doc.issuedAt
        ? `issued ${formatISTDate(doc.issuedAt)}`
        : "",
      doc.udin ? `UDIN ${doc.udin}` : "",
    ]
      .filter(Boolean)
      .join("  ·  "),
    filename: `phmg-${`${doc.templateCode || "document"}-${doc.state}`
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")}`,
  };
}

/**
 * Taking a copy of a document is a download like any other (spec section
 * 11), whatever format it is in.
 *
 * @param {any} actor
 * @param {any} doc
 * @param {Headers} headerList
 * @param {string} format
 */
export async function auditDocDownload(actor, doc, headerList, format) {
  await withAuditContext(contextFromRequest(actor, headerList), async () => {
    await withAudit((session) =>
      recordAudit(
        {
          action: ACTIONS.documentDownload,
          entityType: "GeneratedDoc",
          entityId: String(doc._id),
          note: `${doc.templateName} (${doc.state}, ${format})`,
        },
        session,
      ),
    );
  });
}

// @ts-check

import { renderToBuffer } from "@react-pdf/renderer";
import DocTemplate from "../../models/DocTemplate.js";
import { buildDocument } from "../docs/build.js";
import { checkIssue } from "../docs/rules.js";
import { TemplatePdf } from "../docs/templatePdf.jsx";
import { firmProfile } from "../firm/settings.js";
import { formatISTDate } from "../dates.js";

/**
 * The welcome pack a new client is sent (owner request, 12-11-2026).
 *
 * The wizard has always let the firm settle a pack on step 6 — the
 * engagement letter, the terms, the KYC list, the welcome note — and then
 * did nothing with it: the Done screen said "to issue from the client's
 * documents tab", so in practice the client got a bare fee email and the
 * letters were written again by hand. The owner asked for the obvious
 * thing: one email, with everything that was ticked attached as a PDF.
 *
 * ## It renders; it does not relax a rule
 *
 * Each letter goes through the same three gates an issued letter has gone
 * through since P2-8b — the template must be **approved** by a partner
 * (CLAUDE.md rule 8: no wording the firm has not read), the person
 * onboarding must be senior enough to issue it (`checkIssue`), and nothing
 * prints with a blank or an unknown field in it. A letter that fails any of
 * them is not attached, and the reason comes back as a sentence for the
 * Done screen. The rest of the pack still goes.
 *
 * The PDF is the same component the Letters tab and the download route use,
 * and every letter sent leaves a `GeneratedDoc` behind it, so what the
 * client receives is exactly what the firm can reprint.
 *
 * It lives here rather than in a job because `@react-pdf/renderer` and the
 * JSX it takes cannot be imported by the plain-node job runner
 * (`scripts/jobs-tick.mjs`) — which is also why the invoice renders its PDF
 * in the request and hands the queue the bytes.
 */

/** A filename a client can tell apart in their downloads folder. */
function fileName(firm, label) {
  const slug = `${firm?.shortName || firm?.name || "phmg"}-${label}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${slug}.pdf`;
}

/** One letter, on the firm's paper. */
function letterPdf({ title, body, firm, reference }) {
  return renderToBuffer(
    TemplatePdf({
      doc: { title, body, state: "final", firm, gaps: [], reference },
    }),
  );
}

/**
 * The quotation as a document, in the same words the covering email quotes.
 *
 * It is not a template — these are the fees the wizard collected — so it
 * has no `DocTemplate` behind it and leaves no `GeneratedDoc`: what was
 * agreed lives on `clientServices`, which is where the invoices read it.
 *
 * @param {{lines: string[], totalLine: string, unpriced: number}} quote
 */
export function quotationBody(quote, { clientName, firmName, signedBy, on }) {
  return [
    `This sets out the professional services we will provide to ${clientName}, and our fees for them.`,
    quote.lines.map((line) => `— ${line}`).join("\n"),
    quote.totalLine,
    "Fees are exclusive of GST and of government fees, which are charged at actuals, unless a line above says otherwise.",
    quote.unpriced
      ? `We will come back to you on ${
          quote.unpriced === 1 ? "the fee" : "the fees"
        } marked "to be agreed".`
      : "",
    `This quotation holds for 30 days from ${on}.`,
    `For ${firmName}\n${signedBy}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Build the pack for one client.
 *
 * @param {object} input
 * @param {{id: string, name: string, role: string}} input.actor
 * @param {string} input.clientId
 * @param {{legalName?: string, tradeName?: string, branchId?: any}} [input.client]
 * @param {string[]} [input.codes] the template codes ticked on step 6
 * @param {{lines: string[], totalLine: string, unpriced: number}} [input.quote]
 * @returns {Promise<{
 *   attachments: Array<{filename: string, content: Buffer, contentType: string}>,
 *   docs: object[],
 *   names: string[],
 *   skipped: Array<{name: string, why: string}>,
 * }>}
 */
export async function buildWelcomePack({
  actor,
  clientId,
  client,
  codes = [],
  quote,
}) {
  const firm = await firmProfile();
  const on = formatISTDate(new Date());
  const clientName = client?.tradeName || client?.legalName || "you";

  const attachments = [];
  /** The `GeneratedDoc` rows the caller writes, inside its own transaction. */
  const docs = [];
  /** What the email tells the client is attached. */
  const names = [];
  const skipped = [];

  // a pack is a handful of letters; a payload of fifty PDFs is a mistake
  for (const code of [...new Set(codes.map(String))].slice(0, 12)) {
    const template = await DocTemplate.findOne({ code, active: true }).lean();
    if (!template) {
      skipped.push({
        name: code,
        why: "the firm has no wording for it yet — add it in Settings → Document templates",
      });
      continue;
    }

    const built = await buildDocument({ template, clientId, actor });
    const allowed = checkIssue(actor, template, null, built);
    if (!allowed.ok) {
      skipped.push({ name: template.name, why: allowed.error });
      continue;
    }
    if (built.unknown.length) {
      skipped.push({
        name: template.name,
        why: `the wording uses fields that do not exist: ${built.unknown.join(", ")}`,
      });
      continue;
    }

    const content = await letterPdf({
      title: built.title,
      body: built.text,
      firm,
      reference: `${template.code}  ·  issued ${on}`,
    });

    attachments.push({
      filename: fileName(firm, template.code),
      content,
      contentType: "application/pdf",
    });
    names.push(template.name);
    docs.push({
      templateId: template._id,
      templateCode: template.code,
      templateName: template.name,
      templateVersion: template.version ?? 1,
      clientId,
      branchId: client?.branchId ?? null,
      state: "final",
      title: built.title,
      bodyText: built.text,
      signatoryName: built.signatory?.name ?? actor.name,
      signatoryDesignation: built.signatory?.designation ?? "",
      signatoryMembershipNo: built.signatory?.membershipNo ?? "",
      issuedAt: new Date(),
      issuedBy: actor.id,
      issuedByName: actor.name,
      createdBy: actor.id,
      updatedBy: actor.id,
    });
  }

  if (quote?.lines?.length) {
    const content = await letterPdf({
      title: "Quotation",
      body: quotationBody(quote, {
        clientName,
        firmName: firm?.name ?? "the firm",
        signedBy: actor.name,
        on,
      }),
      firm,
      reference: `QUOTATION  ·  ${on}`,
    });
    attachments.push({
      filename: fileName(firm, "quotation"),
      content,
      contentType: "application/pdf",
    });
    names.push("Quotation");
  }

  return { attachments, docs, names, skipped };
}

/**
 * The two blocks the covering email grows when there is something to say.
 *
 * Empty strings are deliberate: `fill()` prints nothing for one and takes
 * the blank line with it, which is how every optional line in a template
 * behaves (QA 09-11-2026, #15).
 *
 * @param {{names?: string[], documents?: string[], link?: string, days?: number}} input
 */
export function packLines({ names = [], documents = [], link = "", days = 7 }) {
  return {
    attachedLine: names.length
      ? `Attached to this email\n${names.map((name) => `— ${name}`).join("\n")}`
      : "",
    documentsLine: documents.length
      ? [
          `What we need from you\n${documents
            .map((name) => `— ${name}`)
            .join("\n")}`,
          link
            ? `You can upload them all in one go here, with no password to remember:\n${link}\nThe link works for ${days} days.`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n")
      : "",
  };
}

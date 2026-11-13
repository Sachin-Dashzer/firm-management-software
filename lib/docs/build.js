// @ts-check

import Client from "../../models/Client.js";
import Engagement from "../../models/Engagement.js";
import User from "../../models/User.js";
import { firmProfile } from "../firm/settings.js";
import { buildContext, resolveTemplate } from "./resolve.js";

/**
 * Turning a template plus a job into the words of a document (P2-8b).
 *
 * One function, called by the three places that need the text: the draft
 * preview on screen, the PDF route, and the action that issues a final. If
 * they each built their own context, the letter on screen and the letter in
 * the PDF would eventually disagree, and nobody would notice until one of
 * them was signed.
 *
 * @param {{template: any, engagement?: any, clientId?: string, actor: {id: string, name: string, role: string}}} input
 * @returns {Promise<{text: string, title: string, gaps: Array<{key: string, label: string}>, unknown: string[], firm: any, client: any, signatory: any}>}
 */
export async function buildDocument({ template, engagement, clientId, actor }) {
  const [firm, client, signatory] = await Promise.all([
    firmProfile(),
    Client.findById(engagement ? engagement.clientId : clientId)
      .select("legalName tradeName entityType addresses gstins contacts")
      .lean(),
    // the person generating it signs it, with their membership number if
    // they are a member — the ICAI record from P2-6, read not invented
    User.findById(actor.id).select("name role icai").lean(),
  ]);

  const context = buildContext({
    firm,
    client,
    engagement,
    signatory: signatory
      ? {
          name: signatory.name,
          designation:
            signatory.role === "partner"
              ? "Partner"
              : signatory.role === "ca"
                ? "Chartered Accountant"
                : "",
          membershipNo: signatory.icai?.membershipNo ?? "",
        }
      : null,
  });

  const resolved = resolveTemplate(template.body, context);
  return {
    ...resolved,
    title: template.title || template.name,
    firm,
    client,
    signatory: context.signatory,
  };
}

/**
 * The engagement a document is attached to, with the fields the permission
 * check and the tier rule need.
 *
 * @param {string} id
 */
export async function loadEngagementForDoc(id) {
  return (
    Engagement.findById(id)
      /*
        `helperIds` is read for the permission check, not for the letter
        (03-11-2026). The engagement page counts the helpers on a job as
        being on it for access, and `loadForDoc` could not agree with it
        while this select left them out — so every control on the Letters
        panel crashed for a helper who was entitled to use it.
      */
      /*
        `checklist` came in on 13-11-2026, for `createDraft`: a letter
        now records which checklist row asked for it, and the row id
        arrives from the browser, so it is checked against the job's own
        rows rather than trusted.
      */
      .select(
        "code clientId branchId assigneeId reviewerId helperIds periodLabel period feePaise udin filedOn templateSnapshot checklist",
      )
      .lean()
  );
}

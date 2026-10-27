// @ts-check

import { compose } from "./templates.js";

/**
 * Notify: one action, and a preview of every message before any of it is
 * sent (P3-17a).
 *
 * **One function, two callers.** The screen's preview and the send both
 * come from here, so what somebody reads cannot differ from what goes out
 * — which is the only reason a preview is worth having. A second code path
 * that formats "roughly the same thing" is a preview that lies.
 *
 * A message to a colleague and a message to a client are different
 * templates on purpose: the client's carries a greeting and the firm's
 * name, the colleague's carries the job it is about, and the client one is
 * marked `audience: "client"` so the guard and the client-email switch
 * apply to it exactly as they do to an invoice (Step 9b).
 */

export const TEAM_TEMPLATE = "messageToTeam";
export const CLIENT_TEMPLATE = "messageToClient";

/**
 * @typedef {object} Recipient
 * @property {string} id      user id, or a contact's own key
 * @property {string} name
 * @property {string} email
 * @property {"team"|"client"} side
 * @property {string} [why]   "Reviewer", "Client partner", "Accounts contact"
 */

/**
 * Every message this Notify would send, in order.
 *
 * @param {object} input
 * @param {Recipient[]} input.recipients
 * @param {string} input.subject
 * @param {string} input.body       the sender's own words
 * @param {string} input.from       the sender's name
 * @param {string} input.job        what it is about, in words
 * @param {string} [input.firm]
 * @param {string} [input.link]
 * @param {Record<string, {subject?: string, body?: string}>} [input.overrides]
 * @returns {Array<Recipient & {subject: string, text: string, template: string, audience: string}>}
 */
export function messagesFor({
  recipients,
  subject,
  body,
  from,
  job,
  firm,
  link = "",
  overrides = {},
}) {
  return recipients.map((person) => {
    const template = person.side === "client" ? CLIENT_TEMPLATE : TEAM_TEMPLATE;

    const message = compose(
      template,
      {
        ...(firm ? { firm } : {}),
        name: person.name,
        subject: subject.trim(),
        body: body.trim(),
        from,
        job,
        // a client is never sent a link into the firm's own system
        link: person.side === "client" ? "" : link,
      },
      overrides,
    );

    return {
      ...person,
      template,
      audience: message.audience,
      subject: message.subject,
      text: message.text,
    };
  });
}

/**
 * What is wrong with this Notify, before anybody previews it.
 *
 * @param {object} input
 * @param {string} input.subject
 * @param {string} input.body
 * @param {Recipient[]} input.recipients
 * @returns {string|null}
 */
export function checkMessage({ subject, body, recipients }) {
  if (!recipients.length) return "Nobody is ticked.";
  if (subject.trim().length < 3) {
    return "Give it a subject. It is the line people decide by.";
  }
  if (body.trim().length < 10) return "Write the message.";
  if (recipients.some((person) => !person.email)) {
    return "Somebody you ticked has no email address on their record.";
  }
  return null;
}

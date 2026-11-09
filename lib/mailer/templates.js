// @ts-check

import { FIRM_DEFAULTS } from "../firm/profile.js";

/**
 * The messages the system sends (spec section 12).
 *
 * Plain text, deliberately. These go to accountants and their clients
 * about deadlines and money: they are read on a phone, forwarded, and
 * sometimes printed. A styled template would add nothing a subject line
 * and four short lines do not already do, and would be one more thing to
 * break in Outlook.
 *
 * Placeholders are `{name}` and are filled from the data given. An unknown
 * placeholder is left alone rather than printed as "undefined", so a
 * mistake in a template looks like a mistake instead of looking like a
 * client whose name the firm does not know.
 */

/**
 * @param {string} text
 * @param {Record<string, any>} values
 * @param {Set<string>} [missing] collects the placeholders nothing filled,
 *        so the caller can refuse to post a half-written message
 */
export function fill(text, values, missing) {
  const filled = String(text ?? "").replace(/\{(\w+)\}/g, (whole, key) => {
    const value = values[key];
    /*
     * An empty string is an answer — "there is no extra line to add here"
     * — and renders as nothing (QA 09-11-2026, #15: a client was sent the
     * literal `{unpricedLine}` because every fee was priced). Only a value
     * nobody passed at all is a template bug, and that one is left
     * standing so it looks like one; `compose` reports it so the message
     * is never sent.
     */
    if (value === undefined || value === null) {
      missing?.add(key);
      return whole;
    }
    return String(value);
  });

  // a placeholder that filled to nothing leaves a stranded blank line
  return filled.replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, "\n\n").trim();
}

/**
 * Every message, with who it is for. `audience: "client"` is what the
 * guard holds back until client email is switched on.
 *
 * @typedef {object} Template
 * @property {string} key
 * @property {"team"|"client"} audience
 * @property {string} subject
 * @property {string} body
 * @property {string} what   one line for the settings screen
 */

/** @type {Record<string, Template>} */
export const TEMPLATES = {
  engagementAssigned: {
    key: "engagementAssigned",
    audience: "team",
    what: "Tells someone work has been put on their desk.",
    subject: "{service} for {client} is yours ({period})",
    body: `{assignee},

{byName} has assigned you {service} for {client}, {period}.

{dueLine}

{link}`,
  },

  engagementForReview: {
    key: "engagementForReview",
    audience: "team",
    what: "Tells the reviewer that work is waiting for them.",
    subject: "Ready for your review: {service} for {client}",
    body: `{reviewer},

{byName} has sent {service} for {client}, {period}, for your review.

{dueLine}

{link}`,
  },

  engagementReworked: {
    key: "engagementReworked",
    audience: "team",
    what: "Tells the person who did the work that it has come back.",
    subject: "Back to you: {service} for {client}",
    body: `{assignee},

{byName} has sent {service} for {client}, {period}, back for rework.

What needs doing:
{reason}

{link}`,
  },

  /**
   * A file the client sent cannot be used (P3-2).
   *
   * The reason is the whole message. A client told "rejected" sends the same
   * wrong file again; a client told "these are August challans, we need
   * September" sends the right one.
   */
  checklistReplacement: {
    key: "checklistReplacement",
    audience: "client",
    what: "Tells the client a document has to be sent again, and why.",
    subject: "We need another copy of {item} — {client}",
    body: `Dear {clientName},

Thank you for sending {item} for {service}, {period}. We cannot use this copy:

{reason}

Please send a replacement when you can. The upload link in our earlier message still works, or reply to this email with the file attached.

If anything about that is unclear, just ask.

Thank you,
{firm}`,
  },

  /** An answer to a question the client asked about one request (P3-2). */
  checklistAnswer: {
    key: "checklistAnswer",
    audience: "client",
    what: "Answers a question the client asked about a document request.",
    subject: "About {item} — {client}",
    body: `Dear {clientName},

You asked about {item} for {service}, {period}:

{question}

{answer}

Thank you,
{firm}`,
  },

  invoiceIssued: {
    key: "invoiceIssued",
    audience: "client",
    what: "Sends an invoice to the client, with the PDF attached.",
    subject: "Invoice {number} from {firm}",
    body: `Dear {clientName},

Please find attached our invoice {number} dated {date} for {total}.

{dueLine}

If anything on it needs explaining, reply to this email and we will come back to you.

Thank you,
{firm}
Chartered Accountants`,
  },

  paymentReceived: {
    key: "paymentReceived",
    audience: "client",
    what: "Acknowledges money received.",
    subject: "Received with thanks — {amount}",
    body: `Dear {clientName},

We have received {amount} on {date}{referenceLine}. Thank you.

{balanceLine}

{firm}
Chartered Accountants`,
  },

  paymentReceivedInternal: {
    key: "paymentReceivedInternal",
    audience: "team",
    what: "Tells the client partner that a client has paid.",
    subject: "{client} has paid {amount}",
    body: `{partner},

{amount} received from {client} on {date}{referenceLine}.

{balanceLine}

{link}`,
  },

  // --- the timed ones (Step 9b) -------------------------------------------

  internalDueSoon: {
    key: "internalDueSoon",
    audience: "team",
    what: "Reminds the assignee that our own target date is coming up.",
    subject: "Due {daysWord}: {service} for {client}",
    body: `{assignee},

{service} for {client}, {period}, is on our own target for {date} — {daysWord}.

{link}`,
  },

  /**
   * The lead nobody has rung (owner request, 04-11-2026).
   *
   * `{lead}` and not `{name}`: the person fields are merged over the values
   * in `compose`, so `{name}` is always *the recipient* — using it for the
   * lead would have addressed the email to itself.
   *
   * `{contact}` and `{remarks}` are composed by the sweep. Either may come
   * out empty, and an empty one prints as nothing and takes its blank line
   * with it.
   */
  potentialFollowUp: {
    key: "potentialFollowUp",
    audience: "team",
    what: "Reminds whoever wrote a lead down that the call they set is due.",
    subject: "Due a call {daysWord}: {lead}",
    body: `{name},

{lead} is due a call. You set {date} on the potential register — {daysWord}.

{contact}
{remarks}

{link}`,
  },

  statutoryDueSoon: {
    key: "statutoryDueSoon",
    audience: "team",
    what: "Warns that a statutory date is near and the work is not filed.",
    subject: "Statutory due {daysWord}: {service} for {client}",
    body: `{name},

{service} for {client}, {period}, is due on {date} — {daysWord} — and is still at "{status}".

{link}`,
  },

  engagementOverdue: {
    key: "engagementOverdue",
    audience: "team",
    what: "Chases work that has passed its date, once a day.",
    subject: "Overdue by {daysWord}: {service} for {client}",
    body: `{name},

{service} for {client}, {period}, was due on {date} and is {daysWord} overdue. It is at "{status}".

If the date has moved or the work is not ours to do, say so on the engagement so it stops appearing here.

{link}`,
  },

  documentsPending: {
    key: "documentsPending",
    audience: "client",
    what: "Reminds a client about documents we are still waiting for.",
    subject: "Still awaited: {count} document(s)",
    body: `Dear {clientName},

We are still waiting for the following to carry on with your work:

{items}

You can upload them here, no login needed:

{link}

The link works for seven days. If you have already sent any of these by email or WhatsApp, please ignore that line.

{firm}
Chartered Accountants`,
  },

  invoiceReminder: {
    key: "invoiceReminder",
    audience: "client",
    what: "Reminds a client about an invoice that is unpaid.",
    subject: "Reminder: invoice {number} — {amount} outstanding",
    body: `Dear {clientName},

Our invoice {number} shows {amount} outstanding. {whenLine}

If it has already been paid, or if something on it needs looking at, reply to this email and we will sort it out.

Thank you,
{firm}
Chartered Accountants`,
  },

  dailyDigest: {
    key: "dailyDigest",
    audience: "team",
    what: "The 9 AM list: what is due today, what is late, what awaits review.",
    subject: "Your day — {date}",
    body: `{name},

{lines}

{link}`,
  },

  weeklySummary: {
    key: "weeklySummary",
    audience: "team",
    what: "Monday morning summary for the partners.",
    subject: "The week at {firm} — {date}",
    body: `{name},

{lines}

{link}`,
  },

  documentRequest: {
    key: "documentRequest",
    audience: "client",
    what: "Sends a client the upload link when the firm asks for documents.",
    subject: "Documents needed for {service}",
    body: `Dear {clientName},

To carry on with {service}, we need the following from you:

{items}

Please upload them here — no login or password needed:

{link}

The link works for seven days.{messageLine}

{firm}
Chartered Accountants`,
  },

  dscExpiring: {
    key: "dscExpiring",
    audience: "team",
    what: "Warns the firm that a client's digital signature certificate is about to expire.",
    subject: "{client}: {holder}'s DSC expires {date}",
    body: `{holder}'s digital signature certificate ({holderRole}, {client}) is running out.

{whenLine}

We cannot renew it for them, but a filing stopped on the last day because nobody noticed is avoidable. Worth a call.

{link}`,
  },

  // --- the client portal (P2-9b) ------------------------------------------
  /**
   * A client has asked for something on their record to be corrected. The
   * only message in this file whose cause is somebody outside the firm.
   */
  /**
   * Somebody was named in a conversation about a job (P3-17a).
   *
   * This is the template that should have existed since Step 9: mentions
   * have been collected on every comment since Step 5 and the line in
   * `addEngagementComment` promised they would be notified. They were not.
   */
  mentioned: {
    key: "mentioned",
    audience: "team",
    what: "Tells somebody they were named in a comment on a job.",
    subject: "{who} mentioned you: {job}",
    body: `{who} wrote on {job} for {client}:

{body}

{link}`,
  },

  /**
   * A person writing to a colleague in their own words, from the record
   * the message is about (P3-17a).
   *
   * Free text rather than a form, because the alternative is the same
   * sentence typed into Outlook where the firm has no record of it. The
   * sender signs it, not the system.
   */
  messageToTeam: {
    key: "messageToTeam",
    audience: "team",
    what: "A message one member of staff writes to another from a job or a client record.",
    subject: "{subject}",
    body: `{body}

— {from}
{job}

{link}`,
  },

  /**
   * The same, to a client. `audience: "client"` is what puts it behind the
   * client-email switch and the guard (Step 9b), so nothing reaches a
   * client by this route that would not reach them by any other.
   */
  messageToClient: {
    key: "messageToClient",
    audience: "client",
    what: "A message a member of staff writes to a client from a job or a client record.",
    subject: "{subject}",
    body: `Dear {name},

{body}

{from}
{firm}`,
  },

  /**
   * A message written on the with-client half of a job's conversation
   * (P3-17b).
   *
   * Its own template rather than a reuse of `messageToClient`, because the
   * firm may want to word a conversation differently from a one-off note,
   * and because switching one off should not switch off the other.
   */
  clientThreadMessage: {
    key: "clientThreadMessage",
    audience: "client",
    what: "Sends the client a message somebody wrote on the with-client side of a job's conversation.",
    subject: "{job}: a message from {firm}",
    body: `Dear {name},

{body}

You can reply to this email, or in your portal under Your work.

{from}
{firm}`,
  },

  /**
   * A document the firm has issued, sent to the client (03-11-2026).
   *
   * The words go **in the body of the email**, not as an attachment. The
   * letters this sends are short — a confirmation, a computation summary,
   * a reply to a notice — and a client reading one on a phone should not
   * have to open a file to see it. The signed PDF is still there on the
   * job for anybody who needs the document itself.
   *
   * Its own template rather than a reuse of `clientThreadMessage`, so the
   * firm can word a document differently from a chat message and switch
   * one off without the other.
   */
  clientDocument: {
    key: "clientDocument",
    audience: "client",
    what: "Sends the client a document the firm has issued, with its wording in the email.",
    subject: "{title}",
    body: `Dear {name},

{note}

{body}

{from}
{firm}`,
  },

  /** The client wrote back. */
  clientReplied: {
    key: "clientReplied",
    audience: "team",
    what: "Tells the people on a job that the client has replied on its conversation.",
    subject: "{client} replied: {job}",
    body: `{who} at {client} wrote on {job}:

{body}

{link}`,
  },

  /**
   * An announcement the firm has posted (P3-17b). Mail as well as the
   * inbox, because the ones that matter — the office is closed on Friday,
   * the new GST process starts Monday — are the ones somebody reads on
   * their phone.
   */
  announcement: {
    key: "announcement",
    audience: "team",
    what: "Tells staff about an announcement a partner has posted.",
    subject: "{title}",
    body: `{body}

{ackLine}

— {who}
{link}`,
  },

  /**
   * The fees a new client was taken on at (06-11-2026).
   *
   * Sent once, at the end of onboarding, from the services and fees the
   * wizard collected — so the client has in writing what the firm believes
   * was agreed, on the day it was agreed, rather than finding out at the
   * first invoice. `{services}` and `{totals}` are built by
   * `lib/clients/quotation.js`, which never adds fees of different billing
   * bases together.
   *
   * The wording is the firm's to change in Settings → Messages like every
   * other template here. What it must not become is a bill: it quotes, and
   * it says how long the quote stands.
   */
  quotation: {
    key: "quotation",
    audience: "client",
    what: "Sends a new client the services and fees agreed when they were taken on.",
    subject: "{firm}: our fees for {client}",
    body: `Dear {name},

Thank you for appointing {firm}. For {client} we have noted the following services and fees:

{services}

{totals}

Fees are exclusive of GST and of government fees, which are charged at actuals, unless a line above says otherwise. This quotation holds for 30 days from today.

{unpricedLine}

If any of this reads differently from what we discussed, tell us before the first invoice and we will put it right.

{from}
{firm}`,
  },

  clientChangeRequest: {
    key: "clientChangeRequest",
    audience: "team",
    what: "Tells the client partner that a client has asked for a correction to their record through the portal.",
    subject: "{client}: {who} has asked for a correction",
    body: `{who} ({designation}) has asked us to correct something on {client}'s record:

{body}

Nothing has been changed. Read it, make the correction if it is right, and tell them either way.

{link}`,
  },
};

/**
 * Build one message from a template and its data.
 *
 * @param {string} key
 * @param {Record<string, any>} values
 * @param {Record<string, {subject?: string, body?: string}>} [overrides]
 *        the firm's own wording, from settings
 */
export function compose(key, values, overrides = {}) {
  const template = TEMPLATES[key];
  if (!template) throw new Error(`No such message template: ${key}`);

  const custom = overrides[key] ?? {};
  /**
   * `{firm}` signs every message. The caller passes the firm's own record
   * (P2-6); the fallback is the name this file carried before there was a
   * settings screen, so a message is never signed "{firm}" because somebody
   * forgot to look it up.
   */
  const withFirm = { firm: FIRM_DEFAULTS.name, ...values };

  /**
   * The placeholders nothing filled. Collected from the template as it is
   * filled, not by scanning the finished message, so a client's own words
   * containing braces are never mistaken for one. A message with any of
   * these is marked failed instead of being sent (QA 09-11-2026, #15).
   */
  const missing = new Set();

  return {
    key,
    audience: template.audience,
    subject: fill(custom.subject || template.subject, withFirm, missing),
    text: fill(custom.body || template.body, withFirm, missing),
    unfilled: [...missing],
  };
}

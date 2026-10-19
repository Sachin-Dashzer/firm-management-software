// @ts-check

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

/** @param {string} text @param {Record<string, any>} values */
export function fill(text, values) {
  return String(text ?? "").replace(/\{(\w+)\}/g, (whole, key) => {
    const value = values[key];
    return value === undefined || value === null || value === ""
      ? whole
      : String(value);
  });
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

  invoiceIssued: {
    key: "invoiceIssued",
    audience: "client",
    what: "Sends an invoice to the client, with the PDF attached.",
    subject: "Invoice {number} from PHMG & Associates",
    body: `Dear {clientName},

Please find attached our invoice {number} dated {date} for {total}.

{dueLine}

If anything on it needs explaining, reply to this email and we will come back to you.

Thank you,
PHMG & Associates
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

PHMG & Associates
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

PHMG & Associates
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
PHMG & Associates
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
    subject: "The week at PHMG — {date}",
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

PHMG & Associates
Chartered Accountants`,
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
  return {
    key,
    audience: template.audience,
    subject: fill(custom.subject || template.subject, values),
    text: fill(custom.body || template.body, values),
  };
}

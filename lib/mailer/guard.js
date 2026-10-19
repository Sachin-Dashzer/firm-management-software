// @ts-check

/**
 * Who a message is actually allowed to reach.
 *
 * This file exists because of one risk: the database will hold the real
 * email addresses of the firm's clients, and a notification system with a
 * loop in it can mail all of them before anyone notices. A mistake here is
 * not a bug the firm can quietly fix — it is a letter their clients have
 * already read.
 *
 * So client-facing email is **off until it is deliberately switched on**,
 * and while it is off every message is still composed, logged and shown on
 * screen. Nothing is hidden; it simply does not leave the building.
 *
 * Three settings, in order of bluntness:
 *
 *  - `EMAIL_ENABLED=false` stops everything, including internal mail.
 *  - `EMAIL_CLIENTS_ENABLED=false` (the default) stops client mail only.
 *  - `EMAIL_REDIRECT_TO=you@firm.com` sends everything to one address
 *    instead, with the intended recipient in the subject — for trying the
 *    real SMTP path without touching a client.
 */

/** @typedef {"team"|"client"} Audience */

const isOn = (value, fallback = false) => {
  if (value === undefined || value === "") return fallback;
  return value === "1" || String(value).toLowerCase() === "true";
};

export function mailSettings() {
  return {
    // sending at all is on by default: the transport decides whether that
    // means SMTP or the log
    enabled: isOn(process.env.EMAIL_ENABLED, true),
    // but reaching a client is off until someone says otherwise
    clientsEnabled: isOn(process.env.EMAIL_CLIENTS_ENABLED, false),
    redirectTo: (process.env.EMAIL_REDIRECT_TO ?? "").trim(),
    from: process.env.EMAIL_FROM ?? "PHMG & Associates <notices@phmgindia.com>",
  };
}

/**
 * Decide what happens to one message before it is queued.
 *
 * @param {object} message
 * @param {string} message.to
 * @param {Audience} message.audience
 * @param {string} message.subject
 * @returns {{ send: boolean, to: string, subject: string, heldReason?: string }}
 */
export function applyGuard({ to, audience, subject }) {
  const settings = mailSettings();
  const recipient = String(to ?? "").trim();

  if (!recipient || !recipient.includes("@")) {
    return {
      send: false,
      to: recipient,
      subject,
      heldReason: "No email address to send to.",
    };
  }

  if (!settings.enabled) {
    return {
      send: false,
      to: recipient,
      subject,
      heldReason: "Email is switched off for the whole system.",
    };
  }

  if (audience === "client" && !settings.clientsEnabled) {
    return {
      send: false,
      to: recipient,
      subject,
      heldReason:
        "Client email is not switched on yet. The message is logged and visible, but has not been sent.",
    };
  }

  if (settings.redirectTo) {
    // everything goes to one inbox, and says who it was meant for, so a
    // redirected test can never be mistaken for the real thing
    return {
      send: true,
      to: settings.redirectTo,
      subject: `[to ${recipient}] ${subject}`,
    };
  }

  return { send: true, to: recipient, subject };
}

/**
 * How many messages an hour the host will take (spec section 14). Below
 * BigRock's cap, which the firm confirms at go-live.
 */
export const HOURLY_LIMIT = Number(process.env.EMAIL_HOURLY_LIMIT || 100);

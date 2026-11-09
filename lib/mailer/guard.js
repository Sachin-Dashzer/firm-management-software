// @ts-check

import { firmProfile } from "../firm/settings.js";

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
 *  - **client email**, which the firm itself switches on from Settings →
 *    Automation. Off until somebody does. `EMAIL_CLIENTS_ENABLED` is only
 *    the answer until then: see `clientMailAllowed` below.
 *  - `EMAIL_REDIRECT_TO=you@firm.com` sends everything to one address
 *    instead, with the intended recipient in the subject — for trying the
 *    real SMTP path without touching a client. It is applied by
 *    `redirectFor` on the send itself, never when a message is queued.
 *
 * Everything above `clientMailAllowed` is pure and reads only the
 * environment, which is what makes the rule that holds a client's mail
 * testable without a database. The one function that asks the firm is at
 * the bottom, and `applyGuard` takes its answer as an argument rather than
 * fetching it, so a message is never held or sent on a value nobody can
 * see in the call.
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
    /**
     * Where a reply goes.
     *
     * `notices@` is a sending mailbox and nobody opens it, so until this
     * was set a client who pressed Reply — which the thread template
     * invites them to do — was writing into a drawer nobody opens. Blank
     * means no `Reply-To` header at all, which is the behaviour this had
     * before: replies land in `notices@` and wait for somebody to think of
     * looking.
     */
    replyTo: (process.env.EMAIL_REPLY_TO ?? "").trim(),
  };
}

/**
 * Decide what happens to one message before it is queued.
 *
 * @param {object} message
 * @param {string} message.to
 * @param {Audience} message.audience
 * @param {string} message.subject
 * @param {boolean} [message.clientsEnabled] the firm's answer, from
 *        `clientMailAllowed()`. Left out, the environment answers — which
 *        is off by default, so forgetting it holds a message rather than
 *        sending one.
 * @returns {{ send: boolean, to: string, subject: string, heldReason?: string }}
 */
export function applyGuard({ to, audience, subject, clientsEnabled }) {
  const settings = mailSettings();
  const mayReachClients = clientsEnabled ?? settings.clientsEnabled;
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

  if (audience === "client" && !mayReachClients) {
    return {
      send: false,
      to: recipient,
      subject,
      heldReason:
        "Client email is not switched on yet. The message is logged and visible, but has not been sent.",
    };
  }

  /*
   * The test redirect is deliberately *not* applied here. This runs when a
   * message is queued, in the web process; the redirect belongs on the
   * send itself, which happens minutes later in the job runner — see
   * `redirectFor` below. Applying it at queue time meant a message queued
   * before the redirect was switched on went to the real client anyway
   * (QA 09-11-2026, #2).
   */
  return { send: true, to: recipient, subject };
}

/**
 * Where a message actually goes, decided at the moment it is posted.
 *
 * The **one** place `EMAIL_REDIRECT_TO` is applied. Every message — team
 * or client, every template, attachments and all — passes through here
 * because `sendMail` calls it and nothing else sends.
 *
 * @param {{to: string, subject: string}} message
 * @returns {{to: string, subject: string, intended: string, redirected: boolean}}
 */
export function redirectFor({ to, subject }) {
  const { redirectTo } = mailSettings();
  const intended = String(to ?? "").trim();

  if (!redirectTo) {
    return { to: intended, subject, intended, redirected: false };
  }

  // one inbox, and it says who it was meant for, so a redirected test can
  // never be mistaken for the real thing
  return {
    to: redirectTo,
    subject: `[to ${intended}] ${subject}`,
    intended,
    redirected: true,
  };
}

/**
 * How many messages an hour the host will take (spec section 14). Below
 * BigRock's cap, which the firm confirms at go-live.
 */
export const HOURLY_LIMIT = Number(process.env.EMAIL_HOURLY_LIMIT || 100);

/**
 * May a client be written to at all? **The firm's own switch** (04-11-2026).
 *
 * It used to be `EMAIL_CLIENTS_ENABLED` and only that, so the single line
 * between "composed, logged, undelivered" and "the client has read it" sat
 * in the Vercel dashboard, needed a redeploy, and left no audit entry. It
 * is now a switch on Settings → Automation, thrown by a partner, audited
 * like every other change.
 *
 * The environment variable is what answers **until the firm has said**, the
 * same way the notification rules keep their defaults in code: a
 * deployment that has never opened the screen behaves exactly as it did
 * before this existed. Once the switch is thrown either way, it is the
 * answer and the variable is ignored.
 *
 * Costs nothing to ask: the firm's record is the same one-minute cache that
 * every invoice and email signature already reads.
 *
 * @returns {Promise<boolean>}
 */
export async function clientMailAllowed() {
  return clientMailFrom(await firmProfile());
}

/**
 * The same answer, from a firm record the caller has already read.
 *
 * The Automation screen reads the document directly so its switch shows
 * the firm's own answer the instant it is thrown, rather than up to a
 * minute of cache later. It goes through here so there is one place that
 * knows the environment variable is the fallback — a screen that worked
 * that out for itself is a screen that can disagree with the sender.
 *
 * @param {{clientMailOn?: boolean|null}|null} [firm]
 */
export function clientMailFrom(firm) {
  return typeof firm?.clientMailOn === "boolean"
    ? firm.clientMailOn
    : mailSettings().clientsEnabled;
}

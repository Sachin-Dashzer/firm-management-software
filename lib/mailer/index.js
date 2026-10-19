// @ts-check

import nodemailer from "nodemailer";
import { mailSettings } from "./guard.js";

/**
 * The mail adapter (spec section 14).
 *
 * Two transports behind one call. `smtp` is the firm's cPanel mailbox;
 * `log` writes the message to the console and returns success, which is
 * what development and the tests use — so nothing in this step waits on
 * the mailbox existing, and a test run can never post a letter.
 *
 * Moving to Microsoft 365 or a transactional service later means adding a
 * third transport here and changing one environment variable, as spec
 * section 14 intends.
 */

export function transportName() {
  if (process.env.EMAIL_TRANSPORT) return process.env.EMAIL_TRANSPORT;
  return process.env.SMTP_HOST ? "smtp" : "log";
}

let cached = null;

function smtpTransport() {
  if (cached) return cached;

  const host = process.env.SMTP_HOST;
  if (!host) throw new Error("SMTP_HOST is not set (see .env.example)");

  cached = nodemailer.createTransport({
    host,
    // 465 with TLS, as spec section 14 specifies for cPanel
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
    // a cPanel box is not fast; fail rather than hold a job open
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });

  return cached;
}

/**
 * Send one message. Called only by the job runner, never by a screen.
 *
 * @param {object} message
 * @param {string} message.to
 * @param {string} message.subject
 * @param {string} message.text
 * @param {string} [message.html]
 * @param {Array<{filename: string, content: Buffer, contentType?: string}>} [message.attachments]
 * @returns {Promise<{ sent: boolean, via: string, id?: string }>}
 */
export async function sendMail(message) {
  const via = transportName();
  const { from } = mailSettings();

  if (via === "log") {
    // the whole message, so a developer can read exactly what a client
    // would have received
    console.log(
      [
        "─── email (not sent: log transport) ───",
        `To:      ${message.to}`,
        `Subject: ${message.subject}`,
        message.attachments?.length
          ? `Files:   ${message.attachments.map((a) => a.filename).join(", ")}`
          : null,
        "",
        message.text,
        "───────────────────────────────────────",
      ]
        .filter(Boolean)
        .join("\n"),
    );
    return { sent: true, via: "log" };
  }

  const info = await smtpTransport().sendMail({
    from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    attachments: message.attachments,
  });

  return { sent: true, via: "smtp", id: info.messageId };
}

/** Check the mailbox works, for the settings screen. */
export async function verifyTransport() {
  if (transportName() === "log") {
    return {
      ok: true,
      via: "log",
      note: "No SMTP server is configured, so messages are written to the log instead of being sent.",
    };
  }
  try {
    await smtpTransport().verify();
    return { ok: true, via: "smtp", note: "The mailbox answered." };
  } catch (err) {
    return { ok: false, via: "smtp", note: err.message };
  }
}

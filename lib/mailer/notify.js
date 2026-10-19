// @ts-check

import Notification from "../../models/Notification.js";
import MessageLog from "../../models/MessageLog.js";
import User from "../../models/User.js";
import { enqueue } from "../jobs/queue.js";
import { compose } from "./templates.js";
import { applyGuard } from "./guard.js";
import { loadRules, overridesFrom } from "./rules.js";

/**
 * The one way the system tells anybody anything (spec section 12).
 *
 * Two things happen per recipient: a row in `notifications` for the bell,
 * and — if the rule says email too — a `messageLogs` row plus a job to
 * send it. Nothing sends inline, so a slow or dead mailbox can never make
 * saving an engagement slow or fail.
 *
 * The order matters. The log row is written *before* anything else, so a
 * message can never be sent without a record of it existing; the job
 * fills in what happened afterwards. It is also what makes `dedupeKey`
 * work: a reminder that has gone once collides with the unique index and
 * stops right there, before anybody is nudged twice.
 */

/**
 * @param {object} input
 * @param {string} input.template     key in templates.js
 * @param {Array<{id?: string, email?: string, name?: string}>} input.to
 * @param {Record<string, any>} input.values
 * @param {object} [input.about]      what this concerns
 * @param {boolean} [input.inApp]     default true
 * @param {boolean} [input.email]     default true
 * @param {Array<object>} [input.attachments]
 * @param {string} [input.dedupeKey]  for the scheduled sweeps: one message
 *        per key, ever. Pass one recipient at a time when using it.
 * @param {import("mongoose").ClientSession} [session]
 */
export async function notify(input, session) {
  const {
    template,
    to = [],
    values = {},
    about = {},
    inApp = true,
    email = true,
    attachments,
    dedupeKey,
  } = input;

  // the firm can switch any rule off and reword any of them; both live in
  // the same place (spec section 12)
  const rules = await loadRules();
  if (rules[template] && !rules[template].enabled) {
    return [{ status: "off" }];
  }
  const overrides = overridesFrom(rules);

  const results = [];

  for (const person of to) {
    if (!person) continue;

    const message = compose(template, { ...values, ...person }, overrides);

    let log = null;

    if (email && person.email) {
      const guard = applyGuard({
        to: person.email,
        audience: message.audience,
        subject: message.subject,
      });

      try {
        [log] = await MessageLog.create(
          [
            {
              channel: "email",
              template,
              audience: message.audience,
              to: person.email,
              sentTo: guard.send ? guard.to : "",
              subject: guard.subject,
              body: message.text,
              status: guard.send ? "queued" : "held",
              heldReason: guard.heldReason ?? "",
              dedupeKey: dedupeKey ?? null,
              clientId: about.clientId ?? null,
              userId: person.id ?? null,
              entityType: about.entityType ?? "",
              entityId: about.entityId ?? null,
            },
          ],
          { session },
        );
      } catch (err) {
        // the key is already there: this one has been sent once already
        if (err?.code === 11000) {
          results.push({ to: person.email, status: "duplicate" });
          continue;
        }
        throw err;
      }
    }

    if (inApp && person.id) {
      await Notification.create(
        [
          {
            userId: person.id,
            type: template,
            title: message.subject,
            // the bell shows a line, not an essay
            body: message.text.split("\n\n")[1] ?? "",
            href: about.href ?? "",
            entityType: about.entityType ?? "",
            entityId: about.entityId ?? null,
            clientId: about.clientId ?? null,
          },
        ],
        { session },
      );
    }

    if (!log) continue;

    if (log.status === "queued") {
      // queued after the log exists, so there is always a record first
      await enqueue(
        "sendMail",
        { messageLogId: String(log._id), attachments },
        { maxAttempts: 3 },
      );
    }

    results.push({ to: person.email, status: log.status });
  }

  return results;
}

/**
 * Turn user ids into people the dispatcher can address, dropping anyone
 * deactivated and anyone appearing twice.
 *
 * @param {Array<string|null|undefined>} ids
 * @param {{ exclude?: string }} [options] usually the person who acted:
 *        nobody needs an email telling them what they just did
 */
export async function peopleFor(ids, options = {}) {
  const wanted = [...new Set(ids.filter(Boolean).map(String))].filter(
    (id) => id !== options.exclude,
  );

  if (wanted.length === 0) return [];

  const users = await User.find({ _id: { $in: wanted }, active: true })
    .select("name email")
    .lean();

  return users.map((user) => ({
    id: String(user._id),
    name: user.name,
    email: user.email,
    // templates address people by role as well as by name
    assignee: user.name,
    reviewer: user.name,
    partner: user.name,
  }));
}

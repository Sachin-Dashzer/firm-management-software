"use server";

import { requireUser } from "@/auth";
import { assertCan, can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Engagement from "@/models/Engagement";
import Client from "@/models/Client";
import User from "@/models/User";
import { notify } from "@/lib/mailer/notify";
import { loadRules, overridesFrom } from "@/lib/mailer/rules";
import { firmName } from "@/lib/firm/settings";
import { messagesFor, checkMessage } from "@/lib/mailer/message";

/**
 * Notify: one action, with a preview of every message (P3-17a).
 *
 * Two server functions and **one builder**. The preview and the send both
 * call `messagesFor`, so what somebody reads before pressing send is the
 * text that goes out — a preview assembled by a second code path is a
 * preview that eventually lies.
 *
 * Free text, from the sender's own name (owner's default, 27-10-2026). The
 * alternative is not "no free text": it is the same sentence typed into
 * Outlook, where the firm has no record of it. Here it is logged in
 * `messageLogs` like everything else, and a client-facing one carries
 * `audience: "client"`, so the client-email switch and the guard apply
 * exactly as they do to an invoice.
 */

/** Load the engagement and the people who could reasonably be told. */
async function load(actor, id) {
  await connectDB();
  const engagement = await Engagement.findById(id)
    .select(
      "clientId branchId assigneeId reviewerId code periodLabel period templateSnapshot",
    )
    .lean();
  if (!engagement) {
    const err = new Error("That engagement no longer exists.");
    err.code = "NOT_FOUND";
    throw err;
  }

  assertCan(actor, "view", "engagementsWork", {
    branchId: String(engagement.branchId),
    assigneeId: String(engagement.assigneeId ?? ""),
    reviewerId: String(engagement.reviewerId ?? ""),
  });

  return engagement;
}

/**
 * Everybody this job could be talked about with, each with why they are on
 * the list — a name alone leaves the sender guessing which Priya it is.
 *
 * The client's own contacts appear only for somebody who may write to
 * clients, and only when they have an email address.
 */
export async function notifyAudience(id) {
  const actor = await requireUser();
  const engagement = await load(actor, id);

  const client = await Client.findById(engagement.clientId)
    .select(
      "legalName tradeName contacts clientPartnerId relationshipManagerId",
    )
    .lean();

  const staffIds = [
    [engagement.assigneeId, "Doing the work"],
    [engagement.reviewerId, "Reviewing it"],
    [client?.clientPartnerId, "Client partner"],
    [client?.relationshipManagerId, "Relationship manager"],
  ].filter(([personId]) => personId);

  const staff = await User.find({
    _id: { $in: staffIds.map(([personId]) => personId) },
    active: true,
  })
    .select("name email")
    .lean();

  const why = new Map(
    staffIds.map(([personId, reason]) => [String(personId), reason]),
  );

  const recipients = staff
    .filter((person) => String(person._id) !== actor.id)
    .map((person) => ({
      id: String(person._id),
      name: person.name,
      email: person.email ?? "",
      side: "team",
      why: why.get(String(person._id)) ?? "On the job",
    }));

  /**
   * Writing to the client is an `edit` on clients — the same bar as
   * changing their record, because a message from the firm is the firm
   * speaking to them.
   */
  if (
    can(actor, "edit", "clients", { branchId: String(engagement.branchId) })
  ) {
    for (const contact of client?.contacts ?? []) {
      if (!contact.email) continue;
      recipients.push({
        id: `contact:${contact._id}`,
        name: contact.name,
        email: contact.email,
        side: "client",
        why: `${client.tradeName || client.legalName}${contact.designation ? ` · ${contact.designation}` : ""}`,
      });
    }
  }

  return {
    job: `${engagement.templateSnapshot?.name ?? "Work"} ${engagement.periodLabel || engagement.period || ""}`.trim(),
    client: client?.tradeName || client?.legalName || "the client",
    recipients,
  };
}

/** Which of the audience was ticked, in the order the audience gives them. */
async function chosen(actor, id, formData) {
  const audience = await notifyAudience(id);
  const picked = new Set(formData.getAll("to").map(String));
  return {
    ...audience,
    recipients: audience.recipients.filter((person) => picked.has(person.id)),
  };
}

const appUrl = () =>
  (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );

/**
 * What would be sent. Nothing is written, nothing is queued; this is the
 * same builder the send uses, run for the screen.
 */
export async function previewNotify(id, formData) {
  const actor = await requireUser();
  const { recipients, job } = await chosen(actor, id, formData);

  const subject = String(formData.get("subject") ?? "");
  const body = String(formData.get("body") ?? "");

  const problem = checkMessage({ subject, body, recipients });
  if (problem) return { error: problem };

  const [rules, firm] = await Promise.all([loadRules(), firmName()]);

  return {
    messages: messagesFor({
      recipients,
      subject,
      body,
      from: actor.name,
      job,
      firm,
      link: `${appUrl()}/engagements/${id}`,
      overrides: overridesFrom(rules),
    }),
  };
}

/** Send it. The same builder, then the ordinary mail path. */
export async function sendNotify(id, formData) {
  const actor = await requireUser();
  const engagement = await load(actor, id);
  const { recipients, job } = await chosen(actor, id, formData);

  const subject = String(formData.get("subject") ?? "");
  const body = String(formData.get("body") ?? "");

  const problem = checkMessage({ subject, body, recipients });
  if (problem) return { error: problem };

  const [rules, firm] = await Promise.all([loadRules(), firmName()]);
  const messages = messagesFor({
    recipients,
    subject,
    body,
    from: actor.name,
    job,
    firm,
    link: `${appUrl()}/engagements/${id}`,
    overrides: overridesFrom(rules),
  });

  /**
   * One call per template, so the two audiences keep their own rule and
   * their own guard. `notify` composes from the same template with the
   * same values, which is why the preview above is the truth.
   */
  const results = [];
  for (const group of ["messageToTeam", "messageToClient"]) {
    const some = messages.filter((message) => message.template === group);
    if (!some.length) continue;

    results.push(
      ...(await notify({
        template: group,
        to: some.map((message) => ({
          id: message.side === "team" ? message.id : undefined,
          name: message.name,
          email: message.email,
        })),
        values: {
          subject: subject.trim(),
          body: body.trim(),
          from: actor.name,
          job,
          link: `${appUrl()}/engagements/${id}`,
        },
        about: {
          entityType: "Engagement",
          entityId: engagement._id,
          clientId: engagement.clientId,
          href: `/engagements/${id}`,
        },
        // in-app for colleagues; a client has no bell to ring
        inApp: group === "messageToTeam",
      })),
    );
  }

  const held = results.filter((row) => row.status === "held").length;
  const sent = results.filter((row) => row.status === "queued").length;

  return {
    ok: held
      ? `${sent} sent, ${held} held back — client email is switched off, and what was held is on Settings → Messages.`
      : `${sent} sent.`,
  };
}

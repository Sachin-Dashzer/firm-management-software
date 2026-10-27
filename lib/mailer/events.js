// @ts-check

import Client from "../../models/Client.js";
import { notify, peopleFor } from "./notify.js";
import { formatISTDate } from "../dates.js";
import { formatPaise } from "../money.js";

/**
 * The five things that tell somebody something the moment they happen
 * (spec section 12). The scheduled sweeps — due soon, overdue, digests —
 * are Step 9b.
 *
 * Kept out of the server actions themselves so the actions stay about the
 * work and this stays about the telling, and so a change to the wording
 * or the audience never means editing the engagement pipeline.
 *
 * Every one of these takes the open session: a notification is written in
 * the same transaction as the thing it describes, so nobody is ever told
 * about a change that was rolled back.
 */

const appUrl = () =>
  (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );

/** The line about when it is due, or an honest silence. */
function dueLine(engagement) {
  if (engagement.statutoryDue) {
    return `Due ${formatISTDate(engagement.statutoryDue)} (statutory).`;
  }
  if (engagement.internalDue) {
    return `Our target is ${formatISTDate(engagement.internalDue)}.`;
  }
  return "No due date has been set for it yet.";
}

async function engagementValues(engagement, actor) {
  const client = await Client.findById(engagement.clientId)
    .select("legalName tradeName")
    .lean();

  return {
    client: client?.tradeName || client?.legalName || "the client",
    service: engagement.templateSnapshot?.name ?? "work",
    period: engagement.periodLabel || engagement.period,
    byName: actor?.name ?? "Someone",
    dueLine: dueLine(engagement),
    link: `${appUrl()}/engagements/${engagement._id}`,
  };
}

/** Work has been put on someone's desk. */
export async function engagementAssigned(engagement, actor, session) {
  const people = await peopleFor([engagement.assigneeId], {
    exclude: actor?.id,
  });
  if (people.length === 0) return;

  await notify(
    {
      template: "engagementAssigned",
      to: people,
      values: await engagementValues(engagement, actor),
      about: {
        entityType: "Engagement",
        entityId: engagement._id,
        clientId: engagement.clientId,
        href: `/engagements/${engagement._id}`,
      },
    },
    session,
  );
}

/** It has gone for review. */
export async function engagementForReview(engagement, actor, session) {
  const people = await peopleFor([engagement.reviewerId], {
    exclude: actor?.id,
  });
  if (people.length === 0) return;

  await notify(
    {
      template: "engagementForReview",
      to: people,
      values: await engagementValues(engagement, actor),
      about: {
        entityType: "Engagement",
        entityId: engagement._id,
        clientId: engagement.clientId,
        href: `/engagements/${engagement._id}`,
      },
    },
    session,
  );
}

/** It has come back. */
export async function engagementReworked(engagement, actor, reason, session) {
  const people = await peopleFor([engagement.assigneeId], {
    exclude: actor?.id,
  });
  if (people.length === 0) return;

  await notify(
    {
      template: "engagementReworked",
      to: people,
      values: {
        ...(await engagementValues(engagement, actor)),
        reason: reason || "No reason was given.",
      },
      about: {
        entityType: "Engagement",
        entityId: engagement._id,
        clientId: engagement.clientId,
        href: `/engagements/${engagement._id}`,
      },
    },
    session,
  );
}

/**
 * An invoice has been issued. This one goes to a client, so it is held
 * back by the guard until client email is switched on — the PDF is
 * attached by the caller, which has it to hand.
 */
export async function invoiceIssued(invoice, client, attachments, session) {
  const to = client?.invoiceEmail || primaryEmail(client);
  if (!to) return;

  await notify(
    {
      template: "invoiceIssued",
      to: [{ email: to, clientName: client.legalName }],
      values: {
        number: invoice.number,
        date: formatISTDate(invoice.date),
        total: formatPaise(invoice.totalPaise ?? 0),
        dueLine: invoice.dueDate
          ? `Payment is due by ${formatISTDate(invoice.dueDate)}.`
          : "Payment is due on receipt.",
      },
      about: {
        entityType: "Invoice",
        entityId: invoice._id,
        clientId: client._id,
      },
      inApp: false,
      attachments,
    },
    session,
  );
}

/** Money has arrived: the client is thanked, the partner is told. */
export async function paymentReceived(payment, client, balancePaise, session) {
  const values = {
    clientName: client.legalName,
    client: client.tradeName || client.legalName,
    amount: formatPaise(payment.amountPaise ?? 0),
    date: formatISTDate(payment.date),
    referenceLine: payment.reference ? ` (${payment.reference})` : "",
    balanceLine:
      balancePaise > 0
        ? `${formatPaise(balancePaise)} remains outstanding.`
        : "Nothing further is outstanding.",
    link: `${appUrl()}/clients/${client._id}?tab=invoices`,
  };

  const to = client?.invoiceEmail || primaryEmail(client);
  if (to) {
    await notify(
      {
        template: "paymentReceived",
        to: [{ email: to, clientName: client.legalName }],
        values,
        about: {
          entityType: "Payment",
          entityId: payment._id,
          clientId: client._id,
        },
        inApp: false,
      },
      session,
    );
  }

  const partners = await peopleFor([client.clientPartnerId]);
  if (partners.length > 0) {
    await notify(
      {
        template: "paymentReceivedInternal",
        to: partners,
        values,
        about: {
          entityType: "Payment",
          entityId: payment._id,
          clientId: client._id,
          href: `/clients/${client._id}?tab=invoices`,
        },
      },
      session,
    );
  }
}

function primaryEmail(client) {
  const contacts = client?.contacts ?? [];
  const primary = contacts.find((c) => c.primary) ?? contacts[0];
  return primary?.email ?? "";
}

/**
 * A document the client sent cannot be used (P3-2).
 *
 * The reason is the message. Held back by the client-email guard like every
 * other client-facing template until the owner switches it on — at which
 * point the words a CA typed into "what is wrong with it" are the words the
 * client reads, which is why that field demands a full sentence.
 */
export async function checklistReplacement(engagement, item, session) {
  const client = await Client.findById(engagement.clientId)
    .select("legalName tradeName contacts invoiceEmail")
    .lean();
  const to = primaryEmail(client);
  if (!to) return;

  await notify(
    {
      template: "checklistReplacement",
      to: [{ email: to, clientName: client.legalName }],
      values: {
        ...(await engagementValues(engagement, null)),
        item: item.name,
        reason: item.rejectReason,
      },
      about: {
        entityType: "Engagement",
        entityId: engagement._id,
        clientId: engagement.clientId,
      },
      inApp: false,
    },
    session,
  );
}

/** An answer to a question the client asked about one request (P3-2). */
export async function checklistAnswer(engagement, item, session) {
  const client = await Client.findById(engagement.clientId)
    .select("legalName tradeName contacts invoiceEmail")
    .lean();
  const to = primaryEmail(client);
  if (!to) return;

  await notify(
    {
      template: "checklistAnswer",
      to: [{ email: to, clientName: client.legalName }],
      values: {
        ...(await engagementValues(engagement, null)),
        item: item.name,
        question: item.clientReply?.question ?? "",
        answer: item.clientReply?.answer ?? "",
      },
      about: {
        entityType: "Engagement",
        entityId: engagement._id,
        clientId: engagement.clientId,
      },
      inApp: false,
    },
    session,
  );
}

/**
 * Somebody was named in a comment on a job (P3-17a).
 *
 * The one piece of telling that was promised and never built: mentions
 * have been stored on every comment since Step 5, and the line in
 * `addEngagementComment` said Step 9 would notify them. It did not.
 *
 * The body goes in whole rather than trimmed to a line. A mention is read
 * for what it says, and a notification that stops mid-sentence sends
 * people to the screen to find out what they were asked.
 *
 * @param {any} engagement
 * @param {{id: string, name: string}} actor
 * @param {Array<{_id?: any, id?: any, name: string, email?: string}>} mentioned
 * @param {string} body
 * @param {import("mongoose").ClientSession} [session]
 */
export async function commentMentioned(
  engagement,
  actor,
  mentioned,
  body,
  session,
) {
  const people = await peopleFor(
    mentioned.map((person) => String(person._id ?? person.id)),
    { exclude: actor?.id },
  );
  if (people.length === 0) return;

  const values = await engagementValues(engagement, actor);

  return notify(
    {
      template: "mentioned",
      to: people,
      values: {
        ...values,
        who: actor?.name ?? "Somebody",
        job: `${values.service} ${values.period}`.trim(),
        body,
      },
      about: {
        entityType: "Engagement",
        entityId: engagement._id,
        clientId: engagement.clientId,
        href: `/engagements/${engagement._id}`,
      },
    },
    session,
  );
}

/**
 * A message written on the with-client half of a job's conversation
 * (P3-17b).
 *
 * The reason this function exists is that the `internal` flag used to be
 * read by nothing: somebody could untick "Internal only", believe the
 * client had been written to, and be wrong. Now unticking it sends this,
 * and the thread records *when* — because while client email is off the
 * guard holds the message, and "not internal" and "they have it" are
 * different facts.
 *
 * @param {any} engagement
 * @param {any} client a lean client with contacts
 * @param {{id: string, name: string}} actor
 * @param {string} body
 * @param {import("mongoose").ClientSession} [session]
 * @returns {Promise<boolean>} whether anything was actually queued
 */
export async function clientThreadMessage(
  engagement,
  client,
  actor,
  body,
  session,
) {
  const contacts = (client?.contacts ?? []).filter((contact) => contact.email);
  if (contacts.length === 0) return false;

  const values = await engagementValues(engagement, actor);

  const results = await notify(
    {
      template: "clientThreadMessage",
      to: contacts.map((contact) => ({
        name: contact.name,
        email: contact.email,
      })),
      values: {
        ...values,
        job: `${values.service} ${values.period}`.trim(),
        body,
        from: actor?.name ?? "The team",
      },
      about: {
        entityType: "Engagement",
        entityId: engagement._id,
        clientId: engagement.clientId,
      },
      // a client has no bell to ring
      inApp: false,
    },
    session,
  );

  return results.some((row) => row.status === "queued");
}

/**
 * The client wrote back on a job's conversation (P3-17b).
 *
 * Everybody on the job and the client partner, because a client's question
 * sitting unanswered is the thing the firm is judged on — and the person
 * who happens to be on leave is covered by P3-16's rule anyway.
 *
 * @param {any} engagement
 * @param {{name: string, clientName: string}} who
 * @param {string} body
 * @param {import("mongoose").ClientSession} [session]
 */
export async function clientReplied(engagement, who, body, session) {
  const client = await Client.findById(engagement.clientId)
    .select("legalName tradeName clientPartnerId relationshipManagerId")
    .lean();

  const people = await peopleFor([
    engagement.assigneeId,
    engagement.reviewerId,
    client?.clientPartnerId,
    client?.relationshipManagerId,
  ]);
  if (people.length === 0) return;

  const values = await engagementValues(engagement, null);

  return notify(
    {
      template: "clientReplied",
      to: people,
      values: {
        ...values,
        job: `${values.service} ${values.period}`.trim(),
        who: who.name,
        client: who.clientName,
        body,
      },
      about: {
        entityType: "Engagement",
        entityId: engagement._id,
        clientId: engagement.clientId,
        href: `/engagements/${engagement._id}`,
      },
    },
    session,
  );
}

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

import { requireUser } from "@/auth";
import { can, branchFilter, seesOnlyOwnRecords } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Client from "@/models/Client";
import Engagement from "@/models/Engagement";
import Invoice from "@/models/Invoice";
import { formatISTDate } from "@/lib/dates";

/**
 * What the command bar searches (spec section 15: "type a PAN, GSTIN,
 * client name or an action and jump straight there").
 *
 * The important part is not the searching, it is the scoping. This runs
 * the **same conditions the list screens run**, including the intern rule
 * that limits them to work they are assigned to — so the command bar can
 * never become the back door through which somebody finds a client their
 * own list is not allowed to show them (spec section 2, CLAUDE.md rule 1).
 *
 * Deliberately not audited. A keystroke is not an action, and logging
 * every letter somebody types would bury the entries that matter
 * (spec section 11 audits what changes, plus views of documents and
 * credentials). Opening the thing you found is audited where it happens.
 */

export const dynamic = "force-dynamic";

const LIMIT = 6;

export async function GET(request) {
  const actor = await requireUser();
  const url = new URL(request.url);
  const term = String(url.searchParams.get("q") ?? "").trim();

  if (term.length < 2) return Response.json({ groups: [] });

  await connectDB();

  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const loose = new RegExp(escaped, "i");
  const exact = term.replace(/[\s-]/g, "").toUpperCase();
  const digits = term.replace(/\D/g, "");

  const groups = [];

  if (can(actor, "view", "clients")) {
    const query = { ...(branchFilter(actor, "clients") ?? {}) };

    // an employee or intern finds the clients they have work on, and no others
    if (seesOnlyOwnRecords(actor, "clients")) {
      const mine = await Engagement.find({
        $or: [{ assigneeId: actor.id }, { reviewerId: actor.id }],
      }).distinct("clientId");
      query._id = { $in: mine };
    }

    query.$or = [
      { legalName: loose },
      { tradeName: loose },
      { code: loose },
      { pan: exact },
      { "gstins.gstin": exact },
      ...(digits.length >= 6 ? [{ "contacts.mobile": digits }] : []),
    ];

    const clients = await Client.find(query)
      .select("code legalName tradeName pan status")
      .sort({ legalName: 1 })
      .limit(LIMIT)
      .lean();

    if (clients.length > 0) {
      groups.push({
        heading: "Clients",
        items: clients.map((client) => ({
          id: String(client._id),
          title: client.tradeName || client.legalName,
          hint: [client.code, client.status].filter(Boolean).join(" · "),
          href: `/clients/${client._id}`,
        })),
      });
    }
  }

  if (can(actor, "view", "engagementsWork")) {
    const query = { ...(branchFilter(actor, "engagementsWork") ?? {}) };
    if (["employee", "intern"].includes(actor.role)) {
      query.$and = [
        { $or: [{ assigneeId: actor.id }, { reviewerId: actor.id }] },
      ];
    }
    query.$or = [
      { code: loose },
      { "templateSnapshot.name": loose },
      { "templateSnapshot.code": loose },
      { periodLabel: loose },
      { udin: loose },
    ];

    const engagements = await Engagement.find(query)
      .select(
        "code templateSnapshot period periodLabel status clientId statutoryDue",
      )
      .sort({ statutoryDue: 1 })
      .limit(LIMIT)
      .lean();

    if (engagements.length > 0) {
      const clients = await Client.find({
        _id: { $in: engagements.map((e) => e.clientId) },
      })
        .select("legalName tradeName")
        .lean();
      const name = new Map(
        clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
      );

      groups.push({
        heading: "Work",
        items: engagements.map((engagement) => ({
          id: String(engagement._id),
          title: `${engagement.templateSnapshot?.name ?? "Work"} · ${
            engagement.periodLabel || engagement.period
          }`,
          hint: [
            name.get(String(engagement.clientId)),
            engagement.status,
            engagement.statutoryDue
              ? `due ${formatISTDate(engagement.statutoryDue)}`
              : null,
          ]
            .filter(Boolean)
            .join(" · "),
          href: `/engagements/${engagement._id}`,
        })),
      });
    }
  }

  if (can(actor, "view", "invoices")) {
    const invoices = await Invoice.find({
      ...(branchFilter(actor, "invoices") ?? {}),
      $or: [{ number: loose }, { billingName: loose }],
    })
      .select("number date status totalPaise")
      .sort({ date: -1 })
      .limit(LIMIT)
      .lean();

    if (invoices.length > 0) {
      groups.push({
        heading: "Invoices",
        items: invoices.map((invoice) => ({
          id: String(invoice._id),
          title: invoice.number ?? "Draft invoice",
          hint: `${formatISTDate(invoice.date)} · ${invoice.status}`,
          href: `/invoices/${invoice._id}`,
        })),
      });
    }
  }

  return Response.json({ groups });
}

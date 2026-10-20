import { headers } from "next/headers";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Engagement from "@/models/Engagement";
import Client from "@/models/Client";
import Udin from "@/models/Udin";
import User from "@/models/User";
import { buildWorkbook, xlsxResponse } from "@/lib/excel";
import { engagementQuery } from "@/lib/engagements/filter";
import { BOOKS, BOOK_KEYS, COLUMNS, bookRow } from "@/lib/practice/books";
import { financialYearStart, istDate } from "@/lib/dates";
import {
  withAudit,
  recordAudit,
  ACTIONS,
  withAuditContext,
  contextFromRequest,
} from "@/lib/audit";

/**
 * A practice book as a spreadsheet (spec section 14: export on every list).
 *
 * The same query and the same row builder as the screen, so the workbook has
 * the columns the page has and the scoping the page has — including the
 * financial year and the late / not-filed filter.
 */
export async function GET(request, { params }) {
  const { book } = await params;
  if (!BOOK_KEYS.includes(book))
    return new Response("No such book", { status: 404 });
  const definition = BOOKS[book];

  const actor = await requireUser();
  if (!can(actor, "view", "practice")) {
    return new Response("Not allowed", { status: 403 });
  }

  await connectDB();
  const url = new URL(request.url);
  const query = Object.fromEntries(url.searchParams.entries());

  const thisYear = financialYearStart(new Date());
  const asked = Number(query.fy);
  const fyStart =
    Number.isInteger(asked) && asked >= thisYear - 6 && asked <= thisYear
      ? asked
      : thisYear;

  const mongo = engagementQuery(actor, { ...query, closed: "1" });
  mongo["templateSnapshot.category"] = { $in: definition.categories };
  mongo.$and = [
    ...(mongo.$and ?? []),
    {
      $or: [
        {
          periodStart: {
            $gte: istDate(fyStart, 4, 1),
            $lt: istDate(fyStart + 1, 4, 1),
          },
        },
        {
          periodStart: null,
          createdAt: {
            $gte: istDate(fyStart, 4, 1),
            $lt: istDate(fyStart + 1, 4, 1),
          },
        },
      ],
    },
  ];

  const engagements = await Engagement.find(mongo)
    .sort({ statutoryDue: 1, internalDue: 1, createdAt: -1 })
    .limit(20000)
    .lean();

  const [clients, udins] = await Promise.all([
    Client.find({ _id: { $in: engagements.map((e) => e.clientId) } })
      .select("legalName tradeName")
      .lean(),
    definition.columns.includes("member")
      ? Udin.find({
          engagementId: { $in: engagements.map((e) => e._id) },
          revokedAt: null,
        })
          .select("engagementId memberId")
          .lean()
      : [],
  ]);

  const members = await User.find({
    _id: { $in: udins.map((u) => u.memberId).filter(Boolean) },
  })
    .select("name")
    .lean();
  const memberName = new Map(members.map((m) => [String(m._id), m.name]));

  const lookups = {
    clientName: new Map(
      clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
    ),
    signer: new Map(
      udins.map((u) => [
        String(u.engagementId),
        u.memberId ? (memberName.get(String(u.memberId)) ?? "") : "",
      ]),
    ),
  };

  const now = new Date();
  const onlyState = String(query.state ?? "");
  const rows = engagements
    .map((e) => bookRow(e, lookups, now))
    .filter((row) => !onlyState || row.state === onlyState);

  await withAuditContext(
    contextFromRequest(actor, await headers()),
    async () => {
      await withAudit((session) =>
        recordAudit(
          {
            action: ACTIONS.export,
            entityType: "Engagement",
            entityId: `practice/${book}`,
            note: `${rows.length} rows, filters: ${url.search || "none"}`,
          },
          session,
        ),
      );
    },
  );

  const columns = [
    ...definition.columns.map((key) => ({
      header: COLUMNS[key].label,
      kind: COLUMNS[key].kind,
    })),
    { header: "Filing", kind: "text" },
  ];

  const buffer = await buildWorkbook([
    {
      name: definition.title,
      columns,
      rows: rows.map((row) => [
        ...definition.columns.map((key) => row.cells[key] ?? ""),
        row.stateLabel,
      ]),
    },
  ]);
  return xlsxResponse(buffer, `phmg-${book}-${fyStart}`);
}

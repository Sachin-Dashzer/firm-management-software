import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Engagement from "@/models/Engagement";
import Client from "@/models/Client";
import Udin from "@/models/Udin";
import User from "@/models/User";
import { engagementQuery } from "@/lib/engagements/filter";
import { AUDIT_CATEGORIES } from "@/lib/nav/counts";
import { STATUSES } from "@/lib/engagements/status";
import { BOOKS, BOOK_KEYS, COLUMNS, bookRow } from "@/lib/practice/books";
import {
  formatISTDate,
  financialYearStart,
  financialYearLabel,
  istDate,
} from "@/lib/dates";

export const dynamic = "force-dynamic";

const LIMIT = 1000;

export async function generateMetadata({ params }) {
  const { book } = await params;
  const definition = BOOKS[book];
  return { title: definition ? `${definition.title} · PHMG` : "PHMG" };
}

/** How each state reads: the only colour on the page is the one that matters. */
const TONE = {
  late: "text-redpen font-medium",
  overdue: "text-redpen font-medium",
  filed: "text-ink-muted",
  closed: "text-ink-muted",
  open: "text-ink-muted",
};

/**
 * Audits, Statutory and Tax: three books over the same engagements (P2-8a).
 *
 * The book decides which service categories it reads and which columns it
 * shows; everything else — the scoping, the filters, the figures — is the
 * engagement list's, so a register can never show somebody work they are not
 * allowed to see on the list it is drawn from.
 */
export default async function PracticeBookPage({ params, searchParams }) {
  const { book } = await params;
  if (!BOOK_KEYS.includes(book)) notFound();
  const definition = BOOKS[book];

  const actor = await requireUser();
  if (!can(actor, "view", "practice")) redirect("/issues");

  const query = (await searchParams) ?? {};
  const thisYear = financialYearStart(new Date());
  const asked = Number(query.fy);
  const fyStart =
    Number.isInteger(asked) && asked >= thisYear - 6 && asked <= thisYear
      ? asked
      : thisYear;
  const onlyState = String(query.state ?? "");
  /**
   * The five audit categories the menu links to (P3-22a). `auditType` is
   * the firm's own words for the audit, so the match is on the word rather
   * than an enum nobody has agreed — the same rule `navCounts` uses, so the
   * badge and the rows agree.
   */
  const cat = String(query.cat ?? "");

  await connectDB();

  /**
   * The engagement list's own query builder, scoping included — an employee
   * sees their own work and a CA their branches, exactly as on `/engagements`.
   * `closed` is on because a register is a record of what was done, not a
   * worklist: an audit signed in June belongs in the book for ever.
   */
  const mongo = engagementQuery(actor, { ...query, closed: "1" });
  mongo["templateSnapshot.category"] = { $in: definition.categories };
  if (cat && AUDIT_CATEGORIES[cat]) mongo.auditType = AUDIT_CATEGORIES[cat];
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
        // work with no period dates is placed by when it was created, so a
        // one-off certificate does not fall out of every year at once
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
    .limit(LIMIT)
    .lean();

  const [clients, udins] = await Promise.all([
    Client.find({ _id: { $in: engagements.map((e) => e.clientId) } })
      .select("legalName tradeName")
      .lean(),
    // the signing member comes from the UDIN register (P2-7), never a second
    // copy of the fact on the engagement
    definition.columns.includes("member")
      ? Udin.find({
          engagementId: { $in: engagements.map((e) => e._id) },
          revokedAt: null,
        })
          .select("engagementId memberId membershipNo")
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
  const all = engagements.map((e) => bookRow(e, lookups, now));
  const rows = onlyState ? all.filter((r) => r.state === onlyState) : all;

  const counts = {
    late: all.filter((r) => r.state === "late").length,
    overdue: all.filter((r) => r.state === "overdue").length,
  };

  const link = (extra) => {
    const next = new URLSearchParams({ fy: String(fyStart) });
    if (onlyState && !("state" in extra)) next.set("state", onlyState);
    for (const [key, value] of Object.entries(extra)) {
      if (value) next.set(key, value);
    }
    return `/practice/${book}?${next.toString()}`;
  };

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-24 font-bold tracking-tight">
            {definition.title}
          </h1>
          <p className="text-13 text-ink-muted max-w-[70ch]">
            {definition.blurb}
          </p>
        </div>
        <nav className="text-14 flex gap-3">
          {BOOK_KEYS.map((key) => (
            <Link
              key={key}
              href={`/practice/${key}?fy=${fyStart}`}
              aria-current={key === book ? "page" : undefined}
              className={`rounded-ledger border px-3 py-1 ${
                key === book ? "border-carbon bg-carbon-wash" : "border-rule"
              }`}
            >
              {BOOKS[key].title}
            </Link>
          ))}
        </nav>
      </div>

      <div className="text-14 flex flex-wrap items-center gap-3">
        <span className="text-ink-muted">Financial year</span>
        {[thisYear, thisYear - 1, thisYear - 2].map((year) => (
          <Link
            key={year}
            href={link({ fy: String(year) })}
            aria-current={year === fyStart ? "page" : undefined}
            className={`rounded-ledger border px-3 py-1 ${
              year === fyStart ? "border-carbon bg-carbon-wash" : "border-rule"
            }`}
          >
            {financialYearLabel(istDate(year, 6, 1))}
          </Link>
        ))}

        {(counts.late > 0 || counts.overdue > 0) && (
          <span className="border-rule ml-2 flex gap-3 border-l pl-3">
            {counts.overdue > 0 && (
              <Link
                href={link({ state: onlyState === "overdue" ? "" : "overdue" })}
                aria-current={onlyState === "overdue" ? "page" : undefined}
                className={`rounded-ledger border px-3 py-1 ${
                  onlyState === "overdue"
                    ? "border-carbon bg-carbon-wash"
                    : "border-rule"
                }`}
              >
                <span className="num text-redpen font-medium">
                  {counts.overdue}
                </span>{" "}
                past the deadline, not filed
              </Link>
            )}
            {counts.late > 0 && (
              <Link
                href={link({ state: onlyState === "late" ? "" : "late" })}
                aria-current={onlyState === "late" ? "page" : undefined}
                className={`rounded-ledger border px-3 py-1 ${
                  onlyState === "late"
                    ? "border-carbon bg-carbon-wash"
                    : "border-rule"
                }`}
              >
                <span className="num font-medium">{counts.late}</span> filed
                late
              </Link>
            )}
          </span>
        )}

        <Link
          href={`/practice/${book}/export?fy=${fyStart}${
            onlyState ? `&state=${onlyState}` : ""
          }`}
          className="rounded-ledger border-rule ml-auto border px-3 py-1"
        >
          Export
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-14 text-ink-muted rounded-ledger border-rule border border-dashed p-6">
          Nothing in this book for {financialYearLabel(istDate(fyStart, 6, 1))}.
          {onlyState
            ? " Clear the filter above to see the rest of the year."
            : ` A job appears here as soon as a ${definition.categories[0].toLowerCase()} service is set up for a client.`}
        </p>
      ) : (
        <div className="rounded-table border-rule overflow-x-auto border">
          <table className="text-14 w-full border-collapse">
            <caption className="sr-only">
              {definition.title}, {financialYearLabel(istDate(fyStart, 6, 1))}
            </caption>
            <thead>
              <tr className="border-rule bg-surface border-b text-left">
                {definition.columns.map((key) => (
                  <th
                    key={key}
                    scope="col"
                    className="text-13 text-ink-muted px-3 py-2 font-medium"
                  >
                    {COLUMNS[key].label}
                  </th>
                ))}
                <th
                  scope="col"
                  className="text-13 text-ink-muted px-3 py-2 font-medium"
                >
                  Filing
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-rule border-b last:border-0">
                  {definition.columns.map((key) => (
                    <td key={key} className="px-3 py-2 align-top">
                      {key === "code" ? (
                        <Link
                          href={`/engagements/${row.id}`}
                          className="font-mono underline underline-offset-4"
                        >
                          {row.cells.code}
                        </Link>
                      ) : key === "client" ? (
                        <Link
                          href={`/clients/${row.clientId}`}
                          className="underline underline-offset-4"
                        >
                          {row.cells.client}
                        </Link>
                      ) : (
                        <Cell value={row.cells[key]} kind={COLUMNS[key].kind} />
                      )}
                    </td>
                  ))}
                  <td className={`px-3 py-2 align-top ${TONE[row.state]}`}>
                    {row.stateLabel}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {all.length >= LIMIT && (
        <p className="text-13 text-ink-muted">
          Showing the first {LIMIT} rows of this year. Narrow the filters to see
          the rest.
        </p>
      )}

      <p className="text-13 text-ink-muted">
        Statuses here are the engagement&rsquo;s own ({STATUSES.length} of them)
        — this is a view of the work, not a second place to update it. Record a
        filing on the engagement and it appears here.
      </p>
    </div>
  );
}

/** One cell: a date in IST, a number with the ledger figures, or words. */
function Cell({ value, kind }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-ink-muted">—</span>;
  }
  if (kind === "date") return <>{formatISTDate(value)}</>;
  if (kind === "int") {
    return value > 0 ? (
      <span className="num text-redpen">{value}</span>
    ) : (
      <span className="text-ink-muted">—</span>
    );
  }
  return <>{value}</>;
}

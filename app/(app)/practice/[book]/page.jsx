import Link from "next/link";
import Segmented from "@/components/ui/Segmented";
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

  /**
   * The search, which a register of a thousand rows had no way of doing.
   *
   * Server-side on the rows already fetched rather than another query: the
   * year is already in memory, the scoping has already been applied to it,
   * and a second query could only find work this person is not allowed to
   * see. Filtered **after** the state counts are taken, so the chips keep
   * describing the year rather than the search.
   */
  const needle = String(query.q ?? "")
    .trim()
    .toLowerCase();
  const matches = needle
    ? all.filter((row) =>
        [row.cells.client, row.cells.code, row.cells.service, row.cells.member]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle),
      )
    : all;

  const rows = onlyState
    ? matches.filter((r) => r.state === onlyState)
    : matches;

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
        {/*
          The three books are this page's tabs, and they are the same
          control the engagement and settings screens use now rather than a
          third shape for the same idea.
        */}
        <Segmented
          label="Which register"
          variant="underline"
          value={book}
          items={BOOK_KEYS.map((key) => ({
            key,
            label: BOOKS[key].title,
            href: `/practice/${key}?fy=${fyStart}`,
          }))}
        />
      </div>

      {/*
        One toolbar instead of a row of seven differently-shaped links.

        The year, the two state filters and Export were all
        `rounded-ledger border px-3 py-1` — a year, a filter and a download
        drawn identically, so nothing told you which of them changed what
        you were looking at. They are three kinds of control now: a search
        box, chips that filter, and a button that leaves the page.

        The search is a plain GET form, so it works without JavaScript and
        the result is a URL somebody can keep.
      */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <form method="get" className="flex min-w-[14rem] flex-1 gap-2">
            <input type="hidden" name="fy" value={fyStart} />
            {onlyState && (
              <input type="hidden" name="state" value={onlyState} />
            )}
            <label className="min-w-0 flex-1">
              <span className="sr-only">Search this register</span>
              <input
                type="search"
                name="q"
                defaultValue={needle}
                placeholder="Search by client, code, service or member"
                className="rounded-control border-rule bg-paper text-14 h-9 w-full border px-2"
              />
            </label>
            <button
              type="submit"
              className="rounded-control border-rule hover:bg-carbon-wash text-13 h-9 shrink-0 border px-3"
            >
              Search
            </button>
          </form>

          <Link
            href={`/practice/${book}/export?fy=${fyStart}${
              onlyState ? `&state=${onlyState}` : ""
            }`}
            className="rounded-control bg-carbon text-14 text-on-carbon hover:bg-carbon-ink flex h-9 shrink-0 items-center px-3 font-medium"
          >
            Export to Excel
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-12 text-ink-muted mr-1">Year</span>
          {[thisYear, thisYear - 1, thisYear - 2].map((year) => (
            <Link
              key={year}
              href={link({ fy: String(year), q: needle })}
              aria-current={year === fyStart ? "page" : undefined}
              className={`rounded-chip text-13 border px-2.5 py-0.5 ${
                year === fyStart
                  ? "border-carbon bg-carbon text-on-carbon"
                  : "border-rule text-ink-muted hover:bg-carbon-wash"
              }`}
            >
              {financialYearLabel(istDate(year, 6, 1))}
            </Link>
          ))}

          {(counts.late > 0 || counts.overdue > 0) && (
            <span className="border-rule ml-1.5 flex flex-wrap gap-1.5 border-l pl-2.5">
              {counts.overdue > 0 && (
                <Link
                  href={link({
                    state: onlyState === "overdue" ? "" : "overdue",
                    q: needle,
                  })}
                  aria-current={onlyState === "overdue" ? "page" : undefined}
                  className={`rounded-chip text-13 border px-2.5 py-0.5 ${
                    onlyState === "overdue"
                      ? "border-carbon bg-carbon text-on-carbon"
                      : "border-redpen text-redpen hover:bg-redpen-wash"
                  }`}
                >
                  Past the deadline, not filed
                  <span className="num ml-1.5 opacity-80">
                    {counts.overdue}
                  </span>
                </Link>
              )}
              {counts.late > 0 && (
                <Link
                  href={link({
                    state: onlyState === "late" ? "" : "late",
                    q: needle,
                  })}
                  aria-current={onlyState === "late" ? "page" : undefined}
                  className={`rounded-chip text-13 border px-2.5 py-0.5 ${
                    onlyState === "late"
                      ? "border-carbon bg-carbon text-on-carbon"
                      : "border-waiting text-waiting hover:bg-waiting-wash"
                  }`}
                >
                  Filed late
                  <span className="num ml-1.5 opacity-80">{counts.late}</span>
                </Link>
              )}
            </span>
          )}
        </div>
      </div>

      {/*
        The table keeps its header while the rows scroll. Ten columns over
        a thousand rows means the labels scroll away in the first flick of
        the wheel, and a register where you cannot tell the report date
        from the filing date is unreadable rather than merely wide.
      */}
      {rows.length === 0 ? (
        <p className="text-14 text-ink-muted rounded-ledger border-rule border border-dashed p-6">
          {needle ? (
            <>
              Nothing in this book matches &ldquo;{needle}&rdquo; in{" "}
              {financialYearLabel(istDate(fyStart, 6, 1))}.{" "}
              <Link
                href={link({ q: "" })}
                className="underline underline-offset-4"
              >
                Clear the search
              </Link>
              .
            </>
          ) : (
            <>
              Nothing in this book for{" "}
              {financialYearLabel(istDate(fyStart, 6, 1))}.
              {onlyState
                ? " Clear the filter above to see the rest of the year."
                : ` A job appears here as soon as a ${definition.categories[0].toLowerCase()} service is set up for a client.`}
            </>
          )}
        </p>
      ) : (
        <div className="rounded-table border-rule max-h-[70vh] overflow-auto border">
          <table className="text-14 w-full border-collapse">
            <caption className="sr-only">
              {definition.title}, {financialYearLabel(istDate(fyStart, 6, 1))}
            </caption>
            <thead>
              <tr className="border-rule bg-surface sticky top-0 z-10 border-b text-left">
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

      {rows.length > 0 && (
        <p className="text-13 text-ink-muted">
          <span className="num">{rows.length}</span>{" "}
          {rows.length === 1 ? "entry" : "entries"}
          {rows.length !== all.length && (
            <>
              {" "}
              of <span className="num">{all.length}</span> in{" "}
              {financialYearLabel(istDate(fyStart, 6, 1))}
            </>
          )}
          .
        </p>
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

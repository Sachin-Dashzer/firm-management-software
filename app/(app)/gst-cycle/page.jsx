import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Engagement from "@/models/Engagement";
import Client from "@/models/Client";
import User from "@/models/User";
import { engagementQuery } from "@/lib/engagements/filter";
import { periodOptions } from "@/lib/engagements/period";
import {
  GST_CODE,
  GST_CYCLE_STAGES,
  cycleStage,
  cycleTally,
} from "@/lib/gst/cycle";
import { nextOpenMilestone } from "@/lib/engagements/milestones";
import { formatISTDate, daysUntil } from "@/lib/dates";
import { Check } from "@phosphor-icons/react/dist/ssr";
import { DueChip } from "../engagements/chips";
import PageHead from "@/components/ui/PageHead";
import FilterBar, { FilterSelect } from "@/components/ui/FilterBar";
import FilterChip from "@/components/ui/FilterChip";
import {
  TableShell,
  Table,
  Head,
  Th,
  Tr,
  Td,
  Meta,
  Empty,
} from "@/components/ui/Table";

export const metadata = { title: "Monthly GST cycle · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Every GST client, one month at a time (P3-22b).
 *
 * The cycle itself is spread across five steps on purpose — the workbook
 * and the computation are P3-12, the two gates are P3-5, the filings are
 * P3-1 — and each of those lives on the job it belongs to. What was missing
 * was the one question a partner asks on the 9th of the month: *of my
 * eleven GST clients, who has not sent their data?* That is this page, and
 * it stores nothing of its own: `cycleStage()` reads the fields those steps
 * already write.
 *
 * Closed work is included, because a filed month is the answer to the
 * question and hiding it would make the board look permanently unfinished.
 */
export default async function GstCyclePage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "engagementsWork")) redirect("/issues");

  const params = (await searchParams) ?? {};
  const now = new Date();

  const months = periodOptions("monthly", now);
  await connectDB();

  const scoped = {
    ...engagementQuery(actor, { closed: "yes" }, now),
    "templateSnapshot.code": GST_CODE,
  };

  /**
   * Which month to open on. October's GST is worked on in November, so
   * "this month" is the wrong default half the time — and a board that
   * opens empty teaches people the page is broken. So: the most recent of
   * the six months offered that actually has GST work in it.
   */
  const present = await Engagement.distinct("period", {
    ...scoped,
    period: { $in: months.map((month) => month.code) },
  });
  const period = months.some((month) => month.code === params.period)
    ? params.period
    : (months.find((month) => present.includes(month.code))?.code ??
      months[1].code);

  const engagements = await Engagement.find({ ...scoped, period })
    .sort({ statutoryDue: 1 })
    .limit(500)
    .lean();

  const [clients, staff] = await Promise.all([
    Client.find({ _id: { $in: engagements.map((e) => e.clientId) } })
      .select("legalName tradeName")
      .lean(),
    User.find({
      _id: {
        $in: engagements.map((e) => e.assigneeId).filter(Boolean),
      },
    })
      .select("name")
      .lean(),
  ]);

  const clientName = new Map(
    clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );
  const staffName = new Map(staff.map((u) => [String(u._id), u.name]));

  const tally = cycleTally(engagements);
  const stage = GST_CYCLE_STAGES.some((s) => s.key === params.stage)
    ? params.stage
    : null;

  const rows = engagements
    .map((engagement) => {
      const at = cycleStage(engagement);
      const next = nextOpenMilestone(engagement);
      const issues = Array.isArray(engagement.gstPrep?.issues)
        ? engagement.gstPrep.issues.length
        : 0;

      return {
        id: String(engagement._id),
        client: clientName.get(String(engagement.clientId)) ?? "Client",
        work: engagement.templateSnapshot?.name ?? "GST",
        who: staffName.get(String(engagement.assigneeId ?? "")) ?? "Nobody",
        stage: at,
        issues,
        submissions: engagement.gstPrep?.submissionCount ?? 0,
        next: next
          ? { name: next.name, date: next.dueDate }
          : engagement.statutoryDue
            ? { name: "Return", date: engagement.statutoryDue }
            : null,
        filings: (engagement.milestones ?? []).map((milestone) => ({
          name: milestone.name,
          filed: Boolean(milestone.filedOn),
        })),
      };
    })
    .filter((row) => !stage || row.stage.key === stage)
    .sort((a, b) => a.stage.index - b.stage.index);

  const label =
    months.find((month) => month.code === period)?.label ?? String(period);

  /**
   * Where the month is stuck: the fullest stage that is not "filed". It is
   * the sentence a partner would say out loud about the 9th — "six are
   * still waiting on data" — and it was on the screen only as the tallest
   * number in a row of eight chips, which is a thing you work out rather
   * than read.
   */
  const stuck = tally
    .filter((entry) => entry.key !== "filed" && entry.count > 0)
    .sort((a, b) => b.count - a.count)[0];

  const filed = tally.find((entry) => entry.key === "filed")?.count ?? 0;
  const chosen = stage ? tally.find((entry) => entry.key === stage) : null;

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-4 md:p-6">
      <PageHead
        title="Monthly GST cycle"
        sub={
          engagements.length === 0 ? (
            <>Nothing exists for {label} yet.</>
          ) : (
            <>
              {label} · <span className="num">{engagements.length}</span>{" "}
              clients, <span className="num">{filed}</span> filed
              {stuck ? (
                <>
                  . The month is sitting at{" "}
                  <strong className="text-ink">
                    {stuck.label.toLowerCase()}
                  </strong>{" "}
                  — <span className="num">{stuck.count}</span> of them.
                </>
              ) : (
                ". Every one of them is in."
              )}
            </>
          )
        }
      />

      <FilterBar
        action="/gst-cycle"
        search={false}
        active={Boolean(stage)}
        hidden={
          stage ? <input type="hidden" name="stage" value={stage} /> : null
        }
        primary={
          <FilterSelect
            label="Month"
            name="period"
            value={period}
            options={months.map((month) => [month.code, month.label])}
          />
        }
      />

      {engagements.length === 0 ? (
        <div className="rounded-ledger border-rule bg-surface flex flex-col items-center gap-1 border px-4 py-12 text-center">
          <p className="text-14 font-medium">No GST work exists for {label}.</p>
          <p className="text-13 text-ink-muted max-w-[56ch]">
            Monthly engagements are generated by the runner from the
            service&rsquo;s recurrence (step 7), or created by hand from{" "}
            <Link
              href="/engagements/new"
              className="text-carbon hover:text-carbon-ink underline underline-offset-4"
            >
              New engagement
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          {/*
            The eight stages in cycle order, as a strip you can filter by.
            `FilterChip` rather than this file's own chip: its own note says
            three screens drew a copy before it existed, and this was the
            fourth. The hint that was a `title` — invisible on a phone and
            to a screen reader — is printed under the strip for whichever
            stage is chosen.
          */}
          <div className="flex flex-col gap-1.5">
            <nav
              aria-label="Stages of the month"
              className="flex flex-wrap gap-1.5"
            >
              <FilterChip
                on={!stage}
                href={`/gst-cycle?period=${period}`}
                count={engagements.length}
              >
                All
              </FilterChip>
              {tally.map((entry) => (
                <FilterChip
                  key={entry.key}
                  on={entry.key === stage}
                  href={
                    entry.key === stage
                      ? `/gst-cycle?period=${period}`
                      : `/gst-cycle?period=${period}&stage=${entry.key}`
                  }
                  count={entry.count}
                >
                  {entry.label}
                </FilterChip>
              ))}
            </nav>
            {chosen?.hint && (
              <p className="text-12 text-ink-muted">{chosen.hint}</p>
            )}
          </div>

          <TableShell>
            <Table
              caption={`Every GST client's ${label}, earliest stage first`}
            >
              <colgroup>
                <col className="w-[24%]" />
                <col className="w-[15%]" />
                <col className="w-[17%]" />
                <col className="w-[16%]" />
                <col className="w-[13%]" />
                <col className="w-[15%]" />
              </colgroup>
              <Head>
                <Th>Client</Th>
                <Th>Stage</Th>
                <Th>Returns</Th>
                <Th rule>Next due</Th>
                <Th>With</Th>
                <Th>Sheet</Th>
              </Head>
              <tbody>
                {rows.map((row) => (
                  <Tr key={row.id}>
                    <Td>
                      <Link
                        href={`/engagements/${row.id}`}
                        className="hover:text-carbon font-medium underline decoration-transparent underline-offset-4 transition-colors duration-150 hover:decoration-current"
                      >
                        {row.client}
                      </Link>
                      <Meta>{row.work}</Meta>
                    </Td>
                    <Td>
                      <span
                        className={
                          row.stage.key === "awaiting-data" ||
                          row.stage.key === "corrections"
                            ? "text-waiting font-medium"
                            : row.stage.key === "filed"
                              ? "text-filed"
                              : ""
                        }
                      >
                        {row.stage.label}
                      </span>
                    </Td>
                    <Td>
                      {row.filings.length === 0 ? (
                        <span className="text-faint">—</span>
                      ) : (
                        <span className="flex flex-col gap-0.5">
                          {row.filings.map((filing) => (
                            <span
                              key={filing.name}
                              className={`text-13 flex items-center gap-1.5 ${
                                filing.filed ? "text-filed" : "text-ink-muted"
                              }`}
                            >
                              {/* drawn, not the character `✓`: a glyph tick
                                  sits on the text baseline and changes size
                                  with the face around it */}
                              {filing.filed ? (
                                <Check
                                  size={12}
                                  weight="bold"
                                  aria-hidden="true"
                                  className="shrink-0"
                                />
                              ) : (
                                <span className="border-faint size-2.5 shrink-0 rounded-full border" />
                              )}
                              {filing.name}
                              <span className="sr-only">
                                {filing.filed ? " filed" : " not filed"}
                              </span>
                            </span>
                          ))}
                        </span>
                      )}
                    </Td>
                    <Td rule>
                      {row.next?.date ? (
                        <DueChip
                          label={row.next.name}
                          date={formatISTDate(row.next.date)}
                          days={daysUntil(row.next.date, now)}
                        />
                      ) : (
                        <span className="text-faint text-13">—</span>
                      )}
                    </Td>
                    <Td className="text-13">
                      {row.who === "Nobody" ? (
                        <span className="text-waiting">Nobody</span>
                      ) : (
                        row.who
                      )}
                    </Td>
                    <Td className="text-13">
                      {row.submissions === 0 ? (
                        <span className="text-ink-muted">not sent in</span>
                      ) : (
                        <>
                          <span className="num">{row.submissions}</span>{" "}
                          {row.submissions === 1 ? "upload" : "uploads"}
                          {row.issues > 0 && (
                            <Meta className="text-redpen">
                              <span className="num">{row.issues}</span>{" "}
                              {row.issues === 1 ? "problem" : "problems"}
                            </Meta>
                          )}
                        </>
                      )}
                    </Td>
                  </Tr>
                ))}
                {rows.length === 0 && (
                  <Empty colSpan={6}>Nothing is at that stage.</Empty>
                )}
              </tbody>
            </Table>
          </TableShell>
        </>
      )}
    </div>
  );
}

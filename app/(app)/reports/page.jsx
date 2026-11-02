import { requireUser } from "@/auth";
import { can, branchFilter, ROLE_LABELS } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { financialYearLabel } from "@/lib/dates";
import { filingPunctuality } from "@/lib/reports/practice";
import { revenueByCategory } from "@/lib/reports/figures";
import { receivablesReport } from "@/lib/reports/standard";
import { loadForEach } from "@/lib/team/workload";
import { teamQuery } from "@/lib/team/filters";
import Engagement from "@/models/Engagement";
import User from "@/models/User";
import PageHead from "@/components/ui/PageHead";
import Panel from "@/components/ui/Panel";
import ProgressBar from "@/components/ui/ProgressBar";
import { FirmWide } from "@/components/shell/ViewNote";
import {
  TableShell,
  Table,
  Head,
  Th,
  Tr,
  Td,
  Num,
} from "@/components/ui/Table";

export const metadata = { title: "Management reports · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Management reports (the owner's screen of 02-11-2026).
 *
 * This was an index of twenty report names. The brief replaces it with the
 * four figures a partner opens a reports screen *for*, each read off the
 * records rather than linked to:
 *
 *  - **are we filing on time**, by service, because "are we late with GST
 *    returns" is a question about a process a firm can fix;
 *  - **what are we billing for**, by kind of work;
 *  - **who is carrying what**, with overdue beside open, because open
 *    alone says nothing about whether somebody is in trouble;
 *  - **who owes us**, with the overdue part of it called out.
 *
 * Nothing on this page is computed here. Each panel calls the helper the
 * report behind it already used — `filingPunctuality`, `revenueByCategory`,
 * `receivablesReport`, `loadForEach` — so this screen and the report it
 * came from can never disagree about the same number.
 */
export default async function ReportsPage() {
  const actor = await requireUser();

  await connectDB();

  const mayMoney = can(actor, "view", "invoices");
  const mayWork = can(actor, "view", "engagementsWork");
  const mayTeam = can(actor, "view", "team");

  const [punctuality, revenue, people, receivables] = await Promise.all([
    mayWork ? filingPunctuality(actor) : null,
    mayMoney ? revenueByCategory(actor) : [],
    mayTeam
      ? User.find(teamQuery(actor, { status: "active" }).query)
          .select("name role")
          .sort({ name: 1 })
          .limit(200)
          .lean()
      : [],
    mayMoney ? receivablesReport(actor) : null,
  ]);

  /** Open work for everybody on the list, in one query (lib/team/workload). */
  const ids = people.map((person) => person._id);
  const engagements = ids.length
    ? await Engagement.find({
        ...(branchFilter(actor, "engagementsWork") ?? {}),
        $or: [{ assigneeId: { $in: ids } }, { reviewerId: { $in: ids } }],
      })
        .select(
          "status statutoryDue internalDue assigneeId reviewerId reworkCount templateSnapshot.level",
        )
        .limit(10000)
        .lean()
    : [];
  const load = loadForEach(
    engagements,
    ids.map((id) => String(id)),
  );

  /**
   * Receivables, one row per client rather than one per invoice: a partner
   * reading this panel is deciding who to telephone, and four invoices to
   * the same client is one telephone call.
   */
  const owedByClient = new Map();
  for (const row of receivables?.rows ?? []) {
    const entry = owedByClient.get(row.client) ?? { owed: 0, overdue: 0 };
    entry.owed += row.outstanding;
    if (row.daysLate) entry.overdue += row.outstanding;
    owedByClient.set(row.client, entry);
  }
  const owedRows = [...owedByClient.entries()]
    .map(([client, sums]) => ({ client, ...sums }))
    .sort((a, b) => b.owed - a.owed);

  const revenueTotal = revenue.reduce((sum, row) => sum + row.paise, 0);
  const fy = financialYearLabel(new Date());

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-5 p-4 md:p-6">
      <PageHead
        title="Management reports"
        sub="Fixed reports, read off the firm's own records. Each one downloads as a spreadsheet."
      />

      <FirmWide />

      <div className="grid gap-4 lg:grid-cols-2">
        {punctuality && (
          <Panel
            title={`Filing punctuality · ${fy}`}
            link={{ href: "/reports/punctuality", label: "Full report" }}
          >
            <TableShell>
              <Table caption="Filings this year by service, and how many went in late">
                <Head>
                  <Th>Service</Th>
                  <Th align="right">Filed</Th>
                  <Th align="right">Late</Th>
                  <Th align="right">On time</Th>
                  <Th align="right">Worst</Th>
                </Head>
                <tbody>
                  {punctuality.rows.length === 0 ? (
                    <Tr>
                      <Td colSpan={5}>
                        <span className="text-ink-muted">
                          Nothing has been filed in {fy} yet.
                        </span>
                      </Td>
                    </Tr>
                  ) : (
                    punctuality.rows.map((row) => (
                      <Tr key={row.label}>
                        <Td>{row.label}</Td>
                        <Td align="right" className="num">
                          {row.filed}
                        </Td>
                        <Td
                          align="right"
                          className={`num ${row.late ? "text-redpen" : ""}`}
                        >
                          {row.late}
                        </Td>
                        <Td align="right" className="num">
                          {row.rate === null ? "—" : `${row.rate}%`}
                        </Td>
                        <Td align="right" className="num">
                          {row.worst ? `${row.worst} days` : "—"}
                        </Td>
                      </Tr>
                    ))
                  )}
                </tbody>
              </Table>
            </TableShell>
            {punctuality.note && (
              <p className="text-12 text-ink-muted">{punctuality.note}</p>
            )}
          </Panel>
        )}

        {mayMoney && (
          <Panel
            title="Billed this year by kind of work"
            link={{ href: "/reports/revenue", label: "Full report" }}
          >
            {revenue.length === 0 ? (
              <p className="text-14 text-ink-muted">
                Nothing has been billed in {fy} yet.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {revenue.map((row, index) => (
                  <div key={row.label} className="flex flex-col gap-1">
                    <div className="text-13 flex items-baseline justify-between gap-3">
                      <span>{row.label}</span>
                      <Num paise={row.paise} strong />
                    </div>
                    <ProgressBar
                      value={row.paise}
                      max={revenueTotal}
                      index={index}
                      label={`${row.label}, ${Math.round(
                        (row.paise / revenueTotal) * 100,
                      )}% of what was billed`}
                    />
                  </div>
                ))}
              </div>
            )}
          </Panel>
        )}

        {mayTeam && (
          <Panel
            title="Workload by person"
            link={{ href: "/team", label: "Team and time" }}
          >
            <TableShell>
              <Table caption="Open work, overdue work and work waiting for each person's review">
                <Head>
                  <Th>Person</Th>
                  <Th>Role</Th>
                  <Th align="right">Open</Th>
                  <Th align="right">Overdue</Th>
                  <Th align="right">To review</Th>
                </Head>
                <tbody>
                  {people.length === 0 && (
                    <Tr>
                      <Td colSpan={5}>
                        <span className="text-ink-muted">
                          Nobody is on the team yet.
                        </span>
                      </Td>
                    </Tr>
                  )}
                  {people.map((person) => {
                    const mine = load.get(String(person._id));
                    return (
                      <Tr key={String(person._id)}>
                        <Td>{person.name}</Td>
                        <Td className="text-13 text-ink-muted">
                          {ROLE_LABELS[person.role] ?? person.role}
                        </Td>
                        <Td align="right" className="num">
                          {mine?.asAssignee ?? 0}
                        </Td>
                        <Td
                          align="right"
                          className={`num ${
                            mine?.overdue ? "text-redpen" : ""
                          }`}
                        >
                          {mine?.overdue ?? 0}
                        </Td>
                        <Td align="right" className="num">
                          {mine?.awaitingMyReview ?? 0}
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableShell>
          </Panel>
        )}

        {mayMoney && (
          <Panel
            title="Receivables by client"
            count={owedRows.length ? `${owedRows.length} clients` : undefined}
            link={{ href: "/billing?tab=collections", label: "Collections" }}
          >
            <TableShell>
              <Table caption="What each client owes, and how much of it is past its due date">
                <Head>
                  <Th>Client</Th>
                  <Th align="right" rule>
                    Owed
                  </Th>
                  <Th align="right">Overdue</Th>
                </Head>
                <tbody>
                  {owedRows.length === 0 ? (
                    <Tr>
                      <Td colSpan={3}>
                        <span className="text-ink-muted">
                          Nothing is outstanding.
                        </span>
                      </Td>
                    </Tr>
                  ) : (
                    owedRows.map((row) => (
                      <Tr key={row.client}>
                        <Td>{row.client}</Td>
                        <Td align="right" rule>
                          <Num paise={row.owed} strong />
                        </Td>
                        <Td align="right">
                          <Num paise={row.overdue} tone="late" />
                        </Td>
                      </Tr>
                    ))
                  )}
                </tbody>
              </Table>
            </TableShell>
          </Panel>
        )}
      </div>
    </div>
  );
}

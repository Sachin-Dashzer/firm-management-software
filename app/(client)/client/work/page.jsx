import { requireClientUser } from "@/auth";
import { connectDB } from "@/lib/db";
import Engagement from "@/models/Engagement";
import Comment from "@/models/Comment";
import {
  engagementScope,
  ENGAGEMENT_FIELDS,
  engagementForClient,
  threadScope,
} from "@/lib/access/clientScope";
import { CLOSED_STATUSES } from "@/lib/engagements/status";
import { formatISTDate, formatISTDateTime } from "@/lib/dates";
import ConfirmFigures from "./ConfirmFigures";
import Conversations from "./Conversations";

export const metadata = { title: "Your work" };
export const dynamic = "force-dynamic";

/**
 * Everything the firm is doing, or has done, for this client (P2-9b).
 *
 * The engagement's own status words, not a softened version of them: a
 * client who is told "in progress" when it is "on hold" will find out, and
 * the system should not be the thing that misled them. What is absent is
 * the internal apparatus — who is on it, the internal deadline, how many
 * times it came back from review — which `clientScope` never reads.
 */
export default async function ClientWorkPage() {
  const person = await requireClientUser();
  await connectDB();

  const engagements = await Engagement.find(engagementScope(person))
    .select(ENGAGEMENT_FIELDS)
    .sort({ statutoryDue: -1, createdAt: -1 })
    .limit(500)
    .lean();

  /**
   * The with-client half of every thread on their jobs (P3-17b).
   *
   * `threadScope` asks for `internal: false` at the database, so the
   * firm's own thread is never read here — a filter applied after the read
   * is one a page can forget.
   */
  const messages = await Comment.find(
    threadScope(
      person,
      engagements.map((row) => row._id),
    ),
  )
    .select("entityId body createdByName createdBy kind createdAt")
    .sort({ createdAt: 1 })
    .limit(500)
    .lean();

  const rows = engagements.map(engagementForClient);
  const open = rows.filter(
    (row) => !CLOSED_STATUSES.includes(engagementStatus(row)),
  );
  const done = rows.filter((row) =>
    CLOSED_STATUSES.includes(engagementStatus(row)),
  );

  /** One thread per job, newest job first, only where something was said. */
  const byJob = new Map();
  for (const row of messages) {
    const key = String(row.entityId);
    if (!byJob.has(key)) byJob.set(key, []);
    byJob.get(key).push({
      id: String(row._id),
      body: row.body,
      by: row.kind === "Client message" ? row.createdByName : "Your accountant",
      mine: row.kind === "Client message",
      at: formatISTDateTime(row.createdAt),
    });
  }

  const threads = rows
    .filter((row) => byJob.has(row.id))
    .map((row) => ({
      id: row.id,
      service: row.service,
      period: row.period,
      messages: byJob.get(row.id),
    }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-24 font-bold tracking-tight">
          Your work
        </h1>
        <p className="text-14 text-ink-muted max-w-[65ch]">
          Every job we have on for you, and everything we have finished.
        </p>
      </div>

      <ConfirmFigures
        rows={open.map((row) => ({
          ...row,
          dueLabel: row.due ? formatISTDate(row.due) : "",
        }))}
        mayConfirm={Boolean(person.mayConfirmFigures)}
      />

      <Conversations threads={threads} />

      <WorkTable title="In hand" rows={open} empty="Nothing is open." />
      <WorkTable
        title="Finished"
        rows={done}
        empty="Nothing has been finished yet."
      />
    </div>
  );
}

/** The status travelled through `engagementForClient`, which keeps it. */
function engagementStatus(row) {
  return row.status;
}

function WorkTable({ title, rows, empty }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-15 font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-14 text-ink-muted rounded-ledger border-rule border border-dashed p-4">
          {empty}
        </p>
      ) : (
        <div className="rounded-table border-rule overflow-x-auto border">
          <table className="text-14 w-full border-collapse">
            <thead>
              <tr className="border-rule bg-surface border-b text-left">
                {["Work", "Period", "Status", "Due", "Filed", "Reference"].map(
                  (head) => (
                    <th
                      key={head}
                      scope="col"
                      className="text-13 text-ink-muted px-3 py-2 font-medium"
                    >
                      {head}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-rule border-b last:border-0">
                  <td className="px-3 py-2">{row.service}</td>
                  <td className="px-3 py-2">{row.period}</td>
                  <td className="px-3 py-2">{row.status}</td>
                  <td className="px-3 py-2">
                    {row.due ? (
                      formatISTDate(row.due)
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {/*
                      Filed with no acknowledgement attached is its own state
                      and the client is told so, rather than being shown a
                      date that implies there is paperwork to download (P3-1).
                    */}
                    {row.filedOn ? (
                      <>
                        {formatISTDate(row.filedOn)}
                        {row.proofPending && (
                          <span className="text-12 text-waiting block">
                            proof pending
                          </span>
                        )}
                      </>
                    ) : row.partFiled ? (
                      <span className="text-12 text-waiting">
                        {row.filedCount} of {row.filingCount} filed
                      </span>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono">
                    {row.ackNo || row.udin || (
                      <span className="text-ink-muted font-sans">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

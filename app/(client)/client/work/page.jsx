import { requireClientUser } from "@/auth";
import { connectDB } from "@/lib/db";
import Engagement from "@/models/Engagement";
import {
  engagementScope,
  ENGAGEMENT_FIELDS,
  engagementForClient,
} from "@/lib/access/clientScope";
import { CLOSED_STATUSES } from "@/lib/engagements/status";
import { formatISTDate } from "@/lib/dates";

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

  const rows = engagements.map(engagementForClient);
  const open = rows.filter(
    (row) => !CLOSED_STATUSES.includes(engagementStatus(row)),
  );
  const done = rows.filter((row) =>
    CLOSED_STATUSES.includes(engagementStatus(row)),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-28 font-semibold">Your work</h1>
        <p className="text-14 text-ink-muted max-w-[65ch]">
          Every job we have on for you, and everything we have finished.
        </p>
      </div>

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
      <h2 className="font-display text-20">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-14 text-ink-muted rounded-ledger border-rule border border-dashed p-4">
          {empty}
        </p>
      ) : (
        <div className="rounded-ledger border-rule overflow-x-auto border">
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
                    {row.filedOn ? (
                      formatISTDate(row.filedOn)
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

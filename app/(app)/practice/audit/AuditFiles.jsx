import Link from "next/link";
import Engagement from "@/models/Engagement";
import Client from "@/models/Client";
import AuditFile from "@/models/AuditFile";
import { engagementQuery } from "@/lib/engagements/filter";
import { AUDIT_STAGES } from "@/lib/audit-studio/standards";
import { exceptionCounts } from "@/lib/audit-studio/exceptions";
import {
  isLocked,
  blockingSign,
  conclusionStands,
} from "@/lib/audit-studio/reporting";
import { formatISTDate } from "@/lib/dates";

/** A file nobody has opened yet is a state, and it goes first. */
const NOT_OPENED = "Not opened";

/**
 * Every audit file the firm holds, read two ways (P3-22b).
 *
 * The file itself was built at P3-13 to P3-15 and could only be reached
 * from the engagement it belongs to, which means the only way to find out
 * where the firm's audits stood was to open them one at a time. This is the
 * way in: by stage for the studio, by report for the SA 700 screen. Both
 * read the same rows — two lists of the same files that could disagree
 * about one of them would be worse than no list.
 *
 * Nothing is performed from here. Every row is a link to the file, where the
 * actions and their refusals already live (P3-8).
 */
export default async function AuditFiles({ actor, view }) {
  const engagements = await Engagement.find({
    ...engagementQuery(actor, { closed: "yes" }),
    "templateSnapshot.category": "Audit and Assurance",
  })
    .sort({ statutoryDue: 1, createdAt: -1 })
    .limit(500)
    .lean();

  const [clients, files] = await Promise.all([
    Client.find({ _id: { $in: engagements.map((e) => e.clientId) } })
      .select("legalName tradeName")
      .lean(),
    AuditFile.find({ engagementId: { $in: engagements.map((e) => e._id) } })
      /**
       * `blockingSign()` reads materiality, the areas, the tests and the
       * CARO answers as well as the opinion, so all of them are selected —
       * a projection that misses one would make the "waiting on" column
       * say a file is ready when it is not.
       */
      .select(
        "engagementId stage exceptions opinion overall signed amending reportAnswers tests areas materialityPaise materialityBasis",
      )
      .lean(),
  ]);

  const clientName = new Map(
    clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );
  const fileOf = new Map(files.map((f) => [String(f.engagementId), f]));

  const rows = engagements.map((engagement) => {
    const file = fileOf.get(String(engagement._id)) ?? null;
    const counts = exceptionCounts(file?.exceptions ?? []);
    const blocking = file ? blockingSign(file) : [];

    return {
      id: String(engagement._id),
      client: clientName.get(String(engagement.clientId)) ?? "Client",
      type:
        engagement.auditType || engagement.templateSnapshot?.name || "Audit",
      period: engagement.periodLabel || engagement.period,
      stage: file ? file.stage : NOT_OPENED,
      open: counts.open,
      highOpen: counts.highOpen,
      opinion: file?.opinion?.type ?? "",
      conclusion: file ? conclusionStands(file) : false,
      signedAt: file?.signed?.signedAt ?? null,
      version: file?.signed?.version ?? null,
      udin: file?.signed?.udin || file?.opinion?.udin || "",
      locked: file ? isLocked(file) : false,
      amending: Boolean(file?.amending),
      blocking,
    };
  });

  if (rows.length === 0) {
    return (
      <p className="rounded-ledger border-rule bg-surface text-14 border px-4 py-3">
        No audit work exists yet. An audit file opens itself the first time
        somebody opens the studio on an engagement whose service is in the Audit
        and Assurance category.
      </p>
    );
  }

  return view === "report" ? (
    <ReportView rows={rows} />
  ) : (
    <StageView rows={rows} />
  );
}

/** The seven stages, in order, with the files sitting at each. */
function StageView({ rows }) {
  const groups = [NOT_OPENED, ...AUDIT_STAGES]
    .map((stage) => ({
      stage,
      rows: rows.filter((row) => row.stage === stage),
    }))
    .filter((group) => group.rows.length > 0);

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <section key={group.stage} className="flex flex-col gap-2">
          <h2 className="text-13 text-ink-muted font-medium">
            {group.stage}
            <span className="num"> · {group.rows.length}</span>
          </h2>

          <div className="rounded-table border-rule bg-surface overflow-x-auto border">
            <table className="text-14 w-full">
              <thead>
                <tr className="border-rule text-12 text-faint border-b text-left font-normal">
                  <th className="px-3 py-2 font-medium">Client</th>
                  <th className="px-3 py-2 font-medium">Audit</th>
                  <th className="px-3 py-2 font-medium">Period</th>
                  <th className="px-3 py-2 font-medium">Exceptions open</th>
                  <th className="px-3 py-2 font-medium">Report</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-rule border-b last:border-0"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/practice/audit/${row.id}`}
                        className="font-medium underline underline-offset-4"
                      >
                        {row.client}
                      </Link>
                    </td>
                    <td className="text-13 px-3 py-2">{row.type}</td>
                    <td className="text-13 px-3 py-2">{row.period}</td>
                    <td className="num text-13 px-3 py-2">
                      {row.open === 0 ? (
                        <span className="text-ink-muted">none</span>
                      ) : (
                        <span className={row.highOpen > 0 ? "text-redpen" : ""}>
                          {row.open}
                          {row.highOpen > 0 ? ` · ${row.highOpen} high` : ""}
                        </span>
                      )}
                    </td>
                    <td className="text-13 px-3 py-2">
                      <ReportState row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

/** Where each report stands, which is a different question from the stage. */
function ReportView({ rows }) {
  const ordered = [...rows].sort(
    (a, b) => Number(Boolean(b.signedAt)) - Number(Boolean(a.signedAt)),
  );

  return (
    <div className="rounded-table border-rule bg-surface overflow-x-auto border">
      <table className="text-14 w-full">
        <thead>
          <tr className="border-rule text-12 text-faint border-b text-left font-normal">
            <th className="px-3 py-2 font-medium">Client</th>
            <th className="px-3 py-2 font-medium">Period</th>
            <th className="px-3 py-2 font-medium">Opinion</th>
            <th className="px-3 py-2 font-medium">
              Reviewer&rsquo;s conclusion
            </th>
            <th className="px-3 py-2 font-medium">Signed</th>
            <th className="px-3 py-2 font-medium">Waiting on</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((row) => (
            <tr key={row.id} className="border-rule border-b last:border-0">
              <td className="px-3 py-2">
                <Link
                  href={`/practice/audit/${row.id}`}
                  className="font-medium underline underline-offset-4"
                >
                  {row.client}
                </Link>
                <span className="text-12 text-ink-muted block">{row.type}</span>
              </td>
              <td className="text-13 px-3 py-2">{row.period}</td>
              <td className="text-13 px-3 py-2">
                {row.opinion || <span className="text-ink-muted">not set</span>}
              </td>
              <td className="text-13 px-3 py-2">
                {row.conclusion ? (
                  "stands"
                ) : (
                  <span className="text-ink-muted">
                    not recorded, or gone stale
                  </span>
                )}
              </td>
              <td className="text-13 px-3 py-2">
                <ReportState row={row} />
              </td>
              <td className="text-13 text-ink-muted px-3 py-2">
                {row.signedAt && !row.amending
                  ? "—"
                  : row.blocking.length === 0
                    ? "nothing — it can be signed"
                    : `${row.blocking.length} ${
                        row.blocking.length === 1 ? "thing" : "things"
                      }: ${row.blocking[0]}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One phrase for the state of a report, used by both views. */
function ReportState({ row }) {
  if (row.amending) {
    return <span className="text-waiting">amendment open</span>;
  }
  if (row.signedAt) {
    return (
      <span className="text-filed">
        v{row.version} {formatISTDate(row.signedAt)}
        {row.udin ? ` · ${row.udin}` : ""}
      </span>
    );
  }
  if (row.stage === NOT_OPENED) {
    return <span className="text-ink-muted">—</span>;
  }
  return <span className="text-ink-muted">not signed</span>;
}

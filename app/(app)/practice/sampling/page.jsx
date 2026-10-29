import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Engagement from "@/models/Engagement";
import Client from "@/models/Client";
import AuditFile from "@/models/AuditFile";
import Sample from "@/models/Sample";
import { engagementQuery } from "@/lib/engagements/filter";
import { formatISTDate } from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import { METHODS, progress } from "@/lib/practice/sampling";
import StartSample from "./StartSample";

export const metadata = { title: "Sampling and vouching · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Sampling and vouching (P3-30, SA 530).
 *
 * The working papers the firm has drawn, and the way to start another. A
 * sample belongs to an audit file — the index, not this page, is where it
 * is judged — so each row links both ways.
 */
export default async function SamplingPage() {
  const actor = await requireUser();
  if (!can(actor, "view", "practice")) redirect("/issues");
  const editable = can(actor, "edit", "practice");

  await connectDB();

  /* Audit engagements this person can reach, with a file already open:
     a sample needs a programme to sit in, so one without a file is not
     offered. */
  const engagements = await Engagement.find({
    ...engagementQuery(actor, { closed: "yes" }),
    "templateSnapshot.category": "Audit and Assurance",
  })
    .select("clientId templateSnapshot periodLabel period code")
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();

  const ids = engagements.map((e) => e._id);

  const [clients, files, samples] = await Promise.all([
    Client.find({ _id: { $in: engagements.map((e) => e.clientId) } })
      .select("legalName tradeName")
      .lean(),
    AuditFile.find({ engagementId: { $in: ids } })
      .select("engagementId")
      .lean(),
    Sample.find({ engagementId: { $in: ids } })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean(),
  ]);

  const clientName = new Map(
    clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );
  const hasFile = new Set(files.map((f) => String(f.engagementId)));
  const engagementOf = new Map(engagements.map((e) => [String(e._id), e]));

  const options = engagements
    .filter((e) => hasFile.has(String(e._id)))
    .map((e) => ({
      id: String(e._id),
      label: `${clientName.get(String(e.clientId)) ?? "Client"} · ${
        e.templateSnapshot?.name ?? "Audit"
      } · ${e.periodLabel || e.period}`,
    }));

  const rows = samples.map((sample) => {
    const engagement = engagementOf.get(String(sample.engagementId));
    const counts = progress(
      sample.items ?? [],
      (sample.attributes ?? []).length,
    );
    return {
      id: String(sample._id),
      ref: sample.ref,
      name: sample.name,
      client: clientName.get(String(sample.clientId)) ?? "Client",
      period: engagement ? engagement.periodLabel || engagement.period : "",
      method:
        METHODS.find((m) => m.key === sample.method)?.name ?? sample.method,
      locked: Boolean(sample.locked),
      lockedBy: sample.lockedByName,
      lockedAt: sample.lockedAt ? formatISTDate(sample.lockedAt) : "",
      drawn: sample.items?.length ?? 0,
      entries: sample.entries ?? 0,
      value: sample.valuePaise ? formatPaise(sample.valuePaise) : "",
      ...counts,
    };
  });

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="font-display text-24 font-bold tracking-tight">
          Sampling and vouching
        </h1>
        <p className="text-13 text-ink-muted max-w-[74ch]">
          Choosing what to look at, recording what was found, and sending what
          was wrong to the audit file. The selection is drawn from a saved seed,
          so the same sample can be produced again years later — which is the
          only question a reviewer ever asks about a sample.
        </p>
      </div>

      {editable && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-15 font-semibold">
            Start a working paper
          </h2>
          {options.length === 0 ? (
            <p className="rounded-ledger border-waiting bg-waiting-wash text-13 border px-3 py-2">
              No audit file is open yet. A sample needs a programme to sit in,
              so open the file on the audit first —{" "}
              <Link
                href="/practice/audit"
                className="underline underline-offset-4"
              >
                the audit studio
              </Link>{" "}
              lists every audit and whether its file has been opened.
            </p>
          ) : (
            <StartSample engagements={options} />
          )}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-15 font-semibold">
          Working papers
          {rows.length > 0 && (
            <span className="num text-ink-muted font-normal">
              {" "}
              · {rows.length}
            </span>
          )}
        </h2>

        {rows.length === 0 ? (
          <p className="text-13 text-ink-muted">
            No sample has been drawn yet.
          </p>
        ) : (
          <div className="rounded-table border-rule bg-surface overflow-x-auto border">
            <table className="text-14 w-full">
              <thead>
                <tr className="border-rule text-12 text-faint border-b text-left">
                  <th className="px-3 py-2 font-medium">Paper</th>
                  <th className="px-3 py-2 font-medium">Client</th>
                  <th className="px-3 py-2 font-medium">Method</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Population
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Selected</th>
                  <th className="px-3 py-2 font-medium">Vouching</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-rule border-b last:border-0"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/practice/sampling/${row.id}`}
                        className="font-medium underline underline-offset-4"
                      >
                        {row.ref ? `${row.ref} · ` : ""}
                        {row.name}
                      </Link>
                      <div className="text-12 text-faint">
                        {row.locked
                          ? `locked ${row.lockedAt} by ${row.lockedBy}`
                          : "not locked"}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {row.client}
                      <div className="text-12 text-faint">{row.period}</div>
                    </td>
                    <td className="text-13 px-3 py-2">{row.method}</td>
                    <td className="num px-3 py-2 text-right">
                      {row.entries ? row.entries.toLocaleString("en-IN") : "—"}
                      {row.value && (
                        <div className="text-12 text-faint">{row.value}</div>
                      )}
                    </td>
                    <td className="num px-3 py-2 text-right">
                      {row.drawn || "—"}
                    </td>
                    <td className="text-13 px-3 py-2">
                      {row.total === 0 ? (
                        <span className="text-faint">nothing drawn</span>
                      ) : (
                        <span className="flex flex-wrap gap-x-3">
                          <span className="text-filed">
                            <span className="num">{row.cleared}</span> cleared
                          </span>
                          {row.exceptions > 0 && (
                            <span className="text-redpen">
                              <span className="num">{row.exceptions}</span>{" "}
                              {row.exceptions === 1
                                ? "exception"
                                : "exceptions"}
                            </span>
                          )}
                          {row.pending > 0 && (
                            <span className="text-ink-muted">
                              <span className="num">{row.pending}</span> to do
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border p-4">
        <h2 className="font-display text-15 font-semibold">
          How the three methods differ
        </h2>
        <dl className="flex flex-col gap-2">
          {METHODS.map((method) => (
            <div key={method.key}>
              <dt className="text-14 font-medium">{method.name}</dt>
              <dd className="text-13 text-ink-muted max-w-[76ch]">
                {method.what}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-12 text-faint max-w-[76ch]">
          <strong>Nothing here works out a sample size for you.</strong> SA 530
          gives no formula; the number comes from the firm&rsquo;s judgement
          about risk, what other work already covers, and what misstatement
          would be tolerable. Those are recorded beside the sample as the
          reasoning — the way materiality records its basis — and the number is
          the firm&rsquo;s.
        </p>
      </section>
    </div>
  );
}

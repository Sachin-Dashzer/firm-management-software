"use client";

import { saving } from "@/lib/forms/saving";
import { useRef, useState, useTransition } from "react";
import {
  profileUpload,
  analyseUpload,
  jobsForSummary,
  postSummary,
} from "./actions";
import { useKeptFile } from "@/lib/forms/keptFile";
import Chip from "@/components/ui/Chip";
import Panel from "@/components/ui/Panel";
import ProgressBar from "@/components/ui/ProgressBar";
import { Result } from "@/components/ui/Notice";

/**
 * Drop a sheet in, read what it says (P3-20, redrawn to the owner's screen
 * of 02-11-2026).
 *
 * The shape of the screen is the shape of the work: **what is this file**,
 * **what does it add up to**, **what should I look at**, **what did the lab
 * find**. The mapping step is still here and still asks — nothing is
 * checked until somebody says which column is the amount — but the boxes
 * arrive filled in from the headers, so the common case is a glance rather
 * than six dropdowns.
 *
 * Every finding carries what it does *not* mean. A duplicate invoice
 * number is usually a credit note; a round figure is usually a round
 * figure. Something that cries wolf is something nobody opens in March.
 *
 * Nothing is kept. The file is read inside the request and gone when the
 * response ends; what can be saved is the summary, onto the job it belongs
 * to.
 */

const KIND_OPTIONS = [
  { key: "tb", label: "Trial balance" },
  { key: "sales", label: "Sales register" },
  { key: "bank", label: "Bank statement" },
  { key: "generic", label: "Something else" },
];

const KIND_LABEL = Object.fromEntries(
  KIND_OPTIONS.map((kind) => [kind.key, kind.label]),
);

export default function DataLab({ samples }) {
  const formRef = useRef(null);
  const [profile, setProfile] = useState(null);
  const [result, setResult] = useState(null);
  const [jobs, setJobs] = useState(null);
  const [job, setJob] = useState("");
  const [message, setMessage] = useState(null);
  const [error, setError] = useState("");
  const [sample, setSample] = useState("");
  const [kind, setKind] = useState("");
  const [mapping, setMapping] = useState({});
  const [pending, startTransition] = useTransition();
  const file = useKeptFile();

  /** Read a sheet: either the chosen file, or one of the samples. */
  function read(formData, which = "") {
    if (which) {
      formData.set("sample", which);
      formData.delete("file");
    }
    file.keep(formData);
    startTransition(async () => {
      setError("");
      setResult(null);
      setMessage(null);
      const response = await profileUpload(null, formData);
      if (response.error) {
        setProfile(null);
        setError(response.error);
        return;
      }
      setProfile(response);
      setSample(response.sample ?? "");
      setKind(response.kind);
      setMapping(response.guessed ?? {});
    });
  }

  function onProfile(formData) {
    setSample("");
    read(formData);
  }

  /** Reading the same sheet again as something else. */
  function onKind(next) {
    setKind(next);
    const formData = file.restore(new FormData(formRef.current));
    formData.set("kind", next);
    if (sample) formData.set("sample", sample);
    startTransition(async () => {
      const response = await profileUpload(null, formData);
      if (response.error) {
        setError(response.error);
        return;
      }
      setProfile(response);
      setMapping(response.guessed ?? {});
      setResult(null);
    });
  }

  function onAnalyse() {
    startTransition(async () => {
      setError("");
      const formData = file.restore(new FormData(formRef.current));
      if (sample) formData.set("sample", sample);
      formData.set("kind", kind);
      const response = await analyseUpload(null, formData);
      if (response.error) {
        setError(response.error);
        return;
      }
      setResult(response);
    });
  }

  function onLoadJobs() {
    startTransition(async () => {
      setJobs(await jobsForSummary());
    });
  }

  function onPost() {
    startTransition(async () => {
      const response = await postSummary(job, result.summary);
      setMessage(response);
    });
  }

  /** Which columns suit a role, so the dropdown does not offer nonsense. */
  const options = (role) =>
    (profile?.columns ?? []).filter((column) =>
      role.kinds.includes(column.kind),
    );

  const checklist = result?.checklist ?? profile?.checklist ?? [];
  const foundByKey = new Map(
    (result?.findings ?? []).map((finding) => [finding.key, finding]),
  );
  const figures = result?.figures ?? null;
  const barMax = figures
    ? Math.max(1, ...figures.bars.map((bar) => Math.abs(bar.value)))
    : 1;
  const topMax = figures
    ? Math.max(1, ...figures.tops.map((row) => row.value))
    : 1;

  return (
    <form
      ref={formRef}
      onSubmit={saving(onProfile)}
      className="flex flex-col gap-4"
    >
      {error && (
        <p
          role="alert"
          className="rounded-ledger border-redpen bg-redpen-wash text-13 text-redpen border px-3 py-2"
        >
          {error}
        </p>
      )}
      <Result message={message} />

      {/* --- where the sheet comes from ----------------------------------- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="rounded-ledger border-rule bg-surface hover:border-carbon flex cursor-pointer flex-col gap-1 border-2 border-dashed p-3">
          <span className="text-14 font-semibold">Read a file</span>
          <span className="text-12 text-ink-muted">
            Save it as CSV UTF-8 from Excel, up to 5 MB. It is read here and
            not kept.
          </span>
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            className="text-12 mt-1"
            onChange={() => setSample("")}
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-control border-rule bg-surface text-13 mt-1 h-8 border px-3 disabled:opacity-60"
          >
            Read it
          </button>
        </label>

        {(samples ?? []).map((row) => (
          <button
            key={row.key}
            type="button"
            disabled={pending}
            onClick={() => read(new FormData(), row.key)}
            className={`rounded-ledger bg-surface flex flex-col gap-1 border p-3 text-left disabled:opacity-60 ${
              sample === row.key ? "border-carbon" : "border-rule hover:border-carbon"
            }`}
          >
            <span className="text-14 font-semibold">Try {row.label}</span>
            <span className="text-12 text-ink-muted">{row.what}</span>
            <span className="text-12 text-faint mt-auto">Sample data</span>
          </button>
        ))}
      </div>

      {!profile && (
        <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border px-4 py-6">
          Read a file or try a sample. A trial balance, a sales register and a
          bank statement are recognised and get the figures and a checklist of
          their own; any other sheet gets its columns profiled and the checks
          that need no mapping.
        </p>
      )}

      {profile && (
        <>
          {/* --- what it is --------------------------------------------- */}
          <section className="rounded-ledger border-rule bg-surface flex flex-wrap items-start justify-between gap-3 border p-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone="info">
                  Looks like: {KIND_LABEL[kind] ?? "Something else"}
                </Chip>
                <Chip tone="neutral" mono>
                  {profile.rowCount} rows · {profile.columns.length} columns
                </Chip>
                {sample && <Chip tone="soon">Sample data</Chip>}
              </div>
              <h2 className="text-15 mt-1.5 font-bold">{profile.fileName}</h2>
              <p className="text-12 text-ink-muted max-w-[70ch]">
                Columns: {profile.headers.slice(0, 10).join(", ")}
                {profile.headers.length > 10 ? "…" : ""}
              </p>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-12 text-ink-muted font-medium">
                Read it as
              </span>
              <select
                value={kind}
                onChange={(event) => onKind(event.target.value)}
                className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
              >
                {KIND_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="text-12 text-faint">
                It read the headers and guessed; you decide.
              </span>
            </label>
          </section>

          {/* --- which column is which ---------------------------------- */}
          <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
            <div>
              <h3 className="text-14 font-medium">Which column is which</h3>
              <p className="text-12 text-ink-muted max-w-[70ch]">
                Filled in from the headings. Change anything that is wrong —
                nothing is checked against a column nobody confirmed, because
                a total of the wrong column is reported with just as much
                confidence as a right one.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {profile.roles.map((role) => (
                <label key={role.key} className="flex flex-col gap-1">
                  <span className="text-13 font-medium">{role.label}</span>
                  <select
                    name={`map.${role.key}`}
                    value={mapping[role.key] ?? ""}
                    onChange={(event) =>
                      setMapping({
                        ...mapping,
                        [role.key]: event.target.value,
                      })
                    }
                    className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                  >
                    <option value="">— not in this file —</option>
                    {options(role).map((column) => (
                      <option key={column.index} value={column.index}>
                        {column.header}
                      </option>
                    ))}
                  </select>
                </label>
              ))}

              <label className="flex flex-col gap-1">
                <span className="text-13 font-medium">Period from</span>
                <input
                  type="date"
                  name="from"
                  className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-13 font-medium">Period to</span>
                <input
                  type="date"
                  name="to"
                  className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
                />
                <span className="text-12 text-ink-muted">
                  Optional. Without them, nothing is called out of period.
                </span>
              </label>
            </div>

            <div>
              <button
                type="button"
                onClick={onAnalyse}
                disabled={pending}
                className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-4 font-medium disabled:opacity-60"
              >
                Work it out
              </button>
            </div>
          </section>

          {/* --- the figures -------------------------------------------- */}
          {figures && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {figures.kpis.map((kpi) => (
                <div
                  key={kpi.label}
                  className="rounded-ledger border-rule bg-surface border p-3"
                >
                  <p className="text-11 text-ink-muted font-semibold tracking-wide uppercase">
                    {kpi.label}
                  </p>
                  <p className="num text-20 font-medium">{kpi.value}</p>
                  {kpi.note && (
                    <p className="text-12 text-ink-muted">{kpi.note}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-start gap-4">
            <div className="flex min-w-[20rem] flex-[999] basis-[28rem] flex-col gap-4">
              {figures && figures.bars.length > 1 && (
                <Panel title={figures.barsTitle}>
                  <div className="flex flex-col gap-2">
                    {figures.bars.map((bar, index) => (
                      <div key={bar.label} className="flex flex-col gap-1">
                        <div className="text-13 flex items-baseline justify-between gap-3">
                          <span>{bar.label}</span>
                          <span className="num">
                            {new Intl.NumberFormat("en-IN", {
                              maximumFractionDigits: 0,
                            }).format(bar.value)}
                          </span>
                        </div>
                        <ProgressBar
                          value={Math.abs(bar.value)}
                          max={barMax}
                          index={index}
                          tone={bar.value < 0 ? "redpen" : "carbon"}
                          label={`${bar.label}: ${bar.value}`}
                        />
                      </div>
                    ))}
                  </div>
                </Panel>
              )}

              {figures && figures.tops.length > 1 && (
                <Panel title={figures.topsTitle}>
                  <div className="flex flex-col gap-2">
                    {figures.tops.map((row, index) => (
                      <div key={row.label} className="flex flex-col gap-1">
                        <div className="text-13 flex items-baseline justify-between gap-3">
                          <span className="truncate">{row.label}</span>
                          <span className="num">
                            {new Intl.NumberFormat("en-IN", {
                              maximumFractionDigits: 0,
                            }).format(row.value)}
                          </span>
                        </div>
                        <ProgressBar
                          value={row.value}
                          max={topMax}
                          index={index}
                          label={`${row.label}: ${row.value}`}
                        />
                      </div>
                    ))}
                  </div>
                </Panel>
              )}

              {result && (
                <Panel
                  title="What the lab found"
                  count={`${result.findings.length} ${
                    result.findings.length === 1 ? "flag" : "flags"
                  }`}
                >
                  {result.findings.length === 0 ? (
                    <p className="text-14">
                      Nothing came up on the columns you mapped. That is an
                      answer, not a blank — it does not mean the file is right,
                      only that these checks found nothing.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {result.findings.map((finding) => (
                        <li
                          key={finding.key}
                          className="rounded-ledger border-rule bg-sunk flex flex-col gap-1 border px-3 py-2"
                        >
                          <p className="text-14 font-medium">{finding.title}</p>
                          {finding.lines.length > 0 && (
                            <ul className="text-13 text-ink-muted list-disc pl-5">
                              {finding.lines.map((line) => (
                                <li key={line}>{line}</li>
                              ))}
                            </ul>
                          )}
                          <p className="text-12 text-ink-muted">
                            {finding.note}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              )}

              {result && (
                <section className="rounded-ledger border-rule bg-sunk flex flex-col gap-2 border p-3">
                  <h3 className="text-14 font-medium">
                    Keep the summary on a job
                  </h3>
                  <p className="text-12 text-ink-muted max-w-[70ch]">
                    The file is gone the moment this page is left. This posts
                    what was read and what was found to a job&rsquo;s internal
                    thread, so a check run in March is on the record in June.
                  </p>
                  <pre className="text-12 bg-paper border-rule overflow-x-auto rounded border p-2 whitespace-pre-wrap">
                    {result.summary}
                  </pre>
                  <div className="flex flex-wrap items-end gap-2">
                    {jobs ? (
                      <label className="flex flex-col gap-1">
                        <span className="text-13 font-medium">Which job</span>
                        <select
                          value={job}
                          onChange={(event) => setJob(event.target.value)}
                          className="rounded-control border-rule bg-paper text-14 h-9 min-w-[32ch] border px-2"
                        >
                          <option value="">— choose —</option>
                          {jobs.map((row) => (
                            <option key={row.id} value={row.id}>
                              {row.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <button
                        type="button"
                        onClick={onLoadJobs}
                        disabled={pending}
                        className="rounded-control border-rule bg-surface text-14 h-9 border px-3 disabled:opacity-60"
                      >
                        Choose a job
                      </button>
                    )}
                    {jobs && (
                      <button
                        type="button"
                        onClick={onPost}
                        disabled={pending || !job}
                        className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium disabled:opacity-60"
                      >
                        Post the summary
                      </button>
                    )}
                  </div>
                </section>
              )}
            </div>

            {/* --- the checklist ---------------------------------------- */}
            <aside className="flex min-w-[18rem] flex-1 basis-[22rem] flex-col gap-4">
              <Panel
                title="What to look at"
                hint={`For a ${(KIND_LABEL[kind] ?? "sheet").toLowerCase()}`}
              >
                <ol className="flex flex-col gap-3">
                  {checklist.map((item) => {
                    const found = item.auto ? foundByKey.get(item.auto) : null;
                    return (
                      <li key={item.key} className="flex flex-col gap-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-14 font-medium">
                            {item.title}
                          </span>
                          {item.auto && (
                            <Chip
                              tone={
                                !result ? "neutral" : found ? "soon" : "good"
                              }
                            >
                              {!result
                                ? "the lab can run this"
                                : found
                                  ? "flagged"
                                  : "nothing found"}
                            </Chip>
                          )}
                        </div>
                        <p className="text-12 text-ink-muted">{item.how}</p>
                        {found && (
                          <p className="text-12 text-waiting">{found.title}</p>
                        )}
                      </li>
                    );
                  })}
                </ol>
                <p className="text-12 text-faint">
                  The lines marked <em>the lab can run this</em> are answered
                  above once you press Work it out. The rest are somebody&rsquo;s
                  work with the sheet open, and the thresholds behind any of
                  them come from the firm&rsquo;s own confirmed rules.
                </p>
              </Panel>

              <Panel title="The columns in the file">
                <ul className="flex flex-col gap-1.5">
                  {profile.columns.map((column) => (
                    <li
                      key={column.index}
                      className="text-13 flex flex-wrap items-baseline justify-between gap-2"
                    >
                      <span>{column.header}</span>
                      <span className="text-12 text-ink-muted">
                        {column.kind}
                        {column.blanks > 0 && ` · ${column.blanks} blank`}
                        {column.kind === "number" &&
                          column.total !== undefined &&
                          ` · ${new Intl.NumberFormat("en-IN", {
                            maximumFractionDigits: 0,
                          }).format(column.total)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </aside>
          </div>
        </>
      )}
    </form>
  );
}

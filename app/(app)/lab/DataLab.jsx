"use client";

import { useRef, useState, useTransition } from "react";
import {
  profileUpload,
  analyseUpload,
  jobsForSummary,
  postSummary,
} from "./actions";

/**
 * Upload, map, read (P3-20).
 *
 * The mapping step is not a formality: until somebody says which column is
 * the amount, **nothing is checked**. A tool that guesses analyses the
 * wrong column and reports it with confidence, which is worse than a tool
 * that asks one question.
 *
 * Every finding carries what it does *not* mean. A duplicate invoice
 * number is usually a credit note; a round figure is usually a round
 * figure. Something that cries wolf is something nobody opens in March.
 */
export default function DataLab() {
  const formRef = useRef(null);
  const [profile, setProfile] = useState(null);
  const [result, setResult] = useState(null);
  const [jobs, setJobs] = useState(null);
  const [job, setJob] = useState("");
  const [message, setMessage] = useState(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function onProfile(formData) {
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
    });
  }

  function onAnalyse() {
    startTransition(async () => {
      setError("");
      const response = await analyseUpload(null, new FormData(formRef.current));
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

  return (
    <form ref={formRef} action={onProfile} className="flex flex-col gap-4">
      {error && (
        <p
          role="alert"
          className="rounded-ledger border-redpen bg-redpen-wash text-13 text-redpen border px-3 py-2"
        >
          {error}
        </p>
      )}
      {message?.ok && (
        <p
          role="status"
          className="rounded-ledger border-filed bg-filed-wash text-13 text-filed border px-3 py-2"
        >
          {message.ok} It is on the job&rsquo;s internal thread.
        </p>
      )}
      {message?.error && (
        <p
          role="alert"
          className="rounded-ledger border-redpen bg-redpen-wash text-13 text-redpen border px-3 py-2"
        >
          {message.error}
        </p>
      )}

      <div className="rounded-ledger border-rule bg-surface flex flex-wrap items-end gap-3 border p-4">
        <label className="flex flex-col gap-1">
          <span className="text-13 font-medium">The spreadsheet</span>
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            className="text-14"
          />
          <span className="text-12 text-ink-muted">
            Save it as CSV UTF-8 from Excel. Up to 5 MB.
          </span>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-control border-rule bg-surface text-14 h-9 border px-3 disabled:opacity-60"
        >
          Read it
        </button>
      </div>

      {profile && (
        <section className="flex flex-col gap-3">
          <h2 className="text-15 font-bold">
            {profile.fileName} · {profile.rowCount} rows
          </h2>

          <div className="rounded-table border-rule bg-surface overflow-x-auto border">
            <table className="text-14 w-full">
              <caption className="sr-only">
                The columns in the file, and what they look like
              </caption>
              <thead>
                <tr className="border-rule text-12 text-faint border-b text-left font-normal">
                  <th className="px-3 py-2 font-medium">Column</th>
                  <th className="px-3 py-2 font-medium">Looks like</th>
                  <th className="px-3 py-2 font-medium">Filled</th>
                  <th className="px-3 py-2 font-medium">First few</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {profile.columns.map((column) => (
                  <tr
                    key={column.index}
                    className="border-rule border-b last:border-0"
                  >
                    <td className="px-3 py-2">{column.header}</td>
                    <td className="text-13 px-3 py-2">
                      {column.kind}
                      {column.kind === "date" && column.min && (
                        <span className="text-12 text-ink-muted block">
                          {column.min.slice(0, 10)} to {column.max.slice(0, 10)}
                        </span>
                      )}
                    </td>
                    <td className="text-13 px-3 py-2">
                      {column.filled}
                      {column.blanks > 0 && (
                        <span className="text-12 text-ink-muted">
                          {" "}
                          · {column.blanks} blank
                        </span>
                      )}
                    </td>
                    <td className="text-12 text-ink-muted px-3 py-2">
                      {column.sample.join(" · ")}
                    </td>
                    <td className="num text-13 px-3 py-2 text-right">
                      {column.kind === "number"
                        ? new Intl.NumberFormat("en-IN", {
                            maximumFractionDigits: 2,
                          }).format(column.total ?? 0)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
            <div>
              <h3 className="text-14 font-medium">Which column is which</h3>
              <p className="text-12 text-ink-muted max-w-[70ch]">
                Nothing is checked until you say. Only columns that could be
                each thing are offered — a text column is not offered as an
                amount, because a total of text is a lie.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {profile.roles.map((role) => (
                <label key={role.key} className="flex flex-col gap-1">
                  <span className="text-13 font-medium">{role.label}</span>
                  <select
                    name={`map.${role.key}`}
                    defaultValue=""
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
                Check it
              </button>
            </div>
          </div>
        </section>
      )}

      {result && (
        <section className="flex flex-col gap-3">
          <h2 className="text-15 font-bold">
            What is worth looking at · {result.rowCount} rows
          </h2>

          {result.findings.length === 0 ? (
            <p className="rounded-ledger border-rule bg-surface text-14 border px-3 py-4">
              Nothing came up on the columns you mapped. That is an answer, not
              a blank — it does not mean the file is right, only that these
              checks found nothing.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {result.findings.map((finding) => (
                <li
                  key={finding.key}
                  className="rounded-ledger border-rule bg-surface flex flex-col gap-1 border px-3 py-2"
                >
                  <p className="text-14 font-medium">{finding.title}</p>
                  {finding.lines.length > 0 && (
                    <ul className="text-13 text-ink-muted list-disc pl-5">
                      {finding.lines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  )}
                  <p className="text-12 text-ink-muted">{finding.note}</p>
                </li>
              ))}
            </ul>
          )}

          <div className="rounded-ledger border-rule bg-sunk flex flex-col gap-2 border p-3">
            <h3 className="text-14 font-medium">Keep the summary on a job</h3>
            <p className="text-12 text-ink-muted max-w-[70ch]">
              The file is gone the moment this page is left. This posts what was
              read and what was found to a job&rsquo;s internal thread, so a
              check run in March is on the record in June.
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
          </div>
        </section>
      )}
    </form>
  );
}

"use client";

import { useState, useTransition } from "react";
import { formatPaise } from "@/lib/money";
import { TEAM_COLUMNS, teamTemplateRows } from "@/lib/migration/team";
import {
  OPENING_COLUMNS,
  openingTemplateRows,
} from "@/lib/migration/openingBalances";
import {
  checkTeamSheet,
  importTeam,
  checkOpeningSheet,
  importOpeningBalances,
} from "./actions";

/**
 * The two go-live imports, each with the same three steps the client
 * import uses: paste or choose the sheet, read what is wrong with it, then
 * write it.
 *
 * Nothing is written until the second button. The preview is the point —
 * a migration that half-succeeds is worse than one that refuses, because
 * somebody then has to work out which half.
 */
export default function Migration() {
  return (
    <div className="flex flex-col gap-8">
      <Importer
        title="The team"
        what="One row per person. Partners are not created this way — add them on the Team screen, where it is a deliberate act."
        columns={TEAM_COLUMNS}
        template={teamTemplateRows()}
        onCheck={checkTeamSheet}
        onImport={importTeam}
        renderRow={(row) => (
          <>
            <td className="px-3 py-2">{row.name}</td>
            <td className="text-13 px-3 py-2">{row.value?.email}</td>
            <td className="text-13 px-3 py-2">{row.roleLabel}</td>
          </>
        )}
        headers={["Name", "Email", "Role"]}
      />

      <Importer
        title="Opening balances"
        what="What each client owed you on the day you switch over. They come in as invoices in their own OB/ series, outside your GST numbering, so the receivables and ageing reports are right from day one."
        columns={OPENING_COLUMNS}
        template={openingTemplateRows()}
        onCheck={checkOpeningSheet}
        onImport={importOpeningBalances}
        renderRow={(row) => (
          <>
            <td className="px-3 py-2">{row.clientName || row.clientCode}</td>
            <td className="text-13 px-3 py-2 font-mono">
              {row.value?.originalNumber}
            </td>
            <td className="num text-13 px-3 py-2 text-right">
              {formatPaise(row.value?.amountPaise ?? 0)}
            </td>
          </>
        )}
        headers={["Client", "Their old number", "Outstanding"]}
        summary={(result) =>
          result.totalPaise
            ? `${formatPaise(result.totalPaise)} in total.`
            : null
        }
      />
    </div>
  );
}

function Importer({
  title,
  what,
  columns,
  template,
  onCheck,
  onImport,
  renderRow,
  headers,
  summary,
}) {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  const templateCsv = template
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-display text-20">{title}</h2>
        <p className="text-13 text-ink-muted">{what}</p>
      </div>

      {message?.ok && (
        <p
          role="status"
          className="rounded-ledger border-filed bg-filed-wash text-13 text-filed border px-3 py-2"
        >
          {message.ok}
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

      {message?.created && (
        <div className="rounded-ledger border-brass bg-surface border p-3">
          <p className="text-13 font-medium">
            Read these out now. They are shown only here, once.
          </p>
          <table className="text-14 mt-2 w-full">
            <tbody>
              {message.created.map((person) => (
                <tr
                  key={person.email}
                  className="border-rule border-b last:border-0"
                >
                  <td className="px-2 py-1">{person.name}</td>
                  <td className="text-13 text-ink-muted px-2 py-1">
                    {person.role}
                  </td>
                  <td className="px-2 py-1 font-mono">{person.password}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details className="rounded-ledger border-rule bg-surface border p-3">
        <summary className="text-14 cursor-pointer font-medium">
          What the sheet needs to look like
        </summary>
        <p className="text-13 text-ink-muted mt-2">
          Columns: <code className="font-mono">{columns.join(", ")}</code>. In
          Excel, use <strong>Save as → CSV UTF-8</strong>, then paste the file
          contents below or choose the file.
        </p>
        <pre className="bg-paper text-12 mt-2 overflow-x-auto rounded p-2 font-mono">
          {templateCsv}
        </pre>
      </details>

      <label className="flex flex-col gap-1">
        <span className="text-13 text-ink-muted font-medium">
          Paste the sheet here
        </span>
        <textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setResult(null);
          }}
          rows={6}
          className="rounded-ledger border-rule bg-paper text-13 border px-2 py-1 font-mono"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label={`Choose a ${title.toLowerCase()} file`}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setText(await file.text());
            setResult(null);
          }}
          className="text-13"
        />
        <button
          type="button"
          disabled={pending || !text.trim()}
          onClick={() =>
            startTransition(async () => {
              setMessage(null);
              setResult(await onCheck(text));
            })
          }
          className="rounded-ledger border-rule text-14 h-9 border px-3 font-medium disabled:opacity-60"
        >
          Check it
        </button>
      </div>

      {result && (
        <div className="flex flex-col gap-2">
          <p className="text-14">
            <strong className="num">{result.readyCount}</strong> ready
            {result.errorCount > 0 && (
              <span className="text-redpen">
                {" "}
                · <span className="num">{result.errorCount}</span> with
                problems
              </span>
            )}
            {result.skippedCount > 0 && (
              <span className="text-waiting">
                {" "}
                · <span className="num">{result.skippedCount}</span> skipped
              </span>
            )}
            {summary?.(result) ? ` · ${summary(result)}` : ""}
          </p>

          {result.unknownHeaders?.length > 0 && (
            <p className="text-13 text-waiting">
              These columns are not understood and will be ignored:{" "}
              {result.unknownHeaders.join(", ")}
            </p>
          )}

          <div className="rounded-ledger border-rule bg-surface max-h-80 overflow-auto border">
            <table className="text-14 w-full">
              <thead>
                <tr className="border-rule text-12 text-ink-muted border-b text-left tracking-wide uppercase">
                  <th scope="col" className="px-3 py-2 font-medium">
                    Row
                  </th>
                  {headers.map((header) => (
                    <th key={header} scope="col" className="px-3 py-2 font-medium">
                      {header}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2 font-medium">
                    Problems
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr
                    key={row.line}
                    className={`border-rule border-b last:border-0 ${
                      row.errors.length > 0 ? "bg-redpen-wash" : ""
                    }`}
                  >
                    <td className="num text-13 px-3 py-2">{row.line}</td>
                    {renderRow(row)}
                    <td className="text-13 px-3 py-2">
                      {row.errors.length > 0 && (
                        <span className="text-redpen">
                          {row.errors.join("; ")}
                        </span>
                      )}
                      {row.warnings?.length > 0 && (
                        <span className="text-waiting">
                          {row.warnings.join("; ")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.readyCount > 0 && (
            <div>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const outcome = await onImport(text);
                    setMessage(outcome);
                    if (outcome?.ok) {
                      setResult(null);
                      setText("");
                    }
                  })
                }
                className="rounded-ledger bg-carbon text-14 h-9 px-3 font-medium text-white disabled:opacity-60"
              >
                {pending
                  ? "Importing…"
                  : `Import the ${result.readyCount} that are ready`}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

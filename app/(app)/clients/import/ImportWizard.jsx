"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewImport, commitImport } from "./actions";

/**
 * Upload, preview, then import (spec section 3: "bulk import with a
 * validation preview").
 *
 * The same file element is used for both steps, so the file is read fresh on
 * commit rather than being parked on the server between two requests.
 */
export default function ImportWizard() {
  const router = useRouter();
  const formRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function onPreview(formData) {
    startTransition(async () => {
      setError("");
      setResult(null);
      const response = await previewImport(null, formData);
      if (response.error) {
        setPreview(null);
        setError(response.error);
        return;
      }
      setPreview(response);
    });
  }

  function onCommit() {
    startTransition(async () => {
      setError("");
      const formData = new FormData(formRef.current);
      const response = await commitImport(null, formData);
      if (response.error) {
        setError(response.error);
        return;
      }
      setResult(response);
      setPreview(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <form
        ref={formRef}
        action={onPreview}
        className="rounded-ledger border-rule bg-surface flex flex-wrap items-end gap-3 border p-4"
      >
        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">
            Your CSV file
          </span>
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            onChange={() => {
              setPreview(null);
              setResult(null);
              setError("");
            }}
            className="rounded-ledger border-rule bg-paper text-14 border p-2"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-control bg-carbon text-14 text-on-carbon h-10 px-4 font-medium disabled:opacity-60"
        >
          {pending ? "Checking…" : "Check the file"}
        </button>
      </form>

      {error && (
        <p
          role="alert"
          className="rounded-ledger border-redpen bg-redpen-wash text-14 text-redpen border px-3 py-2"
        >
          {error}
        </p>
      )}

      {result && (
        <div className="rounded-ledger border-filed bg-filed-wash border p-4">
          <p role="status" className="text-14 text-filed font-medium">
            {result.ok}
          </p>
          {result.skipped?.length > 0 && (
            <>
              <p className="text-13 text-ink-muted mt-2">
                {result.skipped.length} row
                {result.skipped.length === 1 ? "" : "s"} skipped:
              </p>
              <ul className="mt-1 flex flex-col gap-1">
                {result.skipped.map((s) => (
                  <li key={s} className="text-13 text-ink-muted">
                    {s}
                  </li>
                ))}
              </ul>
            </>
          )}
          <a
            href="/clients"
            className="text-14 text-carbon mt-3 inline-block hover:underline"
          >
            Go to the client list →
          </a>
        </div>
      )}

      {preview && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="num text-14">
              <strong className="text-filed">{preview.readyCount}</strong> ready
              to import
              {preview.errorCount > 0 && (
                <>
                  {" · "}
                  <strong className="text-redpen">
                    {preview.errorCount}
                  </strong>{" "}
                  with problems, which will be skipped
                </>
              )}
            </p>
            <button
              type="button"
              disabled={pending || preview.readyCount === 0}
              onClick={onCommit}
              className="rounded-control bg-carbon text-14 text-on-carbon h-10 px-4 font-medium disabled:opacity-60"
            >
              {pending
                ? "Importing…"
                : `Import ${preview.readyCount} client${preview.readyCount === 1 ? "" : "s"}`}
            </button>
          </div>

          {preview.unknownHeaders?.length > 0 && (
            <p className="rounded-ledger border-waiting bg-waiting-wash text-13 text-waiting border px-3 py-2">
              These columns were not recognised and will be ignored:{" "}
              {preview.unknownHeaders.join(", ")}
            </p>
          )}

          <div className="rounded-table border-rule bg-surface overflow-x-auto border">
            <table className="text-14 w-full">
              <thead>
                <tr className="border-rule text-12 text-faint border-b text-left font-normal">
                  <th className="px-3 py-2 font-medium">Row</th>
                  <th className="px-3 py-2 font-medium">Group</th>
                  <th className="px-3 py-2 font-medium">Client</th>
                  <th className="px-3 py-2 font-medium">PAN</th>
                  <th className="px-3 py-2 font-medium">GST</th>
                  <th className="px-3 py-2 font-medium">Contacts</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr
                    key={row.line}
                    className={`border-rule border-b last:border-0 ${
                      row.errors.length ? "bg-redpen-wash" : ""
                    }`}
                  >
                    <td className="num px-3 py-2 align-top">{row.line}</td>
                    <td className="text-13 px-3 py-2 align-top">
                      {row.group || "—"}
                    </td>
                    <td className="px-3 py-2 align-top">{row.name}</td>
                    <td className="text-13 px-3 py-2 align-top font-mono">
                      {row.pan || "—"}
                    </td>
                    <td className="text-13 px-3 py-2 align-top font-mono">
                      {row.gstins.length ? row.gstins.join(" ") : "—"}
                    </td>
                    <td className="num px-3 py-2 align-top">{row.contacts}</td>
                    <td className="text-13 px-3 py-2 align-top">
                      {row.errors.length === 0 ? (
                        <span className="text-filed">Ready</span>
                      ) : (
                        <ul className="flex flex-col gap-0.5">
                          {row.errors.map((e) => (
                            <li key={e} className="text-redpen">
                              {e}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

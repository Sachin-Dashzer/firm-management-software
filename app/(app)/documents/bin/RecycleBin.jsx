"use client";

import { useState, useTransition } from "react";
import { purgeDocument, restoreDocument } from "../actions";
import { restoreFolder } from "../folders/actions";

/**
 * The bin. Restoring is one click; erasing asks first, because it is the
 * only thing in the app that cannot be undone.
 *
 * Folders sit above the files (P3-48c) because restoring one brings its
 * files back with it: a person looking for a file that went down with its
 * folder should find the folder first and be done, rather than restoring
 * fourteen files into a folder that is not there.
 */
export default function RecycleBin({ rows, folders = [] }) {
  const [message, setMessage] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [pending, startTransition] = useTransition();

  function run(action) {
    startTransition(async () => {
      setMessage(await action());
      setConfirming(null);
    });
  }

  return (
    <div className="flex flex-col gap-3">
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

      {folders.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-15 font-semibold">
            Folders ({folders.length})
          </h2>
          <div className="rounded-table border-rule bg-surface overflow-x-auto border">
            <table className="text-14 w-full">
              <thead>
                <tr className="border-rule text-12 text-faint border-b text-left font-normal">
                  <th className="px-3 py-2 font-medium">Folder</th>
                  <th className="px-3 py-2 font-medium">Where it was</th>
                  <th className="px-3 py-2 font-medium">Holding</th>
                  <th className="px-3 py-2 font-medium">Deleted</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {folders.map((f) => (
                  <tr key={f.id} className="border-rule border-b last:border-0">
                    <td className="px-3 py-2">{f.name}</td>
                    <td className="text-13 px-3 py-2">{f.where}</td>
                    <td className="text-13 px-3 py-2">
                      {f.files === 0 && f.folders === 0
                        ? "nothing"
                        : [
                            f.files
                              ? `${f.files} file${f.files === 1 ? "" : "s"}`
                              : "",
                            f.folders
                              ? `${f.folders} folder${f.folders === 1 ? "" : "s"}`
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                    </td>
                    <td className="num text-13 px-3 py-2">{f.deletedOn}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => restoreFolder(f.id))}
                        className="text-13 underline underline-offset-4 disabled:opacity-60"
                      >
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-13 text-ink-muted">
            Restoring a folder brings back the files that went into the bin with
            it, in one go. Those files are listed below as well — restore one on
            its own and it comes back to the nearest folder still there, which
            the message will name.
          </p>
        </section>
      )}

      <div className="rounded-table border-rule bg-surface overflow-x-auto border">
        <table className="text-14 w-full">
          <thead>
            <tr className="border-rule text-12 text-faint border-b text-left font-normal">
              <th className="px-3 py-2 font-medium">File</th>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Deleted</th>
              <th className="px-3 py-2 font-medium">Erased on</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-rule border-b last:border-0">
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2">{r.client}</td>
                <td className="num text-13 px-3 py-2">{r.deletedOn}</td>
                <td className="num text-13 px-3 py-2">
                  {r.purged ? (
                    <span className="text-ink-muted">already erased</span>
                  ) : (
                    <>
                      {r.purgeOn}
                      <span className="text-ink-muted">
                        {" "}
                        · {r.daysLeft} days left
                      </span>
                    </>
                  )}
                </td>
                <td className="px-3 py-2">
                  {r.purged ? (
                    <span className="text-13 text-ink-muted">—</span>
                  ) : confirming === r.id ? (
                    <span className="text-13 flex flex-wrap items-center gap-2">
                      <span className="text-redpen">Erase for good?</span>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => purgeDocument(r.id))}
                        className="rounded-control border-redpen text-redpen h-8 border px-2"
                      >
                        Yes, erase it
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        className="underline underline-offset-4"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <span className="text-13 flex gap-3">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => restoreDocument(r.id))}
                        className="underline underline-offset-4 disabled:opacity-60"
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(r.id)}
                        className="underline underline-offset-4"
                      >
                        Erase
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="text-ink-muted px-3 py-6 text-center"
                >
                  The bin is empty.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

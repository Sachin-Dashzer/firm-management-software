"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { attachToJob } from "@/app/(app)/documents/folders/actions";

/**
 * The papers filed for this client, service and year that are on no job
 * (brief §4, decision D-F4).
 *
 * **They are not attached by themselves.** Papers collected for a year are
 * not necessarily the right papers for one return — the statements for
 * April belong to April's GSTR-3B and not to the audit — and a system that
 * guesses wrongly is worse than a quiet line asking somebody to look.
 *
 * So this is a sentence and a button, not an automation.
 */
export default function AttachWaiting({ jobPath, files = [] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  if (files.length === 0) return null;

  function attach() {
    setError("");
    start(async () => {
      const result = await attachToJob(
        jobPath,
        files.map((file) => file.id),
      );
      if (result?.error) return setError(result.error);
      router.refresh();
    });
  }

  return (
    <div className="rounded-ledger border-rule bg-sunk flex flex-wrap items-center gap-x-3 gap-y-1 border px-3 py-2">
      <p className="text-13 min-w-0 flex-1">
        {files.length} {files.length === 1 ? "file is" : "files are"} filed
        under this service and year but on no job
        <span className="text-ink-muted">
          {" — "}
          {files
            .slice(0, 3)
            .map((file) => file.name)
            .join(", ")}
          {files.length > 3 ? ` and ${files.length - 3} more` : ""}
        </span>
        .
      </p>
      <button
        type="button"
        onClick={attach}
        disabled={pending}
        className="rounded-control border-carbon text-carbon hover:bg-carbon-soft text-13 h-8 shrink-0 border px-3 font-medium transition-colors duration-150 ease-out disabled:opacity-60"
      >
        {pending ? "Attaching…" : "Attach them"}
      </button>
      {error && (
        <p role="alert" className="text-13 text-redpen basis-full">
          {error}
        </p>
      )}
    </div>
  );
}

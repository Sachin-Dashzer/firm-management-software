"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, ArrowClockwise } from "@phosphor-icons/react";
import { sendUpload } from "@/components/documents/sendUpload";
import { ensureFolderPath } from "@/app/(app)/documents/folders/actions";
import { droppedPaths } from "@/lib/folders/dropped";
import { formatSize } from "@/lib/documents/rows";

/** Three at a time: enough to use the line, few enough to still cancel. */
const AT_ONCE = 3;

/**
 * Files on their way into a folder (P3-48d).
 *
 * The queue exists because an upload is not one thing that either worked or
 * did not. Two hundred scans go up over several minutes, one of them is a
 * 40 MB TIFF nobody meant to include, another fails because the line
 * dropped, and the person needs to see **which** — so each file carries its
 * own state, its own progress and its own Retry, and the ones that cannot
 * go say why before anything is sent.
 *
 * Refusals are found **before the first byte leaves**: size and type are
 * checked here against the same limits the server applies, so a person is
 * not told about the 40 MB file after waiting for the other hundred.
 */
export default function UploadQueue({
  folderPath,
  /** What is already in this folder, as {id, name}: a clash needs both. */
  existing = [],
  /** The server's own limits, handed down so both sides agree exactly. */
  maxBytes = 25 * 1024 * 1024,
  allowed = [],
  onClose,
  onDone,
}) {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const running = useRef(0);
  const cancels = useRef(new Map());

  const update = useCallback((id, patch) => {
    setItems((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }, []);

  /** Start whatever is waiting, up to three at once. */
  useEffect(() => {
    const waiting = items.filter((row) => row.state === "waiting");
    if (!waiting.length || running.current >= AT_ONCE) return;

    for (const row of waiting.slice(0, AT_ONCE - running.current)) {
      running.current += 1;
      update(row.id, { state: "sending", progress: 0 });

      const controller = new AbortController();
      cancels.current.set(row.id, controller);

      sendUpload(
        row.file,
        {
          // the folder it came in, where it came in one; otherwise here
          folderPath: row.targetPath ?? folderPath,
          origin: row.origin,
          name: row.name,
          replacesId: row.replacesId,
        },
        {
          signal: controller.signal,
          onProgress: (fraction) => update(row.id, { progress: fraction }),
        },
      )
        .then((result) => {
          update(
            row.id,
            result?.error
              ? { state: "failed", error: result.error }
              : { state: "done", progress: 1 },
          );
        })
        /*
          A thrown upload has to land somewhere. Without this the row sits
          at "sending" for ever — no error, no Try again, and the queue
          never settles, so the folder is never refreshed either. That is
          how a server fault in `confirmUpload` read as a hung screen.
        */
        .catch((err) => {
          update(row.id, {
            state: "failed",
            error: err?.message || "It did not go up.",
          });
        })
        .finally(() => {
          running.current -= 1;
          cancels.current.delete(row.id);
          setItems((rows) => [...rows]); // nudge the effect to start the next
        });
    }
  }, [items, folderPath, update]);

  /** When everything has settled, show the folder as it now is. */
  useEffect(() => {
    if (!items.length) return;
    if (
      items.some((row) =>
        ["preparing", "waiting", "sending"].includes(row.state),
      )
    ) {
      return;
    }
    if (items.some((row) => row.state === "done")) {
      router.refresh();
      onDone?.();
    }
  }, [items, router, onDone]);

  async function add(files, { paths = new Map() } = {}) {
    /*
      A name only clashes with what will land *beside* it. Files from a
      dropped folder go into that folder, so they are checked against their
      own folder — and a folder being made is empty, which is why only the
      files aimed at this folder are checked against what is already here.
    */
    const taken = new Set(
      [
        ...existing.map((e) => e.name),
        ...items.filter((row) => !row.from).map((row) => row.name),
      ].map((n) => String(n).toLowerCase()),
    );

    const rows = [...files].map((file) => {
      const from = paths.get(file) ?? "";
      const refusal = refuse(file, maxBytes, allowed);
      const clash = !refusal && !from && taken.has(file.name.toLowerCase());
      if (!refusal && !clash && !from) taken.add(file.name.toLowerCase());

      return {
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
        file,
        name: file.name,
        from,
        origin: "client",
        progress: 0,
        // a file with a folder behind it waits for that folder to exist
        state: refusal
          ? "refused"
          : clash
            ? "clash"
            : from
              ? "preparing"
              : "waiting",
        error: refusal ?? "",
      };
    });

    setItems((old) => [...old, ...rows]);

    /*
      One call per distinct folder, not per file: two hundred scans in six
      folders is six calls, and the second file in a folder reuses what the
      first one made rather than racing it.
    */
    const dirs = [
      ...new Set(
        rows.filter((r) => r.state === "preparing").map((r) => r.from),
      ),
    ];

    for (const dir of dirs) {
      const made = await ensureFolderPath(folderPath, dir.split("/")).catch(
        /*
          A thrown action is still an answer. Without this the files it was
          making a folder for sit at "making the folder" for ever, with no
          error and no Try again — the one state a queue must never reach.
        */
        (err) => ({ error: err?.message || "The folder could not be made." }),
      );
      setItems((old) =>
        old.map((row) =>
          row.from === dir && row.state === "preparing"
            ? made?.error
              ? { ...row, state: "failed", error: made.error }
              : { ...row, state: "waiting", targetPath: made.path }
            : row,
        ),
      );
    }
  }

  /**
   * Try a failed file again — and if what failed was making its folder,
   * make the folder again first. Without this it would quietly retry into
   * the folder being looked at, which is the flattening this fixed.
   */
  async function retry(row) {
    if (row.from && !row.targetPath) {
      update(row.id, { state: "preparing", error: "" });
      const made = await ensureFolderPath(folderPath, row.from.split("/"));
      update(
        row.id,
        made?.error
          ? { state: "failed", error: made.error }
          : { state: "waiting", targetPath: made.path },
      );
      return;
    }
    update(row.id, { state: "waiting", error: "" });
  }

  /** A name already here: keep both, replace what is there, or skip. */
  function resolve(id, how) {
    setItems((rows) =>
      rows.map((row) => {
        if (row.id !== id) return row;
        if (how === "skip") return { ...row, state: "skipped" };
        if (how === "replace") {
          const here = existing.find(
            (e) => String(e.name).toLowerCase() === row.name.toLowerCase(),
          );
          return { ...row, state: "waiting", replacesId: here?.id };
        }
        return {
          ...row,
          state: "waiting",
          name: besideIt(
            row.name,
            existing.map((e) => e.name),
          ),
        };
      }),
    );
  }

  const settled = items.filter((row) =>
    ["done", "failed", "refused", "skipped"].includes(row.state),
  ).length;

  return (
    <section
      aria-label="Files going up"
      className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-14 font-medium">
          {items.length
            ? `${settled} of ${items.length} done`
            : "Choose the files"}
        </h2>
        <div className="flex items-center gap-2">
          <PickFiles onPick={add} />
          <PickFolder onPick={add} />
          <button
            type="button"
            onClick={onClose}
            className="rounded-control hover:bg-sunk text-ink-muted flex h-8 w-8 items-center justify-center transition-colors duration-150 ease-out"
            aria-label="Close the upload list"
          >
            <X size={14} weight="bold" aria-hidden="true" />
          </button>
        </div>
      </div>

      {items.length > 0 && (
        <ul className="divide-rule flex flex-col divide-y">
          {items.map((row) => (
            <li key={row.id} className="flex flex-col gap-1 py-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-13 min-w-0 flex-1 break-words">
                  {row.from ? `${row.from}/` : ""}
                  {row.name}
                </span>
                <span className="num text-12 text-ink-muted">
                  {formatSize(row.file.size)}
                </span>
                <State
                  row={row}
                  onRetry={() => retry(row)}
                  onCancel={() => cancels.current.get(row.id)?.abort()}
                />
              </div>

              {row.state === "sending" && (
                <div className="bg-sunk h-1 w-full overflow-hidden rounded">
                  <div
                    className="bg-carbon h-full transition-[width] duration-200 ease-out"
                    style={{ width: `${Math.round(row.progress * 100)}%` }}
                  />
                </div>
              )}

              {row.state === "clash" && (
                <p className="text-12 flex flex-wrap items-center gap-2">
                  <span className="text-waiting">
                    A file of that name is already here.
                  </span>
                  <Choice onClick={() => resolve(row.id, "both")}>
                    Keep both
                  </Choice>
                  <Choice onClick={() => resolve(row.id, "replace")}>
                    Replace it
                  </Choice>
                  <Choice onClick={() => resolve(row.id, "skip")}>Skip</Choice>
                </p>
              )}

              {row.error && (
                <p role="alert" className="text-12 text-redpen">
                  {row.error}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function State({ row, onRetry, onCancel }) {
  if (row.state === "sending") {
    return (
      <button
        type="button"
        onClick={onCancel}
        className="text-12 text-ink-muted underline underline-offset-4"
      >
        Cancel
      </button>
    );
  }
  if (row.state === "failed") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="rounded-control border-rule hover:bg-sunk text-12 flex h-7 items-center gap-1 border px-2 transition-colors duration-150 ease-out"
      >
        <ArrowClockwise size={12} weight="bold" aria-hidden="true" />
        Try again
      </button>
    );
  }
  const word = {
    preparing: "making the folder",
    waiting: "waiting",
    done: "in",
    refused: "not accepted",
    skipped: "skipped",
    clash: "",
  }[row.state];
  return word ? (
    <span
      className={`text-12 ${row.state === "done" ? "text-filed" : "text-ink-muted"}`}
    >
      {word}
    </span>
  ) : null;
}

function Choice({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-control border-rule hover:bg-sunk h-7 border px-2 transition-colors duration-150 ease-out"
    >
      {children}
    </button>
  );
}

function PickFiles({ onPick }) {
  const input = useRef(null);
  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="rounded-control border-rule hover:bg-sunk text-13 h-8 border px-3 transition-colors duration-150 ease-out"
      >
        Add files
      </button>
      <input
        ref={input}
        type="file"
        multiple
        className="sr-only"
        aria-label="Files to upload"
        onChange={(event) => {
          onPick(event.target.files ?? []);
          event.target.value = "";
        }}
      />
    </>
  );
}

/**
 * A whole folder from the computer.
 *
 * `webkitdirectory` is the only way a browser offers this, and the files
 * arrive flat, each with its path in `webkitRelativePath` — the folders
 * themselves are never sent. The queue rebuilds them from those paths
 * before any file goes up (`ensureFolderPath`), so a folder dropped on the
 * drive arrives as that folder and not as a heap of its contents.
 */
function PickFolder({ onPick }) {
  const input = useRef(null);
  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="rounded-control border-rule hover:bg-sunk text-13 h-8 border px-3 transition-colors duration-150 ease-out"
      >
        Add a folder
      </button>
      <input
        ref={input}
        type="file"
        webkitdirectory=""
        directory=""
        multiple
        className="sr-only"
        aria-label="A folder to upload"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          onPick(files, { paths: droppedPaths(files) });
          event.target.value = "";
        }}
      />
    </>
  );
}

/**
 * The same checks the server applies, applied before anything is sent.
 *
 * The limits come down from the server rather than being written again
 * here, because two copies of a number is one wrong refusal away from a
 * person being told their file is too big when it is not.
 */
function refuse(file, maxBytes, allowed) {
  if (!file.size) return "It is empty.";
  if (file.size > maxBytes) {
    return `It is ${Math.round(file.size / 1024 / 1024)} MB, and the limit is ${Math.round(maxBytes / 1024 / 1024)} MB.`;
  }
  if (allowed.length && !allowed.includes(file.type)) {
    return `${file.type || "That kind of file"} is not accepted.`;
  }
  return "";
}

/** "Bank statement.pdf" beside one of the same name becomes "(2)". */
function besideIt(name, taken) {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  const names = new Set(taken.map((n) => String(n).toLowerCase()));

  for (let n = 2; n < 100; n += 1) {
    const candidate = `${stem} (${n})${ext}`;
    if (!names.has(candidate.toLowerCase())) return candidate;
  }
  return `${stem} (${Date.now()})${ext}`;
}

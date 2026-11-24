"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Folder } from "@phosphor-icons/react";
import {
  moveDocument,
  moveFolder,
  moveTargets,
} from "@/app/(app)/documents/folders/actions";

/**
 * Where this should go instead (P3-48d).
 *
 * **The list is only places the move would actually be allowed** — the same
 * zone, the same client, never inside itself — because the rules are asked
 * of the server before the list is drawn. A picker that offers a place and
 * then refuses it teaches people that the screen is guessing.
 *
 * A flat list with indentation rather than an unfolding tree: the list is
 * short, it is all visible at once, and a tree is a widget to learn before
 * you can file a bank statement. It is also why this works on a keyboard
 * without any work — it is a list of buttons.
 */
export default function MoveDialog({ subject, onClose }) {
  const router = useRouter();
  const [targets, setTargets] = useState(null);
  const [error, setError] = useState("");
  /** The server's own question, when a move would un-tick a checklist. */
  const [asking, setAsking] = useState(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    moveTargets(
      subject.kind === "folder"
        ? { folderId: subject.id }
        : { documentId: subject.id },
    ).then((result) => {
      if (!alive) return;
      if (result?.error) setError(result.error);
      else setTargets(result.targets);
    });
    return () => {
      alive = false;
    };
  }, [subject]);

  function move(target, confirmed = false) {
    setError("");
    start(async () => {
      const result =
        subject.kind === "folder"
          ? await moveFolder(subject.id, target.path)
          : await moveDocument(subject.id, target.path, { confirmed });

      /*
        The server asks before it un-ticks a checklist item, and the
        question is shown here rather than in the browser's own dialog —
        which this app uses nowhere, and which could not name the item that
        is about to lose its answer.
      */
      if (result?.confirm) return setAsking({ target, text: result.confirm });
      if (result?.error) return setError(result.error);

      router.refresh();
      onClose?.();
    });
  }

  return (
    <section
      aria-label={`Move ${subject.label}`}
      className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-14 font-medium">
          Move <span className="font-semibold">{subject.label}</span> to
        </h2>
        <button
          type="button"
          onClick={() => onClose?.()}
          className="rounded-control border-rule hover:bg-sunk text-13 h-8 border px-3 transition-colors duration-150 ease-out"
        >
          Cancel
        </button>
      </div>

      {error && (
        <p role="alert" className="text-13 text-redpen">
          {error}
        </p>
      )}

      {asking && (
        <div className="rounded-ledger border-waiting bg-waiting-wash flex flex-wrap items-center gap-2 border p-2">
          <p className="text-13 min-w-0 flex-1">{asking.text}</p>
          <button
            type="button"
            disabled={pending}
            onClick={() => move(asking.target, true)}
            className="rounded-control border-waiting text-13 h-8 border px-3 font-medium disabled:opacity-60"
          >
            Move it anyway
          </button>
          <button
            type="button"
            onClick={() => setAsking(null)}
            className="text-13 underline underline-offset-4"
          >
            Leave it
          </button>
        </div>
      )}

      {targets === null && !error && (
        <p className="text-13 text-ink-muted">Reading the places it may go…</p>
      )}

      {targets?.length === 0 && (
        <p className="text-13 text-ink-muted">
          There is nowhere else it may go. A folder stays with the client whose
          papers it holds.
        </p>
      )}

      {targets && targets.length > 0 && (
        <ul className="divide-rule border-rule rounded-table max-h-72 divide-y overflow-y-auto border">
          {targets.map((target) => (
            <li key={target.path.join("/")}>
              <button
                type="button"
                disabled={pending}
                onClick={() => move(target)}
                style={{ paddingLeft: `${0.75 + target.depth * 1}rem` }}
                className="hover:bg-sunk text-14 flex w-full items-center gap-2 py-2 pr-3 text-left transition-colors duration-150 ease-out disabled:opacity-60"
              >
                <Folder
                  size={15}
                  weight="fill"
                  aria-hidden="true"
                  className="text-carbon shrink-0"
                />
                {target.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

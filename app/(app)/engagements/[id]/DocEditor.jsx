"use client";

import { useEffect, useState, useTransition } from "react";
import Notice from "@/components/ui/Notice";
import { previewDoc, saveDraftText } from "../../docs/actions";

/**
 * One box with the words of a letter in it (owner, 13-11-2026).
 *
 * The Files tab corrects a letter here and the Letters tab writes a new
 * one here. It is deliberately small: a heading, the words, and one
 * button. Everything a letter can also do — issue it, send it, print it,
 * throw it away — belongs to the screen that opened this, not to the
 * typing.
 *
 * It fetches its own text rather than being handed it, because what a
 * draft currently reads as is a server question: an untouched draft is
 * re-resolved from the client's record every time it is opened, and one
 * somebody has written in reads back as their words. The caller would
 * only have to ask the same question to answer it.
 */
export default function DocEditor({
  docId,
  /** Shown on the save button; the parent says what saving means here. */
  saveLabel = "Save the wording",
  onSaved,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [gaps, setGaps] = useState([]);
  const [draft, setDraft] = useState({ title: "", bodyText: "" });
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    previewDoc(docId).then((result) => {
      if (!alive) return;
      setLoading(false);
      if (result?.error) return setError(result.error);
      setDraft({ title: result.title ?? "", bodyText: result.text ?? "" });
      setGaps(result.gaps ?? []);
    });
    return () => {
      alive = false;
    };
  }, [docId]);

  if (loading) {
    return <p className="text-13 text-ink-muted">Reading the letter…</p>;
  }
  if (error) {
    return (
      <p role="alert" className="text-13 text-redpen">
        {error}
      </p>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await saveDraftText(docId, formData);
          if (result?.error) return setError(result.error);
          onSaved?.(result);
        });
      }}
      className="flex flex-col gap-3"
    >
      {gaps.length > 0 && (
        <Notice tone="warn" title="Some blanks need filling in">
          <p>
            {gaps.map((gap) => gap.label ?? gap).join(", ")}. Type them in below
            — anything still in square brackets is a blank.
          </p>
        </Notice>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-12 text-ink-muted font-medium">Heading</span>
        <input
          name="title"
          value={draft.title}
          onChange={(event) =>
            setDraft({ ...draft, title: event.target.value })
          }
          className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-12 text-ink-muted font-medium">The letter</span>
        <textarea
          name="bodyText"
          required
          rows={16}
          value={draft.bodyText}
          onChange={(event) =>
            setDraft({ ...draft, bodyText: event.target.value })
          }
          className="rounded-ledger border-rule bg-paper text-13 border p-3 leading-relaxed"
        />
      </label>

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-4 font-medium disabled:opacity-60"
        >
          {pending ? "Saving…" : saveLabel}
        </button>
      </div>
    </form>
  );
}

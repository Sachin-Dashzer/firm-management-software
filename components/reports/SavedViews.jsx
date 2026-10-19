"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveView, deleteView } from "@/app/(app)/reports/views";

/**
 * Saved filters (spec section 10: "Ludhiana GST overdue, so common
 * lookups are one click").
 *
 * The filters being in the URL is what makes this three lines of state:
 * saving a view stores the query string, and using one is an ordinary
 * link. Nothing here needs to know what the filters mean.
 */
export default function SavedViews({
  reportKey,
  views,
  search,
  canShare,
  base,
}) {
  const router = useRouter();
  const [naming, setNaming] = useState(false);
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  const path = base ?? `/reports/${reportKey}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {views.length > 0 && (
          <span className="text-12 text-ink-muted tracking-wide uppercase">
            Saved
          </span>
        )}

        {views.map((view) => (
          <span
            key={view.id}
            className="rounded-ledger border-rule bg-surface text-13 flex items-center gap-1 border px-2 py-1"
          >
            <Link
              href={view.search ? `${path}?${view.search}` : path}
              className="underline underline-offset-4"
            >
              {view.name}
            </Link>
            {view.shared && (
              <span
                className="text-12 text-ink-muted"
                title={`Shared by ${view.by}`}
              >
                · firm
              </span>
            )}
            {(view.mine || canShare) && (
              <button
                type="button"
                aria-label={`Remove the saved view ${view.name}`}
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setMessage(await deleteView(view.id));
                    router.refresh();
                  })
                }
                className="text-ink-muted hover:text-redpen px-1"
              >
                ×
              </button>
            )}
          </span>
        ))}

        {search && !naming && (
          <button
            type="button"
            onClick={() => setNaming(true)}
            className="text-13 underline underline-offset-4"
          >
            Save these filters
          </button>
        )}
      </div>

      {naming && (
        <form
          action={(formData) =>
            startTransition(async () => {
              const result = await saveView(formData);
              setMessage(result);
              if (result?.ok) {
                setNaming(false);
                router.refresh();
              }
            })
          }
          className="rounded-ledger border-rule bg-surface flex flex-wrap items-end gap-3 border p-3"
        >
          <input type="hidden" name="screen" value={reportKey} />
          <input type="hidden" name="search" value={search} />
          <label className="flex flex-col gap-1">
            <span className="text-12 text-ink-muted font-medium">
              Call this view
            </span>
            <input
              name="name"
              required
              maxLength={60}
              placeholder="Ludhiana GST overdue"
              className="rounded-ledger border-rule bg-paper text-14 h-9 w-56 border px-2"
            />
          </label>
          {canShare && (
            <label className="text-13 flex items-center gap-2 pb-2">
              <input type="checkbox" name="shared" className="size-4" />
              Share with the firm
            </label>
          )}
          <button
            type="submit"
            disabled={pending}
            className="rounded-ledger bg-carbon text-14 h-9 px-3 font-medium text-white disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setNaming(false)}
            className="text-13 underline underline-offset-4"
          >
            Cancel
          </button>
        </form>
      )}

      {message?.ok && (
        <p role="status" className="text-13 text-filed">
          {message.ok}
        </p>
      )}
      {message?.error && (
        <p role="alert" className="text-13 text-redpen">
          {message.error}
        </p>
      )}
    </div>
  );
}

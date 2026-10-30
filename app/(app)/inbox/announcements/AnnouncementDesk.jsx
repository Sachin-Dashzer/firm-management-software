"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postAnnouncement, endAnnouncement } from "./actions";

/**
 * The partner's side of announcements (P3-17b).
 *
 * The part worth the screen is the bottom half: **who has not read it, by
 * name**. A percentage tells a partner nothing they can act on; a list of
 * three names is a conversation at the end of the day.
 */
export default function AnnouncementDesk({ rows, audiences, branches, roles }) {
  const router = useRouter();
  const [state, action, posting] = useActionState(postAnnouncement, null);
  const [audience, setAudience] = useState("everyone");
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();

  function takeDown(id) {
    startTransition(async () => {
      const result = await endAnnouncement(id);
      setMessage(result);
      router.refresh();
    });
  }

  const live = rows.filter((row) => row.live);
  const past = rows.filter((row) => !row.live);

  return (
    <div className="flex flex-col gap-6">
      {(state?.ok || message?.ok) && (
        <p
          role="status"
          className="rounded-ledger border-filed bg-filed-wash text-13 text-filed border px-3 py-2"
        >
          {state?.ok ?? message?.ok}
        </p>
      )}
      {(state?.error || message?.error) && (
        <p
          role="alert"
          className="rounded-ledger border-redpen bg-redpen-wash text-13 text-redpen border px-3 py-2"
        >
          {state?.error ?? message?.error}
        </p>
      )}

      <form action={action} className="flex flex-col gap-3">
        <h2 className="text-15 font-bold">Post one</h2>

        <label className="flex flex-col gap-1">
          <span className="text-13 font-medium">Title</span>
          <input
            name="title"
            required
            maxLength={120}
            className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
          />
          <span className="text-12 text-ink-muted">
            This is the line that appears in everybody&rsquo;s inbox.
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-13 font-medium">What you want to say</span>
          <textarea
            name="body"
            rows={4}
            required
            maxLength={4000}
            className="rounded-control border-rule bg-paper text-14 border px-2 py-1"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-13 font-medium">Who it is for</span>
            <select
              name="audience"
              value={audience}
              onChange={(event) => setAudience(event.target.value)}
              className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
            >
              {audiences.map((row) => (
                <option key={row.key} value={row.key}>
                  {row.label}
                </option>
              ))}
            </select>
          </label>

          {audience === "branch" && (
            <label className="flex flex-col gap-1">
              <span className="text-13 font-medium">Which office</span>
              <select
                name="branchId"
                required
                className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
              >
                <option value="">— choose —</option>
                {branches.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {audience === "role" && (
            <label className="flex flex-col gap-1">
              <span className="text-13 font-medium">Which role</span>
              <select
                name="role"
                required
                className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
              >
                <option value="">— choose —</option>
                {roles.map((row) => (
                  <option key={row.role} value={row.role}>
                    {row.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-13 font-medium">Up from</span>
            <input
              type="date"
              name="from"
              className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
            />
            <span className="text-12 text-ink-muted">Blank means today.</span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-13 font-medium">Down on (optional)</span>
            <input
              type="date"
              name="until"
              className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
            />
            <span className="text-12 text-ink-muted">
              Blank means it stays up until you take it down.
            </span>
          </label>
        </div>

        <label className="text-14 flex items-start gap-2">
          <input type="checkbox" name="needsAck" className="mt-1" />
          <span>
            Ask people to say they have read it
            <span className="text-12 text-ink-muted block">
              It never blocks anybody&rsquo;s work. You see who has not.
            </span>
          </span>
        </label>

        <div>
          <button
            type="submit"
            disabled={posting}
            className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-4 font-medium disabled:opacity-60"
          >
            Post it
          </button>
        </div>
      </form>

      <Board
        title="Up now"
        rows={live}
        empty="Nothing is up."
        onTakeDown={takeDown}
        pending={pending}
      />
      <Board title="Past" rows={past} empty="Nothing has come down yet." />
    </div>
  );
}

function Board({ title, rows, empty, onTakeDown, pending }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-15 font-bold">{title}</h2>
      {rows.length === 0 ? (
        <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border px-3 py-4">
          {empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-ledger border-rule bg-surface flex flex-col gap-1 border px-3 py-2"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-14 font-medium">{row.title}</h3>
                <span className="text-12 text-ink-muted">
                  {row.audienceLabel} · {row.from}
                  {row.until ? ` – ${row.until}` : ""}
                </span>
              </div>
              <p className="text-14 whitespace-pre-line">{row.body}</p>
              <p className="text-12 text-ink-muted">
                Posted by {row.postedByName}
              </p>

              {row.needsAck && (
                <p className="text-13">
                  {row.pending.length === 0 ? (
                    <span className="text-filed">
                      Everybody it reaches has read it.
                    </span>
                  ) : (
                    <>
                      <strong>Not read yet:</strong> {row.pending.join(", ")}
                    </>
                  )}
                  {row.acked.length > 0 && (
                    <span className="text-12 text-ink-muted block">
                      Read by{" "}
                      {row.acked
                        .map((ack) => `${ack.name} (${ack.at})`)
                        .join(", ")}
                    </span>
                  )}
                </p>
              )}

              {onTakeDown && (
                <div>
                  <button
                    type="button"
                    onClick={() => onTakeDown(row.id)}
                    disabled={pending}
                    className="rounded-control border-rule bg-surface text-13 h-8 border px-3 disabled:opacity-60"
                  >
                    Take it down
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

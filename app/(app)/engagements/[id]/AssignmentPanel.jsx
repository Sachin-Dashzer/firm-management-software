"use client";

import { useState } from "react";
import { PRIORITIES } from "@/lib/engagements/status";
import { canExecute } from "@/lib/services/catalog";

/**
 * Who is on this job, and when it is wanted (owner request, 02-11-2026).
 *
 * **It saves when you press Save.** Every control here used to write on
 * change: picking a reviewer saved, moving the date saved, changing the
 * priority saved — three writes, three audit entries, three emails, and no
 * way to think better of it halfway through. It is a form now, behind one
 * action and one transaction (`saveAssignment`).
 *
 * The helpers are tick boxes rather than a multi-select, because a native
 * multi-select is the one control nobody can work — five names are five
 * ctrl-clicks — and who is on the job is the question this panel exists to
 * answer at a glance.
 *
 * @param {object} props
 * @param {(input: object) => void} props.onSave
 */
export default function AssignmentPanel({ engagement, team, pending, onSave }) {
  const [assigneeId, setAssigneeId] = useState(engagement.assigneeId ?? "");
  const [reviewerId, setReviewerId] = useState(engagement.reviewerId ?? "");
  const [helpers, setHelpers] = useState(
    () => new Set(engagement.helperIds ?? []),
  );
  const [internalDue, setInternalDue] = useState(
    engagement.internalDueInput ?? "",
  );
  const [priority, setPriority] = useState(engagement.priority);

  const floor = engagement.minExecRole;
  const canDo = team.filter((person) => canExecute(person.role, floor));
  const canCheck = team.filter((person) =>
    ["ca", "partner"].includes(person.role),
  );

  const was = engagement.helperIds ?? [];
  const dirty =
    assigneeId !== (engagement.assigneeId ?? "") ||
    reviewerId !== (engagement.reviewerId ?? "") ||
    internalDue !== (engagement.internalDueInput ?? "") ||
    priority !== engagement.priority ||
    helpers.size !== was.length ||
    was.some((id) => !helpers.has(id));

  function toggleHelper(id) {
    setHelpers((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          assigneeId,
          reviewerId,
          helperIds: [...helpers],
          internalDue,
          priority,
        });
      }}
      className="flex flex-col gap-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">
            Doing the work
          </span>
          <select
            value={assigneeId}
            onChange={(event) => setAssigneeId(event.target.value)}
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
          >
            <option value="">— nobody —</option>
            {canDo.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
          <span className="text-12 text-ink-muted">
            The one answerable for it: the overdue email, the badge and the
            review all name this person.
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">Reviewing</span>
          <select
            value={reviewerId}
            onChange={(event) => setReviewerId(event.target.value)}
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
          >
            <option value="">— nobody —</option>
            {canCheck
              .filter((person) => person.id !== assigneeId)
              .map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
          </select>
          <span className="text-12 text-ink-muted">
            Never one of the people doing it.
          </span>
        </label>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-13 text-ink-muted font-medium">
          Also working on it
        </legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {canDo
            .filter(
              (person) => person.id !== assigneeId && person.id !== reviewerId,
            )
            .map((person) => (
              <label
                key={person.id}
                className="text-14 flex items-center gap-1.5"
              >
                <input
                  type="checkbox"
                  checked={helpers.has(person.id)}
                  onChange={() => toggleHelper(person.id)}
                  className="accent-carbon size-4"
                />
                {person.name}
              </label>
            ))}
          {canDo.length === 0 && (
            <span className="text-13 text-ink-muted">
              Nobody on the team clears this service&rsquo;s floor.
            </span>
          )}
        </div>
        <span className="text-12 text-ink-muted">
          They get the job on their own lists and may open the client, tick
          the steps and attach files. Whoever is reviewing it cannot be one of
          them.
        </span>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">
            Internal due date
          </span>
          <input
            type="date"
            value={internalDue}
            onChange={(event) => setInternalDue(event.target.value)}
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-13 text-ink-muted font-medium">Priority</span>
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
            className="rounded-control border-rule bg-paper text-14 h-10 border px-2"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || !dirty}
          className="rounded-control bg-carbon text-14 text-on-carbon h-10 px-4 font-medium disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save assignment"}
        </button>
        <span
          className={`text-12 ${dirty ? "text-waiting" : "text-ink-muted"}`}
        >
          {dirty ? "Not saved yet." : "Saved as it stands on screen."}
        </span>
      </div>
    </form>
  );
}

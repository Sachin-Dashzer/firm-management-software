"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  BULK_APPROVE_LIMIT,
  NEEDS_REASON,
  PRIORITIES,
  STATUSES,
  transitionsFrom,
} from "@/lib/engagements/status";
import { tierOf } from "@/lib/services/catalog";
import TierBadge from "@/components/ledger/TierBadge";
import { AtRiskChip, DueChip, PriorityChip, StatusChip } from "./chips";
import {
  bulkApprove,
  bulkInternalDue,
  bulkPriority,
  bulkReassign,
  bulkStatus,
} from "./actions";

/**
 * The same filtered work, three ways (spec section 5): a list, a board by
 * status, and a calendar by due date. Selection and the bulk bar are shared,
 * so a selection survives switching between list and board.
 *
 * Cards on the board can be dragged between columns (spec section 15).
 * Dragging runs the same bulk action the list uses, so it can do nothing
 * the keyboard path cannot, and selecting cards and using the bulk bar
 * remains the way through for a screen reader or a phone.
 */
export default function EngagementViews({
  view,
  rows,
  total,
  page,
  pageSize,
  showingAll,
  mayManage,
  mayApprove = false,
  team,
  params,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState(() => new Set());
  const [message, setMessage] = useState(null);
  const [moving, setMoving] = useState(null); // the card being dropped
  const [pending, startTransition] = useTransition();

  const ids = [...selected];

  /**
   * Whether to offer the batch sign-off, and when not, why (owner decision
   * D5). Only routine work is offered, only to a checker, and only from a
   * status that can reach Completed — the server checks all three again, so
   * this is the sentence rather than the lock.
   */
  const chosen = rows.filter((r) => selected.has(r.id));
  const approve = !mayApprove
    ? null
    : chosen.some((r) => tierOf(r.level) !== "C")
      ? { why: "Only routine (C) work can be signed off in a batch." }
      : chosen.some((r) => !transitionsFrom(r.status).includes("Completed"))
        ? { why: "Everything selected has to be under review first." }
        : chosen.length > BULK_APPROVE_LIMIT
          ? { why: `${BULK_APPROVE_LIMIT} at a time.` }
          : { ready: true };

  function toggle(id) {
    setSelected((old) => {
      const next = new Set(old);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function run(action) {
    startTransition(async () => {
      const result = await action(ids);
      setMessage(result);
      if (result?.ok) setSelected(new Set());
      router.refresh();
    });
  }

  /**
   * A card dropped in another column. It goes through the same bulk action
   * the list uses — one id instead of several — so dragging cannot do
   * anything the keyboard path could not, and the server still decides.
   */
  function moveCard(id, to) {
    setMoving(id);
    startTransition(async () => {
      const result = await bulkStatus([id], to);
      setMessage(result);
      setMoving(null);
      router.refresh();
    });
  }

  function linkTo(changes) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    return `${pathname}?${next}`;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {[
          ["list", "List"],
          ["board", "Board"],
          ["calendar", "Calendar"],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={linkTo({ view: key === "list" ? "" : key, page: "" })}
            aria-current={view === key ? "page" : undefined}
            className={`rounded-control text-14 h-9 border px-3 leading-9 ${
              view === key
                ? "border-carbon bg-carbon-wash text-carbon"
                : "border-rule hover:bg-carbon-wash"
            }`}
          >
            {label}
          </Link>
        ))}
        {showingAll && total > rows.length && (
          <span className="text-13 text-ink-muted">
            showing the first {rows.length} of {total}
          </span>
        )}
      </div>

      {message?.ok && (
        <div
          role="status"
          className="rounded-ledger border-filed bg-filed-wash text-13 border px-3 py-2"
        >
          <p className="text-filed">{message.ok}</p>
          {message.skipped?.length > 0 && (
            <ul className="text-ink-muted mt-1 flex flex-col gap-0.5">
              {message.skipped.map((s) => (
                <li key={s.code}>
                  <span className="font-mono">{s.code}</span>: {s.why}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {message?.error && (
        <p
          role="alert"
          className="rounded-ledger border-redpen bg-redpen-wash text-13 text-redpen border px-3 py-2"
        >
          {message.error}
        </p>
      )}

      {mayManage && ids.length > 0 && (
        <BulkBar
          count={ids.length}
          pending={pending}
          team={team}
          approve={approve}
          onApprove={() => run(bulkApprove)}
          onStatus={(to, reason) => run((list) => bulkStatus(list, to, reason))}
          onAssignee={(id) =>
            run((list) => bulkReassign(list, { assigneeId: id }))
          }
          onReviewer={(id) =>
            run((list) => bulkReassign(list, { reviewerId: id }))
          }
          onDue={(date) => run((list) => bulkInternalDue(list, date))}
          onPriority={(p) => run((list) => bulkPriority(list, p))}
          onClear={() => setSelected(new Set())}
        />
      )}

      {view === "list" && (
        <ListView
          rows={rows}
          selected={selected}
          toggle={toggle}
          selectAll={() =>
            setSelected((old) =>
              old.size === rows.length
                ? new Set()
                : new Set(rows.map((r) => r.id)),
            )
          }
          selectable={mayManage}
          total={total}
          page={page}
          pageSize={pageSize}
          linkTo={linkTo}
        />
      )}
      {view === "board" && (
        <BoardView
          rows={rows}
          selected={selected}
          toggle={toggle}
          selectable={mayManage}
          onMove={mayManage ? moveCard : () => {}}
          moving={moving}
        />
      )}
      {view === "calendar" && <CalendarView rows={rows} params={params} />}
    </div>
  );
}

function BulkBar({
  count,
  pending,
  team,
  approve,
  onApprove,
  onStatus,
  onAssignee,
  onReviewer,
  onDue,
  onPriority,
  onClear,
}) {
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");

  return (
    <section
      aria-label="Bulk actions"
      className="rounded-ledger border-carbon bg-carbon-wash flex flex-wrap items-end gap-3 border p-3"
    >
      <p className="text-14 font-medium">
        {count} selected
        <button
          type="button"
          onClick={onClear}
          className="text-13 text-ink-muted ml-2 underline underline-offset-4"
        >
          clear
        </button>
      </p>

      {approve && (
        <div className="flex flex-col gap-1">
          <span className="text-12 text-ink-muted">Routine work</span>
          <button
            type="button"
            disabled={!approve.ready || pending}
            title={
              approve.ready
                ? "Each one is signed off separately, with its own entry in the log."
                : approve.why
            }
            onClick={onApprove}
            className="rounded-control border-filed text-filed text-14 hover:bg-filed-wash h-9 border px-3 font-medium disabled:opacity-60"
          >
            Approve selected
          </button>
          {!approve.ready && (
            <span className="text-12 text-ink-muted max-w-56">
              {approve.why}
            </span>
          )}
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-12 text-ink-muted">Move to</span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
        >
          <option value="">— status —</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      {["On hold", "Cancelled"].includes(status) && (
        <label className="flex flex-col gap-1">
          <span className="text-12 text-ink-muted">Reason (required)</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
          />
        </label>
      )}
      <button
        type="button"
        disabled={!status || pending}
        onClick={() => {
          onStatus(status, reason);
          setStatus("");
          setReason("");
        }}
        className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 font-medium disabled:opacity-60"
      >
        Apply
      </button>

      <label className="flex flex-col gap-1">
        <span className="text-12 text-ink-muted">Assign to</span>
        <select
          defaultValue=""
          disabled={pending}
          onChange={(e) => e.target.value && onAssignee(e.target.value)}
          className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
        >
          <option value="">— someone —</option>
          {team.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-12 text-ink-muted">Reviewer</span>
        <select
          defaultValue=""
          disabled={pending}
          onChange={(e) => e.target.value && onReviewer(e.target.value)}
          className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
        >
          <option value="">— someone —</option>
          {team
            .filter((u) => u.role === "ca" || u.role === "partner")
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-12 text-ink-muted">Internal due date</span>
        <input
          type="date"
          disabled={pending}
          onChange={(e) => e.target.value && onDue(e.target.value)}
          className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-12 text-ink-muted">Priority</span>
        <select
          defaultValue=""
          disabled={pending}
          onChange={(e) => e.target.value && onPriority(e.target.value)}
          className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
        >
          <option value="">— level —</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

function ListView({
  rows,
  selected,
  toggle,
  selectAll,
  selectable,
  total,
  page,
  pageSize,
  linkTo,
}) {
  const pages = Math.ceil(total / pageSize);

  return (
    <>
      <div className="rounded-table border-rule bg-surface overflow-x-auto border">
        <table className="text-14 w-full">
          <thead>
            <tr className="border-rule text-12 text-faint border-b text-left font-normal">
              {selectable && (
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Select every row"
                    checked={rows.length > 0 && selected.size === rows.length}
                    onChange={selectAll}
                  />
                </th>
              )}
              <Th>Client</Th>
              <Th>Service</Th>
              <Th>Tier</Th>
              <Th>Period</Th>
              <Th>Status</Th>
              <Th>Due</Th>
              <Th>Assignee</Th>
              <Th>Reviewer</Th>
              <Th>Fee</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-rule border-b last:border-0">
                {selectable && (
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.code}`}
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                    />
                  </td>
                )}
                <Td>
                  <Link
                    href={`/engagements/${r.id}`}
                    className="font-medium underline underline-offset-4"
                  >
                    {r.client}
                  </Link>
                  <br />
                  <span className="text-13 text-ink-muted font-mono">
                    {r.code}
                  </span>
                </Td>
                <Td>
                  {r.service} <PriorityChip priority={r.priority} />
                </Td>
                <Td>
                  <TierBadge level={r.level} />
                </Td>
                <Td className="text-13">{r.period}</Td>
                <Td>
                  <StatusChip status={r.status} />
                </Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-1">
                    {r.due ? (
                      <DueChip
                        label={r.dueKind}
                        date={r.due}
                        days={r.dueDays}
                      />
                    ) : (
                      <span className="text-13 text-ink-muted">not set</span>
                    )}
                    <AtRiskChip reason={r.atRisk} />
                  </div>
                </Td>
                <Td className="text-13">{r.assignee}</Td>
                <Td className="text-13">{r.reviewer}</Td>
                <Td className="num text-13">
                  {r.fee}
                  <br />
                  <span className="text-ink-muted">{r.billingStatus}</span>
                </Td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={selectable ? 10 : 9}
                  className="text-ink-muted px-3 py-6 text-center"
                >
                  Nothing matches these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav className="text-14 flex items-center gap-3" aria-label="Pages">
          {page > 1 && (
            <Link
              href={linkTo({ page: String(page - 1) })}
              className="underline underline-offset-4"
            >
              Previous
            </Link>
          )}
          <span className="text-13 text-ink-muted">
            Page {page} of {pages}
          </span>
          {page < pages && (
            <Link
              href={linkTo({ page: String(page + 1) })}
              className="underline underline-offset-4"
            >
              Next
            </Link>
          )}
        </nav>
      )}
    </>
  );
}

/**
 * The board: one column per status, in pipeline order.
 *
 * Cards can be dragged between columns, and the columns a card cannot
 * legally reach do not light up — the pipeline in `lib/engagements/status`
 * decides, and the server checks again when the card lands. Two statuses
 * are never drop targets: On hold and Cancelled both require a reason,
 * and a drag has nowhere to type one, so those stay on the explicit
 * control where the reason can be given and audited.
 *
 * Dragging is an addition, not the way through. Selecting cards and using
 * the bulk bar does the same job with the keyboard alone, which is what a
 * screen-reader user and a phone both need.
 */
function BoardView({ rows, selected, toggle, selectable, onMove, moving }) {
  const columns = STATUSES.filter((s) => s !== "Cancelled");
  const [dragging, setDragging] = useState(null);

  // a few pixels of travel before a drag starts, so clicking a card's link
  // or its checkbox still works
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const card = dragging ? rows.find((r) => r.id === dragging) : null;
  const canDrop = card
    ? transitionsFrom(card.status).filter((to) => !NEEDS_REASON.includes(to))
    : [];

  function onDragEnd({ over }) {
    const from = card;
    setDragging(null);
    if (!from || !over) return;

    const to = String(over.id);
    if (to === from.status) return;
    if (!canDrop.includes(to)) return;
    onMove(from.id, to);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={({ active }) => setDragging(String(active.id))}
      onDragCancel={() => setDragging(null)}
      onDragEnd={onDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            cards={rows.filter((r) => r.status === status)}
            selected={selected}
            toggle={toggle}
            selectable={selectable}
            dragging={dragging}
            droppable={Boolean(card) && canDrop.includes(status)}
            moving={moving}
          />
        ))}
      </div>

      {/* what follows the cursor: the card itself, lifted off the page */}
      <DragOverlay dropAnimation={null}>
        {card && (
          <div className="rounded-ledger border-brass bg-surface text-14 w-72 rotate-1 border px-2 py-2 shadow-lg">
            <p className="font-medium">{card.client}</p>
            <p className="text-13 text-ink-muted">
              {card.service} · {card.period}
            </p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function BoardColumn({
  status,
  cards,
  selected,
  toggle,
  selectable,
  dragging,
  droppable,
  moving,
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    disabled: !droppable,
  });

  return (
    <section
      ref={setNodeRef}
      aria-label={status}
      className={`rounded-ledger bg-surface flex w-72 shrink-0 flex-col border transition-colors ${
        isOver && droppable
          ? "border-brass bg-carbon-wash"
          : droppable
            ? "border-brass/50"
            : "border-rule"
      }`}
    >
      <h2 className="border-rule text-12 text-ink-muted flex items-baseline justify-between border-b px-3 py-2 font-medium">
        {status}
        <span className="num">{cards.length}</span>
      </h2>
      <ul className="flex flex-col gap-2 p-2">
        {cards.map((r) => (
          <BoardCard
            key={r.id}
            row={r}
            selected={selected}
            toggle={toggle}
            selectable={selectable}
            hidden={dragging === r.id}
            moving={moving === r.id}
          />
        ))}
        {cards.length === 0 && (
          <li className="text-13 text-ink-muted px-1 py-2">
            {droppable ? "Drop here." : "Empty."}
          </li>
        )}
      </ul>
    </section>
  );
}

function BoardCard({ row, selected, toggle, selectable, hidden, moving }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: row.id });

  return (
    <li
      ref={setNodeRef}
      className={`rounded-ledger border-rule bg-paper flex flex-col gap-1 border p-2 ${
        hidden ? "opacity-30" : ""
      } ${moving ? "opacity-50" : ""}`}
    >
      <div className="flex items-start gap-2">
        {selectable && (
          <input
            type="checkbox"
            aria-label={`Select ${row.code}`}
            checked={selected.has(row.id)}
            onChange={() => toggle(row.id)}
            className="mt-1"
          />
        )}
        <div className="min-w-0 flex-1">
          <Link
            href={`/engagements/${row.id}`}
            className="text-14 font-medium underline underline-offset-4"
          >
            {row.client}
          </Link>
          <p className="text-13 text-ink-muted flex items-center gap-1.5">
            <TierBadge level={row.level} />
            {row.service} · {row.period}
          </p>
        </div>
        {/* the handle, so dragging never competes with the link or the box */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          tabIndex={-1}
          aria-hidden="true"
          title="Drag to another column"
          className="text-ink-muted hover:text-ink -mt-1 cursor-grab px-1 leading-none active:cursor-grabbing"
        >
          ⠿
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {row.due && (
          <DueChip label={row.dueKind} date={row.due} days={row.dueDays} />
        )}
        <AtRiskChip reason={row.atRisk} />
        <PriorityChip priority={row.priority} />
      </div>
      <p className="text-12 text-ink-muted">{row.assignee}</p>
    </li>
  );
}

/** A month of due dates. Work with no date yet is listed underneath. */
function CalendarView({ rows, params }) {
  const [month, setMonth] = useState(() => {
    const first = rows.find((r) => r.dueISO);
    const base = first ? new Date(`${first.dueISO}T00:00:00`) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = (new Date(year, monthIndex, 1).getDay() + 6) % 7; // Mon first
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const byDay = new Map();
  for (const row of rows) {
    if (!row.dueISO) continue;
    const date = new Date(`${row.dueISO}T00:00:00`);
    if (date.getFullYear() !== year || date.getMonth() !== monthIndex) continue;
    const day = date.getDate();
    byDay.set(day, [...(byDay.get(day) ?? []), row]);
  }

  const undated = rows.filter((r) => !r.dueISO);
  const monthName = month.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}
          className="rounded-control border-rule text-14 h-9 border px-3"
        >
          ← Previous
        </button>
        <h2 className="font-display text-15 font-semibold">{monthName}</h2>
        <button
          type="button"
          onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}
          className="rounded-control border-rule text-14 h-9 border px-3"
        >
          Next →
        </button>
      </div>

      <div className="rounded-ledger border-rule bg-surface grid grid-cols-7 gap-px border p-px">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div
            key={d}
            className="bg-surface text-12 text-ink-muted px-2 py-1 font-medium"
          >
            {d}
          </div>
        ))}
        {Array.from({ length: firstWeekday }).map((_, i) => (
          <div key={`pad-${i}`} className="bg-surface min-h-24" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const list = byDay.get(day) ?? [];
          return (
            <div
              key={day}
              className="bg-paper flex min-h-24 flex-col gap-1 p-1"
            >
              <span className="num text-12 text-ink-muted">{day}</span>
              {list.slice(0, 4).map((r) => (
                <Link
                  key={r.id}
                  href={`/engagements/${r.id}`}
                  title={`${r.client} · ${r.service}`}
                  className={`text-12 truncate rounded px-1 ${
                    r.dueDays < 0
                      ? "bg-redpen-wash text-redpen"
                      : r.dueDays <= 3
                        ? "bg-waiting-wash text-waiting"
                        : "bg-filed-wash text-filed"
                  }`}
                >
                  {r.client}
                </Link>
              ))}
              {list.length > 4 && (
                <span className="text-12 text-ink-muted">
                  +{list.length - 4} more
                </span>
              )}
            </div>
          );
        })}
      </div>

      {undated.length > 0 && (
        <p className="text-13 text-ink-muted">
          {undated.length} with no date of either kind. Select them and set an
          internal due date from the bar above.
        </p>
      )}
      {params.closed && (
        <p className="text-13 text-ink-muted">
          Closed work is included in this view.
        </p>
      )}
    </div>
  );
}

function Th({ children }) {
  return <th className="px-3 py-2 font-medium">{children}</th>;
}

function Td({ children, className = "" }) {
  return <td className={`px-3 py-2 align-top ${className}`}>{children}</td>;
}

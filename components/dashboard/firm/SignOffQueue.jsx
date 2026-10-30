"use client";

import { useState } from "react";
import Link from "next/link";
import Panel from "@/components/ui/Panel";
import Chip from "@/components/ui/Chip";
import Segmented from "@/components/ui/Segmented";
import TierBadge from "@/components/ledger/TierBadge";
import { formatISTDate, formatISTShort } from "@/lib/dates";

/**
 * What is waiting for a signature (P3-34 phase 3).
 *
 * The filter chips are client-side and deliberately so: the rows are
 * already here, at most six of them, and a round trip to Mumbai to hide
 * three of six is a round trip for nothing.
 *
 * The panel's title changes with its scope. A partner who does their own
 * reviewing sees "Waiting for your sign-off"; a partner who delegates sees
 * the firm's queue under "Waiting for sign-off" — because an empty panel
 * on the busiest screen in the firm would tell them nothing is waiting,
 * which is the opposite of true.
 */
export default function SignOffQueue({ queue }) {
  const [filter, setFilter] = useState("all");

  if (!queue) return null;

  const rows = queue.rows;
  const soon = rows.filter((row) => row.days != null && row.days <= 1);
  const tierA = rows.filter((row) => row.tier === "A");

  const shown = filter === "soon" ? soon : filter === "tierA" ? tierA : rows;

  return (
    <Panel
      title={
        queue.scoped ? "Waiting for your sign-off" : "Waiting for sign-off"
      }
      link={
        queue.total > rows.length
          ? {
              href: "/engagements?status=Under%20review",
              label: `See all ${queue.total}`,
            }
          : undefined
      }
    >
      {rows.length === 0 ? (
        <p className="text-13 text-ink-muted">
          Nothing is waiting for your review.
        </p>
      ) : (
        <>
          <Segmented
            label="Narrow the queue"
            value={filter}
            onSelect={setFilter}
            items={[
              { key: "all", label: `All ${rows.length}` },
              { key: "soon", label: `Due ≤ 1 day · ${soon.length}` },
              { key: "tierA", label: `Tier A · ${tierA.length}` },
            ]}
          />

          <ul className="divide-rule flex flex-col divide-y">
            {shown.map((row) => (
              <li
                key={row.id}
                className="flex items-start gap-3 py-2.5 first:pt-0"
              >
                <TierBadge level={row.level} />

                <span className="min-w-0 flex-1">
                  <span className="text-14 block truncate font-semibold">
                    {row.client}
                  </span>
                  <span className="text-13 text-ink-muted block truncate">
                    {[row.service, row.period].filter(Boolean).join(" · ")}
                  </span>
                  <span className="text-12 text-faint block truncate">
                    Prepared by {row.assignee}
                  </span>
                </span>

                <span className="flex shrink-0 items-center gap-2">
                  <DueChip row={row} />
                  <Link
                    href={`/engagements/${row.id}#review`}
                    className="rounded-control border-carbon/40 text-carbon hover:bg-carbon-wash text-13 border px-2.5 py-1 font-medium"
                  >
                    Review
                  </Link>
                </span>
              </li>
            ))}
          </ul>

          {shown.length === 0 && (
            <p className="text-13 text-ink-muted">
              Nothing in the queue matches that.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

/** Today, Tomorrow, or the date with the days left beside it. */
function DueChip({ row }) {
  if (row.days == null) return null;

  if (row.days < 0) {
    const late = Math.abs(row.days);
    return (
      <Chip tone="late">
        {late} {late === 1 ? "day" : "days"} late
      </Chip>
    );
  }
  if (row.days === 0) return <Chip tone="late">Today</Chip>;
  if (row.days === 1) return <Chip tone="soon">Tomorrow</Chip>;

  return (
    <Chip tone="neutral" mono title={formatISTDate(row.due)}>
      {formatISTShort(row.due)} · {row.days}d
    </Chip>
  );
}

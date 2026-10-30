import Link from "next/link";
import Panel from "@/components/ui/Panel";
import ProgressBar from "@/components/ui/ProgressBar";
import { ROLE_LABELS } from "@/lib/permissions";

/**
 * Who is carrying what (P3-34 phase 3).
 *
 * **The marker is the panel.** A bar scaled to the busiest person says
 * only that somebody is busiest, which everybody already knows. Scaled
 * past a line drawn at the comfort limit, the same bar says who is over it
 * and by how much — and that is something a partner can act on this
 * morning.
 *
 * The scale is `max(limit × 1.3, the top load)`, so the marker sits inside
 * the track even when nobody is near it, and a bar that runs past the line
 * reads as past the line rather than as full.
 */
export default function TeamLoad({ team }) {
  if (!team || team.rows.length === 0) return null;

  const top = Math.max(...team.rows.map((row) => row.load));
  const scale = Math.max(team.limit * 1.3, top);
  const markerAt = (team.limit / scale) * 100;

  return (
    <Panel
      title="Team load"
      hint={`Open jobs · marker = ${team.limit}-job comfort limit`}
    >
      <ul className="flex flex-col gap-2.5">
        {team.rows.map((row, index) => (
          <li key={row.id} className="flex items-center gap-3">
            <span className="w-28 shrink-0">
              <Link
                href={`/team/${row.id}`}
                className="text-13 block truncate font-medium hover:underline"
              >
                {row.name}
              </Link>
              <span className="text-11 text-faint block truncate">
                {[ROLE_LABELS[row.role] ?? row.role, tierLine(row.byTier)]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>

            <ProgressBar
              value={row.load}
              max={scale}
              marker={markerAt}
              index={index}
              tone={toneFor(row.load, team.limit)}
              label={`${row.name}: ${row.load} open ${row.load === 1 ? "job" : "jobs"}, comfort limit ${team.limit}`}
            />

            <span className="num text-13 w-6 shrink-0 text-right">
              {row.load}
            </span>
          </li>
        ))}
      </ul>

      {team.hint && (
        <p className="text-13 text-waiting">
          {team.hint.from} is above the limit — consider moving {team.hint.jobs}{" "}
          {team.hint.jobs === 1 ? "job" : "jobs"} to {team.hint.to}.{" "}
          <Link
            href="/team/plan"
            className="text-carbon underline underline-offset-4"
          >
            Plan the week
          </Link>
        </p>
      )}
    </Panel>
  );
}

/** Amber over the limit, red pen half as much again past it. */
function toneFor(load, limit) {
  if (load >= limit * 1.5) return "redpen";
  if (load > limit) return "waiting";
  return "carbon";
}

/**
 * The highest tier somebody is actually carrying, which is what the
 * mockup's "Tier A" line means. Nothing is shown when they carry none —
 * inventing a grade for a person is not this panel's business.
 */
function tierLine(byTier) {
  if (!byTier) return "";
  for (const tier of ["A", "B", "C"]) {
    if (byTier[tier] > 0) return `Tier ${tier}`;
  }
  return "";
}

import Link from "next/link";
import {
  ListChecks,
  FolderOpen,
  Envelope,
  Gear,
  ClockCounterClockwise,
} from "@phosphor-icons/react/dist/ssr";
import CountBadge from "@/components/ui/CountBadge";

/**
 * The five faces of one job, as five icons in the top right (owner,
 * 13-11-2026).
 *
 * They were a row of underlined words under the head, which is the
 * ordinary place for tabs and was costing the screen a whole band of its
 * height for five labels that never change. The owner asked for icons in
 * the corner instead, so the head row carries the switch and the page
 * starts with the work.
 *
 * Each is a real link with the tab in its URL — the back button works, a
 * link to a job's letters is a link to a job's letters, and nothing here
 * needs client state. The active one is a tone step and the full ink, not
 * a coloured pill: the accent on this screen belongs to the data.
 *
 * An icon with no word beside it has to say what it is some other way, so
 * every one carries both an `aria-label` and a `title` — the screen
 * reader's name and the hover tooltip are the same sentence.
 */
const ICONS = {
  work: ListChecks,
  files: FolderOpen,
  letters: Envelope,
  setup: Gear,
  activity: ClockCounterClockwise,
};

const LABELS = {
  work: "Work — the step this job is on",
  files: "Files — what the client owes and what has arrived",
  letters: "Letters — what this job has written and sent",
  setup: "Setup — the fee, who it is on, when it is due",
  activity: "Activity — every change on this job",
};

/**
 * @param {object} props
 * @param {string} props.id the engagement
 * @param {string} props.tab the active key
 * @param {Record<string, {value: number, tone?: string}>} [props.badges]
 */
export default function Tabs({ id, tab, badges = {} }) {
  return (
    <nav
      aria-label="What to look at on this job"
      className="flex items-center gap-2"
    >
      {Object.keys(ICONS).map((key) => {
        const Glyph = ICONS[key];
        const active = key === tab;
        const badge = badges[key];
        return (
          <Link
            key={key}
            href={
              key === "work"
                ? `/engagements/${id}`
                : `/engagements/${id}?tab=${key}`
            }
            aria-label={LABELS[key]}
            aria-current={active ? "page" : undefined}
            title={LABELS[key]}
            className={`rounded-control relative grid size-9 place-items-center transition-colors duration-150 ${
              active
                ? "bg-sunk text-ink"
                : "text-ink-muted hover:bg-sunk/60 hover:text-ink"
            }`}
          >
            {/*
              One weight, never `fill`: a filled Phosphor glyph at 18px is
              a solid block, which reads as a swatch rather than as an
              icon. The active one is `bold` on a tone step.
            */}
            <Glyph size={18} weight={active ? "bold" : "regular"} aria-hidden />
            {badge && (
              <span className="absolute -top-1.5 -right-1.5">
                <CountBadge value={badge.value} tone={badge.tone} cap={9} />
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

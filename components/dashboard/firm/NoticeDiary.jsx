import Link from "next/link";
import Panel from "@/components/ui/Panel";
import Chip from "@/components/ui/Chip";
import { istParts } from "@/lib/dates";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * What the firm owes a department next (P3-34 phase 3).
 *
 * The date is a block rather than a line, because these five rows are read
 * as a diary: the eye goes down the dates first and then across to what
 * they are. A date inside a sentence cannot be scanned that way.
 *
 * The chip says whether anybody has picked the reply up, which is the only
 * question a partner is asking of this list on a Monday. "Draft ready" and
 * "No draft" both come from `isDrafted()` in `lib/practice/notices.js`, the
 * same rule the tile above and the rail's badge use.
 */
export default function NoticeDiary({
  rows,
  title = "Notice replies & hearings",
  link = { href: "/practice/notices", label: "Hearing diary" },
  className = "",
}) {
  if (!rows) return null;

  return (
    <Panel title={title} link={link ?? undefined} className={className}>
      {rows.length === 0 ? (
        <p className="text-13 text-ink-muted">
          Nothing is owed to a department right now.
        </p>
      ) : (
        <ul className="divide-rule flex flex-col divide-y">
          {rows.map((row) => {
            const { day, month } = istParts(new Date(row.date));
            return (
              <li key={row.id} className="first:pt-0">
                <Link
                  href={`/practice/notices/${row.id}`}
                  className="hover:bg-carbon-wash rounded-control -mx-2 flex items-center gap-3 px-2 py-2.5"
                >
                  <span className="w-8 shrink-0 text-center">
                    <span className="num text-20 block leading-none font-semibold">
                      {day}
                    </span>
                    <span className="text-11 text-faint block uppercase">
                      {MONTHS[month - 1]}
                    </span>
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="text-14 block truncate font-semibold">
                      {row.client}
                    </span>
                    <span className="text-13 text-ink-muted block truncate">
                      {[row.law, row.what, row.period]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>

                  <Chip tone={row.chip.tone}>{row.chip.label}</Chip>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

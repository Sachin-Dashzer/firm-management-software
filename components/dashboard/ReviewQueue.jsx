import Link from "next/link";
import { TileRow, Panel } from "./Tiles";

/**
 * The CA's dashboard (spec section 10): what is waiting for me to sign
 * off, what my team is late on, and how often work comes back.
 *
 * The rework figure is written as "3 of 12 came back", not as 25%: three
 * out of twelve and thirty out of a hundred and twenty are different
 * conversations, and a percentage hides which one you are having.
 */
export default function ReviewQueue({ tiles, rework, people }) {
  return (
    <div className="flex flex-col gap-6">
      <Panel title="My review queue" what="Every figure opens its list.">
        <TileRow tiles={tiles} />
      </Panel>

      {rework.length > 0 && (
        <Panel
          title="Work that came back"
          what="This financial year, by the person who did it. Sent back at least once."
        >
          <div className="rounded-table border-rule bg-surface overflow-x-auto border">
            <table className="text-14 w-full">
              <thead>
                <tr className="border-rule bg-sunk text-12 text-ink-muted border-b text-left tracking-wide uppercase">
                  <th className="px-3 py-2 font-medium">Person</th>
                  <th className="px-3 py-2 text-right font-medium">Jobs</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Came back
                  </th>
                  <th className="px-3 py-2 font-medium">&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {rework.map((row) => (
                  <tr
                    key={row.id}
                    className="border-rule border-b last:border-0"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/engagements?assignee=${row.id}`}
                        className="underline underline-offset-4"
                      >
                        {people[row.id] ?? "Someone"}
                      </Link>
                    </td>
                    <td className="num px-3 py-2 text-right">{row.jobs}</td>
                    <td
                      className={`num px-3 py-2 text-right ${row.returned > 0 ? "text-waiting" : "text-ink-muted"}`}
                    >
                      {row.returned}
                    </td>
                    <td className="text-13 text-ink-muted px-3 py-2">
                      {row.returned === 0
                        ? "nothing came back"
                        : `${row.returned} of ${row.jobs}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

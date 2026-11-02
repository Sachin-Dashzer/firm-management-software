import Link from "next/link";
import PageHead from "@/components/ui/PageHead";

/**
 * The frame every settings screen sits in (D106).
 *
 * Twenty screens live under `/settings` and before this they named seven
 * different widths between them — 760, 860, 900, 1000, 1100, 1200 — so the
 * area changed shape as you moved through it, and nineteen of them wrote
 * the same `<h1 className="font-display text-24 font-bold tracking-tight">`
 * out by hand while `PageHead` existed for exactly that. Three of the
 * twenty had a link back to Settings; the other seventeen were dead ends.
 *
 * There are **two widths and the page says which**, because the area does
 * two different jobs:
 *
 *  - `read` (820) is the measure for prose and forms — the setup steps,
 *    what the system covers, the firm's own record. 70ch of text in a
 *    1100px column leaves a third of the screen empty.
 *  - `wide` (1120) is for the tables and boards — the permission matrix,
 *    the message log, the service catalogue, the jobs queue.
 *
 * Anything else is the same decision made twice.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {React.ReactNode} [props.sub] one line about the data, not the UI
 * @param {boolean} [props.wide] a table or a board rather than prose
 * @param {{href: string, label: string}|null} [props.back] the way out;
 *        Settings unless a screen sits under another one, and `null` on
 *        the Settings index itself
 * @param {React.ReactNode} [props.actions] the screen's own buttons
 */
export default function SettingsScreen({
  title,
  sub,
  wide = false,
  back = { href: "/settings", label: "Settings" },
  actions,
  children,
}) {
  return (
    <div
      className={`mx-auto flex w-full flex-col gap-5 p-4 md:p-6 ${
        wide ? "max-w-[1120px]" : "max-w-[820px]"
      }`}
    >
      <div className="flex flex-col gap-0.5">
        {back && (
          <Link
            href={back.href}
            className="text-13 text-ink-muted hover:text-carbon w-fit underline underline-offset-4"
          >
            {back.label}
          </Link>
        )}
        <PageHead title={title} sub={sub}>
          {actions}
        </PageHead>
      </div>
      {children}
    </div>
  );
}

/**
 * A list of places to go, with what is true of each one on the right.
 *
 * The Settings index was twenty-two bordered cards of a heading and two
 * lines of prose, stacked — the shape a page takes when every step that
 * added a screen also added a card. A card is a container, and a container
 * per link says nothing about the link. These are rows: the name, the line
 * about it, and the **reading** — four offices, eleven rules, none
 * confirmed — on the ledger grid at the right, which is the part somebody
 * opening Settings is actually looking for.
 *
 * `state` is the reading. `tone` marks the one row that is wrong, and
 * nothing is marked when nothing is.
 */
export function RowList({ as: As = "ul", children }) {
  return (
    <As className="rounded-ledger border-rule bg-surface divide-rule divide-y overflow-hidden border">
      {children}
    </As>
  );
}

/**
 * A row with no `href` is a statement rather than a destination — the
 * things the system does not do, which have nowhere to go by definition.
 *
 * @param {object} props
 * @param {string} [props.href]
 * @param {React.ReactNode} props.title
 * @param {React.ReactNode} [props.body]
 * @param {string} [props.state] the reading, in the ledger face
 * @param {"warn"|"bad"|"good"|"quiet"} [props.tone] how it is marked
 */
export function Row({ href, title, body, state, tone }) {
  const stateTone =
    tone === "bad"
      ? "text-redpen"
      : tone === "warn"
        ? "text-waiting"
        : tone === "good"
          ? "text-filed"
          : "text-ink-muted";

  const inside = (
    <>
      <span className="min-w-0">
        <span className="text-14 block font-medium">{title}</span>
        {body && (
          <span className="text-13 text-ink-muted block max-w-[68ch]">
            {body}
          </span>
        )}
      </span>
      {state && (
        // a figure goes on the ledger grid; a word does not — "needs you"
        // set in the mono face reads like a code for something
        <span
          className={`text-13 shrink-0 text-right ${
            /^d/.test(state) ? "num" : ""
          } ${stateTone}`}
        >
          {state}
        </span>
      )}
    </>
  );

  const shape = "flex items-baseline justify-between gap-4 px-4 py-3";

  return (
    <li>
      {href ? (
        <Link href={href} className={`hover:bg-carbon-wash ${shape}`}>
          {inside}
        </Link>
      ) : (
        <div className={shape}>{inside}</div>
      )}
    </li>
  );
}

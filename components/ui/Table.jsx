import { formatPaise } from "@/lib/money";

/**
 * The look of a table of records (D108, 02-11-2026).
 *
 * Every list in this application had written its own table out: the same
 * bordered scroller, the same `px-3 py-2`, the same 12px grey header row,
 * each a little different from the last. Four of them were on `/billing`
 * alone and the owner's note about them was that the tables were the part
 * of the screen that still looked unmade.
 *
 * What is different here, and why:
 *
 *  - **The header is the label style the rest of the kit uses** — 11px,
 *    uppercase, tracked, in `ink-muted` — the same band as a `StatTile`'s
 *    caption. At 12px sentence case it read as a short row of data rather
 *    than as the top of a column.
 *  - **Rows breathe.** `px-4 py-3` against the old `px-3 py-2`. These are
 *    rows somebody reads across, often with a second muted line in them,
 *    and the old density made every row's two lines touch the rows above
 *    and below.
 *  - **Figures are a block, behind a hairline.** `Num` right-aligns in the
 *    mono face (`.num`, D79) and `rule` draws the one vertical rule that
 *    separates the words from the money. A ledger puts its figures in a
 *    column of their own; before this they were simply the last few
 *    columns of the same grid.
 *  - **Widths are declared once, in a `colgroup`.** A column that is as
 *    wide as whatever happens to be in it moves between page one and page
 *    two, and a column that moves cannot be read down.
 *
 * No sticky header: these tables sit in the page's own scroll, and
 * `overflow-x-auto` makes the box a scroll container in both axes, so a
 * sticky header inside one sticks to nothing (the permission matrix learnt
 * this the expensive way).
 */

/** The bordered, horizontally scrollable frame. */
export function TableShell({ className = "", children }) {
  return (
    <div
      className={`rounded-table border-rule bg-surface overflow-x-auto border ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * @param {object} props
 * @param {string} [props.caption] read by a screen reader, not drawn
 * @param {boolean} [props.fixed] lay the columns out from the `colgroup`
 */
export function Table({ caption, fixed = false, className = "", children }) {
  return (
    <table
      className={`text-14 w-full ${fixed ? "table-fixed" : ""} ${className}`}
    >
      {caption && <caption className="sr-only">{caption}</caption>}
      {children}
    </table>
  );
}

/** The header row, as one call: `<Head cols={[…]} />`. */
export function Head({ children }) {
  return (
    <thead>
      <tr className="border-rule bg-sunk border-b text-left">{children}</tr>
    </thead>
  );
}

/**
 * @param {object} props
 * @param {"left"|"right"} [props.align]
 * @param {boolean} [props.rule] the hairline that starts the money block
 */
export function Th({
  align = "left",
  rule = false,
  className = "",
  children,
  ...rest
}) {
  return (
    <th
      scope="col"
      {...rest}
      className={`text-11 text-ink-muted px-4 py-2.5 font-semibold tracking-wide whitespace-nowrap uppercase ${
        align === "right" ? "text-right" : "text-left"
      } ${rule ? "border-rule border-s" : ""} ${className}`}
    >
      {children}
    </th>
  );
}

/** A body row. `tint` is for a row that is its own warning. */
export function Tr({ tint = "", className = "", children }) {
  return (
    <tr
      className={`border-rule hover:bg-carbon-wash/50 border-b align-top transition-colors duration-100 last:border-0 ${tint} ${className}`}
    >
      {children}
    </tr>
  );
}

/**
 * @param {object} props
 * @param {"left"|"right"} [props.align]
 * @param {boolean} [props.rule] the hairline that starts the money block
 */
export function Td({
  align = "left",
  rule = false,
  className = "",
  children,
  ...rest
}) {
  return (
    <td
      {...rest}
      className={`px-4 py-3 ${align === "right" ? "text-right" : ""} ${
        rule ? "border-rule border-s" : ""
      } ${className}`}
    >
      {children}
    </td>
  );
}

/** The quiet second line inside a cell. */
export function Meta({ className = "", children }) {
  return (
    <span className={`text-12 text-ink-muted mt-0.5 block ${className}`}>
      {children}
    </span>
  );
}

/**
 * Money, in the ledger face, right-aligned, with nothing where there is
 * nothing — a column of ₹0 reads as money the firm has, and it is not.
 *
 * @param {object} props
 * @param {number} props.paise
 * @param {boolean} [props.strong] the figure the column is about
 * @param {"late"|"muted"} [props.tone]
 * @param {string} [props.zero] what to draw instead of nought
 */
export function Num({
  paise,
  strong = false,
  tone,
  zero = "—",
  className = "",
}) {
  if (!paise) {
    return <span className={`text-faint ${className}`}>{zero}</span>;
  }
  return (
    <span
      className={`num ${strong ? "font-medium" : ""} ${
        tone === "late"
          ? "text-redpen"
          : tone === "muted"
            ? "text-ink-muted"
            : ""
      } ${className}`}
    >
      {formatPaise(paise)}
    </span>
  );
}

/** The totals row: the same hairline rule, and nothing shouted. */
export function Foot({ children }) {
  return (
    <tfoot>
      <tr className="border-rule bg-sunk text-13 border-t">{children}</tr>
    </tfoot>
  );
}

/** Nothing to show, in the one shape and at the one size. */
export function Empty({ colSpan, children }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="text-14 text-ink-muted px-4 py-12 text-center"
      >
        {children}
      </td>
    </tr>
  );
}

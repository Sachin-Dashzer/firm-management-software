/**
 * A screen that fits the screen (D104).
 *
 * The working lists — My tasks, Inbox, Issues, To-dos, Notices — are read
 * by scrolling, and when the whole page scrolls, the first thing to leave
 * is the band that says what you are looking at and the filters that
 * decide it. So on a laptop and up, the page is exactly the height of the
 * canvas: the head, the tiles and the filters are fixed, and only the
 * rows move, under a header row that stays.
 *
 * **It takes height as well as width** (QA 09-11-2026, #5 and #6).
 *
 * Dividing the canvas only works when there is a canvas to divide. On a
 * 1366×630 laptop the head, the tiles and the filters came to more than
 * two thirds of it, and the list — the reason the page exists — was left
 * with 0px on Potentials and 35px on To-dos: leads that could not be
 * seen, let alone edited. The original decision already said as much
 * about a phone ("A phone has no height to divide"); it was only ever
 * measuring the wrong axis.
 *
 * So the fixed canvas now asks for **768px across and 704px down**. Short
 * of either, this is an ordinary page that scrolls as one — what a phone
 * has always done here, and the right thing for a short laptop. The media
 * query is written out in full rather than built from a constant, because
 * Tailwind reads these class names out of the source text.
 *
 * `main` in the app layout is a flex child with `min-h-0`, so it already
 * has a definite height for `h-full` to resolve against.
 *
 * @param {object} props
 * @param {string} [props.className] extra classes on the page column
 */
export default function Screen({ className = "", children }) {
  return (
    <div
      className={`flex flex-col gap-4 p-4 md:p-6 [@media(min-width:48rem)_and_(min-height:44rem)]:h-full ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * The one part of a screen that scrolls. Everything above it stays put.
 *
 * `min-h-0` is load-bearing: without it a flex child refuses to shrink
 * below its content and the region grows the page instead of scrolling.
 *
 * The floor under it is the other half of #5 and #6. Even on a canvas
 * tall enough to divide, a page with a lot above its list can squeeze it
 * to nothing, because `min-h-0` lets a flex child shrink the whole way. A
 * floor of 14rem is about five rows; when the fixed part leaves less than
 * that, the column overflows and the page scrolls, because `main` in the
 * app layout is `overflow-auto`. Either way the list is reachable.
 */
export function ScrollArea({ className = "", children }) {
  return (
    <div
      className={`min-h-0 flex-1 [@media(min-width:48rem)_and_(min-height:44rem)]:min-h-56 [@media(min-width:48rem)_and_(min-height:44rem)]:overflow-auto ${className}`}
    >
      {children}
    </div>
  );
}

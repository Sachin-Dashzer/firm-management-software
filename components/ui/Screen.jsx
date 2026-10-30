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
 * **Below 768px it goes back to an ordinary page.** A phone has no height
 * to divide, and a scrolling region inside a scrolling page is the thing
 * a thumb gets caught in. `md:h-full` is that whole decision.
 *
 * `main` in the app layout is a flex child with `min-h-0`, so it already
 * has a definite height for `h-full` to resolve against.
 *
 * @param {object} props
 * @param {string} [props.className] extra classes on the page column
 */
export default function Screen({ className = "", children }) {
  return (
    <div className={`flex flex-col gap-4 p-4 md:h-full md:p-6 ${className}`}>
      {children}
    </div>
  );
}

/**
 * The one part of a screen that scrolls. Everything above it stays put.
 *
 * `min-h-0` is load-bearing: without it a flex child refuses to shrink
 * below its content and the region grows the page instead of scrolling.
 */
export function ScrollArea({ className = "", children }) {
  return (
    <div className={`min-h-0 flex-1 md:overflow-auto ${className}`}>
      {children}
    </div>
  );
}

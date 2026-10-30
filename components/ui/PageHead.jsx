/**
 * The band every working screen opens with (D104).
 *
 * Five screens — My tasks, Inbox, Issues, To-dos and Notices — each wrote
 * their own header, at five different widths, and three of them put the
 * page's one real action in a different place. This is that band, once:
 * the noun, one grey line about the data, and the actions on the right.
 *
 * Two rules it carries, both from the app-screen study:
 *
 *  - **The title is a noun at 24px**, not a greeting and not a landing
 *    page's 40. Nine of twenty-three measured product screens have no
 *    heading over 16px at all; of those that do, the median is 24.
 *  - **The second line is about the data, never about the interface.**
 *    "31 open matters, worst first" is a product; "use the filters below
 *    to narrow the list" is an instruction manual.
 *
 * The count sits with the search in the toolbar row underneath, not here,
 * because it changes when the filters change and the title does not.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {React.ReactNode} [props.sub] one line about the data or the scope
 * @param {React.ReactNode} [props.children] the actions, on the right
 */
export default function PageHead({ title, sub, children }) {
  return (
    <div className="flex shrink-0 flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h1 className="font-display text-24 font-bold tracking-tight">
          {title}
        </h1>
        {sub && <p className="text-13 text-ink-muted max-w-[72ch]">{sub}</p>}
      </div>
      {children && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {children}
        </div>
      )}
    </div>
  );
}

import { describeEntry } from "@/lib/audit/describe";

/**
 * The Activity tab that appears on every client, engagement and invoice
 * (spec section 11). A server component: the entries are already fetched and
 * permission-checked by whoever renders it.
 *
 * @param {object} props
 * @param {object[]} props.entries newest first
 * @param {string} [props.emptyMessage]
 */
export default function ActivityFeed({ entries, emptyMessage }) {
  /**
   * Entries with nothing in them are left out (QA 09-11-2026, #14). The
   * feed used to print "updated 0 fields" for a save that changed
   * nothing, which is a line that costs a reader time and tells them
   * nothing. The entry itself is kept — the audit log is the record, this
   * is only the reading of it.
   */
  const said = entries
    .map((entry) => ({ entry, ...describeEntry(entry) }))
    .filter((row) => !row.empty);

  if (!said.length) {
    return (
      <p className="text-14 text-ink-muted">
        {emptyMessage ?? "Nothing has happened here yet."}
      </p>
    );
  }

  return (
    <ol className="flex flex-col">
      {said.map(({ entry, headline, changes, when }) => {
        return (
          <li
            key={entry._id ?? entry.seq}
            className="border-rule flex gap-3 border-b py-3 last:border-0"
          >
            {/* the ledger margin: timestamp in the gutter, like a day book */}
            <time
              dateTime={new Date(entry.ts).toISOString()}
              className="num text-13 text-ink-muted w-36 shrink-0"
            >
              {when}
            </time>
            <div className="min-w-0">
              <p className="text-14">{headline}</p>
              {changes.length > 0 && (
                <ul className="mt-1 flex flex-col gap-0.5">
                  {changes.map((line) => (
                    <li key={line} className="text-13 text-ink-muted">
                      {line}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

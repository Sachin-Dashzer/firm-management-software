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
  if (!entries.length) {
    return (
      <p className="text-14 text-ink-muted">
        {emptyMessage ?? "Nothing has happened here yet."}
      </p>
    );
  }

  return (
    <ol className="flex flex-col">
      {entries.map((entry) => {
        const { headline, changes, when } = describeEntry(entry);
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

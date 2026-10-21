import { requireClientUser } from "@/auth";
import { connectDB } from "@/lib/db";
import DocumentModel from "@/models/Document";
import { documentScope } from "@/lib/access/clientScope";
import { formatISTDate } from "@/lib/dates";

export const metadata = { title: "Documents" };
export const dynamic = "force-dynamic";

/** Bytes as a person reads them. */
function size(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The documents the firm has shared with this client (P2-9b).
 *
 * **Only the ones somebody ticked.** `documentScope()` asks for
 * `sharedWithClient: true` and nothing else reaches this page — a working
 * paper and the client's own filed return live in the same collection, and
 * the difference between them is that tick.
 *
 * There is no upload here on purpose. The document-request link from Step
 * 6b already does that properly, with its own token and its own narrow
 * scope; a second way into the same vault is a second thing to get wrong.
 */
export default async function ClientDocumentsPage() {
  const person = await requireClientUser();
  await connectDB();

  const documents = await DocumentModel.find(documentScope(person))
    .select("name mime size fy kind sharedAt createdAt")
    .sort({ sharedAt: -1, createdAt: -1 })
    .limit(500)
    .lean();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-28 font-semibold">Documents</h1>
        <p className="text-14 text-ink-muted max-w-[65ch]">
          Papers the firm has shared with you. If something you expected is
          not here, ask the office — they decide what is ready to share.
        </p>
      </div>

      {documents.length === 0 ? (
        <p className="text-14 text-ink-muted rounded-ledger border-rule border border-dashed p-6">
          Nothing has been shared with you yet.
        </p>
      ) : (
        <ul className="rounded-ledger border-rule divide-rule divide-y border">
          {documents.map((document) => (
            <li
              key={String(document._id)}
              className="flex flex-wrap items-baseline justify-between gap-2 p-3"
            >
              <div>
                <span className="text-14 font-medium">{document.name}</span>
                <p className="text-12 text-ink-muted">
                  {[
                    document.kind,
                    document.fy,
                    size(document.size),
                    document.sharedAt
                      ? `shared ${formatISTDate(document.sharedAt)}`
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {/* the same signed, short-lived link staff get: nothing in the
                  vault is ever reachable by a plain URL (CLAUDE.md rule 11) */}
              <a
                href={`/client/documents/${document._id}`}
                className="rounded-ledger border-rule text-13 flex h-8 items-center border px-3"
              >
                Download
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

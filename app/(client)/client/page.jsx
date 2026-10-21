import { requireClientUser } from "@/auth";
import { connectDB } from "@/lib/db";
import DocumentModel from "@/models/Document";

export const metadata = { title: "Your file" };
export const dynamic = "force-dynamic";

/**
 * The portal's front page (P2-9a).
 *
 * P2-9a builds the door, the account and the admin screen; the rooms —
 * work, documents, invoices, the ledger, the change request — are P2-9b. So
 * this says what is here now and what is coming, rather than showing an
 * empty frame of tabs that do nothing.
 *
 * The one real figure it carries is the count of documents the firm has
 * shared, because that is the thing `sharedWithClient` turns on and the
 * fastest way to see whether it works.
 */
export default async function ClientHome() {
  const person = await requireClientUser();

  await connectDB();
  const shared = await DocumentModel.countDocuments({
    clientId: person.clientId,
    sharedWithClient: true,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-28 font-semibold">
          Welcome, {person.name.split(" ")[0]}
        </h1>
        <p className="text-14 text-ink-muted max-w-[65ch]">
          This is your own page with the firm. Nothing here is shared with
          anybody else, and you only ever see your own company&rsquo;s file.
        </p>
      </div>

      <section className="rounded-ledger border-rule bg-surface border p-4">
        <h2 className="font-display text-20">Documents shared with you</h2>
        <p className="text-14 mt-1">
          {shared === 0 ? (
            <span className="text-ink-muted">
              Nothing has been shared yet. When the firm marks a document as
              yours to see, it will appear here.
            </span>
          ) : (
            <>
              <span className="num text-28 font-medium">{shared}</span>{" "}
              <span className="text-ink-muted">
                {shared === 1 ? "document is" : "documents are"} ready for you.
              </span>
            </>
          )}
        </p>
      </section>

      <section className="rounded-ledger border-rule border border-dashed p-4">
        <h2 className="font-display text-18">Coming next</h2>
        <p className="text-14 text-ink-muted max-w-[65ch]">
          Your work in progress, the documents themselves, your invoices and
          their receipts, your account ledger, and a way to ask the firm to
          correct anything on your record. They are being built now.
        </p>
      </section>
    </div>
  );
}

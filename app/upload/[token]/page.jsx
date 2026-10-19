import { requestDetails } from "./actions";
import PublicUpload from "./PublicUpload";

export const metadata = {
  title: "Send documents · PHMG & Associates",
  // a link sent to a client must never end up in a search index
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * The page a client opens from the link we send them (spec section 6).
 *
 * No sign-in, and nothing to see but the list of documents being asked for.
 * The link can upload and nothing else: it cannot read a file back, reach
 * another client, or open any part of the CRM. It uses the app's own fonts
 * and colours from the root layout but none of its furniture — no rail, no
 * top bar, nothing to click into.
 */
export default async function UploadPage({ params }) {
  const { token } = await params;
  const details = await requestDetails(token);

  return (
    <main className="mx-auto flex max-w-[640px] flex-col gap-6 p-4 md:p-8">
      <header className="border-brass flex flex-col gap-1 border-b pb-4">
        <p className="font-display text-24 font-semibold">
          PHMG &amp; Associates
        </p>
        <p className="text-13 text-ink-muted">
          Chartered Accountants · secure document upload
        </p>
      </header>

      {details.error ? (
        <div className="rounded-ledger border-redpen bg-redpen-wash flex flex-col gap-2 border p-4">
          <p className="text-14 text-redpen">{details.error}</p>
          <p className="text-13 text-ink-muted">
            Please reply to the email you received, or call the office, and we
            will send a new link.
          </p>
        </div>
      ) : (
        <PublicUpload token={token} details={details} />
      )}

      <footer className="text-12 text-ink-muted border-rule border-t pt-4">
        Files you send here are encrypted and visible only to the staff working
        on your file. This link cannot be used to view anything.
      </footer>
    </main>
  );
}

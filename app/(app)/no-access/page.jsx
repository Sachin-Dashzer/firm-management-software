import Link from "next/link";
import { requireUser } from "@/auth";
import { connectDB } from "@/lib/db";
import Client from "@/models/Client";
import User from "@/models/User";

export const metadata = { title: "No access · PHMG" };
export const dynamic = "force-dynamic";

/**
 * "You may not open this, and here is who can let you" (P3-7).
 *
 * What this replaces is a redirect to the list, which told somebody who had
 * followed a link from an email that the record did not exist — so they
 * asked whether the system had lost it, instead of asking for access.
 *
 * It deliberately says **nothing about the record**: not the client's name,
 * not the service, not the period. The only thing added to "no" is the name
 * of the person who can say yes, which is a colleague's name and not the
 * client's data. Spec §2 is the reason this page is so thin.
 */
export default async function NoAccessPage({ searchParams }) {
  const actor = await requireUser();
  const params = (await searchParams) ?? {};

  let askName = "";
  if (params.client) {
    await connectDB();
    /**
     * Only the id of whoever is responsible leaves this query. A client this
     * person may not see must not become readable because they guessed a
     * URL that lands here.
     */
    const client = await Client.findById(params.client)
      .select("clientPartnerId relationshipManagerId")
      .lean();
    const askId = client?.clientPartnerId ?? client?.relationshipManagerId;
    if (askId) {
      const person = await User.findById(askId).select("name").lean();
      askName = person?.name ?? "";
    }
  }

  return (
    <div className="mx-auto flex max-w-[60ch] flex-col gap-4 p-4 md:p-8">
      <h1 className="font-display text-24 font-bold tracking-tight">
        This one is not open to you
      </h1>

      <p className="text-14">
        You followed a link to a record outside your access. It exists — this is
        not a missing page — and somebody at the firm can give you access to it.
      </p>

      <div className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border p-4">
        <p className="text-14 font-medium">What to ask for</p>
        <p className="text-14">
          {askName ? (
            <>
              Ask <strong>{askName}</strong>, who looks after this client, for
              access to it.
            </>
          ) : (
            <>
              Ask a partner, or the CA who runs the branch this belongs to, for
              access to this client.
            </>
          )}{" "}
          A CA or a partner can grant it on the client&rsquo;s{" "}
          <strong>Team &amp; access</strong> tab, for as long as you need it.
        </p>
        <p className="text-13 text-ink-muted">
          You are signed in as {actor.name}
          {actor.branchIds?.length
            ? `, with access to ${actor.branchIds.length === 1 ? "one branch" : `${actor.branchIds.length} branches`}`
            : ""}
          . Changing the branch view in the top bar will not open this — that
          selector only changes what you are looking at inside what you may
          already see.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/issues"
          className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-3 leading-9 font-medium"
        >
          Back to Issues
        </Link>
        <Link
          href="/clients"
          className="rounded-control border-rule text-14 h-9 border px-3 leading-9"
        >
          Clients you can open
        </Link>
      </div>
    </div>
  );
}

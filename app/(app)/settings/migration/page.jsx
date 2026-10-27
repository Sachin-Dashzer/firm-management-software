import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import Migration from "./Migration";

export const metadata = { title: "Bringing data in · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Go-live migration (spec section 17, step 2): "import existing clients,
 * team members and opening receivables from Excel".
 *
 * The client import has lived on its own screen since Step 3; the other
 * two are here, in the order the firm will actually do them — people
 * first, because an engagement needs somebody to assign it to, and money
 * last, because an opening balance needs a client to belong to.
 */
export default async function MigrationPage() {
  const actor = await requireUser();
  if (!can(actor, "edit", "usersSettings")) redirect("/issues");

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="font-display text-24 font-bold tracking-tight">
          Bringing data in
        </h1>
        <p className="text-13 text-ink-muted">
          For go-live. Do it in this order: the team, then the clients, then
          what each client owed you on the day you switch over.
        </p>
      </div>

      <ol className="rounded-ledger border-rule bg-surface text-14 flex flex-col gap-2 border p-4">
        <li>
          <strong>1. The team</strong> — below. Each person gets a one-time
          password to read out to them.
        </li>
        <li>
          <strong>2. The clients</strong> —{" "}
          <Link href="/clients/import" className="underline underline-offset-4">
            on the client import screen
          </Link>
          , where it has been since the clients were built.
        </li>
        <li>
          <strong>3. Opening balances</strong> — below, once the clients are in,
          because each balance has to belong to one.
        </li>
      </ol>

      <Migration />
    </div>
  );
}

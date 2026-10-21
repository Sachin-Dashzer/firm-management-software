import { redirect } from "next/navigation";
import Link from "next/link";
import { currentClientUser } from "@/auth";
import { connectDB } from "@/lib/db";
import Client from "@/models/Client";
import { firmProfile } from "@/lib/firm/settings";
import SignOutButton from "@/components/shell/SignOutButton";

export const dynamic = "force-dynamic";

/**
 * The client portal's shell (P2-9a).
 *
 * The mirror of the staff layout and the second half of the lock between
 * them: this one turns away anybody `currentClientUser()` will not vouch
 * for, which includes every member of the firm. A staff token reaching
 * `/client` lands back at the portal's login screen — not because the pages
 * check, but because the layout does, once, for all of them.
 *
 * Nothing in here is the practice management system. No rail, no branch
 * switcher, no firm jargon: a client sees their own company's name, the
 * firm's name, and the few things that concern them.
 */
export default async function ClientLayout({ children }) {
  const person = await currentClientUser();
  if (!person) redirect("/client/login");

  /**
   * The password the office read out is not their password. Nothing in the
   * portal opens until they have set one only they know — the same rule as
   * for staff, and the screen for it sits outside this layout so there is
   * nothing here to loop against.
   */
  if (person.mustChangePassword) redirect("/client/change-password");

  await connectDB();
  const [client, firm] = await Promise.all([
    Client.findById(person.clientId).select("legalName tradeName").lean(),
    firmProfile(),
  ]);

  // the account's client was closed or removed: there is nothing to show,
  // and showing an empty portal would be worse than saying so
  if (!client) redirect("/client/login");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-rule bg-surface border-b">
        <div className="mx-auto flex max-w-[1000px] flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <Link href="/client" className="font-display text-20">
              {client.tradeName || client.legalName}
            </Link>
            <p className="text-12 text-ink-muted">
              Your file with {firm.name}
            </p>
          </div>
          <div className="text-13 flex items-center gap-3">
            <span className="text-ink-muted">{person.name}</span>
            <SignOutButton className="rounded-ledger border-rule h-8 border px-2" />
          </div>
        </div>
      </header>

      <main id="content" className="mx-auto w-full max-w-[1000px] flex-1 p-4 md:p-6">
        {children}
      </main>

      <footer className="border-rule text-12 text-ink-muted border-t p-4 text-center">
        {firm.name}
        {firm.frn ? ` · FRN ${firm.frn}` : ""}
        {firm.email ? ` · ${firm.email}` : ""}
      </footer>
    </div>
  );
}

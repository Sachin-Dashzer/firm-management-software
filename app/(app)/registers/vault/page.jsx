import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Client from "@/models/Client";
import ClientCredential from "@/models/ClientCredential";
import { clientListFilter } from "@/lib/access/clientAccess";
import { formatISTDate } from "@/lib/dates";
import { PORTALS } from "@/lib/validators";
import PageHead from "@/components/ui/PageHead";
import Panel from "@/components/ui/Panel";
import FilterChip from "@/components/ui/FilterChip";
import RegisterTabs from "@/components/practice/RegisterTabs";
import VaultTable from "./VaultTable";

export const metadata = { title: "Logins vault · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Every portal login the firm holds, in one list (P3-22b).
 *
 * The list is built from metadata alone: the ciphertext is `select: false`
 * on the model, so nothing on this page's first paint has ever been
 * decrypted. A password arrives only when somebody presses Reveal and types
 * the code it asks for — one credential, one deliberate act, one audit entry
 * (`actions.js` here, and `revealCredential()` behind it).
 *
 * What the list itself answers is the question that was unanswerable: *do we
 * hold a TRACES login for every client we file TDS for?*
 *
 * Only a Partner and a CA get here at all (`clientCredentials` in spec
 * section 2, which no grant widens), and a CA sees their branches, because
 * the client list is scoped before the credentials are fetched.
 */
export default async function LoginsVaultPage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "clientCredentials")) redirect("/issues");

  const params = (await searchParams) ?? {};
  const portal = PORTALS.includes(params.portal) ? params.portal : null;

  await connectDB();

  /**
   * The clients this person may see first, then their logins — and not the
   * other way round. `scopedByClient()` would put a `branchId` condition on
   * a collection that has no such field, which matches nothing and would
   * have made this page quietly empty for a CA.
   */
  const clients = await Client.find(await clientListFilter(actor))
    .select("legalName tradeName code")
    .sort({ legalName: 1 })
    .limit(2000)
    .lean();

  const credentials = await ClientCredential.find({
    clientId: { $in: clients.map((c) => c._id) },
    ...(portal ? { portal } : {}),
  })
    .select("clientId portal label username lastRevealedAt")
    .sort({ portal: 1 })
    .limit(5000)
    .lean();

  const clientById = new Map(clients.map((c) => [String(c._id), c]));

  const rows = credentials
    .map((credential) => {
      const client = clientById.get(String(credential.clientId));
      return {
        id: String(credential._id),
        clientId: String(credential.clientId),
        client: client ? client.tradeName || client.legalName : "Client",
        code: client?.code ?? "",
        portal: credential.portal,
        label: credential.label ?? "",
        username: credential.username,
        lastRevealed: credential.lastRevealedAt
          ? formatISTDate(new Date(credential.lastRevealedAt))
          : "never",
      };
    })
    .sort(
      (a, b) =>
        a.client.localeCompare(b.client) || a.portal.localeCompare(b.portal),
    );

  const held = new Map();
  for (const row of credentials) {
    held.set(row.portal, (held.get(row.portal) ?? 0) + 1);
  }

  const withoutAny = clients.filter(
    (client) =>
      !credentials.some(
        (credential) => String(credential.clientId) === String(client._id),
      ),
  );

  return (
    <div className="mx-auto flex max-w-[1380px] flex-col gap-5 p-4 md:p-6">
      <PageHead
        title="Logins vault"
        sub={
          <>
            {rows.length} {rows.length === 1 ? "login" : "logins"} held across{" "}
            {new Set(rows.map((row) => row.clientId)).size} clients. A password
            is shown one at a time, to whoever types the code, and every reveal
            is in the audit log.
          </>
        }
      >
        <RegisterTabs current="vault" />
      </PageHead>

      <nav
        className="flex flex-wrap items-center gap-1.5"
        aria-label="Portals"
      >
        <FilterChip href="/registers/vault" on={!portal} count={rows.length}>
          All
        </FilterChip>
        {PORTALS.map((name) => (
          <FilterChip
            key={name}
            href={`/registers/vault?portal=${encodeURIComponent(name)}`}
            on={portal === name}
            count={held.get(name) ?? 0}
          >
            {name}
          </FilterChip>
        ))}
      </nav>

      <VaultTable
        rows={rows}
        mayEdit={can(actor, "edit", "clientCredentials")}
      />

      {withoutAny.length > 0 && (
        <Panel
          title="Clients with no login held"
          count={String(withoutAny.length)}
          hint="Worth knowing before a deadline, not during one"
        >
          <p className="text-13 text-ink-muted max-w-[70ch]">
            Not a fault in itself — a client may file their own returns, or
            hold their own credentials.
          </p>
          <ul className="text-13 flex flex-wrap gap-x-4 gap-y-1">
            {withoutAny.map((client) => (
              <li key={String(client._id)}>
                <Link
                  href={`/clients/${client._id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {client.tradeName || client.legalName}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

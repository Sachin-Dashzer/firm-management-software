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

export const metadata = { title: "Logins vault · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Every portal login the firm holds, in one list (P3-22b).
 *
 * **Nothing is revealed here, and nothing can be.** Revealing a password is
 * a deliberate act on one client's own page, audited every time (spec
 * section 11), and that stays exactly where it is: a screen that could
 * decrypt two hundred passwords is a different risk from one that decrypts
 * one, however the buttons are labelled. What this page answers is the
 * question that was unanswerable — *do we hold a TRACES login for every
 * client we file TDS for?* — and it answers it from the metadata alone.
 *
 * The ciphertext is `select: false` on the model, so the rows below were
 * read without it: there is no password in this page's memory to leak.
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
        lastRevealedAt: credential.lastRevealedAt,
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
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5 p-4 md:p-6">
      <div>
        <h1 className="font-display text-24 font-bold tracking-tight">
          Logins vault
        </h1>
        <p className="text-13 text-ink-muted max-w-[70ch]">
          Which logins the firm holds, and when each was last used. Revealing a
          password stays on the client&rsquo;s own page, where it is audited
          every time.
        </p>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Portals">
        <Link
          href="/registers/vault"
          aria-current={portal ? undefined : "page"}
          className={`rounded-control text-13 border px-3 py-1.5 ${
            portal
              ? "border-rule hover:bg-carbon-wash"
              : "border-carbon bg-carbon-wash text-carbon"
          }`}
        >
          All · <span className="num">{credentials.length}</span>
        </Link>
        {PORTALS.map((name) => (
          <Link
            key={name}
            href={`/registers/vault?portal=${encodeURIComponent(name)}`}
            aria-current={portal === name ? "page" : undefined}
            className={`rounded-control text-13 border px-3 py-1.5 ${
              portal === name
                ? "border-carbon bg-carbon-wash text-carbon"
                : held.get(name)
                  ? "border-rule hover:bg-carbon-wash"
                  : "border-rule text-ink-muted"
            }`}
          >
            {name}
            {held.get(name) ? (
              <span className="num"> · {held.get(name)}</span>
            ) : null}
          </Link>
        ))}
      </nav>

      <div className="rounded-table border-rule bg-surface overflow-x-auto border">
        <table className="text-14 w-full">
          <thead>
            <tr className="border-rule text-12 text-faint border-b text-left font-normal">
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Portal</th>
              <th className="px-3 py-2 font-medium">Which login</th>
              <th className="px-3 py-2 font-medium">Username</th>
              <th className="px-3 py-2 font-medium">Last revealed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-rule border-b last:border-0">
                <td className="px-3 py-2">
                  <Link
                    href={`/clients/${row.clientId}`}
                    className="underline underline-offset-4"
                  >
                    {row.client}
                  </Link>
                  {row.code && (
                    <span className="text-12 text-ink-muted font-mono">
                      {" "}
                      {row.code}
                    </span>
                  )}
                </td>
                <td className="text-13 px-3 py-2">{row.portal}</td>
                <td className="text-13 text-ink-muted px-3 py-2">
                  {row.label || "—"}
                </td>
                <td className="text-13 px-3 py-2 font-mono">{row.username}</td>
                <td className="num text-13 text-ink-muted px-3 py-2">
                  {row.lastRevealedAt
                    ? formatISTDate(new Date(row.lastRevealedAt))
                    : "never"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="text-ink-muted px-3 py-6 text-center"
                >
                  {portal
                    ? `No ${portal} login is held.`
                    : "No logins are held yet. They are added on a client's own page."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {withoutAny.length > 0 && (
        <section className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border p-4">
          <h2 className="font-display text-18">
            Clients with no login held
            <span className="num text-ink-muted"> · {withoutAny.length}</span>
          </h2>
          <p className="text-13 text-ink-muted max-w-[70ch]">
            Not a fault in itself — a client may file their own returns, or hold
            their own credentials. It is worth knowing before a deadline rather
            than during one.
          </p>
          <ul className="text-13 flex flex-wrap gap-x-4 gap-y-1">
            {withoutAny.map((client) => (
              <li key={String(client._id)}>
                <Link
                  href={`/clients/${client._id}`}
                  className="underline underline-offset-4"
                >
                  {client.tradeName || client.legalName}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

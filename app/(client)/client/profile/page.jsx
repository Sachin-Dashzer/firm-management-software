import Link from "next/link";
import { requireClientUser } from "@/auth";
import { connectDB } from "@/lib/db";
import Client from "@/models/Client";
import Comment from "@/models/Comment";
import { formatISTDate, formatISTDateTime } from "@/lib/dates";
import ChangeRequest from "./ChangeRequest";

export const metadata = { title: "Your details" };
export const dynamic = "force-dynamic";

/**
 * What the firm holds on this client, and how to query it (P2-9b).
 *
 * Read-only, with a change request instead of an edit box — see the action
 * for why. What is shown is what the client would recognise: their names,
 * their registrations, their addresses and their people. **No internal
 * fields**: not the tier, not who manages them, not the fee agreement, not
 * a note anybody has written about them.
 *
 * The PAN is shown because it is their own number on their own record and
 * they can read it off a card in their wallet; it is never logged
 * (CLAUDE.md rule 7).
 */
export default async function ClientProfilePage() {
  const person = await requireClientUser();
  await connectDB();

  const [client, requests] = await Promise.all([
    Client.findById(person.clientId)
      .select(
        "legalName tradeName entityType pan gstins addresses contacts incorporatedOn establishedOn code",
      )
      .lean(),
    // their own requests, so they can see we have them and are not asked
    // to remember what they already told us
    Comment.find({
      clientId: person.clientId,
      kind: "Change request",
      internal: false,
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
  ]);

  if (!client) {
    return (
      <p className="text-14 text-ink-muted">
        Your file is not available just now. Please ring the office.
      </p>
    );
  }

  const address =
    (client.addresses ?? []).find((a) => a.kind === "Registered") ??
    (client.addresses ?? [])[0] ??
    null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-24 font-bold tracking-tight">
          Your details
        </h1>
        <p className="text-14 text-ink-muted max-w-[65ch]">
          What we hold on your file. If any of it is out of date, tell us below
          — we will check it and change it ourselves rather than letting the
          record change itself.
        </p>
      </div>

      <section className="rounded-ledger border-rule bg-surface border p-4">
        <h2 className="font-display text-15 font-semibold">The company</h2>
        <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <Row label="Legal name" value={client.legalName} />
          <Row label="Trading as" value={client.tradeName} />
          <Row label="Type" value={client.entityType} />
          <Row label="PAN" value={client.pan} mono />
          <Row
            label="Established"
            value={
              client.incorporatedOn || client.establishedOn
                ? formatISTDate(client.incorporatedOn || client.establishedOn)
                : ""
            }
          />
          <Row
            label="Registered address"
            value={
              address
                ? [
                    address.line1,
                    address.line2,
                    [address.city, address.state].filter(Boolean).join(" "),
                    address.pincode,
                  ]
                    .filter(Boolean)
                    .join(", ")
                : ""
            }
          />
        </dl>
      </section>

      {(client.gstins ?? []).length > 0 && (
        <section className="rounded-ledger border-rule bg-surface border p-4">
          <h2 className="font-display text-15 font-semibold">
            GST registrations
          </h2>
          <ul className="mt-2 flex flex-col gap-1">
            {client.gstins.map((row, index) => (
              <li key={row.gstin || index} className="text-14">
                <span className="font-mono">{row.gstin}</span>
                {row.state && (
                  <span className="text-ink-muted text-13"> · {row.state}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(client.contacts ?? []).length > 0 && (
        <section className="rounded-ledger border-rule bg-surface border p-4">
          <h2 className="font-display text-15 font-semibold">
            Who we speak to
          </h2>
          <ul className="mt-2 flex flex-col gap-1">
            {client.contacts.map((contact, index) => (
              <li key={contact.email || index} className="text-14">
                {contact.name}
                {contact.designation && (
                  <span className="text-ink-muted text-13">
                    {" "}
                    · {contact.designation}
                  </span>
                )}
                {contact.primary && (
                  <span className="text-ink-muted text-13">
                    {" "}
                    · main contact
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <ChangeRequest />

      {requests.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-15 font-semibold">
            What you have asked us
          </h2>
          <ul className="rounded-ledger border-rule divide-rule divide-y border">
            {requests.map((request) => (
              <li key={String(request._id)} className="p-3">
                <p className="text-14 whitespace-pre-wrap">{request.body}</p>
                <p className="text-12 text-ink-muted mt-1">
                  {formatISTDateTime(request.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-13 text-ink-muted">
        You can also{" "}
        <Link
          href="/client/change-password?from=portal"
          className="underline underline-offset-4"
        >
          change your password
        </Link>
        .
      </p>
    </div>
  );
}

function Row({ label, value, mono = false }) {
  return (
    <div>
      <dt className="text-12 text-ink-muted uppercase">{label}</dt>
      <dd className={`text-14 ${mono ? "font-mono" : ""}`}>
        {value || <span className="text-ink-muted font-sans">—</span>}
      </dd>
    </div>
  );
}

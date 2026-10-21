import Link from "next/link";
import { requireClientUser } from "@/auth";
import { connectDB } from "@/lib/db";
import Engagement from "@/models/Engagement";
import DocumentModel from "@/models/Document";
import Invoice from "@/models/Invoice";
import {
  documentScope,
  engagementScope,
  invoiceScope,
  ENGAGEMENT_FIELDS,
  engagementForClient,
} from "@/lib/access/clientScope";
import { CLOSED_STATUSES } from "@/lib/engagements/status";
import { outstandingSummary } from "@/lib/billing/allocation";
import { formatPaise } from "@/lib/money";
import { formatISTDate, daysUntil } from "@/lib/dates";

export const metadata = { title: "Your file" };
export const dynamic = "force-dynamic";

/**
 * The portal's front page (P2-9b).
 *
 * Three questions, in the order a client asks them: what are you doing for
 * me, what are you waiting for from me, and what do I owe. Everything else
 * is a page of its own.
 */
export default async function ClientHome() {
  const person = await requireClientUser();
  await connectDB();

  const [open, waiting, documents, invoices] = await Promise.all([
    Engagement.find({
      ...engagementScope(person),
      status: { $nin: CLOSED_STATUSES },
    })
      .select(ENGAGEMENT_FIELDS)
      .sort({ statutoryDue: 1 })
      .limit(50)
      .lean(),
    /**
     * What the firm is waiting for. Only the client's own side of a
     * checklist: an item the firm owes itself is the firm's business, and
     * showing it here would read as a demand on the wrong person.
     */
    Engagement.find({
      ...engagementScope(person),
      status: { $nin: CLOSED_STATUSES },
      checklist: {
        $elemMatch: {
          side: "client",
          status: { $in: ["Pending", "Requested"] },
        },
      },
    })
      .select("checklist templateSnapshot.name periodLabel period")
      .limit(50)
      .lean(),
    DocumentModel.countDocuments(documentScope(person)),
    Invoice.find(invoiceScope(person)).lean(),
  ]);

  const money = outstandingSummary(invoices);
  const rows = open.map(engagementForClient);

  const wanted = waiting.flatMap((engagement) =>
    (engagement.checklist ?? [])
      .filter(
        (item) =>
          item.side === "client" &&
          ["Pending", "Requested"].includes(item.status),
      )
      .map((item) => ({
        id: String(item._id),
        name: item.name,
        for: `${engagement.templateSnapshot?.name ?? "Work"} · ${
          engagement.periodLabel || engagement.period
        }`,
      })),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-28 font-semibold">
          Welcome, {person.name.split(" ")[0]}
        </h1>
        <p className="text-14 text-ink-muted max-w-[65ch]">
          Everything we are doing for you, in one place.
        </p>
      </div>

      {wanted.length > 0 && (
        <section className="rounded-ledger border-waiting bg-surface border p-4">
          <h2 className="font-display text-20">
            We are waiting for {wanted.length === 1 ? "one thing" : `${wanted.length} things`} from you
          </h2>
          <ul className="mt-2 flex flex-col gap-1">
            {wanted.slice(0, 8).map((item) => (
              <li key={item.id} className="text-14">
                {item.name}{" "}
                <span className="text-ink-muted text-13">— {item.for}</span>
              </li>
            ))}
          </ul>
          <p className="text-13 text-ink-muted mt-2">
            Send these to the office, or use the upload link we emailed you.
          </p>
        </section>
      )}

      <section className="rounded-ledger border-rule bg-surface border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-20">What we are working on</h2>
          <Link
            href="/client/work"
            className="text-13 underline underline-offset-4"
          >
            All your work
          </Link>
        </div>
        {rows.length === 0 ? (
          <p className="text-14 text-ink-muted mt-1">
            Nothing is open at the moment.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col">
            {rows.slice(0, 6).map((row) => (
              <li
                key={row.id}
                className="border-rule flex flex-wrap items-baseline justify-between gap-2 border-b py-2 last:border-0"
              >
                <span className="text-14">
                  {row.service}{" "}
                  <span className="text-ink-muted text-13">{row.period}</span>
                </span>
                <span className="text-13 text-ink-muted">
                  {row.status}
                  {row.due &&
                    ` · due ${formatISTDate(row.due)}${
                      daysUntil(row.due) >= 0
                        ? ` (${daysUntil(row.due)} days)`
                        : ""
                    }`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-ledger border-rule bg-surface border p-4">
          <h2 className="font-display text-18">Documents shared with you</h2>
          <p className="text-14 mt-1">
            {documents === 0 ? (
              <span className="text-ink-muted">
                Nothing has been shared yet.
              </span>
            ) : (
              <Link href="/client/documents" className="underline underline-offset-4">
                <span className="num text-28 font-medium">{documents}</span>{" "}
                {documents === 1 ? "document" : "documents"}
              </Link>
            )}
          </p>
        </section>

        <section className="rounded-ledger border-rule bg-surface border p-4">
          <h2 className="font-display text-18">Outstanding</h2>
          <p className="text-14 mt-1">
            {money.totalPaise === 0 ? (
              <span className="text-ink-muted">Nothing is owing. Thank you.</span>
            ) : (
              <Link href="/client/ledger" className="underline underline-offset-4">
                <span className="num text-28 font-medium">
                  {formatPaise(money.totalPaise)}
                </span>
                {money.overduePaise > 0 && (
                  <span className="text-redpen text-13">
                    {" "}
                    · {formatPaise(money.overduePaise)} past its due date
                  </span>
                )}
              </Link>
            )}
          </p>
        </section>
      </div>
    </div>
  );
}

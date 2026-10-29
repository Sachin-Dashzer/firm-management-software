import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, branchFilter } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import AuditLog from "@/models/AuditLog";
import { describeEntry } from "@/lib/audit/describe";
import { groupByDay } from "@/lib/audit/log";

export const metadata = { title: "What's new · PHMG" };
export const dynamic = "force-dynamic";

/**
 * What has changed about the way this firm's system works (P3-22d).
 *
 * **Not release notes.** A page somebody remembers to update is a page
 * nobody updates, and the prototype's own description of this screen says
 * so. What a firm actually needs to know is what changed *here*: who
 * confirmed a due-date rule, who approved a template, who added a service,
 * who changed the firm's own record. All of that is already written down —
 * every change in this system writes an audit entry in the same
 * transaction (CLAUDE.md rule 2) — so this is a lens on the Portal log
 * rather than a new record.
 *
 * It is the firm's settings and its own furniture, not its work: a client,
 * an invoice or an engagement changing is the day job, and it belongs on
 * the Portal log where it can be filtered properly.
 */

/** The records that are *how the firm works*, rather than its daily work. */
const SETTINGS_RECORDS = [
  "FirmSettings",
  "Branch",
  "ServiceTemplate",
  "DueDateRule",
  "DocTemplate",
  "NotificationRule",
  "User",
  "Procedure",
];

/**
 * Changes, not events. A sign-in is recorded against a `User` and is not a
 * change to how the firm works — it belongs on the Portal log and on the
 * security screen, which is where somebody looking for it goes.
 */
const CHANGES = ["create", "update", "delete", "restore", "role_change"];

const PAGE_SIZE = 60;

export default async function WhatsNewPage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "auditLog")) redirect("/settings");

  const params = (await searchParams) ?? {};
  const page = Math.max(1, Number(params.page) || 1);

  await connectDB();

  /** @type {Record<string, any>} */
  const query = {
    entityType: { $in: SETTINGS_RECORDS },
    action: { $in: CHANGES },
  };
  // a CA sees their own branches, exactly as on the Portal log
  if (branchFilter(actor, "auditLog")) {
    query.branchId = { $in: actor.branchIds };
  }

  const [entries, total] = await Promise.all([
    AuditLog.find(query)
      .sort({ seq: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    AuditLog.countDocuments(query),
  ]);

  const days = groupByDay(entries).map((day) => ({
    ...day,
    rows: day.entries.map((entry) => ({
      id: String(entry._id),
      ...describeEntry(entry),
    })),
  }));

  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-5 p-4 md:p-6">
      <div>
        <Link
          href="/settings"
          className="text-13 text-ink-muted underline underline-offset-4"
        >
          Settings
        </Link>
        <h1 className="font-display text-24 font-bold tracking-tight">
          What&rsquo;s new
        </h1>
        <p className="text-13 text-ink-muted max-w-[70ch]">
          What has changed about the way this firm&rsquo;s system works — the
          rules, the services, the templates, the people. Read from the log
          itself, so nothing has to be remembered and written up. The
          day&rsquo;s work is on the{" "}
          <Link href="/portal-log" className="underline underline-offset-4">
            Portal log
          </Link>
          .
        </p>
      </div>

      {days.length === 0 ? (
        <p className="rounded-ledger border-rule bg-surface text-14 border px-4 py-3">
          Nothing has been changed yet. Setting the firm up is on{" "}
          <Link href="/settings/setup" className="underline underline-offset-4">
            the setup page
          </Link>
          , and every step of it will show here as it is done.
        </p>
      ) : (
        days.map((day) => (
          <section key={day.key} className="flex flex-col gap-2">
            <h2 className="text-13 text-ink-muted font-medium">
              {day.label}
              <span className="num"> · {day.rows.length}</span>
            </h2>

            <ul className="ledger-rule flex flex-col">
              {day.rows.map((row) => (
                <li key={row.id} className="flex flex-col gap-0.5 py-2">
                  <p className="text-14">{row.headline}</p>
                  {row.changes.length > 0 && (
                    <ul className="text-13 text-ink-muted flex flex-col">
                      {row.changes.map((change) => (
                        <li key={change}>{change}</li>
                      ))}
                    </ul>
                  )}
                  <p className="num text-12 text-ink-muted">{row.when}</p>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {pages > 1 && (
        <nav className="text-14 flex items-center gap-3" aria-label="Pages">
          {page > 1 && (
            <Link
              href={`/settings/whats-new?page=${page - 1}`}
              className="underline underline-offset-4"
            >
              Newer
            </Link>
          )}
          <span className="text-13 text-ink-muted">
            Page {page} of {pages}
          </span>
          {page < pages && (
            <Link
              href={`/settings/whats-new?page=${page + 1}`}
              className="underline underline-offset-4"
            >
              Older
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}

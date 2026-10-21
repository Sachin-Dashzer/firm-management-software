import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { needsAttention } from "@/lib/settings/attention";
import { firmProfile } from "@/lib/firm/settings";

export const metadata = { title: "Settings · PHMG" };
export const dynamic = "force-dynamic";

/**
 * The five groups, in the order a firm thinks about them (P2-10b).
 *
 * Sixteen links in one column was what sixteen steps each adding its own
 * row produced. The practice registers are here only because there was
 * nowhere else to put them; P2-10d moves that group into the left rail,
 * where daily work belongs.
 */
const GROUPS = [
  { key: "firm", title: "The firm" },
  { key: "work", title: "The work" },
  { key: "practice", title: "The practice" },
  { key: "messages", title: "Messages" },
  { key: "data", title: "Data and security" },
];

/** Later steps add their own sections here: due dates, numbering, templates. */
const SECTIONS = [
  {
    href: "/team",
    group: "firm",
    title: "Team and access",
    body: "Everybody in the firm: what is on their desk, who they report to, and — for a partner — roles, passwords and offboarding.",
    area: "team",
    action: "view",
  },
  {
    href: "/settings/services",
    group: "work",
    title: "Services",
    body: "The catalog every engagement is created from: checklists, steps, turnaround and fees.",
    area: "serviceCatalog",
    action: "view",
  },
  {
    href: "/settings/branches",
    group: "firm",
    title: "Branches",
    body: "Office addresses, GST registrations and invoice series.",
    area: "usersSettings",
    action: "edit",
  },
  {
    href: "/settings/doc-templates",
    group: "work",
    title: "Document templates",
    body: "The firm's letters and certificates — and which of them a partner has approved.",
    area: "docTemplates",
    action: "view",
  },
  {
    href: "/practice/audits",
    group: "practice",
    title: "Audits",
    body: "Every audit engagement, the report date, the opinion and the number it was signed with.",
    area: "practice",
    action: "view",
  },
  {
    href: "/practice/statutory",
    group: "practice",
    title: "Statutory",
    body: "ROC filings: due, filed, and the SRN that came back.",
    area: "practice",
    action: "view",
  },
  {
    href: "/practice/tax",
    group: "practice",
    title: "Tax",
    body: "Direct, indirect and payroll returns — filed on time, or how late.",
    area: "practice",
    action: "view",
  },
  {
    href: "/practice/udin",
    group: "practice",
    title: "UDIN register",
    body: "Every number the firm has signed against, by year — and what became of it.",
    area: "udin",
    action: "view",
  },
  {
    href: "/practice/dsc",
    group: "practice",
    title: "DSC register",
    body: "Whose digital signature certificate expires when, so nobody is caught out mid-filing.",
    area: "dsc",
    action: "view",
  },
  {
    href: "/settings/icai",
    group: "firm",
    title: "ICAI",
    body: "The firm's own record — name, registration number, peer review — who holds what membership, and the CPE log.",
    area: "icai",
    action: "view",
  },
  {
    href: "/settings/due-dates",
    group: "work",
    title: "Statutory due dates",
    body: "How each deadline is worked out, and whether anyone has confirmed it.",
    area: "usersSettings",
    action: "edit",
  },
  {
    href: "/settings/messages",
    group: "messages",
    title: "Messages",
    body: "What the system has emailed, what it has held back, and whether the mailbox works.",
    area: "usersSettings",
    action: "edit",
  },
  {
    href: "/settings/migration",
    group: "data",
    title: "Bringing data in",
    body: "For go-live: the team and what each client owed you on the day you switch over.",
    area: "usersSettings",
    action: "edit",
  },
  {
    href: "/settings/permissions",
    group: "data",
    title: "Who can do what",
    body: "Every part of the system and what each role may do with it — the list the server enforces.",
    area: "usersSettings",
    action: "edit",
  },
  {
    href: "/settings/security",
    group: "data",
    title: "Security",
    body: "What the portal log is showing, and the firm's record of anything that went wrong.",
    area: "usersSettings",
    action: "edit",
  },
  {
    href: "/settings/jobs",
    group: "data",
    title: "Background jobs",
    body: "Whether the system's scheduled work is running, and anything that failed.",
    area: "usersSettings",
    action: "edit",
  },
  {
    href: "/documents/bin",
    group: "data",
    title: "Recycle bin",
    body: "Deleted files, restorable for 90 days. Erasing one cannot be undone.",
    area: "deleteRecord",
    action: "approve",
  },
];

export default async function SettingsPage() {
  const actor = await requireUser();
  const sections = SECTIONS.filter((s) => can(actor, s.action, s.area));
  if (sections.length === 0) redirect("/today");

  await connectDB();
  const firm = await firmProfile();
  const attention = await needsAttention(actor, { firm });

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-6 p-4 md:p-6">
      <h1 className="font-display text-28 font-semibold">Settings</h1>

      {/* what is stopping this system from being trusted, and nothing else:
          an item that counts zero is absent, not shown ticked */}
      <section className="flex flex-col gap-2">
        <h2 className="font-display text-20">Needs attention</h2>
        {attention.length === 0 ? (
          <p className="rounded-ledger border-rule text-14 text-ink-muted border border-dashed p-4">
            Nothing is waiting on you. Due dates are confirmed, every branch is
            registered, and the scheduled work is running.
          </p>
        ) : (
          <ul className="rounded-ledger border-rule divide-rule divide-y border">
            {attention.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="hover:bg-paper flex gap-3 p-3"
                >
                  <span
                    className={`num text-20 w-10 shrink-0 text-right font-medium ${
                      item.severity === "blocking" ? "text-redpen" : ""
                    }`}
                  >
                    {item.count}
                  </span>
                  <span className="min-w-0">
                    <span className="text-14 block">{item.title}</span>
                    <span className="text-13 text-ink-muted block">
                      {item.detail}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {GROUPS.map((group) => {
        const inGroup = sections.filter((s) => s.group === group.key);
        if (inGroup.length === 0) return null;
        return (
          <section key={group.key} className="flex flex-col gap-2">
            <h2 className="text-13 text-ink-muted border-rule border-b pb-1 font-medium uppercase">
              {group.title}
            </h2>
            <div className="flex flex-col gap-3">
              {inGroup.map((s) => (
                <Link
                  key={s.href}
                  href={s.href}
                  className="rounded-ledger border-rule bg-surface hover:border-carbon border p-4"
                >
                  <p className="font-display text-20">{s.title}</p>
                  <p className="text-14 text-ink-muted">{s.body}</p>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";

export const metadata = { title: "Settings · PHMG" };

/** Later steps add their own sections here: due dates, numbering, templates. */
const SECTIONS = [
  {
    href: "/team",
    title: "Team and access",
    body: "Everybody in the firm: what is on their desk, who they report to, and — for a partner — roles, passwords and offboarding.",
    area: "team",
    action: "view",
  },
  {
    href: "/settings/services",
    title: "Services",
    body: "The catalog every engagement is created from: checklists, steps, turnaround and fees.",
    area: "serviceCatalog",
    action: "view",
  },
  {
    href: "/settings/branches",
    title: "Branches",
    body: "Office addresses, GST registrations and invoice series.",
    area: "usersSettings",
    action: "edit",
  },
  {
    href: "/settings/due-dates",
    title: "Statutory due dates",
    body: "How each deadline is worked out, and whether anyone has confirmed it.",
    area: "usersSettings",
    action: "edit",
  },
  {
    href: "/settings/messages",
    title: "Messages",
    body: "What the system has emailed, what it has held back, and whether the mailbox works.",
    area: "usersSettings",
    action: "edit",
  },
  {
    href: "/settings/migration",
    title: "Bringing data in",
    body: "For go-live: the team and what each client owed you on the day you switch over.",
    area: "usersSettings",
    action: "edit",
  },
  {
    href: "/settings/security",
    title: "Security",
    body: "What the audit log is showing, and the firm's record of anything that went wrong.",
    area: "usersSettings",
    action: "edit",
  },
  {
    href: "/settings/jobs",
    title: "Background jobs",
    body: "Whether the system's scheduled work is running, and anything that failed.",
    area: "usersSettings",
    action: "edit",
  },
  {
    href: "/documents/bin",
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

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-6 p-4 md:p-6">
      <h1 className="font-display text-28 font-semibold">Settings</h1>
      <div className="flex flex-col gap-3">
        {sections.map((s) => (
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
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";

export const metadata = { title: "Settings · PHMG" };

/** Later steps add their own sections here: catalog, due dates, templates. */
const SECTIONS = [
  {
    href: "/settings/users",
    title: "Team and access",
    body: "Add team members, set roles and branches, reset passwords and 2FA.",
  },
];

export default async function SettingsPage() {
  const actor = await requireUser();
  if (!can(actor, "edit", "usersSettings")) redirect("/today");

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-6 p-4 md:p-6">
      <h1 className="font-display text-28 font-semibold">Settings</h1>
      <div className="flex flex-col gap-3">
        {SECTIONS.map((s) => (
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

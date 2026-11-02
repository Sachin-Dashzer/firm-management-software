import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { needsAttention } from "@/lib/settings/attention";
import { firmProfile } from "@/lib/firm/settings";
import { FirmWide } from "@/components/shell/ViewNote";
import SettingsScreen, { RowList, Row } from "./Shell";

export const metadata = { title: "Settings and customisation · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Settings and customisation (the owner's screen of 02-11-2026).
 *
 * The index was twenty-two rows covering every screen that had ever been
 * built under `/settings`, plus the registers and the recycle bin. This is
 * the owner's own five groups — the firm, how work runs, people and
 * access, your words, and this product — and nothing else.
 *
 * Three of the prototype's sixteen tiles are **one screen here** and are
 * drawn as one row that says what is inside it: a new firm's guided setup
 * and the quick setup are the same eight steps; the service catalogue and
 * a service's steps are the same list and its detail.
 *
 * Two of them are **not built**, and they are listed with the reason
 * rather than quietly dropped: a custom field is a change to the data
 * model, which is the owner's decision and not a text box, and portal
 * branding is a design decision nobody has made yet. A row with nothing to
 * open is a statement, which is what `Row` without an `href` is for.
 *
 * What is kept from the old index is the **attention strip**, because it
 * is not another screen: it is the warning that no due-date rule has been
 * confirmed, which is the condition that leaves every deadline in the
 * system blank. An index that hid that would be a prettier page and a
 * worse one.
 */

const GROUPS = [
  {
    key: "firm",
    title: "Your firm",
    rows: [
      {
        href: "/settings/setup",
        title: "Setting the firm up",
        body: "The eight things to do once, each read from the records rather than ticked off by hand — and the quick way through them for a firm starting today.",
        area: "usersSettings",
        action: "edit",
      },
      {
        href: "/settings/branches",
        title: "Offices and GST registrations",
        body: "Each office with its address, its registration and the invoice series it bills under.",
        area: "usersSettings",
        action: "edit",
      },
      {
        title: "Branding on the client portal",
        body: "Not built. The portal carries the firm's name and nothing else, because a logo, a colour and a domain are a design decision nobody has made yet — and the wrong one is on every page a client sees.",
        area: "firmProfile",
        action: "view",
      },
    ],
  },
  {
    key: "work",
    title: "How work runs",
    rows: [
      {
        href: "/settings/services",
        title: "Services, their steps and their fees",
        body: "The catalogue every job is created from. Open a service for its checklist, its steps, its review tier and its turnaround — an open job keeps the version it started on.",
        area: "serviceCatalog",
        action: "view",
      },
      {
        href: "/settings/due-dates",
        title: "Statutory due dates",
        body: "How each deadline is worked out, whether a partner has confirmed it, and where a government extension is recorded so that every affected job moves at once.",
        area: "usersSettings",
        action: "edit",
      },
      {
        href: "/settings/automation",
        title: "Recipes, and what they are waiting to send",
        body: "The reminders, chasers and alerts that run on their own — with the queue of anything a client would read.",
        area: "usersSettings",
        action: "view",
      },
    ],
  },
  {
    key: "people",
    title: "People and access",
    rows: [
      {
        href: "/team",
        title: "The team, and which branches each person sees",
        body: "Everybody in the firm: what is on their desk, who they report to, their role, and the offices their work is scoped to.",
        area: "team",
        action: "view",
      },
      {
        href: "/settings/permissions",
        title: "Who can do what",
        body: "Every part of the system and what each role may do with it — the list the server itself enforces.",
        area: "usersSettings",
        action: "edit",
      },
      {
        href: "/settings/modules",
        title: "Modules",
        body: "Switch off the parts of the product this firm does not do, and they leave the menu.",
        area: "usersSettings",
        action: "edit",
      },
    ],
  },
  {
    key: "words",
    title: "Your words",
    rows: [
      {
        href: "/settings/customise",
        title: "The firm's own words",
        body: "What this firm calls a job, a client and a matter — and what renaming them does not touch.",
        area: "firmProfile",
        action: "view",
      },
      {
        title: "Custom fields",
        body: "Not built. A field on a client or a job is a change to what the system stores, which the owner decides — adding one from a text box is how a database fills up with columns nobody can explain.",
        area: "firmProfile",
        action: "view",
      },
    ],
  },
  {
    key: "about",
    title: "About this product",
    rows: [
      {
        href: "/settings/whats-new",
        title: "What's new",
        body: "What has changed about the way this firm works, read from the firm's own log rather than from a release note.",
        area: "auditLog",
        action: "view",
      },
      {
        href: "/settings/coverage",
        title: "What this covers",
        body: "What the system does, counted off your own menu — and what it does not, with the reason.",
        area: "usersSettings",
        action: "edit",
      },
    ],
  },
];

export default async function SettingsPage() {
  const actor = await requireUser();

  const groups = GROUPS.map((group) => ({
    ...group,
    rows: group.rows.filter((row) => can(actor, row.action, row.area)),
  })).filter((group) => group.rows.length > 0);

  if (groups.length === 0) redirect("/issues");

  await connectDB();
  const firm = await firmProfile();
  const attention = await needsAttention(actor, { firm });

  /**
   * The worst thing known about each screen, by the href the check points
   * at — so a row and the strip above it cannot disagree about the same
   * fact.
   */
  const worst = new Map();
  for (const item of attention) {
    if (!worst.has(item.href)) worst.set(item.href, item);
  }

  const blocking = attention.filter((a) => a.severity === "blocking").length;

  return (
    <SettingsScreen
      title="Settings and customisation"
      back={null}
      sub="Set the product up the way this firm works. Everything here applies to everybody."
    >
      <FirmWide />

      {attention.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-13 text-ink-muted font-medium">
            Needs attention
            <span className="num"> · {attention.length}</span>
            {blocking > 0 && (
              <span className="text-redpen">
                {" "}
                · {blocking} stopping work
              </span>
            )}
          </h2>
          <RowList>
            {attention.map((item) => (
              <Row
                key={item.key}
                href={item.href}
                title={`${item.count} ${item.title}`}
                body={item.detail}
                state={item.severity === "blocking" ? "stops work" : undefined}
                tone="bad"
              />
            ))}
          </RowList>
        </section>
      )}

      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-2">
          <h2 className="text-13 text-ink-muted font-medium">{group.title}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {group.rows.map((row) => {
              const warning = row.href ? worst.get(row.href) : null;
              const inside = (
                <>
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-14 font-medium">{row.title}</span>
                    {warning && (
                      <span
                        className={`text-12 shrink-0 ${
                          warning.severity === "blocking"
                            ? "text-redpen"
                            : "text-waiting"
                        }`}
                      >
                        {warning.count > 1
                          ? `${warning.count} to fix`
                          : "needs you"}
                      </span>
                    )}
                    {!warning && !row.href && (
                      <span className="text-12 text-faint shrink-0">
                        not built
                      </span>
                    )}
                  </span>
                  <span className="text-13 text-ink-muted block">
                    {row.body}
                  </span>
                </>
              );

              return row.href ? (
                <Link
                  key={row.title}
                  href={row.href}
                  className="rounded-ledger border-rule bg-surface hover:border-carbon flex flex-col gap-1 border p-3"
                >
                  {inside}
                </Link>
              ) : (
                <div
                  key={row.title}
                  className="rounded-ledger border-rule bg-sunk flex flex-col gap-1 border border-dashed p-3"
                >
                  {inside}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </SettingsScreen>
  );
}

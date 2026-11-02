import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { needsAttention } from "@/lib/settings/attention";
import { firmProfile } from "@/lib/firm/settings";
import { FirmWide } from "@/components/shell/ViewNote";
import Branch from "@/models/Branch";
import ServiceTemplate from "@/models/ServiceTemplate";
import DocTemplate from "@/models/DocTemplate";
import DueDateRule from "@/models/DueDateRule";
import User from "@/models/User";
import SettingsScreen, { RowList, Row } from "./Shell";

export const metadata = { title: "Settings · PHMG" };
export const dynamic = "force-dynamic";

/**
 * The index of the twenty screens under Settings (P2-10b, redrawn D106).
 *
 * It used to be twenty-two bordered cards in five stacks — a heading and
 * two lines of prose each, every card the same size, which is the shape a
 * page takes when every step that added a screen also added a card. It
 * said nothing about the firm. You could read the whole thing and not know
 * that no due-date rule had been confirmed, which is the condition that
 * leaves every deadline in the system blank.
 *
 * So the index **reads the records**. Each row carries the one figure that
 * decides whether it is worth opening — four offices, fifteen services,
 * eleven rules and none confirmed — and the rows that are wrong are the
 * only coloured things on the page. Nothing is marked when nothing is.
 *
 * The readings come from the same `attention.js` checks as the strip at
 * the top, by href, so a row and the warning above it cannot disagree
 * about the same fact.
 */

const GROUPS = [
  { key: "firm", title: "The firm" },
  { key: "work", title: "The work" },
  { key: "practice", title: "The practice" },
  { key: "messages", title: "Messages" },
  { key: "data", title: "Data and security" },
];

/**
 * `reads` names the count this row shows when nothing is wrong with it.
 * A row with no `reads` and no warning shows no figure, because an index
 * that puts something in every slot is back to being furniture.
 */
const SECTIONS = [
  {
    href: "/team",
    group: "firm",
    title: "Team and access",
    body: "Everybody in the firm: what is on their desk, who they report to, and — for a partner — roles, passwords and offboarding.",
    area: "team",
    action: "view",
    reads: "people",
  },
  {
    href: "/settings/icai",
    group: "firm",
    title: "The firm's record",
    body: "Name, registration number and peer review, who holds which membership, and the CPE log.",
    area: "icai",
    action: "view",
  },
  {
    href: "/settings/branches",
    group: "firm",
    title: "Offices",
    body: "Addresses, GST registrations and the invoice series each office bills under.",
    area: "usersSettings",
    action: "edit",
    reads: "branches",
  },
  {
    href: "/settings/setup",
    group: "firm",
    title: "Setting the firm up",
    body: "The eight things to do once, each read from the records rather than ticked off by hand.",
    area: "usersSettings",
    action: "edit",
  },
  {
    href: "/settings/customise",
    group: "firm",
    title: "Customise",
    body: "The firm's own words for a job, a client and a matter — and what renaming them does not touch.",
    area: "firmProfile",
    action: "view",
  },
  {
    href: "/settings/whats-new",
    group: "firm",
    title: "What's new",
    body: "What has changed about the way this firm works, read from the log itself.",
    area: "auditLog",
    action: "view",
  },

  {
    href: "/settings/services",
    group: "work",
    title: "Services",
    body: "The catalogue every job is created from: checklists, steps, turnaround and fees.",
    area: "serviceCatalog",
    action: "view",
    reads: "services",
  },
  {
    href: "/settings/due-dates",
    group: "work",
    title: "Statutory due dates",
    body: "How each deadline is worked out, and whether anyone has confirmed it.",
    area: "usersSettings",
    action: "edit",
    reads: "rules",
  },
  {
    href: "/settings/doc-templates",
    group: "work",
    title: "Document templates",
    body: "The firm's letters and certificates — and which of them a partner has approved.",
    area: "docTemplates",
    action: "view",
    reads: "templates",
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
    href: "/settings/automation",
    group: "messages",
    title: "Automatic messages",
    body: "What the system wants to send your clients, waiting for a partner — and the log of everything it has sent.",
    area: "usersSettings",
    action: "view",
  },
  {
    href: "/settings/messages",
    group: "messages",
    title: "Email and WhatsApp",
    body: "What the system has sent, what it has held back, and whether the mailbox works.",
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
    href: "/settings/migration",
    group: "data",
    title: "Bringing data in",
    body: "For go-live: the team, and what each client owed you on the day you switch over.",
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
  {
    href: "/settings/coverage",
    group: "data",
    title: "What this covers",
    body: "What the system does, counted off your own menu — and what it does not, with why.",
    /**
     * Listed for the people who read this group, not for everybody: the
     * page itself is open to anyone who may see the firm's record (it shows
     * the reader's own menu), but putting it here under `firmProfile` made
     * the whole "Data and security" group appear on an employee's Settings
     * for the sake of one link.
     */
    area: "usersSettings",
    action: "edit",
  },
];

/** The reading on a row, when there is no warning to show instead. */
function plainState(key, counts) {
  const n = counts[key];
  if (n === undefined) return null;
  const word = {
    people: n === 1 ? "person" : "people",
    branches: n === 1 ? "office" : "offices",
    services: n === 1 ? "service" : "services",
    rules: n === 1 ? "rule" : "rules",
    templates: n === 1 ? "template" : "templates",
  }[key];
  return `${n} ${word}`;
}

export default async function SettingsPage() {
  const actor = await requireUser();
  const sections = SECTIONS.filter((s) => can(actor, s.action, s.area));
  if (sections.length === 0) redirect("/issues");

  await connectDB();
  const firm = await firmProfile();

  /**
   * Five counts and the warnings, in one round trip. Each count is a
   * `countDocuments` on an indexed field, which is what the page is
   * already paying for the attention strip.
   */
  const [attention, people, branches, services, rules, templates] =
    await Promise.all([
      needsAttention(actor, { firm }),
      User.countDocuments({ active: true }),
      Branch.countDocuments({}),
      ServiceTemplate.countDocuments({ active: { $ne: false } }),
      DueDateRule.countDocuments({}),
      DocTemplate.countDocuments({ active: true }),
    ]);

  const counts = { people, branches, services, rules, templates };

  /**
   * The worst thing known about each screen, by the href the check points
   * at. A screen with two warnings against it shows the blocking one:
   * `needsAttention` returns blocking first, so the first write wins.
   */
  const worst = new Map();
  for (const item of attention) {
    if (!worst.has(item.href)) worst.set(item.href, item);
  }

  const blocking = attention.filter((a) => a.severity === "blocking").length;

  return (
    <SettingsScreen
      title="Settings"
      back={null}
      sub={
        attention.length === 0
          ? "Everything this system needs in order to be trusted is in place."
          : `${attention.length} ${attention.length === 1 ? "thing needs" : "things need"} your attention${
              blocking > 0 ? `, ${blocking} of them stopping work` : ""
            }.`
      }
    >
      <FirmWide />

      {/* what is stopping this system from being trusted, and nothing else:
          an item that counts zero is absent, not shown ticked */}
      {attention.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-13 text-ink-muted font-medium">
            Needs attention
            <span className="num"> · {attention.length}</span>
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

      {GROUPS.map((group) => {
        const inGroup = sections.filter((s) => s.group === group.key);
        if (inGroup.length === 0) return null;
        return (
          <section key={group.key} className="flex flex-col gap-2">
            <h2 className="text-13 text-ink-muted font-medium">
              {group.title}
            </h2>
            <RowList>
              {inGroup.map((s) => {
                const warning = worst.get(s.href);
                return (
                  <Row
                    key={s.href}
                    href={s.href}
                    title={s.title}
                    body={s.body}
                    state={
                      warning
                        ? warning.count > 1
                          ? `${warning.count} to fix`
                          : "needs you"
                        : plainState(s.reads, counts)
                    }
                    tone={
                      warning
                        ? warning.severity === "blocking"
                          ? "bad"
                          : "warn"
                        : "quiet"
                    }
                  />
                );
              })}
            </RowList>
          </section>
        );
      })}
    </SettingsScreen>
  );
}

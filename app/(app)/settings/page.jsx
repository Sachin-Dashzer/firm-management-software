import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { needsAttention } from "@/lib/settings/attention";
import { settingsReadings } from "@/lib/settings/readings";
import { firmProfile } from "@/lib/firm/settings";
import { FirmWide } from "@/components/shell/ViewNote";
import SettingsScreen from "./Shell";

export const metadata = { title: "Settings and customisation · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Settings and customisation — the owner's index.
 *
 * ## Why it was redrawn again (04-11-2026)
 *
 * The version before this was a single 820px column of rows, each one a
 * name and two lines of prose explaining it. Twelve of them, under five
 * headings, under an alarm strip built out of the same rows. On a 1440px
 * screen it came to about three screenfuls of grey paragraph in the left
 * two-thirds of the window, and nine of the twelve settings were below
 * the fold. **An index you have to read is not an index.** Nobody opens
 * Settings to read; they open it knowing roughly where they are going and
 * wanting to get there.
 *
 * So this is a **directory**: one panel, ruled into columns like a printed
 * index, every destination one short line with the size of the thing on
 * the right — four offices, fifteen services, seven roles. The whole of
 * Settings is visible at once, which is the only job this page has.
 *
 * Three decisions worth keeping:
 *
 *  - **The explanations went to the screens they explain.** A sentence
 *    about why an unconfirmed due-date rule leaves a deadline blank is
 *    worth reading on `/settings/due-dates`, where you can act on it. On
 *    the index it is one of twelve paragraphs nobody finishes. What is
 *    left here is a clause — enough to tell two neighbouring rows apart.
 *  - **The alarm is not made of the same rows as the directory.** It is a
 *    panel of its own, ruled down the left in the colour of its severity,
 *    with the detail kept only for the things that stop work. Before, an
 *    unconfirmed rule that blanks every deadline in the system and a note
 *    that portal branding is unbuilt were drawn identically.
 *  - **Two things are listed as not built**, with the reason, rather than
 *    quietly dropped: a custom field is a change to the data model, which
 *    is the owner's decision and not a text box, and portal branding is a
 *    design decision nobody has made. A row with nowhere to go is a
 *    statement, which is what an entry without an `href` is for.
 *
 * Three of the prototype's sixteen tiles are **one screen here** and are
 * drawn as one entry: a new firm's guided setup and the quick setup are
 * the same eight steps; the service catalogue and a service's steps are
 * the same list and its detail.
 */

const GROUPS = [
  {
    key: "firm",
    title: "Your firm",
    rows: [
      {
        href: "/settings/setup",
        title: "Setting the firm up",
        body: "The eight things to do once, read from your records.",
        area: "usersSettings",
        action: "edit",
      },
      {
        href: "/settings/branches",
        title: "Offices and GST registrations",
        body: "Addresses, registrations, invoice series.",
        area: "usersSettings",
        action: "edit",
      },
      {
        title: "Branding on the client portal",
        body: "Not built — the portal carries the firm's name only.",
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
        title: "Services, steps and fees",
        body: "The catalogue every job is created from.",
        area: "serviceCatalog",
        action: "view",
      },
      {
        href: "/settings/due-dates",
        title: "Statutory due dates",
        body: "How each statutory deadline is worked out.",
        area: "usersSettings",
        action: "edit",
      },
      {
        href: "/settings/automation",
        title: "Recipes and the sending queue",
        body: "Reminders and chasers that run on their own.",
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
        title: "The team",
        body: "Who is here, and which offices they see.",
        area: "team",
        action: "view",
      },
      {
        href: "/settings/permissions",
        title: "Who can do what",
        body: "What each role may do, enforced on the server.",
        area: "usersSettings",
        action: "edit",
      },
      {
        href: "/settings/modules",
        title: "Modules",
        body: "Switch off what this firm does not do.",
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
        body: "What this firm calls a job, a client, a matter.",
        area: "firmProfile",
        action: "view",
      },
      {
        title: "Custom fields",
        body: "Not built — a field changes what the system stores.",
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
        body: "What has changed, from the firm's own log.",
        area: "auditLog",
        action: "view",
      },
      {
        href: "/settings/coverage",
        title: "What this covers",
        body: "What the system does, and what it does not.",
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
  const [attention, readings] = await Promise.all([
    needsAttention(actor, { firm }),
    settingsReadings(),
  ]);

  /**
   * The worst thing known about each screen, by the href the check points
   * at — so a row and the panel above it cannot disagree about the same
   * fact.
   */
  const worst = new Map();
  for (const item of attention) {
    if (!worst.has(item.href)) worst.set(item.href, item);
  }

  /**
   * How much of the alarm opens with the page.
   *
   * Eleven checks fire on a firm that has not finished setting up.
   * Everything that stops work is always drawn, plus enough of the rest
   * to make four; the remainder is one `<details>` away — native, so it
   * needs no JavaScript and no state, and shut by default because the
   * count in the summary already says how many there are.
   */
  const urgent = attention.filter((a) => a.severity === "blocking");
  const rest = attention.filter((a) => a.severity !== "blocking");
  const opening = [...urgent, ...rest.slice(0, Math.max(0, 4 - urgent.length))];
  const folded = attention.filter((item) => !opening.includes(item));

  return (
    <SettingsScreen
      wide
      title="Settings and customisation"
      back={null}
      sub="Set the product up the way this firm works. Everything here applies to everybody."
    >
      <FirmWide />

      {attention.length > 0 && (
        <section className="rounded-ledger border-rule bg-surface overflow-hidden border">
          <header className="border-rule bg-sunk flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-4 py-3">
            <h2 className="text-13 font-semibold">Needs attention</h2>
            <p className="text-12 text-ink-muted">
              {urgent.length > 0 && (
                <span className="text-redpen font-medium">
                  <span className="num">{urgent.length}</span> stopping work
                </span>
              )}
              {urgent.length > 0 && rest.length > 0 && " · "}
              {rest.length > 0 && (
                <>
                  <span className="num">{rest.length}</span> worth doing
                </>
              )}
            </p>
          </header>

          <ul className="divide-rule divide-y">
            {opening.map((item) => (
              <Alarm key={item.key} item={item} />
            ))}
          </ul>

          {folded.length > 0 && (
            <details className="group border-rule border-t">
              <summary className="text-12 text-ink-muted hover:text-carbon cursor-pointer list-none px-4 py-2.5 select-none">
                <span className="num">{folded.length}</span> more worth doing
                <span className="group-open:hidden"> — show them</span>
                <span className="hidden group-open:inline"> — hide them</span>
              </summary>
              <ul className="divide-rule border-rule divide-y border-t">
                {folded.map((item) => (
                  <Alarm key={item.key} item={item} brief />
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {/*
       * The directory. A grid of groups rather than CSS columns: column
       * flow balances by height, which put two groups in the first
       * column, two in the second and one lonely pair in the third. A
       * grid starts every group's ruled heading on the same line, which
       * is what makes five lists read as one index.
       *
       * Groups, not cards. The rule under each heading does the dividing;
       * five bordered boxes would be five containers saying nothing about
       * what is in them.
       *
       * The columns are ruled apart, which is why there is no gap between
       * them: a rule belongs in the middle of its gutter, and a rule drawn
       * on the edge of a cell with a gap beside it hugs the column to its
       * right. So the gutter is the cells' own `px-5` either side of the
       * hairline, and the panel's padding is small enough that the first
       * column's text still lines up where you would expect it.
       */}
      <section className="rounded-ledger border-rule bg-surface border p-2 md:p-3">
        {/* cells stretch, so a column rule runs the full height of its row
            rather than stopping where the shortest group happens to end */}
        <div className="grid gap-y-9 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((group, index) => (
            <div
              key={group.key}
              /*
               * The hairline goes on every cell that is not the first of
               * its row, and which cells those are depends on how many
               * columns there are. Tailwind writes media queries out in
               * ascending order, so the `xl:` rule lands after the `sm:`
               * one and wins on a wide screen.
               */
              className={`border-rule px-5 ${
                index % 2 === 0 ? "sm:border-s-0" : "sm:border-s"
              } ${index % 3 === 0 ? "xl:border-s-0" : "xl:border-s"}`}
            >
              {/* ps matches an entry's own 2px mark plus its px-2, so the
                  heading and the names under it start on one line */}
              <h2 className="text-11 text-ink-muted border-rule mb-1.5 border-b ps-[calc(0.5rem+2px)] pe-2 pb-2 font-semibold tracking-wide uppercase">
                {group.title}
              </h2>
              <ul className="space-y-3">
                {group.rows.map((row) => (
                  <Entry
                    key={row.title}
                    {...row}
                    reading={row.href ? readings[row.href] : null}
                    warning={row.href ? worst.get(row.href) : null}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </SettingsScreen>
  );
}

/**
 * The consequence, which is the first sentence a check's detail is written
 * to carry. The second elaborates, and on an index that is one more line
 * to read past on the way to somewhere else — the screen this links to
 * says the whole of it.
 */
function consequence(detail) {
  const [first] = String(detail ?? "").split(/\.\s+(?=[A-Z])/);
  // the split eats the full stop it matched on, and keeps the one on a
  // detail that was a single sentence all along
  return first.endsWith(".") ? first : `${first}.`;
}

/**
 * One thing that is wrong, ruled down the left in its own severity.
 *
 * Only what stops work carries its explanation. The rest are one line
 * each: they are worth doing, not worth reading about on the way past.
 */
function Alarm({ item, brief = false }) {
  const blocking = item.severity === "blocking";
  return (
    <li>
      <Link
        href={item.href}
        className={`hover:bg-carbon-wash flex items-baseline justify-between gap-4 border-s-2 px-4 py-3 transition-colors duration-100 ${
          blocking ? "border-redpen" : "border-waiting"
        }`}
      >
        <span className="min-w-0">
          <span className="text-14 block font-medium">{item.title}</span>
          {blocking && !brief && (
            <span className="text-12 text-ink-muted mt-1 block">
              {consequence(item.detail)}
            </span>
          )}
        </span>
        {blocking && (
          <span className="text-11 text-redpen shrink-0 font-semibold tracking-wide uppercase">
            stops work
          </span>
        )}
      </Link>
    </li>
  );
}

/**
 * One destination: what it is called, a clause to tell it from its
 * neighbour, and how big the thing behind it is.
 *
 * The left edge carries the mark when something on that screen is wrong,
 * so the reading stays honest — "4 offices" is not itself a problem, and
 * colouring the figure red to say one of them has no GSTIN would make it
 * read as one.
 *
 * The reading sits on the **name's** line, not beside the whole entry, so
 * the line under it has the width of the column to itself. Set against the
 * entry, a 340px column left the clause about 38 characters and every
 * second one wrapped; on the name's line it reads as a table of contents
 * with its page numbers.
 */
function Entry({ href, title, body, reading, warning }) {
  const mark =
    warning?.severity === "blocking"
      ? "border-redpen"
      : warning
        ? "border-waiting"
        : "border-transparent";

  const inside = (
    <>
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-14 leading-snug font-medium">{title}</span>
        {reading && (
          <span className="text-12 text-ink-muted shrink-0 text-right">
            {reading.figure && (
              <span className="num text-ink">{reading.figure} </span>
            )}
            {reading.words}
          </span>
        )}
      </span>
      <span className="text-12 text-ink-muted mt-0.5 block leading-snug">
        {body}
      </span>
    </>
  );

  const shape = `block border-s-2 ${mark} rounded-control px-2 py-2.5`;

  return (
    <li>
      {href ? (
        <Link
          href={href}
          className={`hover:bg-carbon-wash transition-colors duration-100 ${shape}`}
        >
          {inside}
        </Link>
      ) : (
        <div className={`${shape} opacity-55`}>{inside}</div>
      )}
    </li>
  );
}

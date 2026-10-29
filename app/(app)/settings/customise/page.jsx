import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import ServiceTemplate from "@/models/ServiceTemplate";
import { firmProfile } from "@/lib/firm/settings";
import { WORD_KEYS } from "@/lib/firm/words";
import { FirmWide } from "@/components/shell/ViewNote";
import { Panel } from "@/components/dashboard/Tiles";
import Words from "./Words";

export const metadata = { title: "Customise · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Customising the firm (P3-29, from the prototype's Customise screen).
 *
 * The prototype offers five tabs. **Three of them already exist here, and
 * better**, so this screen points at them rather than building a second
 * way to do the same thing:
 *
 *  - *Service templates* is `/settings/services/[id]`, which edits the
 *    steps and the checklist with versioning the prototype has no idea
 *    about — an open job keeps the version it started on.
 *  - *Quick setup* is `/settings/setup`, the real thing rather than six
 *    boxes with answers already typed into them.
 *  - *Portal branding* and *custom fields* are not built, and the screen
 *    says so with the reason. A custom field is a change to the data
 *    model, which needs the owner's decision and not a text box.
 *
 * What is built here is the one tab that had nowhere to go: **the firm's
 * own words.**
 */
export default async function CustomisePage() {
  const actor = await requireUser();
  if (!can(actor, "view", "firmProfile")) redirect("/issues");
  const editable = can(actor, "edit", "firmProfile");

  await connectDB();
  const [firm, services] = await Promise.all([
    firmProfile({ fresh: true }),
    ServiceTemplate.countDocuments({ active: true }),
  ]);

  const stored = firm.vocabulary ?? {};
  const current = Object.fromEntries(
    WORD_KEYS.map((key) => [key, String(stored[key] ?? "")]),
  );

  /**
   * The labels the preview is drawn from: real menu labels carrying the
   * four nouns, in the words the application itself uses. They are listed
   * here rather than pulled out of the tree by a regex, because a preview
   * that silently stops finding anything is worse than one that is a few
   * labels out of date.
   */
  const sample = [
    "Clients",
    "All clients",
    "New client",
    "Jobs",
    "All open jobs",
    "Waiting on client",
    "Open matters",
    "All open matters",
    "Invoices",
    "Ready to bill",
  ];

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="font-display text-24 font-bold tracking-tight">
          Customise
        </h1>
        <p className="text-13 text-ink-muted max-w-[72ch]">
          Fitting the software to the firm, without a developer. Everything here
          is a setting.
        </p>
        <FirmWide />
      </div>

      <Panel
        title="Words your firm uses"
        what="Some firms say Assignment for a job, or Party for a client. The words change; the logic behind them does not."
      >
        {editable ? (
          <Words current={current} sample={sample} />
        ) : (
          <p className="text-13 text-ink-muted">
            Only a partner can change the firm&rsquo;s words.
          </p>
        )}
        <p className="text-12 text-faint max-w-[72ch]">
          <strong>What this renames, and what it does not.</strong> It renames
          the menu — the rail, the phone drawer and the command bar, which all
          read one list. It does not rename a field in the database, a status, a
          web address or an audit entry, so nothing a renamed word touches can
          break a query, and clearing the boxes puts every word back. Page
          headings keep the application&rsquo;s own words for now: they are
          written into each screen rather than produced from one list, so
          renaming them is a job of its own and not a setting.
        </p>
      </Panel>

      <Panel
        title="Service templates"
        what="The steps, the checklist, the tier, the fee and the SAC code for each kind of work."
      >
        <div className="rounded-ledger border-rule bg-surface flex flex-wrap items-center justify-between gap-3 border p-4">
          <p className="text-14 text-ink-muted max-w-[62ch]">
            Already built, and deeper than the prototype&rsquo;s version of it:
            steps can be added, removed and reordered, and every change makes a
            new version —{" "}
            <strong>an open job keeps the version it started on</strong>, so
            editing a template never rewrites work in progress.
            {services > 0 && (
              <>
                {" "}
                <span className="num">{services}</span> active{" "}
                {services === 1 ? "service" : "services"}.
              </>
            )}
          </p>
          <Link
            href="/settings/services"
            className="rounded-control bg-carbon text-on-carbon text-14 flex h-9 shrink-0 items-center px-3 font-medium"
          >
            Open the catalogue
          </Link>
        </div>
      </Panel>

      <Panel
        title="Setting the firm up"
        what="Branches and invoice series, the team, the services, the clients, the opening balances."
      >
        <div className="rounded-ledger border-rule bg-surface flex flex-wrap items-center justify-between gap-3 border p-4">
          <p className="text-14 text-ink-muted max-w-[62ch]">
            The prototype asks six questions and says it has configured sixteen
            services. This asks the same questions and actually does it, a step
            at a time, and it remembers where you stopped.
          </p>
          <Link
            href="/settings/setup"
            className="rounded-control border-rule text-14 flex h-9 shrink-0 items-center border px-3 font-medium"
          >
            Open setup
          </Link>
        </div>
      </Panel>

      <Panel title="Not built, and why">
        <ul className="rounded-ledger border-rule bg-surface divide-rule divide-y border">
          <li className="flex flex-col gap-1 px-4 py-3">
            <span className="text-14 font-medium">Custom fields</span>
            <span className="text-13 text-ink-muted max-w-[70ch]">
              A field with a name, a type and a screen to live on. It is not a
              setting: a custom field has to be stored, indexed, exported,
              audited, shown on a form and validated, and &ldquo;pick from a
              list&rdquo; needs the list stored too. It is a change to the data
              model and so it needs the owner&rsquo;s decision first — which
              records, which types, and whether a client ever sees them.
            </span>
          </li>
          <li className="flex flex-col gap-1 px-4 py-3">
            <span className="text-14 font-medium">Client portal branding</span>
            <span className="text-13 text-ink-muted max-w-[70ch]">
              A colour for the portal header. The portal reads the same design
              tokens as the rest of the application, so a second palette means a
              second set of contrast checks on every screen a client sees — and
              the firm&rsquo;s own colour would then have to clear 4.5:1 against
              white, which not every brand colour does. Worth doing
              deliberately, not as a row of swatches.
            </span>
          </li>
        </ul>
      </Panel>
    </div>
  );
}

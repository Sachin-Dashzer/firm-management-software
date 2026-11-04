import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, describeMatrix, ROLES, ROLE_LABELS } from "@/lib/permissions";
import SettingsScreen from "../Shell";
import Panel from "@/components/ui/Panel";

export const metadata = { title: "Who can do what · PHMG" };
export const dynamic = "force-dynamic";

/**
 * The permission matrix, in words (P2-10b).
 *
 * `describeMatrix()` was written in P2-1 for exactly this. `MATRIX` itself
 * stays private: an exported object is one assignment away from a
 * permission change nobody reviewed, so this page is handed sentences
 * rather than the thing itself.
 *
 * **Read-only.** Spec section 2 also asks for permissions to be
 * configurable per role in settings, and that screen does not exist. The
 * page says so rather than implying the matrix is editable somewhere else.
 *
 * ## The redraw of 04-11-2026
 *
 * Twenty-eight areas by five roles is 140 cells, and every one of them
 * held a whole sentence — "Create and edit in their own branches" — so
 * the screen was a wall of prose in the shape of a table. Three things
 * changed, none of them to the matrix itself:
 *
 *  - **The cell is split.** The level is the word that carries ("Approve",
 *    "Create & edit", "View"); the reach goes underneath it in 11px grey.
 *    A reader comparing two roles is comparing levels, and before this the
 *    level was buried mid-sentence in both of them.
 *  - **"No access" is a dash.** Fifty of the 140 cells are a refusal.
 *    The screen's own note said the reading is where a role *is* granted
 *    something and then printed the refusals in full, which is what
 *    buried the grants. The dash is explained once in the legend.
 *  - **The areas are grouped.** Twenty-eight rows with no landmarks is a
 *    list nobody can navigate; these are the six subjects the areas
 *    already divide into, and an area added to `MATRIX` without a group
 *    falls into "Everything else" rather than disappearing.
 *
 * It is also no longer a two-axis scroller. Six fixed columns fit the
 * `wide` measure, so there is no horizontal scroll for a sticky header to
 * come loose from — which is what `components/ui/Table` means by learning
 * that the expensive way.
 */

/**
 * The reach, short enough for a column (the long form is `SCOPE_WORDS` in
 * `lib/permissions.js`, which is what the refusal sentences under buttons
 * use). Presentation only: the scope names themselves come off the matrix.
 */
const REACH = {
  all: "whole firm",
  branch: "own branches",
  team: "own team",
  assigned: "where assigned",
  granted: "assigned or granted",
  own: "own record",
  none: "",
};

/** The level, short enough for a column. */
const LEVEL = {
  approve: "Approve",
  edit: "Create & edit",
  view: "View",
  none: "",
};

/**
 * The six subjects, in the order a firm meets them. An area not named here
 * still appears — see "Everything else" — because a silent omission on
 * this screen is a permission nobody reviewed.
 */
const GROUPS = [
  {
    title: "Clients",
    areas: [
      "clients",
      "clientIdentifiers",
      "clientCredentials",
      "clientAccess",
      "clientPortalUsers",
    ],
  },
  {
    title: "The work",
    areas: [
      "serviceCatalog",
      "engagementsCreate",
      "engagementsWork",
      "engagementsReview",
      "documents",
      "practice",
      "todos",
    ],
  },
  {
    title: "Signed and registered",
    areas: ["udin", "dsc", "docTemplates", "docGenerate"],
  },
  { title: "Money", areas: ["invoices", "feeWriteOff", "timeEntries"] },
  { title: "People", areas: ["team", "leave", "leaveApprove"] },
  {
    title: "The firm and this product",
    areas: [
      "usersSettings",
      "firmProfile",
      "icai",
      "dashboards",
      "auditLog",
      "deleteRecord",
    ],
  },
];

export default async function PermissionsPage() {
  const actor = await requireUser();
  if (!can(actor, "edit", "usersSettings")) redirect("/settings");

  const rows = describeMatrix();
  const byArea = new Map(rows.map((row) => [row.area, row]));

  const grouped = GROUPS.map((group) => ({
    title: group.title,
    rows: group.areas.map((area) => byArea.get(area)).filter(Boolean),
  })).filter((group) => group.rows.length > 0);

  const placed = new Set(GROUPS.flatMap((g) => g.areas));
  const rest = rows.filter((row) => !placed.has(row.area));
  if (rest.length) grouped.push({ title: "Everything else", rows: rest });

  const grants = rows.reduce(
    (n, row) =>
      n + ROLES.filter((role) => row.roles[role].level !== "none").length,
    0,
  );

  return (
    <SettingsScreen
      wide
      title="Who can do what"
      sub={
        <>
          <span className="num">{rows.length}</span> areas across{" "}
          <span className="num">{ROLES.length}</span> roles, and the{" "}
          <span className="num">{grants}</span> grants between them. This is the
          list the server enforces on every action — not a summary of it, and
          not what the buttons happen to show.
        </>
      }
    >
      {/* Its own scroller, and only in one axis. `table-fixed` with the
          widths below means nothing scrolls sideways, which is the only
          way `sticky top-0` holds. */}
      <div className="rounded-table border-rule bg-surface max-h-[72vh] overflow-y-auto border">
        <table className="w-full table-fixed border-collapse text-left">
          <caption className="sr-only">Permissions by area and role</caption>
          <colgroup>
            <col className="w-[30%]" />
            {ROLES.map((role) => (
              <col key={role} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-rule bg-sunk sticky top-0 z-10 border-b">
              <th
                scope="col"
                className="text-11 text-ink-muted px-4 py-2.5 font-semibold tracking-wide uppercase"
              >
                Area
              </th>
              {ROLES.map((role) => (
                <th
                  key={role}
                  scope="col"
                  className="text-11 text-ink-muted px-4 py-2.5 font-semibold tracking-wide uppercase"
                >
                  {ROLE_LABELS[role]}
                </th>
              ))}
            </tr>
          </thead>

          {grouped.map((group) => (
            <tbody key={group.title}>
              <tr>
                {/* a landmark, not a record: it carries the subject and
                    nothing in the role columns, so the eye can run down
                    the left edge and find where it is */}
                <th
                  scope="colgroup"
                  colSpan={ROLES.length + 1}
                  className="text-11 text-ink-muted border-rule bg-paper border-y px-4 py-2 font-semibold tracking-wide uppercase"
                >
                  {group.title}
                </th>
              </tr>
              {group.rows.map((row) => (
                <tr
                  key={row.area}
                  className="border-rule hover:bg-carbon-wash/40 border-b align-top transition-colors duration-100 last:border-0"
                >
                  <th
                    scope="row"
                    className="text-14 px-4 py-3 text-left font-medium"
                  >
                    {row.label}
                  </th>
                  {ROLES.map((role) => {
                    const cell = row.roles[role];

                    if (cell.level === "none") {
                      return (
                        <td key={role} className="px-4 py-3">
                          <span className="text-faint" aria-hidden="true">
                            —
                          </span>
                          <span className="sr-only">No access</span>
                        </td>
                      );
                    }

                    return (
                      <td key={role} className="px-4 py-3">
                        <span className="text-14 block font-medium">
                          {LEVEL[cell.level] ?? cell.level}
                        </span>
                        {REACH[cell.scope] && (
                          <span className="text-11 text-ink-muted mt-0.5 block">
                            {REACH[cell.scope]}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <span className="text-11 text-ink-muted font-semibold tracking-wide uppercase">
          Reading it
        </span>
        <p className="text-13 text-ink-muted">
          <span className="text-ink font-medium">Approve</span> includes
          creating and editing ·{" "}
          <span className="text-ink font-medium">Create &amp; edit</span>{" "}
          includes viewing · <span className="text-ink font-medium">View</span>{" "}
          is read-only · <span className="text-faint">—</span> is no access at
          all. The grey line under each is how far it reaches.
        </p>
      </div>

      <Panel title="Two things this table does not say">
        <p className="text-14 text-ink-muted max-w-[70ch]">
          <strong className="text-ink">It cannot be edited here.</strong> Spec
          section 2 asks for these to be configurable per role; they are set in
          code and changing one is a change to the application. Say if the firm
          needs to move a line and it becomes a screen.
        </p>
        <p className="text-14 text-ink-muted max-w-[70ch]">
          <strong className="text-ink">
            A client portal account is not on it.
          </strong>{" "}
          People outside the firm sign in against a different collection
          entirely and fail every row above, whatever it says.
        </p>
      </Panel>
    </SettingsScreen>
  );
}

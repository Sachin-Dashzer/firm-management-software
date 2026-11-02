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
 * `describeMatrix()` was written in P2-1 for exactly this and has had
 * nowhere to live since. `MATRIX` itself stays private: an exported object
 * is one assignment away from a permission change nobody reviewed, so this
 * page is handed sentences rather than the thing itself.
 *
 * **Read-only.** Spec section 2 also asks for permissions to be
 * configurable per role in settings, and that screen does not exist. The
 * page says so rather than implying the matrix is editable somewhere else.
 */
export default async function PermissionsPage() {
  const actor = await requireUser();
  if (!can(actor, "edit", "usersSettings")) redirect("/settings");

  const rows = describeMatrix();

  return (
    <SettingsScreen
      wide
      title="Who can do what"
      sub="Every part of the system, and what each role may do with it. This is the list the server enforces on every action — not a summary of it, and not what the buttons happen to show."
    >
      {/* its own scroller, not the page's: `position: sticky` resolves
          against the nearest scrolling ancestor, so the header row only
          stays put if the thing that scrolls is this box */}
      <div className="rounded-table border-rule bg-surface max-h-[70vh] overflow-auto border">
        <table className="text-14 w-full border-collapse">
          <caption className="sr-only">Permissions by area and role</caption>
          <thead>
            {/* forty areas down the page: the row of roles stays put, and
                the area name stays put while the roles scroll sideways */}
            <tr className="border-rule bg-surface sticky top-0 z-10 border-b text-left">
              <th
                scope="col"
                className="text-13 text-ink-muted bg-surface sticky left-0 px-3 py-2 font-medium"
              >
                Area
              </th>
              {ROLES.map((role) => (
                <th
                  key={role}
                  scope="col"
                  className="text-13 text-ink-muted px-3 py-2 font-medium"
                >
                  {ROLE_LABELS[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.area} className="border-rule border-b last:border-0">
                <th
                  scope="row"
                  className="bg-surface sticky left-0 px-3 py-2 text-left align-top font-medium"
                >
                  {row.label}
                </th>
                {ROLES.map((role) => {
                  const cell = row.roles[role];
                  /*
                   * Most of two hundred cells say "none", so the reading is
                   * where a role *is* granted something. The grants carry the
                   * weight and the refusals stay grey — no second colour, and
                   * nothing dimmed below the contrast the tests measure.
                   */
                  return (
                    <td
                      key={role}
                      className={`px-3 py-2 align-top ${
                        cell.level === "none"
                          ? "text-ink-muted"
                          : "text-ink font-medium"
                      }`}
                    >
                      {cell.words}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
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

import { permanentRedirect } from "next/navigation";

/**
 * The team screen moved to `/team` in P2-3, where it became a list plus a
 * case file per person rather than one table of rows and buttons.
 *
 * Kept as a redirect rather than deleted: this path is in the rail history,
 * in bookmarks and in `docs/DEPLOY.md`, and a 404 would look like the team
 * screen had been removed.
 */
export default function UsersMoved() {
  permanentRedirect("/team");
}

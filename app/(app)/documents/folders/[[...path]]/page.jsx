import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { resolveNode } from "@/lib/folders/resolve";
import { listChildren } from "@/lib/folders/list";
import { canHoldFolders } from "@/lib/folders/paths";
import { storageUsed } from "@/lib/folders/storage";
import { ALLOWED_TYPES, MAX_UPLOAD_BYTES } from "@/lib/storage";
import { looseForJob } from "../actions";
import Screen from "@/components/ui/Screen";
import PageHead from "@/components/ui/PageHead";
import ViewNav from "@/components/documents/ViewNav";
import Notice from "@/components/ui/Notice";
import DriveShell from "@/components/drive/DriveShell";
import DriveSearch from "@/components/drive/DriveSearch";
import StorageMeter from "@/components/drive/StorageMeter";
import AddFyYear from "@/components/drive/AddFyYear";
import AttachWaiting from "@/components/drive/AttachWaiting";

export const metadata = { title: "Work drive · PHMG" };
export const dynamic = "force-dynamic";

/**
 * What this place is, in one line under the title.
 *
 * It changes with the place, because a sentence that is true everywhere
 * says nothing anywhere — and at a level made only of records it is where
 * the "you cannot rename these" fact belongs, rather than floating between
 * the toolbar and the first tile.
 */
function subFor(node, mixed) {
  if (!mixed && node.type !== "permanent") {
    return "These folders come from the records. Add a client or a job and its folder appears here.";
  }
  if (node.type === "root") {
    return "Your own files, the firm's, and every client's — as folders.";
  }
  if (node.type === "my") return "Only you can open these.";
  if (node.type === "hq") return "The firm's own papers, about no client.";
  if (node.type === "permanent") {
    return "The papers every job for this client refers to.";
  }
  return "Folders and files for this client, as the records make them.";
}

/**
 * The work drive (P3-48d): every folder in the firm, at one address.
 *
 * The page itself decides nothing. `resolveNode` says whether this person
 * may be at this path and what the path means; `listChildren` says what is
 * inside it. Both run on the server, both apply the permission scope before
 * they read, and a path that does not resolve is a **404** rather than a
 * guess — see `lib/folders/resolve.js` for why that matters when the
 * address bar is an input.
 */
export default async function DrivePage({ params }) {
  const actor = await requireUser();
  const { path } = (await params) ?? {};
  const segments = Array.isArray(path) ? path : [];

  await connectDB();
  const resolved = await resolveNode(actor, segments);

  if (resolved?.error === "notFound") notFound();
  if (resolved?.error === "noAccess") {
    // the drive is reached from the Documents menu, so the refusal goes back
    redirect("/issues");
  }

  const [children, used, waiting] = await Promise.all([
    listChildren(actor, resolved),
    storageUsed(actor),
    resolved.node.type === "engagement"
      ? looseForJob(segments)
      : Promise.resolve(null),
  ]);

  const here = ["/documents/folders", ...segments].join("/");

  /**
   * A tile's address is this address plus one segment — built here rather
   * than in the component, because the route walked is what the breadcrumb
   * and the links have to agree on.
   */
  const folders = children.folders.map((folder) => ({
    ...folder,
    href: `${here}/${folder.segment}`,
  }));

  const upHref =
    segments.length > 0
      ? ["/documents/folders", ...segments.slice(0, -1)].join("/")
      : "";

  /**
   * Where a folder may be made, the lock says which tiles are records. At a
   * level that is *only* records — Clients, Services, one service — a lock
   * on every tile marks the norm rather than the exception, so that level
   * says it once in a line instead.
   */
  const mixed = canHoldFolders(resolved.node.type);

  return (
    <Screen>
      <PageHead title="Work drive" sub={subFor(resolved.node, mixed)}>
        <StorageMeter used={used} />
        <ViewNav
          tab="folders"
          mayPurge={can(actor, "approve", "deleteRecord")}
        />
      </PageHead>

      <DriveShell
        node={resolved.node}
        crumbs={resolved.crumbs}
        folders={folders}
        files={children.files}
        path={segments}
        upHref={upHref}
        showLocks={mixed}
        recordsOnly={!mixed && resolved.node.type !== "permanent"}
        writeRules={resolved.writeRules}
        limits={{ maxBytes: MAX_UPLOAD_BYTES, allowed: ALLOWED_TYPES }}
        toolbar={
          <>
            <DriveSearch here={segments} label={resolved.node.label} />
            {/* a year can be opened before the job that will fill it */}
            {resolved.node.type === "service" && resolved.context.clientId && (
              <AddFyYear servicePath={segments} />
            )}
          </>
        }
        waiting={
          waiting?.files?.length ? (
            <AttachWaiting jobPath={segments} files={waiting.files} />
          ) : null
        }
        notice={
          resolved.node.fyAssumed ? (
            <Notice tone="warn">
              This job has no period start, so it is shown under the year it was
              created in. Set the period on the job to move it.
            </Notice>
          ) : null
        }
      />
    </Screen>
  );
}

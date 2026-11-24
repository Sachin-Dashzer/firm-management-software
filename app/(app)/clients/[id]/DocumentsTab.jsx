import Link from "next/link";
import mongoose from "mongoose";
import { resolveNode } from "@/lib/folders/resolve";
import { listChildren } from "@/lib/folders/list";
import { canHoldFolders } from "@/lib/folders/paths";
import { CLIENT_FILES } from "@/lib/documents/zones";
import { ALLOWED_TYPES, MAX_UPLOAD_BYTES } from "@/lib/storage";
import { formatISTDate } from "@/lib/dates";
import DriveShell from "@/components/drive/DriveShell";
import DocumentModel from "@/models/Document";

/**
 * The client's own files, as the work drive shows them (P3-48f).
 *
 * The same component, the same folders, the same rules — rooted at this
 * client instead of at Home. Before this it was a flat list of sections
 * with a wall of "move this to the permanent file" links under each one,
 * and a client with a thousand files had a page nobody could read.
 *
 * **The tab keeps its own address.** The drive's links are rewritten onto
 * `?tab=documents&path=…`, so walking into a job's folder from here does
 * not throw somebody out of the client they were reading. The *actions*
 * still take the canonical path — `clients/c-<id>/…` — so making a folder
 * here and making it in the drive are the same write.
 */
export default async function DocumentsTab({ clientId, actor, path = [] }) {
  const segments = ["clients", `c-${clientId}`, ...path];
  const resolved = await resolveNode(actor, segments);

  if (resolved?.error) {
    return (
      <p className="text-14 text-ink-muted">
        {resolved.error === "noAccess"
          ? (resolved.reason ?? "These files are not visible to your role.")
          : "That folder is not there."}
      </p>
    );
  }

  const [children, strip] = await Promise.all([
    listChildren(actor, resolved),
    stripFor(clientId),
  ]);

  /** One node of this client's drive, on the tab's own address. */
  const inTab = (rest = []) =>
    `/clients/${clientId}?tab=documents${
      rest.length ? `&path=${rest.map(encodeURIComponent).join("/")}` : ""
    }`;

  const folders = children.folders.map((folder) => ({
    ...folder,
    href: inTab([...path, folder.segment]),
  }));

  /**
   * The trail starts at this client. The two crumbs above it — Home and
   * Clients — are the drive's own and mean nothing on a client's page, and
   * the rest line up one for one with the path walked below it.
   */
  const crumbs = resolved.crumbs.slice(2).map((crumb, i) => ({
    label: crumb.label,
    href: inTab(path.slice(0, i)),
  }));

  const upHref = path.length ? inTab(path.slice(0, -1)) : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <Fact value={strip.permanent} label="in the permanent file" />
        <Fact
          value={strip.jobs}
          label={strip.jobs === 1 ? "job with files" : "jobs with files"}
        />
        <Fact value={strip.loose} label="not on a job" />
        <Fact value={strip.shared} label="shared with the client" />
        {strip.last && (
          <span className="text-13 text-ink-muted">
            last upload <span className="num">{strip.last}</span>
          </span>
        )}

        <span className="ml-auto flex items-center gap-2">
          <Link
            href={`/documents?client=${clientId}`}
            className="rounded-control border-rule hover:bg-sunk text-13 h-8 border px-3 leading-8"
          >
            Flat list
          </Link>
          <Link
            href={["/documents/folders", ...segments].join("/")}
            className="rounded-control border-rule hover:bg-sunk text-13 h-8 border px-3 leading-8"
          >
            Open in Work Drive
          </Link>
        </span>
      </div>

      <DriveShell
        node={resolved.node}
        crumbs={crumbs}
        folders={folders}
        files={children.files}
        path={segments}
        upHref={upHref}
        showLocks={canHoldFolders(resolved.node.type)}
        recordsOnly={
          !canHoldFolders(resolved.node.type) &&
          resolved.node.type !== "permanent"
        }
        writeRules={resolved.writeRules}
        limits={{ maxBytes: MAX_UPLOAD_BYTES, allowed: ALLOWED_TYPES }}
      />
    </div>
  );
}

/**
 * The five facts worth having above the folders.
 *
 * All five in one aggregation: a strip of numbers must not cost five
 * queries every time somebody opens a client.
 */
async function stripFor(clientId) {
  const [row] = await DocumentModel.aggregate([
    { $match: { clientId: toId(clientId), ...CLIENT_FILES, deletedAt: null } },
    {
      $group: {
        _id: null,
        permanent: { $sum: { $cond: ["$isPermanent", 1, 0] } },
        shared: { $sum: { $cond: ["$sharedWithClient", 1, 0] } },
        loose: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$engagementId", null] },
                  { $ne: ["$isPermanent", true] },
                ],
              },
              1,
              0,
            ],
          },
        },
        jobs: { $addToSet: "$engagementId" },
        last: { $max: "$createdAt" },
      },
    },
  ]);

  return {
    permanent: row?.permanent ?? 0,
    shared: row?.shared ?? 0,
    loose: row?.loose ?? 0,
    jobs: (row?.jobs ?? []).filter(Boolean).length,
    last: row?.last ? formatISTDate(row.last) : "",
  };
}

/** The aggregation needs the id as an id, not as the string the URL had. */
function toId(value) {
  return typeof value === "string" ? new mongoose.Types.ObjectId(value) : value;
}

function Fact({ value, label }) {
  return (
    <span className="text-13">
      <span className="num font-semibold">{value}</span>{" "}
      <span className="text-ink-muted">{label}</span>
    </span>
  );
}

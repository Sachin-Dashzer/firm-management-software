import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import DocumentModel from "@/models/Document";
import Client from "@/models/Client";
import Folder from "@/models/Folder";
import { formatISTDate, daysUntil } from "@/lib/dates";
import { RECYCLE_DAYS } from "@/lib/storage/retention";
import { visibleZones } from "@/lib/documents/zones";
import PageHead from "@/components/ui/PageHead";
import ViewNav from "@/components/documents/ViewNav";
import RecycleBin from "./RecycleBin";

export const metadata = { title: "Recycle bin · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Deleted files, kept for 90 days (spec section 6). Partner only: restoring
 * and purging are both decisions about the firm's records, and purging is
 * the one action in the app that destroys anything.
 */
export default async function RecycleBinPage() {
  const actor = await requireUser();
  if (!can(actor, "approve", "deleteRecord")) redirect("/issues");

  await connectDB();
  /**
   * Everything the firm deleted — except somebody else's private files.
   *
   * A partner restoring a deleted bank statement has no business reading the
   * names of a colleague's own working copies on the way past (P3-48,
   * decision D-F2: My Docs is private to its owner, and is moved on
   * offboarding rather than read over their shoulder).
   */
  const documents = await DocumentModel.find({
    deletedAt: { $ne: null },
    ...visibleZones(actor.id),
  })
    .setOptions({ withDeleted: true })
    .sort({ deletedAt: -1 })
    .limit(500)
    .lean();

  /**
   * The folders in the bin, and only the ones somebody deleted **as a
   * folder** (P3-48c): a folder that went down inside another folder is
   * restored with its parent, so listing it here would offer two buttons
   * for one decision.
   */
  const binnedFolders = await Folder.find({
    deletedAt: { $ne: null },
    deletedWithFolderId: { $ne: null },
    ...visibleZones(actor.id),
  })
    .setOptions({ withDeleted: true })
    .sort({ deletedAt: -1 })
    .limit(200)
    .lean();

  const clients = await Client.find({
    _id: {
      $in: [
        ...documents.map((d) => d.clientId),
        ...binnedFolders.map((f) => f.clientId),
      ].filter(Boolean),
    },
  })
    .select("legalName tradeName")
    .lean();
  const clientName = new Map(
    clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );

  const topLevel = binnedFolders.filter(
    (f) => String(f.deletedWithFolderId ?? "") === String(f._id),
  );
  const heldBy = new Map(
    topLevel.map((f) => [String(f._id), { files: 0, folders: 0 }]),
  );
  for (const f of binnedFolders) {
    const held = heldBy.get(String(f.deletedWithFolderId ?? ""));
    if (held && String(f._id) !== String(f.deletedWithFolderId))
      held.folders += 1;
  }
  for (const d of documents) {
    const held = heldBy.get(String(d.deletedWithFolderId ?? ""));
    if (held) held.files += 1;
  }

  const folderRows = topLevel.map((f) => ({
    id: String(f._id),
    name: f.name,
    where:
      clientName.get(String(f.clientId)) ??
      (f.zone === "personal" ? "My Docs" : "HQ"),
    files: heldBy.get(String(f._id))?.files ?? 0,
    folders: heldBy.get(String(f._id))?.folders ?? 0,
    deletedOn: formatISTDate(new Date(f.deletedAt)),
  }));

  const rows = documents.map((d) => {
    const binnedOn = new Date(d.deletedAt);
    const purgeOn = new Date(
      binnedOn.getTime() + RECYCLE_DAYS * 24 * 60 * 60 * 1000,
    );
    return {
      id: String(d._id),
      name: d.name,
      client: clientName.get(String(d.clientId)) ?? "Client",
      deletedOn: formatISTDate(binnedOn),
      purgeOn: formatISTDate(purgeOn),
      daysLeft: daysUntil(purgeOn),
      purged: !d.fileKey,
    };
  });

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6 p-4 md:p-6">
      <PageHead
        title="Recycle bin"
        sub={`Deleted files are kept for ${RECYCLE_DAYS} days and can be restored until then. Erasing one cannot be undone.`}
      >
        <ViewNav tab="bin" mayPurge />
      </PageHead>
      <RecycleBin rows={rows} folders={folderRows} />
    </div>
  );
}

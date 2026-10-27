import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import DocumentModel from "@/models/Document";
import Client from "@/models/Client";
import { formatISTDate, daysUntil } from "@/lib/dates";
import { RECYCLE_DAYS } from "@/lib/storage/retention";
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
  const documents = await DocumentModel.find({ deletedAt: { $ne: null } })
    .setOptions({ withDeleted: true })
    .sort({ deletedAt: -1 })
    .limit(500)
    .lean();

  const clients = await Client.find({
    _id: { $in: documents.map((d) => d.clientId) },
  })
    .select("legalName tradeName")
    .lean();
  const clientName = new Map(
    clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );

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
      <div>
        <h1 className="font-display text-24 font-bold tracking-tight">
          Recycle bin
        </h1>
        <p className="text-13 text-ink-muted">
          Deleted files are kept for {RECYCLE_DAYS} days and can be restored
          until then. Erasing one cannot be undone.
        </p>
      </div>
      <RecycleBin rows={rows} />
    </div>
  );
}

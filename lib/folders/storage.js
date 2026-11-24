// @ts-check

import { unstable_cache } from "next/cache";
import { connectDB } from "../db.js";
import Document from "../../models/Document.js";

/**
 * How much of the vault is used (P3-48d, brief §9.4).
 *
 * **Counted, not estimated**, and that means the earlier versions too: a
 * file replaced four times is five files on BigRock, and a meter that
 * ignored them would read comfortable right up to the morning the disk was
 * full.
 *
 * One aggregation, cached for ten minutes under a tag an upload or a purge
 * revalidates. The number is a weather report, not a ledger entry — nobody
 * needs it to the byte, and nobody should pay for a full scan on every
 * folder they open.
 */

export const STORAGE_TAG = "phmg-storage-used";

const read = unstable_cache(
  async () => {
    await connectDB();
    const [row] = await Document.aggregate([
      { $match: { deletedAt: null } },
      {
        $group: {
          _id: null,
          current: { $sum: "$size" },
          versions: { $sum: { $sum: "$versions.size" } },
          files: { $sum: 1 },
        },
      },
    ]);

    return {
      bytes: (row?.current ?? 0) + (row?.versions ?? 0),
      files: row?.files ?? 0,
    };
  },
  ["phmg-storage-used"],
  { revalidate: 600, tags: [STORAGE_TAG] },
);

/**
 * The meter, or nothing at all.
 *
 * Nothing until the firm says how much room it has bought
 * (`STORAGE_QUOTA_BYTES`): a bar with no end is a decoration, and a
 * percentage of an invented total is worse than no percentage (D-F8).
 *
 * @param {{ role?: string }} actor
 */
export async function storageUsed(actor) {
  // the firm's total is the partner's business (brief §9.4)
  if (actor?.role !== "partner") return null;

  const quota = Number(process.env.STORAGE_QUOTA_BYTES ?? 0);
  if (!Number.isFinite(quota) || quota <= 0) return null;

  const { bytes, files } = await read();
  return { bytes, files, quota, share: Math.min(1, bytes / quota) };
}

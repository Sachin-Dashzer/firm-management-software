"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { connectDB } from "@/lib/db";
import Notification from "@/models/Notification";

/**
 * In-app alerts (spec section 12).
 *
 * No permission check beyond "is this yours": a notification belongs to
 * one person and the query is always scoped to them, so there is nothing
 * a role could widen. Nothing here is audited — a nudge being read is not
 * a change to the firm's records, and logging it would drown the entries
 * that matter.
 */

/** The unread count for the bell, and the newest few behind it. */
export async function myNotifications(limit = 12) {
  const actor = await requireUser();
  await connectDB();

  const [rows, unread] = await Promise.all([
    Notification.find({ userId: actor.id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
    Notification.countDocuments({ userId: actor.id, readAt: null }),
  ]);

  return {
    unread,
    rows: rows.map((row) => ({
      id: String(row._id),
      title: row.title,
      body: row.body,
      href: row.href,
      read: Boolean(row.readAt),
      at: row.createdAt,
    })),
  };
}

export async function markRead(id) {
  const actor = await requireUser();
  await connectDB();
  // scoped to the owner, so an id from elsewhere does nothing
  await Notification.updateOne(
    { _id: id, userId: actor.id, readAt: null },
    { $set: { readAt: new Date() } },
  );
  revalidatePath("/notifications");
  return { ok: true };
}

export async function markAllRead() {
  const actor = await requireUser();
  await connectDB();
  const result = await Notification.updateMany(
    { userId: actor.id, readAt: null },
    { $set: { readAt: new Date() } },
  );
  revalidatePath("/notifications");
  return { ok: `${result.modifiedCount} marked as read.` };
}

"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { connectDB } from "@/lib/db";
import Notification from "@/models/Notification";
import { snoozeUntil } from "@/lib/inbox";

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

  /**
   * The bell shows what is awake. A snoozed row is not unread-with-a-dot:
   * the person said "not now", and a count that keeps shouting is the
   * reason nobody uses snooze (P3-17a).
   */
  const awake = {
    userId: actor.id,
    $or: [{ snoozedUntil: null }, { snoozedUntil: { $lte: new Date() } }],
  };

  const [rows, unread] = await Promise.all([
    Notification.find(awake).sort({ createdAt: -1 }).limit(limit).lean(),
    Notification.countDocuments({ ...awake, readAt: null }),
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
  revalidatePath("/inbox");
  return { ok: true };
}

export async function markAllRead() {
  const actor = await requireUser();
  await connectDB();
  const result = await Notification.updateMany(
    { userId: actor.id, readAt: null },
    { $set: { readAt: new Date() } },
  );
  revalidatePath("/inbox");
  return { ok: `${result.modifiedCount} marked as read.` };
}

/**
 * Put a row off until later (P3-17a).
 *
 * Snooze rather than dismiss: the nudge is about something real, so there
 * is nothing here that loses it. Snoozing also marks it read — the person
 * has read it, that is why they are putting it off, and leaving it bold
 * would mean the unread count never falls.
 */
export async function snoozeNotification(id, choice) {
  const actor = await requireUser();
  const until = snoozeUntil(choice);
  if (!until) return { error: "Unknown snooze." };

  await connectDB();
  await Notification.updateOne(
    { _id: id, userId: actor.id },
    { $set: { snoozedUntil: until, readAt: new Date() } },
  );

  revalidatePath("/inbox");
  return { ok: "Snoozed." };
}

/** Bring a snoozed row back now. */
export async function wake(id) {
  const actor = await requireUser();
  await connectDB();
  await Notification.updateOne(
    { _id: id, userId: actor.id },
    { $set: { snoozedUntil: null } },
  );

  revalidatePath("/inbox");
  return { ok: "Back in the list." };
}

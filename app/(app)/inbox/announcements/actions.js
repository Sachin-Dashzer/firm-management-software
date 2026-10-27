"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan, ROLES } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Announcement from "@/models/Announcement";
import User from "@/models/User";
import Branch from "@/models/Branch";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import { notify } from "@/lib/mailer/notify";
import {
  AUDIENCES,
  checkAnnouncement,
  reaches,
  ackedBy,
  isLive,
} from "@/lib/firm/announcements";
import { startOfISTDay, formatISTDate } from "@/lib/dates";

/**
 * Posting, acknowledging and taking down an announcement (P3-17b).
 *
 * **A partner posts** — the same bar as every other firm-wide thing — and
 * everybody the announcement reaches can acknowledge it. Taking one down is
 * a soft delete, because what the firm told its staff in March is part of
 * the record in June.
 */

/** Everybody it reaches, worked out from the rule rather than a stored list. */
async function audienceOf(row) {
  const people = await User.find({ active: true })
    .select("name email role branchIds")
    .lean();

  return people.filter((person) =>
    reaches(row, {
      id: String(person._id),
      role: person.role,
      branchIds: (person.branchIds ?? []).map(String),
    }),
  );
}

export async function postAnnouncement(_prev, formData) {
  const actor = await requireUser();
  assertCan(actor, "approve", "feeWriteOff");

  const audience = String(formData.get("audience") ?? "everyone");
  const branchId = String(formData.get("branchId") ?? "");
  const role = String(formData.get("role") ?? "");
  const fromRaw = String(formData.get("from") ?? "");
  const untilRaw = String(formData.get("until") ?? "");

  const input = {
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    audience,
    branchId,
    role,
    from: fromRaw ? new Date(`${fromRaw}T00:00:00+05:30`) : new Date(),
    until: untilRaw ? new Date(`${untilRaw}T00:00:00+05:30`) : null,
  };

  const problem = checkAnnouncement(input);
  if (problem) return { error: problem };
  if (!AUDIENCES.includes(audience)) return { error: "Unknown audience." };
  if (audience === "role" && !ROLES.includes(role)) {
    return { error: "Unknown role." };
  }

  await connectDB();
  if (audience === "branch") {
    const branch = await Branch.findById(branchId).select("_id").lean();
    if (!branch) return { error: "That office no longer exists." };
  }

  const needsAck = formData.get("needsAck") === "on";

  let posted;
  await audited(actor, async (session) => {
    const [row] = await Announcement.create(
      [
        {
          title: input.title.trim(),
          body: input.body.trim(),
          audience,
          branchId: audience === "branch" ? branchId : null,
          role: audience === "role" ? role : "",
          from: startOfISTDay(input.from),
          until: input.until ? startOfISTDay(input.until) : null,
          needsAck,
          postedBy: actor.id,
          postedByName: actor.name,
          createdBy: actor.id,
          updatedBy: actor.id,
        },
      ],
      { session },
    );
    posted = row;

    await recordAudit(
      {
        action: ACTIONS.create,
        entityType: "Announcement",
        entityId: row._id,
        note: `Announcement posted to ${audience === "everyone" ? "everybody" : audience === "branch" ? "one office" : role}: ${row.title}`,
      },
      session,
    );

    /**
     * Told now, not on the morning it goes up. An announcement dated
     * forward is rare and the inbox row saying so is better than a
     * scheduled job for something nobody will notice.
     */
    const people = await audienceOf(row);
    if (people.length) {
      await notify(
        {
          template: "announcement",
          to: people
            .filter((person) => String(person._id) !== actor.id)
            .map((person) => ({
              id: String(person._id),
              name: person.name,
              email: person.email,
            })),
          values: {
            title: row.title,
            body: row.body,
            who: actor.name,
            ackLine: needsAck
              ? "Please open your inbox and say you have read it."
              : "",
            link: "/inbox",
          },
          about: {
            entityType: "Announcement",
            entityId: row._id,
            href: "/inbox",
          },
        },
        session,
      );
    }
  });

  revalidatePath("/inbox");
  revalidatePath("/inbox/announcements");
  return {
    ok: `Posted${posted?.needsAck ? ", and everybody it reaches is asked to say they have read it" : ""}.`,
  };
}

/**
 * "I have read it."
 *
 * Allowed for anybody the announcement reaches, and nobody else — an
 * acknowledgement from somebody outside the audience is a row that makes
 * the pending list wrong.
 */
export async function acknowledge(id) {
  const actor = await requireUser();
  await connectDB();

  const row = await Announcement.findById(id);
  if (!row) return { error: "That announcement is gone." };
  if (!isLive(row)) return { error: "That announcement has come down." };

  if (
    !reaches(row, {
      id: actor.id,
      role: actor.role,
      branchIds: actor.branchIds,
    })
  ) {
    return { error: "That one is not addressed to you." };
  }
  if (ackedBy(row, actor.id)) return { ok: "Already done." };

  await audited(actor, async (session) => {
    row.acknowledgements.push({
      userId: actor.id,
      name: actor.name,
      at: new Date(),
    });
    row.updatedBy = actor.id;
    await row.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Announcement",
        entityId: row._id,
        note: `${actor.name} has read "${row.title}"`,
      },
      session,
    );
  });

  revalidatePath("/inbox");
  revalidatePath("/inbox/announcements");
  return { ok: "Thank you." };
}

/** Take it down. A soft delete: what the firm said in March stays said. */
export async function endAnnouncement(id) {
  const actor = await requireUser();
  assertCan(actor, "approve", "feeWriteOff");

  await connectDB();
  const row = await Announcement.findById(id);
  if (!row) return { error: "That announcement is gone." };

  await audited(actor, async (session) => {
    row.until = startOfISTDay(new Date());
    row.updatedBy = actor.id;
    await row.save({ session });

    await recordAudit(
      {
        action: ACTIONS.update,
        entityType: "Announcement",
        entityId: row._id,
        note: `Announcement "${row.title}" taken down on ${formatISTDate(row.until)}`,
      },
      session,
    );
  });

  revalidatePath("/inbox");
  revalidatePath("/inbox/announcements");
  return { ok: "Down. It stays on the record." };
}

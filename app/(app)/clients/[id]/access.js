"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import Client from "@/models/Client";
import User from "@/models/User";
import ClientAccess from "@/models/ClientAccess";
import { capSections, SECTIONS } from "@/lib/access/sections";

/**
 * Giving and taking away Client Access Grants (owner decision D3).
 *
 * Every one of these starts the same way: load the client, check
 * `clientAccess` **with the client's branch in hand** — a CA may open their
 * own branch's clients and no others — then write inside one audited
 * transaction.
 */

/** The client, and the right to decide who sees it. */
async function loadForGranting(actor, clientId) {
  await connectDB();
  const client = await Client.findById(clientId)
    .select("branchId legalName tradeName")
    .lean();
  if (!client) {
    const err = new Error("That client no longer exists");
    err.code = "NOT_FOUND";
    throw err;
  }
  assertCan(actor, "edit", "clientAccess", {
    branchId: String(client.branchId),
  });
  return client;
}

/**
 * Open a client to somebody, or widen a grant they already hold.
 *
 * @param {string} clientId
 * @param {FormData} formData
 */
export async function grantAccess(clientId, formData) {
  const actor = await requireUser();
  const client = await loadForGranting(actor, clientId);

  const userId = String(formData.get("userId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const expiresRaw = String(formData.get("expiresAt") ?? "").trim();
  const asked = SECTIONS.filter((section) => formData.get(section) === "on");

  if (!userId) return { error: "Choose who the grant is for." };
  if (!reason) return { error: "Say why they need this client." };
  if (asked.length === 0) return { error: "Tick at least one section." };

  const person = await User.findById(userId).select("name role active").lean();
  if (!person || person.active === false) {
    return { error: "That person is not here any more." };
  }
  if (person.role === "partner" || person.role === "ca") {
    return {
      error: `${person.name} already sees this client through their role — a grant would add nothing.`,
    };
  }

  /**
   * The ceiling is enforced here, on the server, and not only by the disabled
   * tick boxes in the drawer. The form is built from the same function
   * (`capSections`), so the two cannot disagree — but a posted form is just
   * text, and an intern asking for `credentials` is refused by name rather
   * than quietly trimmed.
   */
  const { allowed, refused } = capSections(person.role, asked);
  if (refused.length > 0) {
    return { error: `${person.name}: ${refused[0].why}` };
  }
  if (allowed.length === 0) {
    return { error: `Nothing can be granted to ${person.name}.` };
  }

  let expiresAt = null;
  if (expiresRaw) {
    expiresAt = new Date(`${expiresRaw}T23:59:59+05:30`);
    if (Number.isNaN(expiresAt.getTime())) {
      return { error: "That expiry date cannot be read." };
    }
    if (expiresAt <= new Date()) {
      return { error: "An expiry in the past would grant nothing." };
    }
  }

  await audited(actor, async (session) => {
    // one row per person per client: widening is an edit, which leaves an
    // audit entry saying which sections were added
    const existing = await ClientAccess.findOne({
      userId,
      clientId,
    }).session(session);

    if (existing) {
      existing.sections = allowed;
      existing.reason = reason;
      existing.expiresAt = expiresAt;
      existing.active = true;
      existing.revokedBy = null;
      existing.revokedAt = null;
      existing.branchId = client.branchId;
      existing.updatedBy = actor.id;
      await existing.save({ session });
      return;
    }

    await ClientAccess.create(
      [
        {
          userId,
          clientId,
          branchId: client.branchId,
          sections: allowed,
          reason,
          expiresAt,
          active: true,
          grantedBy: actor.id,
          grantedByName: actor.name,
          createdBy: actor.id,
          updatedBy: actor.id,
        },
      ],
      { session },
    );
  });

  revalidatePath(`/clients/${clientId}`);
  return {
    ok: `${person.name} can now see ${allowed.length} ${
      allowed.length === 1 ? "section" : "sections"
    } of this client.`,
  };
}

/**
 * Take a grant away. The row stays — who could see what, and when that
 * stopped, is exactly the question an ICAI confidentiality review asks.
 *
 * @param {string} clientId
 * @param {string} grantId
 */
export async function revokeAccess(clientId, grantId) {
  const actor = await requireUser();
  await loadForGranting(actor, clientId);

  const grant = await ClientAccess.findOne({ _id: grantId, clientId });
  if (!grant) return { error: "That grant is gone." };
  if (!grant.active) return { error: "That grant has already been revoked." };

  const person = await User.findById(grant.userId).select("name").lean();

  await audited(actor, async (session) => {
    grant.active = false;
    grant.revokedBy = actor.id;
    grant.revokedAt = new Date();
    grant.updatedBy = actor.id;
    await grant.save({ session });
  });

  revalidatePath(`/clients/${clientId}`);
  return {
    ok: `${person?.name ?? "That person"} can no longer see this client.`,
  };
}

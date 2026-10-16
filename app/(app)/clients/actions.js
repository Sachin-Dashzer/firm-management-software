"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan, can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Client from "@/models/Client";
import Branch from "@/models/Branch";
import ClientGroup from "@/models/ClientGroup";
import ClientCredential from "@/models/ClientCredential";
import Comment from "@/models/Comment";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import { decryptField, encryptField, maskAllButLast4 } from "@/lib/crypto";
import { validateClient, firstError } from "@/lib/clients/validate";
import { findDuplicates } from "@/lib/clients/duplicates";
import { nextClientCode } from "@/lib/clients/code";
import { CONTACT_CHANNELS, PORTALS } from "@/lib/validators";

/**
 * Everything that changes a client.
 *
 * The shape of every one of these is the same, and deliberately so:
 *   1. who is asking            — requireUser()
 *   2. may they                 — assertCan(), with the record's branch
 *   3. is the input sound       — validateClient()
 *   4. change it, audited       — audited(actor, session => ...)
 */

/** Read a client's branch before deciding whether someone may touch it. */
async function loadForWrite(actor, clientId, area = "clients") {
  await connectDB();
  const client = await Client.findById(clientId).select(
    "branchId legalName status code",
  );
  if (!client) {
    const err = new Error("That client no longer exists");
    err.code = "NOT_FOUND";
    throw err;
  }
  assertCan(actor, "edit", area, { branchId: String(client.branchId) });
  return client;
}

/** Form fields arrive flat; contacts and GSTINs arrive as repeated rows. */
function readClientForm(formData) {
  const rows = (prefix) => {
    /** @type {Record<string, any>[]} */
    const out = [];
    for (const [key, raw] of formData.entries()) {
      const match = key.match(new RegExp(`^${prefix}\\.(\\d+)\\.(\\w+)$`));
      if (!match) continue;
      const [, index, field] = match;
      out[index] ??= {};
      out[index][field] = raw === "on" ? true : raw;
    }
    return out.filter(Boolean);
  };

  const plain = {};
  for (const key of [
    "legalName",
    "tradeName",
    "entityType",
    "branchId",
    "pan",
    "tan",
    "cin",
    "udyam",
    "iec",
    "aadhaar",
    "status",
    "statusReason",
    "risk",
    "turnoverBand",
    "industry",
    "referralSource",
    "billingCycle",
    "creditDays",
    "invoiceEmail",
    "establishedOn",
    "proposedServices",
    "quotedAmount",
    "clientPartnerId",
    "relationshipManagerId",
    "groupId",
    "tags",
  ]) {
    if (formData.has(key)) plain[key] = formData.get(key);
  }

  return {
    ...plain,
    contacts: rows("contacts"),
    gstins: rows("gstins"),
    addresses: rows("addresses"),
  };
}

/**
 * Create a client. New clients start as a Lead (spec section 3, onboarding
 * step 1) unless a partner says otherwise.
 */
export async function createClient(_prev, formData) {
  const actor = await requireUser();
  assertCan(actor, "edit", "clients");

  const input = readClientForm(formData);
  const { errors, value } = validateClient(input);
  if (Object.keys(errors).length) {
    return { error: firstError(errors), errors };
  }

  assertCan(actor, "edit", "clients", { branchId: value.branchId });

  await connectDB();
  const branch = await Branch.findById(value.branchId).select("code").lean();
  if (!branch) return { error: "That branch no longer exists." };

  // Spec section 3 step 4: the conflict check runs before activation, but
  // there is no reason to let a duplicate PAN in as a lead either.
  const { blocking, warnings } = await findDuplicates(value);
  if (blocking.length && formData.get("confirmDuplicates") !== "yes") {
    return { error: blocking[0].message, duplicates: blocking, warnings };
  }

  const aadhaar = value.aadhaar;
  delete value.aadhaar;

  let created;
  try {
    created = await audited(actor, async (session) => {
      const code = await nextClientCode(branch.code, session);
      const [doc] = await Client.create(
        [
          {
            ...value,
            code,
            status: value.status ?? "Lead",
            onboardedOn: new Date(),
            aadhaarEncrypted: aadhaar ? encryptField(aadhaar) : null,
            aadhaarLast4: aadhaar ? aadhaar.slice(-4) : "",
            createdBy: actor.id,
            updatedBy: actor.id,
          },
        ],
        { session },
      );
      return doc;
    });
  } catch (err) {
    if (err.code === 11000) {
      return { error: "A client with that PAN or code already exists." };
    }
    return { error: err.message };
  }

  revalidatePath("/clients");
  return {
    ok: `${created.legalName} created as ${created.status}, code ${created.code}.`,
    id: String(created._id),
    warnings,
  };
}

/** Edit a client. Only the fields present in the form are touched. */
export async function updateClient(clientId, formData) {
  const actor = await requireUser();
  const existing = await loadForWrite(actor, clientId);

  const input = readClientForm(formData);
  const { errors, value } = validateClient(input, { partial: true });
  if (Object.keys(errors).length) {
    return { error: firstError(errors), errors };
  }

  // PAN, Aadhaar and the rest of the sensitive block need the higher grant
  if ("pan" in value || "aadhaar" in input) {
    assertCan(actor, "edit", "clientSensitive", {
      branchId: String(existing.branchId),
    });
  }

  if (value.pan || value.gstins?.length || value.contacts?.length) {
    const { blocking } = await findDuplicates(value, clientId);
    if (blocking.length && formData.get("confirmDuplicates") !== "yes") {
      return { error: blocking[0].message, duplicates: blocking };
    }
  }

  const aadhaar = value.aadhaar;
  delete value.aadhaar;
  if (aadhaar !== undefined) {
    value.aadhaarEncrypted = aadhaar ? encryptField(aadhaar) : null;
    value.aadhaarLast4 = aadhaar ? aadhaar.slice(-4) : "";
  }

  try {
    await audited(actor, (session) =>
      // findOneAndUpdate carries the audit plugin, which records the
      // field-level before and after
      Client.findOneAndUpdate(
        { _id: clientId },
        { $set: { ...value, updatedBy: actor.id } },
        { session, runValidators: true },
      ),
    );
  } catch (err) {
    if (err.code === 11000) {
      return { error: "Another client already has that PAN." };
    }
    return { error: err.message };
  }

  revalidatePath(`/clients/${clientId}`);
  return { ok: "Saved." };
}

/**
 * Change status. Activation runs the conflict check first (spec section 3,
 * step 4), and closing requires the client's engagements to be finished —
 * that check arrives with engagements in Step 5.
 */
export async function setClientStatus(clientId, status, reason = "") {
  const actor = await requireUser();
  const existing = await loadForWrite(actor, clientId);

  const { errors, value } = validateClient(
    { status, statusReason: reason },
    { partial: true },
  );
  if (Object.keys(errors).length) return { error: firstError(errors) };

  await connectDB();
  if (status === "Active") {
    const full = await Client.findById(clientId)
      .select("pan gstins contacts legalName")
      .lean();
    const { blocking } = await findDuplicates(full, clientId);
    if (blocking.length) {
      return {
        error: `Cannot activate: ${blocking[0].message} Resolve the duplicate first.`,
      };
    }
  }

  const before = existing.status;
  await audited(actor, async (session) => {
    await Client.updateOne(
      { _id: clientId },
      {
        $set: {
          status: value.status,
          statusReason: value.statusReason ?? "",
          updatedBy: actor.id,
        },
      },
      { session },
    );
    await recordAudit(
      {
        action: ACTIONS.statusChange,
        entityType: "Client",
        entityId: clientId,
        clientId,
        diff: { status: [before, value.status] },
        note: value.statusReason ?? "",
      },
      session,
    );
  });

  revalidatePath(`/clients/${clientId}`);
  return { ok: `Status changed to ${value.status}.` };
}

/** Soft delete, Partner only (spec section 2). */
export async function deleteClient(clientId, reason) {
  const actor = await requireUser();
  assertCan(actor, "approve", "deleteRecord");
  if (!String(reason ?? "").trim()) {
    return { error: "Give a reason for deleting this client." };
  }

  await connectDB();
  const client = await Client.findById(clientId);
  if (!client) return { error: "That client no longer exists." };

  await audited(actor, async (session) => {
    client.deletedAt = new Date();
    client.deletedBy = actor.id;
    await client.save({ session });
    await recordAudit(
      {
        action: ACTIONS.softDelete,
        entityType: "Client",
        entityId: clientId,
        clientId,
        note: String(reason).trim(),
      },
      session,
    );
  });

  revalidatePath("/clients");
  return { ok: `${client.legalName} moved to the recycle bin.` };
}

// --- notes and the communication log (spec section 3) ----------------------

export async function addClientNote(clientId, formData) {
  const actor = await requireUser();
  await loadForWrite(actor, clientId);

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Write something first." };

  const kind = String(formData.get("kind") ?? "Note");
  if (!["Note", ...CONTACT_CHANNELS].includes(kind)) {
    return { error: "Unknown kind of entry." };
  }

  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const occurredAt = occurredAtRaw ? new Date(occurredAtRaw) : new Date();
  if (Number.isNaN(occurredAt.valueOf()))
    return { error: "That is not a date." };
  if (occurredAt > new Date(Date.now() + 86_400_000)) {
    return { error: "That date is in the future." };
  }

  await audited(actor, (session) =>
    Comment.create(
      [
        {
          entityType: "Client",
          entityId: clientId,
          clientId,
          kind,
          body,
          occurredAt,
          internal: true,
          createdBy: actor.id,
          createdByName: actor.name,
        },
      ],
      { session },
    ),
  );

  revalidatePath(`/clients/${clientId}`);
  return { ok: kind === "Note" ? "Note added." : `${kind} logged.` };
}

// --- the credentials vault (spec sections 3 and 16) ------------------------

export async function saveCredential(clientId, formData) {
  const actor = await requireUser();
  const client = await loadForWrite(actor, clientId, "clientSensitive");

  const portal = String(formData.get("portal") ?? "");
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const credentialId = String(formData.get("credentialId") ?? "");

  if (!PORTALS.includes(portal)) return { error: "Choose a portal." };
  if (!username) return { error: "The username is needed." };
  if (!credentialId && !password) return { error: "The password is needed." };

  await audited(actor, async (session) => {
    const fields = {
      portal,
      label,
      username,
      updatedBy: actor.id,
      ...(password ? { passwordEncrypted: encryptField(password) } : {}),
      ...(notes ? { notesEncrypted: encryptField(notes) } : {}),
    };

    if (credentialId) {
      await ClientCredential.findOneAndUpdate(
        { _id: credentialId, clientId },
        { $set: fields },
        { session },
      );
    } else {
      await ClientCredential.create(
        [{ ...fields, clientId, createdBy: actor.id }],
        { session },
      );
    }
  });

  revalidatePath(`/clients/${clientId}`);
  return {
    ok: `${portal} login saved for ${client.legalName}.`,
  };
}

/**
 * Reveal one stored password. Every reveal is logged with who and when
 * (spec section 11), which is the point of keeping them here at all.
 */
export async function revealCredential(credentialId) {
  const actor = await requireUser();

  await connectDB();
  const credential = await ClientCredential.findById(credentialId)
    .select("+passwordEncrypted +notesEncrypted clientId portal username")
    .lean();
  if (!credential) return { error: "That login no longer exists." };

  const client = await Client.findById(credential.clientId)
    .select("branchId legalName")
    .lean();
  assertCan(actor, "view", "clientSensitive", {
    branchId: String(client?.branchId),
  });

  let password;
  let notes = "";
  try {
    password = decryptField(credential.passwordEncrypted);
    if (credential.notesEncrypted)
      notes = decryptField(credential.notesEncrypted);
  } catch {
    return {
      error:
        "That password cannot be decrypted. FIELD_ENCRYPTION_KEY may have changed since it was saved.",
    };
  }

  await audited(actor, async (session) => {
    await ClientCredential.updateOne(
      { _id: credentialId },
      { $set: { lastRevealedAt: new Date(), lastRevealedBy: actor.id } },
      { session },
    );
    await recordAudit(
      {
        action: ACTIONS.credentialReveal,
        entityType: "ClientCredential",
        entityId: credentialId,
        clientId: String(credential.clientId),
        note: `${credential.portal} login for ${client?.legalName ?? "a client"}`,
      },
      session,
    );
  });

  return { ok: true, password, notes, username: credential.username };
}

export async function deleteCredential(clientId, credentialId) {
  const actor = await requireUser();
  await loadForWrite(actor, clientId, "clientSensitive");

  await connectDB();
  const credential = await ClientCredential.findById(credentialId);
  if (!credential) return { error: "That login no longer exists." };

  await audited(actor, (session) => {
    credential.deletedAt = new Date();
    credential.deletedBy = actor.id;
    return credential.save({ session });
  });

  revalidatePath(`/clients/${clientId}`);
  return { ok: "Login removed." };
}

// --- groups ---------------------------------------------------------------

export async function createGroup(name) {
  const actor = await requireUser();
  assertCan(actor, "edit", "clients");

  const trimmed = String(name ?? "").trim();
  if (trimmed.length < 2) return { error: "Give the group a name." };

  await connectDB();
  try {
    const group = await audited(actor, async (session) => {
      const [doc] = await ClientGroup.create(
        [{ name: trimmed, createdBy: actor.id, updatedBy: actor.id }],
        { session },
      );
      return doc;
    });
    revalidatePath("/clients");
    return { ok: `Group "${trimmed}" created.`, id: String(group._id) };
  } catch (err) {
    if (err.code === 11000)
      return { error: "There is already a group with that name." };
    return { error: err.message };
  }
}

/** Used by the onboarding form to warn before anything is saved. */
export async function checkForDuplicates(candidate) {
  const actor = await requireUser();
  if (!can(actor, "view", "clients")) return { blocking: [], warnings: [] };

  await connectDB();
  const { errors, value } = validateClient(candidate, { partial: true });
  if (Object.keys(errors).length) return { blocking: [], warnings: [] };

  const { blocking, warnings } = await findDuplicates(value, candidate.id);
  return {
    blocking: blocking.map((d) => d.message),
    warnings: warnings.map((d) => d.message),
  };
}

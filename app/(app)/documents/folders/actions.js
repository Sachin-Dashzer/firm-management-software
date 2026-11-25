"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import { jobLabel, resolveNode } from "@/lib/folders/resolve";
import {
  anchorFor,
  anchorSegments,
  fySegment,
  urlFor,
} from "@/lib/folders/paths";
import {
  checkMove,
  checkName,
  checkPlace,
  fyChoices,
} from "@/lib/folders/rules";
import { targetOf } from "@/lib/documents/target";
import { visibleClientIds } from "@/lib/access/clientAccess";
import { CLIENT_FILES } from "@/lib/documents/zones";
import { financialYearLabel } from "@/lib/dates";
import { remove } from "@/lib/storage";
import Client from "@/models/Client";
import ServiceTemplate from "@/models/ServiceTemplate";
import Folder from "@/models/Folder";
import Document from "@/models/Document";
import Engagement from "@/models/Engagement";

/**
 * Making, renaming, moving and deleting folders in the work drive (P3-48c).
 *
 * Every action here does the same four things in the same order, and the
 * order is the safety: **resolve the path on the server** (never trust a
 * context the browser hands back), **assert the permission the resolver
 * worked out**, **validate**, then write inside `audited()` so the change
 * and its audit entry stand or fall together (CLAUDE.md rule 2).
 *
 * Nothing here moves a byte. A folder is where a record says it is, so a
 * rename is one small write and a move is a re-stamp of a subtree — the
 * vault's own paths, built from the client code, the year and the job, are
 * never touched.
 *
 * **Every write re-reads its rows inside the transaction**, and that is not
 * belt and braces. `withAudit` retries its callback when MongoDB reports a
 * transient conflict — two writes touching the audit counter look exactly
 * like that — and a retry re-runs the callback against documents whose
 * modified state the aborted attempt already consumed. Mongoose then writes
 * nothing for the fields set before the retry, and says nothing about it.
 * `folders.delete-restore.test.js` caught it: a subtree went to the bin
 * without the stamp that lets a restore find it again. So the rows are
 * loaded where they are written.
 */

const pathSchema = z.array(z.string().max(64)).max(32);

/**
 * The node a path names, or a refusal in the words a person reads.
 *
 * `notFound` is deliberately not "not allowed": naming a record somebody
 * may not see tells them it exists.
 */
async function nodeFor(actor, path) {
  const parsed = pathSchema.safeParse(path ?? []);
  if (!parsed.success) return { error: "That is not a place in the drive." };

  const resolved = await resolveNode(actor, parsed.data);
  if (resolved?.error === "notFound") {
    return { error: "That folder is not there." };
  }
  if (resolved?.error === "noAccess") {
    return { error: resolved.reason || "You cannot open that." };
  }
  return { resolved };
}

/** The path of a stored folder: its anchor, then the chain down to it. */
function segmentsOf(folder) {
  return [
    ...anchorSegments(folder.anchor),
    ...(folder.ancestors ?? []).map((id) => `f-${id}`),
    `f-${folder._id}`,
  ];
}

/** The live folders directly beside one that is being made or renamed. */
async function siblingsOf({ anchor, parentId, ownerId }, session) {
  const query = Folder.find({
    anchor,
    parentId: parentId ?? null,
    ...(ownerId ? { ownerId } : {}),
  }).select("name");
  if (session) query.session(session);
  return (await query.lean()).map((row) => row.name);
}

/** What the drive calls the level a folder is being made in. */
const parentTypeOf = (node) => (node.type === "folder" ? "folder" : node.type);

// --- making, renaming, moving --------------------------------------------

/**
 * A new folder, inheriting the context of wherever it is made.
 *
 * The inheritance is the whole trick: a folder inside a job carries that
 * job's client, service, year and job id, so a file dropped into it needs no
 * guessing about what it belongs to — the folder already knows.
 */
export async function createFolder({ parentPath, name }) {
  const actor = await requireUser();
  await connectDB();

  const { error, resolved } = await nodeFor(actor, parentPath);
  if (error) return { error };

  const place = checkPlace(resolved.node, resolved.context.folderIds.length);
  if (!place.ok) return { error: place.error };
  if (!resolved.writeRules.folders) {
    return {
      error: resolved.writeRules.reason || "You cannot add a folder here.",
    };
  }

  const anchor = anchorFor(resolved.context);
  const parentId = resolved.context.folderId ?? null;
  const ownerId = resolved.context.zone === "personal" ? actor.id : null;

  const checked = checkName(name, {
    parentType: parentTypeOf(resolved.node),
    siblings: await siblingsOf({ anchor, parentId, ownerId }),
  });
  if (!checked.ok) return { error: checked.error, suggest: checked.suggest };

  const folder = await audited(actor, async (session) => {
    /**
     * Checked again, inside the transaction. Two people typing "Bank
     * statements" into the same folder at the same moment both passed the
     * check above; this is where one of them loses, which is the only
     * place the answer is actually true.
     */
    const taken = await siblingsOf({ anchor, parentId, ownerId }, session);
    if (
      taken.some((n) => n.trim().toLowerCase() === checked.name.toLowerCase())
    ) {
      throw new Error(`"${checked.name}" is already here.`);
    }

    const ancestors = (resolved.context.folderIds ?? []).map((id) => id);
    const [row] = await Folder.create(
      [
        {
          name: checked.name,
          nameKey: checked.name.toLowerCase(),
          kind: "custom",
          zone: resolved.context.zone,
          anchor,
          parentId,
          ownerId,
          clientId: resolved.context.clientId ?? null,
          serviceTemplateId: resolved.context.serviceTemplateId ?? null,
          fy: resolved.context.fy ?? "",
          engagementId: resolved.context.engagementId ?? null,
          branchId: resolved.context.branchId || null,
          ancestors,
          depth: ancestors.length,
          createdBy: actor.id,
          updatedBy: actor.id,
        },
      ],
      { session },
    );

    await recordAudit(
      {
        action: ACTIONS.folderCreate,
        entityType: "Folder",
        entityId: row._id,
        clientId: resolved.context.clientId ?? null,
        note: row.name,
      },
      session,
    );
    return row;
  }).catch((err) => ({ error: err.message }));

  if (folder?.error) return { error: folder.error };

  revalidatePath("/documents/folders");
  return {
    ok: `${folder.name} added.`,
    id: String(folder._id),
    href: urlFor({
      ...resolved.context,
      folderIds: [...(resolved.context.folderIds ?? []), String(folder._id)],
    }),
  };
}

/** A folder somebody made, renamed. Records are renamed on their own page. */
export async function renameFolder(id, name) {
  const actor = await requireUser();
  await connectDB();

  const folder = await Folder.findById(id);
  if (!folder) return { error: "That folder is gone." };

  const { error, resolved } = await nodeFor(actor, segmentsOf(folder));
  if (error) return { error };
  if (!resolved.writeRules.folders) {
    return {
      error: resolved.writeRules.reason || "You cannot change this folder.",
    };
  }

  const checked = checkName(name, {
    parentType: "folder",
    siblings: (
      await siblingsOf({
        anchor: folder.anchor,
        parentId: folder.parentId,
        ownerId: folder.ownerId,
      })
    ).filter((n) => n !== folder.name),
  });
  if (!checked.ok) return { error: checked.error, suggest: checked.suggest };

  await audited(actor, async (session) => {
    const live = await Folder.findById(folder._id).session(session);
    if (!live) throw new Error("That folder is gone.");
    live.name = checked.name;
    live.nameKey = checked.name.toLowerCase();
    live.updatedBy = actor.id;
    await live.save({ session });

    await recordAudit(
      {
        action: ACTIONS.folderRename,
        entityType: "Folder",
        entityId: folder._id,
        clientId: folder.clientId ?? null,
        note: checked.name,
      },
      session,
    );
  });

  revalidatePath("/documents/folders");
  return { ok: "Renamed." };
}

/**
 * A folder, and everything under it, moved somewhere else.
 *
 * ponytail: the subtree is re-stamped one row at a time, because the audit
 * plugin cannot log an `updateMany` — a folder of a few hundred rows is
 * fine, and anything larger wants a batched rewrite with its own audit
 * entry rather than a silent bulk write.
 */
export async function moveFolder(id, targetPath) {
  const actor = await requireUser();
  await connectDB();

  const folder = await Folder.findById(id);
  if (!folder) return { error: "That folder is gone." };

  const from = await nodeFor(actor, segmentsOf(folder));
  if (from.error) return { error: from.error };
  if (!from.resolved.writeRules.folders) {
    return {
      error: from.resolved.writeRules.reason || "You cannot move this folder.",
    };
  }

  const to = await nodeFor(actor, targetPath);
  if (to.error) return { error: to.error };
  if (!to.resolved.writeRules.folders) {
    return {
      error: to.resolved.writeRules.reason || "Nothing can be put there.",
    };
  }

  const subtree = await Folder.find({ ancestors: folder._id });
  const deepest = subtree.reduce(
    (n, row) => Math.max(n, row.depth),
    folder.depth,
  );
  const allowed = checkMove(folder, to.resolved, deepest - folder.depth);
  if (!allowed.ok) return { error: allowed.error };

  const anchor = anchorFor(to.resolved.context);
  const chain = (to.resolved.context.folderIds ?? []).map(String);
  if (chain.includes(String(folder._id))) {
    return { error: "A folder cannot be moved inside itself." };
  }

  await audited(actor, async (session) => {
    const live = await Folder.findById(folder._id).session(session);
    if (!live) throw new Error("That folder is gone.");
    const rows = await Folder.find({ ancestors: live._id }).session(session);
    const above = live.ancestors.length;

    live.anchor = anchor;
    live.parentId = chain.length ? chain[chain.length - 1] : null;
    live.ancestors = chain;
    live.depth = chain.length;
    live.updatedBy = actor.id;
    await live.save({ session });

    for (const row of rows) {
      // everything above the folder is replaced; everything below it stays
      const below = row.ancestors.slice(above);
      row.anchor = anchor;
      row.ancestors = [...chain, ...below];
      row.depth = row.ancestors.length;
      row.parentId = row.ancestors[row.ancestors.length - 1] ?? null;
      row.updatedBy = actor.id;
      await row.save({ session });
    }

    await recordAudit(
      {
        action: ACTIONS.folderMove,
        entityType: "Folder",
        entityId: folder._id,
        clientId: folder.clientId ?? null,
        note: `${folder.name} → ${to.resolved.node.label}`,
      },
      session,
    );
  });

  revalidatePath("/documents/folders");
  return { ok: `${folder.name} moved.` };
}

// --- deleting and restoring ----------------------------------------------

/** The folder, every folder under it, and every file in any of them. */
async function subtreeOf(folder, session) {
  const root = session
    ? await Folder.findById(folder._id).session(session)
    : folder;

  const under = Folder.find({ ancestors: folder._id });
  if (session) under.session(session);
  const folders = [root, ...(await under)].filter(Boolean);

  const files = Document.find({
    folderId: { $in: folders.map((row) => row._id) },
  });
  if (session) files.session(session);

  return { folders, documents: await files };
}

/**
 * What a delete would take with it, so the confirmation can say so rather
 * than asking a person to guess.
 */
export async function folderContents(id) {
  const actor = await requireUser();
  await connectDB();

  const folder = await Folder.findById(id);
  if (!folder) return { error: "That folder is gone." };
  const { error } = await nodeFor(actor, segmentsOf(folder));
  if (error) return { error };

  const { folders, documents } = await subtreeOf(folder);
  return {
    ok: true,
    name: folder.name,
    folders: folders.length - 1,
    files: documents.length,
  };
}

/**
 * A folder to the recycle bin, with everything inside it.
 *
 * The whole subtree is stamped with the same `deletedWithFolderId`, which is
 * what lets a restore bring back exactly this and not a file somebody
 * deleted on its own a week ago.
 *
 * **Refused outright if any one file may not be deleted.** A half-deleted
 * folder is worse than a refused one: it leaves a person believing the
 * tidying worked.
 */
export async function deleteFolder(id, reason = "") {
  const actor = await requireUser();
  await connectDB();

  const folder = await Folder.findById(id);
  if (!folder) return { error: "Already gone." };

  const { error, resolved } = await nodeFor(actor, segmentsOf(folder));
  if (error) return { error };
  if (!resolved.writeRules.folders) {
    return {
      error: resolved.writeRules.reason || "You cannot delete this folder.",
    };
  }

  const { folders, documents } = await subtreeOf(folder);

  // a completed job is locked, and a file on one cannot go to the bin
  const onJobs = [
    ...new Set(
      documents.map((d) => String(d.engagementId ?? "")).filter(Boolean),
    ),
  ];
  if (onJobs.length) {
    const locked = await Engagement.find({
      _id: { $in: onJobs },
      status: "Completed",
    })
      .select("code")
      .lean();
    if (locked.length) {
      return {
        error: `This folder holds files on ${locked.map((j) => j.code).join(", ")}, which ${locked.length === 1 ? "is a completed job and is" : "are completed jobs and are"} locked.`,
      };
    }
  }

  // the vault moves first: if that fails, nothing has been marked deleted
  for (const document of documents) {
    if (document.fileKey) await remove(document.fileKey);
  }

  await audited(actor, async (session) => {
    const inside = await subtreeOf(folder, session);
    for (const document of inside.documents) {
      document.deletedWithFolderId = folder._id;
      document.updatedBy = actor.id;
      await document.softDelete(actor.id, { session });
    }
    for (const row of inside.folders) {
      row.deletedWithFolderId = folder._id;
      row.updatedBy = actor.id;
      await row.softDelete(actor.id, { session });
    }

    await recordAudit(
      {
        action: ACTIONS.folderDelete,
        entityType: "Folder",
        entityId: folder._id,
        clientId: folder.clientId ?? null,
        note: [
          folder.name,
          `${documents.length} file${documents.length === 1 ? "" : "s"}`,
          reason,
        ]
          .filter(Boolean)
          .join(" — "),
      },
      session,
    );
  });

  revalidatePath("/documents/folders");
  revalidatePath("/documents/bin");
  if (folder.clientId) revalidatePath(`/clients/${folder.clientId}`);
  return {
    ok: `${folder.name} and ${documents.length} file${documents.length === 1 ? "" : "s"} moved to the recycle bin.`,
  };
}

/**
 * A folder back out of the bin, with what went down with it.
 *
 * A file deleted on its own before the folder was stays deleted: it carries
 * no `deletedWithFolderId`, and bringing it back would be this action
 * undoing a decision somebody else made.
 */
export async function restoreFolder(id) {
  const actor = await requireUser();
  if (!can(actor, "approve", "deleteRecord")) {
    return { error: "Only a partner restores from the recycle bin." };
  }
  await connectDB();

  const folder = await Folder.findById(id).setOptions({ withDeleted: true });
  if (!folder) return { error: "That folder is gone." };
  if (!folder.deletedAt) return { ok: "It was never deleted." };

  const [folders, documents] = await Promise.all([
    Folder.find({ deletedWithFolderId: folder._id }).setOptions({
      withDeleted: true,
    }),
    Document.find({ deletedWithFolderId: folder._id }).setOptions({
      withDeleted: true,
    }),
  ]);

  // a live sibling may have taken the name while this was in the bin
  const siblings = await siblingsOf({
    anchor: folder.anchor,
    parentId: folder.parentId,
    ownerId: folder.ownerId,
  });
  const clash = siblings.some(
    (n) => n.trim().toLowerCase() === folder.name.trim().toLowerCase(),
  );

  for (const document of documents) {
    if (document.fileKey) await remove(document.fileKey, { restore: true });
  }

  const name = clash ? `${folder.name} (restored)` : folder.name;

  await audited(actor, async (session) => {
    /**
     * One at a time, not `Promise.all`: a session carries one transaction,
     * and two reads on it at once are refused with "only servers in a
     * sharded cluster can start a new transaction at the active transaction
     * number".
     */
    const tree = await Folder.find({ deletedWithFolderId: folder._id })
      .setOptions({ withDeleted: true })
      .session(session);
    const files = await Document.find({ deletedWithFolderId: folder._id })
      .setOptions({ withDeleted: true })
      .session(session);

    for (const row of tree) {
      // the folder itself takes the new name, if the old one was taken
      if (String(row._id) === String(folder._id)) {
        row.name = name;
        row.nameKey = name.toLowerCase();
      }
      row.deletedWithFolderId = null;
      await row.restore(actor.id, { session });
    }
    for (const document of files) {
      document.deletedWithFolderId = null;
      await document.restore(actor.id, { session });
    }

    await recordAudit(
      {
        action: ACTIONS.folderRestore,
        entityType: "Folder",
        entityId: folder._id,
        clientId: folder.clientId ?? null,
        note: `${folder.name} — ${documents.length} file${documents.length === 1 ? "" : "s"}`,
      },
      session,
    );
  });

  revalidatePath("/documents/bin");
  revalidatePath("/documents/folders");
  return {
    ok: clash
      ? `Restored as "${name}" — that name was taken while it was in the bin.`
      : `${name} restored.`,
  };
}

// --- files ----------------------------------------------------------------

/**
 * A file filed somewhere else.
 *
 * The bytes do not move: `fileKey` is where the vault put it, and the drive
 * is metadata. What does change is what the file *belongs* to — and moving
 * it out of a job takes it off any checklist item it was answering, which is
 * why this action refuses to do it quietly.
 *
 * @param {string} id
 * @param {string[]} targetPath
 * @param {{ confirmed?: boolean }} [options]
 */
export async function moveDocument(id, targetPath, options = {}) {
  const actor = await requireUser();
  await connectDB();

  const document = await Document.findById(id);
  if (!document) return { error: "That file is gone." };

  const engagement = document.engagementId
    ? await Engagement.findById(document.engagementId).lean()
    : null;
  const source = await targetOf(actor, engagement, null, document.clientId);
  if (!can(actor, "edit", "documents", source)) {
    return { error: "You cannot move this file." };
  }

  const { error, resolved } = await nodeFor(actor, targetPath);
  if (error) return { error };
  if (!resolved.writeRules.upload) {
    return {
      error: resolved.writeRules.reason || "Nothing can be filed there.",
    };
  }

  const context = resolved.context;
  if (String(document.zone ?? "client") !== String(context.zone)) {
    return {
      error:
        "A file cannot move between My Docs, HQ and a client. Whose paper it is would change.",
    };
  }
  if (String(document.clientId ?? "") !== String(context.clientId ?? "")) {
    return { error: "A file cannot move to another client." };
  }

  /**
   * The file may be what ticked a checklist item. Taking it off the job
   * un-ticks that item, so the caller is told first and has to say yes —
   * and the question is asked here, on the server, rather than only in a
   * dialog somebody could step around by calling the action directly.
   */
  const leavingJob =
    document.engagementId &&
    String(document.engagementId) !== String(context.engagementId ?? "");
  let answered = null;
  if (leavingJob && engagement) {
    answered = (engagement.checklist ?? []).find((item) =>
      (item.documentIds ?? []).some((d) => String(d) === String(document._id)),
    );
    if (answered && !options.confirmed) {
      return {
        confirm: `This file answers "${answered.name}" on the checklist. Moving it will un-tick that item.`,
      };
    }
  }

  await audited(actor, async (session) => {
    if (leavingJob && answered) {
      const live = await Engagement.findById(document.engagementId).session(
        session,
      );
      const item = live?.checklist?.id(answered._id);
      if (item) {
        item.documentIds = (item.documentIds ?? []).filter(
          (d) => String(d) !== String(document._id),
        );
        if (!item.documentIds.length && item.status === "Received") {
          item.status = "Requested";
          item.receivedAt = null;
        }
        live.updatedBy = actor.id;
        await live.save({ session });
      }
    }

    const live = await Document.findById(document._id).session(session);
    if (!live) throw new Error("That file is gone.");
    live.folderId = context.folderId ?? null;
    live.engagementId = context.engagementId ?? null;
    live.serviceTemplateId = context.serviceTemplateId ?? null;
    live.fy = context.fy || live.fy;
    live.isPermanent = Boolean(context.permanent);
    if (!context.engagementId) live.checklistItemId = null;
    live.updatedBy = actor.id;
    await live.save({ session });

    await recordAudit(
      {
        action: ACTIONS.documentMove,
        entityType: "Document",
        entityId: document._id,
        clientId: document.clientId ?? null,
        note: `${document.name} → ${resolved.node.label}`,
      },
      session,
    );
  });

  revalidatePath("/documents/folders");
  if (document.clientId) revalidatePath(`/clients/${document.clientId}`);
  if (engagement) revalidatePath(`/engagements/${engagement._id}`);
  return {
    ok: `${document.name} filed in ${resolved.node.label}.`,
    unticked: Boolean(leavingJob && answered),
  };
}

/**
 * The chain of folders a dropped folder brings with it, found or made.
 *
 * A browser hands a picked folder over as a flat list of files, each
 * carrying its path in `webkitRelativePath` — "KYC/Aadhaar/noshad.pdf". The
 * folders themselves are not sent, so unless something makes them the whole
 * tree lands in one heap, which is what it used to do.
 *
 * Walked one level at a time, re-resolving the path each step, because
 * every level has to pass the same checks a hand-made folder passes: the
 * place must take folders, the name must be legal, and the person must be
 * allowed to write there. A name already in use is **reused, not
 * duplicated** — dropping the same folder twice puts the second batch of
 * files beside the first instead of making "KYC (2)".
 *
 * @param {string[]} parentPath the drive path the upload is aimed at
 * @param {string[]} names the folder names below it, outermost first
 * @returns {Promise<{path: string[]}|{error: string}>}
 */
export async function ensureFolderPath(parentPath, names = []) {
  const actor = await requireUser();
  await connectDB();

  const wanted = (names ?? []).filter((n) => String(n ?? "").trim());
  if (wanted.length > 16) {
    return { error: "That folder is nested too deeply to copy in." };
  }

  let path = [...(parentPath ?? [])];

  for (const raw of wanted) {
    const { error, resolved } = await nodeFor(actor, path);
    if (error) return { error };

    const checked = checkName(raw, {
      parentType: parentTypeOf(resolved.node),
      siblings: [],
    });
    if (!checked.ok) return { error: checked.error };

    /*
     * Reuse before create. The uniqueness check inside `createFolder` would
     * refuse the second drop of the same folder, and refusing is the wrong
     * answer: the person is adding more files to a folder they already
     * made.
     */
    const ownerId = resolved.context.zone === "personal" ? actor.id : null;
    const here = await Folder.findOne({
      anchor: anchorFor(resolved.context),
      parentId: resolved.context.folderId ?? null,
      ...(ownerId ? { ownerId } : {}),
      nameKey: checked.name.toLowerCase(),
    }).select("_id");

    if (here) {
      path = [...path, `f-${here._id}`];
      continue;
    }

    const made = await createFolder({ parentPath: path, name: checked.name });
    if (made?.error) return { error: made.error };
    path = [...path, `f-${made.id}`];
  }

  return { path };
}

// --- the year folder, and the files waiting in it -------------------------

/**
 * A financial year folder on a client's service, for papers that arrive
 * before the job exists (brief §4).
 *
 * Stored, unlike the years that come from jobs — and shown as the same node
 * as those, so a year is one folder however it came to be there.
 */
export async function addFyFolder({ servicePath, fy }) {
  const actor = await requireUser();
  await connectDB();

  const { error, resolved } = await nodeFor(actor, servicePath);
  if (error) return { error };
  if (resolved.node.type !== "service" || !resolved.context.clientId) {
    return { error: "A year belongs on a client's service." };
  }
  if (
    !can(actor, "edit", "documents", { branchId: resolved.context.branchId })
  ) {
    return { error: "You cannot add a year here." };
  }

  const { clientId, serviceTemplateId } = resolved.context;
  const [jobs, stored] = await Promise.all([
    Engagement.find({ clientId, serviceTemplateId })
      .select("periodStart createdAt")
      .lean(),
    Folder.find({ clientId, serviceTemplateId, kind: "fy" })
      .select("fy")
      .lean(),
  ]);

  const taken = new Set([
    ...jobs.map(
      (job) =>
        `FY${financialYearLabel(new Date(job.periodStart ?? job.createdAt))}`,
    ),
    ...stored.map((row) => row.fy),
  ]);

  const current = `FY${financialYearLabel(new Date())}`;
  const offered = fyChoices(current, [...taken]);
  if (!offered.includes(String(fy))) {
    return taken.has(String(fy))
      ? { error: "That year is already here." }
      : { error: "That is not a year this folder offers." };
  }

  const anchor = anchorFor(resolved.context);
  const folder = await audited(actor, async (session) => {
    const [row] = await Folder.create(
      [
        {
          name: String(fy).replace(/^FY/, "FY "),
          nameKey: String(fy).toLowerCase(),
          kind: "fy",
          zone: "client",
          anchor,
          parentId: null,
          clientId,
          serviceTemplateId,
          fy: String(fy),
          branchId: resolved.context.branchId || null,
          ancestors: [],
          depth: 0,
          createdBy: actor.id,
          updatedBy: actor.id,
        },
      ],
      { session },
    );
    await recordAudit(
      {
        action: ACTIONS.folderCreate,
        entityType: "Folder",
        entityId: row._id,
        clientId,
        note: `${row.name} on ${resolved.node.label}`,
      },
      session,
    );
    return row;
  });

  revalidatePath("/documents/folders");
  return {
    ok: `${folder.name} added.`,
    href: urlFor({ ...resolved.context, fy: String(fy) }),
  };
}

/** The years a "+ FY Year" button should offer on this service. */
export async function fyOptions(servicePath) {
  const actor = await requireUser();
  await connectDB();

  const { error, resolved } = await nodeFor(actor, servicePath);
  if (error) return { error };
  if (resolved.node.type !== "service" || !resolved.context.clientId) return [];

  const { clientId, serviceTemplateId } = resolved.context;
  const [jobs, stored] = await Promise.all([
    Engagement.find({ clientId, serviceTemplateId })
      .select("periodStart createdAt")
      .lean(),
    Folder.find({ clientId, serviceTemplateId, kind: "fy" })
      .select("fy")
      .lean(),
  ]);

  const taken = [
    ...jobs.map(
      (job) =>
        `FY${financialYearLabel(new Date(job.periodStart ?? job.createdAt))}`,
    ),
    ...stored.map((row) => row.fy),
  ];
  return fyChoices(`FY${financialYearLabel(new Date())}`, taken).map((fy) => ({
    fy,
    label: fy.replace(/^FY/, "FY "),
    segment: fySegment(fy),
  }));
}

/**
 * The files filed under this client, service and year that are on no job.
 *
 * They are **not** attached when a job appears (decision D-F4): papers
 * collected for a year are not automatically the right papers for a
 * particular return, and a system that guesses wrongly is worse than a line
 * of text asking somebody to look.
 */
export async function looseForJob(jobPath) {
  const actor = await requireUser();
  await connectDB();

  const { error, resolved } = await nodeFor(actor, jobPath);
  if (error) return { error };
  if (resolved.node.type !== "engagement") return { ok: true, files: [] };

  const { clientId, serviceTemplateId, fy } = resolved.context;
  const files = await Document.find({
    clientId,
    serviceTemplateId,
    fy,
    engagementId: null,
    isPermanent: { $ne: true },
  })
    .select("name")
    .lean();

  return {
    ok: true,
    files: files.map((d) => ({ id: String(d._id), name: d.name })),
  };
}

/** Those files, put on the job, in one audited write each. */
export async function attachToJob(jobPath, ids = []) {
  const actor = await requireUser();
  await connectDB();

  const { error, resolved } = await nodeFor(actor, jobPath);
  if (error) return { error };
  if (resolved.node.type !== "engagement") {
    return { error: "Files are attached to a job, not to a year." };
  }
  if (!resolved.writeRules.upload) {
    return {
      error: resolved.writeRules.reason || "Nothing can be attached here.",
    };
  }

  const { clientId, serviceTemplateId, fy, engagementId } = resolved.context;
  const wanted = (ids ?? []).map(String);
  const files = await Document.find({
    ...(wanted.length ? { _id: { $in: wanted } } : {}),
    clientId,
    serviceTemplateId,
    fy,
    engagementId: null,
    isPermanent: { $ne: true },
  });
  if (!files.length) return { error: "Nothing is waiting for this job." };

  await audited(actor, async (session) => {
    const live = await Document.find({
      _id: { $in: files.map((f) => f._id) },
    }).session(session);

    for (const document of live) {
      document.engagementId = engagementId;
      document.branchId = resolved.context.branchId || document.branchId;
      document.updatedBy = actor.id;
      await document.save({ session });

      await recordAudit(
        {
          action: ACTIONS.documentMove,
          entityType: "Document",
          entityId: document._id,
          clientId,
          note: `${document.name} → ${resolved.node.label}`,
        },
        session,
      );
    }
  });

  revalidatePath("/documents/folders");
  revalidatePath(`/engagements/${engagementId}`);
  return {
    ok: `${files.length} file${files.length === 1 ? "" : "s"} attached to ${resolved.node.label}.`,
  };
}

// --- finding things -------------------------------------------------------

/**
 * One search across the drive (brief §9.3).
 *
 * It looks for the five things a person actually hunts for — a folder they
 * made, a client, a service, a job, a file — and **groups the answers by
 * what they are**, because "Ryan" matching a client and matching a file are
 * two different answers to one word, and a single ranked list buries one
 * under the other.
 *
 * Every group is scoped before it is matched: the clients are the ones this
 * person may open, and the jobs and files are filtered to those clients.
 * The expression is escaped, so a name with a dot in it is a name and not a
 * wildcard.
 *
 * @param {{ q?: string, under?: string[] }} input `under` searches inside
 *   one path; without it, everywhere this person may look.
 */
export async function searchDrive({ q, under } = {}) {
  const actor = await requireUser();
  await connectDB();

  const needle = String(q ?? "").trim();
  if (needle.length < 2) return { ok: true, q: needle, groups: [] };

  const loose = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const CAP = 50;

  let scope = null;
  if (under?.length) {
    const inside = await nodeFor(actor, under);
    if (inside.error) return { error: inside.error };
    scope = inside.resolved.context;
  }

  const visible = await visibleClientIds(actor);
  const clientFilter = visible ? { _id: { $in: visible } } : {};
  const mine = visible ? { clientId: { $in: visible } } : {};
  const fileScope = {
    ...CLIENT_FILES,
    ...mine,
    ...(scope?.clientId ? { clientId: scope.clientId } : {}),
    ...(scope?.engagementId ? { engagementId: scope.engagementId } : {}),
  };

  const [clients, services, jobs, folders, files] = await Promise.all([
    Client.find({
      ...clientFilter,
      $or: [{ legalName: loose }, { tradeName: loose }, { code: loose }],
    })
      .select("legalName tradeName code")
      .limit(CAP)
      .lean(),
    ServiceTemplate.find({ name: loose }).select("name").limit(CAP).lean(),
    Engagement.find({
      ...mine,
      ...(scope?.clientId ? { clientId: scope.clientId } : {}),
      $or: [{ code: loose }, { "templateSnapshot.name": loose }],
    })
      .select(
        "code clientId serviceTemplateId periodStart periodLabel period templateSnapshot createdAt",
      )
      .limit(CAP)
      .lean(),
    Folder.find({
      name: loose,
      $or: [
        { zone: { $ne: "personal" } },
        { zone: "personal", ownerId: actor.id },
      ],
      ...(scope?.clientId ? { clientId: scope.clientId } : {}),
    })
      .select("name anchor ancestors clientId zone")
      .limit(CAP)
      .lean(),
    Document.find({ ...fileScope, name: loose })
      .select(
        "name clientId engagementId serviceTemplateId fy folderId isPermanent zone",
      )
      .sort({ createdAt: -1 })
      .limit(CAP)
      .lean(),
  ]);

  /** A file's own folder is where "show it to me" has to land. */
  const folderIds = [
    ...new Set(files.map((f) => String(f.folderId ?? "")).filter(Boolean)),
  ];
  const homes = folderIds.length
    ? await Folder.find({ _id: { $in: folderIds } })
        .select("anchor ancestors")
        .lean()
    : [];
  const homeOf = new Map(homes.map((f) => [String(f._id), f]));

  const groups = [
    {
      key: "folders",
      label: "Folders",
      capped: folders.length === CAP,
      rows: folders.map((f) => ({
        id: String(f._id),
        label: f.name,
        href: urlFromAnchor(f.anchor, [...(f.ancestors ?? []), f._id]),
      })),
    },
    {
      key: "clients",
      label: "Clients",
      capped: clients.length === CAP,
      rows: clients.map((c) => ({
        id: String(c._id),
        label: c.tradeName || c.legalName,
        note: c.code,
        href: `/documents/folders/clients/c-${c._id}`,
      })),
    },
    {
      key: "services",
      label: "Services",
      capped: services.length === CAP,
      rows: services.map((s) => ({
        id: String(s._id),
        label: s.name,
        href: `/documents/folders/services/s-${s._id}`,
      })),
    },
    {
      key: "jobs",
      label: "Jobs",
      capped: jobs.length === CAP,
      rows: jobs.map((e) => ({
        id: String(e._id),
        label: jobLabel(e, null),
        note: e.code,
        href: urlFor({
          zone: "client",
          route: "clients",
          clientId: e.clientId,
          serviceTemplateId: e.serviceTemplateId,
          fy: `FY${financialYearLabel(new Date(e.periodStart ?? e.createdAt))}`,
          engagementId: e._id,
        }),
      })),
    },
    {
      key: "files",
      label: "Files",
      capped: files.length === CAP,
      rows: files.map((d) => ({
        id: String(d._id),
        label: d.name,
        href: fileHome(d, homeOf.get(String(d.folderId ?? ""))),
      })),
    },
  ].filter((group) => group.rows.length > 0);

  return { ok: true, q: needle, groups };
}

/** The drive address of a stored folder, from what it hangs under. */
function urlFromAnchor(anchor, chain) {
  return [
    "/documents/folders",
    ...anchorSegments(anchor),
    ...chain.map((id) => `f-${id}`),
  ].join("/");
}

/** Where a file sits: its folder if it is in one, else the node it is on. */
function fileHome(d, folder) {
  if (folder) {
    return urlFromAnchor(folder.anchor, [
      ...(folder.ancestors ?? []),
      d.folderId,
    ]);
  }
  if (d.zone === "firm") return "/documents/folders/hq";
  if (d.zone === "personal") return "/documents/folders/my";
  return urlFor({
    zone: "client",
    route: "clients",
    clientId: d.clientId,
    serviceTemplateId: d.serviceTemplateId,
    fy: d.fy,
    engagementId: d.engagementId,
    permanent: d.isPermanent,
  });
}

/**
 * Where this folder or file may be moved to.
 *
 * Only places the rules would actually accept — the same zone, the same
 * client — so the picker cannot offer what the server is about to refuse.
 * A flat list with its depth rather than an unfolding tree: the list is
 * short, and a tree is a widget to learn before you can file a bank
 * statement.
 *
 * @param {{ folderId?: string, documentId?: string }} what
 */
export async function moveTargets(what = {}) {
  const actor = await requireUser();
  await connectDB();

  const subject = what.folderId
    ? await Folder.findById(what.folderId).lean()
    : what.documentId
      ? await Document.findById(what.documentId).lean()
      : null;
  if (!subject) return { error: "That is no longer here." };

  const zone = subject.zone ?? "client";
  const clientId = subject.clientId ? String(subject.clientId) : null;

  const roots = [];
  if (zone === "personal") {
    roots.push({ path: ["my"], label: "My Docs", depth: 0 });
  } else if (!clientId) {
    roots.push({ path: ["hq"], label: "HQ", depth: 0 });
  } else {
    const client = await Client.findById(clientId)
      .select("legalName tradeName")
      .lean();
    if (!client) return { error: "That client is no longer here." };
    roots.push({
      path: ["clients", `c-${clientId}`],
      label: client.tradeName || client.legalName,
      depth: 0,
    });
  }

  const own = zone === "personal" ? { ownerId: actor.id } : {};
  const folders = await Folder.find({
    zone,
    kind: "custom",
    ...(clientId ? { clientId } : {}),
    ...own,
  })
    .select("name anchor ancestors")
    .sort({ name: 1 })
    .lean();

  const rows = folders
    // never into itself, and never into what it already holds
    .filter(
      (f) =>
        String(f._id) !== String(what.folderId ?? "") &&
        !(f.ancestors ?? []).some(
          (a) => String(a) === String(what.folderId ?? ""),
        ),
    )
    .map((f) => ({
      path: urlFromAnchor(f.anchor, [...(f.ancestors ?? []), f._id])
        .replace("/documents/folders/", "")
        .split("/"),
      label: f.name,
      depth: (f.ancestors ?? []).length + 1,
    }));

  return { ok: true, targets: [...roots, ...rows] };
}

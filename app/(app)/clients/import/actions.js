"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Client from "@/models/Client";
import Branch from "@/models/Branch";
import { audited } from "@/lib/audit/request";
import { encryptField } from "@/lib/crypto";
import { prepareImport } from "@/lib/clients/import";
import { findDuplicates } from "@/lib/clients/duplicates";
import { nextClientCode } from "@/lib/clients/code";

const MAX_BYTES = 2 * 1024 * 1024; // a 2 MB CSV is roughly 10,000 clients
const MAX_ROWS = 5000;

/** The branches this person may import into. */
async function allowedBranches(actor) {
  await connectDB();
  const branches = await Branch.find(
    actor.role === "partner" ? {} : { _id: { $in: actor.branchIds } },
  )
    .select("code")
    .lean();
  return branches.map((b) => ({ id: String(b._id), code: b.code }));
}

/**
 * Step one: read the file and show what would happen. Nothing is written.
 *
 * @returns the rows with their errors, plus clashes against existing clients
 */
export async function previewImport(_prev, formData) {
  const actor = await requireUser();
  assertCan(actor, "edit", "clients");

  const file = formData.get("file");
  if (!file || typeof file === "string" || file.size === 0) {
    return { error: "Choose a CSV file first." };
  }
  if (file.size > MAX_BYTES) {
    return { error: "That file is over 2 MB. Split it and import in parts." };
  }

  const text = await file.text();
  const branches = await allowedBranches(actor);
  const prepared = prepareImport(text, { branches });

  if (prepared.rows.length === 0) {
    return {
      error:
        "No rows found. Check the file has a header row and was saved as CSV UTF-8.",
    };
  }
  if (prepared.rows.length > MAX_ROWS) {
    return {
      error: `That file has ${prepared.rows.length} rows; the limit is ${MAX_ROWS}.`,
    };
  }

  // now check the valid rows against clients that already exist
  for (const row of prepared.rows) {
    if (row.errors.length) continue;
    const { blocking } = await findDuplicates(row.value);
    if (blocking.length) {
      row.errors.push(...blocking.map((d) => d.message));
      row.existing = true;
    }
  }

  return {
    ok: true,
    rows: prepared.rows.map((r) => ({
      line: r.line,
      name: r.name,
      pan: r.value.pan ?? "",
      gstins: (r.value.gstins ?? []).map((g) => g.gstin),
      contacts: (r.value.contacts ?? []).length,
      errors: r.errors,
      existing: Boolean(r.existing),
    })),
    readyCount: prepared.rows.filter((r) => r.errors.length === 0).length,
    errorCount: prepared.rows.filter((r) => r.errors.length > 0).length,
    unknownHeaders: prepared.unknownHeaders,
    // the file is re-read on commit rather than held in memory between calls
    fileName: file.name,
  };
}

/**
 * Step two: write the rows that passed. Rows with errors are skipped and
 * reported, so a 300-row file with 3 bad rows still imports 297.
 *
 * Each client is created in its own transaction with its own audit entry: one
 * giant transaction would hit MongoDB's 16 MB oplog limit on a large file, and
 * a single bad row would roll back the lot.
 */
export async function commitImport(_prev, formData) {
  const actor = await requireUser();
  assertCan(actor, "edit", "clients");

  const file = formData.get("file");
  if (!file || typeof file === "string" || file.size === 0) {
    return { error: "The file is no longer attached. Choose it again." };
  }

  const text = await file.text();
  const branches = await allowedBranches(actor);
  const branchCodeById = new Map(branches.map((b) => [b.id, b.code]));
  const prepared = prepareImport(text, { branches });

  let imported = 0;
  /** @type {string[]} */
  const skipped = [];

  for (const row of prepared.rows) {
    if (row.errors.length) {
      skipped.push(`Row ${row.line} (${row.name}): ${row.errors[0]}`);
      continue;
    }

    const { blocking } = await findDuplicates(row.value);
    if (blocking.length) {
      skipped.push(`Row ${row.line} (${row.name}): ${blocking[0].message}`);
      continue;
    }

    const value = { ...row.value };
    const aadhaar = value.aadhaar;
    delete value.aadhaar;

    try {
      await audited(actor, async (session) => {
        const code = await nextClientCode(
          branchCodeById.get(String(value.branchId)),
          session,
        );
        await Client.create(
          [
            {
              ...value,
              code,
              onboardedOn: new Date(),
              aadhaarEncrypted: aadhaar ? encryptField(aadhaar) : null,
              aadhaarLast4: aadhaar ? aadhaar.slice(-4) : "",
              createdBy: actor.id,
              updatedBy: actor.id,
            },
          ],
          { session },
        );
      });
      imported += 1;
    } catch (err) {
      skipped.push(`Row ${row.line} (${row.name}): ${err.message}`);
    }
  }

  revalidatePath("/clients");
  return {
    ok: `${imported} ${imported === 1 ? "client" : "clients"} imported.`,
    imported,
    skipped,
  };
}

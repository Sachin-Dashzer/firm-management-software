"use server";

import { requireUser } from "@/auth";
import { assertCan, branchFilter } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Engagement from "@/models/Engagement";
import Client from "@/models/Client";
import { CLOSED_STATUSES } from "@/lib/engagements/status";
import { profileSheet } from "@/lib/datalab/profile";
import { runChecks, summaryText, ROLES } from "@/lib/datalab/checks";
import { addEngagementComment } from "../engagements/actions";

/**
 * The data lab (P3-20).
 *
 * **Nothing is stored** (D66). The file is read inside the request, the
 * findings are returned, and the rows are gone when the response ends —
 * a new store of clients' transaction data is not a thing to create for a
 * convenience tool, and spec §1 keeps the accounting ledger out of scope.
 *
 * What can be kept is the *summary*, posted to a job's internal thread, so
 * that a check somebody ran in March is on the record in June.
 */

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 50_000;

/** Anybody who works on engagements may read a client's own spreadsheet. */
async function allowed() {
  const actor = await requireUser();
  assertCan(actor, "view", "engagementsWork");
  return actor;
}

async function readFile(formData) {
  const file = formData.get("file");
  if (!file || typeof file === "string" || file.size === 0) {
    return { error: "Choose a CSV file first." };
  }
  if (file.size > MAX_BYTES) {
    return { error: "That file is over 5 MB. Split it and read it in parts." };
  }
  return { file, text: await file.text() };
}

/** Step one: what is in the file. Nothing is decided about meaning. */
export async function profileUpload(_prev, formData) {
  await allowed();

  const { error, file, text } = await readFile(formData);
  if (error) return { error };

  const profile = profileSheet(text);
  if (profile.rowCount === 0) {
    return {
      error:
        "No rows found. Check the file has a header row and was saved as CSV UTF-8.",
    };
  }
  if (profile.rowCount > MAX_ROWS) {
    return {
      error: `That file has ${profile.rowCount} rows; the limit is ${MAX_ROWS}.`,
    };
  }

  return {
    ok: true,
    fileName: file.name,
    rowCount: profile.rowCount,
    headers: profile.headers,
    columns: profile.columns,
    roles: ROLES,
  };
}

/**
 * Step two: the checks, over the columns a person mapped.
 *
 * The file is read again rather than parked on the server between the two
 * calls — the same stance the import takes, and the reason nothing has to
 * be stored.
 */
export async function analyseUpload(_prev, formData) {
  await allowed();

  const { error, file, text } = await readFile(formData);
  if (error) return { error };

  const profile = profileSheet(text);
  if (profile.rowCount === 0) return { error: "No rows found." };

  /** @type {Record<string, string>} */
  const mapping = {};
  for (const role of ROLES) {
    const value = String(formData.get(`map.${role.key}`) ?? "");
    if (value !== "") mapping[role.key] = value;
  }

  if (Object.keys(mapping).length === 0) {
    return {
      error:
        "Say which column is which first. Nothing is checked until somebody does — a tool that guesses analyses the wrong column with confidence.",
    };
  }

  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "");

  const findings = runChecks(profile.rows, mapping, {
    from: from ? new Date(`${from}T00:00:00+05:30`) : null,
    to: to ? new Date(`${to}T00:00:00+05:30`) : null,
  });

  return {
    ok: true,
    fileName: file.name,
    rowCount: profile.rowCount,
    findings,
    summary: summaryText({
      fileName: file.name,
      rowCount: profile.rowCount,
      columns: profile.columns,
      mapping,
      findings,
      headers: profile.headers,
    }),
  };
}

/** The jobs this person could put the summary on. */
export async function jobsForSummary() {
  const actor = await allowed();
  await connectDB();

  const engagements = await Engagement.find({
    ...(branchFilter(actor, "engagementsWork") ?? {}),
    status: { $nin: CLOSED_STATUSES },
    ...(["employee", "intern"].includes(actor.role)
      ? { $or: [{ assigneeId: actor.id }, { reviewerId: actor.id }] }
      : {}),
  })
    .select("clientId templateSnapshot periodLabel period")
    .sort({ statutoryDue: 1 })
    .limit(200)
    .lean();

  const clients = await Client.find({
    _id: { $in: engagements.map((row) => row.clientId) },
  })
    .select("legalName tradeName")
    .lean();
  const name = new Map(
    clients.map((row) => [String(row._id), row.tradeName || row.legalName]),
  );

  return engagements.map((row) => ({
    id: String(row._id),
    label:
      `${name.get(String(row.clientId)) ?? "A client"} · ${row.templateSnapshot?.name ?? "Work"} ${row.periodLabel || row.period || ""}`.trim(),
  }));
}

/**
 * Put the summary on a job, as an internal note.
 *
 * It goes through `addEngagementComment`, which means the permission check,
 * the audit entry and the internal-only rule are the same ones every other
 * comment gets (P3-17b). The lab adds no second way into an engagement.
 */
export async function postSummary(engagementId, summary) {
  await allowed();

  const text = String(summary ?? "").trim();
  if (text.length < 10) return { error: "There is nothing to post." };

  const formData = new FormData();
  formData.set("body", `Data lab\n\n${text}`);
  formData.set("internal", "on");

  return addEngagementComment(engagementId, formData);
}

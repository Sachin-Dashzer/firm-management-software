// @ts-check

import { connectDB } from "../db.js";
import { can } from "../permissions.js";
import { CLIENT_FILES } from "./zones.js";
import { targetOf } from "./target.js";
import { fileRow, letterRow } from "./rows.js";
import Document from "../../models/Document.js";
import Engagement from "../../models/Engagement.js";
import GeneratedDoc from "../../models/GeneratedDoc.js";
import Sample from "../../models/Sample.js";
import Udin from "../../models/Udin.js";

/**
 * Everything a job has (P3-48b, brief §7).
 *
 * **One function, two screens.** The job's Files tab and the job's folder in
 * the work drive both read this, because "all the files used in this job" is
 * one question and two answers to it is a bug nobody notices until an
 * auditor does: a reviewer who signed off what the Files tab showed, and a
 * drive that shows one more paper.
 *
 * It is four things, and only the first is obvious:
 *
 *  1. the files uploaded against the job, checklist answers included;
 *  2. the letters the firm wrote from its own templates, which are not
 *     files at all — `GeneratedDoc` holds the words and renders the PDF on
 *     demand (P2-8b) — but are certainly documents used in the job;
 *  3. **linked** files, which live somewhere else: a checklist item answered
 *     from the client's permanent file points at the PAN card, and the PAN
 *     card belongs to the client for ever, not to this job. They show with
 *     their origin named, and deleting here would only unlink;
 *  4. the UDIN's papers and the sample vouchers, which hang off the
 *     certificate or the sample row rather than off the job.
 */

/**
 * @param {object} actor
 * @param {string} engagementId
 * @param {{ engagement?: any }} [loaded] the job, when the caller already
 *   has it — the engagement page reads it in its own `Promise.all`, and
 *   loading it twice to answer the same question is a round trip for nothing
 */
export async function filesForEngagement(actor, engagementId, loaded = {}) {
  await connectDB();

  /**
   * A job handed in without its checklist is a job whose linked papers
   * would quietly vanish — the checklist is where "this item is answered by
   * the client's PAN card" is written. So a thin one is re-read rather than
   * trusted.
   */
  const given = Array.isArray(loaded.engagement?.checklist)
    ? loaded.engagement
    : null;
  const engagement =
    given ??
    (await Engagement.findById(loaded.engagement?._id ?? engagementId)
      .select(
        "clientId branchId assigneeId reviewerId status checklist udin templateSnapshot",
      )
      .lean());
  if (!engagement) return { error: "That job no longer exists." };

  const target = await targetOf(actor, engagement, null, engagement.clientId);
  if (!can(actor, "view", "documents", target)) {
    return { error: "You cannot see this job's files." };
  }

  const id = engagement._id ?? engagementId;

  /** Ids the checklist points at, which may or may not be on this job. */
  const linkedIds = [
    ...new Set(
      (engagement.checklist ?? [])
        .flatMap((item) => item.documentIds ?? [])
        .map(String),
    ),
  ];

  const [own, linked, udins, samples, letters] = await Promise.all([
    Document.find({ engagementId: id, ...CLIENT_FILES })
      .sort({ createdAt: -1 })
      .lean(),
    linkedIds.length
      ? Document.find({
          _id: { $in: linkedIds },
          engagementId: { $ne: id },
          ...CLIENT_FILES,
        }).lean()
      : [],
    Udin.find({ engagementId: id }).select("_id number").lean(),
    Sample.find({ engagementId: id }).select("items._id").lean(),
    can(actor, "view", "docGenerate", target)
      ? GeneratedDoc.find({ engagementId: id })
          .sort({ createdAt: -1 })
          .limit(50)
          .lean()
      : [],
  ]);

  const [udinPapers, vouchers] = await Promise.all([
    udins.length
      ? Document.find({
          udinId: { $in: udins.map((u) => u._id) },
          engagementId: { $ne: id },
          ...CLIENT_FILES,
        }).lean()
      : [],
    samples.length
      ? Document.find({
          sampleItemId: {
            $in: samples.flatMap((s) => (s.items ?? []).map((i) => i._id)),
          },
          engagementId: { $ne: id },
          ...CLIENT_FILES,
        }).lean()
      : [],
  ]);

  return {
    ok: true,
    files: own.map((d) => fileRow(d)),
    linked: linked.map((d) =>
      fileRow(d, {
        linked: true,
        from: d.isPermanent ? "From the permanent file" : "Filed elsewhere",
      }),
    ),
    udin: udinPapers.map((d) => fileRow(d, { from: "UDIN paper" })),
    samples: vouchers.map((d) => fileRow(d, { from: "Sample voucher" })),
    letters: letters.map((d) => letterRow(d, actor)),
  };
}

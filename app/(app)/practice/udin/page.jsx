import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, branchFilter } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Udin from "@/models/Udin";
import Client from "@/models/Client";
import Engagement from "@/models/Engagement";
import User from "@/models/User";
import Document from "@/models/Document";
import { formatISTDate, financialYearStart, istDate } from "@/lib/dates";
import UdinRegister from "./UdinRegister";

export const metadata = { title: "UDIN register · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Everything the firm has signed (P2-7).
 *
 * Spec section 16 wants a UDIN against every certificate, audit report and
 * attestation. Before this register there was one free-text field on an
 * engagement: the same number could be typed against two jobs, a certificate
 * issued outside any engagement had nowhere to live, and "what have we signed
 * this year" had no answer.
 *
 * One financial year at a time, newest first.
 */
export default async function UdinPage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "udin")) redirect("/today");

  const params = (await searchParams) ?? {};
  const thisYear = financialYearStart(new Date());
  const asked = Number(params.fy);
  const fyStart =
    Number.isInteger(asked) && asked >= thisYear - 6 && asked <= thisYear
      ? asked
      : thisYear;

  const mayEdit = can(actor, "edit", "udin");

  await connectDB();

  const scope = branchFilter(actor, "udin") ?? {};
  /** Which partner or CA signed it — the register's main question (P2-7). */
  const member = typeof params.member === "string" ? params.member : "";

  const rows = await Udin.find({
    ...scope,
    ...(member ? { memberId: member } : {}),
    generatedOn: {
      $gte: istDate(fyStart, 4, 1),
      $lt: istDate(fyStart + 1, 4, 1),
    },
  })
    .sort({ generatedOn: -1 })
    .limit(1000)
    .lean();

  const [clients, engagements, members, files] = await Promise.all([
    Client.find({ _id: { $in: rows.map((r) => r.clientId) } })
      .select("legalName tradeName code")
      .lean(),
    Engagement.find({
      _id: { $in: rows.map((r) => r.engagementId).filter(Boolean) },
    })
      .select("code periodLabel period templateSnapshot.name")
      .lean(),
    User.find({ _id: { $in: rows.map((r) => r.memberId).filter(Boolean) } })
      .select("name role")
      .lean(),
    // how many papers each certificate carries, so the row says whether
    // there is anything to open before anybody opens it
    Document.find({ udinId: { $in: rows.map((r) => r._id) } })
      .select("udinId")
      .lean(),
  ]);

  const clientName = new Map(
    clients.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );
  const engagementById = new Map(engagements.map((e) => [String(e._id), e]));
  const memberById = new Map(members.map((m) => [String(m._id), m]));

  const fileCount = new Map();
  for (const file of files) {
    const key = String(file.udinId);
    fileCount.set(key, (fileCount.get(key) ?? 0) + 1);
  }

  const view = rows.map((row) => {
    const engagement = row.engagementId
      ? engagementById.get(String(row.engagementId))
      : null;
    return {
      id: String(row._id),
      udin: row.udin,
      client: clientName.get(String(row.clientId)) ?? "A client",
      clientId: String(row.clientId),
      engagementId: row.engagementId ? String(row.engagementId) : "",
      engagement: engagement
        ? `${engagement.templateSnapshot?.name ?? "Work"} · ${
            engagement.periodLabel || engagement.period
          }`
        : "",
      documentType: row.documentType,
      generatedOn: formatISTDate(row.generatedOn),
      member: row.memberId
        ? (memberById.get(String(row.memberId))?.name ?? "")
        : "",
      memberRole: row.memberId
        ? (memberById.get(String(row.memberId))?.role ?? "")
        : "",
      membershipNo: row.membershipNo ?? "",
      files: fileCount.get(String(row._id)) ?? 0,
      revoked: Boolean(row.revokedAt),
      revokedOn: row.revokedAt ? formatISTDate(row.revokedAt) : "",
      revokeReason: row.revokeReason ?? "",
      note: row.note ?? "",
    };
  });

  /**
   * Who can be named as the signing member: the firm's own CAs and partners
   * (owner decision, 24-10-2026). A UDIN is generated against a member's own
   * ICAI membership, so only somebody who has one can be named — and from
   * today one must be, which is what makes "which partner signed this" a
   * question the register can always answer.
   *
   * The list is loaded whether or not this person may edit, because it is
   * also the filter at the top of the register.
   */
  const signers = await User.find({
    active: true,
    role: { $in: ["ca", "partner"] },
  })
    .select("name role icai")
    .sort({ role: 1, name: 1 })
    .lean();

  const choices = mayEdit
    ? await Client.find({
        ...(branchFilter(actor, "clients") ?? {}),
        status: { $ne: "Closed" },
      })
        .select("legalName tradeName code")
        .sort({ legalName: 1 })
        .limit(1000)
        .lean()
    : [];

  return (
    <UdinRegister
      rows={view}
      fyStart={fyStart}
      years={[thisYear, thisYear - 1, thisYear - 2]}
      mayEdit={mayEdit}
      clients={choices.map((c) => ({
        id: String(c._id),
        name: `${c.tradeName || c.legalName} · ${c.code}`,
      }))}
      members={signers.map((m) => ({
        id: String(m._id),
        name: m.name,
        role: m.role === "partner" ? "Partner" : "CA",
        label: `${m.name} · ${m.role === "partner" ? "Partner" : "CA"} · ${
          m.icai?.membershipNo || "no membership number recorded"
        }`,
      }))}
      member={member}
      mayUpload={can(actor, "edit", "documents")}
    />
  );
}

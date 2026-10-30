import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Client from "@/models/Client";
import Branch from "@/models/Branch";
import User from "@/models/User";
import ClientGroup from "@/models/ClientGroup";
import { financialYearStart } from "@/lib/dates";
import { clientListFilter } from "@/lib/access/clientAccess";
import { clientIdsInGroup } from "@/lib/groups/summary";
import { loadHeads } from "@/lib/compliance/headsQuery";
import { frequencySummary } from "@/lib/compliance/heads";
import ComplianceScreen from "./screen";
import Overview from "./Overview";

export const metadata = { title: "Compliance · PHMG" };
export const dynamic = "force-dynamic";

/**
 * Where the firm stands on every head of compliance (P3-34 phase 4).
 *
 * The screen the reference opens on, and the one a partner wants before
 * they want to know which client missed August: four summary cards, the
 * count of periods **nobody opened a job for at all**, and one line per
 * head under the category it belongs to.
 *
 * `?view=next30` hands over to the older screen's list view, which is the
 * same rows in date order. It is a third view of one question rather than
 * a second page.
 */
export default async function CompliancePage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "engagementsWork")) redirect("/issues");

  const params = (await searchParams) ?? {};

  if (params.view === "next30") {
    return <ComplianceScreen params={params} force={{ view: "calendar" }} />;
  }

  await connectDB();

  const now = new Date();
  const fy = Number(params.fy) || financialYearStart(now);

  const [branches, partners, groups] = await Promise.all([
    Branch.find(
      actor.role === "partner" ? {} : { _id: { $in: actor.branchIds } },
    )
      .select("code name")
      .sort({ code: 1 })
      .lean(),
    User.find({ active: true, role: { $in: ["ca", "partner"] } })
      .select("name role")
      .sort({ name: 1 })
      .lean(),
    ClientGroup.find({}).select("name").sort({ name: 1 }).lean(),
  ]);

  /**
   * Every filter narrows to a set of client ids **inside** the person's
   * scope, and never widens it. `clientListFilter` is applied first in all
   * three cases, so a hand-typed group id or partner id can only ever see
   * fewer clients than the role already allows.
   */
  const clientIds = await narrow(actor, params);

  const heads = await loadHeads(actor, { fy, clientIds, now });
  const summary = frequencySummary(heads);

  return (
    <Overview
      heads={heads}
      summary={summary}
      fy={fy}
      fyLabel={fyLabelOf(fy)}
      params={Object.fromEntries(
        Object.entries(params).filter(([, value]) => typeof value === "string"),
      )}
      branches={branches.map((b) => ({ id: String(b._id), name: b.name }))}
      partners={partners.map((u) => ({
        id: String(u._id),
        name: `${u.name} · ${u.role === "partner" ? "Partner" : "CA"}`,
      }))}
      groups={groups.map((g) => ({ id: String(g._id), name: g.name }))}
    />
  );
}

/** "2026-27", from the year the financial year starts in. */
function fyLabelOf(fy) {
  return `${fy}-${String((fy + 1) % 100).padStart(2, "0")}`;
}

/**
 * The filter bar, resolved to client ids — or null when nothing narrows
 * it, which is not the same as an empty list. An empty list must match
 * nothing; null must match everything in scope.
 */
async function narrow(actor, params) {
  const scope = await clientListFilter(actor);
  /** @type {Array<Record<string, any>>} */
  const conditions = [];

  if (typeof params.branch === "string" && params.branch) {
    conditions.push({ branchId: params.branch });
  }
  if (typeof params.partner === "string" && params.partner) {
    conditions.push({ clientPartnerId: params.partner });
  }
  if (typeof params.client === "string" && params.client.trim()) {
    const term = params.client.trim();
    const like = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    conditions.push({
      $or: [
        { legalName: like },
        { tradeName: like },
        { code: like },
        { pan: like },
        { "gstins.gstin": like },
      ],
    });
  }

  let groupIds = null;
  if (typeof params.group === "string" && params.group) {
    groupIds = await clientIdsInGroup(actor, params.group);
  }

  if (conditions.length === 0) return groupIds;

  const rows = await Client.find({ ...scope, $and: conditions })
    .select("_id")
    .limit(5000)
    .lean();
  const ids = rows.map((row) => String(row._id));

  // two filters narrow together: the intersection, never the union
  if (!groupIds) return ids;
  const inGroup = new Set(groupIds.map(String));
  return ids.filter((id) => inGroup.has(id));
}

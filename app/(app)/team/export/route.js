import { headers } from "next/headers";
import { requireUser } from "@/auth";
import { branchFilter, can, scopeOf, ROLE_LABELS } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import Branch from "@/models/Branch";
import Engagement from "@/models/Engagement";
import { loadForEach } from "@/lib/team/workload";
import { buildWorkbook, xlsxResponse } from "@/lib/excel";
import {
  withAudit,
  recordAudit,
  ACTIONS,
  withAuditContext,
  contextFromRequest,
} from "@/lib/audit";

/**
 * The team as a spreadsheet (spec section 14: export on every list).
 *
 * No email addresses beyond the work ones and no mobile numbers of people the
 * reader could not already see on screen — it carries exactly what `/team`
 * shows, scoped the same way, and the download is audited like every other
 * export (spec section 11).
 */

export const dynamic = "force-dynamic";

export async function GET(request) {
  const actor = await requireUser();
  if (!can(actor, "view", "team")) {
    return new Response("Not allowed", { status: 403 });
  }
  // `view/own` is one record; a spreadsheet of yourself is not an export
  if (scopeOf(actor, "team") === "own") {
    return new Response("Not allowed", { status: 403 });
  }

  await connectDB();
  const url = new URL(request.url);

  /** @type {Record<string, any>} */
  const query = {};
  if (branchFilter(actor, "team")) query.branchIds = { $in: actor.branchIds };
  const wantBranch = url.searchParams.get("branch");
  if (wantBranch) query.branchIds = { $in: [wantBranch] };
  const wantRole = url.searchParams.get("role");
  if (wantRole) query.role = wantRole;
  if (url.searchParams.get("inactive") !== "1") query.active = true;

  const [people, branches] = await Promise.all([
    User.find(query).sort({ role: 1, name: 1 }).limit(2000).lean(),
    Branch.find({}).select("code").lean(),
  ]);
  const branchCode = new Map(branches.map((b) => [String(b._id), b.code]));

  const ids = people.map((p) => String(p._id));
  const engagements = await Engagement.find({
    $or: [{ assigneeId: { $in: ids } }, { reviewerId: { $in: ids } }],
  })
    .select("status statutoryDue internalDue assigneeId reviewerId reworkCount")
    .limit(20000)
    .lean();
  const load = loadForEach(engagements, ids);

  const seniors = await User.find({
    _id: { $in: people.map((p) => p.reportingTo).filter(Boolean) },
  })
    .select("name")
    .lean();
  const seniorName = new Map(seniors.map((s) => [String(s._id), s.name]));

  const rows = people.map((person) => {
    const figures = load.get(String(person._id));
    return {
      name: person.name,
      role: ROLE_LABELS[person.role] ?? person.role,
      email: person.email,
      mobile: person.mobile ?? "",
      offices: (person.branchIds ?? [])
        .map((id) => branchCode.get(String(id)) ?? "?")
        .join(" "),
      reportsTo: person.reportingTo
        ? (seniorName.get(String(person.reportingTo)) ?? "")
        : "",
      joined: person.joiningDate ?? null,
      capacity: person.capacityHours ?? 8,
      open: figures?.asAssignee ?? 0,
      overdue: figures?.overdue ?? 0,
      toReview: figures?.awaitingMyReview ?? 0,
      reworked: figures?.reworked ?? 0,
      twoFactor: person.totpEnabledAt ? "On" : "Not yet",
      active: person.active === false ? "Left" : "Here",
    };
  });

  const buffer = await buildWorkbook([
    {
      name: "Team",
      title: "PHMG & Associates — team",
      columns: [
        { header: "Name", key: "name", width: 26 },
        { header: "Role", key: "role", width: 18 },
        { header: "Email", key: "email", width: 30 },
        { header: "Mobile", key: "mobile", width: 14 },
        { header: "Offices", key: "offices", width: 14 },
        { header: "Reports to", key: "reportsTo", width: 24 },
        { header: "Joined", key: "joined", width: 14, kind: "date" },
        { header: "Capacity (h/day)", key: "capacity", width: 16 },
        { header: "Open work", key: "open", width: 12 },
        { header: "Overdue", key: "overdue", width: 12 },
        { header: "Awaiting their review", key: "toReview", width: 20 },
        { header: "Returned for rework", key: "reworked", width: 20 },
        { header: "2FA", key: "twoFactor", width: 10 },
        { header: "Status", key: "active", width: 10 },
      ],
      rows,
    },
  ]);

  await withAuditContext(
    contextFromRequest(actor, await headers()),
    async () => {
      await withAudit((session) =>
        recordAudit(
          {
            action: ACTIONS.export,
            entityType: "User",
            entityId: actor.id,
            note: `exported the team list: ${rows.length} people`,
          },
          session,
        ),
      );
    },
  );

  return xlsxResponse(buffer, "phmg-team");
}

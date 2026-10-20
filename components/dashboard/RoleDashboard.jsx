import Branch from "@/models/Branch";
import User from "@/models/User";
import Engagement from "@/models/Engagement";
import { can, branchFilter } from "@/lib/permissions";
import { engagementQuery } from "@/lib/engagements/filter";
import {
  workTiles,
  byBranch,
  unbilled,
  receivables,
  collections,
  revenueByCategory,
  reworkRate,
  paymentsToday,
  tdsPending,
  dscExpiringTile,
} from "@/lib/reports/figures";
import { deadlineTerrain } from "@/lib/reports/terrain";
import FirmOverview from "./FirmOverview";
import ReviewQueue from "./ReviewQueue";
import BillingBoard from "./BillingBoard";

/**
 * The dashboard the signed-in role needs (spec section 10), fetched on the
 * server and chosen here so `/today` stays one page rather than four.
 *
 * Everything it shows is already scoped by `engagementQuery` and
 * `branchFilter`, so a CA in Ludhiana sees Ludhiana's figures without this
 * file knowing anything about branches. An accounts person who is also
 * allowed to see work gets both boards, in the order their job runs.
 */
export default async function RoleDashboard({ actor, now }) {
  const role = actor.role;

  const seesWork = can(actor, "view", "engagementsWork");
  const seesMoney = can(actor, "view", "invoices");

  // a partner's overview, a CA's review queue, an accounts billing board
  const wantsFirm = role === "partner" && seesWork;
  const wantsReview = role === "ca" && seesWork;
  const wantsBilling = (role === "accounts" || role === "partner") && seesMoney;

  if (!wantsFirm && !wantsReview && !wantsBilling) return null;

  /**
   * A certificate about to lapse belongs on the dashboard of whoever would
   * make the call (P2-7). It is `null` when there is nothing expiring, so
   * the row carries no permanent zero.
   */
  const dsc =
    (wantsFirm || wantsReview) && can(actor, "view", "dsc")
      ? await dscExpiringTile(actor, now)
      : null;

  const [tiles, money] = await Promise.all([
    wantsFirm
      ? workTiles(actor)
      : wantsReview
        ? reviewTiles(actor)
        : Promise.resolve([]),
    wantsBilling
      ? Promise.all([
          unbilled(actor),
          receivables(actor, now),
          collections(actor, now),
          paymentsToday(actor, now),
          tdsPending(actor),
        ])
      : Promise.resolve(null),
  ]);

  if (wantsFirm) {
    const [unbilledTotal, owed, collected] = money ?? [];
    const [branches, revenue, pending] = await Promise.all([
      Branch.find({}).select("code name").sort({ code: 1 }).lean(),
      revenueByCategory(actor, now),
      pendingDocumentCount(actor),
    ]);

    return (
      <FirmOverview
        tiles={dsc ? [...tiles, dsc] : tiles}
        branches={await byBranch(actor, branches)}
        unbilled={unbilledTotal}
        receivables={owed}
        collections={collected}
        revenue={revenue}
        pendingDocuments={pending}
        terrain={await deadlineTerrain(actor, branches, { now })}
      />
    );
  }

  if (wantsReview) {
    const rework = await reworkRate(actor, now);
    const people = await User.find({
      _id: { $in: rework.map((row) => row.id) },
    })
      .select("name")
      .lean();

    return (
      <ReviewQueue
        tiles={dsc ? [...tiles, dsc] : tiles}
        rework={rework.slice(0, 10)}
        people={Object.fromEntries(people.map((u) => [String(u._id), u.name]))}
      />
    );
  }

  const [unbilledTotal, owed, , collectedToday, tds] = money ?? [];
  return (
    <BillingBoard
      unbilled={unbilledTotal}
      receivables={owed}
      paymentsToday={collectedToday}
      tds={tds}
    />
  );
}

/** The CA's queue: what is on me, and what my branch is late on. */
async function reviewTiles(actor) {
  const [mine, overdue, review] = await Promise.all([
    Engagement.countDocuments(
      engagementQuery(actor, { status: "Under review", mine: "1" }),
    ),
    Engagement.countDocuments(engagementQuery(actor, { due: "overdue" })),
    Engagement.countDocuments(
      engagementQuery(actor, { status: "Under review" }),
    ),
  ]);

  return [
    {
      label: "Waiting for me",
      value: mine,
      href: "/engagements?status=Under+review&mine=1",
      tone: "soon",
    },
    {
      label: "Under review, anyone",
      value: review,
      href: "/engagements?status=Under+review",
    },
    {
      label: "Overdue in my scope",
      value: overdue,
      href: "/engagements?due=overdue",
      tone: "late",
    },
  ];
}

/**
 * Jobs held up waiting for a client's documents. Counted with the same
 * condition the pending-documents report uses, so the two agree.
 */
async function pendingDocumentCount(actor) {
  const query = {
    ...(branchFilter(actor, "documents") ?? {}),
    status: { $nin: ["Completed", "Cancelled"] },
    checklist: {
      $elemMatch: {
        side: "client",
        status: { $in: ["Pending", "Requested"] },
        mandatory: true,
      },
    },
  };

  return {
    value: await Engagement.countDocuments(query),
    href: "/reports/pending-documents",
  };
}

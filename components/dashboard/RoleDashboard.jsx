import Branch from "@/models/Branch";
import { can } from "@/lib/permissions";
import {
  unbilled,
  receivables,
  collections,
  paymentsToday,
  tdsPending,
} from "@/lib/reports/figures";
import { firmDashboard } from "@/lib/reports/dashboard";
import { viewBranch, viewIsMine } from "@/lib/access/view";
import FirmDashboard from "./firm/FirmDashboard";
import BillingBoard from "./BillingBoard";

/**
 * Which board a person gets.
 *
 * From P3-34 phase 3 there are two, not three. A CA used to get a queue of
 * their own — three tiles and a rework table — and a partner got the firm
 * overview. They were two answers to one question, and the CA's was the
 * thinner one: it could not tell them what fell due next week or who on
 * their branch was over the limit. Both now get `FirmDashboard`, and
 * `firmDashboard()` simply never fetches what `can()` would refuse, so the
 * CA's copy has no Money band and no Branches table rather than a hole
 * where they would be.
 *
 * Exported because `/dashboard` has to know whether there is anything to
 * draw *before* it draws the heading (P3-22b) — an employee has no board,
 * and a heading over nothing is the page lying about itself.
 *
 * @param {import("@/lib/permissions").Actor} actor
 */
export function dashboardsFor(actor) {
  const role = actor.role;
  const seesWork = can(actor, "view", "engagementsWork");
  const seesMoney = can(actor, "view", "invoices");

  return {
    firm: (role === "partner" || role === "ca") && seesWork,
    billing: role === "accounts" && seesMoney,
  };
}

/** @param {import("@/lib/permissions").Actor} actor */
export function hasRoleDashboard(actor) {
  return Object.values(dashboardsFor(actor)).some(Boolean);
}

/**
 * The dashboard the signed-in role needs, fetched on the server and chosen
 * here so `/dashboard` stays one page rather than four.
 *
 * Everything it shows is already scoped by `engagementQuery` and
 * `branchFilter`, so a CA in Ludhiana sees Ludhiana's figures without this
 * file knowing anything about branches.
 */
export default async function RoleDashboard({ actor, now }) {
  const { firm: wantsFirm, billing: wantsBilling } = dashboardsFor(actor);

  if (!wantsFirm && !wantsBilling) return null;

  if (wantsFirm) {
    const [data, branches] = await Promise.all([
      firmDashboard(actor, now),
      Branch.find(
        actor.role === "partner" ? {} : { _id: { $in: actor.branchIds } },
      )
        .select("name")
        .lean(),
    ]);

    return (
      <FirmDashboard
        data={data}
        user={{ name: actor.name }}
        now={now}
        branchNote={branchNoteFor(actor, branches)}
      />
    );
  }

  const [unbilledTotal, owed, collectedToday, tds] = await Promise.all([
    unbilled(actor),
    receivables(actor, now),
    paymentsToday(actor, now),
    tdsPending(actor),
  ]);

  return (
    <BillingBoard
      unbilled={unbilledTotal}
      receivables={owed}
      paymentsToday={collectedToday}
      tds={tds}
    />
  );
}

/**
 * "all 4 branches", the branch's own name, or "your own work" — whichever
 * the view cookie says, so the line under the greeting agrees with what
 * the figures were actually counted over (P3-7).
 */
function branchNoteFor(actor, branches) {
  if (viewIsMine(actor.view)) return "your own work";

  const one = viewBranch(actor.view);
  if (one) {
    const branch = branches.find((row) => String(row._id) === one);
    if (branch) return branch.name;
  }

  if (branches.length === 1) return branches[0].name;
  return `all ${branches.length} branches`;
}

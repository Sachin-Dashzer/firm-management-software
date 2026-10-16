import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import Branch from "@/models/Branch";
import { formatISTDate } from "@/lib/dates";
import UserAdmin from "./UserAdmin";

export const metadata = { title: "Users · PHMG" };

/**
 * Partner-only screen. The check here stops the page rendering; the same check
 * runs again inside every action in actions.js, because this one only protects
 * the view.
 */
export default async function UsersPage() {
  const actor = await requireUser();
  if (!can(actor, "edit", "usersSettings")) redirect("/today");

  await connectDB();
  const [users, branches] = await Promise.all([
    User.find({}).sort({ name: 1 }).lean(),
    Branch.find({}).sort({ code: 1 }).lean(),
  ]);

  const branchName = new Map(branches.map((b) => [String(b._id), b.code]));

  const rows = users.map((u) => ({
    id: String(u._id),
    name: u.name,
    email: u.email,
    mobile: u.mobile,
    role: u.role,
    roleLabel: ROLE_LABELS[u.role] ?? u.role,
    branches: (u.branchIds ?? []).map(
      (id) => branchName.get(String(id)) ?? "?",
    ),
    active: u.active,
    twoFactor: Boolean(u.totpEnabledAt),
    lastLogin: u.lastLoginAt ? formatISTDate(new Date(u.lastLoginAt)) : "—",
    isSelf: String(u._id) === actor.id,
  }));

  return (
    <UserAdmin
      rows={rows}
      branches={branches.map((b) => ({
        id: String(b._id),
        code: b.code,
        name: b.name,
      }))}
      colleagues={rows
        .filter((r) => r.role === "ca" || r.role === "partner")
        .map((r) => ({ id: r.id, name: r.name }))}
    />
  );
}

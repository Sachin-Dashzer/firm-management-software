import { redirect } from "next/navigation";
import { currentUser } from "@/auth";
import { connectDB } from "@/lib/db";
import Branch from "@/models/Branch";
import LeftRail, { MobileNav } from "@/components/shell/LeftRail";
import TopBar from "@/components/shell/TopBar";

/**
 * Every page in here depends on who is signed in, so none of them may be
 * prerendered at build time — a prerender would bake in the signed-out
 * redirect and send signed-in users to the login page.
 */
export const dynamic = "force-dynamic";

/**
 * Everything inside this layout needs a session. Middleware already turns away
 * requests without a session cookie; this second check covers a cookie that is
 * present but no longer valid, and gives the pages below a real user.
 */
export default async function AppLayout({ children }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  await connectDB();
  // a user only ever sees their own branches in the switcher (spec section 2)
  const branches = await Branch.find(
    user.role === "partner" ? {} : { _id: { $in: user.branchIds } },
  )
    .sort({ code: 1 })
    .lean();

  return (
    <div className="flex h-dvh flex-col">
      <div className="flex min-h-0 flex-1">
        <LeftRail role={user.role} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            user={{ name: user.name, email: user.email, role: user.role }}
            branches={branches.map((b) => ({
              id: String(b._id),
              code: b.code,
              name: b.name,
            }))}
          />
          <main className="relative z-10 min-h-0 flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
      <MobileNav role={user.role} />
    </div>
  );
}

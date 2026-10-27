import { redirect } from "next/navigation";
import { currentUser } from "@/auth";
import ChangePasswordForm from "./ChangePasswordForm";

export const metadata = { title: "Change your password · PHMG" };
export const dynamic = "force-dynamic";

/**
 * The forced password change.
 *
 * It lives outside the `(app)` layout on purpose. That layout redirects here
 * whenever `mustChangePassword` is set, and a screen inside the thing it is
 * protecting would need the layout to know which page it was rendering just
 * to avoid redirecting to itself. Out here there is nothing to loop on.
 *
 * No rail, no top bar, no command bar: there is one thing to do.
 */
export default async function ChangePasswordPage({ searchParams }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const forced = user.mustChangePassword;
  const voluntary = (await searchParams)?.from === "me";

  // somebody who wandered here with nothing to change goes back to their page
  if (!forced && !voluntary) redirect("/me");

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-sm">
        <p className="text-13 text-ink-muted font-mono">
          PHMG &amp; Associates
        </p>
        <h1 className="font-display text-24 mt-1 font-bold tracking-tight">
          {forced ? "Set your own password" : "Change your password"}
        </h1>
        <p className="text-14 text-ink-muted mt-2">
          {forced
            ? "The password you were given is temporary. Choose one only you know before going any further."
            : "You will stay signed in on this device."}
        </p>

        <div className="mt-6">
          <ChangePasswordForm forced={forced} />
        </div>
      </div>
    </main>
  );
}

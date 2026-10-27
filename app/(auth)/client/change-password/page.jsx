import { redirect } from "next/navigation";
import { currentClientUser } from "@/auth";
import { firmProfile } from "@/lib/firm/settings";
import ClientPasswordForm from "./ClientPasswordForm";

export const metadata = { title: "Change your password" };
export const dynamic = "force-dynamic";

/**
 * The portal's forced password change (P2-9a).
 *
 * Outside the `(client)` layout for the same reason the staff one is
 * outside `(app)`: the layout redirects here whenever
 * `mustChangePassword` is set, and a screen inside the thing it protects
 * would have to know which page it was rendering to avoid looping.
 */
export default async function ClientChangePasswordPage({ searchParams }) {
  const person = await currentClientUser();
  if (!person) redirect("/client/login");

  const forced = person.mustChangePassword;
  const voluntary = (await searchParams)?.from === "portal";
  if (!forced && !voluntary) redirect("/client");

  const firm = await firmProfile();

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-sm">
        <p className="text-13 text-ink-muted font-mono">{firm.name}</p>
        <h1 className="font-display text-24 mt-1 font-bold tracking-tight">
          {forced ? "Set your own password" : "Change your password"}
        </h1>
        <p className="text-14 text-ink-muted mt-2">
          {forced
            ? "The password the office gave you is temporary. Choose one only you know before going any further."
            : "You will stay signed in on this device."}
        </p>

        <div className="mt-6">
          <ClientPasswordForm forced={forced} />
        </div>
      </div>
    </main>
  );
}

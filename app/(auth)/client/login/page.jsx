import { Suspense } from "react";
import { firmProfile } from "@/lib/firm/settings";
import ClientLoginForm from "./ClientLoginForm";

export const metadata = { title: "Client portal · Sign in" };
export const dynamic = "force-dynamic";

/**
 * The client portal's front door (P2-9a, owner decision D10).
 *
 * One column, no scene, no mention of the practice management system. It
 * carries the firm's own name from `FirmSettings` (P2-6) rather than a
 * literal, because this is the page a client will see most often and the
 * first one that would look wrong if the firm were ever renamed.
 */
export default async function ClientLoginPage() {
  const firm = await firmProfile();

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Suspense fallback={null}>
        <ClientLoginForm firmName={firm.name} />
      </Suspense>
    </main>
  );
}

import { Suspense } from "react";
import LoginForm from "./LoginForm";

export const metadata = { title: "Sign in · PHMG" };

/**
 * The branch-constellation 3D scene belongs on this screen (spec section 15)
 * and arrives in Step 11. It will be loaded with next/dynamic and never block
 * this form, which is why the form is a standalone component already.
 */
export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="rounded-ledger border-rule bg-surface w-full max-w-sm border p-6 shadow-none">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}

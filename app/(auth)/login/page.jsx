import { Suspense } from "react";
import LoginForm from "./LoginForm";
import BranchScene from "@/components/login/BranchScene";

export const metadata = { title: "Sign in · PHMG" };

/**
 * The sign-in screen (spec section 15, branch constellation).
 *
 * Two panels on a laptop, one column on a phone, and the order matters:
 * the form is first in the document, so it is what a keyboard and a
 * screen reader reach first and what renders first. The scene is scenery
 * — it decides for itself whether this device should see the 3D version
 * (spec section 15's rules for 3D), and it can take as long as it likes.
 */
export default function LoginPage() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_minmax(26rem,0.9fr)]">
      <div className="order-2 flex items-center justify-center p-6 lg:order-1 lg:p-10">
        {/* the scene sits in a ruled frame, like a plate in a report */}
        <div className="border-rule relative aspect-[4/3] w-full max-w-2xl border-y lg:border">
          <BranchScene />
        </div>
      </div>

      <div className="order-1 flex items-center justify-center p-6 lg:order-2 lg:p-10">
        <div className="w-full max-w-sm">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

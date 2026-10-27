import { Suspense } from "react";
import LoginForm from "./LoginForm";
import BranchScene from "@/components/login/BranchScene";

export const metadata = { title: "Sign in · PHMG" };

/**
 * The sign-in screen.
 *
 * The form is first in the document, so it is what a keyboard and a screen
 * reader reach first and what renders first.
 *
 * The branch constellation of spec §15 is the first of the eight signature
 * moments, and like the other seven it is **off unless somebody turns the
 * flourishes on** (P3-21b, D52): the prototype's sign-in is a form on a
 * plain ground and nothing else. It is switched at the root with CSS rather
 * than removed, so the scene is still built, still has its no-WebGL
 * fallback, and comes back with one click.
 *
 * It is laid out as a centred column, with the scene as a band above the
 * form rather than a panel beside it. Seen rendered for the first time, the
 * two-panel version left a quarter of the screen empty under both halves,
 * and the sign-in is one small form: a column is what it is.
 */
export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6">
      {/* the scene sits in a ruled frame, like a plate in a report */}
      <div className="moments-only w-full max-w-2xl">
        <div className="border-rule relative aspect-[16/7] w-full border">
          <BranchScene />
        </div>
      </div>

      <div className="w-full max-w-sm">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}

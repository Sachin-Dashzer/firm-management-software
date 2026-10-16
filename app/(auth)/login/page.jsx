export const metadata = { title: "Sign in · PHMG" };

/* The real form, TOTP 2FA and the branch-constellation scene are Step 1 and
   Step 11. This route exists so the (auth) segment and its layout are in place. */
export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="rounded-ledger border-rule bg-surface w-full max-w-sm border p-6">
        <h1 className="font-display text-28 font-semibold">
          PHMG &amp; Associates
        </h1>
        <p className="text-14 text-ink-muted mt-2">
          Sign-in arrives in Step 1.
        </p>
      </div>
    </main>
  );
}

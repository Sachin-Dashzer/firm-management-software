"use client";

import { useState } from "react";
import Image from "next/image";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { startClientSignIn, confirmClientTotpSetup } from "./actions";

/**
 * The client portal's sign-in (P2-9a).
 *
 * Deliberately plainer than the staff screen: no 3D scene, no firm jargon,
 * and a second step only when the firm has turned 2FA on for the account.
 * The person reading it is not a colleague and has nobody to ask.
 */
export default function ClientLoginForm({ firmName }) {
  const next = useSearchParams().get("next") || "/client";

  const [stage, setStage] = useState("password"); // password | setup | code
  const [challenge, setChallenge] = useState("");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onPassword(formData) {
    setBusy(true);
    setError("");
    const result = await startClientSignIn({
      email: formData.get("email"),
      password: formData.get("password"),
    });
    setBusy(false);

    if ("error" in result) return setError(result.error);
    setChallenge(result.challenge);

    // no code wanted: the password was the whole of it
    if (!result.needsCode) return finish(result.challenge, "");
    if (result.needsSetup) {
      setQr(result.qr ?? "");
      setSecret(result.secret ?? "");
      setStage("setup");
    } else {
      setStage("code");
    }
  }

  async function onCode(formData) {
    setBusy(true);
    setError("");
    const code = String(formData.get("code") ?? "");

    if (stage === "setup") {
      const confirmed = await confirmClientTotpSetup({ challenge, code });
      if ("error" in confirmed) {
        setBusy(false);
        return setError(confirmed.error);
      }
    }

    await finish(challenge, code);
  }

  async function finish(signedChallenge, code) {
    setBusy(true);
    const result = await signIn("client", {
      challenge: signedChallenge,
      code,
      redirect: false,
    });
    setBusy(false);

    if (result?.error) {
      return setError(
        stage === "password"
          ? "Something went wrong signing you in. Please try again."
          : "That code is not right. Check the app and try again.",
      );
    }

    // a portal session never lands anywhere but the portal, whatever the
    // address bar asked for
    window.location.assign(next.startsWith("/client") ? next : "/client");
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="font-display text-28 font-semibold">{firmName}</h1>
      <p className="text-13 text-ink-muted mt-1">
        {stage === "password"
          ? "Sign in to see your documents, your work and your invoices."
          : stage === "setup"
            ? "Set up two-factor authentication to finish signing in."
            : "Enter the code from your authenticator app."}
      </p>

      {error && (
        <p
          role="alert"
          className="rounded-ledger border-redpen bg-redpen-wash text-13 text-redpen mt-4 border px-3 py-2"
        >
          {error}
        </p>
      )}

      {stage === "password" ? (
        <form action={onPassword} className="mt-6 flex flex-col gap-4">
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
          />
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <Submit busy={busy}>Sign in</Submit>
        </form>
      ) : (
        <form action={onCode} className="mt-6 flex flex-col gap-4">
          {stage === "setup" && (
            <div className="rounded-ledger border-rule bg-paper border p-4">
              <p className="text-13 text-ink-muted">
                Open an authenticator app on your phone — Google
                Authenticator or any other — tap{" "}
                <strong className="text-ink">+</strong>, choose{" "}
                <strong className="text-ink">Scan a QR code</strong>, and scan
                this:
              </p>
              {qr && (
                <Image
                  src={qr}
                  alt="QR code for your authenticator app"
                  width={220}
                  height={220}
                  unoptimized
                  className="mx-auto my-3 rounded"
                />
              )}
              <p className="text-12 text-ink-muted">
                Cannot scan? Type this key into the app instead:
                <br />
                <code className="text-13 text-ink font-mono break-all">
                  {secret}
                </code>
              </p>
            </div>
          )}
          <Field
            label="6-digit code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            className="font-mono tracking-[0.4em]"
            required
            autoFocus
          />
          <Submit busy={busy}>
            {stage === "setup" ? "Turn on 2FA and sign in" : "Sign in"}
          </Submit>
        </form>
      )}

      <p className="text-12 text-ink-muted mt-6">
        This is the client portal. If you work at the firm, sign in at{" "}
        <a href="/login" className="underline underline-offset-4">
          the staff login
        </a>
        .
      </p>
    </div>
  );
}

function Field({ label, name, className = "", ...rest }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-13 text-ink-muted font-medium">{label}</span>
      <input
        name={name}
        className={`rounded-ledger border-rule bg-paper text-16 text-ink h-10 border px-3 ${className}`}
        {...rest}
      />
    </label>
  );
}

function Submit({ busy, children }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="rounded-ledger bg-carbon text-14 h-10 font-medium text-white disabled:opacity-60"
    >
      {busy ? "One moment…" : children}
    </button>
  );
}

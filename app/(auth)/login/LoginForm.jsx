"use client";

import { useState } from "react";
import Image from "next/image";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { startSignIn, confirmTotpSetup } from "./actions";
import { ARRIVE_EVENT, ARRIVE_MS } from "@/components/login/capability";

/**
 * Sign-in in two steps: password, then the 6-digit code from the
 * authenticator app. First-time users are shown a QR code to scan before the
 * code box, because 2FA is mandatory (spec section 16).
 */
export default function LoginForm() {
  const next = useSearchParams().get("next") || "/dashboard";

  const [stage, setStage] = useState("password"); // password | setup | code
  const [challenge, setChallenge] = useState("");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [arriving, setArriving] = useState(false);

  async function onPassword(formData) {
    setBusy(true);
    setError("");
    const result = await startSignIn({
      email: formData.get("email"),
      password: formData.get("password"),
    });
    setBusy(false);

    if ("error" in result) return setError(result.error);
    setChallenge(result.challenge);
    // AUTH_SKIP_2FA: the password was the whole of it
    if (result.skip2fa) return finish(result.challenge, "");
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
      const confirmed = await confirmTotpSetup({ challenge, code });
      if ("error" in confirmed) {
        setBusy(false);
        return setError(confirmed.error);
      }
    }

    await finish(challenge, code);
  }

  /** The last stretch: swap the challenge for a session, then leave. */
  async function finish(signedChallenge, code) {
    setBusy(true);
    const result = await signIn("credentials", {
      challenge: signedChallenge,
      code,
      redirect: false,
    });
    setBusy(false);

    if (result?.error) {
      return setError("That code is not right. Check the app and try again.");
    }

    // the scene glides into the head office and the panel dissolves, then
    // we leave (spec section 15). If nothing is listening — the flat map,
    // reduced motion, a phone — the wait is skipped and this is instant.
    const watching = window.matchMedia?.(
      "(prefers-reduced-motion: no-preference)",
    ).matches;
    if (watching && document.querySelector("canvas")) {
      setArriving(true);
      window.dispatchEvent(new Event(ARRIVE_EVENT));
      await new Promise((resolve) => setTimeout(resolve, ARRIVE_MS));
    }

    window.location.assign(next);
  }

  return (
    <div
      className={`w-full max-w-sm transition-opacity duration-500 motion-reduce:transition-none ${
        arriving ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* The firm's name is the page's h1, on the plate beside this. This
          heading names the task, which is all the form side has to say. */}
      <h2 className="text-24 font-bold tracking-tight">
        {stage === "password" ? "Sign in" : "Two-factor"}
      </h2>
      <p className="text-14 text-ink-muted mt-1.5">
        {stage === "password"
          ? "Your practice management account."
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
          <Submit busy={busy}>Continue</Submit>
        </form>
      ) : (
        <form action={onCode} className="mt-6 flex flex-col gap-4">
          {stage === "setup" && (
            <div className="rounded-ledger border-rule bg-paper border p-4">
              <p className="text-13 text-ink-muted">
                Open Google Authenticator (or any authenticator app) on your
                phone, tap <strong className="text-ink">+</strong>, choose{" "}
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
    </div>
  );
}

function Field({ label, name, className = "", ...rest }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-14 text-ink font-medium">{label}</span>
      <input
        name={name}
        className={`rounded-control border-rule bg-surface text-16 text-ink focus-visible:border-carbon h-11 border px-3 transition-colors duration-150 ${className}`}
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
      className="rounded-control bg-carbon text-14 text-on-carbon hover:bg-carbon-ink mt-2 h-11 px-4 font-medium transition-colors duration-150 disabled:opacity-60"
    >
      {busy ? "Please wait…" : children}
    </button>
  );
}

"use client";

import { useState, useTransition } from "react";
import { checkChain } from "./actions";

/** The "nothing has been tampered with" button on the audit screen. */
export default function ChainCheck() {
  const [result, setResult] = useState(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => setResult(await checkChain()))
        }
        className="rounded-control border-rule text-14 hover:bg-carbon-wash h-9 border px-3 disabled:opacity-60"
      >
        {pending ? "Checking…" : "Check for tampering"}
      </button>

      {result && (
        <p
          role="status"
          className={`rounded-ledger text-13 border px-3 py-2 ${
            result.ok
              ? "border-filed bg-filed-wash text-filed"
              : "border-redpen bg-redpen-wash text-redpen"
          }`}
        >
          {result.ok ?? result.error}
        </p>
      )}
    </>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * The certificate register (P3-15).
 *
 * Two lists rather than one with a status column: a draft is work and a
 * signed certificate is a record, and nobody ever wants both at once. The
 * signed list carries the UDIN and the membership number, because that is
 * what a peer reviewer asks for.
 */
export default function CertificateList({ rows, show }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  function go(next) {
    const params = new URLSearchParams(search);
    if (next === "signed") params.set("show", "signed");
    else params.delete("show");
    router.replace(`${pathname}?${params}`);
  }

  const signed = show === "signed";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Chip on={!signed} onClick={() => go("drafts")}>
          In hand
        </Chip>
        <Chip on={signed} onClick={() => go("signed")}>
          Signed
        </Chip>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border px-3 py-6 text-center">
          {signed
            ? "Nothing has been signed yet."
            : "No certificate is being drafted."}
        </p>
      ) : (
        <div className="rounded-table border-rule bg-surface overflow-x-auto border">
          <table className="text-14 w-full">
            <thead>
              <tr className="border-rule bg-sunk text-12 text-ink-muted border-b text-left tracking-wide uppercase">
                <th className="px-3 py-2 font-medium">Number</th>
                <th className="px-3 py-2 font-medium">Client</th>
                <th className="px-3 py-2 font-medium">What</th>
                <th className="px-3 py-2 text-right font-medium">Figure</th>
                <th className="px-3 py-2 font-medium">
                  {signed ? "Signed" : "Still to do"}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-rule border-b last:border-0">
                  <td className="px-3 py-2 align-top">
                    <Link
                      href={`/practice/certificates/${row.id}`}
                      className="text-13 font-mono underline underline-offset-4"
                    >
                      {row.number}
                    </Link>
                    {row.asOn && (
                      <span className="text-12 text-ink-muted block">
                        as at {row.asOn}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {row.client}
                    {row.addressee && (
                      <span className="text-12 text-ink-muted block">
                        for {row.addressee}
                      </span>
                    )}
                  </td>
                  <td className="text-13 px-3 py-2 align-top">
                    {row.typeName}
                    <span className="text-12 text-ink-muted block">
                      {row.level === "Limited"
                        ? "Limited assurance — conclusion in the negative form"
                        : "Reasonable assurance — a positive opinion"}
                    </span>
                  </td>
                  <td className="num text-13 px-3 py-2 text-right align-top">
                    {row.figure || "—"}
                  </td>
                  <td className="text-13 px-3 py-2 align-top">
                    {signed ? (
                      <>
                        {row.signedOn} · {row.signer}
                        <span className="text-12 text-ink-muted block font-mono">
                          {row.udin}
                          {row.membershipNo
                            ? ` · M. No. ${row.membershipNo}`
                            : ""}
                        </span>
                      </>
                    ) : (
                      <>
                        {row.problems === 0
                          ? "Ready to sign"
                          : `${row.problems} ${row.problems === 1 ? "thing" : "things"} unfinished`}
                        {!row.wordingConfirmed && (
                          <span className="text-12 text-waiting block">
                            wording not confirmed by a partner
                          </span>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Chip({ on, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-chip text-13 border px-3 py-0.5 ${
        on
          ? "border-carbon bg-carbon text-on-carbon"
          : "border-rule bg-surface text-ink-muted"
      }`}
    >
      {children}
    </button>
  );
}

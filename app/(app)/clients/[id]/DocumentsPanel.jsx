"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Uploader from "@/components/documents/Uploader";
import DocumentList from "@/components/documents/DocumentList";
import { updateDocument } from "../../documents/actions";

/**
 * A client's files (spec section 6).
 *
 * The permanent file sits at the top — PAN card, incorporation certificate,
 * MOA/AOA, GST certificate — because it is the part every engagement
 * references instead of asking the client again. Everything else is listed
 * by the engagement it came in on.
 */
export default function DocumentsPanel({
  clientId,
  permanent,
  byEngagement,
  mayEdit,
}) {
  const router = useRouter();
  const [message, setMessage] = useState(null);
  const [, startTransition] = useTransition();

  const refresh = () => startTransition(() => router.refresh());

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
        <div>
          <h2 className="font-display text-15 font-semibold">Permanent file</h2>
          <p className="text-13 text-ink-muted">
            Documents that do not change year to year. Any engagement can use
            these without asking the client again.
          </p>
        </div>

        {message?.ok && (
          <p role="status" className="text-13 text-filed">
            {message.ok}
          </p>
        )}

        <DocumentList
          documents={permanent}
          mayDelete={mayEdit}
          onChange={refresh}
          empty="Nothing in the permanent file yet."
        />

        {mayEdit && (
          <Uploader
            clientId={clientId}
            permanent
            label="Add to the permanent file"
            onDone={refresh}
          />
        )}
      </section>

      {byEngagement.map((group) => (
        <section
          key={group.id}
          className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border p-4"
        >
          <h2 className="font-display text-15 font-semibold">{group.title}</h2>
          <p className="text-13 text-ink-muted font-mono">{group.code}</p>
          <DocumentList
            documents={group.documents}
            mayDelete={mayEdit}
            onChange={refresh}
          />
          {mayEdit && (
            <div className="flex flex-wrap gap-3 pt-1">
              {group.documents
                .filter((d) => !d.isPermanent)
                .map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() =>
                      startTransition(async () => {
                        setMessage(
                          await updateDocument(d.id, { permanent: true }),
                        );
                        router.refresh();
                      })
                    }
                    className="text-13 underline underline-offset-4"
                  >
                    Move “{d.name}” to the permanent file
                  </button>
                ))}
            </div>
          )}
        </section>
      ))}

      {byEngagement.length === 0 && (
        <p className="text-14 text-ink-muted">
          No files have come in on an engagement yet.
        </p>
      )}
    </div>
  );
}

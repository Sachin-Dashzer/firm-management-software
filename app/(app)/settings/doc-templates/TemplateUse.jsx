"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Chip from "@/components/ui/Chip";
import { Result } from "@/components/ui/Notice";
import { createDraft } from "../../docs/actions";

/**
 * Pick a letter, pick a client, read the draft (the owner's screen of
 * 02-11-2026).
 *
 * Three decisions in here:
 *
 *  - **The blanks are marked, and counted.** `resolveTemplate` leaves
 *    `[Label — not recorded]` where the record has nothing, and this
 *    highlights every one of them and says how many there are. A draft
 *    that looks finished and is not is how a blank goes out over the
 *    firm's name.
 *  - **Nothing is editable here.** The wording is changed on the other
 *    tab, where a partner approves it. A screen that let somebody edit the
 *    words and then copy them would be a quiet way round the approval.
 *  - **Copy and .txt are instant; Word and PDF need a job.** Those two are
 *    rendered from a saved draft so the file and the record agree — the
 *    button starts the draft on the job and the job has both.
 */
export default function TemplateUse({
  templates,
  kinds,
  selected,
  clients,
  clientId,
  engagements,
  engagementId,
  preview,
  mayStart,
  isPartner,
}) {
  const router = useRouter();
  const [message, setMessage] = useState(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  /** The URL with one thing changed, so the whole state is shareable. */
  const to = (next) => {
    const query = new URLSearchParams();
    const code = next.code ?? selected?.code;
    const client = next.client === undefined ? clientId : next.client;
    const engagement =
      next.engagement === undefined ? engagementId : next.engagement;
    if (code) query.set("code", code);
    if (client) query.set("client", client);
    if (engagement) query.set("engagement", engagement);
    return `/settings/doc-templates?${query.toString()}`;
  };

  function copy() {
    if (!preview) return;
    navigator.clipboard?.writeText(preview.text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => setMessage({ error: "The browser would not allow the copy." }),
    );
  }

  function download() {
    if (!preview) return;
    const blob = new Blob([preview.text], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selected.name.replace(/[^A-Za-z0-9]+/g, "-")}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function start() {
    startTransition(async () => {
      const result = await createDraft(engagementId, selected.id);
      setMessage(result);
      if (result?.ok) router.push(`/engagements/${engagementId}`);
    });
  }

  const client = clients.find((row) => row.id === clientId);

  return (
    <div className="flex flex-wrap items-start gap-4">
      {/* --- the shelf ---------------------------------------------------- */}
      <nav
        aria-label="Templates"
        className="rounded-ledger border-rule bg-surface flex min-w-[15rem] flex-1 basis-[18rem] flex-col gap-1 border p-2 lg:max-w-[20rem]"
      >
        {kinds.map((kind) => {
          const inKind = templates.filter((row) => row.kind === kind);
          if (inKind.length === 0) return null;
          return (
            <div key={kind} className="flex flex-col">
              <h2 className="text-11 text-ink-muted px-2 pt-2.5 pb-1 font-semibold tracking-wide uppercase">
                {kind}
              </h2>
              {inKind.map((row) => (
                <Link
                  key={row.code}
                  href={to({ code: row.code })}
                  aria-current={row.code === selected?.code ? "page" : undefined}
                  className={`rounded-control text-13 flex items-baseline justify-between gap-2 px-2 py-1.5 ${
                    row.code === selected?.code
                      ? "bg-carbon-wash text-carbon font-semibold"
                      : "hover:bg-carbon-wash/60"
                  }`}
                >
                  <span>{row.name}</span>
                  {!row.verified && (
                    <span
                      title="Not approved — drafts come out watermarked"
                      className="text-waiting shrink-0"
                    >
                      ●
                    </span>
                  )}
                </Link>
              ))}
            </div>
          );
        })}
      </nav>

      {/* --- the draft ---------------------------------------------------- */}
      <section className="rounded-ledger border-rule bg-surface flex min-w-[20rem] flex-[999] basis-[32rem] flex-col gap-3 border p-4">
        {!selected ? (
          <p className="text-14 text-ink-muted">
            No template is available. Add one on the wording tab.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Chip tone="info">{selected.kind}</Chip>
                <h2 className="font-display text-18 mt-1.5 font-semibold">
                  {selected.name}
                </h2>
                <p className="text-13 text-ink-muted max-w-[60ch]">
                  {selected.description}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-12 text-ink-muted font-medium">
                    For which client
                  </span>
                  <select
                    value={clientId}
                    onChange={(event) =>
                      router.push(
                        to({ client: event.target.value, engagement: "" }),
                      )
                    }
                    className="rounded-control border-rule bg-paper text-14 h-9 min-w-[18rem] border px-2"
                  >
                    <option value="">— choose a client —</option>
                    {clients.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </label>
                {clientId && (
                  <label className="flex flex-col gap-1">
                    <span className="text-12 text-ink-muted font-medium">
                      About which job
                    </span>
                    <select
                      value={engagementId}
                      onChange={(event) =>
                        router.push(to({ engagement: event.target.value }))
                      }
                      className="rounded-control border-rule bg-paper text-14 h-9 min-w-[18rem] border px-2"
                    >
                      <option value="">
                        {engagements.length
                          ? "— no job: the service and period stay blank —"
                          : "— this client has no open job —"}
                      </option>
                      {engagements.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </div>

            {!selected.verified && (
              <p className="rounded-ledger border-waiting bg-waiting-wash text-13 border px-3 py-2">
                <strong>Nobody has approved this wording.</strong>{" "}
                {selected.sourceNote}{" "}
                {isPartner ? (
                  <>
                    <Link
                      href="/settings/doc-templates?tab=wording"
                      className="underline underline-offset-4"
                    >
                      Read it and approve it
                    </Link>
                    .
                  </>
                ) : (
                  "A partner approves it."
                )}{" "}
                Until then every draft carries a watermark.
              </p>
            )}

            <Result message={message} />

            {!preview ? (
              <p className="rounded-ledger border-rule bg-sunk text-14 text-ink-muted border px-4 py-10 text-center">
                Choose a client and the letter fills in from their record.
              </p>
            ) : (
              <>
                <p className="text-12 text-ink-muted">
                  {preview.gaps.length === 0 ? (
                    "Every field this letter needs is on the record."
                  ) : (
                    <>
                      <strong className="text-waiting">
                        {preview.gaps.length}{" "}
                        {preview.gaps.length === 1 ? "blank" : "blanks"}
                      </strong>{" "}
                      to fill before this goes out — {preview.gaps.join(", ")}.
                      Anything in square brackets is a blank.
                    </>
                  )}
                  {preview.unknown.length > 0 && (
                    <>
                      {" "}
                      <span className="text-redpen">
                        The template asks for {preview.unknown.join(", ")},
                        which is not a field — fix it on the wording tab.
                      </span>
                    </>
                  )}
                </p>

                <div className="rounded-ledger border-rule bg-sunk text-14 max-h-[34rem] overflow-auto border p-4 leading-relaxed whitespace-pre-wrap">
                  {mark(preview.text)}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={copy}
                    className="rounded-control border-rule bg-surface text-13 h-8 border px-3"
                  >
                    {copied ? "Copied" : "Copy text"}
                  </button>
                  <button
                    type="button"
                    onClick={download}
                    className="rounded-control border-rule bg-surface text-13 h-8 border px-3"
                  >
                    Download .txt
                  </button>
                  {mayStart && (
                    <button
                      type="button"
                      onClick={start}
                      disabled={pending || !engagementId}
                      title={
                        engagementId
                          ? "Starts it as a draft on the job, where Word and PDF live"
                          : "Pick a job first: a letter is kept on the job it is about"
                      }
                      className="rounded-control bg-carbon text-13 text-on-carbon h-8 px-3 font-medium disabled:opacity-60"
                    >
                      Start it on the job
                    </button>
                  )}
                  <span className="text-12 text-ink-muted self-center">
                    Word and PDF come off the saved draft, so the file and the
                    firm&rsquo;s record always say the same thing.
                  </span>
                </div>

                {client && (
                  <p className="text-12 text-ink-muted">
                    Filled from {client.name}&rsquo;s record
                    {engagementId ? " and the job you chose" : ""}. Nothing on
                    this screen is saved until you start it on a job.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/**
 * Draw `[like this]` as a blank somebody has to fill.
 *
 * The same square brackets the resolver writes for a missing field and the
 * template's own author writes for a figure nobody has recorded — so one
 * mark covers both, and the count above the page agrees with what the eye
 * finds.
 */
function mark(text) {
  return String(text)
    .split(/(\[[^\]]*\])/g)
    .map((part, index) =>
      part.startsWith("[") && part.endsWith("]") ? (
        <mark
          key={index}
          className="bg-waiting-soft text-waiting rounded px-0.5"
        >
          {part}
        </mark>
      ) : (
        part
      ),
    );
}

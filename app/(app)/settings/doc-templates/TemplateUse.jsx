"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Chip from "@/components/ui/Chip";
import Notice, { Result } from "@/components/ui/Notice";
import Action from "@/components/ui/Action";
import { createDraft } from "../../docs/actions";

/**
 * Pick a letter, pick a client, read the draft (the owner's screen of
 * 02-11-2026, redrawn 03-11-2026).
 *
 * ## What the screen is for, and what was in the way
 *
 * Somebody is on the telephone to a client and wants the letter, filled
 * in, now. Three things got between them and it:
 *
 * **The two controls that make the screen work were in a corner.** The
 * client and the job pickers sat in the top-right of the draft panel, two
 * 18rem selects competing with the letter's name and description for one
 * row — so on anything under a wide laptop the header became four stacked
 * blocks, and the one decision the whole screen waits on read as
 * secondary. They are a bar of their own now, above the draft, in the
 * order the sentence goes: *this letter · about this client · on this job*.
 *
 * **Twenty-four letters in a shelf with no filter.** The wording tab got a
 * search box; this one needed it more, because here you already know the
 * name of the letter you want.
 *
 * **The blanks were fine print.** How many fields the record cannot fill
 * is the single most important fact on the screen — it is the difference
 * between a letter that can go out and one that cannot — and it was a
 * `text-12` run-on paragraph that also carried an unrelated warning about
 * broken placeholders. Two separate notices now, at a size that matches
 * what they decide.
 *
 * ## The three decisions that have not changed
 *
 *  - **The blanks are marked, and counted.** `resolveTemplate` leaves
 *    `[Label — not recorded]` where the record has nothing, and this
 *    highlights every one of them. A draft that looks finished and is not
 *    is how a blank goes out over the firm's name.
 *  - **Nothing is editable here.** The wording is changed on the other
 *    tab, where a partner approves it. A screen that let somebody edit the
 *    words and then copy them would be a quiet way round the approval.
 *  - **Copy and .txt are instant; Word and PDF need a job.** Those two are
 *    rendered from a saved draft so the file and the record agree.
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
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  /** The URL with one thing changed, so the whole state is shareable. */
  const to = (next) => {
    const params = new URLSearchParams();
    const code = next.code ?? selected?.code;
    const client = next.client === undefined ? clientId : next.client;
    const engagement =
      next.engagement === undefined ? engagementId : next.engagement;
    if (code) params.set("code", code);
    if (client) params.set("client", client);
    if (engagement) params.set("engagement", engagement);
    return `/settings/doc-templates?${params.toString()}`;
  };

  /**
   * Filter the shelf, keeping the model's own order of kinds so the groups
   * read the same every time. The selected letter is never filtered out —
   * hiding what the right-hand side is showing would be a lie about where
   * you are.
   */
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = templates.filter(
      (row) =>
        !needle ||
        row.code === selected?.code ||
        row.name.toLowerCase().includes(needle) ||
        row.code.toLowerCase().includes(needle) ||
        row.description.toLowerCase().includes(needle),
    );
    return kinds
      .map((kind) => [kind, matches.filter((row) => row.kind === kind)])
      .filter(([, list]) => list.length > 0);
  }, [templates, kinds, query, selected?.code]);

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
  const shown = groups.reduce((n, [, list]) => n + list.length, 0);

  return (
    <div className="flex flex-wrap items-start gap-4">
      {/* --- the shelf ---------------------------------------------------- */}
      <div className="flex min-w-[15rem] flex-1 basis-[18rem] flex-col gap-2 lg:sticky lg:top-4 lg:max-w-[20rem]">
        <label>
          <span className="sr-only">Search the templates</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search letters"
            className="rounded-control border-rule bg-paper text-14 h-9 w-full border px-2"
          />
        </label>

        <nav
          aria-label="Templates"
          className="rounded-ledger border-rule bg-surface flex max-h-[30rem] flex-col gap-1 overflow-y-auto border p-2"
        >
          {shown === 0 ? (
            <p className="text-13 text-ink-muted px-2 py-6 text-center">
              Nothing matches “{query.trim()}”.
            </p>
          ) : (
            groups.map(([kind, list]) => (
              <div key={kind} className="flex flex-col">
                <h2 className="text-11 text-ink-muted px-2 pt-2.5 pb-1 font-semibold tracking-wide uppercase">
                  {kind}
                </h2>
                {list.map((row) => (
                  <Link
                    key={row.code}
                    href={to({ code: row.code })}
                    aria-current={
                      row.code === selected?.code ? "page" : undefined
                    }
                    className={`rounded-control text-13 flex items-baseline justify-between gap-2 px-2 py-1.5 ${
                      row.code === selected?.code
                        ? "bg-carbon-wash text-carbon font-semibold"
                        : "hover:bg-carbon-wash/60"
                    }`}
                  >
                    <span className="min-w-0">{row.name}</span>
                    {!row.verified && (
                      /*
                        The mark was the character `●`, which is a glyph
                        standing in for a drawn one: it carries the text
                        face's own weight and vertical centring, so it sat
                        high and changed size with the font. A dot is
                        geometry — a 6px round span on the baseline is the
                        same dot at every weight.
                      */
                      <span className="mt-1.5 flex shrink-0 items-start">
                        <span
                          aria-hidden="true"
                          className="bg-waiting size-1.5 rounded-full"
                        />
                        <span className="sr-only">
                          not approved, drafts are watermarked
                        </span>
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            ))
          )}
        </nav>

        <p className="text-12 text-faint flex items-center gap-1.5 px-1">
          <span
            aria-hidden="true"
            className="bg-waiting size-1.5 shrink-0 rounded-full"
          />
          not approved — drafts come out watermarked.
        </p>
      </div>

      {/* --- the draft ---------------------------------------------------- */}
      <div className="flex min-w-[20rem] flex-[999] basis-[32rem] flex-col gap-3">
        {!selected ? (
          <Notice tone="flat" title="No template is available">
            <p>Add one on the wording tab.</p>
          </Notice>
        ) : (
          <>
            {/* what this letter is ---------------------------------------- */}
            <section className="rounded-ledger border-rule bg-surface flex flex-col gap-1 border p-4">
              <Chip tone="info">{selected.kind}</Chip>
              <h2 className="font-display text-18 mt-0.5 font-semibold">
                {selected.name}
              </h2>
              {selected.description && (
                <p className="text-13 text-ink-muted max-w-[70ch]">
                  {selected.description}
                </p>
              )}
            </section>

            {/*
              Who it is about: a bar of its own, because this is the
              decision the whole screen waits on and it used to be in the
              corner of the panel beside it.
            */}
            <section className="rounded-ledger border-carbon bg-carbon-wash grid gap-3 border p-3 sm:grid-cols-2">
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
                  className="rounded-control border-rule bg-paper text-14 h-9 w-full border px-2"
                >
                  <option value="">— choose a client —</option>
                  {clients.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-12 text-ink-muted font-medium">
                  About which job
                </span>
                <select
                  value={engagementId}
                  disabled={!clientId}
                  onChange={(event) =>
                    router.push(to({ engagement: event.target.value }))
                  }
                  className="rounded-control border-rule bg-paper text-14 h-9 w-full border px-2 disabled:opacity-50"
                >
                  <option value="">
                    {!clientId
                      ? "— pick a client first —"
                      : engagements.length
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
            </section>

            {!selected.verified && (
              <Notice tone="warn" title="Nobody has approved this wording">
                <p>
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
              </Notice>
            )}

            <Result message={message} />

            {!preview ? (
              <p className="rounded-ledger border-rule bg-sunk text-14 text-ink-muted border border-dashed px-4 py-12 text-center">
                Choose a client above and the letter fills in from their record.
              </p>
            ) : (
              <>
                {/*
                  The two statuses, told apart. One is about the client's
                  record being incomplete, which is normal and fixable by
                  typing into the letter. The other is a broken placeholder
                  in the template itself, which is a fault in the wording
                  and nobody can fix from here.
                */}
                {preview.gaps.length === 0 ? (
                  <Notice
                    tone="good"
                    title="Every field this letter needs is on the record"
                  />
                ) : (
                  <Notice
                    tone="warn"
                    title={`${preview.gaps.length} ${
                      preview.gaps.length === 1 ? "blank" : "blanks"
                    } to fill before this goes out`}
                  >
                    <p>
                      {preview.gaps.join(", ")}. Anything in square brackets
                      below is a blank — fill it in after you copy the text, or
                      put it on the client&rsquo;s record and come back.
                    </p>
                  </Notice>
                )}

                {preview.unknown.length > 0 && (
                  <Notice tone="bad" title="This template has a broken field">
                    <p>
                      It asks for {preview.unknown.join(", ")}, which is not a
                      field the system knows.{" "}
                      <Link
                        href="/settings/doc-templates?tab=wording"
                        className="underline underline-offset-4"
                      >
                        Fix it on the wording tab
                      </Link>
                      .
                    </p>
                  </Notice>
                )}

                <div className="rounded-ledger border-rule bg-sunk text-14 max-h-[34rem] overflow-auto border p-4 leading-relaxed whitespace-pre-wrap">
                  {mark(preview.text)}
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-start gap-2">
                    {mayStart && (
                      /*
                        `Action` rather than a `title` on a disabled button
                        (P3-8). A disabled button cannot be focused, so the
                        reason in a `title` was unreachable by keyboard and
                        invisible on a phone — unreachable, that is, by the
                        people most likely to need it.
                      */
                      <Action
                        id="start-on-job"
                        why={
                          engagementId
                            ? null
                            : "Pick a job above first: a letter is kept on the job it is about, and that is where Word and PDF are rendered from."
                        }
                        pending={pending}
                        onClick={start}
                      >
                        Start it on the job
                      </Action>
                    )}
                    <button
                      type="button"
                      onClick={copy}
                      className="rounded-control border-rule bg-surface hover:bg-carbon-wash text-14 h-9 border px-3"
                    >
                      {copied ? "Copied" : "Copy text"}
                    </button>
                    <button
                      type="button"
                      onClick={download}
                      className="rounded-control border-rule bg-surface hover:bg-carbon-wash text-14 h-9 border px-3"
                    >
                      Download .txt
                    </button>
                  </div>

                  <p className="text-12 text-ink-muted max-w-[72ch]">
                    Word and PDF come off the saved draft, so the file and the
                    firm&rsquo;s record always say the same thing.
                    {client && (
                      <>
                        {" "}
                        This is filled from {client.name}&rsquo;s record
                        {engagementId ? " and the job you chose" : ""}, and
                        nothing on this screen is saved until you start it on a
                        job.
                      </>
                    )}
                  </p>
                </div>
              </>
            )}
          </>
        )}
      </div>
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

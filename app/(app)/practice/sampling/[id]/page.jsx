import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Sample from "@/models/Sample";
import Engagement from "@/models/Engagement";
import Client from "@/models/Client";
import Document from "@/models/Document";
import { formatISTDate } from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import { METHODS, progress, projected } from "@/lib/practice/sampling";
import Design from "./Design";
import Grid from "./Grid";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { id } = await params;
  await connectDB();
  const sample = await Sample.findById(id).select("ref name").lean();
  return {
    title: sample
      ? `${sample.ref ? `${sample.ref} ` : ""}${sample.name} · Sampling · PHMG`
      : "Sampling · PHMG",
  };
}

/**
 * One working paper (P3-30, SA 530).
 *
 * Read top to bottom it is the audit itself: what was sampled and why,
 * what came out, what was found in each one, and what that means for the
 * population. The three parts are numbered on screen because that is the
 * order a reviewer reads them in, and a grid without its design above it
 * is a list of ticks nobody can rely on.
 */
export default async function SamplePage({ params }) {
  const actor = await requireUser();
  if (!can(actor, "view", "practice")) redirect("/issues");

  const { id } = await params;
  await connectDB();

  const sample = await Sample.findById(id).lean();
  if (!sample) notFound();

  const engagement = await Engagement.findById(sample.engagementId)
    .select(
      "clientId branchId assigneeId reviewerId templateSnapshot periodLabel period status",
    )
    .lean();

  /* The branch and the people on the job decide this, not the area alone. */
  const target = {
    branchId: String(sample.branchId),
    assigneeId: String(engagement?.assigneeId ?? ""),
    reviewerId: String(engagement?.reviewerId ?? ""),
  };
  if (!can(actor, "view", "practice", target)) redirect("/issues");
  const editable = can(actor, "edit", "practice", target);

  const client = await Client.findById(sample.clientId)
    .select("legalName tradeName")
    .lean();

  /** How many voucher photographs are on each row. */
  const photos = await Document.aggregate([
    {
      $match: {
        sampleItemId: { $in: (sample.items ?? []).map((item) => item._id) },
        deletedAt: null,
      },
    },
    { $group: { _id: "$sampleItemId", count: { $sum: 1 } } },
  ]);
  const photoCount = new Map(photos.map((row) => [String(row._id), row.count]));

  const attributes = sample.attributes ?? [];
  const items = (sample.items ?? []).map((item) => ({
    id: String(item._id),
    no: item.no,
    ref: item.ref ?? "",
    party: item.party,
    on: item.on ?? "",
    amount: formatPaise(item.amountPaise),
    amountPaise: item.amountPaise,
    key: Boolean(item.key),
    keyReason: item.keyReason ?? "",
    /* The array can be shorter than the columns on a row drawn before a
       column was added, so it is padded for the grid rather than letting
       a cell render as undefined. */
    marks: attributes.map((_, index) => item.marks?.[index] ?? null),
    note: item.note ?? "",
    errorAmount: item.errorPaise ? String(item.errorPaise / 100) : "",
    sent: Boolean(item.exceptionId),
    photos: photoCount.get(String(item._id)) ?? 0,
    markedByName: item.markedByName ?? "",
  }));

  const counts = progress(sample.items ?? [], attributes.length);
  const estimate = projected(
    (sample.items ?? []).map((item) => ({
      marks: item.marks,
      amountPaise: item.amountPaise,
      key: item.key,
      errorPaise: item.errorPaise,
    })),
    sample.valuePaise ?? 0,
  );

  const method = METHODS.find((row) => row.key === sample.method);
  const clientName = client?.tradeName || client?.legalName || "Client";
  const waiting =
    counts.exceptions > 0 && items.some((i) => !i.sent && i.marks.includes(0));

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 p-4 md:p-6">
      <nav className="text-13 text-ink-muted flex flex-wrap gap-x-2">
        <Link
          href="/practice/sampling"
          className="underline underline-offset-4"
        >
          Sampling
        </Link>
        <span aria-hidden>/</span>
        <Link
          href={`/practice/audit/${sample.engagementId}`}
          className="underline underline-offset-4"
        >
          {clientName} · {engagement?.periodLabel || engagement?.period}
        </Link>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-24 font-bold tracking-tight">
            {sample.ref ? `${sample.ref} · ` : ""}
            {sample.name}
          </h1>
          <p className="text-13 text-ink-muted">
            SA 530 ·{" "}
            {sample.locked ? (
              <>
                sample locked {formatISTDate(sample.lockedAt)} by{" "}
                {sample.lockedByName} · selection seed{" "}
                <span className="num">{sample.seed}</span> saved, so the same
                sample can be produced again
              </>
            ) : (
              <>
                not locked · selection seed{" "}
                <span className="num">{sample.seed}</span>
              </>
            )}
          </p>
        </div>
        {sample.locked && (
          <span className="rounded-chip border-filed bg-filed-wash text-filed text-13 border px-2 py-0.5">
            Locked
          </span>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <Design
          id={String(sample._id)}
          editable={editable}
          mayUnlock={["partner", "ca"].includes(actor.role)}
          sample={{
            population: sample.population ?? "",
            reconciledToTb:
              sample.reconciledToTb === true
                ? "yes"
                : sample.reconciledToTb === false
                  ? "no"
                  : "",
            method: sample.method,
            confidence: sample.confidence ?? "",
            tolerable: sample.tolerablePaise
              ? String(sample.tolerablePaise / 100)
              : "",
            basis: sample.basis ?? "",
            keyAbove: sample.keyAbovePaise
              ? String(sample.keyAbovePaise / 100)
              : "",
            size: sample.size || "",
            locked: Boolean(sample.locked),
            entries: sample.entries ?? 0,
            value: sample.valuePaise ? formatPaise(sample.valuePaise) : "",
            drawn: items.length,
            keyCount: items.filter((item) => item.key).length,
            interval: sample.intervalPaise
              ? formatPaise(sample.intervalPaise)
              : "",
            drawNote: sample.drawNote ?? "",
            drawnAt: sample.drawnAt ? formatISTDate(sample.drawnAt) : "",
            methodWhat: method?.what ?? "",
          }}
        />

        <div className="flex min-w-0 flex-col gap-4">
          <Grid
            id={String(sample._id)}
            engagementId={String(sample.engagementId)}
            clientId={String(sample.clientId)}
            attributes={attributes}
            items={items}
            counts={counts}
            editable={editable}
            locked={Boolean(sample.locked)}
            canSend={waiting}
          />

          {counts.exceptions > 0 && (
            <section className="rounded-ledger border-redpen bg-redpen-wash flex flex-col gap-2 border p-4">
              <h2 className="font-display text-15 font-semibold">
                3 · What this says about the whole population
              </h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <Figure
                  label="Found in the sample"
                  value={formatPaise(estimate.foundPaise)}
                />
                <Figure
                  label="Projected to the population"
                  value={formatPaise(estimate.projectedPaise)}
                  tone="late"
                />
                <Figure
                  label="Tolerable misstatement"
                  value={
                    sample.tolerablePaise
                      ? formatPaise(sample.tolerablePaise)
                      : "not set"
                  }
                />
              </div>
              <p className="text-13 max-w-[76ch]">
                <strong>Projected, not found.</strong> What was found in the
                sample stands for the population it was drawn from, so the
                figure to compare with tolerable misstatement is the projected
                one — the simple ratio estimate SA 530 ¶14 asks for. Key items
                are not projected: they were examined in full, so what was found
                in them is what there is.
              </p>
              {sample.tolerablePaise > 0 &&
                estimate.projectedPaise > sample.tolerablePaise && (
                  <p className="text-13 font-medium">
                    The projected misstatement is above what the firm said it
                    would tolerate. SA 530 ¶15 asks whether the sample is still
                    an adequate basis for a conclusion about the population —
                    that judgement belongs on the audit file, not here.
                  </p>
                )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Figure({ label, value, tone }) {
  return (
    <div className="rounded-ledger border-rule bg-surface flex flex-col gap-1 border px-3 py-2">
      <span className="text-12 text-ink-muted">{label}</span>
      <span
        className={`num font-display text-20 leading-none ${tone === "late" ? "text-redpen" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

import Link from "next/link";
import { requireUser } from "@/auth";
import { connectDB } from "@/lib/db";
import Procedure from "@/models/Procedure";
import { formatISTDate } from "@/lib/dates";
import { roadmap, mayWrite, isStale } from "@/lib/learning/screens";
import { STARTER_SOPS, STARTER_NOTE } from "@/lib/learning/sops";
import { SHELVES, shelfContents, VERIFY } from "@/lib/learning/playbooks";
import PageHead from "@/components/ui/PageHead";
import Panel from "@/components/ui/Panel";
import Chip from "@/components/ui/Chip";
import Segmented from "@/components/ui/Segmented";

export const metadata = { title: "Learning library · PHMG" };
export const dynamic = "force-dynamic";

/**
 * The library (P3-19, redrawn to the owner's screen of 02-11-2026).
 *
 * Two menu items, one page, because they are two shelves of the same
 * bookcase: **playbooks** are a kind of work learnt once, and **how we
 * work here** is the procedure for the screen you are standing on.
 *
 * Three states are drawn differently and the difference is the point:
 *
 *  - *written by the firm* — somebody here typed it, and a partner's name
 *    is against it;
 *  - *the firm's starting draft* — the content that shipped with the
 *    system, true enough to work from and not yet read by a partner;
 *  - *nobody has written this* — listed as loudly as the rest, because a
 *    handbook with invisible holes is how a new joiner finds the hole at
 *    the worst moment.
 *
 * A firm-written procedure replaces the draft completely. They are never
 * merged: two voices in one procedure is how a handbook stops being
 * trusted.
 */
export default async function LearningPage({ searchParams }) {
  const actor = await requireUser();
  const params = (await searchParams) ?? {};
  const tab = params.tab === "sops" ? "sops" : "playbooks";
  const query = String(params.q ?? "").trim().toLowerCase();
  const specialist = params.specialist === "1";

  await connectDB();
  const rows = await Procedure.find({}).sort({ updatedAt: -1 }).lean();

  const written = rows.filter((row) => row.kind === "screen");
  const screens = roadmap(written, new Date()).map((screen) => ({
    ...screen,
    starter: Boolean(STARTER_SOPS[screen.key]),
    draftSteps: STARTER_SOPS[screen.key]?.steps?.length ?? 0,
    why: STARTER_SOPS[screen.key]?.why ?? "",
  }));

  const firmWritten = screens.filter((screen) => screen.written).length;
  const drafted = screens.filter(
    (screen) => !screen.written && screen.starter,
  ).length;
  const blank = screens.length - firmWritten - drafted;
  const canWrite = mayWrite(actor);

  /** A firm-written playbook sits on the shelf beside the shipped ones. */
  const ownPlaybooks = rows.filter((row) => row.kind === "playbook");

  const shelves = SHELVES.filter((shelf) => specialist || !shelf.specialist)
    .map((shelf) => ({
      ...shelf,
      books: shelfContents(shelf.id).filter(
        (book) =>
          !query ||
          `${book.id} ${book.title} ${book.out}`.toLowerCase().includes(query),
      ),
    }))
    .filter((shelf) => shelf.books.length > 0);

  const hiddenShelves = SHELVES.filter((shelf) => shelf.specialist).length;

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-5 p-4 md:p-6">
      <PageHead
        title="Learning library"
        sub="Learn a kind of work in depth. For help with the screen you are standing on, open its procedure from the question mark in the top bar."
      />

      <Segmented
        label="Which shelf"
        variant="underline"
        value={tab}
        items={[
          {
            key: "playbooks",
            label: "Playbooks",
            href: "/learning?tab=playbooks",
          },
          {
            key: "sops",
            label: "How we work here",
            href: "/learning?tab=sops",
          },
        ]}
      />

      {tab === "playbooks" ? (
        <>
          <form
            method="get"
            className="flex flex-wrap items-end gap-3"
            aria-label="Find a playbook"
          >
            <input type="hidden" name="tab" value="playbooks" />
            <label className="flex flex-col gap-1">
              <span className="text-12 text-ink-muted font-medium">
                Find a playbook
              </span>
              <input
                type="search"
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Returns, notices, a captive…"
                className="rounded-control border-rule bg-paper text-14 h-9 min-w-[16rem] border px-2"
              />
            </label>
            <label className="text-13 flex h-9 items-center gap-2">
              <input
                type="checkbox"
                name="specialist"
                value="1"
                defaultChecked={specialist}
              />
              Show the specialist shelves ({hiddenShelves})
            </label>
            <button
              type="submit"
              className="rounded-control border-rule bg-surface text-13 h-9 border px-3"
            >
              Show
            </button>
          </form>

          {shelves.map((shelf) => (
            <Panel
              key={shelf.id}
              title={shelf.title}
              hint={`For ${shelf.who}`}
            >
              <ul className="divide-rule divide-y">
                {shelf.books.map((book) => (
                  <li key={book.id}>
                    {book.full ? (
                      <Link
                        href={`/learning/${book.id}`}
                        className="hover:bg-carbon-wash -mx-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded px-2 py-2.5"
                      >
                        <span className="min-w-0">
                          <span className="text-14 font-medium underline underline-offset-4">
                            {book.title}
                          </span>
                          <span className="text-13 text-ink-muted block max-w-[68ch]">
                            {book.out}
                          </span>
                        </span>
                        <span className="text-12 text-ink-muted shrink-0">
                          {book.steps?.length ?? 0} steps
                          {book.exercise ? " · exercise" : ""}
                        </span>
                      </Link>
                    ) : (
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-2 py-2.5">
                        <span className="text-14 text-ink-muted">
                          {book.title}
                        </span>
                        <span className="text-12 text-faint shrink-0">
                          not written yet
                        </span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          ))}

          {ownPlaybooks.length > 0 && (
            <Panel title="Written here" hint="The firm's own">
              <ul className="divide-rule divide-y">
                {ownPlaybooks.map((row) => (
                  <li
                    key={String(row._id)}
                    className="flex flex-wrap items-baseline justify-between gap-2 py-2.5"
                  >
                    <Link
                      href={`/learning/${row.key}`}
                      className="text-14 underline underline-offset-4"
                    >
                      {row.title}
                    </Link>
                    <span className="text-12 text-ink-muted">
                      {row.writtenByName}
                      {row.reviewedAt
                        ? ` · read by ${row.reviewedByName}, ${formatISTDate(row.reviewedAt)}`
                        : " · not reviewed"}
                      {isStale(row) && " · needs a read"}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {canWrite && (
            <p className="text-13">
              <Link
                href="/learning/new-playbook"
                className="underline underline-offset-4"
              >
                Write one of your own
              </Link>{" "}
              — for the work this firm does that nothing above covers.
            </p>
          )}

          <p className="text-12 text-ink-muted">{VERIFY}</p>
        </>
      ) : (
        <>
          <p className="rounded-ledger border-rule bg-sunk text-13 border px-3 py-2">
            <strong>{firmWritten}</strong> of {screens.length} screens have a
            procedure written here, <strong>{drafted}</strong> have the
            firm&rsquo;s starting draft, and <strong>{blank}</strong> have
            nothing.{" "}
            {canWrite
              ? "Write the ones you explain out loud most often — those are the ones costing the firm time."
              : "A CA or a partner writes these."}
          </p>

          <ul className="grid gap-3 sm:grid-cols-2">
            {screens.map((screen) => (
              <li key={screen.key}>
                <Link
                  href={`/learning/${screen.key}`}
                  className="rounded-ledger border-rule bg-surface hover:border-carbon flex h-full flex-col gap-1 border p-3"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-14 font-medium">{screen.label}</span>
                    {screen.written ? (
                      <Chip tone={screen.stale ? "soon" : "good"}>
                        {screen.stale ? "needs a read" : "written here"}
                      </Chip>
                    ) : screen.starter ? (
                      <Chip tone="info">draft</Chip>
                    ) : (
                      <Chip tone="neutral">not written</Chip>
                    )}
                  </span>
                  <span className="text-12 text-ink-muted font-mono">
                    {screen.path}
                  </span>
                  {(screen.why || screen.written) && (
                    <span className="text-13 text-ink-muted">
                      {screen.written
                        ? `${screen.steps} ${screen.steps === 1 ? "step" : "steps"}, written by the firm`
                        : screen.why}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>

          <p className="text-12 text-ink-muted">{STARTER_NOTE}</p>
        </>
      )}
    </div>
  );
}

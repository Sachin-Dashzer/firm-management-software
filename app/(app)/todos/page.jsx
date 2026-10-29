import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, scopeOf, branchFilter } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Todo from "@/models/Todo";
import User from "@/models/User";
import Client from "@/models/Client";
import { formatISTDate, formatISTDateTime, istInputDate } from "@/lib/dates";
import { groupTodos, bucketOf } from "@/lib/todos/list";
import AddTodo from "./AddTodo";
import TodoLines from "./TodoLines";

export const metadata = { title: "To-dos · PHMG" };
export const dynamic = "force-dynamic";

const DAY = 86_400_000;

/**
 * The small things that are not jobs (P3-22c).
 *
 * Issues (P3-6) is the firm's list of what the records say is wrong, and
 * there is nothing to tick off there on purpose. This is the other half:
 * what a person wrote down, which only a person can call finished. Keeping
 * them apart is what stops either becoming a list nobody trusts.
 *
 * **Whose list you can read comes from the matrix** (`todos`, spec §2): a
 * partner the firm's, a CA their branch's, everybody else their own and
 * anything they wrote down for somebody else.
 */
export default async function TodosPage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "todos")) redirect("/issues");

  const params = (await searchParams) ?? {};
  const now = new Date();
  await connectDB();

  const scope = scopeOf(actor, "todos");
  const ownOnly = scope === "own";

  /**
   * What this person may read. `branchFilter` would answer "own" with a
   * branch condition, which is wider than the matrix allows — so the two
   * cases are written out rather than left to it.
   */
  const readable = ownOnly
    ? { $or: [{ ownerId: actor.id }, { createdBy: actor.id }] }
    : (branchFilter(actor, "todos") ?? {});

  /** Mine or everyone's, for anybody who can see more than their own. */
  const mineOnly = ownOnly || params.who !== "everyone";
  const query = mineOnly ? { ...readable, ownerId: actor.id } : readable;

  const [open, done] = await Promise.all([
    Todo.find({ ...query, done: false })
      .sort({ dueDate: 1, createdAt: 1 })
      .limit(500)
      .lean(),
    /** Finished this week, so ticking one off is not the same as losing it. */
    Todo.find({
      ...query,
      done: true,
      doneAt: { $gte: new Date(now.getTime() - 7 * DAY) },
    })
      .sort({ doneAt: -1 })
      .limit(100)
      .lean(),
  ]);

  const rows = [...open, ...done];

  const [people, clients] = await Promise.all([
    /** Who a to-do can be given to: the team this person may reach. */
    User.find({
      active: true,
      ...(scope === "all" ? {} : { branchIds: { $in: actor.branchIds ?? [] } }),
    })
      .select("name role")
      .sort({ name: 1 })
      .limit(200)
      .lean(),
    Client.find({
      ...(branchFilter(actor, "clients") ?? {}),
      status: { $ne: "Closed" },
    })
      .select("legalName tradeName code")
      .sort({ legalName: 1 })
      .limit(500)
      .lean(),
  ]);

  const personName = new Map(
    people.map((person) => [String(person._id), person.name]),
  );
  const clientNames = await Client.find({
    _id: { $in: rows.map((row) => row.clientId).filter(Boolean) },
  })
    .select("legalName tradeName")
    .lean();
  const clientName = new Map(
    clientNames.map((c) => [String(c._id), c.tradeName || c.legalName]),
  );

  /** One shape for both lists, with whether this person may change the row. */
  const shape = (row) => ({
    id: String(row._id),
    title: row.title,
    note: row.note ?? "",
    ownerId: String(row.ownerId),
    ownerName: personName.get(String(row.ownerId)) ?? "Somebody",
    clientId: row.clientId ? String(row.clientId) : "",
    client: row.clientId
      ? (clientName.get(String(row.clientId)) ?? "A client")
      : "",
    due: row.dueDate ? formatISTDate(row.dueDate) : "",
    dueInput: row.dueDate ? istInputDate(row.dueDate) : "",
    late: !row.done && bucketOf(row, now) === "overdue",
    done: Boolean(row.done),
    doneAt: row.doneAt ? formatISTDateTime(row.doneAt) : "",
    doneByName: row.doneByName ?? "",
    mayChange:
      String(row.ownerId) === actor.id ||
      row.createdBy === actor.id ||
      scope === "all",
  });

  const buckets = groupTodos(open, now).map((bucket) => ({
    ...bucket,
    rows: bucket.rows.map(shape),
  }));
  const finished = done.map(shape);

  const team = people.map((person) => ({
    id: String(person._id),
    name: person.name,
  }));

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-24 font-bold tracking-tight">
            To-dos
          </h1>
          <p className="text-13 text-ink-muted max-w-[70ch]">
            The small things that are not jobs. What the records say is wrong is
            on{" "}
            <Link href="/issues" className="underline underline-offset-4">
              Issues
            </Link>{" "}
            instead, and nothing there has to be ticked off.
          </p>
        </div>

        {!ownOnly && (
          <nav className="flex gap-2" aria-label="Whose to-dos">
            {[
              ["mine", "Mine"],
              ["everyone", "Everyone"],
            ].map(([key, label]) => (
              <Link
                key={key}
                href={key === "mine" ? "/todos" : "/todos?who=everyone"}
                aria-current={
                  (key === "mine") === mineOnly ? "page" : undefined
                }
                className={`rounded-control text-14 h-9 border px-3 leading-9 ${
                  (key === "mine") === mineOnly
                    ? "border-carbon bg-carbon-wash text-carbon"
                    : "border-rule hover:bg-carbon-wash"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        )}
      </div>

      <AddTodo
        people={team}
        clients={clients.map((client) => ({
          id: String(client._id),
          name: `${client.tradeName || client.legalName} · ${client.code}`,
        }))}
        me={actor.id}
      />

      {buckets.length === 0 ? (
        <p className="rounded-ledger border-rule bg-surface text-14 border px-4 py-3">
          {mineOnly
            ? "Nothing on your list."
            : "Nobody has anything on their list."}
        </p>
      ) : (
        buckets.map((bucket) => (
          <section key={bucket.key} className="flex flex-col gap-2">
            <h2 className="text-13 text-ink-muted font-medium">
              {bucket.label}
              <span className="num"> · {bucket.rows.length}</span>
            </h2>
            <TodoLines rows={bucket.rows} people={team} showOwner={!mineOnly} />
          </section>
        ))
      )}

      {finished.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-13 text-ink-muted font-medium">
            Done this week
            <span className="num"> · {finished.length}</span>
          </h2>
          <TodoLines rows={finished} people={team} showOwner={!mineOnly} />
        </section>
      )}
    </div>
  );
}

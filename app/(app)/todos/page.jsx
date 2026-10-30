import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, scopeOf, branchFilter } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Todo from "@/models/Todo";
import User from "@/models/User";
import Client from "@/models/Client";
import { formatISTDate, formatISTDateTime, istInputDate } from "@/lib/dates";
import { groupTodos, bucketOf, BUCKETS } from "@/lib/todos/list";
import PageHead from "@/components/ui/PageHead";
import Screen, { ScrollArea } from "@/components/ui/Screen";
import Segmented from "@/components/ui/Segmented";
import StatTile from "@/components/ui/StatTile";
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

  const all = groupTodos(open, now).map((bucket) => ({
    ...bucket,
    rows: bucket.rows.map(shape),
  }));
  const finished = done.map(shape);

  /**
   * Which stretch of the list to show (D104). The tiles above it are the
   * only way to ask, and they are counted over the whole list, not over
   * what the tile before them left — a tile that counts the filtered set
   * empties its neighbours the moment anybody uses one.
   */
  const due = [...BUCKETS.map((bucket) => bucket.key), "done"].includes(
    params.due,
  )
    ? params.due
    : "";
  const buckets =
    due && due !== "done" ? all.filter((b) => b.key === due) : all;
  const countOf = (key) =>
    all.find((bucket) => bucket.key === key)?.rows.length ?? 0;

  const team = people.map((person) => ({
    id: String(person._id),
    name: person.name,
  }));

  /** A link that keeps whose list is open, and changes the stretch. */
  const keep = (next) => {
    const params = new URLSearchParams();
    if (!mineOnly) params.set("who", "everyone");
    if (next) params.set("due", next);
    const tail = params.toString();
    return `/todos${tail ? `?${tail}` : ""}`;
  };

  return (
    <Screen>
      <PageHead
        title="To-dos"
        sub={
          <>
            The small things that are not jobs. What the records say is wrong is
            on{" "}
            <Link
              href="/issues"
              className="hover:text-carbon underline underline-offset-4"
            >
              Issues
            </Link>{" "}
            instead, and nothing there has to be ticked off.
          </>
        }
      >
        {!ownOnly && (
          <Segmented
            label="Whose to-dos"
            value={mineOnly ? "mine" : "everyone"}
            items={[
              { key: "mine", label: "Mine", href: "/todos" },
              {
                key: "everyone",
                label: "Everyone",
                href: "/todos?who=everyone",
              },
            ]}
          />
        )}
      </PageHead>

      <div className="grid shrink-0 grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <StatTile
          label="Late"
          value={countOf("overdue")}
          note="past the day they were set"
          tone="late"
          href={keep("overdue")}
          selected={due === "overdue"}
        />
        <StatTile
          label="Today"
          value={countOf("today")}
          note="set for today"
          tone="soon"
          href={keep("today")}
          selected={due === "today"}
        />
        <StatTile
          label="This week"
          value={countOf("week")}
          note="the next six days"
          href={keep("week")}
          selected={due === "week"}
        />
        <StatTile
          label="Done this week"
          value={finished.length}
          note="ticked off, still here"
          tone="good"
          href={keep("done")}
          selected={due === "done"}
        />
      </div>

      <AddTodo
        people={team}
        clients={clients.map((client) => ({
          id: String(client._id),
          name: `${client.tradeName || client.legalName} · ${client.code}`,
        }))}
        me={actor.id}
      />

      <ScrollArea className="flex flex-col gap-5">
        {buckets.length === 0 && due !== "done" ? (
          <p className="rounded-ledger border-rule bg-surface text-14 border px-4 py-3">
            {due
              ? "Nothing in this stretch."
              : mineOnly
                ? "Nothing on your list."
                : "Nobody has anything on their list."}
          </p>
        ) : (
          due !== "done" &&
          buckets.map((bucket) => (
            <section key={bucket.key} className="flex flex-col gap-2">
              <h2 className="text-12 text-faint font-medium">
                {bucket.label}
                <span className="num"> · {bucket.rows.length}</span>
              </h2>
              <TodoLines
                rows={bucket.rows}
                people={team}
                showOwner={!mineOnly}
              />
            </section>
          ))
        )}

        {(due === "done" || (!due && finished.length > 0)) && (
          <section className="flex flex-col gap-2">
            <h2 className="text-12 text-faint font-medium">
              Done this week
              <span className="num"> · {finished.length}</span>
            </h2>
            {finished.length === 0 ? (
              <p className="rounded-ledger border-rule bg-surface text-14 border px-4 py-3">
                Nothing has been ticked off this week.
              </p>
            ) : (
              <TodoLines rows={finished} people={team} showOwner={!mineOnly} />
            )}
          </section>
        )}
      </ScrollArea>
    </Screen>
  );
}

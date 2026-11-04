import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, scopeOf, branchFilter } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import Initiative, { INITIATIVE_STATUSES } from "@/models/Initiative";
import Client from "@/models/Client";
import { formatISTDate, istInputDate, daysUntil } from "@/lib/dates";
import PageHead from "@/components/ui/PageHead";
import Screen, { ScrollArea } from "@/components/ui/Screen";
import StatTile from "@/components/ui/StatTile";
import AddInitiative from "./AddInitiative";
import InitiativeRows from "./InitiativeRows";

export const metadata = { title: "Initiative clients · PHMG" };
export const dynamic = "force-dynamic";

/**
 * The initiative register (owner request, 04-11-2026).
 *
 * People the firm is in conversation with, before any of them is a client:
 * a name, a number, an email and a line of remarks. The firm has been
 * keeping these in phones and in heads, which is why an enquiry that went
 * quiet is indistinguishable from one nobody followed up.
 *
 * **It is a register, not a pipeline.** No stages, no scores, no
 * probability — three states, and the only one that means anything is
 * *converted*, which this screen cannot award itself: it hands the four
 * fields to onboarding and the wizard links the two records
 * (`createFromOnboarding`). One path into the client list is what makes
 * the duplicate check worth anything.
 *
 * Whose register you read comes from the matrix (`initiatives`, spec §2):
 * a partner the firm's, a CA and an employee their office's, an intern
 * their own.
 */
export default async function InitiativesPage({ searchParams }) {
  const actor = await requireUser();
  if (!can(actor, "view", "initiatives")) redirect("/issues");

  const params = (await searchParams) ?? {};
  const search = String(params.q ?? "").trim();
  const state = INITIATIVE_STATUSES.includes(params.state) ? params.state : "";
  /** The one filter that is not a state: who is owed a call today. */
  const dueNow = params.due === "now";
  const now = new Date();

  await connectDB();

  const scope = scopeOf(actor, "initiatives");
  /**
   * What this person may read. `branchFilter` answers "own" with a branch
   * condition, which is wider than the matrix allows, so the two cases are
   * written out rather than left to it — the same shape `/todos` uses.
   */
  const readable =
    scope === "own"
      ? { createdBy: actor.id }
      : (branchFilter(actor, "initiatives") ?? {});

  /**
   * ponytail: the whole readable register is read in one go and the state
   * filter, the search and the counts are worked out in memory. A firm
   * talks to leads in dozens, not in thousands, and three count queries
   * plus a text index would be three more things to keep in step. If this
   * ever grows past the limit, the tiles become `countDocuments`.
   */
  const rows = await Initiative.find(readable)
    .sort({ updatedAt: -1 })
    .limit(500)
    .lean();

  /** The clients the converted rows became, so the row can link to them. */
  const clientIds = rows.map((row) => row.clientId).filter(Boolean);
  const clients = clientIds.length
    ? await Client.find({ _id: { $in: clientIds } })
        .select("legalName tradeName")
        .lean()
    : [];
  const clientName = new Map(
    clients.map((client) => [
      String(client._id),
      client.tradeName || client.legalName,
    ]),
  );

  const count = (value) => rows.filter((row) => row.status === value).length;

  /**
   * Owed a call: still talking, has a date, and the date is today or gone
   * (owner request, 04-11-2026). A converted or dropped row keeps whatever
   * date it had and is never counted — nobody rings a client back off the
   * lead register.
   */
  const owed = (row) =>
    row.status === "Talking" &&
    row.followUpOn &&
    daysUntil(row.followUpOn, now) <= 0;

  const needle = search.toLowerCase();
  const shown = rows.filter(
    (row) =>
      (!state || row.status === state) &&
      (!dueNow || owed(row)) &&
      (!needle ||
        [row.name, row.mobile, row.email, row.remarks].some((field) =>
          String(field ?? "")
            .toLowerCase()
            .includes(needle),
        )),
  );

  /**
   * The calls first, soonest first; then the conversations with no date on
   * them; then everything settled. The query asked for last-touched order
   * and `sort` is stable, so that is still what orders rows within a band —
   * and the band is what makes the top of the register the morning's work
   * rather than whatever was typed in last.
   */
  const band = (row) => {
    if (row.status !== "Talking") return 2;
    return row.followUpOn ? 0 : 1;
  };
  shown.sort(
    (a, b) =>
      band(a) - band(b) ||
      (band(a) === 0
        ? new Date(a.followUpOn).getTime() - new Date(b.followUpOn).getTime()
        : 0),
  );

  const mayWrite = can(actor, "edit", "initiatives");
  /** Onboarding is a different area: a partner or a CA, not everybody. */
  const mayOnboard = can(actor, "edit", "clients");

  const shape = (row) => ({
    id: String(row._id),
    name: row.name,
    mobile: row.mobile ?? "",
    email: row.email ?? "",
    remarks: row.remarks ?? "",
    status: row.status,
    followUp: row.followUpOn ? formatISTDate(row.followUpOn) : "",
    /* what the date box wants: the IST day, never `toISOString` */
    followUpInput: istInputDate(row.followUpOn),
    /**
     * How late the call is, in words, for the rows where it still means
     * something. Said rather than coloured alone: "3 days late" is read by
     * somebody who cannot tell the red from the amber (D35).
     */
    due:
      row.status === "Talking" && row.followUpOn
        ? dueWords(daysUntil(row.followUpOn, now))
        : null,
    client: row.clientId
      ? {
          id: String(row.clientId),
          name: clientName.get(String(row.clientId)) ?? "the client",
        }
      : null,
    added: formatISTDate(row.createdAt),
    addedBy: row.createdByName ?? "",
    touched: formatISTDate(row.updatedAt),
    /**
     * Whether the controls are drawn. The server checks the same thing
     * again in every action — this only decides what is offered, which is
     * manners rather than security (CLAUDE.md rule 1).
     */
    mayChange:
      mayWrite && (scope !== "own" || String(row.createdBy ?? "") === actor.id),
  });

  /**
   * A link that keeps the search and changes what is being read. The two
   * filters are exclusive on purpose: a tile is one question, and "dropped
   * leads who are owed a call" is not a question anybody has.
   */
  const keep = ({ state: next = "", due = "" } = {}) => {
    const query = new URLSearchParams();
    if (next) query.set("state", next);
    if (due) query.set("due", due);
    if (search) query.set("q", search);
    const tail = query.toString();
    return `/initiatives${tail ? `?${tail}` : ""}`;
  };

  return (
    <Screen>
      <PageHead
        title="Initiative clients"
        sub={
          <>
            People the firm is talking to who are not clients yet. When one says
            yes, <strong>Convert</strong> carries what is here into onboarding —
            nothing becomes a client any other way, so the{" "}
            <Link
              href="/clients"
              className="hover:text-carbon underline underline-offset-4"
            >
              client list
            </Link>{" "}
            stays the one that is checked for duplicates.
          </>
        }
      >
        <Link
          href="/clients/new"
          className="rounded-control border-rule text-14 hover:bg-carbon-wash h-9 border px-3 leading-9"
        >
          New client
        </Link>
      </PageHead>

      <div className="grid shrink-0 grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        {/* the register's opening question, and the reason the date exists */}
        <StatTile
          label="Owed a call"
          value={rows.filter(owed).length}
          note="today or past · whoever wrote it down is emailed"
          tone="late"
          href={keep({ due: "now" })}
          selected={dueNow}
        />
        <StatTile
          label="Talking"
          value={count("Talking")}
          note="in conversation, nothing agreed"
          tone="soon"
          href={keep({ state: "Talking" })}
          selected={state === "Talking"}
        />
        <StatTile
          label="Became clients"
          value={count("Converted")}
          note="onboarded from this register"
          tone="good"
          href={keep({ state: "Converted" })}
          selected={state === "Converted"}
        />
        <StatTile
          label="Not going ahead"
          value={count("Dropped")}
          note="kept, so nobody rings them twice"
          href={keep({ state: "Dropped" })}
          selected={state === "Dropped"}
        />
      </div>

      <form
        method="get"
        action="/initiatives"
        className="flex shrink-0 flex-wrap items-center gap-2"
      >
        {state && <input type="hidden" name="state" value={state} />}
        {dueNow && <input type="hidden" name="due" value="now" />}
        <label className="flex min-w-[14rem] flex-1 items-center">
          <span className="sr-only">Search the register</span>
          <input
            name="q"
            defaultValue={search}
            placeholder="A name, a number, or a word from the remarks"
            className="rounded-control border-rule bg-paper text-13 placeholder:text-faint h-8 w-full border px-2"
          />
        </label>
        <button
          type="submit"
          className="rounded-control border-rule bg-sunk text-13 text-ink h-8 border px-3 font-medium"
        >
          Search
        </button>
        {(search || state || dueNow) && (
          <Link
            href="/initiatives"
            className="rounded-control border-rule text-13 hover:bg-carbon-wash h-8 border px-3 leading-8"
          >
            Clear
          </Link>
        )}
        <span className="num text-12 text-ink-muted ms-auto">
          {shown.length} of {rows.length} shown
        </span>
      </form>

      {mayWrite && <AddInitiative />}

      <ScrollArea>
        <InitiativeRows
          rows={shown.map(shape)}
          mayOnboard={mayOnboard}
          empty={
            rows.length === 0
              ? "Nobody in the register yet. Write down the next enquiry that comes in — a name and a number is enough."
              : dueNow
                ? "Nobody is owed a call today."
                : "Nothing matches that."
          }
        />
      </ScrollArea>
    </Screen>
  );
}

/**
 * How late a follow-up is, in words and in a tone (owner request,
 * 04-11-2026).
 *
 * The words are the information and the colour agrees with them: a column
 * of amber and red tells somebody who can see colour what they already
 * know and tells everybody else nothing, which is the rule the ledger
 * palette carries everywhere else in this application (D35).
 *
 * @param {number} days whole IST days until the date; negative is past
 */
function dueWords(days) {
  if (days < -1) return { words: `${-days} days late`, tone: "text-redpen" };
  if (days === -1) return { words: "yesterday", tone: "text-redpen" };
  if (days === 0) return { words: "today", tone: "text-redpen" };
  if (days === 1) return { words: "tomorrow", tone: "text-waiting" };
  if (days <= 7) return { words: `in ${days} days`, tone: "text-waiting" };
  return { words: `in ${days} days`, tone: "text-ink-muted" };
}

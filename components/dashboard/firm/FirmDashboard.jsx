import Link from "next/link";
import Panel from "@/components/ui/Panel";
import StackedBar from "@/components/ui/StackedBar";
import Chip from "@/components/ui/Chip";
import NeedsAction from "./NeedsAction";
import SignOffQueue from "./SignOffQueue";
import NoticeDiary from "./NoticeDiary";
import Heatmap from "./Heatmap";
import MoneyBand from "./MoneyBand";
import TeamLoad from "./TeamLoad";
import Branches from "./Branches";
import Caught from "./Caught";
import { formatISTDate, formatISTShort, financialYearLabel } from "@/lib/dates";

/**
 * The firm at a glance (P3-34 phase 3), from the owner's design reference.
 *
 * Every section is `null` when the person may not see it, so the same
 * component serves a partner and a CA: a CA gets the work, the queue, the
 * notices and the heatmap, and no Money or Branches, because
 * `firmDashboard()` never fetched them.
 *
 * The order is the reference's, and it is an order: what needs doing, what
 * is in flight, what is waiting on a signature, what falls due, what the
 * money is, who is carrying it, and last the things nobody asked about.
 */
export default function FirmDashboard({ data, user, now, branchNote }) {
  return (
    <div className="flex flex-col gap-6">
      <Header data={data} user={user} now={now} branchNote={branchNote} />

      <NeedsAction tiles={data.needsAction} />

      {data.wip && (
        <Panel
          title="Work in progress"
          count={`${data.wip.total} open ${data.wip.total === 1 ? "job" : "jobs"}`}
          link={{ href: "/engagements?view=board", label: "Open job board" }}
        >
          <StackedBar segments={data.wip.segments} label="Work in progress" />
          {data.wip.onHold > 0 && (
            <p className="text-12 text-ink-muted">
              In progress includes {data.wip.onHold} on hold.
            </p>
          )}
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <SignOffQueue queue={data.review} />
        <NoticeDiary rows={data.notices} />
      </div>

      <Heatmap data={data.terrain} />

      <div className="grid gap-4 lg:grid-cols-2">
        <MoneyBand money={data.money} />
        <TeamLoad team={data.team} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Branches rows={data.branches} />
        <Caught cards={data.caught} />
      </div>
    </div>
  );
}

/** The greeting, the date, and what falls due in the next fortnight. */
function Header({ data, user, now, branchNote }) {
  const first =
    String(user.name ?? "")
      .trim()
      .split(/\s+/)[0] || "there";

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div>
        <h1 className="font-display text-24 font-bold tracking-tight">
          {data.greeting}, {first}
        </h1>
        <p className="text-13 text-ink-muted">
          <span className="num">{formatISTDate(now)}</span> · FY{" "}
          <span className="num">{financialYearLabel(now)}</span>
          {branchNote ? ` · ${branchNote}` : ""}
        </p>
      </div>

      {data.chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {data.chips.map((chip) => (
            <Link key={chip.key} href={chip.href}>
              <Chip tone={chip.tone}>
                {chip.name}{" "}
                <span className="num">{formatISTShort(chip.due)}</span>
                {chip.days <= 1 && (
                  <> · {chip.days === 0 ? "today" : "tomorrow"}</>
                )}
              </Chip>
            </Link>
          ))}
          <Link
            href="/compliance?view=next30"
            className="text-13 text-carbon underline-offset-4 hover:underline"
          >
            Full calendar
          </Link>
        </div>
      )}
    </div>
  );
}

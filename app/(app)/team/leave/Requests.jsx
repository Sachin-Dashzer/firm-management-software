"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saving } from "@/lib/forms/saving";
import Chip from "@/components/ui/Chip";
import {
  applyForLeave,
  markLeave,
  decideLeave,
  withdrawLeave,
} from "./actions";

/**
 * The leave tab: what is waiting, who is away, and the two forms.
 *
 * **The decision and the handover are one form.** A decider's actual
 * question is not "may they go" on its own — it is "may they go, and who
 * picks up the three returns that fall due that week". Splitting those into
 * an approve button and a separate take-over screen is how the second half
 * gets forgotten, so the cover and the work ride on the same submit.
 *
 * Every rule here is also enforced in `actions.js`. A hidden button is not
 * security (CLAUDE.md rule 1); this is manners.
 */

const TONE = { Pending: "soon", Approved: "good", Declined: "late" };

export default function Requests({
  rows,
  people,
  kinds,
  mayDecide,
  ownOnly,
  actorId,
  actorIsPartner,
  ahead,
}) {
  const router = useRouter();
  const [message, setMessage] = useState(null);
  const [open, setOpen] = useState(null);
  const [pending, startTransition] = useTransition();

  function run(action) {
    const answer = action();
    startTransition(async () => {
      const result = await answer;
      setMessage(result);
      if (result?.ok) {
        setOpen(null);
        router.refresh();
      }
    });
    // the answer goes back to the caller: a form clears itself only on a save
    return answer;
  }

  const waiting = rows.filter((row) => row.status === "Pending");
  const away = rows.filter((row) => row.current);
  const coming = rows.filter(
    (row) => row.status === "Approved" && !row.current,
  );
  const declined = rows.filter((row) => row.status === "Declined");

  return (
    <div className="flex flex-col gap-5">
      {message?.ok && (
        <p
          role="status"
          className="rounded-ledger border-filed bg-filed-wash text-13 text-filed border px-3 py-2"
        >
          {message.ok}
        </p>
      )}
      {message?.error && (
        <p
          role="alert"
          className="rounded-ledger border-redpen bg-redpen-wash text-13 text-redpen border px-3 py-2"
        >
          {message.error}
        </p>
      )}

      {/* the whole point of the screen goes first */}
      <Section
        title={mayDecide ? "Waiting on you" : "Waiting on a decision"}
        count={waiting.length}
        empty={
          mayDecide
            ? "Nothing is waiting on a decision."
            : "You have nothing waiting."
        }
      >
        {waiting.map((row) => (
          <Card
            key={row.id}
            row={row}
            people={people}
            mayDecide={mayDecide && (!row.mine || actorIsPartner)}
            mayWithdraw={row.mine}
            open={open}
            setOpen={setOpen}
            pending={pending}
            run={run}
          />
        ))}
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          title="Away now"
          count={away.length}
          empty="Nobody is away today."
        >
          {away.map((row) => (
            <Card
              key={row.id}
              row={row}
              people={people}
              mayDecide={false}
              mayWithdraw={mayDecide}
              open={open}
              setOpen={setOpen}
              pending={pending}
              run={run}
            />
          ))}
        </Section>

        <Section
          title={`Coming up, next ${ahead} days`}
          count={coming.length}
          empty="No leave is booked in the next month."
        >
          {coming.map((row) => (
            <Card
              key={row.id}
              row={row}
              people={people}
              mayDecide={false}
              mayWithdraw={mayDecide}
              open={open}
              setOpen={setOpen}
              pending={pending}
              run={run}
            />
          ))}
        </Section>
      </div>

      {declined.length > 0 && (
        <Section title="Declined" count={declined.length} empty="">
          {declined.map((row) => (
            <Card
              key={row.id}
              row={row}
              people={people}
              mayDecide={false}
              mayWithdraw={false}
              open={open}
              setOpen={setOpen}
              pending={pending}
              run={run}
            />
          ))}
        </Section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Apply
          kinds={kinds}
          people={people}
          actorId={actorId}
          actorIsPartner={actorIsPartner}
          pending={pending}
          run={run}
        />
        {mayDecide && (
          <Mark kinds={kinds} people={people} pending={pending} run={run} />
        )}
      </div>

      {!ownOnly && (
        <p className="text-13 text-ink-muted">
          Past leave stays on each person&rsquo;s record —{" "}
          <Link href="/team" className="underline underline-offset-4">
            the team list
          </Link>{" "}
          is the way to it.
        </p>
      )}
    </div>
  );
}

function Section({ title, count, empty, children }) {
  const rows = Array.isArray(children) ? children.filter(Boolean) : children;
  const none = !rows || (Array.isArray(rows) && rows.length === 0);

  if (none && !empty) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-13 text-ink-muted font-medium">
        {title}
        {!none && Array.isArray(rows) && (
          <span className="num"> · {count}</span>
        )}
      </h2>
      {none ? (
        <p className="rounded-ledger border-rule bg-surface text-14 text-ink-muted border px-4 py-3">
          {empty}
        </p>
      ) : (
        <div className="flex flex-col gap-2">{rows}</div>
      )}
    </section>
  );
}

/** One absence or application, with whatever can be done to it. */
function Card({
  row,
  people,
  mayDecide,
  mayWithdraw,
  open,
  setOpen,
  pending,
  run,
}) {
  const deciding = open === `decide-${row.id}`;
  const declining = open === `decline-${row.id}`;
  const withdrawing = open === `withdraw-${row.id}`;
  const first = row.person.split(" ")[0];

  return (
    <article className="rounded-ledger border-rule bg-surface flex flex-col gap-2 border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-15 flex flex-wrap items-center gap-2 font-medium">
          <Link
            href={`/team/${row.userId}?tab=leave`}
            className="text-carbon underline-offset-4 hover:underline"
          >
            {row.person}
          </Link>
          <Chip tone={TONE[row.status]}>{row.status}</Chip>
          {row.kind === "Exam leave" && <Chip tone="info">Exam leave</Chip>}
        </h3>
        <p className="num text-13 text-ink-muted">
          {row.from} to {row.to} · {row.days} {row.days === 1 ? "day" : "days"}
          {row.status !== "Declined" &&
            !row.current &&
            row.startsIn > 0 &&
            ` · in ${row.startsIn} ${row.startsIn === 1 ? "day" : "days"}`}
        </p>
      </div>

      {/* the reason is the thing a decider reads, so it is not a footnote */}
      {row.note ? (
        <p className="text-14">
          <span className="text-ink-muted">Reason: </span>
          {row.note}
        </p>
      ) : (
        <p className="text-13 text-faint">No reason given.</p>
      )}

      {row.cover ? (
        <p className="text-14">
          Covered by <strong>{row.cover}</strong>
        </p>
      ) : (
        row.status === "Pending" && (
          <p className="text-13 text-waiting">
            Nobody holds the work yet — that is part of approving it.
          </p>
        )
      )}

      {row.decidedByName && (
        <p className="text-12 text-ink-muted">
          {row.status} by {row.decidedByName}
          {row.decidedOn ? ` on ${row.decidedOn}` : ""}
          {row.decisionNote ? ` — ${row.decisionNote}` : ""}
        </p>
      )}

      {row.falls.length === 0 ? (
        <p className="text-13 text-ink-muted">
          Nothing of theirs falls due while they are away.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-13 text-redpen font-medium">
            {row.falls.length}{" "}
            {row.falls.length === 1 ? "job falls" : "jobs fall"} due while they
            are away.
          </p>
          <ul className="flex flex-col gap-0.5">
            {row.falls.map((job) => (
              <li key={job.id} className="text-13">
                <Link
                  href={`/engagements/${job.id}`}
                  className="underline underline-offset-4"
                >
                  {job.client}
                </Link>{" "}
                <span className="text-ink-muted">
                  {job.work} · {job.period} · due{" "}
                  <span className="num">{job.due}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* --- approving, which is also where the work moves --- */}
      {mayDecide && deciding && (
        <form
          onSubmit={saving((formData) => {
            formData.set("decision", "approve");
            return run(() => decideLeave(row.id, formData));
          })}
          className="border-rule flex flex-col gap-3 border-t pt-3"
        >
          <label className="flex flex-col gap-1">
            <span className="text-13 font-medium">
              Who holds {first}&rsquo;s work
            </span>
            <select
              name="coverId"
              required
              defaultValue=""
              className="rounded-control border-rule bg-paper text-14 h-9 border px-2 sm:w-72"
            >
              <option value="">— choose —</option>
              {people
                .filter((person) => person.id !== row.userId)
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name} · {person.role}
                  </option>
                ))}
            </select>
            <span className="text-12 text-ink-muted max-w-[62ch]">
              Naming a cover gives them {first}&rsquo;s rows on Issues and a
              copy of their reminders for the duration. It does{" "}
              <strong>not</strong> give them access to a client they could not
              already open, and on its own it does not move the work.
            </span>
          </label>

          {row.falls.length > 0 && (
            <fieldset className="flex flex-col gap-1">
              <legend className="text-13 font-medium">
                Hand the work over too
              </legend>
              <span className="text-12 text-ink-muted">
                Ticked jobs become the cover&rsquo;s on the record, with the
                same tier rules and the same audit entry as any reassignment.
              </span>
              <div className="flex flex-col gap-1 pt-1">
                {row.falls.map((job) => (
                  <label
                    key={job.id}
                    className="text-13 flex items-start gap-2"
                  >
                    <input
                      type="checkbox"
                      name="reassignIds"
                      value={job.id}
                      defaultChecked
                      className="accent-carbon mt-1"
                    />
                    <span>
                      {job.client}{" "}
                      <span className="text-ink-muted">
                        {job.work} · {job.period} · due{" "}
                        <span className="num">{job.due}</span>
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-13 font-medium">Note (optional)</span>
            <input
              name="decisionNote"
              maxLength={300}
              className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-4 font-medium disabled:opacity-60"
            >
              {pending ? "Approving…" : "Approve the leave"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="rounded-control border-rule bg-surface text-14 h-9 border px-3"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {mayDecide && declining && (
        <form
          onSubmit={saving((formData) => {
            formData.set("decision", "decline");
            return run(() => decideLeave(row.id, formData));
          })}
          className="border-rule flex flex-wrap items-end gap-2 border-t pt-3"
        >
          <label className="flex min-w-[16rem] flex-1 flex-col gap-1">
            <span className="text-13 font-medium">
              Why is it being declined?
            </span>
            <input
              name="decisionNote"
              required
              minLength={3}
              maxLength={300}
              placeholder="The 20th is the GSTR-3B deadline — take the week after"
              className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-control border-redpen text-redpen text-14 h-9 border px-3 disabled:opacity-60"
          >
            {pending ? "Declining…" : "Decline"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(null)}
            className="rounded-control border-rule bg-surface text-14 h-9 border px-3"
          >
            Cancel
          </button>
        </form>
      )}

      {withdrawing && (
        <form
          onSubmit={saving((formData) =>
            run(() => withdrawLeave(row.id, formData.get("reason"))),
          )}
          className="border-rule flex flex-wrap items-end gap-2 border-t pt-3"
        >
          <label className="flex min-w-[16rem] flex-1 flex-col gap-1">
            <span className="text-13 font-medium">
              Why is it being withdrawn?
            </span>
            <input
              name="reason"
              required
              minLength={3}
              className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-control border-rule bg-surface text-14 h-9 border px-3 disabled:opacity-60"
          >
            Withdraw
          </button>
          <button
            type="button"
            onClick={() => setOpen(null)}
            className="rounded-control border-rule bg-surface text-14 h-9 border px-3"
          >
            Leave it
          </button>
        </form>
      )}

      {!deciding && !declining && !withdrawing && (
        <div className="flex flex-wrap gap-2 pt-1">
          {mayDecide && (
            <>
              <button
                type="button"
                onClick={() => setOpen(`decide-${row.id}`)}
                className="rounded-control bg-carbon text-13 text-on-carbon h-8 px-3 font-medium"
              >
                Approve…
              </button>
              <button
                type="button"
                onClick={() => setOpen(`decline-${row.id}`)}
                className="rounded-control border-rule text-13 hover:border-redpen hover:text-redpen h-8 border px-3"
              >
                Decline…
              </button>
            </>
          )}
          {mayWithdraw && (
            <button
              type="button"
              onClick={() => setOpen(`withdraw-${row.id}`)}
              className="rounded-control border-rule text-13 text-ink-muted hover:text-ink h-8 border px-3"
            >
              Withdraw
            </button>
          )}
        </div>
      )}
    </article>
  );
}

/** Anybody, for themselves. */
function Apply({ kinds, people, actorId, actorIsPartner, pending, run }) {
  return (
    <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
      <div>
        <h2 className="font-display text-15 font-semibold">Apply for leave</h2>
        <p className="text-13 text-ink-muted">
          {actorIsPartner
            ? "You are a partner, so there is nobody to ask — this is recorded as approved."
            : "A CA or a partner decides it. You will see the answer here."}
        </p>
      </div>

      <form
        onSubmit={saving((formData) =>
          run(() => applyForLeave(null, formData)),
        )}
        className="flex flex-col gap-3"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-13 font-medium">First day away</span>
            <input
              type="date"
              name="from"
              required
              className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-13 font-medium">Last day away</span>
            <input
              type="date"
              name="to"
              required
              className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
            />
            <span className="text-12 text-ink-muted">
              Both days count — the last day you are not here.
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-13 font-medium">Kind</span>
            <select
              name="kind"
              defaultValue="Leave"
              className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
            >
              {kinds.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-13 font-medium">
              Who could hold your work
              {actorIsPartner ? "" : " (optional)"}
            </span>
            <select
              name="coverId"
              required={actorIsPartner}
              defaultValue=""
              className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
            >
              <option value="">— the decider will name somebody —</option>
              {people
                .filter((person) => person.id !== actorId)
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name} · {person.role}
                  </option>
                ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-13 font-medium">Reason</span>
          <input
            name="note"
            required
            minLength={3}
            maxLength={300}
            placeholder="Sister's wedding in Dehradun"
            className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
          />
        </label>

        <div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-4 font-medium disabled:opacity-60"
          >
            {pending ? "Sending…" : actorIsPartner ? "Record it" : "Apply"}
          </button>
        </div>
      </form>
    </section>
  );
}

/** A CA or a Partner, for somebody else — the leave that arrives by phone. */
function Mark({ kinds, people, pending, run }) {
  const [person, setPerson] = useState("");

  return (
    <section className="rounded-ledger border-rule bg-surface flex flex-col gap-3 border p-4">
      <div>
        <h2 className="font-display text-15 font-semibold">
          Mark somebody&rsquo;s leave
        </h2>
        <p className="text-13 text-ink-muted">
          For the leave that arrives as a phone call. Recorded as approved, with
          your name on it.
        </p>
      </div>

      <form
        onSubmit={saving((formData) => run(() => markLeave(null, formData)))}
        className="flex flex-col gap-3"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-13 font-medium">Who is away</span>
            <select
              name="userId"
              required
              value={person}
              onChange={(event) => setPerson(event.target.value)}
              className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
            >
              <option value="">— choose —</option>
              {people.map((one) => (
                <option key={one.id} value={one.id}>
                  {one.name} · {one.role}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-13 font-medium">Who holds their work</span>
            <select
              name="coverId"
              required
              defaultValue=""
              className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
            >
              <option value="">— choose —</option>
              {people
                .filter((one) => one.id !== person)
                .map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.name} · {one.role}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-13 font-medium">First day away</span>
            <input
              type="date"
              name="from"
              required
              className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-13 font-medium">Last day away</span>
            <input
              type="date"
              name="to"
              required
              className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-13 font-medium">Kind</span>
            <select
              name="kind"
              defaultValue="Leave"
              className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
            >
              {kinds.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-13 font-medium">Reason (optional)</span>
            <input
              name="note"
              maxLength={300}
              className="rounded-control border-rule bg-paper text-14 h-9 border px-2"
            />
          </label>
        </div>

        <div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-control bg-carbon text-14 text-on-carbon h-9 px-4 font-medium disabled:opacity-60"
          >
            {pending ? "Recording…" : "Record it"}
          </button>
        </div>
      </form>
    </section>
  );
}

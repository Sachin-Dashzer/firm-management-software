"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Chip from "@/components/ui/Chip";
import {
  TableShell,
  Table,
  Head,
  Th,
  Tr,
  Td,
  Meta,
  Empty,
} from "@/components/ui/Table";
import {
  updatePotential,
  setPotentialStatus,
  removePotential,
} from "./actions";

/**
 * The register itself (owner request, 04-11-2026).
 *
 * Four columns, and the third one is editable in place. That is the whole
 * design decision here: the remarks and the follow-up date are the only
 * fields that change after a row is written, they change after every
 * phone call, and a register where updating them means opening a record is
 * a register that holds what was true in March. The Save button only
 * appears once the cell has the focus, so a column of rows is not a column
 * of buttons.
 *
 * **The two share one form** (04-11-2026), because they are one act: you
 * put the phone down, you write what was said and when to ring again. One
 * save, one audit entry, and no way to save half of it.
 *
 * **Convert is a link, not an action.** It goes to the onboarding wizard
 * with the four fields carried over, because a client needs an entity
 * type, a branch, a partner, services and fees — none of which a
 * conversation has — and inventing them here would put records in the
 * client list that the duplicate check and the engagement pack cannot
 * trust. The wizard marks this row on its way out.
 */
export default function PotentialRows({ rows, mayOnboard, empty }) {
  const router = useRouter();
  const [message, setMessage] = useState(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(null);
  const [asking, setAsking] = useState(null);

  function run(id, action) {
    setBusy(id);
    startTransition(async () => {
      const result = await action();
      setMessage(result);
      setBusy(null);
      setAsking(null);
      if (result?.ok) router.refresh();
    });
  }

  const quiet =
    "rounded-control border-rule text-12 hover:bg-carbon-wash h-7 border px-2 font-medium disabled:opacity-60";

  return (
    <div className="flex flex-col gap-2">
      {message?.error && (
        <p
          role="alert"
          className="rounded-ledger border-redpen bg-redpen-wash text-13 text-redpen border px-3 py-2"
        >
          {message.error}
        </p>
      )}
      {message?.ok && (
        <p
          role="status"
          className="rounded-ledger border-filed bg-filed-wash text-13 text-filed border px-3 py-2"
        >
          {message.ok}
        </p>
      )}

      <TableShell>
        <Table caption="People the firm is talking to who are not clients yet">
          <Head>
            <Th>Who</Th>
            <Th>How to reach them</Th>
            <Th>Remarks and the next call</Th>
            <Th align="right">&nbsp;</Th>
          </Head>
          <tbody>
            {rows.map((row) => (
              <Tr key={row.id}>
                <Td>
                  <span className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium">{row.name}</span>
                    {row.status === "Converted" && (
                      <Chip tone="good">A client now</Chip>
                    )}
                    {row.status === "Dropped" && (
                      <Chip tone="neutral">Not going ahead</Chip>
                    )}
                  </span>
                  <Meta>
                    {row.addedBy ? `${row.addedBy} · ` : ""}
                    <span className="num">{row.added}</span>
                    {row.touched !== row.added && (
                      <>
                        {" · last touched "}
                        <span className="num">{row.touched}</span>
                      </>
                    )}
                  </Meta>
                  {row.client && (
                    <Meta>
                      <Link
                        href={`/clients/${row.client.id}`}
                        className="hover:text-carbon underline underline-offset-4"
                      >
                        {row.client.name}
                      </Link>
                    </Meta>
                  )}
                </Td>

                <Td>
                  {row.mobile && (
                    <a
                      href={`tel:+91${row.mobile}`}
                      className="num text-14 block underline underline-offset-4"
                    >
                      {row.mobile}
                    </a>
                  )}
                  {row.email && (
                    <a
                      href={`mailto:${row.email}`}
                      className="text-13 text-ink-muted block break-all underline underline-offset-4"
                    >
                      {row.email}
                    </a>
                  )}
                </Td>

                <Td className="min-w-[18rem]">
                  {row.mayChange ? (
                    <form
                      className="group flex flex-col gap-1.5"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const fields = new FormData(event.currentTarget);
                        run(row.id, () => updatePotential(row.id, fields));
                      }}
                    >
                      <label>
                        <span className="sr-only">Remarks for {row.name}</span>
                        <textarea
                          name="remarks"
                          rows={2}
                          maxLength={2000}
                          defaultValue={row.remarks}
                          placeholder="What was said on the last call"
                          className="rounded-control border-rule bg-paper text-13 placeholder:text-faint w-full resize-y border px-2 py-1"
                        />
                      </label>
                      <span className="flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-1.5">
                          <span className="text-12 text-ink-muted">
                            Next call
                          </span>
                          <input
                            type="date"
                            name="followUp"
                            defaultValue={row.followUpInput}
                            aria-label={`Ring ${row.name} back on`}
                            className="rounded-control border-rule bg-paper text-12 num h-7 border px-1.5"
                          />
                        </label>
                        {row.due && (
                          <span
                            className={`text-12 font-medium ${row.due.tone}`}
                          >
                            {row.due.words}
                          </span>
                        )}
                        <button
                          type="submit"
                          disabled={pending && busy === row.id}
                          className={`${quiet} ms-auto shrink-0 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-focus-within:opacity-100`}
                        >
                          Save
                        </button>
                      </span>
                    </form>
                  ) : (
                    <>
                      <span className="text-13 block whitespace-pre-line">
                        {row.remarks || <span className="text-faint">—</span>}
                      </span>
                      {row.followUp && (
                        <span className="text-12 text-ink-muted mt-1 block">
                          Next call <span className="num">{row.followUp}</span>
                          {row.due && (
                            <span className={`font-medium ${row.due.tone}`}>
                              {" · "}
                              {row.due.words}
                            </span>
                          )}
                        </span>
                      )}
                    </>
                  )}
                </Td>

                <Td align="right">
                  <span className="flex flex-wrap items-center justify-end gap-2">
                    {row.status !== "Converted" && mayOnboard && (
                      <Link
                        href={`/clients/new?from=${row.id}`}
                        className="rounded-control bg-carbon text-12 text-on-carbon h-7 px-2 leading-7 font-medium"
                      >
                        Convert to client
                      </Link>
                    )}

                    {row.mayChange && row.status === "Talking" && (
                      <button
                        type="button"
                        disabled={pending && busy === row.id}
                        onClick={() =>
                          run(row.id, () =>
                            setPotentialStatus(row.id, "Dropped"),
                          )
                        }
                        className={quiet}
                      >
                        Not going ahead
                      </button>
                    )}
                    {row.mayChange && row.status === "Dropped" && (
                      <button
                        type="button"
                        disabled={pending && busy === row.id}
                        onClick={() =>
                          run(row.id, () =>
                            setPotentialStatus(row.id, "Talking"),
                          )
                        }
                        className={quiet}
                      >
                        Still talking
                      </button>
                    )}

                    {row.mayChange &&
                      (asking === row.id ? (
                        /* a row typed in twice is worth removing; a lead who
                           said no is "not going ahead" and stays in sight,
                           so this asks which one is meant */
                        <>
                          <button
                            type="button"
                            disabled={pending && busy === row.id}
                            onClick={() =>
                              run(row.id, () => removePotential(row.id))
                            }
                            className="rounded-control border-redpen text-redpen text-12 h-7 border px-2 font-medium disabled:opacity-60"
                          >
                            Yes, remove it
                          </button>
                          <button
                            type="button"
                            onClick={() => setAsking(null)}
                            className={quiet}
                          >
                            Keep
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAsking(row.id)}
                          className="text-12 text-ink-muted hover:text-redpen h-7 px-1 font-medium"
                        >
                          Remove
                        </button>
                      ))}
                  </span>
                </Td>
              </Tr>
            ))}

            {rows.length === 0 && <Empty colSpan={4}>{empty}</Empty>}
          </tbody>
        </Table>
      </TableShell>
    </div>
  );
}

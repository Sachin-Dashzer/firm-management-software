"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPaise } from "@/lib/money";
import FeeScope from "@/components/billing/FeeScope";
import Chip from "@/components/ui/Chip";
import Notice, { Result } from "@/components/ui/Notice";
import FilterChip from "@/components/ui/FilterChip";
import SearchBox, { matches } from "@/components/ui/SearchBox";
import {
  TableShell,
  Table,
  Head,
  Th,
  Tr,
  Td,
  Meta,
  Num,
  Foot,
  Empty,
} from "@/components/ui/Table";

/**
 * Finished work nobody has billed, and the one place the firm decides what
 * each job is worth (P3-4).
 *
 * Retainer and waived work stays on this list with its reason rather than
 * dropping off it. A list that shrinks when a fee is waived cannot be
 * reconciled against the work that was done — and the waiver is precisely
 * what a peer reviewer asks to see.
 *
 * The rows a partner has to decide about sort to the top and the count says
 * so, but the buttons stay on the row. One action in one place: the same
 * screen offering Approve twice is the thing P3-8 exists to stop.
 *
 * Redrawn 02-11-2026: the three groups on this list — waiting on a
 * partner, chargeable, settled another way — were a paragraph of prose
 * above one undifferentiated table. They are chips now, so the list can be
 * narrowed to the one that is being worked through, and the money sits in
 * its own right-aligned column with the page's total under it.
 */
export default function UnbilledWork({
  rows,
  canPrice,
  isPartner,
  whyNoPricing = null,
}) {
  const router = useRouter();
  const [message, setMessage] = useState(null);
  const [only, setOnly] = useState("all");
  const [query, setQuery] = useState("");

  function onResult(result) {
    setMessage(result);
    if (result?.ok) router.refresh();
  }

  const waiting = rows.filter((r) => r.waiver);
  const chargeable = rows.filter((r) => r.scope === "billable");
  const settled = rows.filter((r) => r.scope !== "billable");
  const billableTotal = chargeable.reduce((sum, r) => sum + r.feePaise, 0);

  const visible = useMemo(() => {
    const group =
      only === "waiting"
        ? waiting
        : only === "chargeable"
          ? chargeable
          : only === "settled"
            ? settled
            : rows;
    return group.filter((row) =>
      matches([row.client, row.work, row.period, row.stateLabel], query),
    );
  }, [rows, waiting, chargeable, settled, only, query]);

  const shownTotal = visible.reduce(
    (sum, r) => sum + (r.scope === "billable" ? r.feePaise : 0),
    0,
  );

  return (
    <div className="flex flex-col gap-4">
      <Result message={message} />

      {waiting.length > 0 && (
        <Notice
          tone="warn"
          title={
            waiting.length === 1
              ? "One fee waiver is waiting for a partner"
              : `${waiting.length} fee waivers are waiting for a partner`
          }
        >
          <p>
            {isPartner
              ? "They are at the top of the list, with the reason the staff member gave."
              : "A partner has to approve each one before the job leaves this list."}
          </p>
        </Notice>
      )}

      <p className="text-14">
        <strong className="num">{rows.length}</strong>{" "}
        {rows.length === 1 ? "job is" : "jobs are"} finished and not billed.{" "}
        <strong className="num">{formatPaise(billableTotal)}</strong> of that is
        chargeable before tax
        {settled.length > 0 && (
          <>
            ; {settled.length} {settled.length === 1 ? "job is" : "jobs are"}{" "}
            settled another way and {settled.length === 1 ? "stays" : "stay"}{" "}
            here with the reason
          </>
        )}
        .
      </p>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip
            on={only === "all"}
            onClick={() => setOnly("all")}
            count={rows.length}
          >
            All
          </FilterChip>
          {waiting.length > 0 && (
            <FilterChip
              on={only === "waiting"}
              onClick={() => setOnly("waiting")}
              count={waiting.length}
            >
              Waiting on a partner
            </FilterChip>
          )}
          <FilterChip
            on={only === "chargeable"}
            onClick={() => setOnly("chargeable")}
            count={chargeable.length}
          >
            Chargeable
          </FilterChip>
          <FilterChip
            on={only === "settled"}
            onClick={() => setOnly("settled")}
            count={settled.length}
          >
            Settled another way
          </FilterChip>
        </div>

        <span className="flex items-center gap-3">
          <SearchBox
            value={query}
            onChange={setQuery}
            label="Search this list"
          />
          <span className="num text-12 text-ink-muted shrink-0">
            {visible.length === rows.length
              ? `${rows.length} shown`
              : `${visible.length} of ${rows.length}`}
          </span>
        </span>
      </div>

      <TableShell>
        <Table fixed caption="Work finished and not billed, waivers first">
          <colgroup>
            <col className="w-[14rem]" />
            <col />
            <col className="w-[8rem]" />
            <col className="w-[9.5rem]" />
            <col className="w-[26rem]" />
          </colgroup>
          <Head>
            <Th>Client</Th>
            <Th>Work</Th>
            <Th>Finished</Th>
            <Th align="right" rule>
              Fee
            </Th>
            <Th>How it is paid for</Th>
          </Head>
          <tbody>
            {visible.map((r) => (
              <Tr key={r.id}>
                <Td className="truncate">
                  <Link
                    href={`/clients/${r.clientId}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {r.client}
                  </Link>
                </Td>
                <Td className="text-13">
                  <Link
                    href={`/engagements/${r.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {r.work}
                  </Link>
                  <Meta>{r.period}</Meta>
                </Td>
                <Td className="num text-13 text-ink-muted">
                  {r.finished || "—"}
                </Td>
                <Td align="right" rule>
                  <Num paise={r.feePaise} strong={r.scope === "billable"} />
                </Td>
                <Td className="text-13">
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    {r.blocked ? (
                      <Chip tone="late">{r.stateLabel}</Chip>
                    ) : r.scope === "billable" ? (
                      <Chip tone="good">{r.stateLabel}</Chip>
                    ) : (
                      <Chip tone="neutral">{r.stateLabel}</Chip>
                    )}
                    {r.stateDetail && (
                      <span className="text-ink-muted">{r.stateDetail}</span>
                    )}
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-3">
                    <FeeScope
                      money={r}
                      canPrice={canPrice}
                      isPartner={isPartner}
                      whyNoPricing={whyNoPricing}
                      onResult={onResult}
                    />
                    {!r.blocked && r.scope === "billable" && (
                      <Link
                        href={`/invoices/new?client=${r.clientId}`}
                        className="rounded-control border-carbon text-13 text-carbon hover:bg-carbon-wash h-8 border px-2.5 leading-8 font-medium"
                      >
                        Bill it
                      </Link>
                    )}
                  </span>
                </Td>
              </Tr>
            ))}
            {visible.length === 0 && (
              <Empty colSpan={5}>
                {rows.length === 0
                  ? "Everything finished has been billed."
                  : query.trim()
                    ? `Nothing here matches “${query.trim()}”.`
                    : "Nothing in this group."}
              </Empty>
            )}
          </tbody>
          {visible.length > 0 && (
            <Foot>
              <Td colSpan={3} className="text-ink-muted">
                Chargeable in what is shown
              </Td>
              <Td align="right" rule>
                <Num paise={shownTotal} strong />
              </Td>
              <Td />
            </Foot>
          )}
        </Table>
      </TableShell>
    </div>
  );
}

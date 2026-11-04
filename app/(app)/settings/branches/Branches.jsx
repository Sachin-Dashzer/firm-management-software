"use client";

import { saving } from "@/lib/forms/saving";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateBranch } from "./actions";
import { Result } from "@/components/ui/Notice";
import SettingsScreen from "../Shell";
import Notice from "@/components/ui/Notice";
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

/**
 * The offices, and the registration each one bills under.
 *
 * **A table, as of 04-11-2026.** This was four bordered cards stacked down
 * an 820px column, each repeating the same six labels — GSTIN, Supplying
 * from, Address, Series — so the one question the screen exists to answer
 * ("which office cannot raise an invoice?") took four separate readings
 * instead of one glance down a column. Four records with the same six
 * fields is the definition of a table, and `components/ui/Table` already
 * draws the firm's.
 *
 * Editing stays **in the row**. Two fields and no destructive consequence
 * is not worth a dialog, and the GSTIN beside it is the thing somebody is
 * copying from.
 *
 * A branch with no GSTIN is called out twice on purpose: once in the band
 * at the top, which explains what it costs, and once as a marked row, so
 * the explanation and the offending record are never on different screens.
 */
export default function Branches({ rows }) {
  const router = useRouter();
  const [message, setMessage] = useState(null);
  const [editing, setEditing] = useState(null);
  const [pending, startTransition] = useTransition();

  const missing = rows.filter((r) => !r.gstin);

  return (
    <SettingsScreen
      wide
      title="Offices"
      sub={
        rows.length
          ? `${rows.length} ${rows.length === 1 ? "office" : "offices"}, each billing under its own GST registration and its own invoice series.`
          : "Each office bills under its own GST registration and its own invoice series."
      }
    >
      {missing.length > 0 && (
        <Notice
          tone="warn"
          title={
            missing.length === rows.length
              ? "No office has a GSTIN yet."
              : `${missing.length} ${missing.length === 1 ? "office has" : "offices have"} no GSTIN.`
          }
        >
          <p>
            The first two digits of the GSTIN say which state is supplying,
            which decides whether an invoice carries CGST and SGST or IGST.
            Until an office has one, its invoices can be drafted but not issued.
            If the firm bills everything under a single registration, put that
            same GSTIN on each office.
          </p>
        </Notice>
      )}

      <Result message={message} />

      <TableShell>
        <Table caption="Offices, their GST registrations and their invoice series">
          <colgroup>
            <col className="w-[22%]" />
            <col className="w-[26%]" />
            <col />
            <col className="w-[20%]" />
            <col className="w-[72px]" />
          </colgroup>
          <Head>
            <Th>Office</Th>
            <Th>GST registration</Th>
            <Th>Address on the invoice</Th>
            <Th rule align="right">
              Invoice series
            </Th>
            <Th>
              <span className="sr-only">Edit</span>
            </Th>
          </Head>
          <tbody>
            {rows.length === 0 && (
              <Empty colSpan={5}>
                No offices yet. They are created by the first-run seed — see
                Settings → Setting the firm up.
              </Empty>
            )}

            {rows.map((branch) =>
              editing === branch.id ? (
                <Tr key={branch.id}>
                  {/* the editing row gives its whole width to the form:
                      two inputs in table cells would inherit the column
                      widths the reading needs, not the ones typing does */}
                  <Td colSpan={5} className="bg-sunk">
                    <form
                      onSubmit={saving((formData) =>
                        startTransition(async () => {
                          setMessage(await updateBranch(branch.id, formData));
                          setEditing(null);
                          router.refresh();
                        }),
                      )}
                      className="flex flex-col gap-3"
                    >
                      <p className="text-13 text-ink-muted">
                        Editing <span className="text-ink">{branch.name}</span>{" "}
                        <span className="num">{branch.code}</span>
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1">
                          <span className="text-13 font-medium">GSTIN</span>
                          <input
                            name="gstin"
                            defaultValue={branch.gstin}
                            maxLength={15}
                            autoFocus
                            placeholder="09AABCS1429P1ZZ"
                            className="rounded-control border-rule bg-surface text-14 focus:border-carbon h-9 border px-2 font-mono uppercase outline-none"
                          />
                          <span className="text-12 text-ink-muted">
                            Checked properly, not just for shape.
                          </span>
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-13 font-medium">
                            Address on the invoice
                          </span>
                          <input
                            name="address"
                            defaultValue={branch.address}
                            className="rounded-control border-rule bg-surface text-14 focus:border-carbon h-9 border px-2 outline-none"
                          />
                          <span className="text-12 text-ink-muted">
                            Printed on every invoice this office raises.
                          </span>
                        </label>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="submit"
                          disabled={pending}
                          className="rounded-control bg-carbon text-14 text-on-carbon hover:bg-carbon-ink h-9 px-3 font-medium transition-colors duration-150 disabled:opacity-60"
                        >
                          {pending ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(null)}
                          disabled={pending}
                          className="text-14 text-ink-muted hover:text-ink underline underline-offset-4 disabled:opacity-60"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </Td>
                </Tr>
              ) : (
                <Tr
                  key={branch.id}
                  tint={branch.gstin ? "" : "bg-waiting-soft"}
                >
                  <Td>
                    <span className="font-medium">{branch.name}</span>
                    <Meta className="num">{branch.code}</Meta>
                  </Td>
                  <Td>
                    {branch.gstin ? (
                      <>
                        <span className="num">{branch.gstin}</span>
                        {branch.stateName && (
                          <Meta>Supplying from {branch.stateName}</Meta>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="text-waiting font-medium">
                          not set
                        </span>
                        <Meta>Cannot issue a tax invoice</Meta>
                      </>
                    )}
                  </Td>
                  <Td className="text-ink-muted">
                    {branch.address || <span className="text-faint">—</span>}
                  </Td>
                  <Td rule align="right">
                    <span className="num">{branch.series}</span>
                    {/* "at 1" was the counter's position, which reads as a
                        code beside "none issued yet". Both say the same
                        kind of thing now: how many have gone out. */}
                    <Meta>
                      {branch.issued ? (
                        <>
                          <span className="num">{branch.issued}</span> issued
                        </>
                      ) : (
                        "none issued yet"
                      )}
                    </Meta>
                  </Td>
                  <Td align="right">
                    <button
                      type="button"
                      onClick={() => setEditing(branch.id)}
                      className="text-13 text-carbon hover:text-carbon-ink underline underline-offset-4"
                    >
                      Edit
                      <span className="sr-only"> {branch.name}</span>
                    </button>
                  </Td>
                </Tr>
              ),
            )}
          </tbody>
        </Table>
      </TableShell>
    </SettingsScreen>
  );
}

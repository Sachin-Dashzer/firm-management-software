"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Chip from "@/components/ui/Chip";
import {
  Head,
  Meta,
  Table,
  TableShell,
  Td,
  Th,
  Tr,
} from "@/components/ui/Table";
import { Trash } from "@phosphor-icons/react";
import { formatSize } from "@/lib/documents/rows";
import { fyLabel } from "@/lib/folders/paths";
import { bulkDelete, bulkSetKind, bulkShare } from "./bulk";
import { deleteDocument } from "./actions";
import PreviewDrawer from "./PreviewDrawer";

/**
 * The file register (P3-48e).
 *
 * The flat list over the same records the drive shows as folders — because
 * the two questions are different. A drive answers "where did we put the
 * April statements"; this answers "what have we got for this client, and
 * what of it has the client seen".
 *
 * **Selection is the whole reason this screen is a table.** One file is
 * better handled where it lives; thirty files, of one kind, across four
 * clients, is a job for a list with tick boxes — so the bulk bar appears
 * with the first tick and says exactly what it did, refusals included.
 */
export default function FileTable({
  rows = [],
  mayEdit = false,
  mayShare = false,
}) {
  const router = useRouter();
  const [picked, setPicked] = useState(() => new Set());
  const [open, setOpen] = useState(null);
  const [message, setMessage] = useState(null);
  const [kind, setKind] = useState("");
  const [pending, start] = useTransition();

  const chosen = [...picked];
  const allOn = rows.length > 0 && chosen.length === rows.length;

  function toggle(id) {
    setPicked((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function act(run) {
    setMessage(null);
    start(async () => {
      const result = await run(chosen);
      setMessage(result);
      if (result?.done) {
        setPicked(new Set());
        router.refresh();
      }
    });
  }

  /**
   * One file, through the same action a tick box full of them goes through.
   *
   * No "are you sure?": the bin *is* the undo, it says so in the message,
   * and this screen already bins a selection on a single click. The ask is
   * kept for what cannot be taken back, like issuing an invoice number.
   */
  function binOne(row) {
    setMessage(null);
    start(async () => {
      const result = await deleteDocument(row.id);
      setMessage(result);
      if (result?.ok) {
        setPicked((was) => {
          const next = new Set(was);
          next.delete(row.id);
          return next;
        });
        router.refresh();
      }
    });
  }

  if (rows.length === 0) {
    return (
      <p className="text-13 text-ink-muted rounded-ledger border-rule border border-dashed px-3 py-8 text-center">
        No file matches these filters. Take one off, or search for the name.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {chosen.length > 0 && (
        <div className="rounded-ledger border-carbon/40 bg-carbon-soft flex flex-wrap items-center gap-2 border px-3 py-2">
          <span className="text-13 font-medium">{chosen.length} chosen</span>

          {mayShare && (
            <>
              <Act
                onClick={() => act((ids) => bulkShare(ids, true))}
                pending={pending}
              >
                Share with the client
              </Act>
              <Act
                onClick={() => act((ids) => bulkShare(ids, false))}
                pending={pending}
              >
                Stop sharing
              </Act>
            </>
          )}

          {mayEdit && (
            <>
              <span className="flex items-center gap-1">
                <input
                  value={kind}
                  onChange={(event) => setKind(event.target.value)}
                  placeholder="PAN card"
                  aria-label="Say what these papers are"
                  className="rounded-control border-rule bg-paper text-13 h-8 w-32 border px-2"
                />
                <Act
                  onClick={() => act((ids) => bulkSetKind(ids, kind))}
                  pending={pending || !kind.trim()}
                >
                  Set what they are
                </Act>
              </span>
              <Act
                onClick={() => act((ids) => bulkDelete(ids))}
                pending={pending}
                tone="border-redpen text-redpen"
              >
                To the recycle bin
              </Act>
            </>
          )}

          <button
            type="button"
            onClick={() => setPicked(new Set())}
            className="text-13 ml-auto underline underline-offset-4"
          >
            Clear
          </button>
        </div>
      )}

      {message?.ok && (
        <p role="status" className="text-13 text-filed">
          {message.ok}
        </p>
      )}
      {message?.error && (
        <p role="alert" className="text-13 text-redpen">
          {message.error}
        </p>
      )}

      {/*
        The app's own table kit, not a hand-written one. Every other list
        here sets its rows at px-4 py-3 under a tinted header band, and a
        register a little denser than the rest of the app is exactly the
        kind of difference a person feels without being able to name it.
      */}
      <TableShell>
        {/*
          Widths on the short columns only, and no `fixed`: with the table
          laid out from the colgroup, the one unsized column — the file's
          name — was left about 30px and its text printed over the client's.
          Named like this the browser gives the name whatever is spare.
        */}
        <Table caption="Every file that matches these filters">
          <colgroup>
            <col className="w-10" />
            <col className="w-[22rem]" />
            <col className="w-[11rem]" />
            <col className="w-[13rem]" />
            <col className="w-[6.5rem]" />
            <col className="w-[5.5rem]" />
            <col className="w-[5.5rem]" />
            <col className="w-[9rem]" />
            <col className="w-[7rem]" />
            {mayEdit && <col className="w-12" />}
          </colgroup>
          <Head>
            <Th className="w-10">
              <input
                type="checkbox"
                checked={allOn}
                aria-label="Choose every file on this page"
                onChange={() =>
                  setPicked(allOn ? new Set() : new Set(rows.map((r) => r.id)))
                }
              />
            </Th>
            <Th>File</Th>
            <Th>Client</Th>
            <Th>Where it sits</Th>
            <Th>FY</Th>
            <Th>Whose</Th>
            <Th align="right">Size</Th>
            <Th>Put up by</Th>
            <Th align="right">Added</Th>
            {mayEdit && (
              <Th align="right">
                <span className="sr-only">Delete</span>
              </Th>
            )}
          </Head>
          <tbody>
            {rows.map((row) => (
              <Tr
                key={row.id}
                className="group/row"
                tint={picked.has(row.id) ? "bg-carbon-soft" : ""}
              >
                <Td>
                  <input
                    type="checkbox"
                    checked={picked.has(row.id)}
                    onChange={() => toggle(row.id)}
                    aria-label={`Choose ${row.name}`}
                  />
                </Td>
                <Td>
                  <button
                    type="button"
                    onClick={() => setOpen(row)}
                    className="text-left font-medium underline-offset-4 hover:underline"
                  >
                    {row.name}
                  </button>
                  <Meta className="flex flex-wrap items-center gap-1.5">
                    {/* nothing rather than an em dash: a column of them is
                        noise that reads as information */}
                    {row.kind}
                    {row.shared && <Chip tone="good">shared</Chip>}
                    {row.versions > 0 && (
                      <span className="num">
                        {row.versions} earlier{" "}
                        {row.versions === 1 ? "copy" : "copies"}
                      </span>
                    )}
                    {row.redacted && <Chip tone="late">erased</Chip>}
                  </Meta>
                </Td>
                <Td className="text-13">
                  <Link
                    href={`/clients/${row.clientId}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {row.client}
                  </Link>
                </Td>
                <Td className="text-13">
                  {row.folderHref ? (
                    <Link
                      href={row.folderHref}
                      className="underline-offset-4 hover:underline"
                      title="Show it in the work drive"
                    >
                      {row.where}
                    </Link>
                  ) : (
                    row.where
                  )}
                </Td>
                <Td className="num text-13 whitespace-nowrap">
                  {row.fy ? fyLabel(row.fy) : "—"}
                </Td>
                <Td className="text-13">
                  {row.origin === "firm" ? "Ours" : "Client's"}
                </Td>
                <Td align="right" className="num text-13 whitespace-nowrap">
                  {formatSize(row.size)}
                </Td>
                <Td className="text-13">
                  <span className="block truncate" title={row.uploadedByName}>
                    {row.uploadedByName || "—"}
                  </span>
                </Td>
                <Td align="right" className="num text-13 whitespace-nowrap">
                  {row.added}
                </Td>
                {mayEdit && (
                  <Td align="right">
                    {/*
                      Faint until the row is under the pointer, so a column
                      of red bins is not the first thing the eye lands on —
                      but always there for the keyboard, which cannot hover.
                    */}
                    <button
                      type="button"
                      onClick={() => binOne(row)}
                      disabled={pending}
                      title={`Send ${row.name} to the recycle bin`}
                      aria-label={`Send ${row.name} to the recycle bin`}
                      className="rounded-control text-ink-muted hover:border-redpen/40 hover:text-redpen focus-visible:text-redpen inline-flex h-7 w-7 items-center justify-center border border-transparent opacity-0 transition duration-150 ease-out group-hover/row:opacity-100 focus-visible:opacity-100 disabled:opacity-30"
                    >
                      <Trash size={15} />
                    </button>
                  </Td>
                )}
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableShell>

      {open && (
        <PreviewDrawer
          file={open}
          mayEdit={mayEdit}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function Act({ onClick, pending, tone = "border-rule", children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={`rounded-control hover:bg-surface text-13 h-8 border px-3 transition-colors duration-150 ease-out disabled:opacity-50 ${tone}`}
    >
      {children}
    </button>
  );
}

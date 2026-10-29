import { headers } from "next/headers";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import TrialBalance from "@/models/TrialBalance";
import Engagement from "@/models/Engagement";
import Client from "@/models/Client";
import RuleConfirmation from "@/models/RuleConfirmation";
import { buildWorkbook, xlsxResponse } from "@/lib/excel";
import { formatISTDate } from "@/lib/dates";
import {
  CONFIRM_KEY,
  CONFIRM_KIND,
  HEAD_BY_KEY,
  mappingProgress,
  notesNeeded,
  statements,
} from "@/lib/practice/scheduleIII";
import {
  withAudit,
  recordAudit,
  ACTIONS,
  withAuditContext,
  contextFromRequest,
} from "@/lib/audit";

/**
 * The statements as a workbook (P3-32).
 *
 * Five sheets, and the last three are the reason this is worth building
 * rather than copying the two statements by hand: a reviewer, a client's
 * banker or next year's audit team needs **the mapping and the journal**,
 * not just the totals. The sheet order is the order they are read in.
 *
 * **It does not carry the notes.** Their wording is the firm's own
 * judgement about this company; the sheet lists which notes are needed and
 * the authority for each, and stops there.
 *
 * Rupees, not paise, because this is a spreadsheet somebody will do
 * arithmetic in. The download is audited like every other export
 * (spec section 11).
 */

export const dynamic = "force-dynamic";

/** Paise to rupees, as a number so Excel can total a column. */
const rupees = (paise) => Math.round(paise) / 100;

export async function GET(request, { params }) {
  const actor = await requireUser();
  const { id } = await params;

  await connectDB();
  const tb = await TrialBalance.findById(id).lean();
  if (!tb) return new Response("Not found", { status: 404 });

  const engagement = await Engagement.findById(tb.engagementId)
    .select("assigneeId reviewerId periodLabel period")
    .lean();

  const allowed = can(actor, "view", "practice", {
    branchId: String(tb.branchId),
    assigneeId: String(engagement?.assigneeId ?? ""),
    reviewerId: String(engagement?.reviewerId ?? ""),
  });
  if (!allowed) return new Response("Not allowed", { status: 403 });

  const [client, confirmation] = await Promise.all([
    Client.findById(tb.clientId).select("legalName tradeName").lean(),
    RuleConfirmation.findOne({ kind: CONFIRM_KIND, key: CONFIRM_KEY }).lean(),
  ]);
  const name = client?.legalName ?? "Client";

  const lines = tb.lines ?? [];
  const adjustments = tb.adjustments ?? [];
  const result = statements(lines, adjustments);
  const progress = mappingProgress(lines);

  /**
   * The provenance line that goes on top of every sheet.
   *
   * A spreadsheet that leaves the building has to say what it is and what
   * it rests on, because it will be read a year later by somebody who was
   * not there — including whether a partner had confirmed the head list.
   */
  const title =
    `${name} · ${tb.fyLabel} · Schedule III Division I` +
    (confirmation?.confirmedAt
      ? `, confirmed ${formatISTDate(confirmation.confirmedAt)} by ${confirmation.confirmedByName}`
      : ", head list NOT yet confirmed by a partner") +
    (tb.locked
      ? ` · locked ${formatISTDate(tb.lockedAt)} by ${tb.lockedByName}`
      : " · not locked, so these figures can still change") +
    (progress.unmapped > 0 ? ` · ${progress.unmapped} ledgers UNMAPPED` : "") +
    (result.balanced
      ? ""
      : ` · DOES NOT BALANCE by ${rupees(result.difference)}`);

  const liabilityRows = result.rows.filter((row) => row.side === "liability");
  const assetRows = result.rows.filter((row) => row.side === "asset");

  const balanceSheet = [
    ...liabilityRows.map((row) => ({
      part: "Equity and liabilities",
      group: row.group,
      head: row.name,
      cite: row.cite,
      amount: rupees(row.paise),
    })),
    {
      part: "Equity and liabilities",
      group: "Shareholders' funds",
      head: "Profit for the year, into reserves",
      cite: "",
      amount: rupees(result.profit),
    },
    {
      part: "Equity and liabilities",
      group: "",
      head: "Total",
      cite: "",
      amount: rupees(result.liabilitiesWithProfit),
    },
    ...assetRows.map((row) => ({
      part: "Assets",
      group: row.group,
      head: row.name,
      cite: row.cite,
      amount: rupees(row.paise),
    })),
    {
      part: "Assets",
      group: "",
      head: "Total",
      cite: "",
      amount: rupees(result.assets),
    },
  ];

  const profitAndLoss = [
    ...result.rows
      .filter((row) => row.side === "income")
      .map((row) => ({
        part: "Income",
        head: row.name,
        cite: row.cite,
        amount: rupees(row.paise),
      })),
    { part: "", head: "Total income", cite: "", amount: rupees(result.income) },
    ...result.rows
      .filter((row) => row.side === "expense" && row.key !== "tax")
      .map((row) => ({
        part: "Expenses",
        head: row.name,
        cite: row.cite,
        amount: rupees(row.paise),
      })),
    {
      part: "",
      head: "Profit before tax",
      cite: "",
      amount: rupees(result.profitBeforeTax),
    },
    {
      part: "",
      head: "Tax expense",
      cite: "",
      amount: rupees(result.taxExpense),
    },
    {
      part: "",
      head: "Profit for the year",
      cite: "",
      amount: rupees(result.profit),
    },
  ];

  const WHERE_FROM = {
    unmapped: "NOBODY HAS SAID",
    suggested: "suggested from their group — not confirmed",
    remembered: "last year's — not confirmed",
    confirmed: "confirmed",
  };

  const buffer = await buildWorkbook([
    {
      name: "Balance sheet",
      title,
      columns: [
        { header: "Part", key: "part", width: 24 },
        { header: "Group", key: "group", width: 24 },
        { header: "Head", key: "head", width: 44 },
        { header: "Schedule III", key: "cite", width: 18 },
        { header: "₹", key: "amount", width: 18, kind: "money" },
      ],
      rows: balanceSheet,
    },
    {
      name: "Profit and loss",
      title,
      columns: [
        { header: "Part", key: "part", width: 16 },
        { header: "Head", key: "head", width: 52 },
        { header: "Schedule III", key: "cite", width: 18 },
        { header: "₹", key: "amount", width: 18, kind: "money" },
      ],
      rows: profitAndLoss,
    },
    {
      name: "Mapped trial balance",
      title,
      columns: [
        { header: "Ledger", key: "ledger", width: 36 },
        { header: "Their group", key: "group", width: 26 },
        {
          header: "Closing ₹ (Dr +, Cr −)",
          key: "closing",
          width: 22,
          kind: "money",
        },
        { header: "Schedule III head", key: "head", width: 44 },
        { header: "Where the head came from", key: "from", width: 36 },
        { header: "Confirmed by", key: "by", width: 24 },
      ],
      rows: lines.map((line) => ({
        ledger: line.ledger,
        group: line.group ?? "",
        closing: rupees(line.closingPaise),
        head: HEAD_BY_KEY.get(line.headKey)?.name ?? "",
        from: WHERE_FROM[line.status] ?? line.status,
        by: line.mappedByName ?? "",
      })),
    },
    {
      name: "Adjustments",
      title,
      columns: [
        { header: "#", key: "no", width: 6 },
        { header: "Entry", key: "description", width: 70 },
        { header: "₹", key: "amount", width: 16, kind: "money" },
        { header: "Debit", key: "head", width: 36 },
        { header: "Credit", key: "counter", width: 36 },
        { header: "State", key: "state", width: 18 },
        { header: "Moved the figures", key: "moved", width: 18 },
        { header: "Source", key: "source", width: 30 },
        { header: "By", key: "by", width: 24 },
      ],
      rows: adjustments.map((entry, index) => ({
        no: index + 1,
        description: entry.description,
        amount: rupees(entry.amountPaise),
        head: HEAD_BY_KEY.get(entry.headKey)?.name ?? "",
        counter: HEAD_BY_KEY.get(entry.counterHeadKey)?.name ?? "",
        state: entry.state,
        moved: entry.state === "Passed in books" ? "yes" : "no",
        source: entry.source ?? "",
        by: entry.byName ?? "",
      })),
    },
    {
      name: "Notes needed",
      title: `${title} — which notes are needed. Their wording is the firm's own and is not in this workbook.`,
      columns: [
        { header: "Note", key: "name", width: 60 },
        { header: "Authority", key: "cite", width: 34 },
        { header: "Why", key: "why", width: 30 },
      ],
      rows: notesNeeded(tb.noteAnswers ?? {}).map((note) => ({
        name: note.name,
        cite: note.cite,
        why: note.always ? "every set of statements" : "this company's answer",
      })),
    },
  ]);

  await withAuditContext(
    contextFromRequest(actor, await headers()),
    async () => {
      await withAudit((session) =>
        recordAudit(
          {
            action: ACTIONS.export,
            entityType: "TrialBalance",
            entityId: tb._id,
            clientId: tb.clientId,
            note: `exported the ${tb.fyLabel} statements: ${lines.length} ledgers, ${adjustments.length} adjustments${result.balanced ? "" : ", NOT balanced"}`,
          },
          session,
        ),
      );
    },
  );

  return xlsxResponse(
    buffer,
    `statements-${name.replace(/[^A-Za-z0-9]+/g, "-").slice(0, 40)}-${tb.fyLabel}`,
  );
}

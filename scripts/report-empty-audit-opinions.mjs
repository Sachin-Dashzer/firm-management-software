/**
 * Every audit filing whose opinion is blank, and whether one was ever typed.
 * `npm run opinions:empty`
 *
 * **Read-only.** It opens nothing it does not read and writes nothing but
 * `docs/AFFECTED_AUDIT_FILINGS.md`.
 *
 * **It does not fill anything in.** An audit opinion is the signing CA's
 * judgement under SA 700 / SA 705. Nothing here infers one from a
 * qualification note, a conclusion in the audit file, or the fact that
 * everything else about the engagement looks finished — a guessed opinion in
 * a file is worse than a blank one, because a blank one is visibly a gap.
 *
 * **Why it exists.** Until the fix in `docs/BUG_AUDIT_OPINION.md`, an audit
 * filing could be saved with an empty opinion while the screen said "Filing
 * details saved" and still showed the opinion selected. So some files may
 * record nothing although a CA chose something. The audit log is a hash
 * chain and it kept every change, so it can say which: a record whose log
 * shows an opinion going in and the field now empty is one the bug ate.
 *
 * The raw driver rather than the models on purpose — soft-deleted
 * engagements took the same path and must still be listed, and the default
 * model scope would hide them.
 */

import { writeFileSync } from "node:fs";
import mongoose from "mongoose";
import { EMPTY_OPINION_QUERY } from "../lib/practice/books.js";
import { formatISTDate } from "../lib/dates.js";
import { SAMPLE_TAG } from "./sample.js";

const OUT = new URL("../docs/AFFECTED_AUDIT_FILINGS.md", import.meta.url);

// the category list and the filter both live in lib/practice/books.js

/**
 * Something a test or a demo left behind rather than a client's audit.
 *
 * The `sample` tag on the client is the real marker — `scripts/sample.js`
 * puts it there and `npm run purge:sample` goes by it. The name match is
 * only for fixtures that predate the tag, and it is why this list is
 * printed for checking instead of acted on.
 */
function looksLikeSample(row) {
  if (row.clientTags?.includes(SAMPLE_TAG)) return true;
  const text = `${row.code ?? ""} ${row.clientName ?? ""}`.toLowerCase();
  return /playwright|sample|demo|^pw-/.test(text);
}

const date = (value) => (value ? formatISTDate(value) : "—");

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error(
      "\n  MONGODB_URI is not set. Run through `npm run opinions:empty`.\n",
    );
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const engagements = await db
    .collection("engagements")
    .find(EMPTY_OPINION_QUERY)
    .project({
      code: 1,
      clientId: 1,
      status: 1,
      period: 1,
      periodLabel: 1,
      udin: 1,
      assurance: 1,
      createdBy: 1,
      updatedBy: 1,
      createdAt: 1,
      updatedAt: 1,
      completedAt: 1,
      deletedAt: 1,
      templateSnapshot: 1,
    })
    .toArray();

  // names, so the owner can recognise the file without looking each one up
  const clientIds = [...new Set(engagements.map((e) => String(e.clientId)))];
  const clients = await db
    .collection("clients")
    .find({
      _id: { $in: clientIds.map((id) => new mongoose.Types.ObjectId(id)) },
    })
    .project({ legalName: 1, code: 1, tags: 1 })
    .toArray();
  const clientName = new Map(
    clients.map((c) => [String(c._id), c.legalName ?? c.code ?? ""]),
  );
  const clientTags = new Map(clients.map((c) => [String(c._id), c.tags ?? []]));

  /*
   * What the log remembers. An opinion that was entered shows up as a diff
   * on `assurance.opinion` — that is how the audit plugin records a field
   * change — so a record that has one of those and an empty field now is a
   * record where something was lost.
   */
  const entries = await db
    .collection("auditLogs")
    .find({
      entityType: "Engagement",
      entityId: { $in: engagements.map((e) => String(e._id)) },
    })
    .project({ entityId: 1, ts: 1, userName: 1, action: 1, diff: 1, note: 1 })
    .sort({ seq: 1 })
    .toArray();

  const opinionsSeen = new Map();
  for (const entry of entries) {
    const diff = entry.diff ?? {};
    const key = Object.keys(diff).find((k) => /assurance\.opinion$/.test(k));
    const pair = key ? diff[key] : null;
    const value = Array.isArray(pair) ? pair[1] : null;
    if (!value || value === "Not yet issued") continue;
    const list = opinionsSeen.get(entry.entityId) ?? [];
    list.push({ value, ts: entry.ts, who: entry.userName || "System" });
    opinionsSeen.set(entry.entityId, list);
  }

  const rows = engagements
    .map((e) => ({
      ...e,
      clientName: clientName.get(String(e.clientId)) ?? "(client not found)",
      clientTags: clientTags.get(String(e.clientId)) ?? [],
      lost: opinionsSeen.get(String(e._id)) ?? [],
    }))
    .map((e) => ({
      ...e,
      /** Closed, numbered or signed — a state it should not be in blank. */
      closed: Boolean(
        e.status === "Completed" || e.udin || e.assurance?.reportDate,
      ),
      sample: looksLikeSample(e),
    }));

  const real = rows.filter((r) => !r.sample);
  const sample = rows.filter((r) => r.sample);
  const urgent = real.filter((r) => r.closed);
  const lostSome = real.filter((r) => r.lost.length > 0);

  const lines = [];
  lines.push("# Audit filings with no opinion on record");
  lines.push("");
  lines.push(
    `Produced by \`npm run opinions:empty\` on ${formatISTDate(new Date())}.`,
    "Read-only: nothing in the database was changed, and no opinion has been",
    "guessed or filled in. Choosing one is the signing CA's judgement.",
    "",
  );

  lines.push("## What this says");
  lines.push("");
  lines.push(`| | |`, `| --- | --- |`);
  lines.push(`| Audit engagements with a blank opinion | ${real.length} |`);
  lines.push(
    `| **Of those, already completed, numbered or dated** | **${urgent.length}** |`,
  );
  lines.push(
    `| Where the audit log shows an opinion was once entered | ${lostSome.length} |`,
  );
  lines.push(
    `| Test or sample records, listed separately | ${sample.length} |`,
  );
  lines.push("");

  if (urgent.length) {
    lines.push("## Read these first");
    lines.push("");
    lines.push(
      "Each of these is closed, carries a UDIN, or has a report date — and",
      "says nothing about what was concluded. A CA has to open the file, read",
      "the working papers and the audit report that was issued, and enter the",
      "opinion that was actually given. Not the one that seems likely.",
      "",
    );
    lines.push(table(urgent));
    lines.push("");
  }

  if (lostSome.length) {
    lines.push("## An opinion was entered and is not there now");
    lines.push("");
    lines.push(
      "The audit log is a hash chain, so these entries cannot have been",
      "quietly edited: somebody chose this opinion on this date. It is still",
      "a CA's job to confirm it against the report that was issued before",
      "entering it again — the log says what was typed, not what was signed.",
      "",
    );
    for (const row of lostSome) {
      lines.push(
        `- **${row.code}** · ${row.clientName} · ${row.periodLabel || row.period}`,
      );
      for (const seen of row.lost) {
        lines.push(
          `  - "${seen.value}" entered by ${seen.who} on ${date(seen.ts)}`,
        );
      }
    }
    lines.push("");
  }

  const rest = real.filter((r) => !r.closed);
  lines.push("## Still in progress");
  lines.push("");
  if (rest.length === 0) {
    lines.push("None.", "");
  } else {
    lines.push(
      "A blank opinion is a legitimate state here: the work is not finished,",
      "so there is nothing to report yet. Since the fix, none of these can be",
      "completed or given a UDIN until the opinion is entered, so they will",
      "surface on their own. Nothing to do now.",
      "",
    );
    lines.push(table(rest));
    lines.push("");
  }

  if (sample.length) {
    lines.push("## Test and sample records");
    lines.push("");
    lines.push(
      "Matched on the code or client name looking like test data. Check the",
      "list rather than trusting it, then clear them with",
      "`npm run purge:sample` if that is what they are.",
      "",
    );
    lines.push(table(sample));
    lines.push("");
  }

  lines.push("## What to do with this");
  lines.push("");
  lines.push(
    "1. A CA or partner opens each file in the first two sections, reads the",
    "   audit report that was issued, and enters that opinion on the",
    "   engagement's filing panel. One file at a time, by the person who can",
    "   sign it.",
    "2. Every entry is audited, so the correction is on the record as a",
    "   correction — which is what a peer reviewer will want to see.",
    "3. Run `npm run doctor` afterwards. It fails while any completed,",
    "   numbered or dated audit still has a blank opinion, so a clean doctor",
    "   is the proof that this list has been worked through.",
    "",
  );

  writeFileSync(OUT, lines.join("\n"));

  console.log(
    `\n  ${real.length} audit filing(s) with no opinion; ${urgent.length} already closed, numbered or dated.`,
  );
  if (lostSome.length) {
    console.log(
      `  ${lostSome.length} where the audit log shows an opinion was entered and lost.`,
    );
  }
  console.log(`  Written to docs/AFFECTED_AUDIT_FILINGS.md\n`);

  await mongoose.disconnect();
}

function table(rows) {
  const out = [
    "| Code | Client | Period | Status | UDIN | Report dated | Last changed by | Last changed |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of rows) {
    out.push(
      `| ${r.code ?? "—"} | ${r.clientName} | ${r.periodLabel || r.period || "—"} | ${
        r.deletedAt ? `${r.status} (deleted)` : r.status
      } | ${r.udin || "—"} | ${date(r.assurance?.reportDate)} | ${
        r.updatedBy ?? "—"
      } | ${date(r.updatedAt)} |`,
    );
  }
  return out.join("\n");
}

main().catch(async (error) => {
  console.error(`\n  ${error.message}\n`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

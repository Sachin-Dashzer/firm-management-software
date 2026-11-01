/**
 * Take the invented clients out of a database that is about to hold real
 * records. `npm run purge:sample`
 *
 * **Read-only unless you pass `--apply`.** The dry run prints the whole
 * tree — every sample client, everything hanging off it, the colleagues,
 * the groups, the branch registrations — and the effect on the totals the
 * firm reads, so the decision is made with the numbers in view.
 *
 * It is the owner's decision and not this script's. A purge is also not
 * reversible from the app: a soft delete can be restored, but nobody is
 * going to pick thirty records out of a recycle bin by hand.
 *
 *   npm run purge:sample              what would go
 *   npm run purge:sample -- --apply   take it out
 *
 * Soft delete only (CLAUDE.md rule 3), one audit entry per record, each in
 * its own transaction — it reuses `dropSample` from `scripts/sample.js`
 * rather than deleting anything itself, so what the dry run describes and
 * what `--apply` does cannot drift apart.
 */

import mongoose from "mongoose";
import { describeSample, dropSample, SAMPLE_TAG } from "./sample.js";

const apply = process.argv.includes("--apply");

function hostOf(uri) {
  try {
    return new URL(uri.replace(/^mongodb(\+srv)?:\/\//, "http://")).host;
  } catch {
    return "(unreadable)";
  }
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("\n  MONGODB_URI is not set. Run through `npm run purge:sample`.\n");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`\n  Sample data in ${hostOf(process.env.MONGODB_URI)}\n`);

  const found = await describeSample();

  if (
    found.clients.length === 0 &&
    found.people.length === 0 &&
    found.groups.length === 0 &&
    found.branches.length === 0
  ) {
    console.log("  Nothing is marked as sample. There is nothing to take out.\n");
    await mongoose.disconnect();
    return;
  }

  /*
   * Printed as a tree rather than a count, because "4 clients" does not
   * tell the owner whether the invoices about to disappear are the ones
   * they have been looking at all week.
   */
  for (const client of found.clients) {
    console.log(`  ${client.name}`);
    const parts = Object.entries(client.counts);
    if (parts.length === 0) {
      console.log("      (nothing hanging off it)");
    }
    for (const [label, n] of parts) {
      console.log(`      ${String(n).padStart(3)}  ${label}`);
    }
    console.log("");
  }

  if (found.people.length) {
    console.log(`  ${found.people.length} invented colleague(s):`);
    for (const person of found.people) {
      console.log(`      ${person.name} <${person.email}>`);
    }
    console.log("");
  }

  if (found.groups.length) {
    console.log(`  ${found.groups.length} client group(s): ${found.groups.join(", ")}\n`);
  }

  if (found.branches.length) {
    console.log(
      `  The invented GSTIN comes off ${found.branches.length} branch(es): ${found.branches.join(", ")}`,
    );
    console.log(
      "  A branch you have since given its real registration is left alone.\n",
    );
  }

  const totals = Object.entries(found.totals);
  if (totals.length) {
    console.log("  What the firm's totals lose:");
    for (const [label, n] of totals.sort((a, b) => b[1] - a[1])) {
      console.log(`      ${String(n).padStart(4)}  ${label}`);
    }
    console.log("");
  }

  /*
   * Invoices are called out on their own. A sample invoice has consumed a
   * number out of a real GST series, and removing the invoice does not give
   * the number back — the gap stays, and it is audit evidence. See
   * docs/INVOICE_GAPS.md, which explains each one.
   */
  if (found.totals.invoices) {
    console.log(
      `  Note: ${found.totals.invoices} of these are invoices. Their numbers stay`,
    );
    console.log(
      "  spent — a GST series is not renumbered, and the gap is explained in",
    );
    console.log("  docs/INVOICE_GAPS.md. Run `npm run invoice:gaps` after this.\n");
  }

  if (!apply) {
    console.log(
      [
        "  DRY RUN — nothing was changed.",
        "",
        "  Everything above is soft-deleted on --apply, with an audit entry per",
        `  record. Clients are found by the "${SAMPLE_TAG}" tag and colleagues by`,
        "  their email domain, so anything you created yourself is untouched.",
        "",
        "      npm run purge:sample -- --apply",
        "",
      ].join("\n"),
    );
    await mongoose.disconnect();
    return;
  }

  console.log("  Taking it out…\n");
  const result = await dropSample();
  console.log(
    `  ${result.removed} record(s) soft-deleted, each with its own audit entry.`,
  );
  console.log("  Check with: npm run doctor\n");

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(`\n  ${error.message}\n`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

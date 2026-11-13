/**
 * Take the review step out of every service in the catalog (owner,
 * 13-11-2026). **Read-only unless you pass `--apply`.**
 *
 *   node --env-file-if-exists=.env scripts/drop-review-steps.mjs
 *   node --env-file-if-exists=.env scripts/drop-review-steps.mjs --apply
 *
 * `lib/services/starter.js` no longer seeds one, and `stepsView` no longer
 * appends one — but the firm's catalog is already in the database, and a
 * seed never edits a service that exists. This is the same change applied
 * to the services the firm has.
 *
 * **Only a step whose whole name is "Review" or "Partner review" goes**,
 * which is what the starter catalog wrote and nobody has since made their
 * own. A step the firm named itself — "Review of Certificate", with its
 * own tick boxes hanging off it — is the firm's step and is left alone and
 * reported, because taking it out would strand the work bound to it.
 *
 * An item's `stepIndex` is a position, so the steps after the gap move
 * down one and the items move with them: `withoutStep` does both, and
 * `tests/services.test.js` holds it to it.
 *
 * The version goes up where `bumpsVersion` says the definition of the work
 * changed, so an engagement started from the older definition still shows
 * which one it was. Every write is a transaction with its own audit entry,
 * attributed to System (CLAUDE.md rule 2).
 */

import mongoose from "mongoose";
import { connectDB } from "../lib/db.js";
import { systemAudit } from "../lib/audit/system.js";
import { recordAudit, ACTIONS } from "../lib/audit/index.js";
import { bumpsVersion, withoutStep } from "../lib/services/catalog.js";
import ServiceTemplate from "../models/ServiceTemplate.js";

/** What the starter catalog called it, and the only names that go. */
const DEFAULT_NAMES = ["review", "partner review"];

const apply = process.argv.includes("--apply");

try {
  await connectDB();
  const templates = await ServiceTemplate.find({}).sort({ code: 1 });

  let changed = 0;
  const theirs = [];

  for (const template of templates) {
    const steps = template.steps ?? [];
    const index = steps.findIndex((step) =>
      DEFAULT_NAMES.includes((step.name ?? "").trim().toLowerCase()),
    );

    // a review step of the firm's own naming: reported, never touched
    const own = steps.filter(
      (step, at) =>
        at !== index && /review/i.test(step.name ?? "") && step.name.trim(),
    );
    for (const step of own) {
      const at = steps.indexOf(step);
      theirs.push(
        `${template.code} step ${at + 1} "${step.name}"` +
          ` (${(template.checklist ?? []).filter((i) => i.stepIndex === at).length} item(s) on it)`,
      );
    }

    if (index === -1) continue;

    const name = steps[index].name;
    const before = template.toObject();
    const { steps: nextSteps, checklist } = withoutStep(before, index);
    const moved = (before.checklist ?? []).filter(
      (item, i) => item.stepIndex !== checklist[i].stepIndex,
    ).length;
    const bump = bumpsVersion(before, { steps: nextSteps, checklist });

    console.log(
      `  ${template.code.padEnd(12)} step ${index + 1} "${name}" goes` +
        ` · ${nextSteps.length} step(s) left` +
        ` · ${moved} item(s) re-pointed` +
        (bump ? ` · v${template.version} -> v${template.version + 1}` : ""),
    );
    changed += 1;

    if (!apply) continue;

    template.steps = nextSteps;
    template.checklist = checklist;
    if (bump) template.version = template.version + 1;
    await systemAudit(async (session) => {
      await template.save({ session });
      await recordAudit(
        {
          action: ACTIONS.update,
          entityType: "ServiceTemplate",
          entityId: template._id,
          diff: { steps: { from: before.steps.length, to: nextSteps.length } },
          note: `Removed the default "${name}" step (owner, 13-11-2026). The review is a record on the job, not a step.`,
        },
        session,
      );
    });
  }

  console.log(
    `\n  ${changed} of ${templates.length} service(s) ${apply ? "changed" : "would change"}.`,
  );
  if (theirs.length) {
    console.log(
      `\n  Left alone — the firm's own step, not the default one:\n` +
        theirs.map((line) => `      ${line}`).join("\n") +
        `\n  Taking one of these out would leave its tick boxes on no step.\n`,
    );
  }
  if (!apply) {
    console.log("  DRY RUN — nothing was written. Add --apply.\n");
  }
} catch (error) {
  console.error(`\n  Failed: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}

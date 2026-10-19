// @ts-check

/**
 * First-run seed: the firm's four branches, the starter service catalog and
 * one partner account.
 *
 *   node --env-file=.env.local scripts/seed.js "Owner Name" owner@phmgindia.com
 *
 * Safe to run twice: branches and services are matched on their code and the
 * partner on their email, so nothing is duplicated and an edited service is
 * never overwritten. It prints a one-time password, which is the only time it
 * is shown — 2FA is set up at first sign-in.
 */

import mongoose from "mongoose";
import { connectDB } from "../lib/db.js";
import Branch from "../models/Branch.js";
import User from "../models/User.js";
import ServiceTemplate from "../models/ServiceTemplate.js";
import { hashPassword } from "../lib/crypto.js";
import { systemAudit } from "../lib/audit/system.js";
import { STARTER_CATALOG } from "../lib/services/starter.js";
import DueDateRule from "../models/DueDateRule.js";
import { STARTER_DUE_RULES } from "../lib/compliance/starterRules.js";
import { randomBytes } from "node:crypto";

/** The offices named in spec section 1. Addresses and GSTINs: firm to fill in. */
const BRANCHES = [
  { code: "NOI", name: "Noida (head office)", invoicePrefix: "NOI" },
  { code: "DEL", name: "Delhi — Rohini", invoicePrefix: "DEL" },
  { code: "LDH", name: "Ludhiana", invoicePrefix: "LDH" },
  { code: "MRT", name: "Meerut", invoicePrefix: "MRT" },
];

function temporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const chars = [...randomBytes(16)].map((b) => alphabet[b % alphabet.length]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join("")).join("-");
}

async function main() {
  const args = process.argv.slice(2);
  const wantsSample = args.includes("--sample");
  const wantsDrop = args.includes("--drop-sample");
  const [name, email] = args.filter((a) => !a.startsWith("--"));

  if (wantsDrop) {
    await connectDB();
    const { dropSample } = await import("./sample.js");
    const { removed } = await dropSample();
    console.log(`Sample data removed: ${removed} records soft-deleted.`);
    await mongoose.disconnect();
    return;
  }

  if (!name || !email) {
    console.error(
      'Usage: node --env-file=.env.local scripts/seed.js "Owner Name" owner@phmgindia.com [--sample]',
    );
    console.error(
      "       --sample       also write the demo clients and colleagues",
    );
    console.error("       --drop-sample  take the demo data out again");
    process.exit(1);
  }

  await connectDB();

  // every write here goes through the same audited transaction the app uses,
  // so the seed shows up in the audit log as System rather than appearing
  // from nowhere
  const branchIds = await systemAudit(async (session) => {
    const ids = [];
    for (const branch of BRANCHES) {
      const existing = await Branch.findOneAndUpdate(
        { code: branch.code },
        { $setOnInsert: { ...branch, createdBy: "seed", updatedBy: "seed" } },
        { new: true, upsert: true, session },
      );
      ids.push(existing._id);
      console.log(`branch ${branch.code}  ${existing.name}`);
    }
    return ids;
  });

  let added = 0;
  for (const service of STARTER_CATALOG) {
    // an existing service is left exactly as the firm has edited it
    if (await ServiceTemplate.findOne({ code: service.code })) continue;
    await systemAudit(async (session) => {
      await ServiceTemplate.create(
        [{ ...service, createdBy: "seed", updatedBy: "seed" }],
        { session },
      );
    });
    added += 1;
  }
  console.log(
    `\nservice catalog: ${added} added, ${STARTER_CATALOG.length - added} already there`,
  );
  if (added > 0) {
    console.log(
      "Fees are seeded at zero and most SAC codes are blank — set them in Settings → Services before billing.",
    );
  }

  let rulesAdded = 0;
  for (const rule of STARTER_DUE_RULES) {
    if (await DueDateRule.findOne({ serviceCode: rule.serviceCode })) continue;
    await systemAudit(async (session) => {
      await DueDateRule.create(
        [{ ...rule, createdBy: "seed", updatedBy: "seed" }],
        { session },
      );
    });
    rulesAdded += 1;
  }
  console.log(
    `due-date rules: ${rulesAdded} added, ${STARTER_DUE_RULES.length - rulesAdded} already there`,
  );
  if (rulesAdded > 0) {
    console.log(
      "NONE of them is confirmed, and none will put a date on any engagement until a partner confirms it in Settings -> Due dates.",
    );
  }

  const lower = email.toLowerCase();
  const already = await User.findOne({ email: lower });
  if (already) {
    console.log(`\nPartner ${lower} already exists — nothing else to do.`);
    console.log("To issue a new password, use Settings → Team in the app.");
  } else {
    const password = temporaryPassword();
    await systemAudit(async (session) => {
      await User.create(
        [
          {
            name,
            email: lower,
            role: "partner",
            branchIds,
            capacityHours: 8,
            active: true,
            passwordHash: await hashPassword(password),
            mustChangePassword: true,
            createdBy: "seed",
            updatedBy: "seed",
          },
        ],
        { session },
      );
    });
    console.log(`\nPartner account created for ${lower}`);
    console.log(`One-time password: ${password}`);
    console.log(
      "Sign in with it now; you will be asked to scan a 2FA QR code.",
    );
  }

  /**
   * The sample dataset is deliberately opt-in. Everything above is what the
   * firm actually needs; what follows invents clients, so it only happens
   * when somebody asks for it by name and never under NODE_ENV=production.
   */
  if (wantsSample) {
    const { seedSample } = await import("./sample.js");
    console.log("\nWriting the sample dataset:");
    const counts = await seedSample({
      log: (line) => console.log(`  ${line}`),
    });
    console.log(
      `\n${counts.clients} clients, ${counts.people} colleagues, ${counts.services} services and ${counts.grants} access grants.`,
    );
    console.log(
      "None of it is real. Remove it with: npm run seed -- --drop-sample",
    );
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("\nSeed failed:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

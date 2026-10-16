// @ts-check

/**
 * First-run seed: the firm's four branches and one partner account.
 *
 *   node --env-file=.env.local scripts/seed.js "Owner Name" owner@phmgindia.com
 *
 * Safe to run twice: branches are matched on their code and the partner on
 * their email, so nothing is duplicated. It prints a one-time password, which
 * is the only time it is shown — 2FA is set up at first sign-in.
 */

import mongoose from "mongoose";
import { connectDB } from "../lib/db.js";
import Branch from "../models/Branch.js";
import User from "../models/User.js";
import { hashPassword } from "../lib/crypto.js";
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
  const [name, email] = process.argv.slice(2);
  if (!name || !email) {
    console.error(
      'Usage: node --env-file=.env.local scripts/seed.js "Owner Name" owner@phmgindia.com',
    );
    process.exit(1);
  }

  await connectDB();

  const branchIds = [];
  for (const branch of BRANCHES) {
    const existing = await Branch.findOneAndUpdate(
      { code: branch.code },
      { $setOnInsert: { ...branch, createdBy: "seed", updatedBy: "seed" } },
      { new: true, upsert: true },
    );
    branchIds.push(existing._id);
    console.log(`branch ${branch.code}  ${existing.name}`);
  }

  const lower = email.toLowerCase();
  const already = await User.findOne({ email: lower });
  if (already) {
    console.log(`\nPartner ${lower} already exists — nothing else to do.`);
    console.log("To issue a new password, use Settings → Team in the app.");
  } else {
    const password = temporaryPassword();
    await User.create({
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
    });
    console.log(`\nPartner account created for ${lower}`);
    console.log(`One-time password: ${password}`);
    console.log(
      "Sign in with it now; you will be asked to scan a 2FA QR code.",
    );
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("\nSeed failed:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

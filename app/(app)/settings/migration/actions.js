"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { assertCan } from "@/lib/permissions";
import { connectDB } from "@/lib/db";
import { audited } from "@/lib/audit/request";
import { recordAudit, ACTIONS } from "@/lib/audit";
import Branch from "@/models/Branch";
import Client from "@/models/Client";
import Invoice from "@/models/Invoice";
import User from "@/models/User";
import { prepareTeamImport } from "@/lib/migration/team";
import { prepareOpeningBalances } from "@/lib/migration/openingBalances";
import { hashPassword } from "@/lib/crypto";
import { temporaryPassword } from "@/lib/security/password";

/**
 * Bringing the old system in (spec section 17, step 2 of the go-live plan).
 *
 * Both imports follow the client import's discipline from Step 3: read the
 * whole sheet, show what is wrong with it line by line, and write nothing
 * until a partner has looked at the preview and pressed the button.
 *
 * Partner-only. These create people who can sign in and money the firm is
 * owed; neither is a thing to let anybody else do from a spreadsheet.
 */

/** Check a team sheet without writing anything. */
export async function checkTeamSheet(csvText) {
  const actor = await requireUser();
  assertCan(actor, "edit", "usersSettings");

  await connectDB();
  const [branches, existing] = await Promise.all([
    Branch.find({}).select("code").lean(),
    User.find({}).select("email").lean(),
  ]);

  return prepareTeamImport(csvText, {
    branches: branches.map((b) => ({ id: String(b._id), code: b.code })),
    existingEmails: existing.map((u) => u.email),
  });
}

/**
 * Create the people the sheet describes.
 *
 * Each gets a one-time password, returned here **once** so the partner can
 * read them out, exactly as a single user created on the Team screen does.
 * They are not stored in readable form and not emailed.
 */
export async function importTeam(csvText) {
  const actor = await requireUser();
  assertCan(actor, "edit", "usersSettings");

  const prepared = await checkTeamSheet(csvText);
  const ready = prepared.rows.filter(
    (row) => row.errors.length === 0 && !row.skip,
  );
  if (ready.length === 0) {
    return { error: "Nothing in that sheet is ready to import." };
  }

  const created = [];

  await audited(actor, async (session) => {
    for (const row of ready) {
      const password = temporaryPassword();
      const [user] = await User.create(
        [
          {
            name: row.value.name,
            email: row.value.email,
            role: row.value.role,
            branchIds: row.value.branchIds,
            passwordHash: await hashPassword(password),
            mustChangePassword: true,
            active: true,
            createdBy: actor.id,
            updatedBy: actor.id,
          },
        ],
        { session },
      );

      created.push({
        name: user.name,
        email: user.email,
        role: row.roleLabel,
        password,
      });
    }

    await recordAudit(
      {
        action: ACTIONS.create,
        entityType: "User",
        entityId: "import",
        note: `${actor.name} imported ${created.length} team members from a sheet`,
      },
      session,
    );
  });

  revalidatePath("/settings/users");

  return {
    ok: `${created.length} ${created.length === 1 ? "person" : "people"} added. Read each one their password now — it is shown only here, and they will be asked to change it when they sign in.`,
    created,
  };
}

/** Check an opening-balance sheet without writing anything. */
export async function checkOpeningSheet(csvText) {
  const actor = await requireUser();
  assertCan(actor, "edit", "invoices");

  await connectDB();
  const clients = await Client.find({})
    .select("code legalName branchId")
    .lean();

  return prepareOpeningBalances(csvText, {
    clients: clients.map((client) => ({
      id: String(client._id),
      code: client.code,
      legalName: client.legalName,
      branchId: String(client.branchId),
    })),
  });
}

/**
 * Write the opening balances as invoices in the OB/ series.
 *
 * They are created already issued, because they describe something that
 * was issued — by the old system, months ago. They carry no GST breakdown:
 * whatever tax was on the original invoice was accounted for then, and
 * restating it here would double-count it in this year's returns.
 */
export async function importOpeningBalances(csvText) {
  const actor = await requireUser();
  assertCan(actor, "edit", "invoices");

  const prepared = await checkOpeningSheet(csvText);
  const ready = prepared.rows.filter((row) => row.errors.length === 0);
  if (ready.length === 0) {
    return { error: "Nothing in that sheet is ready to import." };
  }

  // one more look before writing: an import run twice would double the
  // firm's receivables, which is the worst possible outcome here
  await connectDB();
  const numbers = ready.map((row) => row.value.number);
  const clash = await Invoice.findOne({ number: { $in: numbers } })
    .select("number")
    .lean();
  if (clash) {
    return {
      error: `${clash.number} is already in the system. It looks like this sheet has been imported once already — check the invoice list before trying again.`,
    };
  }

  let count = 0;
  let totalPaise = 0;

  await audited(actor, async (session) => {
    for (const row of ready) {
      const value = row.value;
      await Invoice.create(
        [
          {
            number: value.number,
            series: "OB",
            isOpeningBalance: true,
            type: "Invoice",
            status: "Sent",
            date: value.date,
            dueDate: value.dueDate,
            clientId: value.clientId,
            branchId: value.branchId,
            lines: [
              {
                description: `Opening balance carried forward — ${value.originalNumber}`,
                amountPaise: value.amountPaise,
                gstRate: 0,
                netPaise: value.amountPaise,
                totalPaise: value.amountPaise,
              },
            ],
            subtotalPaise: value.amountPaise,
            totalPaise: value.amountPaise,
            notes: value.notes
              ? `Carried in at go-live. ${value.notes}`
              : "Carried in at go-live from the firm's previous records.",
            issuedAt: value.date,
            issuedBy: actor.id,
            createdBy: actor.id,
            updatedBy: actor.id,
          },
        ],
        { session },
      );
      count += 1;
      totalPaise += value.amountPaise;
    }

    await recordAudit(
      {
        action: ACTIONS.create,
        entityType: "Invoice",
        entityId: "opening-balances",
        note: `${actor.name} carried in ${count} opening balances totalling ${totalPaise} paise from the firm's previous records`,
      },
      session,
    );
  });

  revalidatePath("/invoices");
  revalidatePath("/invoices/receivables");

  return {
    ok: `${count} opening ${count === 1 ? "balance" : "balances"} carried in. They appear on the receivables and ageing reports straight away, marked as carried forward.`,
  };
}

// @ts-check

import { parseCSVObjects, normaliseHeader } from "../csv.js";
import { ROLES, ROLE_LABELS } from "../permissions.js";
import { checkEmail } from "../validators.js";

/**
 * Bringing the firm's own people in from a sheet (spec section 17, step 2).
 *
 * The same shape as the client import, and the same discipline: read the
 * whole sheet, say what is wrong with it line by line, and write nothing
 * until somebody has looked.
 *
 * Two things it deliberately will not do:
 *
 *  - **it does not set passwords.** Each person gets a one-time password
 *    read out to them by the partner, as in Step 1, and 2FA is enrolled on
 *    their first sign-in. A column of passwords in a spreadsheet is the
 *    worst place in the firm to keep one.
 *  - **it does not make partners.** A row asking for the partner role is
 *    flagged rather than obeyed, because the partner role can see every
 *    fee, reveal every password and complete every engagement. That is a
 *    decision for a person, on the Team screen, not an effect of a cell in
 *    a spreadsheet.
 */

export const TEAM_COLUMNS = ["name", "email", "role", "branchCodes", "notes"];

/**
 * @param {string} csvText
 * @param {{ branches: Array<{id: string, code: string}>, existingEmails?: string[] }} context
 */
export function prepareTeamImport(csvText, { branches, existingEmails = [] }) {
  const { headers, rows: raw } = parseCSVObjects(csvText);
  const branchIdByCode = new Map(branches.map((b) => [b.code, b.id]));
  const taken = new Set(existingEmails.map((email) => email.toLowerCase()));

  const known = new Set(TEAM_COLUMNS.map((column) => normaliseHeader(column)));
  const unknownHeaders = headers.filter(
    (header) => header.trim() !== "" && !known.has(normaliseHeader(header)),
  );

  /** @type {Map<string, number>} */
  const seen = new Map();

  const rows = raw.map((row, index) => {
    const line = index + 2;
    const errors = [];
    const warnings = [];

    const name = String(row.name ?? "").trim();
    if (name.length < 2) errors.push("A name is missing");

    const email = String(row.email ?? "")
      .trim()
      .toLowerCase();
    const emailCheck = checkEmail(email);
    if (!email) errors.push("An email address is missing");
    else if (!emailCheck.ok) errors.push(emailCheck.reason);
    else if (taken.has(email)) errors.push("Somebody already has that email");
    else if (seen.has(email)) {
      errors.push(`That email is also on row ${seen.get(email)}`);
    } else {
      seen.set(email, line);
    }

    const role = String(row.role ?? "")
      .trim()
      .toLowerCase();
    if (!role) errors.push("A role is missing");
    else if (!ROLES.includes(role)) {
      errors.push(
        `"${row.role}" is not a role. Use one of: ${ROLES.join(", ")}`,
      );
    } else if (role === "partner") {
      // flagged, not refused: the import skips it and says why
      warnings.push(
        "Partners are not created by import. Add them on the Team screen, where it is a deliberate act.",
      );
    }

    const codes = String(row.branchcodes ?? "")
      .split(/[,;|\s]+/)
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean);

    if (codes.length === 0) errors.push("No branch code given");
    for (const code of codes) {
      if (!branchIdByCode.has(code)) {
        errors.push(
          `Branch "${code}" is not one of ${[...branchIdByCode.keys()].join(", ")}`,
        );
      }
    }

    return {
      line,
      name: name || "(no name)",
      roleLabel: ROLE_LABELS[role] ?? row.role ?? "",
      value: {
        name,
        email,
        role,
        branchIds: codes
          .map((code) => branchIdByCode.get(code))
          .filter(Boolean),
        notes: String(row.notes ?? "").trim(),
      },
      errors,
      warnings,
      // a partner row is readable and checkable, but will not be written
      skip: role === "partner",
    };
  });

  const ready = rows.filter((row) => row.errors.length === 0 && !row.skip);

  return {
    headers,
    unknownHeaders,
    rows,
    readyCount: ready.length,
    errorCount: rows.filter((row) => row.errors.length > 0).length,
    skippedCount: rows.filter((row) => row.skip).length,
  };
}

/** The sheet a person downloads, fills in and uploads. */
export function teamTemplateRows() {
  return [
    TEAM_COLUMNS,
    ["Neha Bhatt", "neha@phmgindia.com", "ca", "NOI", "Indirect tax"],
    ["Rohit Saini", "rohit@phmgindia.com", "employee", "LDH DEL", ""],
    ["Ananya Iyer", "ananya@phmgindia.com", "intern", "MRT", "Articled, 2026"],
  ];
}

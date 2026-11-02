// @ts-check

import { readNumber, readDate } from "./profile.js";

/**
 * The figures at the top of the lab (the owner's screen of 02-11-2026).
 *
 * What the sheet adds up to, before any check runs — because the first
 * thing anybody asks of a file a client has sent is *how much is this and
 * how many rows*, and working that out by hand in Excel is the job the lab
 * exists to save.
 *
 * Everything here is read from **the columns a person mapped**, never from
 * a column this file went looking for. If nobody said which column is the
 * amount, there is no money figure — a blank is the honest answer and a
 * guessed total is not.
 *
 * Pure: rows in, figures out, nothing stored and nothing fetched.
 */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const inr = (value) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    Math.round(value),
  );

const cell = (row, mapping, role) => {
  const index = mapping?.[role];
  if (index === undefined || index === null || index === "") return "";
  return String(row[Number(index)] ?? "").trim();
};

const mapped = (mapping, role) =>
  mapping?.[role] !== undefined &&
  mapping?.[role] !== null &&
  mapping?.[role] !== "";

const sum = (rows, mapping, role) =>
  rows.reduce((total, row) => total + (readNumber(cell(row, mapping, role)) ?? 0), 0);

/**
 * @param {string[][]} rows
 * @param {Record<string, string|number>} mapping
 * @param {string} kind
 */
export function misFigures(rows, mapping = {}, kind = "generic") {
  /** @type {Array<{label: string, value: string, note?: string}>} */
  const kpis = [];
  const count = rows.length;

  kpis.push({ label: "Rows", value: inr(count) });

  const hasAmount = mapped(mapping, "amount");
  const hasSides = mapped(mapping, "debit") && mapped(mapping, "credit");

  const amount = hasAmount ? sum(rows, mapping, "amount") : 0;
  const debit = hasSides ? sum(rows, mapping, "debit") : 0;
  const credit = hasSides ? sum(rows, mapping, "credit") : 0;

  if (kind === "tb" && (hasAmount || hasSides)) {
    const difference = hasSides
      ? Math.round((debit - credit) * 100) / 100
      : Math.round(amount * 100) / 100;
    kpis.push({
      label: "Trial balance",
      value: difference === 0 ? "Balanced" : `Out by ₹${inr(difference)}`,
      note: difference === 0 ? "every balance adds to nil" : "the export is short a row",
    });
  }

  if (hasSides && kind !== "tb") {
    kpis.push({ label: "Money in", value: `₹${inr(credit)}` });
    kpis.push({ label: "Money out", value: `₹${inr(debit)}` });
    kpis.push({
      label: "Net",
      value: `₹${inr(credit - debit)}`,
      note: "deposits less withdrawals, over the rows read",
    });
  } else if (hasAmount) {
    kpis.push({ label: "Total", value: `₹${inr(amount)}` });
    if (count > 0) {
      kpis.push({
        label: "Average",
        value: `₹${inr(amount / count)}`,
        note: "per row",
      });
    }
  }

  /** Who is in it, and how concentrated. */
  /** @type {Map<string, number>} */
  const byParty = new Map();
  if (mapped(mapping, "party")) {
    for (const row of rows) {
      const name = cell(row, mapping, "party") || "(not named)";
      const value = hasAmount
        ? (readNumber(cell(row, mapping, "amount")) ?? 0)
        : hasSides
          ? Math.abs(readNumber(cell(row, mapping, "credit")) ?? 0) +
            Math.abs(readNumber(cell(row, mapping, "debit")) ?? 0)
          : 1;
      byParty.set(name, (byParty.get(name) ?? 0) + value);
    }
    kpis.push({
      label: kind === "tb" ? "Ledgers" : "Parties",
      value: inr(byParty.size),
    });
  }

  const tops = [...byParty.entries()]
    .map(([label, value]) => ({ label, value: Math.abs(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const partyTotal = tops.reduce(
    (total, row) => total + row.value,
    0,
  );
  const allParties = [...byParty.values()].reduce(
    (total, value) => total + Math.abs(value),
    0,
  );

  if (kind === "sales" && allParties > 0 && byParty.size >= 3) {
    const topThree = tops.slice(0, 3).reduce((total, row) => total + row.value, 0);
    kpis.push({
      label: "Top three",
      value: `${Math.round((topThree / allParties) * 100)}%`,
      note: "of the total, from three parties",
    });
  }

  /** By month, where a date was mapped — the one chart worth drawing. */
  /** @type {Map<string, number>} */
  const byMonth = new Map();
  if (mapped(mapping, "date")) {
    for (const row of rows) {
      const date = readDate(cell(row, mapping, "date"));
      if (!date) continue;
      const key = `${date.getUTCFullYear()}-${String(
        date.getUTCMonth() + 1,
      ).padStart(2, "0")}`;
      const value = hasAmount
        ? (readNumber(cell(row, mapping, "amount")) ?? 0)
        : hasSides
          ? (readNumber(cell(row, mapping, "credit")) ?? 0) -
            (readNumber(cell(row, mapping, "debit")) ?? 0)
          : 1;
      byMonth.set(key, (byMonth.get(key) ?? 0) + value);
    }
  }

  const bars = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({
      label: `${MONTHS[Number(key.slice(5)) - 1]} ${key.slice(2, 4)}`,
      value,
    }));

  return {
    kpis,
    bars,
    barsTitle: hasSides && kind !== "tb" ? "Net by month" : "By month",
    tops,
    topsTitle: kind === "tb" ? "Largest balances" : "Biggest parties",
    topsShare: partyTotal > 0,
  };
}

// @ts-check

import Engagement from "../../models/Engagement.js";
import { branchFilter, can } from "../permissions.js";
import { engagementQuery } from "../engagements/filter.js";
import {
  receivables,
  unbilled,
  dscExpiringTile,
  atRiskTile,
} from "./figures.js";
import { formatPaise } from "../money.js";
import { financialYearStart, istDate } from "../dates.js";

/**
 * The six figures across the top of the reports index (P2-10c).
 *
 * Every one of them is a link to the report or list that produced it: a
 * figure you cannot open is a nag. They come from `figures.js` wherever
 * one already exists, so the strip cannot disagree with the dashboard
 * showing the same number on the next screen.
 *
 * Each is skipped when the reader may not see what is behind it, so
 * somebody without billing does not get a money figure they cannot open.
 *
 * @param {{id: string, role: string, branchIds?: string[]}} actor
 * @param {Date} [now]
 */
export async function reportHeadlines(actor, now = new Date()) {
  const work = can(actor, "view", "engagementsWork");
  const money = can(actor, "view", "invoices");
  const fyStart = financialYearStart(now);
  const year = {
    $gte: istDate(fyStart, 4, 1),
    $lt: istDate(fyStart + 1, 4, 1),
  };

  const [open, overdue, risky, lateFilings, owed, notBilled, certificates] =
    await Promise.all([
      work ? Engagement.countDocuments(engagementQuery(actor, {}, now)) : null,
      work
        ? Engagement.countDocuments(
            engagementQuery(actor, { due: "overdue" }, now),
          )
        : null,
      work ? atRiskTile(actor, now) : null,
      /**
       * Filed after the deadline this financial year. Counted here rather
       * than read from a tile because no dashboard asks it — "late" only
       * became answerable when P2-8a recorded `filedOn`.
       */
      work
        ? Engagement.countDocuments({
            ...(branchFilter(actor, "engagementsWork") ?? {}),
            filedOn: year,
            statutoryDue: { $ne: null },
            $expr: { $gt: ["$filedOn", "$statutoryDue"] },
          })
        : null,
      money ? receivables(actor, now) : null,
      money ? unbilled(actor) : null,
      can(actor, "view", "dsc") ? dscExpiringTile(actor, now) : null,
    ]);

  const tiles = [];

  if (work) {
    tiles.push(
      {
        key: "open",
        label: "Open work",
        value: String(open),
        href: "/engagements",
      },
      {
        key: "overdue",
        label: "Overdue",
        value: String(overdue),
        href: "/reports/overdue",
        tone: overdue > 0 ? "late" : "plain",
      },
      {
        /**
         * Beside Overdue, never merged into it (P3-5). Overdue is the list
         * where acting is too late; this is the list where it still works,
         * and one number covering both tells a partner nothing.
         */
        key: "at-risk",
        label: "At risk",
        value: String(risky.count),
        href: risky.href,
        tone: risky.count > 0 ? "waiting" : "plain",
      },
      {
        key: "late",
        label: "Filed late this year",
        value: String(lateFilings),
        href: "/reports/punctuality",
        tone: lateFilings > 0 ? "late" : "plain",
      },
    );
  }

  if (money) {
    tiles.push(
      {
        key: "owed",
        label: "Outstanding",
        // `ageReceivables` returns the buckets plus their total
        value: formatPaise(owed.ageing?.total ?? 0),
        href: "/invoices/receivables",
        tone: owed.overdueCount > 0 ? "late" : "plain",
      },
      {
        key: "unbilled",
        label: "Unbilled",
        value: formatPaise(notBilled.paise),
        href: "/reports/unbilled",
      },
    );
  }

  // absent when nothing is expiring: a tile that always reads zero is
  // furniture, which is the same rule `dscExpiringTile` already follows
  if (certificates) {
    tiles.push({
      key: "certificates",
      label: "Certificates expiring",
      value: String(certificates.value),
      href: "/reports/certificates",
      tone: "late",
    });
  }

  return tiles;
}

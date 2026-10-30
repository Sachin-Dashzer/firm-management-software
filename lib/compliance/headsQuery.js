// @ts-check

import Engagement from "../../models/Engagement.js";
import ServiceTemplate from "../../models/ServiceTemplate.js";
import ClientService from "../../models/ClientService.js";
import { branchFilter } from "../permissions.js";
import { financialYearStart } from "../dates.js";
import { periodsInYear } from "./grid.js";
import { buildHeads } from "./heads.js";

/**
 * The database half of "where does the firm stand by head" (P3-34 phase 3).
 *
 * `buildHeads()` is pure and stays pure. This is the reading it needs, and
 * it is here rather than inside a screen because **two screens ask the same
 * question** — the compliance overview, and the dashboard tile that counts
 * periods nobody opened a job for. A dashboard figure that disagrees with
 * the screen it links to is the one failure spec §17 names by name, and the
 * only way to be sure is for both to run the same query.
 *
 * The periods are matched by **code** rather than by a date range, for the
 * reason the compliance screen already gives: `periodStart` is a field
 * older rows may never have been given, and the codes are about twenty
 * strings.
 *
 * @param {object} actor
 * @param {object} [options]
 * @param {number} [options.fy] financial year start, defaults to this one
 * @param {string[]|null} [options.clientIds] already scoped by the caller
 * @param {Array<any>} [options.services] pre-read templates, if the caller has them
 * @param {Date} [options.now]
 */
export async function loadHeads(actor, options = {}) {
  const now = options.now ?? new Date();
  const fy = options.fy ?? financialYearStart(now);
  const clientIds = options.clientIds ?? null;

  const services =
    options.services ??
    (
      await ServiceTemplate.find({ active: true })
        .select("name code category recurrence")
        .sort({ name: 1 })
        .lean()
    ).map((template) => ({
      id: String(template._id),
      code: template.code,
      name: template.name,
      category: template.category,
      recurrence: template.recurrence,
    }));

  if (services.length === 0) {
    return { categories: [], totals: { open: 0, overdue: 0, missing: 0 } };
  }

  const codes = [
    ...new Set(
      [...new Set(services.map((service) => service.recurrence))].flatMap((r) =>
        periodsInYear(r, fy).map((period) => period.code),
      ),
    ),
  ];

  const scope = branchFilter(actor, "engagementsWork") ?? {};

  const [engagements, subscriptions] = await Promise.all([
    Engagement.find({
      ...scope,
      ...(clientIds ? { clientId: { $in: clientIds } } : {}),
      period: { $in: codes },
    })
      /* `milestones` is what `wasOnTime()` reads for the on-time figure */
      .select(
        "serviceTemplateId clientId status statutoryDue internalDue milestones",
      )
      .limit(20000)
      .lean(),
    ClientService.find({
      active: true,
      ...(clientIds ? { clientId: { $in: clientIds } } : {}),
    })
      .select("clientId serviceTemplateId")
      .lean(),
  ]);

  /** @type {Map<string, number>} */
  const subscribers = new Map();
  for (const row of subscriptions) {
    const key = String(row.serviceTemplateId);
    subscribers.set(key, (subscribers.get(key) ?? 0) + 1);
  }

  return buildHeads({ services, engagements, subscribers, fyStart: fy, now });
}

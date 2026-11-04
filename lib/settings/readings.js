// @ts-check

import Branch from "../../models/Branch.js";
import ServiceTemplate from "../../models/ServiceTemplate.js";
import DueDateRule from "../../models/DueDateRule.js";
import DocTemplate from "../../models/DocTemplate.js";
import NotificationRule from "../../models/NotificationRule.js";
import User from "../../models/User.js";
import { ROLES } from "../permissions.js";

/**
 * What is true of each settings screen, as a figure (D106).
 *
 * `Shell.jsx` draws every settings row with a reading on the right and
 * says why: "four offices, eleven rules, none confirmed" is the part
 * somebody opening Settings is looking for. Nothing computed it, so the
 * index shipped as a grid of same-size cards instead — the rows existed
 * and had nothing to put in them.
 *
 * This is deliberately **not** `attention.js`. That file answers "what is
 * wrong" and stays silent when nothing is; this answers "how big is it"
 * and always has a number. A screen needs both: the alarm, and the size
 * of the thing the alarm is about.
 *
 * The split into `figure` and `words` is so the figure can go on the
 * ledger grid and the words stay in the body face — "4 offices" wholly in
 * mono reads like a part number.
 *
 * **Two words at most** (04-11-2026). These used to be little sentences —
 * "11 rules, 10 unconfirmed" — which said the same thing the attention
 * strip above them was already saying, in different words, and would not
 * fit a directory column besides. The reading is the *size* of the thing.
 * What is wrong with it is the strip's job, and the row only has to agree
 * in colour.
 *
 * One pass, counts only: no documents are loaded, and every count is on
 * an indexed field.
 *
 * @typedef {{figure: string, words: string}} Reading
 * @returns {Promise<Record<string, Reading>>} reading by href
 */
export async function settingsReadings() {
  const [branches, services, rules, templates, recipes, staff] =
    await Promise.all([
      Branch.countDocuments({ deletedAt: null }),
      ServiceTemplate.countDocuments({
        deletedAt: null,
        active: { $ne: false },
      }),
      DueDateRule.countDocuments({ deletedAt: null }),
      DocTemplate.countDocuments({ deletedAt: null, active: true }),
      NotificationRule.countDocuments({ enabled: true }),
      User.countDocuments({ deletedAt: null, active: true }),
    ]);

  return {
    "/settings/branches": count(branches, "office", "offices"),
    "/settings/services": count(services, "service", "services"),
    "/settings/due-dates": count(rules, "rule", "rules"),
    "/settings/doc-templates": count(templates, "template", "templates"),
    /* A rule exists in this collection only once the firm has changed it,
       so an empty collection is a working system — "0 recipes" would be a
       lie about a product that ships them all switched on. */
    "/settings/automation": recipes
      ? { figure: String(recipes), words: "changed" }
      : { figure: "", words: "on defaults" },
    "/team": count(staff, "person", "people"),
    "/settings/permissions": {
      figure: String(ROLES.length),
      words: "roles",
    },
  };
}

/** "1 office", "4 offices", and "none yet" rather than "0 offices". */
function count(n, one, many) {
  if (!n) return { figure: "", words: `no ${many} yet` };
  return { figure: String(n), words: n === 1 ? one : many };
}

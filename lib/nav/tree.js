// @ts-check

import { can } from "../permissions.js";

/**
 * The menu, in one place (P3-22a).
 *
 * The rail, the phone drawer and the command bar all read this file, and
 * **nothing else lists menu items**. Before this there were three lists —
 * the rail's own, the command bar's own, and a bottom bar for phones — and
 * they had already drifted: the rail knew about the practice books, the
 * command bar knew about notices, and neither knew about the inbox.
 *
 * The shape is the owner's brief of 27-10-2026: ten groups and 58 links for
 * a partner, eight groups and 24 for staff, in the prototype's order and
 * with its labels. What is *not* copied is the prototype's data, its demo
 * machinery, and its habit of inventing a page for every idea.
 *
 * @typedef {object} NavItem
 * @property {string} label
 * @property {string} href
 * @property {string|null} area       `can(actor, "view", area)`; null = anybody signed in
 * @property {string} [module]        hidden when that module is switched off
 * @property {string} [count]         key into `navCounts()`
 * @property {"bad"|"warn"|""} [tone]
 * @property {string[]} [alsoActive]  path prefixes that also light this item
 * @property {boolean} [needsDataEntry] only for somebody who may enter client data
 *
 * @typedef {object} NavGroup
 * @property {string} id
 * @property {string} label
 * @property {string} icon
 * @property {string} [module]
 * @property {string} [count]         the group's own badge, shown only while closed
 * @property {"bad"|"warn"|""} [tone]
 * @property {Array<NavItem|string>} items  a plain string is a section label
 */

/** The modules a partner can switch off. Everything else is always on. */
export const MODULES = ["audit", "notices", "lab", "learning", "cx"];

export const MODULE_LABELS = {
  audit: "Audit and certificates",
  notices: "Notices",
  lab: "Data lab",
  learning: "Learning",
  cx: "Client experience",
};

/** All on until a partner says otherwise. */
export const MODULE_DEFAULTS = Object.fromEntries(
  MODULES.map((key) => [key, true]),
);

const OPEN = "/engagements";
const AWAITING = "/engagements?status=Awaiting%20documents";
const IN_REVIEW = "/engagements?status=Under%20review";
const OVERDUE = "/engagements?due=overdue";

/** @type {NavGroup[]} */
export const PARTNER_NAV = [
  {
    id: "today",
    label: "Today",
    icon: "home",
    count: "issues",
    tone: "warn",
    items: [
      {
        label: "Issues",
        href: "/issues",
        area: null,
        count: "issues",
        tone: "warn",
      },
      {
        label: "Inbox",
        href: "/inbox",
        area: null,
        count: "inbox",
        tone: "warn",
      },
      { label: "My tasks", href: "/my-day", area: null },
      { label: "To-dos", href: "/todos", area: null, count: "todos" },
      { label: "Firm dashboard", href: "/dashboard", area: "dashboards" },
    ],
  },
  {
    id: "jobs",
    label: "Jobs",
    icon: "jobs",
    count: "overdue",
    tone: "bad",
    items: [
      {
        label: "All open jobs",
        href: OPEN,
        area: "engagementsWork",
        count: "openJobs",
        alsoActive: ["/engagements/", "/team/plan"],
      },
      {
        label: "Overdue",
        href: OVERDUE,
        area: "engagementsWork",
        count: "overdue",
        tone: "bad",
      },
      {
        label: "Waiting on client",
        href: AWAITING,
        area: "engagementsWork",
        count: "waiting",
      },
      {
        label: "In review",
        href: IN_REVIEW,
        area: "engagementsWork",
        count: "inReview",
      },
      { label: "Weekly planning", href: "/team/plan", area: "team" },
    ],
  },
  {
    id: "compliance",
    label: "Compliance calendar",
    icon: "compliance",
    items: [
      {
        label: "Monthly returns",
        href: "/calendar?freq=monthly",
        area: "engagementsWork",
      },
      {
        label: "Quarterly returns",
        href: "/calendar?freq=quarterly",
        area: "engagementsWork",
      },
      {
        label: "Annual filings",
        href: "/calendar?freq=annual",
        area: "engagementsWork",
      },
      {
        label: "Monthly GST cycle",
        href: "/gst-cycle",
        area: "engagementsWork",
      },
    ],
  },
  {
    id: "clients",
    label: "Clients",
    icon: "clients",
    items: [
      {
        label: "All clients",
        href: "/clients",
        area: "clients",
        alsoActive: ["/clients/"],
      },
      {
        label: "Groups",
        href: "/groups",
        area: "clients",
        alsoActive: ["/groups/"],
      },
      { label: "New client", href: "/clients/new", area: "clients" },
      {
        label: "Bulk client data",
        href: "/clients/round-trip",
        area: "clients",
        needsDataEntry: true,
      },
      "Client experience",
      {
        label: "WhatsApp assistant",
        href: "/client-experience?tab=whatsapp",
        area: "clients",
        module: "cx",
      },
      {
        label: "Monthly health report",
        href: "/client-experience?tab=report",
        area: "clients",
        module: "cx",
      },
      {
        label: "Business pulse",
        href: "/client-experience?tab=pulse",
        area: "clients",
        module: "cx",
      },
    ],
  },
  {
    id: "notices",
    label: "Notices",
    icon: "notices",
    module: "notices",
    count: "noticesNoDraft",
    tone: "bad",
    items: [
      {
        label: "All open matters",
        href: "/practice/notices",
        area: "practice",
        count: "noticesOpen",
        alsoActive: ["/practice/notices/"],
      },
      {
        label: "Due in 7 days, no draft",
        href: "/practice/notices?show=nodraft",
        area: "practice",
        count: "noticesNoDraft",
        tone: "bad",
      },
      {
        label: "GST",
        href: "/practice/notices?law=GST",
        area: "practice",
        count: "noticesGst",
      },
      {
        label: "Income tax",
        href: "/practice/notices?law=Income%20tax",
        area: "practice",
        count: "noticesIt",
      },
      {
        label: "Closed",
        href: "/practice/notices?stage=Closed",
        area: "practice",
      },
    ],
  },
  {
    id: "audit",
    label: "Audit and certificates",
    icon: "audit",
    module: "audit",
    items: [
      {
        label: "Audit studio",
        href: "/practice/audit",
        area: "practice",
        alsoActive: ["/practice/audit/"],
      },
      "Audit files",
      { label: "All files", href: "/practice/audits", area: "practice" },
      {
        label: "Statutory",
        href: "/practice/audits?cat=statutory",
        area: "practice",
        count: "auditStatutory",
      },
      {
        label: "Tax audit",
        href: "/practice/audits?cat=tax",
        area: "practice",
        count: "auditTax",
      },
      {
        label: "Internal",
        href: "/practice/audits?cat=internal",
        area: "practice",
        count: "auditInternal",
      },
      {
        label: "Concurrent",
        href: "/practice/audits?cat=concurrent",
        area: "practice",
        count: "auditConcurrent",
      },
      {
        label: "Stock audit",
        href: "/practice/audits?cat=stock",
        area: "practice",
        count: "auditStock",
      },
      "Working tools",
      { label: "TB to financials", href: "/practice/tb", area: "practice" },
      {
        label: "Sampling and vouching",
        href: "/practice/sampling",
        area: "practice",
      },
      "Certificates and reports",
      {
        label: "Certificate studio",
        href: "/practice/certificates/new",
        area: "udin",
      },
      {
        label: "Certificate register",
        href: "/practice/certificates",
        area: "udin",
        count: "certNoUdin",
        tone: "warn",
        alsoActive: ["/practice/certificates/"],
      },
      {
        label: "Auditor's report (SA 700)",
        href: "/practice/auditors-report",
        area: "practice",
      },
      { label: "UDIN register", href: "/practice/udin", area: "udin" },
    ],
  },
  {
    id: "billing",
    label: "Billing",
    icon: "billing",
    items: [
      {
        label: "Ready to bill",
        href: "/billing?tab=ready",
        area: "invoices",
        count: "readyToBill",
      },
      {
        label: "Invoices",
        href: "/billing?tab=invoices",
        area: "invoices",
        /**
         * One invoice, the new-invoice form and the export all live under
         * `/invoices/` still — it is the *list* that became a tab of
         * Billing (P3-22b), so the detail pages light this item.
         */
        alsoActive: ["/invoices/"],
      },
      {
        label: "Collections",
        href: "/billing?tab=collections",
        area: "invoices",
        count: "unpaid",
        tone: "warn",
      },
      {
        label: "TDS credit to match",
        href: "/billing?tab=tds",
        area: "invoices",
      },
      { label: "Accounts desk", href: "/billing/desk", area: "invoices" },
    ],
  },
  {
    id: "documents",
    label: "Documents",
    icon: "docs",
    items: [
      {
        label: "All files",
        href: "/documents",
        area: "documents",
        alsoActive: ["/documents/"],
      },
      {
        label: "Awaited from clients",
        href: "/documents?tab=pending",
        area: "documents",
        count: "docsAwaited",
        tone: "warn",
      },
      {
        label: "DSC register",
        href: "/practice/dsc",
        area: "dsc",
        count: "dscExpiring",
        tone: "warn",
      },
      {
        label: "Logins vault",
        href: "/registers/vault",
        area: "clientCredentials",
      },
    ],
  },
  {
    id: "team",
    label: "Team",
    icon: "team",
    items: [
      { label: "Leave and cover", href: "/team/leave", area: "team" },
      {
        label: "Team and time",
        href: "/team",
        area: "team",
        alsoActive: ["/team/"],
      },
    ],
  },
  {
    id: "firm",
    label: "Firm",
    icon: "setup",
    items: [
      {
        label: "Management reports",
        href: "/reports",
        area: "dashboards",
        alsoActive: ["/reports/"],
      },
      {
        label: "Email and WhatsApp",
        href: "/settings/messages",
        area: "firmProfile",
      },
      {
        label: "Automation runs and approvals",
        href: "/settings/automation",
        area: "firmProfile",
        count: "automationWaiting",
        tone: "warn",
      },
      "Tools",
      {
        label: "Templates",
        href: "/settings/doc-templates",
        area: "docTemplates",
      },
      {
        label: "Data lab (Excel to MIS)",
        href: "/lab",
        area: "engagementsWork",
        module: "lab",
      },
      "Learning",
      {
        label: "Learning library",
        href: "/learning?tab=playbooks",
        area: null,
        module: "learning",
        alsoActive: ["/learning/"],
      },
      {
        label: "How we work here",
        href: "/learning?tab=sops",
        area: null,
        module: "learning",
      },
      "Set up",
      {
        label: "Settings and customisation",
        href: "/settings",
        area: null,
        alsoActive: ["/settings/"],
      },
    ],
  },
];

/** @type {NavGroup[]} */
export const STAFF_NAV = [
  {
    id: "today",
    label: "Today",
    icon: "home",
    count: "issues",
    tone: "warn",
    items: [
      {
        label: "Issues",
        href: "/issues",
        area: null,
        count: "issues",
        tone: "warn",
      },
      {
        label: "Inbox",
        href: "/inbox",
        area: null,
        count: "inbox",
        tone: "warn",
      },
      { label: "My tasks", href: "/my-day", area: null },
      { label: "To-dos", href: "/todos", area: null, count: "todos" },
    ],
  },
  {
    id: "jobs",
    label: "My jobs",
    icon: "jobs",
    count: "overdue",
    tone: "bad",
    items: [
      {
        label: "All open jobs",
        href: OPEN,
        area: "engagementsWork",
        count: "openJobs",
        alsoActive: ["/engagements/"],
      },
      {
        label: "Overdue",
        href: OVERDUE,
        area: "engagementsWork",
        count: "overdue",
        tone: "bad",
      },
      {
        label: "Waiting on client",
        href: AWAITING,
        area: "engagementsWork",
        count: "waiting",
      },
      {
        label: "In review",
        href: IN_REVIEW,
        area: "engagementsWork",
        count: "inReview",
      },
      {
        label: "Monthly GST cycle",
        href: "/gst-cycle",
        area: "engagementsWork",
      },
    ],
  },
  {
    id: "clients",
    label: "My clients",
    icon: "clients",
    items: [
      {
        label: "Client list",
        href: "/clients",
        area: "clients",
        alsoActive: ["/clients/"],
      },
      {
        label: "Bulk client data",
        href: "/clients/round-trip",
        area: "clients",
        needsDataEntry: true,
      },
    ],
  },
  {
    id: "notices",
    label: "Notices",
    icon: "notices",
    module: "notices",
    items: [
      {
        label: "Open matters",
        href: "/practice/notices",
        area: "practice",
        count: "noticesOpen",
        alsoActive: ["/practice/notices/"],
      },
      { label: "GST", href: "/practice/notices?law=GST", area: "practice" },
      {
        label: "Income tax",
        href: "/practice/notices?law=Income%20tax",
        area: "practice",
      },
    ],
  },
  {
    id: "audit",
    label: "Audit",
    icon: "audit",
    module: "audit",
    items: [
      {
        label: "Sampling and vouching",
        href: "/practice/sampling",
        area: "practice",
      },
      {
        label: "Certificate studio",
        href: "/practice/certificates/new",
        area: "udin",
      },
    ],
  },
  {
    id: "documents",
    label: "Documents",
    icon: "docs",
    items: [
      {
        label: "All files",
        href: "/documents",
        area: "documents",
        alsoActive: ["/documents/"],
      },
      {
        label: "Awaited from clients",
        href: "/documents?tab=pending",
        area: "documents",
        count: "docsAwaited",
        tone: "warn",
      },
    ],
  },
  {
    id: "team",
    label: "Team",
    icon: "team",
    items: [
      { label: "Leave and cover", href: "/team/leave", area: "team" },
      { label: "Timesheet", href: "/team/time", area: "timeEntries" },
    ],
  },
  {
    id: "tools",
    label: "Tools and learning",
    icon: "book",
    items: [
      {
        label: "Templates",
        href: "/settings/doc-templates",
        area: "docTemplates",
      },
      {
        label: "Data lab",
        href: "/lab",
        area: "engagementsWork",
        module: "lab",
      },
      {
        label: "Learning library",
        href: "/learning?tab=playbooks",
        area: null,
        module: "learning",
        alsoActive: ["/learning/"],
      },
      {
        label: "How we work here",
        href: "/learning?tab=sops",
        area: null,
        module: "learning",
      },
    ],
  },
];

/**
 * Which menu a role gets (owner decision, 27-10-2026).
 *
 * The prototype has two staff menus; this app has five roles. Accounts gets
 * the partner layout because their work is in it — billing, collections,
 * TDS — and `can()` then removes the Jobs and Audit groups they cannot
 * open, so the choice costs nothing.
 */
export function navFor(role) {
  return role === "employee" || role === "intern" ? STAFF_NAV : PARTNER_NAV;
}

const isLabel = (item) => typeof item === "string";

/**
 * The menu this person actually sees.
 *
 * Three filters, in order: the module is on, the role may view the area,
 * and — for the one item the prototype guards that way — they may enter
 * client data. Then a group with no link left is removed, and so is a
 * section label with nothing under it.
 *
 * @param {import("../permissions.js").Actor} actor
 * @param {Record<string, boolean>} [modules]
 * @returns {NavGroup[]}
 */
export function menuFor(actor, modules = MODULE_DEFAULTS) {
  const on = (key) => !key || modules[key] !== false;
  const mayEnterData = can(actor, "edit", "clients");

  return navFor(actor.role)
    .filter((group) => on(group.module))
    .map((group) => {
      /** @type {Array<NavItem|string>} */
      const kept = [];

      for (const item of group.items) {
        if (isLabel(item)) {
          kept.push(item);
          continue;
        }
        if (!on(item.module)) continue;
        if (item.needsDataEntry && !mayEnterData) continue;
        if (item.area && !can(actor, "view", item.area)) continue;
        kept.push(item);
      }

      // a section label with no link under it is not a section
      const items = kept.filter(
        (item, index) =>
          !isLabel(item) ||
          kept.slice(index + 1).some((next) => !isLabel(next)),
      );

      return { ...group, items };
    })
    .filter((group) => group.items.some((item) => !isLabel(item)));
}

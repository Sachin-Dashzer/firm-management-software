// @ts-check

import { formatISTDate } from "../dates.js";
import { formatPaise } from "../money.js";

/**
 * Filling a document template (P2-8b, "Based Docs").
 *
 * A template is plain text with `{{client.legalName}}` in it. This turns one
 * into the words that go on the page, and — the part that matters — **says
 * what it could not fill**. A letter that goes out with a silent blank where
 * the client's GSTIN should be is worse than no letter: nobody notices until
 * the client does.
 *
 * So there are two kinds of problem and both are visible, never swallowed:
 *
 *  - a **gap**: a field we know about that the record does not have. It is
 *    rendered as a marked blank, and reported, and a document with gaps
 *    cannot be issued as final.
 *  - an **unknown** placeholder: a name no field answers to — usually a typo
 *    in the template. It is left on the page exactly as written, so whoever
 *    reads the draft sees `{{clint.name}}` and fixes the template.
 */

/** How a gap appears on the page: visible, and impossible to mistake for text. */
export const GAP_MARK = (label) => `[${label} — not recorded]`;

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/**
 * Every field a template may use.
 *
 * Deliberately a closed list. Letting a template reach anywhere into a client
 * record would put a PAN or a portal password one typo away from a document
 * (CLAUDE.md rule 7), so the fields are named here one at a time and nothing
 * sensitive is among them.
 *
 * @type {Record<string, {label: string, read: (c: any) => any}>}
 */
export const FIELDS = {
  "firm.name": { label: "Firm name", read: (c) => c.firm?.name },
  "firm.frn": { label: "Firm registration number", read: (c) => c.firm?.frn },
  "firm.address": { label: "Firm address", read: (c) => c.firm?.headOffice },
  "firm.email": { label: "Firm email", read: (c) => c.firm?.email },
  "firm.phone": { label: "Firm telephone", read: (c) => c.firm?.phone },

  "client.legalName": { label: "Client legal name", read: (c) => c.client?.legalName },
  "client.tradeName": { label: "Client trade name", read: (c) => c.client?.tradeName },
  "client.address": { label: "Client address", read: (c) => c.client?.address },
  "client.entityType": { label: "Entity type", read: (c) => c.client?.entityType },
  "client.gstin": { label: "Client GSTIN", read: (c) => c.client?.gstin },
  "client.contactName": { label: "Contact name", read: (c) => c.client?.contactName },
  "client.contactDesignation": {
    label: "Contact designation",
    read: (c) => c.client?.contactDesignation,
  },

  "engagement.service": { label: "Service", read: (c) => c.engagement?.service },
  "engagement.period": { label: "Period", read: (c) => c.engagement?.period },
  "engagement.code": { label: "Engagement code", read: (c) => c.engagement?.code },
  "engagement.fee": {
    label: "Fee",
    read: (c) =>
      c.engagement?.feePaise ? formatPaise(c.engagement.feePaise) : "",
  },
  "engagement.financialYear": {
    label: "Financial year",
    read: (c) => c.engagement?.financialYear,
  },
  "engagement.udin": { label: "UDIN", read: (c) => c.engagement?.udin },
  "engagement.filedOn": {
    label: "Filed on",
    read: (c) => (c.engagement?.filedOn ? formatISTDate(c.engagement.filedOn) : ""),
  },

  "doc.date": { label: "Today's date", read: (c) => formatISTDate(c.now ?? new Date()) },
  "doc.place": { label: "Place", read: (c) => c.place },
  "signatory.name": { label: "Signatory", read: (c) => c.signatory?.name },
  "signatory.designation": {
    label: "Signatory designation",
    read: (c) => c.signatory?.designation,
  },
  "signatory.membershipNo": {
    label: "Membership number",
    read: (c) => c.signatory?.membershipNo,
  },
};

export const FIELD_KEYS = Object.keys(FIELDS);

/**
 * Fill a template body.
 *
 * @param {string} body
 * @param {Record<string, any>} context
 * @returns {{text: string, gaps: Array<{key: string, label: string}>, unknown: string[]}}
 */
export function resolveTemplate(body, context = {}) {
  /** @type {Array<{key: string, label: string}>} */
  const gaps = [];
  /** @type {string[]} */
  const unknown = [];

  const text = String(body ?? "").replace(PLACEHOLDER, (whole, key) => {
    const field = FIELDS[key];
    if (!field) {
      // left on the page as written: a typo in a template should be obvious
      // to the first person who reads the draft, not silently deleted
      if (!unknown.includes(key)) unknown.push(key);
      return whole;
    }
    const value = field.read(context);
    if (value === null || value === undefined || String(value).trim() === "") {
      if (!gaps.some((gap) => gap.key === key)) {
        gaps.push({ key, label: field.label });
      }
      return GAP_MARK(field.label);
    }
    return String(value);
  });

  return { text, gaps, unknown };
}

/**
 * The placeholders a template uses, for the admin screen to show what a
 * template needs before anybody tries to generate from it.
 *
 * @param {string} body
 * @returns {{known: string[], unknown: string[]}}
 */
export function placeholdersIn(body) {
  /** @type {string[]} */
  const known = [];
  /** @type {string[]} */
  const unknown = [];
  for (const match of String(body ?? "").matchAll(PLACEHOLDER)) {
    const key = match[1];
    const list = FIELDS[key] ? known : unknown;
    if (!list.includes(key)) list.push(key);
  }
  return { known, unknown };
}

/**
 * Everything a template can be filled from, read once and passed about.
 *
 * Only these fields leave the database for a document: the context is built
 * here rather than handing the resolver a whole client record, so a template
 * cannot reach a PAN or a credential however it is written.
 *
 * @param {{firm: any, client: any, engagement?: any, signatory?: any, now?: Date}} source
 */
export function buildContext({ firm, client, engagement, signatory, now }) {
  const primary = (client?.contacts ?? []).find((c) => c.primary) ?? null;
  const address =
    (client?.addresses ?? []).find((a) => a.kind === "Registered") ??
    (client?.addresses ?? [])[0] ??
    null;
  return {
    now: now ?? new Date(),
    // where the letter is signed: the firm's own head office line, which is
    // the only place the firm records a city
    place: (firm?.headOffice ?? "").split(",").pop()?.trim() ?? "",
    firm: {
      name: firm?.name ?? "",
      frn: firm?.frn ?? "",
      headOffice: firm?.headOffice ?? "",
      email: firm?.email ?? "",
      phone: firm?.phone ?? "",
    },
    client: client
      ? {
          legalName: client.legalName ?? "",
          tradeName: client.tradeName ?? "",
          address: address
            ? [
                address.line1,
                address.line2,
                [address.city, address.state].filter(Boolean).join(" "),
                address.pincode,
              ]
                .filter((part) => part && String(part).trim())
                .join(", ")
            : "",
          entityType: client.entityType ?? "",
          // the first registration on the record; a client with several
          // places of business picks one by editing the draft
          gstin: (client.gstins ?? [])[0]?.gstin ?? "",
          contactName: primary?.name ?? "",
          contactDesignation: primary?.designation ?? "",
        }
      : null,
    engagement: engagement
      ? {
          service: engagement.templateSnapshot?.name ?? "",
          period: engagement.periodLabel || engagement.period || "",
          code: engagement.code ?? "",
          feePaise: engagement.feePaise ?? 0,
          financialYear: engagement.periodLabel || "",
          udin: engagement.udin ?? "",
          filedOn: engagement.filedOn ?? null,
        }
      : null,
    signatory: signatory ?? null,
  };
}

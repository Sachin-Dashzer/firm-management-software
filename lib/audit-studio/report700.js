// @ts-check

import { OPINION_TYPES } from "./reporting.js";

/**
 * The auditor's report, built in the order SA 700 puts it (P3-15).
 *
 * The thing worth having is not a template with blanks. It is that **the
 * switches restructure the report**, because that is what the standards
 * actually require and what somebody filling in a template gets wrong:
 *
 *  - a **modified** opinion renames the opinion section and puts a *Basis
 *    for* section immediately after it, before anything else (SA 705)
 *  - a **disclaimer** removes the sentence about having obtained
 *    sufficient appropriate evidence, because the whole point of a
 *    disclaimer is that the auditor has not
 *  - **material uncertainty on going concern** is its own section in a
 *    fixed position and is never folded into an emphasis of matter (SA 570)
 *  - an **emphasis of matter** and an **other matter** paragraph are
 *    different things and sit in that order (SA 706)
 *  - **key audit matters** belong to a listed entity's report and say so
 *    where they are absent by not appearing at all (SA 701)
 *
 * This returns the report's *sections*, not its prose: the standard wording
 * of each is a first draft a partner confirms, exactly as everything else
 * in this module (`CONFIRM_KIND` on the certificate side, the audit areas
 * at P3-13). Nothing here is authority.
 */

/** Every section the standard can put in a report, in its fixed order. */
const ORDER = [
  "title",
  "addressee",
  "opinion",
  "basis",
  "goingConcern",
  "keyAuditMatters",
  "emphasis",
  "otherMatter",
  "otherInformation",
  "managementResponsibility",
  "auditorResponsibility",
  "otherLegal",
  "signature",
];

/**
 * @typedef {object} ReportSwitches
 * @property {string} opinionType
 * @property {boolean} [goingConcern]   material uncertainty exists
 * @property {boolean} [listed]         key audit matters apply
 * @property {string} [emphasis]
 * @property {string} [otherMatter]
 * @property {boolean} [companiesAct]   the s.143(3) report is required
 * @property {boolean} [otherInformation]
 */

/**
 * The report's sections for one set of switches.
 *
 * @param {ReportSwitches} input
 * @returns {Array<{key: string, title: string, cite: string, body: string,
 *   locked: boolean, why?: string}>}
 */
export function buildReport(input) {
  const type = OPINION_TYPES.includes(input?.opinionType)
    ? input.opinionType
    : "Unmodified";
  const modified = type !== "Unmodified";
  const disclaimer = type === "Disclaimer of opinion";

  /** @type {Record<string, any>} */
  const sections = {
    title: {
      title: "Independent Auditor's Report",
      cite: "SA 700",
      body: "To the Members of [the company]",
      locked: true,
    },
    addressee: {
      title: "Report on the audit of the financial statements",
      cite: "SA 700",
      body: "",
      locked: false,
    },
    opinion: {
      title: modified ? `${type} opinion` : "Opinion",
      cite: modified ? "SA 705" : "SA 700",
      locked: true,
      body: disclaimer
        ? "We do not express an opinion on the accompanying financial statements. Because of the significance of the matter described in the Basis for disclaimer of opinion section of our report, we have not been able to obtain sufficient appropriate audit evidence to provide a basis for an audit opinion on these financial statements."
        : type === "Adverse"
          ? "In our opinion, because of the significance of the matter described in the Basis for adverse opinion section, the accompanying financial statements do not give a true and fair view of the state of affairs, the profit and the cash flows for the year then ended."
          : type === "Qualified"
            ? "In our opinion, except for the effects of the matter described in the Basis for qualified opinion section, the accompanying financial statements give a true and fair view of the state of affairs, the profit and the cash flows for the year then ended."
            : "In our opinion, the accompanying financial statements give a true and fair view of the state of affairs as at the year end, and of the profit and the cash flows for the year then ended, in conformity with the accounting principles generally accepted in India.",
    },
  };

  if (modified) {
    sections.basis = {
      title: `Basis for ${type.toLowerCase()}`,
      cite: "SA 705",
      locked: false,
      body: "",
      why: "A modified opinion is always followed immediately by the basis for it, before anything else in the report.",
    };
  }

  if (input?.goingConcern) {
    sections.goingConcern = {
      title: "Material uncertainty related to going concern",
      cite: "SA 570",
      locked: false,
      body: "",
      why: "This is its own section and is never folded into an emphasis of matter.",
    };
  }

  if (input?.listed) {
    sections.keyAuditMatters = {
      title: "Key audit matters",
      cite: "SA 701",
      locked: false,
      body: "",
      why: "Required for a listed entity. Where the opinion is a disclaimer, this section is not given.",
    };
    if (disclaimer) delete sections.keyAuditMatters;
  }

  if (input?.emphasis) {
    sections.emphasis = {
      title: "Emphasis of matter",
      cite: "SA 706",
      locked: false,
      body: String(input.emphasis),
      why: "Something properly presented in the statements that is fundamental to understanding them. It does not modify the opinion.",
    };
  }

  if (input?.otherMatter) {
    sections.otherMatter = {
      title: "Other matter",
      cite: "SA 706",
      locked: false,
      body: String(input.otherMatter),
      why: "Something not presented in the statements that is relevant to the reader's understanding of the audit. It comes after emphasis of matter.",
    };
  }

  if (input?.otherInformation) {
    sections.otherInformation = {
      title: "Other information",
      cite: "SA 720",
      locked: false,
      body: "",
    };
  }

  sections.managementResponsibility = {
    title:
      "Responsibilities of management and those charged with governance for the financial statements",
    cite: "SA 700",
    locked: true,
    body: "Management is responsible for the preparation of these financial statements that give a true and fair view, and for such internal control as management determines is necessary to enable the preparation of financial statements that are free from material misstatement, whether due to fraud or error.",
  };

  sections.auditorResponsibility = {
    title:
      "Auditor's responsibilities for the audit of the financial statements",
    cite: disclaimer ? "SA 705" : "SA 700",
    locked: true,
    body: disclaimer
      ? "Our responsibility is to conduct an audit of the financial statements in accordance with the Standards on Auditing and to issue an auditor's report. However, because of the matter described in the Basis for disclaimer of opinion section, we were not able to obtain sufficient appropriate audit evidence to provide a basis for an audit opinion on these financial statements."
      : "Our objectives are to obtain reasonable assurance about whether the financial statements as a whole are free from material misstatement, whether due to fraud or error, and to issue an auditor's report that includes our opinion. Reasonable assurance is a high level of assurance, but is not a guarantee that an audit conducted in accordance with the Standards on Auditing will always detect a material misstatement when it exists.",
    why: disclaimer
      ? "On a disclaimer this section does not say the auditor obtained sufficient appropriate evidence, because the auditor did not. That sentence is the commonest thing left in by mistake."
      : undefined,
  };

  if (input?.companiesAct) {
    sections.otherLegal = {
      title: "Report on other legal and regulatory requirements",
      cite: "s.143(3) Companies Act 2013, and CARO 2020",
      locked: false,
      body: "",
      why: "The CARO annexure and the s.143(3) matters belong here, after the report on the financial statements.",
    };
  }

  sections.signature = {
    title: "Signature",
    cite: "SA 700",
    locked: true,
    body: "For [firm name]\nChartered Accountants\nFirm Registration Number: [FRN]\n\n[Partner name]\nPartner\nMembership Number: [M. No.]\nUDIN: [UDIN]\nPlace: [place]\nDate: [date]",
  };

  return ORDER.filter((key) => sections[key]).map((key) => ({
    key,
    ...sections[key],
  }));
}

/**
 * What changing one switch does to the report, so the screen can say it
 * before somebody flips it.
 *
 * @param {ReportSwitches} before
 * @param {ReportSwitches} after
 */
export function diffReport(before, after) {
  const was = new Set(buildReport(before).map((row) => row.key));
  const now = new Set(buildReport(after).map((row) => row.key));

  return {
    added: [...now].filter((key) => !was.has(key)),
    removed: [...was].filter((key) => !now.has(key)),
  };
}

/** Everything still blank on a report that is otherwise ready. */
export function unwritten(sections) {
  return sections
    .filter((row) => !row.locked && !String(row.body ?? "").trim())
    .map((row) => row.title);
}

/**
 * The report for one audit file: the standard's structure, with what the
 * firm has written into each open section (P3-15).
 *
 * The opinion and its basis are **not** copied into a second place. They
 * are already the opinion on the file, recorded with the fingerprint the
 * overall conclusion is stamped against (P3-14), so they are read from
 * there and only the sections the standard adds have their own text.
 *
 * @param {any} file an AuditFile document or plain object
 */
export function reportFrom(file) {
  const bodies = new Map(
    (file?.reportSections ?? []).map((row) => [row.key, row.body ?? ""]),
  );

  return buildReport({
    opinionType: file?.opinion?.type,
    emphasis: file?.opinion?.emphasis ?? "",
    goingConcern: Boolean(file?.reportSwitches?.goingConcern),
    listed: Boolean(file?.reportSwitches?.listed),
    companiesAct: Boolean(file?.reportSwitches?.companiesAct),
    otherInformation: Boolean(file?.reportSwitches?.otherInformation),
    otherMatter: file?.reportSwitches?.otherMatter ?? "",
  }).map((section) => {
    if (section.locked) return section;
    // the basis paragraph is the opinion's basis, not a second copy of it
    if (section.key === "basis") {
      return { ...section, body: String(file?.opinion?.basis ?? "") };
    }
    return {
      ...section,
      body: section.body || (bodies.get(section.key) ?? ""),
    };
  });
}

/**
 * The report as the words it will be issued as, so what is signed is the
 * report and not a note about it.
 *
 * @param {Array<{title: string, body: string}>} sections
 */
export function reportText(sections) {
  return sections
    .map(
      (section) => `${section.title}\n\n${String(section.body ?? "").trim()}`,
    )
    .join("\n\n");
}

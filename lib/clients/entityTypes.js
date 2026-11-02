// @ts-check

import { PAN_CHAR_FOR_ENTITY } from "../validators.js";

/**
 * What each kind of entity brings with it.
 *
 * The onboarding wizard has one idea behind it: **the entity type decides
 * everything that follows.** A private limited company needs a CIN, a board
 * resolution and a statutory audit; an individual needs none of the three.
 * Rather than scatter that knowledge across six screens, it lives here once,
 * and each step of the wizard reads the column it needs:
 *
 *  - step 1 the cards            — `label`, `panChar`, `documents.length`
 *  - step 2 the master form      — `fields`
 *  - step 3 the document list    — `documents`
 *  - step 4 the suggested ticks  — `services` (codes into the firm's catalog)
 *  - step 5 the checks           — `registrations`
 *  - step 6 the engagement pack  — `pack`
 *
 * **The firm must verify these lists.** They are a first draft in the same
 * sense as the starter service catalog: a sensible KYC list for each kind of
 * entity, not a statutory requirement anybody has certified. Nothing here
 * invents a due date or a tax rule (CLAUDE.md rule 8) — it is a list of
 * papers to ask for and registrations to look at.
 *
 * A field's `name` is either a field on the client record (`cin`, `tan`,
 * `establishedOn`, `aadhaar`, `udyam`), the first GSTIN row, the first
 * address row, or `profile.<key>` — the free-form map on the client for the
 * things only one kind of entity ever has.
 *
 * @typedef {object} MasterField
 * @property {string} name
 * @property {string} label
 * @property {string} [type] an input type; "date" and "select" are special
 * @property {string[]} [options] for `type: "select"`
 * @property {string} [placeholder]
 * @property {boolean} [mono] identifiers are set in the mono face
 *
 * @typedef {object} PackItem
 * @property {string} code the DocTemplate code, when one exists
 * @property {string} label
 * @property {"Onboarding"|"Audit"} kind
 *
 * @typedef {object} EntityConfig
 * @property {string} key the stored `entityType`
 * @property {string} label what the card says
 * @property {string} panChar the acceptable 4th characters of the PAN
 * @property {MasterField[]} fields
 * @property {string[]} documents
 * @property {string[]} registrations
 * @property {string[]} services service template codes
 * @property {PackItem[]} pack
 */

/** The five letters every new client gets, whatever it is. */
const ONBOARDING_PACK = /** @type {PackItem[]} */ ([
  { code: "PROPOSAL", label: "Proposal and fee quote", kind: "Onboarding" },
  {
    code: "ENG-LETTER",
    label: "Engagement letter — compliance services",
    kind: "Onboarding",
  },
  {
    code: "KYC-REQUEST",
    label: "Document request (KYC) — by entity type",
    kind: "Onboarding",
  },
  {
    code: "PORTAL-AUTH",
    label: "Authority letter for portal access",
    kind: "Onboarding",
  },
  {
    code: "WELCOME-WA",
    label: "Welcome message (WhatsApp)",
    kind: "Onboarding",
  },
]);

/** The three more an entity we may audit needs on top. */
const AUDIT_PACK = /** @type {PackItem[]} */ ([
  {
    code: "ENG-LETTER-AUD",
    label: "Engagement letter — statutory audit (SA 210)",
    kind: "Audit",
  },
  {
    code: "CONSENT-AUD",
    label: "Consent and eligibility certificate (s.139 / s.141)",
    kind: "Audit",
  },
  {
    code: "PREV-AUD-COMM",
    label: "Communication with the previous auditor",
    kind: "Audit",
  },
]);

/** The bank row every entity is asked for, worded the same way each time. */
const BANK = "Cancelled cheque or bank statement";
const PORTAL_CONTACT =
  "Email and mobile registered on the income-tax and GST portals";

/** @type {EntityConfig[]} */
const ENTITIES = [
  {
    key: "Individual",
    label: "Individual",
    fields: [
      { name: "establishedOn", label: "Date of birth", type: "date" },
      { name: "profile.fatherName", label: "Father's name" },
      {
        name: "profile.residentialStatus",
        label: "Residential status",
        type: "select",
        options: ["Resident", "Non-resident", "Resident but not ordinarily"],
      },
      { name: "profile.employer", label: "Employer, if salaried" },
      {
        name: "gstins.0.gstin",
        label: "GSTIN, if registered",
        mono: true,
        placeholder: "09AAAPZ1234C1ZX",
      },
    ],
    documents: [
      "PAN card",
      "Aadhaar card",
      "Form 16 or salary slips, if salaried",
      "Last year's ITR with the computation",
      BANK,
      "Email and mobile registered on the income-tax portal",
    ],
    registrations: [
      "GST if in business",
      "Professional tax",
      "Udyam if in business",
    ],
    services: ["ITR-SAL"],
    pack: ONBOARDING_PACK,
  },

  {
    key: "Proprietorship",
    label: "Proprietorship",
    fields: [
      { name: "establishedOn", label: "Date of commencement", type: "date" },
      { name: "profile.proprietorName", label: "Proprietor's name" },
      { name: "profile.natureOfBusiness", label: "Nature of business" },
      {
        name: "gstins.0.gstin",
        label: "GSTIN",
        mono: true,
        placeholder: "09AAAPZ1234C1ZX",
      },
      { name: "tan", label: "TAN", mono: true, placeholder: "DELA12345B" },
      {
        name: "udyam",
        label: "Udyam number",
        mono: true,
        placeholder: "UDYAM-UP-09-1234567",
      },
    ],
    documents: [
      "PAN and Aadhaar of the proprietor",
      "Trade licence or shop registration, if any",
      "GST registration certificate",
      "Udyam registration certificate",
      "Last year's ITR with the computation",
      BANK,
    ],
    registrations: [
      "GST",
      "TAN",
      "Udyam",
      "Professional tax",
      "Shops and Establishment",
      "IEC if exporting",
      "FSSAI if food business",
    ],
    services: ["GSTR3B", "GSTR9", "ITR-BUS", "BOOKS"],
    pack: ONBOARDING_PACK,
  },

  {
    key: "HUF",
    label: "HUF",
    fields: [
      {
        name: "establishedOn",
        label: "Date the HUF was created",
        type: "date",
      },
      { name: "profile.kartaName", label: "Karta's name" },
      {
        name: "profile.kartaPan",
        label: "Karta's PAN",
        mono: true,
        placeholder: "AAAPZ1234C",
      },
      { name: "profile.coparceners", label: "Coparceners" },
      {
        name: "gstins.0.gstin",
        label: "GSTIN, if registered",
        mono: true,
        placeholder: "09AAAHZ1234C1ZX",
      },
    ],
    documents: [
      "PAN of the HUF",
      "HUF deed or declaration",
      "PAN and Aadhaar of the Karta",
      BANK,
    ],
    registrations: ["GST if in business", "TAN if deducting"],
    services: ["ITR-BUS"],
    pack: ONBOARDING_PACK,
  },

  {
    key: "Partnership Firm",
    label: "Partnership firm",
    fields: [
      {
        name: "establishedOn",
        label: "Date of the partnership deed",
        type: "date",
      },
      { name: "profile.partners", label: "Partners (name, PAN)" },
      { name: "profile.profitSharing", label: "Profit-sharing ratio" },
      { name: "profile.firmRegNo", label: "Registrar of Firms number" },
      { name: "tan", label: "TAN", mono: true, placeholder: "DELA12345B" },
      {
        name: "gstins.0.gstin",
        label: "GSTIN",
        mono: true,
        placeholder: "09AAAFZ1234C1ZX",
      },
    ],
    documents: [
      "Partnership deed",
      "PAN of the firm",
      "PAN and Aadhaar of each partner",
      "Registration certificate with the Registrar of Firms, if registered",
      "GST registration certificate",
      BANK,
    ],
    registrations: [
      "GST",
      "TAN",
      "PF / ESI",
      "Professional tax",
      "Udyam",
      "IEC if exporting",
    ],
    services: ["GSTR3B", "GSTR9", "TDS-RET", "ITR-BUS", "BOOKS"],
    pack: ONBOARDING_PACK,
  },

  {
    key: "LLP",
    label: "LLP",
    fields: [
      {
        name: "cin",
        label: "LLPIN",
        mono: true,
        placeholder: "AAA-1234",
      },
      { name: "establishedOn", label: "Date of incorporation", type: "date" },
      {
        name: "profile.designatedPartners",
        label: "Designated partners (name, DPIN)",
      },
      { name: "profile.contribution", label: "Total contribution (₹)" },
      { name: "tan", label: "TAN", mono: true, placeholder: "DELA12345B" },
      {
        name: "gstins.0.gstin",
        label: "GSTIN",
        mono: true,
        placeholder: "09AAAFZ1234C1ZX",
      },
    ],
    documents: [
      "Certificate of incorporation and LLPIN",
      "LLP agreement",
      "PAN of the LLP",
      "PAN, Aadhaar and DPIN of the designated partners",
      BANK,
    ],
    registrations: [
      "GST",
      "TAN",
      "PF / ESI",
      "Professional tax",
      "Udyam",
      "IEC if exporting",
    ],
    services: ["GSTR3B", "GSTR9", "TDS-RET", "ITR-BUS", "ROC-ANN", "BOOKS"],
    pack: ONBOARDING_PACK,
  },

  {
    key: "Private Limited",
    label: "Private limited company",
    fields: [
      {
        name: "cin",
        label: "CIN",
        mono: true,
        placeholder: "U74999DL2019PTC123456",
      },
      { name: "establishedOn", label: "Date of incorporation", type: "date" },
      { name: "profile.authorisedCapital", label: "Authorised capital (₹)" },
      { name: "profile.paidUpCapital", label: "Paid-up capital (₹)" },
      { name: "profile.directors", label: "Directors (name, DIN)" },
      {
        name: "gstins.0.gstin",
        label: "GSTIN",
        mono: true,
        placeholder: "09AAACZ1234C1ZX",
      },
      { name: "profile.previousAuditor", label: "Previous auditor" },
    ],
    documents: [
      "Certificate of incorporation (CIN)",
      "Memorandum and Articles of Association",
      "PAN and TAN",
      "List of directors with DIN and DSC expiry",
      "Shareholding pattern",
      "Board resolution appointing the firm",
      "Previous auditor's name and address (for audit)",
      "GST registration certificate",
      BANK,
      PORTAL_CONTACT,
    ],
    registrations: [
      "GST",
      "TAN",
      "PF / ESI",
      "Professional tax",
      "Udyam",
      "IEC if exporting",
      "FSSAI if food business",
    ],
    services: [
      "GSTR3B",
      "GSTR9",
      "TDS-RET",
      "ITR-BUS",
      "STAT-AUD",
      "ROC-ANN",
      "BOOKS",
      "PAYROLL",
    ],
    pack: [...ONBOARDING_PACK, ...AUDIT_PACK],
  },

  {
    key: "Public Limited",
    label: "Public limited company",
    fields: [
      {
        name: "cin",
        label: "CIN",
        mono: true,
        placeholder: "L74999DL2019PLC123456",
      },
      { name: "establishedOn", label: "Date of incorporation", type: "date" },
      { name: "profile.authorisedCapital", label: "Authorised capital (₹)" },
      { name: "profile.paidUpCapital", label: "Paid-up capital (₹)" },
      { name: "profile.directors", label: "Directors (name, DIN)" },
      { name: "profile.listedOn", label: "Listed on, if listed" },
      {
        name: "gstins.0.gstin",
        label: "GSTIN",
        mono: true,
        placeholder: "09AAACZ1234C1ZX",
      },
      { name: "profile.previousAuditor", label: "Previous auditor" },
    ],
    documents: [
      "Certificate of incorporation (CIN)",
      "Memorandum and Articles of Association",
      "PAN and TAN",
      "List of directors with DIN and DSC expiry",
      "Shareholding pattern and the register of members",
      "Board resolution appointing the firm",
      "Previous auditor's name and address (for audit)",
      "GST registration certificate",
      BANK,
      PORTAL_CONTACT,
    ],
    registrations: [
      "GST",
      "TAN",
      "PF / ESI",
      "Professional tax",
      "Udyam",
      "IEC if exporting",
      "FSSAI if food business",
    ],
    services: [
      "GSTR3B",
      "GSTR9",
      "TDS-RET",
      "ITR-BUS",
      "STAT-AUD",
      "ROC-ANN",
      "BOOKS",
      "PAYROLL",
    ],
    pack: [...ONBOARDING_PACK, ...AUDIT_PACK],
  },

  {
    key: "One Person Company",
    label: "One person company",
    fields: [
      {
        name: "cin",
        label: "CIN",
        mono: true,
        placeholder: "U74999DL2019OPC123456",
      },
      { name: "establishedOn", label: "Date of incorporation", type: "date" },
      { name: "profile.soleMember", label: "Sole member" },
      { name: "profile.nominee", label: "Nominee" },
      { name: "profile.paidUpCapital", label: "Paid-up capital (₹)" },
      {
        name: "gstins.0.gstin",
        label: "GSTIN, if registered",
        mono: true,
        placeholder: "09AAACZ1234C1ZX",
      },
    ],
    documents: [
      "Certificate of incorporation (CIN)",
      "Memorandum and Articles of Association",
      "PAN and TAN",
      "Sole member and nominee details, with consent (Form INC-3)",
      "Board resolution appointing the firm",
      "GST registration certificate, if registered",
      BANK,
    ],
    registrations: ["GST", "TAN", "Professional tax", "Udyam"],
    services: ["GSTR3B", "TDS-RET", "ITR-BUS", "STAT-AUD", "ROC-ANN"],
    pack: [...ONBOARDING_PACK, ...AUDIT_PACK],
  },

  {
    key: "Section 8 Company",
    label: "Section 8 company",
    fields: [
      {
        name: "cin",
        label: "CIN",
        mono: true,
        placeholder: "U85300DL2019NPL123456",
      },
      { name: "establishedOn", label: "Date of incorporation", type: "date" },
      { name: "profile.licenceNo", label: "Section 8 licence number" },
      { name: "profile.directors", label: "Directors (name, DIN)" },
      { name: "profile.reg12A", label: "12A registration number" },
      { name: "profile.reg80G", label: "80G registration number" },
    ],
    documents: [
      "Certificate of incorporation (CIN)",
      "Licence issued under section 8",
      "Memorandum and Articles of Association",
      "PAN and TAN",
      "List of directors with DIN",
      "12A and 80G registration orders, if held",
      "FCRA registration, if foreign contributions are received",
      BANK,
    ],
    registrations: [
      "12A / 80G",
      "TAN",
      "FCRA if foreign contributions",
      "GST if applicable",
    ],
    services: ["ITR-BUS", "STAT-AUD", "ROC-ANN", "BOOKS"],
    pack: [...ONBOARDING_PACK, ...AUDIT_PACK],
  },

  {
    key: "Trust",
    label: "Trust",
    fields: [
      { name: "establishedOn", label: "Date of the trust deed", type: "date" },
      {
        name: "profile.trustType",
        label: "Public or private",
        type: "select",
        options: ["Public charitable", "Public religious", "Private"],
      },
      { name: "profile.trustRegNo", label: "Registration number" },
      { name: "profile.trustees", label: "Trustees" },
      { name: "profile.reg12A", label: "12A registration number" },
      { name: "profile.reg80G", label: "80G registration number" },
    ],
    documents: [
      "Trust deed",
      "Registration certificate with the Charity Commissioner or sub-registrar",
      "PAN of the trust",
      "PAN and Aadhaar of the trustees",
      "12A and 80G registration orders, if held",
      "FCRA registration, if foreign contributions are received",
      BANK,
    ],
    registrations: [
      "12A / 80G",
      "TAN",
      "FCRA if foreign contributions",
      "GST if applicable",
    ],
    services: ["ITR-BUS", "BOOKS"],
    pack: ONBOARDING_PACK,
  },

  {
    key: "Society",
    label: "Society",
    fields: [
      { name: "establishedOn", label: "Date of registration", type: "date" },
      {
        name: "profile.societyRegNo",
        label: "Registration number and Act",
      },
      { name: "profile.officeBearers", label: "Office bearers" },
      { name: "profile.reg12A", label: "12A registration number" },
      { name: "profile.reg80G", label: "80G registration number" },
    ],
    documents: [
      "Registration certificate under the Societies Registration Act",
      "Memorandum of association and rules",
      "PAN of the society",
      "List of office bearers with PAN and Aadhaar",
      "12A and 80G registration orders, if held",
      BANK,
    ],
    registrations: [
      "12A / 80G",
      "TAN",
      "FCRA if foreign contributions",
      "GST if applicable",
    ],
    services: ["ITR-BUS", "BOOKS"],
    pack: ONBOARDING_PACK,
  },

  {
    key: "AOP",
    label: "AOP / BOI",
    fields: [
      { name: "establishedOn", label: "Date of formation", type: "date" },
      { name: "profile.members", label: "Members (name, PAN)" },
      { name: "profile.memberShares", label: "Share of each member" },
      { name: "tan", label: "TAN", mono: true, placeholder: "DELA12345B" },
      {
        name: "gstins.0.gstin",
        label: "GSTIN, if registered",
        mono: true,
        placeholder: "09AAAAZ1234C1ZX",
      },
    ],
    documents: [
      "Deed or instrument of formation",
      "PAN of the AOP / BOI",
      "PAN and Aadhaar of each member, with the share of each",
      "GST registration certificate, if registered",
      BANK,
    ],
    registrations: [
      "GST if in business",
      "TAN if deducting",
      "Professional tax",
    ],
    services: ["GSTR3B", "ITR-BUS", "BOOKS"],
    pack: ONBOARDING_PACK,
  },
];

/** Every entity type, with its PAN character filled in from the validator. */
export const ENTITY_CONFIGS = ENTITIES.map((entity) => ({
  ...entity,
  panChar: PAN_CHAR_FOR_ENTITY[entity.key] ?? "",
}));

/** @type {Record<string, EntityConfig>} */
export const ENTITY_BY_KEY = Object.fromEntries(
  ENTITY_CONFIGS.map((entity) => [entity.key, entity]),
);

/**
 * How the PAN character reads on a card: "P", or "A or B" where two are
 * acceptable, which is how an accountant would say it.
 * @param {string} chars
 */
export function panCharLabel(chars) {
  return [...String(chars ?? "")].join(" or ");
}

/** The wizard's own label for an entity type, falling back to the stored one. */
export function entityLabel(key) {
  return ENTITY_BY_KEY[key]?.label ?? key;
}

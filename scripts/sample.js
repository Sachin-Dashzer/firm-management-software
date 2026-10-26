// @ts-check

/**
 * A sample dataset, for looking at the thing before the firm's own records
 * are in it.
 *
 * **This is not go-live data.** `scripts/seed.js` writes what the firm
 * actually needs — the four branches, the service catalog, the due-date
 * rules, the first partner — and is what gets run against the live cluster.
 * This file writes invented clients and colleagues, so it only runs when
 * asked for by name (`npm run seed -- --sample`), refuses to run in
 * production, and marks everything it creates:
 *
 *   - people have an `@sample.phmgindia.test` address
 *   - clients carry the tag `sample`
 *
 * so `npm run seed -- --drop-sample` can find the lot again.
 *
 * Every name, city and identifier here is made up (CLAUDE.md rule 9: no lorem
 * ipsum, and no real client either). The PANs and GSTINs are **built** rather
 * than typed: `checkGSTIN` verifies a state code, the embedded PAN, that the
 * PAN's holder-type character agrees with the entity type, and a check digit,
 * so a number invented at the keyboard would be refused by the firm's own
 * form. `tests/sample.test.js` runs every one of them through its validator.
 */

import Branch from "../models/Branch.js";
import User from "../models/User.js";
import Client from "../models/Client.js";
import ClientService from "../models/ClientService.js";
import ClientAccess from "../models/ClientAccess.js";
import Engagement from "../models/Engagement.js";
import ServiceTemplate from "../models/ServiceTemplate.js";
import Dsc from "../models/Dsc.js";
import Udin from "../models/Udin.js";
import ClientUser from "../models/ClientUser.js";
import { hashPassword } from "../lib/crypto.js";
import { systemAudit } from "../lib/audit/system.js";
import { gstinCheckDigit } from "../lib/validators.js";
import { buildEngagement } from "../lib/engagements/create.js";
import { nextEngagementCode } from "../lib/engagements/code.js";
import { periodFor } from "../lib/engagements/period.js";
import { startOfISTDay } from "../lib/dates.js";
import { createHash } from "node:crypto";
import ClientGroup from "../models/ClientGroup.js";
import ClientCredential from "../models/ClientCredential.js";
import Comment from "../models/Comment.js";
import DocumentModel from "../models/Document.js";
import Invoice from "../models/Invoice.js";
import Payment from "../models/Payment.js";
import Notification from "../models/Notification.js";
import { encryptField } from "../lib/crypto.js";
import { financialYearLabel } from "../lib/dates.js";
import { driverName } from "../lib/storage/index.js";
import { putLocal, removeLocal } from "../lib/storage/local.js";
import { buildFileKey } from "../lib/storage/paths.js";
import {
  applyTotals,
  reasonsNotIssuable,
  stateName,
} from "../lib/billing/gst.js";
import { nextInvoiceNumber } from "../lib/billing/number.js";
import { statusAfterPayment } from "../lib/billing/allocation.js";

/** A date so many days before `now`, at the start of that IST day. */
function daysBack(now, days) {
  return startOfISTDay(new Date(now.getTime() - days * 86_400_000));
}

export const SAMPLE_DOMAIN = "sample.phmgindia.test";
export const SAMPLE_TAG = "sample";

/**
 * Build a GSTIN from a state code and a PAN: state, PAN, the registration
 * number within the state, a literal Z, then the check digit.
 *
 * @param {string} stateCode
 * @param {string} pan
 * @param {string} [registration]
 */
export function makeGstin(stateCode, pan, registration = "1") {
  const first14 = `${stateCode}${pan}${registration}Z`;
  return `${first14}${gstinCheckDigit(first14)}`;
}

/**
 * The people. `reportingTo` is set on everybody below partner, because the
 * "My senior CA" card on `/me` has nothing to show without it and an
 * employee with no senior is the state `scripts/doctor.js` warns about.
 *
 * Names are North Indian, matching the firm's four offices.
 */
export const SAMPLE_PEOPLE = [
  {
    key: "ca-noida",
    name: "Ritika Chandra",
    email: `ritika.chandra@${SAMPLE_DOMAIN}`,
    mobile: "9811452207",
    role: "ca",
    branches: ["NOI"],
    reportsTo: null, // a partner, filled in from the live partner account
    joiningDate: "2019-06-17",
    skills: ["Statutory audit", "Tax audit", "Direct tax"],
    // a member record (P2-6), so the UDIN register has a membership number
    // to snapshot and the ICAI screen has something to show
    icai: {
      membershipNo: "412345",
      grade: "FCA",
      admittedOn: "2014-09-12",
      copHeld: true,
      copFrom: "2015-04-01",
    },
  },
  {
    key: "ca-ludhiana",
    name: "Harpreet Singh Bedi",
    email: `harpreet.bedi@${SAMPLE_DOMAIN}`,
    mobile: "9814330192",
    role: "ca",
    branches: ["LDH"],
    reportsTo: null,
    joiningDate: "2021-02-01",
    skills: ["GST", "Company law", "Registrations"],
    icai: {
      membershipNo: "536712",
      grade: "ACA",
      admittedOn: "2020-01-23",
      copHeld: true,
      copFrom: "2020-03-15",
    },
  },
  {
    key: "emp-noida",
    name: "Ankit Saxena",
    email: `ankit.saxena@${SAMPLE_DOMAIN}`,
    mobile: "9958120043",
    role: "employee",
    branches: ["NOI"],
    reportsTo: "ca-noida",
    joiningDate: "2022-08-22",
    skills: ["GST returns", "TDS returns", "Bookkeeping"],
  },
  {
    key: "emp-rohini",
    name: "Shalini Verma",
    email: `shalini.verma@${SAMPLE_DOMAIN}`,
    mobile: "9873064418",
    role: "employee",
    branches: ["DEL"],
    reportsTo: "ca-noida",
    joiningDate: "2023-01-09",
    skills: ["ITR", "GST returns"],
  },
  {
    key: "emp-ludhiana",
    name: "Gurpreet Kaur",
    email: `gurpreet.kaur@${SAMPLE_DOMAIN}`,
    mobile: "9876512340",
    role: "employee",
    branches: ["LDH"],
    reportsTo: "ca-ludhiana",
    joiningDate: "2023-07-03",
    skills: ["Payroll", "PF and ESI", "Bookkeeping"],
  },
  {
    key: "intern-noida",
    name: "Ananya Bisht",
    email: `ananya.bisht@${SAMPLE_DOMAIN}`,
    mobile: "9711208834",
    role: "intern",
    branches: ["NOI"],
    reportsTo: "ca-noida",
    joiningDate: "2026-05-04",
    skills: ["Vouching", "GST reconciliation"],
    articleship: {
      principal: "ca-noida",
      // fabricated, like everything else here: a real ICAI registration
      // number belongs to a real article
      icaiRegNo: "NRO0912345",
      start: "2026-05-04",
      expectedEnd: "2029-05-03",
      leaveAllowed: 156,
      leaveTaken: 11,
    },
  },
];

/**
 * The clients. One per office, four entity types, so the PAN holder-type
 * character has to be right in four different ways — which is exactly the
 * mistake the validators were written to catch.
 */
export const SAMPLE_CLIENTS = [
  {
    key: "jaiswal",
    branch: "NOI",
    legalName: "Jaiswal Steels Private Limited",
    tradeName: "Jaiswal Steels",
    entityType: "Private Limited",
    pan: "AADCJ4817Q", // C = company
    stateCode: "09", // Uttar Pradesh
    establishedOn: "2014-03-11",
    cin: "U27100UP2014PTC063418",
    risk: "Medium",
    creditDays: 30,
    industry: "Steel trading and fabrication",
    turnoverBand: "₹5 – 50 crore",
    partner: "ca-noida",
    city: "Noida",
    state: "Uttar Pradesh",
    pincode: "201301",
    line1: "C-47, Sector 63",
    contacts: [
      {
        name: "Rohit Jaiswal",
        designation: "Director",
        mobile: "9810044521",
        email: `rohit@jaiswalsteels.${SAMPLE_DOMAIN}`,
        primary: true,
      },
      {
        name: "Meena Gupta",
        designation: "Accounts manager",
        mobile: "9999071263",
        email: `accounts@jaiswalsteels.${SAMPLE_DOMAIN}`,
        primary: false,
      },
    ],
  },
  {
    key: "tandon",
    branch: "DEL",
    legalName: "Tandon Exports LLP",
    tradeName: "Tandon Exports",
    entityType: "LLP",
    pan: "AAFFT9205L", // F = firm / LLP
    stateCode: "07", // Delhi
    establishedOn: "2018-09-26",
    cin: "AAF-2905",
    risk: "Low",
    creditDays: 45,
    industry: "Handicraft exports",
    turnoverBand: "₹1 – 5 crore",
    partner: "ca-noida",
    city: "Delhi",
    state: "Delhi",
    pincode: "110085",
    line1: "B-12/4, Sector 7, Rohini",
    contacts: [
      {
        name: "Sunita Tandon",
        designation: "Designated partner",
        mobile: "9811772043",
        email: `sunita@tandonexports.${SAMPLE_DOMAIN}`,
        primary: true,
      },
    ],
  },
  {
    key: "kaur-brothers",
    branch: "LDH",
    legalName: "Kaur Brothers Knitwear",
    tradeName: "Kaur Brothers",
    entityType: "Partnership Firm",
    pan: "AAEFK1372B", // F = firm
    stateCode: "03", // Punjab
    establishedOn: "2009-04-01",
    risk: "High",
    creditDays: 15,
    industry: "Hosiery and knitwear",
    turnoverBand: "₹1 – 5 crore",
    partner: "ca-ludhiana",
    city: "Ludhiana",
    state: "Punjab",
    pincode: "141003",
    line1: "Street 4, Industrial Area A",
    contacts: [
      {
        name: "Jaspal Singh Kaur",
        designation: "Partner",
        mobile: "9815223607",
        email: `jaspal@kaurbrothers.${SAMPLE_DOMAIN}`,
        primary: true,
      },
    ],
  },
  {
    key: "deshmukh",
    branch: "MRT",
    legalName: "Anil Kumar Deshmukh",
    tradeName: "",
    entityType: "Individual",
    pan: "AJQPD5618F", // P = individual
    stateCode: null, // no GST registration: a salaried ITR client
    establishedOn: "1979-11-23",
    risk: "Low",
    creditDays: 0,
    industry: "Salaried — pharmaceuticals",
    turnoverBand: "Below ₹20 lakh",
    partner: "ca-noida",
    city: "Meerut",
    state: "Uttar Pradesh",
    pincode: "250002",
    line1: "14, Shastri Nagar",
    contacts: [
      {
        name: "Anil Kumar Deshmukh",
        designation: "Self",
        mobile: "9412067755",
        email: `anil.deshmukh@${SAMPLE_DOMAIN}`,
        primary: true,
      },
    ],
  },
];

/**
 * What each client is signed up for, across all three tiers — so the A/B/C
 * work in P2-4 has something to show, and so the enforcement tests have a
 * fixture where an A-tier service really does default to a CA.
 *
 * `assignee` is checked against the template's `minExecRole` by
 * `tests/sample.test.js`: a dataset that seeds an illegal assignment would
 * make the enforcement look broken when it is not.
 */
export const SAMPLE_SERVICES = [
  // C tier (L1): routine, an employee or intern does it
  {
    client: "jaiswal",
    service: "GSTR3B",
    feeRupees: 3500,
    assignee: "emp-noida",
    reviewer: "ca-noida",
  },
  {
    client: "kaur-brothers",
    service: "GSTR3B",
    feeRupees: 3000,
    assignee: "emp-ludhiana",
    reviewer: "ca-ludhiana",
  },
  {
    client: "jaiswal",
    service: "TDS-RET",
    feeRupees: 2500,
    assignee: "intern-noida",
    reviewer: "ca-noida",
  },
  {
    client: "deshmukh",
    service: "ITR-SAL",
    feeRupees: 2000,
    assignee: "emp-rohini",
    reviewer: "ca-noida",
  },
  // B tier (L2): an employee does it, a CA reviews
  {
    client: "jaiswal",
    service: "ROC-ANN",
    feeRupees: 18000,
    assignee: "emp-noida",
    reviewer: "ca-noida",
  },
  {
    client: "tandon",
    service: "ITR-BUS",
    feeRupees: 12000,
    assignee: "emp-rohini",
    reviewer: "ca-noida",
  },
  // A tier (L3): only a CA executes, a partner reviews
  {
    client: "jaiswal",
    service: "STAT-AUD",
    feeRupees: 85000,
    assignee: "ca-noida",
    reviewer: null, // the partner, filled in from the live partner account
  },
  {
    client: "kaur-brothers",
    service: "TAX-AUD",
    feeRupees: 45000,
    assignee: "ca-ludhiana",
    reviewer: null,
  },
];

/**
 * Work in every part of the pipeline, including one closed engagement — which
 * is the fixture that shows access through an assignment lapsing when the job
 * finishes, rather than lasting for ever.
 */
export const SAMPLE_ENGAGEMENTS = [
  { subscription: 0, back: 0, status: "In progress" },
  {
    subscription: 0,
    back: 1,
    status: "Completed",
    // the one late filing in the set: the Tax book needs a row where the
    // deadline and the filing date disagree, or nothing proves the arithmetic
    dueDaysAgo: 25,
    filedDaysAgo: 22,
    ackNo: "AB2610174455621",
  },
  /**
   * The case the old shape could not record (P3-1): one month of GST where
   * GSTR-1 went in on time and GSTR-3B is still owing and already overdue.
   * Without a row like this, "part filed" is a state nobody ever sees.
   */
  {
    subscription: 0,
    back: 2,
    status: "In progress",
    dueDaysAgo: 4,
    milestones: [
      {
        key: "GSTR1",
        name: "GSTR-1",
        dueDaysAgo: 13,
        filedDaysAgo: 14,
        ackNo: "AA0911260001111",
      },
      { key: "GSTR3B", name: "GSTR-3B", dueDaysAgo: 4 },
    ],
  },
  /**
   * A job stuck on documents, with all three of the things that actually
   * hold one up (P3-2): a file we sent back, an item the client says they
   * cannot produce, and a question they asked and nobody has answered.
   * Without a row like this, those states are never seen.
   */
  {
    subscription: 1,
    back: 0,
    status: "Awaiting documents",
    checklistStates: [
      {
        at: 0,
        status: "Replacement requested",
        submissionCount: 1,
        rejectReason:
          "this is the August statement; we need September for this quarter",
      },
      {
        at: 1,
        status: "Requested",
        clientReply: {
          kind: "cannot",
          note: "the bank has not issued it yet",
          byName: "Rohit Jaiswal",
        },
      },
      {
        at: 2,
        status: "Requested",
        clientReply: {
          kind: "question",
          question: "Do you need the current account only, or all of them?",
          byName: "Rohit Jaiswal",
        },
      },
    ],
  },
  { subscription: 2, back: 0, status: "Scheduled" },
  { subscription: 3, back: 0, status: "Under review" },
  {
    subscription: 4,
    back: 0,
    status: "In progress",
    // the ROC annual filing: an AGM behind it and a deadline already past,
    // which is what the Statutory book is for noticing
    eventName: "Annual General Meeting",
    eventDaysAgo: 80,
    dueDaysAgo: 5,
  },
  { subscription: 5, back: 0, status: "Awaiting documents" },
  {
    subscription: 6,
    back: 0,
    status: "In progress",
    // an audit under way: appointed, no report yet, which is the state most
    // of the Audits book sits in for most of the year
    assurance: {
      auditType: "Statutory audit",
      appointmentDaysAgo: 60,
      opinion: "Not yet issued",
    },
  },
  { subscription: 7, back: 0, status: "Scheduled" },
];

/**
 * Grants of three widths, plus one deliberate absence.
 *
 * The absence matters as much as the grants: Shalini is on no Jaiswal work
 * and holds no grant for it, which is the fixture behind acceptance check 1.
 */
export const SAMPLE_GRANTS = [
  {
    user: "emp-ludhiana",
    client: "jaiswal",
    sections: ["profile", "documents"],
    reason: "Covering the Noida GST filings while Ankit is on leave",
    expiresInDays: null,
  },
  {
    user: "emp-noida",
    client: "tandon",
    sections: ["profile", "identifiers", "engagements", "documents", "notes"],
    reason: "Preparing the export turnover working for the LLP's ITR",
    expiresInDays: null,
  },
  {
    user: "intern-noida",
    client: "kaur-brothers",
    sections: ["profile", "engagements"],
    reason: "Audit exposure rotation — Ludhiana hosiery file, this quarter",
    expiresInDays: 3,
  },
];

/**
 * Digital signature certificates, deferred here from P2-2b because the
 * register did not exist then (P2-7).
 *
 * One expiring inside the month, so the dashboard tile and the dscExpiring
 * reminder both have something real to act on, and one comfortably valid so
 * the register is not all red.
 */
export const SAMPLE_DSCS = [
  {
    client: "jaiswal",
    holderName: "Rohit Jaiswal",
    holderRole: "Managing Director",
    certClass: "Class 3",
    issuer: "eMudhra",
    inDays: 24,
    forYears: 2,
    heldBy: "client",
    note: "Used for MCA and GST filings",
  },
  {
    client: "tandon",
    holderName: "Sunita Tandon",
    holderRole: "Designated Partner",
    certClass: "Class 3",
    issuer: "Capricorn",
    inDays: 420,
    forYears: 2,
    heldBy: "client",
    note: "",
  },
];

/**
 * UDINs against the sample work. Eighteen characters each, in the ICAI's
 * shape — invented, like every other identifier here, but correctly formed
 * so the register and its duplicate check behave as they will in earnest.
 */
export const SAMPLE_UDINS = [
  {
    // the completed engagement, which is the one that would carry a UDIN
    engagement: 1,
    udin: "26412345ABCDEF7890",
    documentType: "Net worth certificate",
    member: "ca-noida",
    backDays: 20,
  },
];

/**
 * One portal login, for the client with the most going on (P2-9a).
 *
 * The password is in the open here on purpose — this dataset refuses to run
 * with `NODE_ENV=production` and every address in it is at a `.test`
 * domain that cannot receive mail. It is the account to sign in with when
 * checking what a client actually sees.
 */
export const SAMPLE_PORTAL_USERS = [
  {
    client: "jaiswal",
    name: "Vikram Jaiswal",
    email: `vikram.jaiswal@${SAMPLE_DOMAIN}`,
    designation: "Director",
    password: "sample-portal-password",
    totpRequired: false,
  },
];

/**
 * Write the lot. Idempotent: people are matched on email and clients on PAN,
 * so running it twice adds nothing.
 *
 * @param {{ log?: (message: string) => void }} [options]
 */
/**
 * The firm's own registration, so that a sample invoice can be *issued*
 * rather than sitting as a draft nobody can look at.
 *
 * It is invented, and it prints on a tax invoice — so it is written only onto
 * a branch that has none, and `--drop-sample` takes it off again if it is
 * still untouched. The firm's real GSTINs go in Settings → Branches
 * (CLAUDE.md rule 8: nothing statutory is invented and left unflagged).
 */
export const SAMPLE_FIRM_PAN = "AAJFP7421K"; // F = partnership firm
export const SAMPLE_BRANCH_STATE = {
  NOI: "09", // Uttar Pradesh
  DEL: "07", // Delhi
  LDH: "03", // Punjab
  MRT: "09", // Uttar Pradesh
};

/**
 * SAC codes from the 9982 group (legal and accounting services). They go on
 * the sample invoice lines only, never into the firm's catalog — a wrong SAC
 * on a real GST invoice is the firm's problem, not a seed script's.
 * **The owner confirms these before they are used on real work.**
 */
const SAC = {
  audit: "998221", // financial auditing services
  accounts: "998222", // accounting and book-keeping
  taxCorporate: "998231", // corporate tax consulting and preparation
  taxIndividual: "998232", // individual tax preparation and planning
};

/** One group, because a group of one client teaches nothing. */
export const SAMPLE_GROUPS = [
  {
    name: "Jaiswal family group",
    notes:
      "Common management with Kaur Brothers Knitwear through a director holding. Billed separately.",
    clients: ["jaiswal", "kaur-brothers"],
  },
];

/** The vault (spec section 3). Encrypted at rest, revealed only on purpose. */
export const SAMPLE_CREDENTIALS = [
  {
    client: "jaiswal",
    portal: "GST",
    label: "Noida registration",
    username: "jaiswalsteels_gst",
    password: "Sample#Gst2026",
    notes: "Mobile OTP goes to the accounts manager, not the director.",
  },
  {
    client: "jaiswal",
    portal: "Income Tax",
    label: "Company login",
    username: "AADCJ4817Q",
    password: "Sample#It2026",
    notes: "",
  },
  {
    client: "kaur-brothers",
    portal: "GST",
    label: "Ludhiana registration",
    username: "kaurbrothers_gst",
    password: "Sample#Gst2026",
    notes: "",
  },
  {
    client: "tandon",
    portal: "MCA / V3",
    label: "Designated partner",
    username: "sunita.tandon@sample",
    password: "Sample#Mca2026",
    notes: "DSC of the designated partner is in the firm's custody.",
  },
];

/**
 * Notes and the communication log (spec section 3). A client record with no
 * conversation on it reads like a spreadsheet row.
 */
export const SAMPLE_NOTES = [
  {
    client: "jaiswal",
    kind: "Call",
    by: "ca-noida",
    daysAgo: 3,
    body: "Director called about the audit timeline. Told him fieldwork starts once the stock statement for September is in. He will send it this week.",
  },
  {
    client: "jaiswal",
    kind: "Email",
    by: "emp-noida",
    daysAgo: 8,
    body: "Sent the list of GST reconciliation differences for July to September. Accounts manager to confirm the three purchase invoices not in 2B.",
  },
  {
    client: "jaiswal",
    kind: "Note",
    by: "ca-noida",
    daysAgo: 20,
    body: "Internal: credit period is 30 days but they habitually pay at 45. Watch the receivable before taking on more work.",
  },
  {
    client: "tandon",
    kind: "Meeting",
    by: "ca-noida",
    daysAgo: 12,
    body: "Met the designated partners at Rohini. Export incentive documentation is with their CHA; return filing can proceed without it.",
  },
  {
    client: "kaur-brothers",
    kind: "WhatsApp",
    by: "emp-ludhiana",
    daysAgo: 2,
    body: "Asked for the October sales register. Partner says their accountant is on leave until the 25th.",
  },
  {
    client: "deshmukh",
    kind: "Note",
    by: "emp-rohini",
    daysAgo: 30,
    body: "Salaried individual, two Form 16s this year after a job change in June. Both employers' TDS to be matched against 26AS.",
  },
];

/** Comment threads on the work itself (spec section 5). */
export const SAMPLE_WORK_COMMENTS = [
  {
    client: "jaiswal",
    service: "STAT-AUD",
    by: "ca-noida",
    daysAgo: 6,
    body: "Opening balances tie to last year's signed accounts. Fixed asset register still to be reconciled against the depreciation schedule.",
  },
  {
    client: "jaiswal",
    service: "STAT-AUD",
    by: "emp-noida",
    daysAgo: 2,
    body: "Bank confirmations requested from HDFC and PNB. HDFC has replied, PNB has not.",
  },
  {
    client: "jaiswal",
    service: "GSTR3B",
    by: "emp-noida",
    daysAgo: 1,
    body: "2B reconciliation done. Three purchase invoices missing from the supplier side, credit of 46,200 held back this month.",
  },
  {
    client: "deshmukh",
    service: "ITR-SAL",
    by: "ca-noida",
    daysAgo: 1,
    body: "Reviewed. Check the 80C figure against the PPF passbook before filing — the client's own note says 1,50,000 but the statement shows 1,38,000.",
  },
];

/**
 * Files in the vault (spec section 6). Plain CSV and text, with content that
 * matches the name: a dataset full of empty PDFs does not show whether the
 * documents screen works.
 */
export const SAMPLE_DOCUMENTS = [
  {
    client: "jaiswal",
    service: "GSTR3B",
    name: "sales-register-october-2026.csv",
    kind: "Sales register",
    mime: "text/csv",
    body: [
      "Invoice No,Date,Party,GSTIN,Taxable Value,CGST,SGST,Total",
      "JS/26-27/0411,02-10-2026,Shree Balaji Traders,09AAACS1429P1ZK,284500.00,25605.00,25605.00,335710.00",
      "JS/26-27/0412,07-10-2026,Metro Fabricators,09AAFCM3310K1Z2,118000.00,10620.00,10620.00,139240.00",
      "JS/26-27/0413,14-10-2026,Noida Infra Works,09AABCN7721M1ZQ,642000.00,57780.00,57780.00,757560.00",
      "JS/26-27/0414,21-10-2026,Yamuna Steel Centre,09AAGCY5508D1ZT,96400.00,8676.00,8676.00,113752.00",
    ].join("\n"),
  },
  {
    client: "jaiswal",
    service: "STAT-AUD",
    name: "trial-balance-provisional.csv",
    kind: "Trial balance",
    mime: "text/csv",
    body: [
      "Ledger,Group,Debit,Credit",
      "Plant and machinery,Fixed assets,8742000.00,0.00",
      "Accumulated depreciation,Fixed assets,0.00,3118400.00",
      "Inventory - finished goods,Current assets,4260000.00,0.00",
      "Trade receivables,Current assets,6184500.00,0.00",
      "HDFC Bank 50200041,Bank,1142300.00,0.00",
      "Trade payables,Current liabilities,0.00,5327800.00",
      "Term loan - PNB,Loans,0.00,3900000.00",
      "Share capital,Capital,0.00,2500000.00",
      "Sales,Income,0.00,41822000.00",
      "Purchases,Expenses,29104000.00,0.00",
    ].join("\n"),
  },
  {
    client: "jaiswal",
    permanent: true,
    name: "incorporation-certificate.txt",
    kind: "Incorporation certificate",
    mime: "text/plain",
    body: [
      "CERTIFICATE OF INCORPORATION (sample placeholder)",
      "",
      "Company: Jaiswal Steels Private Limited",
      "CIN: U27100UP2014PTC063418",
      "Date of incorporation: 11-03-2014",
      "Registrar of Companies: Kanpur",
      "",
      "Sample data. The real certificate is a PDF from the MCA portal.",
    ].join("\n"),
  },
  {
    client: "kaur-brothers",
    service: "TAX-AUD",
    name: "stock-statement-30-09-2026.csv",
    kind: "Stock statement",
    mime: "text/csv",
    body: [
      "Item,Unit,Quantity,Rate,Value",
      "Cotton hosiery yarn 30s,Kg,4820,268.00,1291760.00",
      "Acrylic yarn 2/32,Kg,2140,312.00,667680.00",
      "Knitted fabric - grey,Kg,1760,415.00,730400.00",
      "Finished sweaters,Pcs,3940,620.00,2442800.00",
      "Packing material,Lot,1,84200.00,84200.00",
    ].join("\n"),
  },
  {
    client: "tandon",
    service: "ITR-BUS",
    name: "bank-interest-certificate.txt",
    kind: "Interest certificate",
    mime: "text/plain",
    body: [
      "Interest certificate (sample placeholder)",
      "",
      "Account: Tandon Exports LLP, current account 0912xxxx4471",
      "Period: 01-04-2025 to 31-03-2026",
      "Interest credited: 48,210.00",
      "TDS deducted: Nil (Form 15G on record)",
    ].join("\n"),
  },
  {
    client: "deshmukh",
    permanent: true,
    name: "pan-card.txt",
    kind: "PAN card",
    mime: "text/plain",
    body: [
      "PAN card (sample placeholder)",
      "",
      "Name: Anil Kumar Deshmukh",
      "Date of birth: 14-07-1981",
      "",
      "The number itself is deliberately not written into this sample file.",
    ].join("\n"),
  },
];

/**
 * Billing (spec section 7), in the four states the screens need to show:
 * part paid and overdue, paid in full, issued and waiting, and a draft.
 */
export const SAMPLE_INVOICES = [
  {
    key: "jaiswal-audit",
    client: "jaiswal",
    issue: true,
    daysAgo: 40,
    lines: [
      { service: "STAT-AUD", sac: SAC.audit },
      { service: "ROC-ANN", sac: SAC.accounts },
    ],
    reimbursements: [
      { description: "MCA filing fees (AOC-4, MGT-7)", amountPaise: 60000 },
    ],
    notes: "Audit fee as per engagement letter dated 12-04-2026.",
  },
  {
    key: "tandon-itr",
    client: "tandon",
    issue: true,
    daysAgo: 20,
    lines: [{ service: "ITR-BUS", sac: SAC.taxCorporate }],
  },
  {
    key: "kaur-taxaudit",
    client: "kaur-brothers",
    issue: true,
    daysAgo: 5,
    lines: [{ service: "TAX-AUD", sac: SAC.audit }],
  },
  {
    key: "deshmukh-itr",
    client: "deshmukh",
    issue: false,
    daysAgo: 1,
    lines: [{ service: "ITR-SAL", sac: SAC.taxIndividual }],
    notes: "Hold until the 80C figure is confirmed.",
  },
];

/**
 * Receipts. One settles a bill in full, one part-settles the oldest and
 * leaves it overdue — which is the row the receivables ageing exists for.
 * TDS is recorded as the client deducted it, not netted off the amount.
 */
export const SAMPLE_PAYMENTS = [
  {
    client: "tandon",
    daysAgo: 6,
    mode: "Bank transfer",
    reference: "NEFT/HDFC/0912447118",
    pays: "tandon-itr",
    full: true,
  },
  {
    client: "jaiswal",
    daysAgo: 11,
    mode: "Bank transfer",
    reference: "RTGS/PNB/UTIB2610114402",
    pays: "jaiswal-audit",
    amountRupees: 60000,
    tdsRupees: 10300, // 10% of the professional fees, section 194J
    notes:
      "Part payment against the audit bill. Balance promised after Diwali.",
  },
];

/** The bell (spec section 12). An empty notification list teaches nothing. */
export const SAMPLE_NOTIFICATIONS = [
  {
    to: "partner",
    type: "review.waiting",
    hoursAgo: 4,
    title: "Ready for your review",
    body: "Anil Kumar Deshmukh — ITR salaried. Submitted by Shalini Verma.",
    href: "/engagements",
  },
  {
    to: "partner",
    type: "invoice.overdue",
    hoursAgo: 20,
    title: "Invoice overdue",
    body: "Jaiswal Steels Private Limited — part paid, balance past its due date.",
    href: "/invoices/receivables",
  },
  {
    to: "partner",
    type: "dsc.expiring",
    hoursAgo: 30,
    title: "A DSC expires in 24 days",
    body: "Rohit Jaiswal — renew before the ROC filing window.",
    href: "/practice/dsc",
    read: true,
  },
  {
    to: "ca-noida",
    type: "engagement.assigned",
    hoursAgo: 2,
    title: "Assigned to you",
    body: "Jaiswal Steels — statutory audit, FY2026-27.",
    href: "/engagements",
  },
  {
    to: "emp-noida",
    type: "document.received",
    hoursAgo: 9,
    title: "A document arrived",
    body: "Jaiswal Steels — sales register for October 2026.",
    href: "/documents",
  },
];

export async function seedSample(options = {}) {
  const log = options.log ?? (() => {});

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "The sample dataset will not be written with NODE_ENV=production. It invents clients.",
    );
  }

  const branches = await Branch.find({}).select("code").lean();
  const branchId = new Map(branches.map((b) => [b.code, b._id]));
  if (branchId.size === 0) {
    throw new Error("Run the ordinary seed first: there are no branches.");
  }

  const partner = await User.findOne({ role: "partner" })
    .select("_id name")
    .lean();
  if (!partner) {
    throw new Error(
      "Run the ordinary seed first: there is no partner account.",
    );
  }

  const templates = await ServiceTemplate.find({})
    .select("code name level minExecRole minReviewRole recurrence")
    .lean();
  const templateByCode = new Map(templates.map((t) => [t.code, t]));
  if (templateByCode.size === 0) {
    throw new Error("Run the ordinary seed first: the catalog is empty.");
  }

  /** @type {Map<string, any>} */
  const personId = new Map([["partner", partner._id]]);
  /** @type {Map<string, any>} */
  const clientId = new Map();

  // --- people -------------------------------------------------------------
  // Two passes, because reportingTo and the intern's principal point at
  // people in the same list.
  for (const person of SAMPLE_PEOPLE) {
    const existing = await User.findOne({ email: person.email })
      .select("_id")
      .lean();
    if (existing) {
      personId.set(person.key, existing._id);
      continue;
    }

    const created = await systemAudit(async (session) => {
      const [user] = await User.create(
        [
          {
            name: person.name,
            email: person.email,
            mobile: person.mobile,
            role: person.role,
            branchIds: person.branches.map((code) => branchId.get(code)),
            joiningDate: new Date(person.joiningDate),
            skills: person.skills,
            // no password: these accounts are for looking at data, not for
            // signing in. A partner resets one on the Team screen if needed.
            passwordHash: await hashPassword(
              `sample-not-a-real-password-${person.key}`,
            ),
            mustChangePassword: true,
            isIntern: person.role === "intern",
            icai: person.icai
              ? {
                  membershipNo: person.icai.membershipNo,
                  grade: person.icai.grade,
                  admittedOn: new Date(person.icai.admittedOn),
                  copHeld: person.icai.copHeld,
                  copFrom: new Date(person.icai.copFrom),
                }
              : undefined,
            articleship: person.articleship
              ? {
                  icaiRegNo: person.articleship.icaiRegNo,
                  start: new Date(person.articleship.start),
                  expectedEnd: new Date(person.articleship.expectedEnd),
                  leaveAllowed: person.articleship.leaveAllowed,
                  leaveTaken: person.articleship.leaveTaken,
                }
              : undefined,
            createdBy: "sample",
            updatedBy: "sample",
          },
        ],
        { session },
      );
      return user;
    });

    personId.set(person.key, created._id);
    log(`person  ${person.name} (${person.role})`);
  }

  for (const person of SAMPLE_PEOPLE) {
    const reportsTo = person.reportsTo
      ? personId.get(person.reportsTo)
      : partner._id;
    const principal = person.articleship
      ? personId.get(person.articleship.principal)
      : null;

    await systemAudit((session) =>
      User.findOneAndUpdate(
        { _id: personId.get(person.key) },
        {
          $set: {
            reportingTo: reportsTo,
            ...(principal ? { "articleship.principalId": principal } : {}),
            updatedBy: "sample",
          },
        },
        { session },
      ),
    );
  }

  // --- clients ------------------------------------------------------------
  let codeSeq = 9001;
  for (const client of SAMPLE_CLIENTS) {
    const existing = await Client.findOne({ pan: client.pan })
      .select("_id")
      .lean();
    if (existing) {
      clientId.set(client.key, existing._id);
      continue;
    }

    const created = await systemAudit(async (session) => {
      const [made] = await Client.create(
        [
          {
            code: `PHMG-${client.branch}-${codeSeq}`,
            legalName: client.legalName,
            tradeName: client.tradeName,
            entityType: client.entityType,
            pan: client.pan,
            cin: client.cin ?? "",
            establishedOn: new Date(client.establishedOn),
            status: "Active",
            risk: client.risk,
            creditDays: client.creditDays,
            industry: client.industry,
            turnoverBand: client.turnoverBand,
            tags: [SAMPLE_TAG],
            branchId: branchId.get(client.branch),
            clientPartnerId: personId.get(client.partner),
            onboardedOn: new Date(client.establishedOn),
            contacts: client.contacts,
            gstins: client.stateCode
              ? [
                  {
                    gstin: makeGstin(client.stateCode, client.pan),
                    state: client.state,
                    stateCode: client.stateCode,
                    active: true,
                  },
                ]
              : [],
            addresses: [
              {
                kind: "Registered",
                line1: client.line1,
                city: client.city,
                state: client.state,
                pincode: client.pincode,
              },
            ],
            createdBy: "sample",
            updatedBy: "sample",
          },
        ],
        { session },
      );
      return made;
    });

    clientId.set(client.key, created._id);
    codeSeq += 1;
    log(`client  ${client.legalName}`);
  }

  // --- subscriptions ------------------------------------------------------
  /** @type {any[]} */
  const subscriptions = [];
  for (const row of SAMPLE_SERVICES) {
    const template = templateByCode.get(row.service);
    if (!template) {
      log(`skipped ${row.service}: not in the catalog`);
      subscriptions.push(null);
      continue;
    }

    const where = {
      clientId: clientId.get(row.client),
      serviceTemplateId: template._id,
    };
    const existing = await ClientService.findOne(where).lean();
    if (existing) {
      subscriptions.push({ ...existing, template });
      continue;
    }

    const created = await systemAudit(async (session) => {
      const [made] = await ClientService.create(
        [
          {
            ...where,
            feePaise: row.feeRupees * 100,
            startPeriod: "",
            defaultAssigneeId: personId.get(row.assignee),
            defaultReviewerId: row.reviewer
              ? personId.get(row.reviewer)
              : partner._id,
            active: true,
            createdBy: "sample",
            updatedBy: "sample",
          },
        ],
        { session },
      );
      return made;
    });

    subscriptions.push({ ...created.toObject(), template });
    log(`service ${template.name} for ${row.client}`);
  }

  // --- engagements --------------------------------------------------------
  const now = new Date();
  for (const row of SAMPLE_ENGAGEMENTS) {
    const subscription = subscriptions[row.subscription];
    if (!subscription) continue;

    const template = subscription.template;
    const client = await Client.findById(subscription.clientId).lean();
    if (!client) continue;

    // `back: 1` is the period before the current one, which is how a closed
    // engagement gets to exist without being dated in the future
    let period = periodFor(template.recurrence, now);
    for (let i = 0; i < row.back; i += 1) {
      period = periodFor(
        template.recurrence,
        new Date(period.start.getTime() - 43_200_000),
      );
    }

    const exists = await Engagement.findOne({
      clientId: client._id,
      serviceTemplateId: template._id,
      period: period.code,
    })
      .select("_id")
      .lean();
    if (exists) continue;

    const branch = branches.find(
      (b) => String(b._id) === String(client.branchId),
    );

    await systemAudit(async (session) => {
      const fields = buildEngagement({
        template,
        client,
        period,
        assigneeId: subscription.defaultAssigneeId,
        reviewerId: subscription.defaultReviewerId,
        feePaise: subscription.feePaise,
        now,
      });

      const code = await nextEngagementCode(
        branch?.code ?? "NOI",
        template.code,
        period.code,
        session,
      );

      await Engagement.create(
        [
          {
            ...fields,
            code,
            status: row.status,
            ...(row.dueDaysAgo
              ? { statutoryDue: daysBack(now, row.dueDaysAgo) }
              : {}),
            ...(row.filedDaysAgo
              ? {
                  filedOn: daysBack(now, row.filedDaysAgo),
                  ackNo: row.ackNo ?? "",
                }
              : {}),
            /**
             * The filings this work owes (P3-1). Sample work is built here
             * rather than by the generator, so the milestones are built here
             * too — otherwise the panel would be empty on every sample row
             * and the pair case would never be visible.
             */
            ...(row.milestones
              ? {
                  milestones: row.milestones.map((m) => ({
                    name: m.name,
                    ruleKey: m.key,
                    dueDate: daysBack(now, m.dueDaysAgo),
                    ...(m.filedDaysAgo
                      ? {
                          filedOn: daysBack(now, m.filedDaysAgo),
                          dueDateAtFiling: daysBack(now, m.dueDaysAgo),
                          ackNo: m.ackNo ?? "",
                          filedByName: "Sample data",
                        }
                      : {}),
                  })),
                }
              : {}),
            ...(row.eventDaysAgo
              ? {
                  eventDate: daysBack(now, row.eventDaysAgo),
                  eventName: row.eventName ?? "",
                }
              : {}),
            ...(row.assurance
              ? {
                  assurance: {
                    auditType: row.assurance.auditType ?? "",
                    appointmentDate: row.assurance.appointmentDaysAgo
                      ? daysBack(now, row.assurance.appointmentDaysAgo)
                      : null,
                    reportDate: row.assurance.reportDaysAgo
                      ? daysBack(now, row.assurance.reportDaysAgo)
                      : null,
                    opinion: row.assurance.opinion ?? "",
                    qualificationNote: row.assurance.qualificationNote ?? "",
                  },
                }
              : {}),
            /**
             * Put particular checklist rows into particular states (P3-2),
             * by position, so the sample set shows a replacement asked for,
             * an item the client cannot provide, and an open question.
             */
            ...(row.checklistStates
              ? {
                  checklist: (fields.checklist ?? []).map((item, i) => {
                    const over = row.checklistStates.find((s) => s.at === i);
                    return over ? { ...item, ...over, at: undefined } : item;
                  }),
                }
              : {}),
            ...(row.status === "Completed"
              ? {
                  completedAt: now,
                  completedBy: String(subscription.defaultReviewerId),
                  /**
                   * Accepted, not Verified (P3-2): the word changed because
                   * a format check is no longer confused with a person
                   * accepting. Seeding the old word would put the whole
                   * sample set through the rename migration for no reason.
                   */
                  checklist: (fields.checklist ?? []).map((item) => ({
                    ...item,
                    status: "Accepted",
                    submissionCount: 1,
                    acceptedSubmission: 1,
                    acceptedByName: "Sample data",
                  })),
                  reviewChecklist: (fields.reviewChecklist ?? []).map((i) => ({
                    ...i,
                    checked: true,
                  })),
                }
              : {}),
            statusHistory: [
              { to: "Scheduled", byName: "Sample data" },
              ...(row.status === "Scheduled"
                ? []
                : [{ to: row.status, byName: "Sample data" }]),
            ],
            createdBy: "sample",
            updatedBy: "sample",
          },
        ],
        { session },
      );
      log(`work    ${code} — ${row.status}`);
    });
  }

  // --- grants -------------------------------------------------------------
  for (const row of SAMPLE_GRANTS) {
    const where = {
      userId: personId.get(row.user),
      clientId: clientId.get(row.client),
    };
    const existing = await ClientAccess.findOne(where).lean();
    if (existing) continue;

    await systemAudit(async (session) => {
      await ClientAccess.create(
        [
          {
            ...where,
            branchId: (await Client.findById(where.clientId).lean())?.branchId,
            sections: row.sections,
            reason: row.reason,
            expiresAt: row.expiresInDays
              ? new Date(now.getTime() + row.expiresInDays * 86_400_000)
              : null,
            active: true,
            grantedBy: String(partner._id),
            grantedByName: partner.name,
            createdBy: "sample",
            updatedBy: "sample",
          },
        ],
        { session },
      );
    });
    log(`grant   ${row.user} → ${row.client} (${row.sections.length})`);
  }

  // --- digital signature certificates (P2-7) ------------------------------
  for (const row of SAMPLE_DSCS) {
    const client = await Client.findById(clientId.get(row.client)).lean();
    if (!client) continue;

    const validTill = new Date(now.getTime() + row.inDays * 86_400_000);
    const exists = await Dsc.findOne({
      clientId: client._id,
      holderName: row.holderName,
    })
      .select("_id")
      .lean();
    if (exists) continue;

    await systemAudit(async (session) => {
      await Dsc.create(
        [
          {
            clientId: client._id,
            branchId: client.branchId,
            holderName: row.holderName,
            holderRole: row.holderRole,
            certClass: row.certClass,
            issuer: row.issuer,
            validFrom: new Date(
              validTill.getTime() - row.forYears * 365 * 86_400_000,
            ),
            validTill,
            heldBy: row.heldBy,
            note: row.note,
            createdBy: "sample",
            updatedBy: "sample",
          },
        ],
        { session },
      );
    });
    log(`dsc     ${row.holderName} — expires in ${row.inDays} days`);
  }

  // --- the UDIN register (P2-7) -------------------------------------------
  for (const row of SAMPLE_UDINS) {
    const plan = SAMPLE_ENGAGEMENTS[row.engagement];
    const subscription = plan && subscriptions[plan.subscription];
    if (!subscription) continue;

    const engagement = await Engagement.findOne({
      clientId: subscription.clientId,
      serviceTemplateId: subscription.template._id,
    })
      .sort({ createdAt: 1 })
      .session(null);
    if (!engagement) continue;

    const exists = await Udin.findOne({ udin: row.udin }).select("_id").lean();
    if (exists) continue;

    const member = await User.findById(personId.get(row.member))
      .select("icai")
      .lean();

    await systemAudit(async (session) => {
      await Udin.create(
        [
          {
            udin: row.udin,
            clientId: engagement.clientId,
            engagementId: engagement._id,
            branchId: engagement.branchId,
            memberId: personId.get(row.member),
            membershipNo: member?.icai?.membershipNo ?? "",
            documentType: row.documentType,
            generatedOn: new Date(now.getTime() - row.backDays * 86_400_000),
            createdBy: "sample",
            updatedBy: "sample",
          },
        ],
        { session },
      );

      // the engagement's own field is a copy of the register (P2-7)
      engagement.udin = row.udin;
      await engagement.save({ session });
    });
    log(`udin    ${row.udin} — ${row.documentType}`);
  }

  // --- the client portal account (P2-9a) ----------------------------------
  for (const row of SAMPLE_PORTAL_USERS) {
    const client = await Client.findById(clientId.get(row.client)).lean();
    if (!client) continue;
    if (await ClientUser.findOne({ email: row.email }).lean()) continue;

    await systemAudit(async (session) => {
      await ClientUser.create(
        [
          {
            name: row.name,
            email: row.email,
            designation: row.designation,
            clientId: client._id,
            branchId: client.branchId,
            passwordHash: await hashPassword(row.password),
            // the sample account is ready to sign in with: a dataset that
            // demands a password change before it shows anything is a
            // dataset nobody uses
            mustChangePassword: false,
            totpRequired: row.totpRequired,
            invitedByName: "Sample data",
            createdBy: "sample",
            updatedBy: "sample",
          },
        ],
        { session },
      );
    });
    log(`portal  ${row.email} — ${row.password}`);
  }

  // --- the firm's own GSTIN, so a sample invoice can be issued -------------
  // Only onto a branch that has none: a real registration is never overwritten.
  for (const branch of await Branch.find({
    $or: [{ gstin: "" }, { gstin: null }, { gstin: { $exists: false } }],
  })) {
    const stateCode = SAMPLE_BRANCH_STATE[branch.code];
    if (!stateCode) continue;
    const gstin = makeGstin(stateCode, SAMPLE_FIRM_PAN);
    await systemAudit(async (session) => {
      branch.gstin = gstin;
      branch.updatedBy = "sample";
      await branch.save({ session });
    });
    log(`gstin   ${branch.code} ${gstin}  ← invented, replace before go-live`);
  }

  // --- groups -------------------------------------------------------------
  for (const row of SAMPLE_GROUPS) {
    let group = await ClientGroup.findOne({ name: row.name });
    if (!group) {
      group = await systemAudit(async (session) => {
        const [made] = await ClientGroup.create(
          [
            {
              name: row.name,
              notes: row.notes,
              createdBy: "sample",
              updatedBy: "sample",
            },
          ],
          { session },
        );
        return made;
      });
      log(`group   ${row.name}`);
    }
    for (const key of row.clients) {
      const client = await Client.findById(clientId.get(key));
      if (!client || String(client.groupId ?? "") === String(group._id)) {
        continue;
      }
      await systemAudit(async (session) => {
        client.groupId = group._id;
        client.updatedBy = "sample";
        await client.save({ session });
      });
    }
  }

  // --- the credentials vault ----------------------------------------------
  for (const row of SAMPLE_CREDENTIALS) {
    const id = clientId.get(row.client);
    if (!id) continue;
    const exists = await ClientCredential.findOne({
      clientId: id,
      portal: row.portal,
      username: row.username,
    })
      .select("_id")
      .lean();
    if (exists) continue;

    await systemAudit(async (session) => {
      await ClientCredential.create(
        [
          {
            clientId: id,
            portal: row.portal,
            label: row.label,
            username: row.username,
            passwordEncrypted: encryptField(row.password),
            notesEncrypted: row.notes ? encryptField(row.notes) : null,
            createdBy: "sample",
            updatedBy: "sample",
          },
        ],
        { session },
      );
    });
    log(`login   ${row.client} — ${row.portal}`);
  }

  // --- notes and the communication log ------------------------------------
  for (const row of SAMPLE_NOTES) {
    const id = clientId.get(row.client);
    if (!id) continue;
    if (await Comment.findOne({ entityId: id, body: row.body }).lean())
      continue;

    const author = personId.get(row.by);
    const authorName =
      SAMPLE_PEOPLE.find((p) => p.key === row.by)?.name ?? "Sample data";

    await systemAudit(async (session) => {
      await Comment.create(
        [
          {
            entityType: "Client",
            entityId: id,
            clientId: id,
            kind: row.kind,
            body: row.body,
            occurredAt: daysBack(now, row.daysAgo),
            internal: row.kind === "Note",
            createdBy: author ? String(author) : "sample",
            createdByName: authorName,
            updatedBy: "sample",
          },
        ],
        { session },
      );
    });
  }
  log(`notes   ${SAMPLE_NOTES.length} on client records`);

  /**
   * The sample work, looked up by client and service code — the engagement
   * loop above does not keep its ids, and matching on the pair is what the
   * invoices, comments and documents below all need.
   */
  async function engagementFor(clientKey, serviceCode) {
    const template = templateByCode.get(serviceCode);
    const id = clientId.get(clientKey);
    if (!template || !id) return null;
    return Engagement.findOne({
      clientId: id,
      serviceTemplateId: template._id,
    })
      .sort({ createdAt: -1 })
      .lean();
  }

  // --- comments on the work -----------------------------------------------
  let workComments = 0;
  for (const row of SAMPLE_WORK_COMMENTS) {
    const engagement = await engagementFor(row.client, row.service);
    if (!engagement) continue;
    if (
      await Comment.findOne({ entityId: engagement._id, body: row.body }).lean()
    ) {
      continue;
    }

    const author = personId.get(row.by);
    const authorName =
      SAMPLE_PEOPLE.find((p) => p.key === row.by)?.name ?? "Sample data";

    await systemAudit(async (session) => {
      await Comment.create(
        [
          {
            entityType: "Engagement",
            entityId: engagement._id,
            clientId: engagement.clientId,
            kind: "Note",
            body: row.body,
            occurredAt: daysBack(now, row.daysAgo),
            internal: true,
            createdBy: author ? String(author) : "sample",
            createdByName: authorName,
            updatedBy: "sample",
          },
        ],
        { session },
      );
    });
    workComments += 1;
  }
  log(`comment ${workComments} on engagements`);

  // --- documents in the vault ---------------------------------------------
  /**
   * Written through the local driver directly. The BigRock gateway takes
   * uploads only from a browser with a signed ticket (spec section 14), so a
   * script cannot put bytes there — and should not: the sample dataset is for
   * a development database, not the firm's hosting.
   */
  let documents = 0;
  if (driverName() === "local") {
    for (const row of SAMPLE_DOCUMENTS) {
      const client = await Client.findById(clientId.get(row.client)).lean();
      if (!client) continue;
      if (
        await DocumentModel.findOne({
          clientId: client._id,
          name: row.name,
        }).lean()
      ) {
        continue;
      }

      const engagement = row.service
        ? await engagementFor(row.client, row.service)
        : null;
      const fy = `FY${financialYearLabel(
        engagement?.periodStart ? new Date(engagement.periodStart) : now,
      )}`;
      const bytes = Buffer.from(row.body, "utf8");
      const key = buildFileKey({
        clientCode: client.code,
        filename: row.name,
        fy: row.permanent ? "" : fy,
        serviceCode: engagement?.templateSnapshot?.code ?? row.service ?? "",
        engagementCode: engagement?.code ?? "",
        permanent: Boolean(row.permanent),
      });
      await putLocal(key, bytes);

      await systemAudit(async (session) => {
        await DocumentModel.create(
          [
            {
              name: row.name,
              fileKey: key,
              size: bytes.length,
              mime: row.mime,
              checksum: createHash("sha256").update(bytes).digest("hex"),
              fy: row.permanent ? "" : fy,
              isPermanent: Boolean(row.permanent),
              kind: row.kind,
              clientId: client._id,
              engagementId: engagement?._id ?? null,
              branchId: client.branchId,
              uploadedBy: "sample",
              uploadedByName: "Sample data",
              createdBy: "sample",
              updatedBy: "sample",
            },
          ],
          { session },
        );
      });
      documents += 1;
    }
    log(`file    ${documents} in the vault`);
  } else {
    log(
      `file    skipped: the ${driverName()} driver takes uploads from a browser only`,
    );
  }

  // --- invoices -----------------------------------------------------------
  /** @type {Map<string, any>} */
  const invoiceByKey = new Map();
  for (const row of SAMPLE_INVOICES) {
    const client = await Client.findById(clientId.get(row.client)).lean();
    if (!client) continue;

    const existing = await Invoice.findOne({
      clientId: client._id,
      createdBy: "sample",
      "lines.sac": row.lines[0].sac,
    });
    if (existing) {
      invoiceByKey.set(row.key, existing);
      continue;
    }

    const branch = branches.find(
      (b) => String(b._id) === String(client.branchId),
    );
    const branchDoc = await Branch.findById(client.branchId).lean();
    const date = daysBack(now, row.daysAgo);
    const billingGstin = (client.gstins ?? [])[0]?.gstin ?? "";
    const placeOfSupply = billingGstin
      ? String(billingGstin).slice(0, 2)
      : SAMPLE_BRANCH_STATE[branch?.code ?? "NOI"];

    /** The lines, priced from the work they bill. */
    const lines = [];
    for (const line of row.lines) {
      const engagement = await engagementFor(row.client, line.service);
      const template = templateByCode.get(line.service);
      if (!engagement && !template) continue;
      lines.push({
        engagementId: engagement?._id ?? null,
        description: `${template?.name ?? "Professional services"} — ${
          engagement?.periodLabel || engagement?.period || "FY2026-27"
        }`,
        sac: line.sac,
        amountPaise:
          engagement?.feePaise ||
          (SAMPLE_SERVICES.find(
            (s) => s.client === row.client && s.service === line.service,
          )?.feeRupees ?? 0) * 100,
        gstRate: 18,
      });
    }
    if (lines.length === 0) continue;

    const invoice = await systemAudit(async (session) => {
      const [doc] = await Invoice.create(
        [
          {
            type: "Tax invoice",
            status: "Draft",
            date,
            dueDate: client.creditDays
              ? new Date(date.getTime() + client.creditDays * 86_400_000)
              : null,
            clientId: client._id,
            branchId: client.branchId,
            supplierGstin: branchDoc?.gstin ?? "",
            billingGstin,
            placeOfSupply,
            placeOfSupplyName: stateName(placeOfSupply),
            billingName: client.legalName,
            billingAddress: (client.addresses ?? [])[0]?.line1 ?? "",
            lines,
            reimbursements: row.reimbursements ?? [],
            notes: row.notes ?? "",
            createdBy: "sample",
            updatedBy: "sample",
          },
        ],
        { session },
      );
      applyTotals(doc, branchDoc, client);
      await doc.save({ session });
      return doc;
    });

    // Issued the same way the screen issues one: the number comes from the
    // counter inside a transaction, so the series stays gapless (spec §7).
    if (row.issue) {
      const reasons = reasonsNotIssuable(invoice, branchDoc);
      if (reasons.length > 0) {
        log(`bill    draft only — ${reasons[0]}`);
      } else {
        await systemAudit(async (session) => {
          const { number, series, seq } = await nextInvoiceNumber(
            branchDoc.invoicePrefix || branchDoc.code,
            invoice.date,
            session,
          );
          invoice.number = number;
          invoice.series = series;
          invoice.seq = seq;
          invoice.status = "Sent";
          invoice.issuedAt = date;
          invoice.issuedBy = String(partner._id);
          invoice.updatedBy = "sample";
          await invoice.save({ session });

          for (const line of invoice.lines) {
            if (!line.engagementId) continue;
            await Engagement.updateOne(
              { _id: line.engagementId },
              { $set: { billingStatus: "Billed", updatedBy: "sample" } },
              { session },
            );
          }
        });
      }
    }

    invoiceByKey.set(row.key, invoice);
    log(
      `bill    ${invoice.number ?? "draft"} — ${(invoice.totalPaise / 100).toFixed(2)}`,
    );
  }

  // --- payments -----------------------------------------------------------
  for (const row of SAMPLE_PAYMENTS) {
    const invoice = invoiceByKey.get(row.pays);
    const id = clientId.get(row.client);
    if (!invoice || !invoice.number || !id) continue;
    if (await Payment.findOne({ reference: row.reference }).lean()) continue;

    const tdsPaise = row.full
      ? (invoice.tdsExpectedPaise ?? 0)
      : Math.round((row.tdsRupees ?? 0) * 100);
    const amountPaise = row.full
      ? Math.max(0, invoice.totalPaise - tdsPaise)
      : Math.round((row.amountRupees ?? 0) * 100);

    const date = daysBack(now, row.daysAgo);
    await systemAudit(async (session) => {
      await Payment.create(
        [
          {
            clientId: id,
            branchId: invoice.branchId,
            date,
            amountPaise,
            tdsPaise,
            mode: row.mode,
            reference: row.reference,
            notes: row.notes ?? "",
            tdsSeenIn26AS: Boolean(row.full),
            allocations: [{ invoiceId: invoice._id, amountPaise, tdsPaise }],
            createdBy: "sample",
            updatedBy: "sample",
          },
        ],
        { session },
      );

      // the same two fields the payments screen moves, and the shared rule
      // for what the invoice's status becomes afterwards
      const doc = await Invoice.findById(invoice._id).session(session);
      doc.paidPaise = (doc.paidPaise ?? 0) + amountPaise;
      doc.tdsCreditedPaise = (doc.tdsCreditedPaise ?? 0) + tdsPaise;
      doc.status = statusAfterPayment(doc);
      doc.updatedBy = "sample";
      await doc.save({ session });
    });
    log(
      `paid    ${invoice.number} — ${(amountPaise / 100).toFixed(2)}${
        tdsPaise ? ` + TDS ${(tdsPaise / 100).toFixed(2)}` : ""
      }`,
    );
  }

  // --- the bell -----------------------------------------------------------
  // No audit entry and no transaction: a notification is a nudge, not a
  // record of the firm's work. The model says so too.
  let bells = 0;
  for (const row of SAMPLE_NOTIFICATIONS) {
    const userId = personId.get(row.to);
    if (!userId) continue;
    if (await Notification.findOne({ userId, title: row.title }).lean())
      continue;
    const at = new Date(now.getTime() - row.hoursAgo * 3_600_000);
    await Notification.create({
      userId,
      type: row.type,
      title: row.title,
      body: row.body,
      href: row.href,
      readAt: row.read ? at : null,
      createdAt: at,
    });
    bells += 1;
  }
  log(`bell    ${bells} notifications`);

  return {
    people: SAMPLE_PEOPLE.length,
    clients: SAMPLE_CLIENTS.length,
    services: subscriptions.filter(Boolean).length,
    grants: SAMPLE_GRANTS.length,
    dscs: SAMPLE_DSCS.length,
    udins: SAMPLE_UDINS.length,
    portalUsers: SAMPLE_PORTAL_USERS.length,
    invoices: invoiceByKey.size,
    payments: SAMPLE_PAYMENTS.length,
    documents,
    notes: SAMPLE_NOTES.length + workComments,
    notifications: bells,
  };
}

/**
 * Take the sample data out again, for a database that is about to hold real
 * records. Soft delete only, like everything else (CLAUDE.md rule 3).
 */
export async function dropSample() {
  const people = await User.find({
    email: new RegExp(`@${SAMPLE_DOMAIN.replace(/\./g, "\\.")}$`),
  });
  const clients = await Client.find({ tags: SAMPLE_TAG });

  let removed = 0;
  for (const client of clients) {
    const engagements = await Engagement.find({ clientId: client._id });
    for (const engagement of engagements) {
      await systemAudit((session) =>
        engagement.softDelete("sample", { session }),
      );
      removed += 1;
    }
    for (const grant of await ClientAccess.find({ clientId: client._id })) {
      await systemAudit((session) => grant.softDelete("sample", { session }));
      removed += 1;
    }
    for (const sub of await ClientService.find({ clientId: client._id })) {
      await systemAudit((session) => sub.softDelete("sample", { session }));
      removed += 1;
    }
    // the billing, the vault and the conversation
    for (const row of await Payment.find({ clientId: client._id })) {
      await systemAudit((session) => row.softDelete("sample", { session }));
      removed += 1;
    }
    for (const row of await Invoice.find({ clientId: client._id })) {
      await systemAudit((session) => row.softDelete("sample", { session }));
      removed += 1;
    }
    for (const row of await DocumentModel.find({ clientId: client._id })) {
      // the row is soft-deleted; the bytes go, because they are invented
      if (driverName() === "local") {
        await removeLocal(row.fileKey, { purge: true }).catch(() => {});
      }
      await systemAudit((session) => row.softDelete("sample", { session }));
      removed += 1;
    }
    for (const row of await Comment.find({ clientId: client._id })) {
      await systemAudit((session) => row.softDelete("sample", { session }));
      removed += 1;
    }
    for (const row of await ClientCredential.find({ clientId: client._id })) {
      await systemAudit((session) => row.softDelete("sample", { session }));
      removed += 1;
    }
    // the registers (P2-7)
    for (const row of await Dsc.find({ clientId: client._id })) {
      await systemAudit((session) => row.softDelete("sample", { session }));
      removed += 1;
    }
    for (const row of await Udin.find({ clientId: client._id })) {
      await systemAudit((session) => row.softDelete("sample", { session }));
      removed += 1;
    }
    // the portal logins (P2-9a): closing the client must close the door
    for (const row of await ClientUser.find({ clientId: client._id })) {
      await systemAudit((session) => row.softDelete("sample", { session }));
      removed += 1;
    }
    await systemAudit((session) => client.softDelete("sample", { session }));
    removed += 1;
  }
  for (const person of people) {
    await systemAudit((session) => person.softDelete("sample", { session }));
    removed += 1;
  }

  /**
   * The bell is not audited and not soft-deleted — a nudge is not a record of
   * the firm's work — and some of these were addressed to the firm's own
   * partner, so they cannot be found by looking for sample people.
   */
  await Notification.deleteMany({
    title: { $in: SAMPLE_NOTIFICATIONS.map((n) => n.title) },
  });

  for (const row of SAMPLE_GROUPS) {
    const group = await ClientGroup.findOne({ name: row.name });
    if (!group) continue;
    await systemAudit((session) => group.softDelete("sample", { session }));
    removed += 1;
  }

  /**
   * The invented GSTIN comes off any branch still carrying it untouched. A
   * branch the firm has since given its real registration keeps it: the
   * comparison is against what this script wrote, not against "non-empty".
   */
  for (const branch of await Branch.find({})) {
    const stateCode = SAMPLE_BRANCH_STATE[branch.code];
    if (!stateCode) continue;
    if (branch.gstin !== makeGstin(stateCode, SAMPLE_FIRM_PAN)) continue;
    await systemAudit(async (session) => {
      branch.gstin = "";
      branch.updatedBy = "sample";
      await branch.save({ session });
    });
    removed += 1;
  }

  return { removed };
}

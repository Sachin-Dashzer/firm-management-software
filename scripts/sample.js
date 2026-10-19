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
import { hashPassword } from "../lib/crypto.js";
import { systemAudit } from "../lib/audit/system.js";
import { gstinCheckDigit } from "../lib/validators.js";
import { buildEngagement } from "../lib/engagements/create.js";
import { nextEngagementCode } from "../lib/engagements/code.js";
import { periodFor } from "../lib/engagements/period.js";

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
  { subscription: 0, back: 1, status: "Completed" },
  { subscription: 1, back: 0, status: "Awaiting documents" },
  { subscription: 2, back: 0, status: "Scheduled" },
  { subscription: 3, back: 0, status: "Under review" },
  { subscription: 4, back: 0, status: "In progress" },
  { subscription: 5, back: 0, status: "Awaiting documents" },
  { subscription: 6, back: 0, status: "In progress" },
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
 * Write the lot. Idempotent: people are matched on email and clients on PAN,
 * so running it twice adds nothing.
 *
 * @param {{ log?: (message: string) => void }} [options]
 */
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
            ...(row.status === "Completed"
              ? {
                  completedAt: now,
                  completedBy: String(subscription.defaultReviewerId),
                  checklist: (fields.checklist ?? []).map((item) => ({
                    ...item,
                    status: "Verified",
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

  return {
    people: SAMPLE_PEOPLE.length,
    clients: SAMPLE_CLIENTS.length,
    services: subscriptions.filter(Boolean).length,
    grants: SAMPLE_GRANTS.length,
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
    await systemAudit((session) => client.softDelete("sample", { session }));
    removed += 1;
  }
  for (const person of people) {
    await systemAudit((session) => person.softDelete("sample", { session }));
    removed += 1;
  }

  return { removed };
}

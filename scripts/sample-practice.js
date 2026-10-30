// @ts-check

/**
 * The second half of the sample dataset: the screens that `sample.js` leaves
 * empty.
 *
 * `sample.js` fills the spine — clients, work, files, bills. This fills the
 * rooms off it: the audit file and its working papers, the notice matters,
 * the certificates, the firm's own day (time, to-dos, leave), and the
 * registers nobody looks at until something has gone wrong (incidents, held
 * changes, upload requests).
 *
 * Same rules as its sibling: invented names only, every record reachable
 * from a sample client or a `@sample.phmgindia.test` colleague, so
 * `--drop-sample` finds the lot. It is called from `seedSample`, not run on
 * its own.
 */

import Branch from "../models/Branch.js";
import User from "../models/User.js";
import Client from "../models/Client.js";
import Engagement from "../models/Engagement.js";
import AuditFile from "../models/AuditFile.js";
import TrialBalance from "../models/TrialBalance.js";
import Sample from "../models/Sample.js";
import Notice from "../models/Notice.js";
import Certificate from "../models/Certificate.js";
import Udin from "../models/Udin.js";
import Todo from "../models/Todo.js";
import TimeEntry from "../models/TimeEntry.js";
import Leave from "../models/Leave.js";
import Incident from "../models/Incident.js";
import Announcement from "../models/Announcement.js";
import SavedView from "../models/SavedView.js";
import DocRequest from "../models/DocRequest.js";
import Procedure from "../models/Procedure.js";
import HeldChange from "../models/HeldChange.js";
import PeriodReason from "../models/PeriodReason.js";
import ClientService from "../models/ClientService.js";
import { systemAudit } from "../lib/audit/system.js";
import { startOfISTDay, financialYearLabel } from "../lib/dates.js";
import { buildAuditAreas } from "../lib/audit-studio/standards.js";
import { buildLedgerTests } from "../lib/audit-studio/tests.js";
import { buildReportAnswers } from "../lib/audit-studio/reporting.js";
import { draw, newSeed } from "../lib/practice/sampling.js";
import {
  CERTIFICATE_TYPES,
  paragraphsFor,
} from "../lib/practice/certificates.js";
import { nextCertificateNumber } from "../lib/practice/certificateNumber.js";
import { newRequestToken, hashRequestToken } from "../lib/storage/requests.js";

const DAY = 86_400_000;
/** Rupees in the tables below, paise in the database (CLAUDE.md rule 5). */
const r = (n) => Math.round(n * 100);
const back = (now, days) => new Date(now.getTime() - days * DAY);
const fwd = (now, days) => new Date(now.getTime() + days * DAY);

export async function seedPractice({ log = () => {} } = {}) {
  const now = new Date();
  const today = startOfISTDay(now);
  const fy = financialYearLabel(now);

  const people = await User.find({
    email: /@sample\.phmgindia\.test$/,
  }).lean();
  const partner = await User.findOne({ role: "partner" })
    .select("_id name icai")
    .lean();
  if (!partner || people.length === 0) return { skipped: true };

  const by = (needle) =>
    people.find((p) => p.email.startsWith(needle)) ?? people[0];
  const ritika = by("ritika");
  const harpreet = by("harpreet");
  const ankit = by("ankit");
  const shalini = by("shalini");
  const gurpreet = by("gurpreet");
  const ananya = by("ananya");

  const clients = await Client.find({ tags: "sample" })
    .select("_id legalName branchId")
    .lean();
  if (clients.length === 0) return { skipped: true };
  const client = (needle) =>
    clients.find((c) => c.legalName.toLowerCase().includes(needle)) ??
    clients[0];
  const jaiswal = client("jaiswal");
  const tandon = client("tandon");
  const kaur = client("kaur");
  const deshmukh = client("deshmukh");

  const branches = await Branch.find({}).select("_id code").lean();
  const branchByCode = new Map(branches.map((b) => [b.code, b._id]));

  const engagements = await Engagement.find({
    clientId: { $in: clients.map((c) => c._id) },
  })
    .select("_id code clientId branchId status periodLabel period")
    .lean();
  const work = (fragment) => engagements.find((e) => e.code.includes(fragment));
  const statAudit = work("STAT-AUD");
  const taxAudit = work("TAX-AUD");
  const gstWork = work("GSTR3B");

  /** @type {Record<string, number>} */
  const counts = {};
  const bump = (k, n = 1) => {
    counts[k] = (counts[k] ?? 0) + n;
  };

  // --- the audit file -----------------------------------------------------
  // One file, mid-fieldwork, with the programme partly ticked and three
  // exceptions on it: one still open, one explained and waiting on a
  // partner, one closed into a CARO clause. That spread is the whole point
  // of the screen.
  let auditFile = await (statAudit
    ? AuditFile.findOne({ engagementId: statAudit._id })
    : null);

  if (statAudit && !auditFile) {
    await systemAudit(async (session) => {
      const areas = buildAuditAreas();
      areas.slice(0, 3).forEach((area) => {
        area.questions.forEach((q, i) => {
          if (i < Math.ceil(area.questions.length * 0.8)) {
            q.done = true;
            q.doneAt = back(now, 12 - (i % 10));
            q.doneBy = String(ankit._id);
            q.doneByName = ankit.name;
          }
        });
      });
      if (areas[3]) {
        areas[3].questions.slice(0, 2).forEach((q) => {
          q.done = true;
          q.doneAt = back(now, 5);
          q.doneBy = String(ananya._id);
          q.doneByName = ananya.name;
          q.note = "Traced to the purchase register; no difference.";
        });
      }

      const tests = buildLedgerTests();
      tests.slice(0, 4).forEach((test, i) => {
        test.ranAt = back(now, 9 - i);
        test.ranBy = String(ankit._id);
        test.ranByName = ankit.name;
        test.population = "Tally export, 01-04 to 30-09";
        test.wholePopulation = true;
        test.flags = i === 1 ? 3 : 0;
        test.note =
          i === 1
            ? "Three journal entries posted after the cut-off date."
            : "Nothing to report.";
      });

      const [file] = await AuditFile.create(
        [
          {
            engagementId: statAudit._id,
            clientId: statAudit.clientId,
            branchId: statAudit.branchId,
            stage: "Fieldwork",
            stageHistory: [
              {
                at: back(now, 40),
                from: "Acceptance",
                to: "Planning",
                byId: String(ritika._id),
                byName: ritika.name,
                reason: "Engagement letter signed, independence confirmed.",
              },
              {
                at: back(now, 28),
                from: "Planning",
                to: "Risk",
                byId: String(ritika._id),
                byName: ritika.name,
                reason: "Materiality set, risk assessment discussed.",
              },
              {
                at: back(now, 18),
                from: "Risk",
                to: "Fieldwork",
                byId: String(ankit._id),
                byName: ankit.name,
                reason: "Books received for the full year.",
              },
            ],
            materialityPaise: r(1_850_000),
            materialityBasis:
              "1% of turnover (₹18.46 crore), rounded. Turnover chosen because the company is profitable only thinly, so a profit-based figure would swing year to year.",
            performanceMaterialityPaise: r(1_200_000),
            trivialPaise: r(92_500),
            areas,
            tests,
            reportAnswers: buildReportAnswers(),
            exceptions: [
              {
                area: "purchases",
                test: "Cut-off testing",
                what: "Three purchase invoices dated 02-04 were posted into the year under audit; the goods inward register shows receipt on 03-04.",
                risk: "High",
                amountPaise: r(1_420_000),
                state: "Open",
                raisedBy: String(ankit._id),
                raisedByName: ankit.name,
                createdAt: back(now, 8),
                trail: [
                  {
                    at: back(now, 8),
                    from: "",
                    to: "Open",
                    byId: String(ankit._id),
                    byName: ankit.name,
                    reason: "Raised from cut-off testing.",
                  },
                ],
              },
              {
                area: "trade-receivables",
                test: "Balance confirmation",
                what: "Confirmation from Bhatia Traders disagrees by ₹2,86,400; the client says a credit note was issued in October.",
                risk: "Medium",
                amountPaise: r(286_400),
                state: "Explained",
                explanation:
                  "Credit note CN/26-27/0041 dated 06-10 produced. Agrees to the difference, and the subsequent receipt is in the bank statement.",
                raisedBy: String(ananya._id),
                raisedByName: ananya.name,
                createdAt: back(now, 6),
                trail: [
                  {
                    at: back(now, 6),
                    from: "",
                    to: "Open",
                    byId: String(ananya._id),
                    byName: ananya.name,
                    reason: "Confirmation difference.",
                  },
                  {
                    at: back(now, 3),
                    from: "Open",
                    to: "Explained",
                    byId: String(ankit._id),
                    byName: ankit.name,
                    reason: "Credit note and bank credit seen.",
                  },
                ],
              },
              {
                area: "employee-benefits",
                test: "Statutory dues",
                what: "Provident fund for August was deposited on 22-09, eight days after the due date. Interest was not provided.",
                risk: "Low",
                amountPaise: r(14_780),
                state: "Verified",
                explanation: "Interest of ₹14,780 provided on our advice.",
                reportEffect: "CARO clause (vii)(a)",
                reportWording:
                  "Provident fund dues for August were remitted with a delay of eight days; the amount has since been paid with interest.",
                raisedBy: String(shalini._id),
                raisedByName: shalini.name,
                createdAt: back(now, 14),
                trail: [
                  {
                    at: back(now, 14),
                    from: "",
                    to: "Open",
                    byId: String(shalini._id),
                    byName: shalini.name,
                    reason: "Challan dates checked.",
                  },
                  {
                    at: back(now, 10),
                    from: "Open",
                    to: "Explained",
                    byId: String(shalini._id),
                    byName: shalini.name,
                    reason: "Client agreed to provide the interest.",
                  },
                  {
                    at: back(now, 7),
                    from: "Explained",
                    to: "Verified",
                    byId: String(partner._id),
                    byName: partner.name,
                    reason:
                      "Provision seen in the books. Goes into CARO (vii)(a).",
                  },
                ],
              },
            ],
            createdBy: "sample",
            updatedBy: "sample",
          },
        ],
        { session, ordered: true },
      );
      auditFile = file;
    });
    bump("auditFiles");
    log(`audit   file opened on ${statAudit.code} — Fieldwork, 3 exceptions`);
  }

  // --- the trial balance --------------------------------------------------
  // Thirty-eight ledgers, most mapped, three left unmapped for somebody to
  // decide, and three adjustments — proposed, passed and unadjusted, which
  // is what the misstatement summary has to be able to show.
  const TB_LINES = [
    [
      "Equity share capital",
      "Capital",
      -25_000_000,
      "share-capital",
      "confirmed",
    ],
    ["Securities premium", "Capital", -12_000_000, "reserves", "confirmed"],
    [
      "Surplus in profit and loss",
      "Capital",
      -8_412_300,
      "reserves",
      "confirmed",
    ],
    [
      "Term loan — Punjab National Bank",
      "Loans",
      -31_500_000,
      "long-borrowings",
      "confirmed",
    ],
    [
      "Cash credit — Punjab National Bank",
      "Loans",
      -18_240_000,
      "short-borrowings",
      "confirmed",
    ],
    [
      "Sundry creditors — goods",
      "Current liabilities",
      -22_860_400,
      "trade-payables",
      "confirmed",
    ],
    [
      "Sundry creditors — expenses",
      "Current liabilities",
      -3_118_900,
      "trade-payables",
      "remembered",
    ],
    [
      "Statutory dues payable",
      "Current liabilities",
      -1_842_600,
      "other-current-liabilities",
      "confirmed",
    ],
    [
      "Provision for gratuity",
      "Provisions",
      -2_460_000,
      "long-provisions",
      "confirmed",
    ],
    [
      "Provision for taxation",
      "Provisions",
      -1_980_000,
      "short-provisions",
      "confirmed",
    ],
    [
      "Factory land and building",
      "Fixed assets",
      41_200_000,
      "ppe",
      "confirmed",
    ],
    ["Plant and machinery", "Fixed assets", 58_640_000, "ppe", "confirmed"],
    [
      "Accumulated depreciation",
      "Fixed assets",
      -27_318_400,
      "ppe",
      "confirmed",
    ],
    ["Computer software", "Fixed assets", 842_000, "intangibles", "suggested"],
    [
      "Security deposit — electricity board",
      "Loans and advances",
      1_240_000,
      "long-loans-advances",
      "remembered",
    ],
    [
      "Raw material — steel billets",
      "Inventories",
      19_480_600,
      "inventories",
      "confirmed",
    ],
    ["Finished goods", "Inventories", 12_206_300, "inventories", "confirmed"],
    [
      "Sundry debtors — within six months",
      "Current assets",
      28_412_700,
      "trade-receivables",
      "confirmed",
    ],
    [
      "Sundry debtors — over six months",
      "Current assets",
      4_186_200,
      "trade-receivables",
      "suggested",
    ],
    ["HDFC Bank — current account", "Bank", 6_842_150, "cash", "confirmed"],
    ["Cash in hand", "Bank", 184_300, "cash", "confirmed"],
    [
      "GST input credit",
      "Current assets",
      2_941_800,
      "other-current-assets",
      "remembered",
    ],
    ["Prepaid insurance", "Current assets", 318_400, "", "unmapped"],
    ["Sales — domestic", "Income", -184_620_000, "revenue", "confirmed"],
    ["Scrap sales", "Income", -2_148_000, "other-income", "suggested"],
    [
      "Interest on fixed deposit",
      "Income",
      -412_600,
      "other-income",
      "confirmed",
    ],
    [
      "Purchases — raw material",
      "Expenses",
      128_460_000,
      "materials",
      "confirmed",
    ],
    [
      "Change in finished goods",
      "Expenses",
      -1_842_000,
      "stock-change",
      "confirmed",
    ],
    [
      "Salaries and wages",
      "Expenses",
      18_412_000,
      "employee-benefits",
      "confirmed",
    ],
    [
      "Contribution to provident fund",
      "Expenses",
      1_684_000,
      "employee-benefits",
      "confirmed",
    ],
    [
      "Interest on term loan",
      "Expenses",
      3_942_000,
      "finance-costs",
      "confirmed",
    ],
    ["Bank charges", "Expenses", 184_600, "finance-costs", "remembered"],
    ["Depreciation", "Expenses", 6_418_000, "depreciation", "confirmed"],
    ["Power and fuel", "Expenses", 8_246_000, "other-expenses", "confirmed"],
    [
      "Repairs to machinery",
      "Expenses",
      2_418_600,
      "other-expenses",
      "confirmed",
    ],
    ["Freight outward", "Expenses", 1_942_300, "", "unmapped"],
    ["Legal and professional", "Expenses", 684_200, "", "unmapped"],
    ["Current tax", "Tax", 1_980_000, "tax", "confirmed"],
  ];

  if (statAudit && auditFile) {
    const already = await TrialBalance.findOne({ engagementId: statAudit._id })
      .select("_id")
      .lean();
    if (!already) {
      await systemAudit(async (session) => {
        await TrialBalance.create(
          [
            {
              engagementId: statAudit._id,
              clientId: statAudit.clientId,
              branchId: statAudit.branchId,
              fyLabel: statAudit.periodLabel || fy,
              source: "Tally Prime export — Jaiswal Steels, 01-04 to 31-03",
              importedAt: back(now, 16),
              importedBy: String(ankit._id),
              importedByName: ankit.name,
              lines: TB_LINES.map(
                ([ledger, group, amount, headKey, status]) => ({
                  ledger,
                  group,
                  closingPaise: r(Number(amount)),
                  headKey,
                  status,
                  ...(status === "confirmed" || status === "remembered"
                    ? { mappedBy: String(ankit._id), mappedByName: ankit.name }
                    : {}),
                }),
              ),
              adjustments: [
                {
                  description:
                    "Reverse three purchase invoices posted before the goods were received",
                  amountPaise: r(1_420_000),
                  headKey: "materials",
                  counterHeadKey: "trade-payables",
                  state: "Proposed",
                  source: "Cut-off testing exception",
                  byId: String(ankit._id),
                  byName: ankit.name,
                  at: back(now, 5),
                },
                {
                  description:
                    "Provide interest on the delayed provident fund dues",
                  amountPaise: r(14_780),
                  headKey: "finance-costs",
                  counterHeadKey: "other-current-liabilities",
                  state: "Passed in books",
                  source: "Statutory dues exception",
                  byId: String(shalini._id),
                  byName: shalini.name,
                  at: back(now, 7),
                },
                {
                  description:
                    "Write slow-moving finished goods down to net realisable value",
                  amountPaise: r(482_000),
                  headKey: "stock-change",
                  counterHeadKey: "inventories",
                  state: "Unadjusted",
                  source: "Inventory ageing review",
                  byId: String(ritika._id),
                  byName: ritika.name,
                  at: back(now, 4),
                },
              ],
              createdBy: "sample",
              createdByName: "Sample data",
              updatedBy: "sample",
            },
          ],
          { session, ordered: true },
        );
      });
      bump("trialBalances");
      log(
        `tb      ${TB_LINES.length} ledgers on ${statAudit.code}, 3 adjustments`,
      );
    }
  }

  // --- working papers: two samples ----------------------------------------
  // One drawn and partly vouched, one designed and not drawn. The second is
  // there because an empty grid is a state the screen has to survive.
  const PURCHASE_POPULATION = [
    ["PI/4812", "Bharat Steel Rolling Mills", "12-04", 4_862_400],
    ["PI/4867", "Garg Alloys Private Limited", "28-04", 1_248_600],
    ["PI/4903", "Himalaya Scrap Traders", "09-05", 318_200],
    ["PI/4951", "Bharat Steel Rolling Mills", "22-05", 5_412_800],
    ["PI/5002", "Nandini Logistics", "03-06", 184_600],
    ["PI/5048", "Garg Alloys Private Limited", "17-06", 2_186_400],
    ["PI/5097", "Vedika Engineering Works", "29-06", 842_300],
    ["PI/5143", "Bharat Steel Rolling Mills", "11-07", 6_184_200],
    ["PI/5188", "Himalaya Scrap Traders", "24-07", 412_800],
    ["PI/5231", "Suryavanshi Refractories", "06-08", 1_842_600],
    ["PI/5276", "Garg Alloys Private Limited", "19-08", 2_418_900],
    ["PI/5318", "Nandini Logistics", "31-08", 246_300],
    ["PI/5364", "Bharat Steel Rolling Mills", "12-09", 7_248_600],
    ["PI/5409", "Vedika Engineering Works", "25-09", 1_086_400],
    ["PI/5452", "Suryavanshi Refractories", "08-10", 2_142_800],
    ["PI/5497", "Himalaya Scrap Traders", "21-10", 386_900],
    ["PI/5538", "Garg Alloys Private Limited", "02-11", 1_948_200],
    ["PI/5581", "Bharat Steel Rolling Mills", "15-11", 5_862_400],
    ["PI/5624", "Nandini Logistics", "27-11", 218_400],
    ["PI/5668", "Vedika Engineering Works", "09-12", 1_412_600],
    ["PI/5712", "Suryavanshi Refractories", "22-12", 2_684_200],
    ["PI/5756", "Himalaya Scrap Traders", "04-01", 462_800],
    ["PI/5801", "Garg Alloys Private Limited", "16-01", 2_248_600],
    ["PI/5846", "Bharat Steel Rolling Mills", "28-01", 6_482_400],
    ["PI/5890", "Nandini Logistics", "10-02", 194_800],
    ["PI/5934", "Vedika Engineering Works", "22-02", 1_184_600],
    ["PI/5978", "Suryavanshi Refractories", "06-03", 2_862_400],
    ["PI/6021", "Himalaya Scrap Traders", "18-03", 418_600],
    ["PI/6064", "Garg Alloys Private Limited", "27-03", 2_086_400],
    ["PI/6098", "Bharat Steel Rolling Mills", "31-03", 8_412_600],
  ];
  const ATTRIBUTES = [
    "Invoice seen",
    "Goods received",
    "Approved",
    "Correct period",
    "Paid as recorded",
  ];

  if (statAudit && auditFile) {
    const have = await Sample.countDocuments({ engagementId: statAudit._id });
    if (have === 0) {
      const rows = PURCHASE_POPULATION.map(([ref, party, on, amount]) => ({
        ref,
        party,
        on,
        amountPaise: r(Number(amount)),
      }));
      const seed = newSeed();
      const keyAbovePaise = r(5_000_000);
      const result = draw({
        rows,
        method: "monetary-unit",
        size: 12,
        seed,
        keyAbovePaise,
      });
      const vouched = Math.floor(result.items.length * 0.66);

      await systemAudit(async (session) => {
        await Sample.create(
          [
            {
              engagementId: statAudit._id,
              clientId: statAudit.clientId,
              branchId: statAudit.branchId,
              ref: "WP/3.1",
              area: "PUR",
              name: "Purchases — vouching of raw material invoices",
              population:
                "Purchase register, 01-04 to 31-03, raw material ledgers only",
              reconciledToTb: true,
              entries: result.populationCount,
              valuePaise: result.populationPaise,
              method: "monetary-unit",
              confidence: "95%",
              tolerablePaise: r(1_200_000),
              basis:
                "Performance materiality of ₹12,00,000. Purchases is the largest expense and the cut-off risk sits here, so the sample is drawn by value.",
              keyAbovePaise,
              size: 12,
              seed,
              intervalPaise: Math.round(result.interval),
              drawNote: result.note,
              drawnAt: back(now, 10),
              attributes: ATTRIBUTES,
              items: result.items.map((row, index) => ({
                no: index + 1,
                ref: row.ref,
                party: row.party,
                on: row.on,
                amountPaise: row.amountPaise,
                key: row.key,
                keyReason: row.keyReason,
                // vouched down to two thirds of the way, with one failure
                // on the cut-off column — a clean grid teaches nothing
                marks:
                  index < vouched
                    ? ATTRIBUTES.map((_, col) =>
                        index === 2 && col === 3 ? 0 : 1,
                      )
                    : ATTRIBUTES.map(() => null),
                ...(index === 2
                  ? {
                      note: "Invoice dated 02-04, goods inward 03-04. Raised as a cut-off exception.",
                      errorPaise: r(1_420_000),
                    }
                  : {}),
                ...(index < vouched
                  ? {
                      markedBy: String(ankit._id),
                      markedByName: ankit.name,
                      markedAt: back(now, 9 - (index % 8)),
                    }
                  : {}),
              })),
              createdBy: "sample",
              createdByName: ankit.name,
              updatedBy: "sample",
            },
            {
              engagementId: statAudit._id,
              clientId: statAudit.clientId,
              branchId: statAudit.branchId,
              ref: "WP/5.2",
              area: "REP",
              name: "Repairs to machinery — capital or revenue",
              population: "Repairs to machinery ledger, 01-04 to 31-03",
              reconciledToTb: null,
              method: "random",
              confidence: "90%",
              tolerablePaise: r(600_000),
              basis:
                "Designed but not yet drawn: the client is still extracting the ledger with narrations.",
              keyAbovePaise: r(500_000),
              size: 15,
              seed: newSeed(),
              attributes: [
                "Bill seen",
                "Nature of work described",
                "No addition to capacity",
                "Correctly classified",
              ],
              createdBy: "sample",
              createdByName: ananya.name,
              updatedBy: "sample",
            },
          ],
          { session, ordered: true },
        );
      });
      bump("samples", 2);
      log(
        `paper   2 working papers: ${result.items.length} items drawn on WP/3.1`,
      );
    }
  }

  // --- notice matters -----------------------------------------------------
  const NOTICES = [
    {
      client: jaiswal,
      law: "GST",
      kind: "SCN74",
      section: "74(1)",
      period: "2021-22",
      din: "DIN-GST-2026-0084127",
      authority: "Assistant Commissioner, CGST Division V, Noida",
      noticeDaysAgo: 96,
      servedDaysAgo: 92,
      annualReturnDue: new Date("2022-12-31T00:00:00+05:30"),
      issue:
        "Input tax credit of ₹18,42,600 alleged to have been taken on invoices from a supplier whose registration was cancelled retrospectively.",
      stakePaise: r(1_842_600),
      stage: "Hearing",
      risk: "High",
      assignee: () => ritika,
      plainWords:
        "The department says we claimed credit on bills from a dealer whose registration was cancelled later, going back in time. We have the bills, the bank payments and the e-way bills, and the dealer was registered on every date we bought from him. The law does not make the buyer answer for what the department does to the seller afterwards.",
      submissions: [
        {
          type: "Reply",
          dueDaysAgo: 62,
          filedDaysAgo: 64,
          ackNo: "ARN-AD0909260041XY",
          note: "Reply with 142 pages of annexures.",
          preparedByName: () => ankit.name,
          filedByName: () => ritika.name,
        },
        {
          type: "Additional reply",
          dueDaysAgo: 18,
          filedDaysAgo: 19,
          ackNo: "ARN-AD0910260118ZK",
          note: "The supplier's GSTR-1 extracts for all four quarters.",
          preparedByName: () => ankit.name,
          filedByName: () => ritika.name,
        },
      ],
      hearings: [
        {
          daysAgo: 34,
          mode: "Video",
          attendedByName: () => ritika.name,
          outcome:
            "Adjourned at the officer's request; asked for the supplier's returns.",
          adjourned: true,
          adjournmentReason: "Officer on leave",
          adjournedBy: "Department",
        },
        {
          daysAgo: 11,
          mode: "In person",
          attendedByName: () => ritika.name,
          outcome:
            "Heard on merits. The officer accepted the e-way bills and wants the transporter's confirmation.",
        },
        { inDays: 9, mode: "In person" },
      ],
      grounds: [
        {
          point:
            "Credit denied because the supplier's registration was cancelled retrospectively",
          ourGround:
            "The buyer's entitlement is tested on the date of supply. Section 16 carries no condition about what happens to the supplier's registration afterwards.",
          evidence:
            "GST portal search results for each invoice date (Annexure 4)",
          settled: true,
        },
        {
          point: "Alleged suppression, invoking the five-year period",
          ourGround:
            "Every invoice appeared in GSTR-2A and the credit was shown in GSTR-3B. Nothing was concealed, so section 74 does not apply — at most this is section 73.",
          evidence: "GSTR-2A and 3B comparison (Annexure 7)",
          settled: false,
        },
        {
          point: "Goods allegedly not received",
          ourGround:
            "The e-way bills, weighbridge slips and goods inward register all tally with the invoices.",
          evidence: "Annexures 9 to 11",
          settled: true,
        },
      ],
      paperBook: [
        { name: "Show cause notice dated 26-07", order: 1, pages: "1-14" },
        { name: "Our reply dated 29-08", order: 2, pages: "15-42" },
        {
          name: "Annexure 4 — portal search results",
          order: 3,
          pages: "43-61",
        },
        {
          name: "Annexure 7 — 2A against 3B reconciliation",
          order: 4,
          pages: "62-88",
        },
        {
          name: "Annexures 9 to 11 — e-way bills and weighbridge slips",
          order: 5,
          pages: "89-142",
        },
      ],
    },
    {
      client: tandon,
      law: "Income tax",
      kind: "IT148A",
      section: "148A(b)",
      period: "AY 2022-23",
      din: "ITBA/AST/S/148A/2026-27/10428",
      authority: "Income Tax Officer, Ward 42(1), Delhi",
      noticeDaysAgo: 24,
      servedDaysAgo: 22,
      issue:
        "Information that ₹62,40,000 of export remittances were not offered to tax. The amount is the FIRC total already shown as turnover.",
      stakePaise: r(6_240_000),
      stage: "Reply",
      risk: "Medium",
      assignee: () => harpreet,
      plainWords:
        "The department has picked up our export receipts from the bank and thinks they are income we never declared. They are our ordinary export sales, already inside the turnover in the return. We will show the FIRCs against the invoices and the turnover figure in the audited accounts.",
      submissions: [
        {
          type: "Reply",
          dueDaysAgo: -6,
          note: "Being drafted. The FIRC-to-invoice reconciliation is half done.",
          preparedByName: () => harpreet.name,
        },
      ],
      grounds: [
        {
          point: "Export remittances treated as undisclosed income",
          ourGround:
            "Every remittance matches an export invoice already inside the declared turnover. A receipt is not a second income.",
          evidence:
            "FIRC and invoice reconciliation, audited turnover (Annexure 1)",
          settled: false,
        },
      ],
    },
    {
      client: kaur,
      law: "GST",
      kind: "ASMT10",
      section: "61",
      period: "2023-24",
      din: "DIN-GST-2026-0071204",
      authority: "Superintendent, CGST Range IV, Ludhiana",
      noticeDaysAgo: 168,
      servedDaysAgo: 166,
      issue:
        "Difference of ₹1,84,200 between the GSTR-3B output tax and GSTR-1 for three months.",
      stakePaise: r(184_200),
      stage: "Closed",
      risk: "Low",
      assignee: () => gurpreet,
      closedDaysAgo: 118,
      closedNote:
        "The difference was a credit note reported in GSTR-1 in a later month. Explained in ASMT-11; no further notice received.",
      submissions: [
        {
          type: "Reply",
          dueDaysAgo: 136,
          filedDaysAgo: 141,
          ackNo: "ARN-AD0306260028QW",
          note: "ASMT-11 with the credit note working.",
          preparedByName: () => gurpreet.name,
          filedByName: () => gurpreet.name,
        },
      ],
      grounds: [
        {
          point: "GSTR-3B against GSTR-1 difference",
          ourGround:
            "A credit note of ₹1,84,200 was reported in the following month's GSTR-1. The annual figures agree.",
          evidence: "Month-wise 1 against 3B statement",
          settled: true,
        },
      ],
    },
  ];

  for (const row of NOTICES) {
    if (!row.client) continue;
    if (await Notice.findOne({ din: row.din }).select("_id").lean()) continue;
    const assignee = row.assignee();
    await systemAudit(async (session) => {
      await Notice.create(
        [
          {
            clientId: row.client._id,
            branchId: row.client.branchId,
            law: row.law,
            kind: row.kind,
            section: row.section,
            period: row.period,
            din: row.din,
            authority: row.authority,
            noticeDate: back(now, row.noticeDaysAgo),
            servedOn: back(now, row.servedDaysAgo),
            annualReturnDue: row.annualReturnDue ?? null,
            issue: row.issue,
            stakePaise: row.stakePaise,
            stage: row.stage,
            risk: row.risk,
            partnerId: String(partner._id),
            assigneeId: String(assignee._id),
            plainWords: row.plainWords ?? "",
            submissions: (row.submissions ?? []).map((s) => ({
              type: s.type,
              dueDate: back(now, s.dueDaysAgo),
              filedOn: s.filedDaysAgo ? back(now, s.filedDaysAgo) : null,
              ackNo: s.ackNo ?? "",
              note: s.note ?? "",
              preparedByName: s.preparedByName ? s.preparedByName() : "",
              filedByName: s.filedByName ? s.filedByName() : "",
            })),
            hearings: (row.hearings ?? []).map((h) => ({
              on: h.inDays ? fwd(now, h.inDays) : back(now, h.daysAgo),
              heldOn: h.daysAgo ? back(now, h.daysAgo) : null,
              mode: h.mode ?? "",
              attendedByName: h.attendedByName ? h.attendedByName() : "",
              outcome: h.outcome ?? "",
              adjourned: Boolean(h.adjourned),
              adjournmentReason: h.adjournmentReason ?? "",
              adjournedBy: h.adjournedBy ?? "",
            })),
            grounds: row.grounds ?? [],
            paperBook: row.paperBook ?? [],
            closedAt: row.closedDaysAgo ? back(now, row.closedDaysAgo) : null,
            closedNote: row.closedNote ?? "",
            createdBy: "sample",
            updatedBy: "sample",
          },
        ],
        { session, ordered: true },
      );
    });
    bump("notices");
    log(`matter  ${row.kind} · ${row.client.legalName} — ${row.stage}`);
  }

  // --- certificates -------------------------------------------------------
  const CERTS = [
    {
      type: CERTIFICATE_TYPES.find((t) => t.key === "net-worth"),
      client: jaiswal,
      level: "Reasonable",
      addressee: "The Branch Manager, Punjab National Bank, Sector 18, Noida",
      purpose: "renewal of the working capital limits for 2026-27",
      asOnDaysAgo: 212,
      figurePaise: r(45_412_300),
      figureBasis:
        "Share capital ₹2,50,00,000, securities premium ₹1,20,00,000 and surplus ₹84,12,300, with nothing to deduct. Taken from the audited balance sheet.",
      sign: true,
      udin: "26048219ABCDEF4821",
    },
    {
      type: CERTIFICATE_TYPES.find((t) => t.key === "turnover"),
      client: tandon,
      level: "Limited",
      addressee: "The Director General of Foreign Trade, New Delhi",
      purpose: "an application under the RoDTEP scheme",
      asOnDaysAgo: 18,
      figurePaise: r(18_642_000),
      figureBasis:
        "Export turnover per the GSTR-1 summary for the year, agreed to the FIRC register.",
      sign: false,
    },
  ];

  for (const row of CERTS) {
    if (!row.type || !row.client) continue;
    const already = await Certificate.findOne({
      clientId: row.client._id,
      type: row.type.key,
    })
      .select("_id")
      .lean();
    if (already) continue;

    await systemAudit(async (session) => {
      const number = await nextCertificateNumber(
        String(row.client.branchId),
        session,
      );
      const paragraphs = paragraphsFor(row.type, row.level).map((p) => ({
        ...p,
        text: p.text || paragraphTextFor(p.key, row),
      }));

      if (row.sign) {
        await Udin.create(
          [
            {
              udin: row.udin,
              clientId: row.client._id,
              branchId: row.client.branchId,
              memberId: partner._id,
              membershipNo: partner.icai?.membershipNo ?? "",
              documentType: row.type.name,
              generatedOn: back(now, row.asOnDaysAgo - 4),
              note: "Generated on the ICAI portal for the bank certificate.",
              createdBy: "sample",
              updatedBy: "sample",
            },
          ],
          { session, ordered: true },
        );
        bump("udins");
      }

      await Certificate.create(
        [
          {
            number,
            clientId: row.client._id,
            branchId: row.client.branchId,
            type: row.type.key,
            typeName: row.type.name,
            addressee: row.addressee,
            purpose: row.purpose,
            level: row.level,
            asOn: back(now, row.asOnDaysAgo),
            paragraphs,
            evidence: (row.type.evidence ?? []).map((what, i) => ({
              what,
              held: row.sign ? true : i < 1,
              note: row.sign ? "On file." : "",
            })),
            figurePaise: row.figurePaise,
            figureBasis: row.figureBasis,
            ...(row.sign
              ? {
                  signerId: String(partner._id),
                  signerName: partner.name,
                  signerMembershipNo: partner.icai?.membershipNo ?? "",
                  udin: row.udin,
                  signedAt: back(now, row.asOnDaysAgo - 4),
                  signedBy: String(partner._id),
                  signedByName: partner.name,
                }
              : {}),
            createdBy: "sample",
            updatedBy: "sample",
          },
        ],
        { session, ordered: true },
      );
    });
    bump("certificates");
    log(
      `cert    ${row.type.name} · ${row.client.legalName} — ${row.sign ? "signed" : "draft"}`,
    );
  }

  // --- the firm's own day: to-dos -----------------------------------------
  const TODOS = [
    {
      owner: ankit,
      title: "Chase Jaiswal for the stock statement as at 30-09",
      client: jaiswal,
      dueDays: -2,
    },
    {
      owner: ankit,
      title: "Ask the transporter for a confirmation letter",
      client: jaiswal,
      dueDays: 3,
      note: "The officer asked for it at the last hearing.",
    },
    {
      owner: ritika,
      title: "Read the draft reply on the Tandon 148A matter",
      client: tandon,
      dueDays: 1,
    },
    {
      owner: ritika,
      title: "Partner review: Jaiswal purchases working paper",
      client: jaiswal,
      dueDays: 4,
    },
    {
      owner: harpreet,
      title: "FIRC to invoice reconciliation for Tandon",
      client: tandon,
      dueDays: -1,
    },
    {
      owner: shalini,
      title: "File GSTR-1 for Kaur Brothers",
      client: kaur,
      dueDays: 2,
    },
    {
      owner: gurpreet,
      title: "Collect Deshmukh's Form 16 and interest certificates",
      client: deshmukh,
      dueDays: 6,
    },
    {
      owner: ananya,
      title: "Tie the repairs ledger to the trial balance",
      client: jaiswal,
      dueDays: 0,
    },
    {
      owner: ankit,
      title: "Send the Jaiswal engagement letter for signature",
      client: jaiswal,
      dueDays: -9,
      done: 7,
    },
    {
      owner: shalini,
      title: "Reconcile the GST credit for September",
      client: kaur,
      dueDays: -14,
      done: 13,
    },
    {
      owner: ritika,
      title: "Book the CPE seminar on Ind AS",
      dueDays: -20,
      done: 18,
    },
  ];

  for (const row of TODOS) {
    if (await Todo.findOne({ ownerId: row.owner._id, title: row.title }).lean())
      continue;
    await systemAudit(async (session) => {
      await Todo.create(
        [
          {
            title: row.title,
            ownerId: row.owner._id,
            branchId: row.client?.branchId ?? row.owner.branchIds?.[0] ?? null,
            dueDate: fwd(today, row.dueDays),
            clientId: row.client?._id ?? null,
            done: Boolean(row.done),
            doneAt: row.done ? back(now, row.done) : null,
            doneBy: row.done ? String(row.owner._id) : null,
            doneByName: row.done ? row.owner.name : "",
            note: row.note ?? "",
            createdBy: "sample",
            createdByName: "Sample data",
            updatedBy: "sample",
          },
        ],
        { session, ordered: true },
      );
    });
    bump("todos");
  }
  log(`todo    ${counts.todos ?? 0} on people's lists`);

  // --- the firm's own day: time -------------------------------------------
  // Three weeks of it, so the week view, the day view and the unbilled work
  // report all have something to add up. Not everybody logs everything
  // every day, which is the realistic part.
  const TIME_SHAPE = [
    {
      person: ankit,
      work: statAudit,
      what: "Purchases vouching",
      minutes: 330,
    },
    {
      person: ankit,
      work: statAudit,
      what: "Cut-off testing and exception write-up",
      minutes: 240,
    },
    { person: ankit, work: gstWork, what: "GSTR-3B working", minutes: 150 },
    { person: ankit, what: "Firm meeting", minutes: 60 },
    {
      person: ananya,
      work: statAudit,
      what: "Trial balance mapping",
      minutes: 300,
    },
    {
      person: ananya,
      work: statAudit,
      what: "Debtors confirmations",
      minutes: 210,
    },
    {
      person: ananya,
      what: "Reading: SA 505 on external confirmations",
      minutes: 90,
    },
    {
      person: shalini,
      work: gstWork,
      what: "GSTR-1 upload and reconciliation",
      minutes: 270,
    },
    { person: shalini, what: "Client calls", minutes: 120 },
    {
      person: harpreet,
      work: taxAudit,
      what: "Tax audit annexures",
      minutes: 360,
    },
    { person: harpreet, what: "Drafting the 148A reply", minutes: 180 },
    {
      person: ritika,
      work: statAudit,
      what: "Review of the audit file",
      minutes: 150,
    },
    { person: ritika, what: "Partner review and sign-off queue", minutes: 90 },
    { person: gurpreet, what: "Collecting salary documents", minutes: 240 },
  ];

  const haveTime = await TimeEntry.countDocuments({
    userId: { $in: people.map((p) => p._id) },
  });
  if (haveTime === 0) {
    const entries = [];
    for (let dayAgo = 20; dayAgo >= 0; dayAgo -= 1) {
      const on = fwd(today, -dayAgo);
      if (on.getDay() === 0) continue; // the firm does not sit on Sunday
      for (const shape of TIME_SHAPE) {
        if ((dayAgo + shape.minutes) % 3 === 0) continue;
        const wobble = ((dayAgo * 37 + shape.minutes) % 5) - 2;
        entries.push({
          userId: shape.person._id,
          branchId: shape.person.branchIds?.[0] ?? null,
          on,
          minutes: Math.max(30, Math.round(shape.minutes / 2 + wobble * 15)),
          engagementId: shape.work?._id ?? null,
          clientId: shape.work?.clientId ?? null,
          what: shape.what,
          createdBy: "sample",
          updatedBy: "sample",
        });
      }
    }
    await systemAudit(async (session) => {
      await TimeEntry.create(entries, { session, ordered: true });
    });
    bump("timeEntries", entries.length);
    log(`time    ${entries.length} entries over the last three weeks`);
  }

  // --- the firm's own day: leave ------------------------------------------
  const LEAVES = [
    {
      person: shalini,
      cover: gurpreet,
      fromDays: -12,
      toDays: -8,
      kind: "Leave",
      note: "Brother's wedding in Jalandhar.",
      approved: 14,
    },
    {
      person: ananya,
      cover: ankit,
      fromDays: 2,
      toDays: 16,
      kind: "Exam leave",
      note: "CA Inter, group II.",
      approved: 6,
    },
    {
      person: ankit,
      cover: shalini,
      fromDays: -1,
      toDays: 1,
      kind: "Leave",
      note: "Fever.",
    },
    {
      person: harpreet,
      cover: ritika,
      fromDays: 24,
      toDays: 28,
      kind: "Leave",
      note: "Family trip, tickets booked.",
      approved: 2,
    },
  ];
  for (const row of LEAVES) {
    const from = fwd(today, row.fromDays);
    if (await Leave.findOne({ userId: row.person._id, from }).lean()) continue;
    await systemAudit(async (session) => {
      await Leave.create(
        [
          {
            userId: row.person._id,
            from,
            to: fwd(today, row.toDays),
            kind: row.kind,
            coverId: row.cover._id,
            note: row.note,
            ...(row.approved
              ? {
                  approvedBy: String(partner._id),
                  approvedByName: partner.name,
                  approvedAt: back(now, row.approved),
                }
              : {}),
            createdBy: "sample",
            updatedBy: "sample",
          },
        ],
        { session, ordered: true },
      );
    });
    bump("leaves");
  }
  log(`leave   ${counts.leaves ?? 0} entries, one of them still unapproved`);

  // --- the register nobody reads until something has gone wrong -----------
  const INCIDENTS = [
    {
      summary: "Laptop with client files left in a taxi",
      severity: "Reportable",
      status: "Contained",
      occurredDays: 9,
      detail:
        "An audit laptop was left in a taxi between the Noida office and a client's premises. The disk was encrypted and the session was signed out. The driver returned it the next morning.",
      personalData: true,
      clientsAffected: 3,
      action:
        "Password reset on the account, remote sign-out of every session, disk encryption confirmed. Device returned and checked.",
      notified:
        "Partner informed the same evening. The three clients informed in writing.",
      notifiedDays: 8,
    },
    {
      summary: "Phishing email imitating the firm's invoice address",
      severity: "Serious",
      status: "Open",
      occurredDays: 2,
      detail:
        "Two clients received an email from notices@phmg-india.com — note the hyphen — asking for payment to a different bank account. Our own mailbox shows no sign of compromise.",
      personalData: false,
      clientsAffected: 2,
      action:
        "Clients warned by phone. The bank details on the invoice template are being checked. SPF and DMARC records under review.",
    },
    {
      summary: "Wrong client's balance sheet attached to an email",
      severity: "Low",
      status: "Closed",
      occurredDays: 54,
      detail:
        "A draft balance sheet for one client was attached to an email to another. The recipient told us within the hour and confirmed deletion.",
      personalData: true,
      clientsAffected: 2,
      action:
        "Recall attempted. Written confirmation of deletion obtained. The file naming convention was changed so two clients' drafts cannot sit in one folder.",
      closedDays: 47,
      notified: "Both clients informed.",
      notifiedDays: 53,
    },
  ];
  for (const row of INCIDENTS) {
    if (await Incident.findOne({ summary: row.summary }).lean()) continue;
    await systemAudit(async (session) => {
      await Incident.create(
        [
          {
            summary: row.summary,
            severity: row.severity,
            status: row.status,
            occurredAt: back(now, row.occurredDays),
            noticedAt: back(now, row.occurredDays),
            detail: row.detail,
            personalData: row.personalData,
            clientsAffected: row.clientsAffected,
            notified: row.notified ?? "",
            notifiedAt: row.notifiedDays ? back(now, row.notifiedDays) : null,
            action: row.action,
            raisedBy: String(partner._id),
            raisedByName: partner.name,
            closedAt: row.closedDays ? back(now, row.closedDays) : null,
            createdBy: "sample",
            updatedBy: "sample",
          },
        ],
        { session, ordered: true },
      );
    });
    bump("incidents");
  }
  log(`issue   ${counts.incidents ?? 0} in the incident register`);

  // --- the noticeboard ----------------------------------------------------
  const ANNOUNCEMENTS = [
    {
      title: "Laptops do not leave the office unencrypted",
      body: "After last week's taxi, the rule is in writing. Before any laptop goes to a client's premises: disk encryption on, screen lock at two minutes, and no client files sitting in Downloads. If you are not sure whether a machine is encrypted, ask before you take it.\n\nTick this when you have read it.",
      audience: "everyone",
      fromDays: 7,
      needsAck: true,
      ackFrom: () => [ankit, ananya, shalini],
    },
    {
      title: "Ludhiana office closed on Friday for maintenance",
      body: "The building is doing electrical work on the whole floor. Work from home that day; the Noida numbers will take any client who walks in.",
      audience: "branch",
      branch: "LDH",
      fromDays: 2,
      untilInDays: 5,
    },
    {
      title: "October statutory calendar is up",
      body: "GSTR-1 on the 11th, 3B on the 20th, the TDS return for Q2 on the 31st. The compliance grid has the client-by-client picture; anything still amber on the 8th comes to the Monday meeting.",
      audience: "everyone",
      fromDays: 26,
      untilInDays: -2,
    },
  ];
  for (const row of ANNOUNCEMENTS) {
    if (await Announcement.findOne({ title: row.title }).lean()) continue;
    await systemAudit(async (session) => {
      await Announcement.create(
        [
          {
            title: row.title,
            body: row.body,
            audience: row.audience,
            branchId: row.branch ? branchByCode.get(row.branch) : null,
            from: back(now, row.fromDays),
            until: row.untilInDays ? fwd(now, row.untilInDays) : null,
            needsAck: Boolean(row.needsAck),
            acknowledgements: (row.ackFrom ? row.ackFrom() : []).map(
              (p, i) => ({
                userId: p._id,
                name: p.name,
                at: back(now, row.fromDays - i - 1),
              }),
            ),
            postedBy: String(partner._id),
            postedByName: partner.name,
            createdBy: "sample",
            updatedBy: "sample",
          },
        ],
        { session, ordered: true },
      );
    });
    bump("announcements");
  }
  log(`board   ${counts.announcements ?? 0} announcements`);

  // --- saved views --------------------------------------------------------
  const VIEWS = [
    {
      name: "Overdue, all branches",
      screen: "engagements",
      search: "status=Overdue&sort=statutoryDue",
      owner: partner,
      shared: true,
    },
    {
      name: "My work this week",
      screen: "engagements",
      search: "assignee=me&due=week",
      owner: ankit,
    },
    {
      name: "Awaiting documents",
      screen: "engagements",
      search: "status=Awaiting+documents",
      owner: ritika,
      shared: true,
    },
    {
      name: "Unpaid over 30 days",
      screen: "invoices",
      search: "status=Unpaid&age=30",
      owner: partner,
      shared: true,
    },
    {
      name: "Ludhiana clients",
      screen: "clients",
      search: "branch=LDH&active=1",
      owner: gurpreet,
    },
  ];
  for (const row of VIEWS) {
    if (await SavedView.findOne({ screen: row.screen, name: row.name }).lean())
      continue;
    await systemAudit(async (session) => {
      await SavedView.create(
        [
          {
            name: row.name,
            screen: row.screen,
            search: row.search,
            ownerId: row.owner._id,
            ownerName: row.owner.name,
            shared: Boolean(row.shared),
            createdBy: "sample",
            updatedBy: "sample",
          },
        ],
        { session, ordered: true },
      );
    });
    bump("savedViews");
  }
  log(`view    ${counts.savedViews ?? 0} saved views`);

  // --- client upload requests ---------------------------------------------
  // One live and half used, one expired with nothing uploaded and two
  // reminders behind it. The second is the one worth looking at.
  const REQUESTS = [
    {
      client: jaiswal,
      work: statAudit,
      daysAgo: 4,
      expiresInDays: 3,
      message:
        "The bank statements and the stock statement as at 30-09, please. The link works for a week.",
      uploads: 2,
      items: [
        {
          name: "Bank statement — PNB cash credit, April to September",
          received: 1,
        },
        { name: "Stock statement as at 30-09", received: 1 },
        { name: "Confirmation from Bhatia Traders", received: 0 },
      ],
      reminders: 1,
    },
    {
      client: deshmukh,
      daysAgo: 22,
      expiresInDays: -15,
      message: "Form 16 and the interest certificates for the year.",
      uploads: 0,
      items: [
        { name: "Form 16 from the employer", received: 0 },
        {
          name: "Interest certificate — savings and fixed deposits",
          received: 0,
        },
        {
          name: "Rent receipts, if HRA is claimed",
          received: 0,
          mandatory: false,
        },
      ],
      reminders: 2,
      delegate: {
        name: "Mrs. Sunanda Deshmukh",
        contact: "+91 98201 44120",
        askedBy: "Anil Deshmukh, by phone",
      },
    },
  ];
  for (const row of REQUESTS) {
    if (!row.client) continue;
    if (
      await DocRequest.findOne({ clientId: row.client._id })
        .select("_id")
        .lean()
    )
      continue;
    const token = newRequestToken();
    await systemAudit(async (session) => {
      await DocRequest.create(
        [
          {
            tokenHash: hashRequestToken(token),
            tokenHint: token.slice(0, 6),
            clientId: row.client._id,
            engagementId: row.work?._id ?? null,
            branchId: row.client.branchId,
            items: row.items.map((i) => ({
              name: i.name,
              mandatory: i.mandatory !== false,
              receivedCount: i.received,
            })),
            expiresAt: fwd(now, row.expiresInDays),
            sentVia: "email",
            sentAt: back(now, row.daysAgo),
            reminderCount: row.reminders,
            lastReminderAt: row.reminders ? back(now, 2) : null,
            lastUsedAt: row.uploads ? back(now, 3) : null,
            uploadCount: row.uploads,
            message: row.message,
            delegate: row.delegate ?? null,
            createdBy: "sample",
            createdByName: "Sample data",
            updatedBy: "sample",
          },
        ],
        { session, ordered: true },
      );
    });
    bump("docRequests");
  }
  log(`ask     ${counts.docRequests ?? 0} upload requests out with clients`);

  // --- the handbook -------------------------------------------------------
  // Three written up out of sixteen screens, on purpose: the shelf is meant
  // to show its holes, and a fully written handbook hides that.
  const PROCEDURES = [
    {
      kind: "screen",
      key: "clients.new",
      title: "Taking on a new client",
      intro:
        "What we do between the first phone call and the client existing on this system.",
      steps: [
        {
          text: "Get the PAN before anything else, and search for it here first. Half the 'new' clients turn out to be a group company we already act for.",
        },
        {
          text: "Ask who the signing person is, and take their mobile and email in their own words rather than the accountant's.",
        },
        {
          text: "Check the constitution against the PAN's fourth letter. A company whose PAN reads as a firm means somebody has read the number wrong.",
        },
        {
          text: "Enter the GSTIN for every state they are registered in, not just the head office one.",
          note: "A client with two GSTINs and one entered here means half their returns never appear in the calendar.",
        },
        {
          text: "Set the branch that will actually do the work, not the branch that happened to get the call.",
        },
        {
          text: "Only then subscribe them to services. The services decide what work appears, so a wrong service is a month of wrong deadlines.",
        },
      ],
      whenItHappens:
        "A partner says yes to a new engagement. Usually after the fee is agreed, sometimes before.",
      decisions:
        "Which branch owns the client, and who the default assignee and reviewer are. Both can be changed later, but the default assignee is who gets every piece of recurring work until somebody notices.",
      mistakes:
        "Entering the accountant's email as the client's. The accountant leaves and the client stops hearing from us.\n\nSkipping the duplicate check because the name looks new. Group companies rarely share a name.",
      reviewedDays: 40,
    },
    {
      kind: "screen",
      key: "engagements.review",
      title: "Reviewing somebody else's work",
      intro:
        "The review is the firm's name on the work. This is what we look at, and in what order.",
      steps: [
        {
          text: "Read the checklist before the file. If an item is ticked with nothing attached, stop there and ask.",
        },
        {
          text: "Agree the figures to a source we did not prepare — a bank statement, a portal download, a confirmation.",
        },
        {
          text: "Read the exceptions. An exception marked Explained with no explanation written down is not explained.",
        },
        {
          text: "Check the dates: the period, the due date, and the date we say we filed.",
        },
        {
          text: "Send it back with what to fix, not with 'see me'. The comment stays on the file; the conversation does not.",
        },
      ],
      whenItHappens: "When work moves to Under review.",
      decisions:
        "Whether it goes back or goes on. Only a CA or a partner marks it Completed, and it cannot be the person who did it.",
      mistakes:
        "Ticking through a checklist to clear the queue. The reviewer's name is on it afterwards.",
    },
    {
      kind: "playbook",
      key: "playbook.gst-notice",
      title: "A GST notice has arrived — the first forty-eight hours",
      intro:
        "What to do when a client forwards a notice, before anybody starts drafting a reply.",
      steps: [
        {
          text: "Find the last date on it and put it on the matter the same day. Everything else can wait an hour; this cannot.",
        },
        {
          text: "Identify the section. A 73 and a 74 look identical and carry different periods, different penalties and a different reply.",
        },
        {
          text: "Check the DIN on the portal. A notice without a valid DIN is not a notice.",
          note: "CBIC Circular 122/41/2019-GST.",
        },
        {
          text: "Work out what is actually at stake in rupees. It decides who in the firm handles it.",
        },
        {
          text: "Tell the client in plain words what has been asked and what we need from them, with a date.",
        },
        { text: "Only then start on the reply." },
      ],
      whenItHappens:
        "A client forwards a notice, or one appears on the GST portal and somebody spots it.",
      decisions:
        "Who signs the reply and who attends the hearing. A high-stake matter is a partner's from the start, not from when it goes wrong.",
      mistakes:
        "Starting to draft before reading the last date. Two days of good drafting filed one day late is worth nothing.\n\nReplying to a 74 as though it were a 73, and conceding suppression that was never established.",
      example:
        "Jaiswal Steels, show cause notice under section 74 on credit from a retrospectively cancelled supplier. Stake ₹18.42 lakh, so partner-led from day one. Reply filed on day 28 of 30; two hearings since, one adjourned by the department.",
      screens: ["/practice/notices"],
      reviewedDays: 12,
    },
  ];
  for (const row of PROCEDURES) {
    if (await Procedure.findOne({ key: row.key }).lean()) continue;
    await systemAudit(async (session) => {
      await Procedure.create(
        [
          {
            kind: row.kind,
            key: row.key,
            title: row.title,
            intro: row.intro,
            steps: row.steps,
            whenItHappens: row.whenItHappens ?? "",
            decisions: row.decisions ?? "",
            mistakes: row.mistakes ?? "",
            example: row.example ?? "",
            screens: row.screens ?? [],
            writtenBy: String(ritika._id),
            writtenByName: ritika.name,
            ...(row.reviewedDays
              ? {
                  reviewedAt: back(now, row.reviewedDays),
                  reviewedBy: String(partner._id),
                  reviewedByName: partner.name,
                }
              : {}),
            createdBy: "sample",
            updatedBy: "sample",
          },
        ],
        { session, ordered: true },
      );
    });
    bump("procedures");
  }
  log(`sop     ${counts.procedures ?? 0} written up — the rest stay empty`);

  // --- changes from a bulk sheet, waiting for a decision ------------------
  const CHANGES = [
    {
      client: jaiswal,
      field: "email",
      label: "Email",
      fromText: "accounts@jaiswalsteels.example",
      toText: "rohit@jaiswalsteels.example",
      state: "pending",
    },
    {
      client: tandon,
      field: "city",
      label: "City",
      fromText: "Delhi",
      toText: "New Delhi",
      state: "pending",
    },
    {
      client: kaur,
      field: "mobile",
      label: "Mobile",
      fromText: "+91 98140 22118",
      toText: "+91 98140 77204",
      state: "applied",
      decidedDays: 11,
      reason: "Confirmed on a call with Jaspreet.",
    },
    {
      client: deshmukh,
      field: "pan",
      label: "PAN",
      fromText: "AQWPD4821J",
      toText: "AQWPD4821K",
      state: "declined",
      decidedDays: 6,
      reason:
        "The sheet's PAN fails its check digit. The one on record matches the Form 16.",
    },
  ];
  for (const row of CHANGES) {
    if (!row.client) continue;
    if (
      await HeldChange.findOne({
        clientId: row.client._id,
        field: row.field,
      }).lean()
    )
      continue;
    await systemAudit(async (session) => {
      await HeldChange.create(
        [
          {
            clientId: row.client._id,
            clientName: row.client.legalName,
            branchId: row.client.branchId,
            field: row.field,
            label: row.label,
            from: row.fromText,
            to: row.toText,
            fromText: row.fromText,
            toText: row.toText,
            source: "Bulk sheet",
            askedBy: String(shalini._id),
            askedByName: shalini.name,
            state: row.state,
            ...(row.decidedDays
              ? {
                  decidedBy: String(partner._id),
                  decidedByName: partner.name,
                  decidedAt: back(now, row.decidedDays),
                  reason: row.reason,
                }
              : {}),
            createdBy: "sample",
            updatedBy: "sample",
          },
        ],
        { session, ordered: true },
      );
    });
    bump("heldChanges");
  }
  log(`hold    ${counts.heldChanges ?? 0} changes held for a decision`);

  // --- why a compliance cell is blank -------------------------------------
  const subs = await ClientService.find({
    clientId: { $in: clients.map((c) => c._id) },
  })
    .select("clientId serviceTemplateId")
    .lean();
  const REASONS = [
    {
      sub: subs[0],
      period: "2026-08",
      reason: "other-professional",
      note: "The client's own accountant filed August himself, while we were being appointed.",
    },
    {
      sub: subs[1],
      period: "2026-07",
      reason: "not-engaged",
      note: "We were engaged from August. July is not ours.",
    },
  ];
  for (const row of REASONS) {
    if (!row.sub) continue;
    const where = {
      clientId: row.sub.clientId,
      serviceTemplateId: row.sub.serviceTemplateId,
      period: row.period,
    };
    if (await PeriodReason.findOne(where).lean()) continue;
    await systemAudit(async (session) => {
      await PeriodReason.create(
        [
          {
            ...where,
            branchId:
              clients.find((c) => String(c._id) === String(row.sub.clientId))
                ?.branchId ?? clients[0].branchId,
            reason: row.reason,
            note: row.note,
            recordedBy: String(partner._id),
            recordedByName: partner.name,
            createdBy: "sample",
            updatedBy: "sample",
          },
        ],
        { session, ordered: true },
      );
    });
    bump("periodReasons");
  }
  log(`blank   ${counts.periodReasons ?? 0} compliance cells given a reason`);

  return counts;
}

/**
 * Wording for the paragraphs the Guidance Note leaves to the practitioner.
 *
 * Only the ones a reader would notice are empty. Anything not named here
 * stays blank, which is what the screen is meant to nag about.
 */
function paragraphTextFor(key, row) {
  const name = row.client.legalName;
  if (key === "addressee") return row.addressee;
  if (key === "purpose" || key === "restriction") {
    return `This certificate is issued at the request of the management of ${name} solely for the purpose of ${row.purpose}, and is not to be used for any other purpose or by any other party.`;
  }
  if (key === "management" || key === "responsibility") {
    return `The management of ${name} is responsible for the figures certified, for maintaining the books and records from which they are drawn, and for the completeness of the information given to us.`;
  }
  if (key === "scope" || key === "procedures" || key === "work") {
    return row.level === "Limited"
      ? "We carried out a limited review: we agreed the figure to the books of account and the supporting statements produced to us, and made enquiries of the management. A limited review is substantially less in scope than an audit, and we express no audit opinion."
      : "We examined the audited financial statements, the books of account and the supporting records produced to us, and carried out such verification as we considered necessary in the circumstances.";
  }
  if (key === "figure" || key === "opinion" || key === "conclusion") {
    return row.figureBasis;
  }
  return "";
}

/**
 * Take the practice data out again. Called by `dropSample`, which has
 * already worked out which clients and colleagues are the sample's.
 *
 * Soft delete only, like everything else (CLAUDE.md rule 3). Incidents are
 * the exception: the model has no soft delete, because an incident register
 * with a delete button is not a register.
 *
 * @param {{clientIds: any[], userIds: any[]}} scope
 */
export async function dropPractice({ clientIds, userIds }) {
  let removed = 0;

  const byClient = [
    AuditFile,
    TrialBalance,
    Sample,
    Notice,
    Certificate,
    DocRequest,
    HeldChange,
    PeriodReason,
    Todo,
  ];
  for (const Model of byClient) {
    for (const doc of await Model.find({ clientId: { $in: clientIds } })) {
      await systemAudit((session) => doc.softDelete("sample", { session }));
      removed += 1;
    }
  }

  for (const [Model, field] of [
    [TimeEntry, "userId"],
    [Leave, "userId"],
    [SavedView, "ownerId"],
  ]) {
    for (const doc of await Model.find({ [field]: { $in: userIds } })) {
      await systemAudit((session) => doc.softDelete("sample", { session }));
      removed += 1;
    }
  }

  for (const Model of [Procedure, Announcement]) {
    for (const doc of await Model.find({ createdBy: "sample" })) {
      await systemAudit((session) => doc.softDelete("sample", { session }));
      removed += 1;
    }
  }

  return { removed };
}

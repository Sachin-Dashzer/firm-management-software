// @ts-check

/**
 * Certificates, in the shape the ICAI Guidance Note gives them (P3-15).
 *
 * The Guidance Note on Reports or Certificates for Special Purposes sets a
 * structure, and the structure is the point: a certificate that wanders
 * from it is the one that gets a member into trouble. So the paragraphs
 * are a fixed list, most of them **locked**, and the two or three a
 * practitioner actually has to write are the ones left open.
 *
 * Two rules do real work here:
 *
 *  - **The assurance level rewrites the conclusion.** Reasonable assurance
 *    gives a positive opinion; limited assurance gives a conclusion in the
 *    negative form *and obliges the practitioner to describe the
 *    procedures*. Those are different documents, and letting somebody pick
 *    a level from a dropdown without the wording following is how a limited
 *    engagement goes out reading like an audit.
 *  - **Four phrases are refused.** "True and correct", "certify that", "to
 *    whomsoever" and "guarantee". Each one is a habit from a older form of
 *    words, each is discouraged, and each is cheap to catch while it is
 *    being typed.
 *
 * **Nothing here is authority.** The wording is a first draft taken from
 * the design prototype, which carries "to be verified by a practising CA
 * before use" throughout, and every locked paragraph goes through the same
 * partner confirmation as the notice-law table and the auditing standards
 * (`models/RuleConfirmation.js`, kind below).
 */

export const CONFIRM_KIND = "CERT-WORDING";

export const ASSURANCE_LEVELS = ["Reasonable", "Limited"];

/** What each level means, in the words a practitioner needs to read. */
export const ASSURANCE_NOTES = {
  Reasonable:
    "A positive opinion. Use it when the records have been examined in enough depth to say so.",
  Limited:
    "A conclusion in the negative form — nothing has come to our attention. The procedures performed must be described.",
};

/**
 * @typedef {object} CertificateType
 * @property {string} key
 * @property {string} name
 * @property {string} use       who asks for it
 * @property {string} subject   what is being reported on
 * @property {string} criteria  what it was measured against
 * @property {string[]} evidence
 * @property {boolean} [figure] whether it carries one headline amount
 */

/** @type {CertificateType[]} */
export const CERTIFICATE_TYPES = [
  {
    key: "net-worth",
    name: "Net worth certificate",
    use: "Visa, tender, bank or regulator",
    subject:
      "the statement of net worth of the entity as at [date], prepared by management from the books of account",
    criteria:
      "the audited balance sheet as at the last year end and the books of account for the period after it",
    evidence: [
      "Audited financial statements for the latest year",
      "Books of account or trial balance up to the certificate date",
      "Bank statements and confirmations for material balances",
      "Valuation basis for any asset not at book value, stated in the statement",
      "Management-signed statement of net worth",
      "Engagement letter for this certificate",
    ],
    figure: true,
  },
  {
    key: "turnover",
    name: "Turnover certificate",
    use: "Tender, bank, MSME registration",
    subject:
      "the statement of turnover for the financial years [years], prepared by management",
    criteria:
      "audited financial statements and the GST returns (GSTR-1 and GSTR-3B) for those years",
    evidence: [
      "Audited financial statements for each year",
      "GSTR-1 and GSTR-3B summaries reconciled to the books",
      "Reconciliation of turnover in the books against the GST returns",
      "Management-signed statement of turnover",
      "Engagement letter for this certificate",
    ],
    figure: true,
  },
  {
    key: "drawing-power",
    name: "Stock and book-debts statement (bank drawing power)",
    use: "Drawing power for working capital limits",
    subject:
      "the statement of inventories and trade receivables as at [date] submitted to [bank]",
    criteria:
      "stock records, physical verification reports, and the debtors ledger with its ageing as at that date",
    evidence: [
      "Stock register, or item-wise closing stock",
      "Physical verification report signed by management",
      "Debtors ageing as at the date, with debts beyond the sanctioned period excluded",
      "Sanction letter terms for the drawing power margins",
      "Reconciliation with the stock statement filed with the bank",
    ],
    figure: true,
  },
  {
    key: "utilisation",
    name: "Utilisation certificate (grant)",
    use: "Grants, in GFR 12-C or the sanctioning body's own format",
    subject:
      "the statement of receipt and utilisation of grant [sanction no.] for the period [period]",
    criteria:
      "the sanction order, the books of account, and the vouchers for expenditure from the grant",
    evidence: [
      "Sanction order and its terms",
      "Bank statement of the grant account",
      "Expenditure vouchers sampled against the sanctioned heads",
      "Unspent balance and any interest earned, identified separately",
      "The sanctioning body's own format, where it prescribes one",
    ],
    figure: true,
  },
  {
    key: "capital-contribution",
    name: "Capital contribution certificate",
    use: "LLP or partnership, for a bank or the ROC",
    subject:
      "the statement of capital contributed by the partners as at [date]",
    criteria:
      "the LLP or partnership agreement, the partners' capital accounts and the bank statements",
    evidence: [
      "LLP or partnership agreement, with its amendments",
      "Partners' capital accounts",
      "Bank statements evidencing the contributions",
      "Management-signed statement of capital contributed",
      "Engagement letter for this certificate",
    ],
    figure: true,
  },
];

/** Phrases a certificate does not use, and what to do instead. */
export const BANNED_PHRASES = [
  {
    phrase: "true and correct",
    why: 'The Guidance Note discourages "true and correct". Say what was checked, and against what.',
  },
  {
    phrase: "certify that",
    why: 'Report, or state the opinion or conclusion. "Certify" claims more than a practitioner gives on a matter of judgement.',
  },
  {
    phrase: "to whomsoever",
    why: "Address it to the party who engaged you, or to the named recipient. An unaddressed certificate can be used for anything.",
  },
  {
    phrase: "guarantee",
    why: "A practitioner does not guarantee. Remove it.",
  },
];

/**
 * The paragraphs, in order, and which of them anybody may edit.
 *
 * `locked` is the Guidance Note's own structure: the responsibilities, the
 * standard the work was done under, and the restriction on use are not a
 * practitioner's prose to improve. What is open is what is particular to
 * this engagement — who it is addressed to, what the subject matter is,
 * what was actually done, and the figure.
 *
 * @param {CertificateType} type
 * @param {string} level
 */
export function paragraphsFor(type, level) {
  const limited = level === "Limited";

  return [
    {
      key: "addressee",
      title: "Addressed to",
      locked: false,
      required: true,
      text: "",
      help: "The party who engaged you, or the named recipient. Never an unaddressed certificate.",
    },
    {
      key: "subject",
      title: "What this report is on",
      locked: false,
      required: true,
      text: type.subject,
      help: "Replace anything in [brackets] with this engagement's own facts.",
    },
    {
      key: "management",
      title: "Management's responsibility",
      locked: true,
      text: "The statement is the responsibility of the entity's management, including the preparation of it, the basis on which it is prepared, and the design of internal controls relevant to it.",
    },
    {
      key: "practitioner",
      title: "Our responsibility",
      locked: true,
      text: limited
        ? "Our responsibility is to express a conclusion on the statement based on our work. We conducted our engagement in accordance with the Standard on Review Engagements and the Guidance Note on Reports or Certificates for Special Purposes issued by the Institute of Chartered Accountants of India. A limited assurance engagement is substantially less in scope than a reasonable assurance engagement."
        : "Our responsibility is to express an opinion on the statement based on our examination. We conducted our examination in accordance with the Guidance Note on Reports or Certificates for Special Purposes issued by the Institute of Chartered Accountants of India, and with the Standard on Quality Control (SQC 1).",
    },
    {
      key: "criteria",
      title: "What it was measured against",
      locked: false,
      required: true,
      text: type.criteria,
      help: "The criteria have to be stated, so a reader knows what the conclusion is a conclusion about.",
    },
    {
      key: "procedures",
      title: "What we did",
      locked: false,
      /**
       * Required on a limited engagement and not on a reasonable one. That
       * is the Guidance Note's own asymmetry: a negative-form conclusion
       * means little without the procedures that produced it.
       */
      required: limited,
      text: "",
      help: limited
        ? "Required on a limited assurance engagement: a conclusion in the negative form means little unless the reader knows what was done."
        : "Optional on a reasonable assurance engagement, and worth writing anyway.",
    },
    {
      key: "conclusion",
      title: limited ? "Our conclusion" : "Our opinion",
      locked: true,
      text: limited
        ? "Based on our work described above, nothing has come to our attention that causes us to believe that the statement is not prepared, in all material respects, in accordance with the criteria stated above."
        : "In our opinion, and to the best of our information and according to the explanations given to us, the statement is prepared, in all material respects, in accordance with the criteria stated above.",
    },
    {
      key: "restriction",
      title: "Restriction on use",
      locked: true,
      text: "This report is issued solely for the purpose stated above and for the addressee named above. It is not to be used for any other purpose, or by any other party, and we accept no liability to any other party who obtains it.",
    },
  ];
}

/**
 * Read a draft back and say what is wrong with it.
 *
 * @param {object} certificate
 * @returns {Array<{ key: string, what: string, fix: string }>}
 */
export function checkCertificate(certificate) {
  const problems = [];
  const paragraphs = certificate?.paragraphs ?? [];

  for (const paragraph of paragraphs) {
    const text = String(paragraph.text ?? "").trim();

    if (paragraph.required && !text) {
      problems.push({
        key: paragraph.key,
        what: `"${paragraph.title}" is empty`,
        fix: paragraph.help ?? "Write it.",
      });
    }

    if (/\[[^\]]+\]/.test(text)) {
      problems.push({
        key: paragraph.key,
        what: `"${paragraph.title}" still has a placeholder in it: ${text.match(/\[[^\]]+\]/g).join(", ")}`,
        fix: "Replace it with this engagement's own facts.",
      });
    }

    for (const banned of BANNED_PHRASES) {
      if (text.toLowerCase().includes(banned.phrase)) {
        problems.push({
          key: paragraph.key,
          what: `"${paragraph.title}" uses the words "${banned.phrase}"`,
          fix: banned.why,
        });
      }
    }
  }

  const evidence = certificate?.evidence ?? [];
  const missing = evidence.filter((row) => !row.held && !row.notApplicable);
  if (missing.length) {
    problems.push({
      key: "evidence",
      what: `${missing.length} ${missing.length === 1 ? "item" : "items"} of evidence not on the file`,
      fix: "Hold it, or mark it not applicable with a reason. A certificate rests on what is in the file, not on what was seen.",
    });
  }

  return problems;
}

/** Can this be signed, and if not, what is stopping it? */
export function blockingSign(certificate) {
  if (certificate?.signedAt) {
    return [
      `${certificate.number || "This certificate"} was signed on ${new Date(certificate.signedAt).toISOString().slice(0, 10)}. A signed certificate is not edited; issue a fresh one.`,
    ];
  }
  return checkCertificate(certificate).map((row) => row.what);
}

/** Put the paragraphs together into the document, in order. */
export function assemble(certificate) {
  return (certificate?.paragraphs ?? [])
    .filter((paragraph) => String(paragraph.text ?? "").trim())
    .map((paragraph) => ({
      title: paragraph.title,
      text: String(paragraph.text).trim(),
      locked: paragraph.locked,
    }));
}

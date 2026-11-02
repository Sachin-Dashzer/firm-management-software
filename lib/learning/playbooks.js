// @ts-check

/**
 * The playbooks: a kind of work, start to finish (the owner's content of
 * 02-11-2026).
 *
 * A screen procedure answers "what do I press". A playbook answers "how is
 * this job done" — when it happens, who does what, where the judgements
 * are, what usually goes wrong, and what comes out at the end. It is read
 * once, not looked up, which is why it is longer and why it has a worked
 * example and an exercise.
 *
 * **Every one of these is a draft until a practising CA has verified it**
 * and the screen says so on every page. The references in particular are
 * pointers to read, not statements of law: the Income-tax Act, 2025
 * renumbers what the 1961 Act said, and anything quoting a rate, a
 * threshold or a date has to be checked against the firm's own confirmed
 * rules before it is relied on.
 *
 * `full: false` is an outline the firm has not written yet. It is listed
 * rather than hidden, because a library that shows only what exists tells a
 * new joiner nothing about what is missing.
 *
 * @typedef {object} Step
 * @property {string} t      what the step is
 * @property {string} [why]  why it matters
 * @property {string} how    how to do it
 * @property {string} out    what to produce
 * @property {string} [chk]  what to check
 * @property {string} [ask]  when to ask for help
 *
 * @typedef {object} Playbook
 * @property {string} id
 * @property {string} shelf
 * @property {string} title
 * @property {boolean} full
 * @property {string} out        the outcome, in one line
 * @property {string} [applies]
 * @property {string[]} [screens]  screen keys this work happens on
 * @property {Array<[string, string, string]>} [raci]
 * @property {Array<[string, string]>} [calendar]
 * @property {string[]} [inputs]
 * @property {Step[]} [steps]
 * @property {Array<[string, string]>} [decisions]
 * @property {string[]} [controls]
 * @property {string[]} [mistakes]
 * @property {string[]} [outputs]
 * @property {string[]} [refs]
 * @property {string[]} [worked]
 * @property {{q: string, items: Array<{t: string, ok: boolean, why: string}>}} [exercise]
 */

export const VERIFY =
  "A draft for the firm. To be verified by a practising CA before it is relied on — the references especially, which are pointers to read and not statements of law.";

/** The shelves, in the order they are drawn. */
export const SHELVES = [
  {
    id: "R",
    title: "Recurring compliance",
    who: "everybody who files returns",
    specialist: false,
  },
  {
    id: "A",
    title: "Running the practice",
    who: "partners, managers and the practice administrator",
    specialist: false,
  },
  {
    id: "B",
    title: "Accounting and reporting",
    who: "staff and managers",
    specialist: false,
  },
  {
    id: "C",
    title: "Entity lifecycle",
    who: "staff and managers",
    specialist: false,
  },
  {
    id: "D",
    title: "GCC practice",
    who: "partners, managers and staff on captive engagements",
    specialist: true,
  },
  {
    id: "E",
    title: "Assurance and special engagements",
    who: "managers and partners",
    specialist: true,
  },
];

/** @type {Playbook[]} */
export const PLAYBOOKS = [
  // =====================================================================
  {
    id: "R1",
    shelf: "R",
    title: "The monthly GST return",
    full: true,
    screens: ["engagements.work", "calendar", "gstCycle", "myday"],
    out: "Both returns filed on time, with every difference between the books, the outward return, the credit statement and the summary return explained.",
    applies:
      "Clients filing monthly. A quarterly filer follows the same steps on the quarterly cycle, with the optional statement and the payment in between.",
    raci: [
      ["Staff or article", "Prepares", "R"],
      ["CA manager", "Reviews and approves", "A"],
      ["Client", "Sends the data, confirms the tax", "C"],
      ["Client partner", "Told when a date is at risk", "I"],
    ],
    calendar: [
      ["Early in the month", "The data pack goes to the client"],
      ["Day 3 and day 5", "Reminders, if nothing has come in"],
      ["Day 7", "Escalation to the client partner"],
      [
        "Before the first statutory date",
        "Outward return prepared, reviewed and filed",
      ],
      [
        "Before the second statutory date",
        "Tax confirmed, paid, and the summary return filed",
      ],
    ],
    inputs: [
      "Sales register for the month",
      "Purchase register for the month",
      "Bank statement",
      "Credit and debit notes",
      "Electronic invoice and way-bill data, where the client is covered",
    ],
    steps: [
      {
        t: "Ask for the month's data, once",
        why: "Most late filings are late because the asking was late, or was done on somebody's own phone and then forgotten.",
        how: "Send one request covering the sales register, the purchase register, the bank statement and the credit and debit notes, from the job so that it is on the record.",
        out: "Every file logged against the request and accepted.",
        chk: "Right month, every registration of the client, and the electronic invoice list where it applies.",
        ask: "Nothing has come in three days before the first date, or data arrives on a personal number.",
      },
      {
        t: "Agree the sales register with the invoice and way-bill data",
        why: "A difference found now is a question for the client; found after filing it is an amendment.",
        how: "Match the register against the electronic invoice list and the way-bill data, and list every difference with its reason.",
        out: "A sales reconciliation where every difference has an explanation against it.",
        chk: "Invoices issued without an electronic invoice where one was required; the split between business and consumer sales; credit notes.",
        ask: "An invoice was issued without an electronic invoice where one was required — tell the partner, it carries exposure.",
      },
      {
        t: "Match the purchase register against the credit statement",
        why: "Credit is allowed on what appears in the statement, not on what the client has an invoice for.",
        how: "Produce a supplier-wise list in three parts: matched, in the books but not in the statement, and in the statement but not in the books.",
        out: "The supplier-wise list, ready to send to the client.",
        chk: "Blocked credits; invoices unpaid beyond the period after which credit is reversed. Read both against the rules the firm has confirmed, not from memory.",
        ask: "Credit not in the statement above the firm's threshold, or a client who wants to claim it anyway.",
      },
      {
        t: "Prepare the outward return",
        why: "This is the return the department reads first and the one a customer's credit depends on.",
        how: "Business, consumer, large inter-state consumer, credit and debit notes, the classification summary and the document summary.",
        out: "The summary of the outward return, saved to the job.",
        chk: "No gap in the invoice series; the totals agree with the reconciliation.",
        ask: "An earlier month needs amending.",
      },
      {
        t: "Compute the tax",
        why: "The client has to pay it, so the client has to see it before it is filed.",
        how: "Output tax, eligible credit, reversals, tax payable under reverse charge, and what is settled in cash against credit.",
        out: "The computation, and the figure sent to the client to confirm.",
        chk: "Interest where an earlier liability was paid late — against the firm's confirmed rules.",
        ask: "The client cannot pay by the due date. That is the partner's conversation, before the date.",
      },
      {
        t: "Compare, then file",
        why: "Unexplained differences between the returns are what bring a scrutiny notice a year later.",
        how: "Compare the summary return with the outward return on liability and with the credit statement on credit, and explain every difference. Then file in the government utility and record the acknowledgement here.",
        out: "Both acknowledgements attached to the job, and the client told.",
        chk: "Every difference explained in writing on the job.",
        ask: "A difference you cannot explain. Do not file around it.",
      },
    ],
    decisions: [
      [
        "Credit does not appear in the statement",
        "Do not claim it this month. Send the client the supplier-wise list so they can chase the supplier, and claim it when it appears.",
      ],
      [
        "The client cannot pay the tax",
        "Tell the partner before the due date. Interest runs from the date, and the decision is not the preparer's.",
      ],
      [
        "The data is incomplete three days before the date",
        "Escalate to the client partner rather than sending a fourth reminder.",
      ],
    ],
    controls: [
      "The reviewer ties the output tax in the summary return to the outward return.",
      "Credit claimed does not exceed the eligible credit in the statement.",
      "The client's confirmation of the tax is on the job before filing.",
      "The acknowledgement is attached, not just its number typed.",
    ],
    mistakes: [
      "Claiming credit on invoices missing from the credit statement.",
      "Ignoring blocked credits because the invoice looks ordinary.",
      "Filing the summary return before the client has confirmed the tax.",
      "Recording the filing without attaching the acknowledgement.",
    ],
    outputs: [
      "Sales and credit reconciliations",
      "Summary of the outward return",
      "Tax computation, with the client's confirmation",
      "Both acknowledgements, on the job and in the client's portal",
    ],
    refs: [
      "The conditions for taking credit, and blocked credits, under the central law — read the current text",
      "The rule on reversing credit where a supplier has not been paid",
      "Interest on tax paid late",
      "The firm's own confirmed due-date rules in Settings, which are what put the dates on the job",
    ],
    worked: [
      "Purchase register credit for the month: ₹4,82,000.",
      "Credit appearing in the statement: ₹4,63,600.",
      "Difference: ₹18,400 — one transporter's invoice the supplier has not uploaded.",
      "Action: claim ₹4,63,600, send the client the supplier's name, and claim the rest in the month it appears. Do not claim it now and reverse it later.",
    ],
    exercise: {
      q: "Which of these purchases can be claimed this month?",
      items: [
        {
          t: "In the credit statement, goods received, paid within the month",
          ok: true,
          why: "Every condition is met.",
        },
        {
          t: "Not in the credit statement because the supplier has not filed",
          ok: false,
          why: "Credit follows the statement. List it for the client to chase.",
        },
        {
          t: "A car for the director's own use, invoice in the statement",
          ok: false,
          why: "A blocked credit, however correct the invoice is.",
        },
        {
          t: "In the statement, but the goods have not arrived",
          ok: false,
          why: "Receipt of the goods is one of the conditions.",
        },
        {
          t: "In the statement, received, and unpaid for three months",
          ok: true,
          why: "Allowed now. It is reversed only if it stays unpaid beyond the period the rules set — diary it.",
        },
      ],
    },
  },

  // =====================================================================
  {
    id: "R2",
    shelf: "R",
    title: "The quarterly tax-deduction return",
    full: true,
    screens: ["engagements.work", "calendar", "myday"],
    out: "The return filed by its date, with every deduction matched to a challan, every rate right, and the certificates issued to the deductees.",
    applies:
      "Every client that deducts tax at source. Salary and other payments are different returns with the same method.",
    raci: [
      ["Staff or article", "Prepares", "R"],
      ["CA manager", "Reviews and approves", "A"],
      ["Client", "Sends the payment data and the challans", "C"],
    ],
    calendar: [
      ["Monthly", "The deduction is deposited — the date is in the firm's rules"],
      ["Quarterly", "The return is filed"],
      ["After filing", "Certificates downloaded and sent to the deductees"],
    ],
    inputs: [
      "Ledger export of payments to contractors, professionals, rent and interest",
      "Salary register, for the salary return",
      "Every challan for the quarter",
      "The deductees' permanent account numbers",
      "Any lower-deduction certificates",
    ],
    steps: [
      {
        t: "Get the payment data",
        why: "A deduction nobody told you about is a short deduction with interest on it.",
        how: "Take the ledger export for the quarter and list every payee, the section, the amount and the tax deducted.",
        out: "The deductee list.",
        chk: "Payments with no number for the payee: the higher rate applies.",
        ask: "The client cannot give numbers for large payees.",
      },
      {
        t: "Match every deduction to a challan",
        why: "The return will not validate, and the credit will not reach the deductee, if they do not tie.",
        how: "Match each deduction to its challan — bank code, date and serial — from the challan file.",
        out: "The challan-to-deductee mapping.",
        chk: "Interest where a deposit was late, and the right section and year on each challan.",
        ask: "A challan does not match, or the deposit is short.",
      },
      {
        t: "Check the rate for every payee",
        why: "The rate depends on what the payee is and what the payment is for, and the usual error is treating a firm as an individual.",
        how: "Validate the numbers on the portal and check the section and rate for each payee against the firm's confirmed rules.",
        out: "The rate-check list, with anything doubtful marked.",
        chk: "A lower-deduction certificate is only good within its limit and its dates.",
        ask: "The client disputes a rate, or a certificate is exhausted.",
      },
      {
        t: "Prepare and validate the return",
        why: "An unvalidated file is rejected, and the rejection arrives after the date.",
        how: "Prepare it in the utility and validate it before upload.",
        out: "The validated file, saved to the job.",
        chk: "No validation errors, the right form and the right quarter, and the salary annexure where it belongs.",
        ask: "Validation errors you cannot clear.",
      },
      {
        t: "Agree the totals, then file",
        why: "The totals have to agree with the challans and with the books, and the client has to know about any extra deposit.",
        how: "Reconcile the return to the challans and the ledger, get the review, and file.",
        out: "The acknowledgement, attached to the job.",
        chk: "Whether the filing is after the date — the late fee is automatic, so the partner hears it from you and not from the portal.",
        ask: "Filing will be late. Tell the partner the same day.",
      },
      {
        t: "Issue the certificates",
        why: "The deductee cannot claim the credit without it, and the firm's client is the one they telephone.",
        how: "Download the certificates once the return is processed and send them out.",
        out: "Certificates on the client's portal, and the defaults report read.",
        chk: "The processing report for short deduction or late payment defaults.",
        ask: "The report shows defaults.",
      },
    ],
    decisions: [
      [
        "A payee has no number",
        "The higher rate applies. Tell the client before the deduction, not after.",
      ],
      [
        "A short deduction is found",
        "The client deposits the difference with interest before the return is filed, so the return goes in right the first time.",
      ],
    ],
    controls: [
      "Every deduction is matched to a challan before the return is prepared.",
      "The rate is checked against the section and what the payee is.",
      "Validation is clean before upload.",
      "The acknowledgement is attached and the certificates are sent.",
    ],
    mistakes: [
      "Applying the individual's rate to a partnership firm.",
      "Missing the interest on a late deposit.",
      "Filing late without telling the partner.",
      "Forgetting the certificates, which is what the client is asked about.",
    ],
    outputs: [
      "Deductee list and the challan mapping",
      "The validated return file",
      "The acknowledgement, on the job",
      "Certificates, sent to the deductees",
    ],
    refs: [
      "The sections for each kind of payment, and the rate for each class of payee — the renumbering under the Income-tax Act, 2025 has to be mapped before this is relied on",
      "The higher rate where the payee has no number",
      "Interest on late deposit, and the fee for a late return",
      "The firm's confirmed due-date rules, which put the dates on the job",
    ],
    worked: [
      "Freight paid to a transport firm over the quarter: ₹9,20,000.",
      "Deducted at the individual's rate: ₹9,200.",
      "The payee is a partnership firm, so the rate for other than an individual applies: ₹18,400.",
      "Short deduction ₹9,200. The client deposits it with interest before the return is filed, and the return goes in correct.",
    ],
    exercise: {
      q: "Which of these are right?",
      items: [
        {
          t: "Contract payment to a partnership firm, at the rate for other than individuals",
          ok: true,
          why: "The rate follows what the payee is.",
        },
        {
          t: "The same rate applied to an individual contractor",
          ok: false,
          why: "An individual or a family carries the lower rate.",
        },
        {
          t: "Professional fees to a firm of accountants, at the professional-fee rate",
          ok: true,
          why: "The rate follows the nature of the payment.",
        },
        {
          t: "No number for the payee, so the normal rate is used",
          ok: false,
          why: "Without a number the higher rate applies.",
        },
        {
          t: "Hire of machinery treated at the rate for the use of premises",
          ok: false,
          why: "Plant and machinery carries its own rate, lower than premises.",
        },
      ],
    },
  },

  // =====================================================================
  {
    id: "B4",
    shelf: "B",
    title: "Paying micro and small suppliers",
    full: true,
    screens: ["practice.tb", "practice.audit", "billingDesk"],
    out: "Every micro and small supplier identified, paid inside the period the law allows, or the tax and disclosure effect recorded correctly.",
    applies:
      "Any business buying from suppliers registered as micro or small. A medium enterprise is not covered, and the distinction is the whole of the work.",
    raci: [
      ["Manager", "Reviews the year-end computation and the disclosures", "A"],
      ["Staff", "Tags the vendors, runs the ageing, computes", "R"],
      ["Client's accounts team", "Supplies the registrations and the payment dates", "C"],
      ["Partner", "Signs off the reporting in the tax audit", "I"],
    ],
    calendar: [
      ["Monthly", "Ageing report: anything approaching its limit is flagged"],
      ["Half-yearly", "The return companies file about these dues"],
      ["Year end", "The computation of what is disallowed, and the interest"],
      ["Tax audit", "The clause-by-clause reporting"],
    ],
    inputs: [
      "The vendor master",
      "Each supplier's registration certificate, with its category and date",
      "The purchase agreements, for the credit terms",
      "Invoice-wise purchases and payments, with the date each was accepted",
    ],
    steps: [
      {
        t: "Identify which suppliers are covered",
        why: "Only micro and small are. Treating a medium supplier as covered overstates the disallowance; missing a small one understates the tax.",
        how: "Collect each supplier's registration certificate and record the number, the category and the date. A declaration without a number is not evidence.",
        out: "The vendor master tagged with the registration number and the category.",
        chk: "Whether a supplier registered as a trader is covered on the current view — check before applying it.",
        ask: "A supplier will not give a certificate but claims to be covered.",
      },
      {
        t: "Establish the credit period",
        why: "The period the law allows is shorter than most purchase agreements, and the agreement does not override it.",
        how: "Read the agreement where there is one, and record the agreed period capped at what the law allows. Without an agreement, the shorter period applies.",
        out: "The credit terms recorded per supplier.",
        chk: "The cap, and the day from which it runs — acceptance of the goods, not the invoice date.",
      },
      {
        t: "Run the ageing every month",
        why: "A payment caught before its limit costs nothing. After it, it costs tax and interest.",
        how: "Age the invoices from the date of acceptance, flag anything crossing its limit, and send the list to the client.",
        out: "A monthly ageing with the flags on it.",
        ask: "The client is routinely over the limit — that is a conversation with the partner, not a monthly email.",
      },
      {
        t: "Compute the year-end effect",
        why: "A late payment moves the deduction into the year of payment, and the usual relief for other dues does not apply here.",
        how: "For each invoice, compare the payment date with the limit. Anything paid late is deductible in the year it was paid, not the year it was incurred.",
        out: "The disallowance working, invoice by invoice.",
        chk: "Do not apply the relief that lets other dues be paid before the return is filed — read the clause.",
        ask: "The client disputes the computation. It changes their tax, so the partner takes it.",
      },
      {
        t: "Compute the interest",
        why: "Interest on delayed payment is owed to the supplier and is not deductible.",
        how: "Compute it at the rate and the compounding the law sets, from the appointed day, and provide for it.",
        out: "The interest working and the provision.",
        chk: "The rate is a multiple of the central bank's rate — read the current figure rather than carrying last year's.",
      },
      {
        t: "Disclose and report",
        why: "This is what the auditor, the tax audit and the registry each look for, in three different places.",
        how: "Show the dues to these suppliers separately with their ageing, make the disclosures in the notes, file the half-yearly return where the client is a company, and report the clauses in the tax audit.",
        out: "The notes, the return and the clause reporting.",
      },
      {
        t: "Write to the client",
        why: "A computation fixes the year. A letter fixes the process.",
        how: "A short letter: which suppliers are covered, what it cost this year, and the three things that would stop it next year.",
        out: "The advisory letter, on the client's file.",
      },
    ],
    decisions: [
      ["The supplier is medium", "Not covered. No disallowance on this account."],
      [
        "The agreement says a longer period",
        "The law's cap applies. Say so in writing before the year end, not in the audit.",
      ],
      [
        "The invoice is disputed",
        "Record the date the objection was raised: acceptance, and therefore the limit, depends on it.",
      ],
    ],
    controls: [
      "The manager samples the registration certificates against the vendor master.",
      "The computation ties to the purchase ledger.",
      "The figure in the notes equals the figure in the computation.",
    ],
    mistakes: [
      "Relying on a vendor's word with no registration number behind it.",
      "Applying the pay-before-the-return relief to this clause.",
      "Counting the days from the invoice date instead of acceptance.",
      "Providing for the disallowance and forgetting the interest.",
    ],
    outputs: [
      "Tagged vendor master",
      "Monthly ageing reports",
      "The disallowance and interest workings",
      "The notes, the return and the clause reporting",
      "The advisory letter",
    ],
    refs: [
      "The Act that defines micro, small and medium enterprises: the definitions, the credit period, the interest and the disclosure",
      "The income-tax clause that moves the deduction to the year of payment for these suppliers",
      "The financial-statement format's requirement to show these dues separately with ageing",
      "The registry's half-yearly return about dues to these suppliers",
    ],
    worked: [
      "Three suppliers registered as small, unpaid at the year end: ₹6,10,000.",
      "All three were accepted more than the permitted period before the year end, and none was paid before it.",
      "Effect: ₹6,10,000 is not deductible this year; it becomes deductible in the year it is paid.",
      "Interest at the statutory rate is provided and is itself disallowed. Both are reported in the tax audit and shown in the notes.",
    ],
  },

  // =====================================================================
  {
    id: "D2",
    shelf: "D",
    title: "Setting up a captive and the first ninety days",
    full: true,
    screens: ["clients.new", "clients.record"],
    out: "The company can hire, invoice its parent and receive money within ninety days, with every filing on the record.",
    applies:
      "An Indian private company wholly owned by a foreign parent, providing services to its own group and paid cost plus a mark-up.",
    raci: [
      ["Engagement partner", "Approves the structure, the scope memo and the pricing policy", "A"],
      ["Manager", "Runs the plan and reviews every filing", "R"],
      ["Staff", "Prepares the forms, the registrations and the trackers", "R"],
      ["Company law professional", "Incorporation and registry filings", "R"],
      ["Parent's controller", "Supplies the documents and approves the agreement", "C"],
      ["India country head", "Signs the local documents", "I"],
    ],
    calendar: [
      ["Day 0", "Kick-off call and the scope memo"],
      ["Day 1–15", "Name reservation and incorporation, with the tax numbers"],
      ["Within a month of incorporation", "First board meeting; first auditor appointed"],
      ["Day 15–30", "Bank account, the capital remitted, the inward remittance certificate"],
      ["On receiving the money", "Shares allotted inside the period the rules allow, or the money returned"],
      ["On allotment", "The return of allotment and the foreign investment reporting"],
      ["Day 20–40", "Tax registration, and the undertaking that lets services be exported without tax"],
      ["Before hiring", "Shop and establishment, professional tax, provident fund and insurance"],
      ["Day 30–60", "The intercompany service agreement and the pricing policy, signed"],
      ["Within the period after allotment", "Share certificates issued"],
      ["Within the first six months", "The declaration that business has commenced"],
      ["Day 60–90", "First month-end close, first invoice to the parent, first reporting pack"],
    ],
    inputs: [
      "The parent's incorporation certificate and constitutional documents, notarised and apostilled",
      "Board resolution of the parent to subscribe, and an authorised signatory letter",
      "Directors' passports, address proofs, photographs and signature certificates, with at least one resident director",
      "Registered office proof: ownership or lease, the owner's consent, a recent utility bill",
      "Proposed names, the main objects, and the capital",
      "The funding plan: equity or loan, how much and when",
      "The headcount plan for the first year",
      "The parent's reporting requirements: its accounting framework, its chart of accounts, its close calendar",
    ],
    steps: [
      {
        t: "Kick-off and the scope memo",
        why: "Most of what goes wrong with these engagements goes wrong here, in an unclear structure or an unclear funding plan.",
        how: "Confirm the activity and the route its investment follows, the entity type, the headcount, the funding mode, the locations and the parent's reporting needs. Agree the ninety-day plan.",
        out: "A scope memo and a plan, approved by the parent in writing.",
      },
      {
        t: "Name and incorporation",
        why: "An error in the objects or the capital is expensive to correct later.",
        how: "Reserve the name, draft the constitutional documents with the service objects, obtain the directors' identification numbers, confirm a resident director, and file for incorporation together with the tax numbers.",
        out: "Certificate of incorporation and both tax numbers.",
      },
      {
        t: "Bank account and the capital",
        why: "The clock on allotment starts the day the money arrives, whoever noticed.",
        how: "Open the account with an authorised dealer bank. The parent remits the subscription. Collect the inward remittance certificate and the bank's confirmation, and diary the allotment limit the day the money lands.",
        out: "Remittance certificate, bank confirmation, and the allotment date in the tracker.",
      },
      {
        t: "Allotment and the investment reporting",
        why: "Late reporting of foreign investment carries a fee and blocks later transactions.",
        how: "The board allots inside the period the rules allow, against a valuation where one is required. File the return of allotment and the investment report within their own periods.",
        out: "The allotment resolution, both filings acknowledged, and the share certificates.",
        ask: "The money has been in the account longer than the permitted period — that is a partner's conversation immediately.",
      },
      {
        t: "The first-year company law events",
        why: "A missed first-year event turns into a penalty and a messy first audit.",
        how: "Hold the first board meeting and appoint the first auditor inside the period allowed, open the statutory registers, file the auditor's appointment, and file the declaration that business has commenced.",
        out: "Minutes, registers and both filings.",
      },
      {
        t: "Tax and labour registrations",
        why: "Without the registration and the undertaking, the first invoice to the parent carries tax that should not be there.",
        how: "Register for the goods and services tax in the state of operation, file the undertaking before the first export invoice and renew it each year, register under the state's establishment law and for professional tax, and register for provident fund and insurance when the thresholds are crossed.",
        out: "Registration numbers and the undertaking's acknowledgement.",
        chk: "Whether a special-zone or software-park status is wanted — compare the benefit against the compliance cost before deciding.",
      },
      {
        t: "The intercompany agreement and the pricing policy",
        why: "The agreement decides the tax position, the pricing outcome, and when the money has to come in.",
        how: "Draft the service agreement: scope, the cost base, the mark-up, how often it is invoiced, and payment terms inside the period the central bank allows for realisation. Fix the mark-up from benchmarking or the safe harbour, whichever the partner approves.",
        out: "The signed agreement and a pricing note.",
        chk: "Avoid wording that makes the company look like an intermediary rather than a service provider.",
      },
      {
        t: "Set the accounting up",
        why: "A chart of accounts mapped once makes the parent's pack a by-product rather than a monthly argument.",
        how: "Map the Indian chart to the parent's, set the cost centres, write the capitalisation policy and the approval matrix, and agree the close calendar.",
        out: "The mapping, the policies and the calendar.",
      },
      {
        t: "Set the payroll up",
        why: "Payroll is the largest cost and it drives the cost base the invoice is built on.",
        how: "Salary structure, deduction on salary, provident fund and insurance, offer letter templates, and the treatment of any parent share plan for perquisite tax and recharge.",
        out: "The payroll master and the first run.",
      },
      {
        t: "First close and first invoice",
        why: "It proves the model works while the volumes are still small enough to fix.",
        how: "Run the first close, compute the cost base, apply the mark-up, raise the export invoice under the undertaking, and send the parent its pack.",
        out: "The first invoice, the first pack, and the receivable tracked against the remittance.",
      },
      {
        t: "Review at ninety days and hand over",
        why: "It turns a project into a recurring relationship, and stops the second month being a project again.",
        how: "Load every recurring obligation for the year into the system as jobs, hand over to the monthly team, and agree the recurring fee.",
        out: "The year's calendar live, and a signed recurring engagement letter.",
      },
    ],
    decisions: [
      [
        "Equity or a loan from the parent",
        "Equity is simpler. A borrowing follows the external commercial borrowing rules and adds reporting.",
      ],
      [
        "A special zone, a software park, or neither",
        "Compare the current benefit against the compliance cost; do not assume a holiday that has lapsed.",
      ],
      [
        "A company or a limited liability partnership",
        "Both are possible where the investment route allows it. Parents usually prefer a company.",
      ],
      [
        "Which accounting framework",
        "The one the thresholds require, with a bridge to the parent's — not the parent's framework in the Indian books.",
      ],
    ],
    controls: [
      "The partner signs the scope memo and the entity decision.",
      "The manager ties the investment report to the remittance amount and date, the allotment date, and the reporting clock.",
      "The undertaking's acknowledgement is on the file before the first invoice.",
      "The agreement is signed before the first invoice.",
      "The mark-up is approved by the parent in writing.",
    ],
    mistakes: [
      "Allotting shares after the permitted period from receiving the money.",
      "Missing the investment reporting window.",
      "Raising the first invoice before the undertaking is filed, so tax becomes payable.",
      "No resident director.",
      "Agreement wording that makes the company look like an intermediary.",
      "A mark-up agreed on email and never documented.",
    ],
    outputs: [
      "Scope memo and the ninety-day plan",
      "Incorporation documents and both tax numbers",
      "Allotment resolution and both filings",
      "Registrations and the export undertaking",
      "The intercompany agreement and the pricing note",
      "Chart-of-accounts mapping and the close calendar",
      "First invoice and first reporting pack",
      "The year's compliance calendar, as jobs",
    ],
    refs: [
      "The company law provisions on the declaration of commencement, the return of allotment, share certificates, the first auditor and the resident director requirement",
      "The foreign exchange rules on non-debt instruments and the central bank's reporting directions",
      "The tax provisions on zero-rated supply and the undertaking that replaces a bond",
      "The transfer pricing provisions, and the safe harbour rules if they are being used",
      "The provident fund, insurance and state establishment laws",
    ],
  },

  // =====================================================================
  {
    id: "D3",
    shelf: "D",
    title: "The monthly close to a parent's calendar",
    full: true,
    screens: ["practice.tb", "engagements.work", "lab"],
    out: "Books closed, the intercompany invoice raised and the parent's pack sent by the fifth working day, with the Indian filings on time.",
    applies:
      "A captive, or any company reporting monthly to a parent or an investor. The same steps serve a mid-sized business on a longer calendar.",
    raci: [
      ["Manager", "Owns the calendar and signs off the pack", "A"],
      ["Staff", "Posts the entries and prepares the reconciliations", "R"],
      ["Article", "Bank, vendor and payroll schedules", "R"],
      ["Client's finance lead", "Accrual inputs and approvals", "C"],
      ["Parent's planning team", "Receives the pack and raises queries", "I"],
    ],
    calendar: [
      ["Three days before month end", "Cut-off reminders out; the open purchase order list"],
      ["Day 1", "Bank and cash reconciled, payroll posted, accruals collected"],
      ["Day 2", "Intercompany reconciliation, fixed assets, prepayments"],
      ["Day 3", "Cost base, mark-up, the invoice; tax and deduction provisions"],
      ["Day 4", "Review, variance analysis, the pack drafted"],
      ["Day 5", "Pack submitted, signed off and archived"],
      ["Monthly and quarterly", "The Indian filings, on the dates in the firm's rules"],
    ],
    inputs: [
      "Bank statements for every account",
      "Payroll register and the statutory challans",
      "Vendor invoices received, and the open purchase order list",
      "Department accrual inputs: services received and not yet billed",
      "Fixed asset additions and disposals",
      "The month-end exchange rate, from the agreed source",
      "The parent's chart of accounts and its pack template",
    ],
    steps: [
      {
        t: "Before the close",
        why: "Almost every late close is late because an input was late.",
        how: "Send the cut-off reminders three days out, list the open purchase orders and the expected accruals, and confirm the rate source.",
        out: "The accrual input list and the close checklist, opened on the job.",
      },
      {
        t: "Bank and cash",
        why: "Everything else depends on cash being right.",
        how: "Reconcile every account, clear the old items, record charges and interest.",
        out: "Reconciliations with nothing unexplained older than a month.",
      },
      {
        t: "Payroll",
        why: "It is the largest cost and it drives the cost base.",
        how: "Post from the register, record the statutory liabilities, and tie the headcount to what the people team says it is.",
        out: "The payroll journal and the liability schedule.",
      },
      {
        t: "Accruals and prepayments",
        why: "Without the accruals the cost base — and therefore the invoice — is understated, which is a pricing problem as well as an accounting one.",
        how: "Accrue services received and not billed, amortise the prepayments, and reverse last month's accruals.",
        out: "Accrual and prepayment schedules.",
      },
      {
        t: "Fixed assets",
        why: "Capital treated as revenue distorts both the cost base and the tax.",
        how: "Capitalise above the policy threshold, move completed work in progress, charge depreciation, record disposals.",
        out: "The asset roll-forward.",
      },
      {
        t: "The intercompany invoice",
        why: "This is the company's revenue and the base for both the tax position and the pricing outcome.",
        how: "Compute the cost base as the agreement defines it, excluding agreed pass-through costs, apply the mark-up, raise the export invoice under the undertaking, and revalue foreign currency balances at the closing rate.",
        out: "The cost-base working, the invoice, and the receivable aged against the remittances.",
        chk: "Receivables approaching the realisation period the central bank allows.",
      },
      {
        t: "The Indian filings",
        why: "The monthly close is also the month's compliance.",
        how: "Tax: the invoice register, credit against the statement, and the refund position where credit accumulates. Deduction at source: the liability by section, deposited by its date.",
        out: "The workings and the challans.",
      },
      {
        t: "Review and the variances",
        why: "The parent will ask about every movement, and the answer should not be prepared twice.",
        how: "Compare against budget and against last month, explain anything over the agreed threshold, and look at cost per person.",
        out: "The variance commentary.",
      },
      {
        t: "The reporting pack",
        why: "The parent consolidates from it, so a late correction is a group-level correction.",
        how: "Map to the parent's chart, add the bridge where its framework differs, and fill the template.",
        out: "The pack and the framework bridge.",
      },
      {
        t: "Sign off and archive",
        why: "It is the evidence for the audit and for the year-end pricing documentation.",
        how: "The manager signs the checklist; the reconciliations and the pack go in the month's folder; open items carry to next month with owners.",
        out: "The signed checklist and the open-items list.",
      },
    ],
    decisions: [
      [
        "Which costs are pass-through",
        "Follow the agreement. If it is silent, raise it with the partner — it changes the pricing outcome.",
      ],
      [
        "Is the mark-up applied to share-based compensation",
        "Follow the pricing policy, and document the decision once rather than every month.",
      ],
      [
        "What is material enough to accrue",
        "Agree a threshold with the client in writing, and apply it both ways.",
      ],
    ],
    controls: [
      "The manager reviews every reconciliation that has a balance.",
      "The invoice's cost base ties to the trial balance.",
      "Receivables older than the realisation period are flagged to the partner.",
      "The variance commentary is reviewed before the pack leaves.",
    ],
    mistakes: [
      "Missing accruals, so the invoice is short and the margin looks wrong.",
      "Invoicing before the export undertaking is renewed for the new year.",
      "A different exchange-rate source each month.",
      "Forgetting to reverse last month's accruals.",
    ],
    outputs: [
      "Bank, payroll, accrual, prepayment and fixed asset schedules",
      "The cost-base working and the intercompany invoice",
      "Tax and deduction workings",
      "Variance commentary",
      "The reporting pack and the framework bridge",
      "The signed close checklist",
    ],
    refs: [
      "The accounting standard on foreign currency: monetary items at the closing rate",
      "The tax provisions on zero-rated supply and the export undertaking",
      "The transfer pricing provisions",
      "The firm's confirmed due-date rules for the monthly filings",
    ],
  },
];

/**
 * The playbooks the firm has not written yet, listed so that what is
 * missing is visible. Each one is a title and the shelf it belongs on.
 *
 * @type {Array<{id: string, shelf: string, title: string}>}
 */
export const PLANNED = [
  { id: "A1", shelf: "A", title: "Accepting a client: know-your-client and independence" },
  { id: "A2", shelf: "A", title: "Engagement letters and scope" },
  { id: "A3", shelf: "A", title: "The recurring compliance cycle" },
  { id: "A4", shelf: "A", title: "Handling a notice end to end" },
  { id: "A5", shelf: "A", title: "Billing, collections and the fee review" },
  { id: "A6", shelf: "A", title: "Quality management and peer review readiness" },

  { id: "B1", shelf: "B", title: "Month-end close for a small business" },
  { id: "B2", shelf: "B", title: "Which accounting framework applies" },
  { id: "B3", shelf: "B", title: "Financial statements from the trial balance" },
  { id: "B5", shelf: "B", title: "Revenue recognition in practice" },
  { id: "B6", shelf: "B", title: "Inventory: costing, realisable value and counts" },
  { id: "B7", shelf: "B", title: "Fixed assets and depreciation" },
  { id: "B8", shelf: "B", title: "Payroll and employee benefits" },
  { id: "B9", shelf: "B", title: "Tax accounting and the monthly reconciliation" },
  { id: "B10", shelf: "B", title: "Deduction at source: accounting and matching the credit" },
  { id: "B11", shelf: "B", title: "Related parties" },
  { id: "B12", shelf: "B", title: "Provisions and contingencies" },
  { id: "B13", shelf: "B", title: "The cash flow statement" },
  { id: "B14", shelf: "B", title: "Borrowings, covenants and the bank's statements" },
  { id: "B15", shelf: "B", title: "Consolidation, the basics" },

  { id: "C1", shelf: "C", title: "Forming a company, a partnership or a limited liability partnership" },
  { id: "C2", shelf: "C", title: "Startup recognition" },
  { id: "C3", shelf: "C", title: "The annual registry calendar" },
  { id: "C4", shelf: "C", title: "Striking off and closing down" },

  { id: "D1", shelf: "D", title: "Choosing the entry structure" },
  { id: "D4", shelf: "D", title: "Bridging to the parent's accounting framework" },
  { id: "D5", shelf: "D", title: "The transfer pricing cycle" },
  { id: "D6", shelf: "D", title: "Export of services and the refund" },
  { id: "D7", shelf: "D", title: "Foreign exchange and central bank reporting" },
  { id: "D8", shelf: "D", title: "Payroll, share plans and secondees" },
  { id: "D9", shelf: "D", title: "Year end and the audits" },
  { id: "D10", shelf: "D", title: "Controls for the parent" },
  { id: "D11", shelf: "D", title: "Direct tax for a captive" },
  { id: "D12", shelf: "D", title: "Scaling, restructuring or exiting" },

  { id: "E1", shelf: "E", title: "The statutory audit, start to finish" },
  { id: "E2", shelf: "E", title: "The tax audit" },
  { id: "E3", shelf: "E", title: "Bank branch and stock audits" },
  { id: "E4", shelf: "E", title: "Due diligence" },
];

/** @param {string} id */
export function playbookFor(id) {
  return PLAYBOOKS.find((book) => book.id === id) ?? null;
}

/** Every playbook on a shelf, written ones first. */
export function shelfContents(shelfId) {
  return [
    ...PLAYBOOKS.filter((book) => book.shelf === shelfId),
    ...PLANNED.filter((book) => book.shelf === shelfId).map((book) => ({
      ...book,
      full: false,
      out: "Not written yet.",
    })),
  ];
}

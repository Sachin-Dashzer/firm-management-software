// @ts-check

/**
 * Eight documents a Chartered Accountancy firm writes constantly (P2-8b).
 *
 * **Every word below is a draft and the system treats it as one.** None of
 * these templates is approved, so each produces a watermarked draft and
 * nothing else until a partner reads the wording and approves it in
 * Settings → Document templates.
 *
 * Why so cautious about letters: these go out over the firm's name, several
 * of them to another member of the Institute or to a regulator, and some
 * carry professional obligations in their wording — the communication with a
 * previous auditor and the consent to act are the clear examples. The
 * drafting below is ordinary professional correspondence, written plainly;
 * it is **not** taken from an ICAI pro forma, and where a form of words is
 * prescribed the firm's own version must replace it. `sourceNote` says so on
 * every row, and the approval screen shows it.
 *
 * Nothing here quotes a statute, a section number or a due date — the same
 * rule the due-date master follows (CLAUDE.md rule 8).
 */

const DRAFTED = "Drafted plainly for the firm to rewrite. Not an ICAI pro forma.";

/** @type {Array<Record<string, any>>} */
export const STARTER_DOC_TEMPLATES = [
  {
    code: "ENG-LETTER",
    name: "Engagement letter",
    kind: "Engagement",
    description:
      "Sent when work is taken on: what we will do, what we need, and what it costs.",
    title: "Engagement letter",
    partnerOnly: false,
    sourceNote: `${DRAFTED} The scope and fee paragraphs in particular are the firm's to settle.`,
    body: `{{doc.date}}

{{client.legalName}}
{{client.address}}

Kind attention: {{client.contactName}}, {{client.contactDesignation}}

Dear Sir / Madam,

Sub: {{engagement.service}} for {{engagement.period}}

Thank you for asking us to act for you. This letter sets out what we have agreed, so that both of us have the same understanding of the work.

Scope of the work
We will carry out {{engagement.service}} for the period {{engagement.period}}.

What we need from you
We will need the books, records, statements and explanations relevant to the work, and these should reach us in good time before any applicable deadline. The records remain yours and responsibility for their completeness and accuracy rests with you.

Our fee
Our fee for this work is {{engagement.fee}}, payable as agreed. Taxes and out-of-pocket expenses, where applicable, are charged in addition.

Please sign and return a copy of this letter to confirm that it reflects our agreement.

Yours faithfully,

For {{firm.name}}
Chartered Accountants
Firm Registration No. {{firm.frn}}

{{signatory.name}}
{{signatory.designation}}
Membership No. {{signatory.membershipNo}}
Place: {{doc.place}}`,
  },

  {
    code: "MRL",
    name: "Management representation letter",
    kind: "Audit and Assurance",
    description:
      "The letter the client signs and returns to us at the close of an audit.",
    title: "Management representation letter",
    partnerOnly: false,
    sourceNote: `${DRAFTED} The representations an audit actually needs vary with the engagement — add and remove them for each job.`,
    body: `{{doc.date}}

To
{{firm.name}}
Chartered Accountants
{{firm.address}}

Dear Sirs,

Sub: {{engagement.service}} — {{engagement.period}}

This representation letter is given in connection with your audit of the financial statements of {{client.legalName}} for {{engagement.period}}.

We confirm, to the best of our knowledge and belief, that:

1. We are responsible for the preparation of the financial statements and for the internal controls relevant to their preparation.
2. We have made available to you all books of account, records, and supporting documentation, and all minutes of meetings.
3. We have disclosed to you all known instances of non-compliance with laws and regulations, and all known or suspected fraud affecting the entity.
4. All transactions have been recorded in the accounting records and are reflected in the financial statements.
5. We have disclosed to you the identity of all related parties and all related party relationships and transactions of which we are aware.
6. There are no claims, litigation or other contingencies that require disclosure and have not been disclosed to you.

Yours faithfully,

For {{client.legalName}}

{{client.contactName}}
{{client.contactDesignation}}
Place: {{doc.place}}`,
  },

  {
    code: "PREV-AUD-COMM",
    name: "Communication with the previous auditor",
    kind: "Correspondence",
    description:
      "Written to the outgoing auditor before an appointment is accepted.",
    title: "Communication with the previous auditor",
    partnerOnly: true,
    sourceNote:
      "DRAFT WORDING — this letter carries a professional obligation and its form is the firm's to settle with reference to the Institute's current guidance. Not an ICAI pro forma.",
    body: `{{doc.date}}

To
The Previous Auditor

Dear Sir / Madam,

Sub: Proposed appointment as auditors of {{client.legalName}}

We have been approached by {{client.legalName}} in connection with our appointment as their auditors.

Before we take any decision on the proposed appointment, we write to ask whether there is any professional reason, or any other circumstance, why we should not accept it.

We would be grateful for your reply at your early convenience. If we do not hear from you, we will follow up before proceeding.

Yours faithfully,

For {{firm.name}}
Chartered Accountants
Firm Registration No. {{firm.frn}}

{{signatory.name}}
{{signatory.designation}}
Membership No. {{signatory.membershipNo}}`,
  },

  {
    code: "NOC-PREV-AUD",
    name: "No objection to the incoming auditor",
    kind: "Correspondence",
    description:
      "Our reply when we are the outgoing auditor and another firm writes to us.",
    title: "No objection",
    partnerOnly: true,
    sourceNote: `${DRAFTED} Whether there is in fact no objection is a judgement for the partner every single time — do not send this one unread.`,
    body: `{{doc.date}}

To
The Incoming Auditor

Dear Sir / Madam,

Sub: Proposed appointment as auditors of {{client.legalName}}

We refer to your letter regarding your proposed appointment as auditors of {{client.legalName}}.

We have no objection to your accepting the appointment.

Yours faithfully,

For {{firm.name}}
Chartered Accountants
Firm Registration No. {{firm.frn}}

{{signatory.name}}
{{signatory.designation}}
Membership No. {{signatory.membershipNo}}`,
  },

  {
    code: "CONSENT-AUD",
    name: "Consent to act as auditor",
    kind: "Engagement",
    description:
      "Our written consent, given to the company on appointment.",
    title: "Consent to act as auditor",
    partnerOnly: true,
    sourceNote:
      "DRAFT WORDING — a consent and the eligibility certificate that accompanies it are governed by company law, and the required statements are the firm's to confirm. Nothing statutory is quoted here on purpose.",
    body: `{{doc.date}}

To
The Board of Directors
{{client.legalName}}
{{client.address}}

Dear Sirs,

Sub: Consent to act as auditors

We refer to the proposal for our appointment as auditors of {{client.legalName}}.

We give our consent to act as auditors of the company if appointed, and confirm that we are eligible and not disqualified from being so appointed.

Yours faithfully,

For {{firm.name}}
Chartered Accountants
Firm Registration No. {{firm.frn}}

{{signatory.name}}
{{signatory.designation}}
Membership No. {{signatory.membershipNo}}`,
  },

  {
    code: "BAL-CONF",
    name: "Balance confirmation request",
    kind: "Audit and Assurance",
    description:
      "Sent to a debtor, creditor or bank during an audit, asking them to confirm a balance.",
    title: "Request for confirmation of balance",
    partnerOnly: false,
    sourceNote: `${DRAFTED} The balance and the date are filled in by hand on the draft before it is issued.`,
    body: `{{doc.date}}

Dear Sir / Madam,

Sub: Confirmation of balance — {{client.legalName}}

We are the auditors of {{client.legalName}} and are carrying out {{engagement.service}} for {{engagement.period}}.

For the purpose of our audit, we request you to confirm the balance outstanding between yourself and {{client.legalName}} as at the date below, directly to us at the address on this letter.

Balance as per the books of {{client.legalName}}: ______________________
As at: ______________________

If the balance does not agree with your records, we would be grateful for a statement of the difference.

This request is for audit purposes only and is not a demand for payment.

Yours faithfully,

For {{firm.name}}
Chartered Accountants
Firm Registration No. {{firm.frn}}

{{signatory.name}}
{{signatory.designation}}
Membership No. {{signatory.membershipNo}}`,
  },

  {
    code: "NETWORTH-CERT",
    name: "Net worth certificate",
    kind: "Certificate",
    description:
      "A certificate of net worth, issued against a UDIN. Partner only.",
    title: "Certificate of net worth",
    partnerOnly: true,
    udinRequired: true,
    sourceNote:
      "DRAFT WORDING — a certificate states a fact the firm is answerable for. The figures, the basis and the records relied upon are filled in on the draft, and the wording is the partner's to settle.",
    body: `{{doc.date}}

TO WHOMSOEVER IT MAY CONCERN

Sub: Certificate of net worth of {{client.legalName}}

We have examined the books of account and other relevant records of {{client.legalName}}, {{client.entityType}}, having its place of business at {{client.address}}.

On the basis of our examination and according to the information and explanations given to us, we certify that the net worth of {{client.legalName}} as at ______________________ is Rs. ______________________ (Rupees ______________________ only).

Basis and records relied upon: ______________________

This certificate is issued at the request of the client for ______________________ and should not be used for any other purpose.

For {{firm.name}}
Chartered Accountants
Firm Registration No. {{firm.frn}}

{{signatory.name}}
{{signatory.designation}}
Membership No. {{signatory.membershipNo}}
UDIN: {{engagement.udin}}
Place: {{doc.place}}`,
  },

  {
    code: "FILING-ACK",
    name: "Filing acknowledgement letter",
    kind: "Correspondence",
    description:
      "Sent to the client once a return or form has gone in, with the acknowledgement.",
    title: "Filing completed",
    partnerOnly: false,
    sourceNote: `${DRAFTED} The shortest of the eight, and the one most likely to be sent as it stands.`,
    body: `{{doc.date}}

{{client.legalName}}
{{client.address}}

Kind attention: {{client.contactName}}

Dear Sir / Madam,

Sub: {{engagement.service}} — {{engagement.period}}

We are writing to confirm that the above has been filed on {{engagement.filedOn}}.

A copy of the acknowledgement is enclosed for your records. Please keep it with your papers for the year.

Do let us know if you would like anything explained.

Yours faithfully,

For {{firm.name}}
Chartered Accountants

{{signatory.name}}
{{signatory.designation}}`,
  },

  // --- onboarding --------------------------------------------------------
  {
    code: "PROPOSAL",
    name: "Proposal and fee quote",
    kind: "Onboarding",
    description:
      "Sent after the first meeting: what we propose to do and what it costs.",
    title: "Proposal for professional services",
    partnerOnly: false,
    sourceNote: `${DRAFTED} The scope, the fee and how long the quote stands are the partner's to settle on every proposal.`,
    body: `{{firm.name}}, Chartered Accountants (FRN {{firm.frn}})
{{firm.address}}

Date: {{doc.date}}

To
{{client.contactName}}, {{client.contactDesignation}}
{{client.legalName}}
{{client.address}}

Sub: Proposal for professional services

Dear Sir / Madam,

Thank you for considering us. Based on our discussion, we propose the following services for {{client.legalName}} ({{client.entityType}}, PAN [PAN]):

[Services and fees — one line each, from the client's record]

Fees are exclusive of GST and of government fees, which are charged at actuals. Fees are payable within 15 days of invoice. Work begins once the engagement letter is signed and the documents in our request have reached us.

This proposal is valid for 30 days from the date above.

Yours faithfully,

For {{firm.name}}
Chartered Accountants
FRN {{firm.frn}}

{{signatory.name}}
{{signatory.designation}}, M. No. {{signatory.membershipNo}}`,
  },

  {
    code: "KYC-REQUEST",
    name: "Document request on taking a client on",
    kind: "Onboarding",
    description:
      "The opening list of papers, which the onboarding wizard fills from the entity type.",
    title: "Documents we need to set you up",
    partnerOnly: false,
    sourceNote: `${DRAFTED} The list itself comes from the entity type on the client's record; this is the covering note around it.`,
    body: `Dear {{client.contactName}},

Welcome to {{firm.name}}. To set {{client.legalName}} ({{client.entityType}}) up with us, please send:

[The document list for this entity type — from the onboarding checklist]

You can upload them on the client portal or reply to this message with photographs or PDFs. Each file is saved to your file as it arrives, and nothing needs to be sent twice.

Thank you,

{{signatory.name}}
{{firm.name}}`,
  },

  {
    code: "PORTAL-AUTHORITY",
    name: "Authority letter for portal access",
    kind: "Onboarding",
    description:
      "The client's authority for the firm to act on the tax portals on their behalf.",
    title: "Authority to act on the portals",
    partnerOnly: false,
    sourceNote:
      "DRAFT WORDING — an authority letter is relied on by somebody outside the firm. Have it checked, and confirm with the client exactly which portals it covers before it is signed.",
    body: `[On the letterhead of {{client.legalName}}]

To whomsoever it may concern

Date: {{doc.date}}

We, {{client.legalName}} (PAN [PAN], GSTIN {{client.gstin}}), authorise {{firm.name}}, Chartered Accountants (FRN {{firm.frn}}), and its staff to access the income-tax, GST, TRACES and MCA portals on our behalf, to file the returns and replies we have approved, and to receive communications relating to them.

This authority remains valid until it is withdrawn by us in writing.

For {{client.legalName}}

{{client.contactName}}
{{client.contactDesignation}}
Place: {{doc.place}}`,
  },

  {
    code: "WELCOME-MSG",
    name: "Welcome message",
    kind: "Messages",
    description:
      "The first message after onboarding: who looks after them, and what to expect from us.",
    title: "Welcome to the firm",
    partnerOnly: false,
    sourceNote: `${DRAFTED} Short on purpose — it is read on a phone.`,
    body: `Hello {{client.contactName}}, welcome to {{firm.name}}.

Your client partner is {{signatory.name}}. From now on you will get reminders, filing confirmations and invoices from us at this address.

You can ask us anything: what is due next, what we still need from you, or what you owe.

Portal: [portal address] — we will send your user ID separately.

{{firm.name}}
{{firm.email}} · {{firm.phone}}`,
  },

  // --- audit -------------------------------------------------------------
  {
    code: "ENG-LETTER-AUDIT",
    name: "Engagement letter — statutory audit",
    kind: "Audit and Assurance",
    description:
      "The audit engagement letter: objective, scope, and what is management's responsibility.",
    title: "Engagement letter — audit of the financial statements",
    partnerOnly: true,
    sourceNote:
      "DRAFT WORDING ONLY. An audit engagement letter has required content under the Standards on Auditing, and the wording below is ordinary professional drafting rather than any prescribed form. The engagement partner must settle it against the standard in force before it is sent.",
    body: `{{firm.name}}, Chartered Accountants (FRN {{firm.frn}})
{{firm.address}}

Date: {{doc.date}}

To
The Board of Directors
{{client.legalName}}
{{client.address}}

Sub: Audit of the financial statements for {{engagement.period}}

Dear Sirs,

You have asked us to audit the financial statements of {{client.legalName}} for {{engagement.period}}. This letter confirms our acceptance and our understanding of the engagement.

Objective and scope
We will conduct our audit in accordance with the Standards on Auditing, with the objective of expressing an opinion on whether the financial statements give a true and fair view, and of reporting on the other matters we are required to report on.

Management's responsibility
The preparation of the financial statements, the maintenance of adequate accounting records including the audit trail required of the accounting software, the internal controls relevant to their preparation, and giving us access to all information, records and persons are the responsibility of management.

What an audit cannot do
Because of the inherent limitations of an audit, together with the inherent limitations of internal control, some material misstatements may remain undetected even though the audit is properly planned and performed.

Our report
The form and content of our report may need to change in the light of our findings.

We will ask for written representations from management at the end of the audit.

Fee: {{engagement.fee}}, plus taxes and out-of-pocket expenses.

Please sign and return a copy of this letter.

For {{firm.name}}
Chartered Accountants
FRN {{firm.frn}}

{{signatory.name}}
{{signatory.designation}}, M. No. {{signatory.membershipNo}}

Acknowledged for {{client.legalName}}

{{client.contactName}}, {{client.contactDesignation}}
Date:`,
  },

  {
    code: "MGMT-LETTER",
    name: "Management letter",
    kind: "Audit and Assurance",
    description:
      "The control weaknesses and housekeeping points that came out of an audit, with recommendations.",
    title: "Matters arising from our audit",
    partnerOnly: true,
    sourceNote:
      "DRAFT WORDING — the points themselves come from the audit file. Communicating deficiencies in internal control is a requirement of the Standards on Auditing; which deficiencies are significant is a judgement for the engagement partner.",
    body: `{{firm.name}}, Chartered Accountants (FRN {{firm.frn}})
{{firm.address}}

Date: {{doc.date}}

To
The Board of Directors
{{client.legalName}}

Sub: Matters arising from our audit for {{engagement.period}}

Dear Sirs,

During the course of our audit we noted the matters set out below. They do not change our opinion on the financial statements, and we bring them to your attention so that they can be addressed.

1. [Observation]
   Recommendation: [Recommendation]
   Management's response: [Response]

2. [Observation]
   Recommendation: [Recommendation]
   Management's response: [Response]

This letter is prepared solely for the information of the Board and should not be used for any other purpose.

For {{firm.name}}
Chartered Accountants
FRN {{firm.frn}}

{{signatory.name}}
{{signatory.designation}}, M. No. {{signatory.membershipNo}}`,
  },

  // --- notices -----------------------------------------------------------
  {
    code: "NOTICE-REPLY-IT",
    name: "Reply to an income-tax notice",
    kind: "Notices",
    description:
      "The skeleton of a point-wise reply: what was asked, what we say, what is enclosed.",
    title: "Reply to notice",
    partnerOnly: false,
    sourceNote:
      "SKELETON ONLY. The section and form are copied from the notice being answered; nothing here states a legal position. Every ground, and the whole reply, is for the partner in charge of the matter to settle.",
    body: `To
The Assessing Officer / National Faceless Assessment Centre
[Office as printed on the notice]

Sub: Reply to notice [section as printed on the notice] — {{client.legalName}} — PAN [PAN] — [assessment year] — DIN [DIN]

Respected Sir / Madam,

With reference to the above notice, the assessee submits as follows.

1. Information called for
   [Point-wise reply against each item of the notice]

2. Documents enclosed
   [Index of annexures]

3. Submissions
   [Explanation, and any position the partner has settled]

The assessee requests that the submissions above be considered, and that an opportunity of being heard be given before any adverse view is taken.

For {{client.legalName}}

Authorised representative: {{firm.name}}, Chartered Accountants (FRN {{firm.frn}})
{{signatory.name}}, {{signatory.designation}}, M. No. {{signatory.membershipNo}}
Date: {{doc.date}}`,
  },

  {
    code: "NOTICE-REPLY-GST",
    name: "Reply to a GST scrutiny notice",
    kind: "Notices",
    description:
      "Discrepancy-wise reply with the reconciliation attached, for filing on the portal.",
    title: "Reply to scrutiny notice",
    partnerOnly: false,
    sourceNote:
      "SKELETON ONLY. The form, the reference and the discrepancies are copied from the notice; the explanation and any tax paid are the firm's to settle with the client.",
    body: `Reply to notice [form as printed on the notice]

GSTIN: {{client.gstin}}
Legal name: {{client.legalName}}
Reference and date of notice: [reference] dated [date], for [period]

Discrepancy-wise reply

1. Discrepancy as stated: [as printed]
   Explanation: [reason — for example, credit notes reported in a later month]
   Reconciliation: Annexure A

2. Discrepancy as stated: [as printed]
   Explanation: [reason]
   Reconciliation: Annexure B

Where tax has been found payable it has been paid, with interest, vide [payment reference].

We request that the proceedings be dropped.

For {{client.legalName}}
Authorised signatory

Prepared by {{firm.name}}, Chartered Accountants (FRN {{firm.frn}})
Date: {{doc.date}}`,
  },

  {
    code: "ADJOURNMENT",
    name: "Adjournment request",
    kind: "Notices",
    description: "Asking for more time before a hearing date.",
    title: "Request for adjournment",
    partnerOnly: false,
    sourceNote: `${DRAFTED} How much time is asked for, and the reason, are for the partner in charge of the matter.`,
    body: `To
[Authority as printed on the notice]

Sub: Request for adjournment — {{client.legalName}} — PAN [PAN] — [notice reference / DIN]

Respected Sir / Madam,

The hearing in the above matter is fixed for [date]. The assessee needs further time to [collect the records / complete the reconciliation] and requests an adjournment of [number] days.

The assessee assures your good self of full cooperation in the proceedings.

For {{client.legalName}}

Authorised representative: {{firm.name}}
{{signatory.name}}, {{signatory.designation}}
Date: {{doc.date}}`,
  },

  {
    code: "RECTIFICATION",
    name: "Rectification request",
    kind: "Notices",
    description:
      "Asking for a mistake apparent from the record to be corrected, with the correct position.",
    title: "Application for rectification",
    partnerOnly: false,
    sourceNote:
      "SKELETON ONLY. What is apparent from the record, and under which provision the application is made, is for the partner to settle against the order being rectified.",
    body: `To
[Assessing Officer / Centralised Processing Centre]

Sub: Application for rectification of a mistake apparent from the record — {{client.legalName}} — PAN [PAN] — [assessment year]

Respected Sir / Madam,

In the order / intimation dated [date] bearing [reference], the following mistake is apparent from the record:

[Describe the mistake, with the figure as processed and the correct figure]

The correct position, with the supporting records, is enclosed at Annexure A.

The assessee requests that the order be rectified and consequential relief granted.

For {{client.legalName}}

Authorised representative: {{firm.name}}
{{signatory.name}}, {{signatory.designation}}
Date: {{doc.date}}`,
  },

  // --- ROC ---------------------------------------------------------------
  {
    code: "BR-ACCOUNTS",
    name: "Board resolution — approval of the accounts",
    kind: "ROC",
    description:
      "The resolution a company passes to approve its financial statements and authorise signing.",
    title: "Certified true copy of the resolution",
    partnerOnly: false,
    sourceNote:
      "DRAFT WORDING — a resolution is the company's own document, passed by its board and signed by its directors. The firm drafts it; the company adopts it. Have the wording checked by whoever advises the company on company law.",
    body: `[On the letterhead of {{client.legalName}}]

CERTIFIED TRUE COPY OF THE RESOLUTION PASSED AT THE MEETING OF THE BOARD OF DIRECTORS OF {{client.legalName}} HELD ON [date] AT [place]

"RESOLVED THAT the audited financial statements of the company for {{engagement.period}}, comprising the balance sheet, the statement of profit and loss, the cash flow statement and the notes, together with the auditor's report thereon, be and are hereby approved.

RESOLVED FURTHER THAT [names of the directors] be and are hereby authorised to sign the financial statements on behalf of the Board, and to do all such acts as may be necessary to lay them before the members and to file them."

For {{client.legalName}}

[Director]
DIN [DIN]
Date: {{doc.date}}`,
  },

  // --- certificates ------------------------------------------------------
  {
    code: "TURNOVER-CERT",
    name: "Turnover certificate",
    kind: "Certificate",
    description:
      "A certificate of turnover for a tender, a bank or a registration. Partner only.",
    title: "Certificate of turnover",
    partnerOnly: true,
    udinRequired: true,
    sourceNote:
      "DRAFT WORDING — a certificate states a fact the firm is answerable for. The years, the figures, the records examined and the purpose are filled in on the draft, and the wording is the partner's to settle.",
    body: `{{doc.date}}

TO WHOMSOEVER IT MAY CONCERN

Sub: Certificate of turnover of {{client.legalName}}

We have examined the books of account, the audited financial statements and the returns filed under the goods and services tax law of {{client.legalName}} ({{client.entityType}}, PAN [PAN], GSTIN {{client.gstin}}).

On the basis of our examination, and according to the information and explanations given to us, we certify that the turnover of {{client.legalName}} is as follows:

[Year]: Rs. ______________________
[Year]: Rs. ______________________

Records examined: ______________________

This certificate is issued at the request of the client for ______________________ and should not be used for any other purpose.

For {{firm.name}}
Chartered Accountants
Firm Registration No. {{firm.frn}}

{{signatory.name}}
{{signatory.designation}}
Membership No. {{signatory.membershipNo}}
UDIN: {{engagement.udin}}
Place: {{doc.place}}`,
  },

  // --- messages ----------------------------------------------------------
  {
    code: "DOC-REMINDER",
    name: "Document reminder",
    kind: "Messages",
    description: "A short chase for papers we are still waiting for.",
    title: "Documents still awaited",
    partnerOnly: false,
    sourceNote: `${DRAFTED} Kept short deliberately: a reminder that has to be scrolled is not read.`,
    body: `Hello {{client.contactName}},

A reminder from {{firm.name}}: we are still waiting for the papers for {{engagement.service}}, {{engagement.period}}.

Still to come: [what is outstanding]

You can send photographs or PDFs in reply to this message, or upload them on the portal — either reaches the right job.

Thank you,
{{signatory.name}}
{{firm.name}}`,
  },

  {
    code: "PAY-REMINDER",
    name: "Payment reminder",
    kind: "Messages",
    description: "A reminder of what is outstanding, with how to pay it.",
    title: "Payment reminder",
    partnerOnly: false,
    sourceNote: `${DRAFTED} The amount and the invoice number are filled from the invoice; how firmly it is put is a judgement for the person sending it.`,
    body: `Hello {{client.contactName}},

Invoice [number] for [amount] is outstanding with {{firm.name}} for {{client.legalName}}.

You can pay by bank transfer to the account on the invoice, or by UPI at [payment link]. The receipt reaches you automatically once it is matched.

If it has already been paid, please ignore this and send us the reference so we can match it.

Thank you,
{{signatory.name}}
{{firm.name}}
{{firm.email}} · {{firm.phone}}`,
  },
];

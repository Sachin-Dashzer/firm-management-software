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
];

// @ts-check

/**
 * How we work here: the firm's procedure for each screen (the owner's
 * content of 02-11-2026).
 *
 * This file reverses an earlier decision and it is worth saying why. The
 * stance in `screens.js` was that the system ships **no** procedures,
 * because a procedure telling PHMG's staff how PHMG works, written by
 * somebody who has never worked there, is worse than none. The owner's
 * answer is that these are not a stranger's words — they are the firm's
 * own, written in the brief, and the alternative in practice was a
 * handbook of forty blank pages that nobody was ever going to fill in on a
 * Tuesday.
 *
 * So: these are **the firm's starting draft**, and the screen says so on
 * every one of them until a partner has read it and marked it reviewed.
 * Anything written in the app replaces the draft entirely — a firm-written
 * procedure wins, always, and is never merged with this.
 *
 * What is **not** in here, on purpose (CLAUDE.md rule 8): a statutory date,
 * a rate, a threshold or a limit. Where one matters the line says to read
 * it off the firm's own confirmed rules. A handbook that quotes last
 * year's due date is how a filing is missed on purpose.
 *
 * @typedef {object} StarterSop
 * @property {string} title
 * @property {string} why          one line: what the screen is for
 * @property {string[]} road       the flow, as the strip at the top draws it
 * @property {{partner?: string, staff?: string}} you  what your part is
 * @property {string} when         when this procedure is followed
 * @property {string[]} steps
 * @property {string} done         how you know it is finished
 * @property {string[]} avoid
 * @property {string} ask          who to ask when it goes wrong
 */

/** The line every drafted procedure carries until a partner reviews it. */
export const STARTER_NOTE =
  "The firm's starting draft. A partner reads it, corrects it and marks it reviewed — until then it is a draft, and anything a partner writes here replaces it.";

/** @type {Record<string, StarterSop>} */
export const STARTER_SOPS = {
  issues: {
    title: "Working from Issues",
    why: "Your daily start: everything that is late, blocked or waiting, with the button that fixes it.",
    road: ["Urgent first", "Act from the row", "It disappears when fixed"],
    you: {
      partner:
        "Start the day here. Clear the red rows or give each one an owner.",
      staff: "Work through Mine from the top.",
    },
    when: "First thing every morning, and once after lunch.",
    steps: [
      "Filter to Mine.",
      "Do the urgent rows first — overdue work and a reply with no draft.",
      "Use the button on the row: it does the real thing, not a note about it.",
      "If you cannot fix it, open it and write on the job what you are waiting for.",
    ],
    done: "No urgent row left against your name.",
    avoid: [
      "Fixing something outside the system — the issue stays until the record changes.",
      "Leaving a blocked job with no note saying what it is waiting for.",
    ],
    ask: "Your manager, or the partner for the client.",
  },

  myday: {
    title: "My tasks",
    why: "Your own work, in the order to do it.",
    road: ["Top task first", "Do the next step", "Send for review", "Next"],
    you: {
      staff:
        "Work from the top. Finish a step before starting something else, and if a job is blocked write why on it.",
      partner: "Your own preparation work, where you have any.",
    },
    when: "Start of the day, and after each task.",
    steps: [
      "Start with red (overdue), then amber (due soon).",
      "Open the job: the header says what the blocker is and what comes next.",
      "Follow the steps on the job.",
      "When every step is ticked, send it for review.",
    ],
    done: "Each of your jobs is either moving or carries a note saying what it waits on.",
    avoid: [
      "Starting a second job while the first is half done.",
      "Chasing a client from your own phone — the request on the job does it, and leaves a record.",
    ],
    ask: "Stuck for more than half an hour? Comment on the job and name your reviewer.",
  },

  todos: {
    title: "To-dos",
    why: "Small internal tasks that are not a statutory job — a follow-up, a renewal, a collection.",
    road: ["Add", "Do", "Tick"],
    you: {
      partner:
        "Use it for the follow-ups you would otherwise send somebody on WhatsApp.",
      staff: "Tick it when it is done, so nobody chases you about it.",
    },
    when: "Any time something small needs doing and has an owner.",
    steps: [
      "Add it with an owner and a date.",
      "Tick it when it is done.",
    ],
    done: "Nothing of yours is overdue.",
    avoid: ["Using a to-do for a return — that is a job, with dates and a review."],
    ask: "Your manager.",
  },

  "clients.new": {
    title: "Taking on a client",
    why: "Get a client onto the system correctly the first time, so nothing is retyped and nothing is missed.",
    road: [
      "Entity type",
      "Details and PAN",
      "Documents",
      "Services and fees",
      "Checks",
      "Create",
    ],
    you: {
      staff:
        "Fill each step. The system checks the PAN, the GSTIN, the CIN and whether we already have them.",
      partner:
        "Approve the services, the fees and the conflict check before it is created.",
    },
    when: "When a new client says yes.",
    steps: [
      "Pick the entity type first — it decides the documents, the fields and the registrations that follow.",
      "Enter the PAN before anything else: it is checked against the entity type and against every client we have.",
      "Tick the documents already in hand; the rest go to the client as one request.",
      "Choose the services and set the fee and the billing basis for each.",
      "Clear every check — duplicate, group, previous auditor — and create.",
    ],
    done: "The client exists, the engagement letter is drafted, and the document request has gone.",
    avoid: [
      "Skipping the communication with the previous auditor on an audit.",
      "Typing a PAN from memory. Copy it from the card or the portal.",
    ],
    ask: "Anything about independence or a conflict: stop and ask a partner.",
  },

  "clients.import": {
    title: "Bringing a client list in",
    why: "Add or correct many clients at once without typing each one.",
    road: ["Download", "Edit in Excel", "Upload", "Read the preview", "Save"],
    you: {
      staff:
        "Always start from a fresh download, so you are editing what is actually on the system.",
      partner:
        "Approve the changes to a PAN, a GSTIN, a branch or a client partner.",
    },
    when: "New clients in a batch, a fee revision, a round of contact changes.",
    steps: [
      "Download the sheet — it comes out with the current data in it.",
      "Edit the cells, or add rows at the bottom. Leave the id blank for a new client.",
      "Upload it and read the preview: every row says new, update, needs a partner, or error.",
      "Fix the red rows in Excel and upload again.",
      "Save. Undo is there if something went in wrong.",
    ],
    done: "The preview shows no errors and exactly the changes you expected.",
    avoid: [
      "Editing a sheet downloaded last week.",
      "Treating a skipped row as saved — it is not.",
    ],
    ask: "A partner, for anything the preview marks as needing one.",
  },

  "clients.record": {
    title: "A client's record",
    why: "One page for everything about this client, so nobody has to be put on hold.",
    road: ["Overview", "Work", "Documents", "Money", "Notices"],
    you: {
      staff:
        "Read the open work and the pending documents before you telephone them.",
      partner: "Read the health, the fees and the risk before a meeting.",
    },
    when: "Before any call or meeting with the client.",
    steps: [
      "Overview: what is late, what is due, what we are waiting for.",
      "Work: the open jobs and who has them.",
      "Documents: what we hold and what we have asked for.",
      "Money: what is outstanding and what was promised.",
    ],
    done: "You can answer the client without looking anything up afterwards.",
    avoid: ["Promising a date that is not on the job."],
    ask: "New work being asked for? Tell the client partner — it may need a fee agreed.",
  },

  groups: {
    title: "A group of clients",
    why: "A family or an owner with several entities, read together.",
    road: ["Open the group", "See every entity", "Act on one entity"],
    you: {
      staff:
        "Always check which entity you are in: each one keeps its own work, invoices and GSTINs.",
      partner: "Use it for the relationship and the fees.",
    },
    when: "Group meetings, fee discussions, related-party work.",
    steps: [
      "Open the group to see each entity's work, notices and dues.",
      "Click into the entity to do anything — every action belongs to one entity.",
    ],
    done: "You know which entity in the group needs attention.",
    avoid: [
      "Filing one entity's document on another.",
      "One invoice across two entities — they have different GSTINs.",
    ],
    ask: "The client partner for the group.",
  },

  "engagements.new": {
    title: "Creating work",
    why: "A job carries its own dates, steps and reviewer, which is what makes it impossible to forget.",
    road: ["Client", "Service", "Period", "Who prepares and who reviews"],
    you: {
      staff: "Create it from the service, never as a free-text task.",
      partner: "Check the fee and that the preparer is allowed the tier.",
    },
    when: "When work is agreed, and at the start of every period for recurring work.",
    steps: [
      "Pick the client, the service and the period.",
      "Check who prepares and who reviews — they are never the same person.",
      "The dates and the steps come from the service and the firm's confirmed due-date rules; nothing is typed.",
    ],
    done: "The job appears on the right person's tasks with its dates on it.",
    avoid: [
      "Two jobs for one period — the system refuses it, so look before you create.",
      "Making yourself the reviewer of your own work.",
    ],
    ask: "Your manager, if the service or the period is not obvious.",
  },

  "engagements.work": {
    title: "Doing a job",
    why: "One return or assignment, from the documents coming in to the invoice going out.",
    road: [
      "Collect documents",
      "Prepare",
      "Review",
      "Client confirms",
      "File and attach proof",
      "Bill",
    ],
    you: {
      staff:
        "Do the next step the header names. Tick a step only when it is actually done, and never file before the reviewer approves.",
      partner:
        "Review, approve or send it back with the point. Check the proof of filing before it is billed.",
    },
    when: "Every recurring return and every assignment.",
    steps: [
      "Check the client's documents: open a file before accepting it, and ask for a replacement with the reason if it is wrong.",
      "Work the steps. Save the working papers to the job as you go.",
      "Send it for review when every step is ticked.",
      "After approval, get the client's confirmation where the job asks for one.",
      "File it in the government utility, then record the acknowledgement number here and attach the acknowledgement.",
      "The job moves to billing by itself.",
    ],
    done: "Every return filed, with its proof attached, and the client seeing it as done.",
    avoid: [
      "Ticking a step you have not done.",
      "Changing a figure after approval without telling the reviewer — it makes a new version and goes back to review.",
      "Filing before the review is approved.",
    ],
    ask: "Comment on the job and name your reviewer. If a deadline is at risk, tell the partner the same day.",
  },

  "engagements.review": {
    title: "Reviewing and approving",
    why: "The second pair of eyes that the firm's name depends on.",
    road: ["Read the work", "Approve, or send back with the point", "Sign off"],
    you: {
      partner:
        "Read what was prepared, not just the summary. Send it back with the actual point, not 'please check'.",
      staff: "You cannot approve your own work, and the system will not let you.",
    },
    when: "When something is sent for review, and before anything is filed or signed.",
    steps: [
      "Open the job and read the working papers, not only the figures.",
      "Approve it, or send it back with the specific point to fix.",
      "Where the client has to confirm figures, check the confirmation is recorded with its evidence.",
    ],
    done: "Approved, with your name on it, or sent back with a point somebody can act on.",
    avoid: [
      "Approving without opening the work.",
      "Sending it back without saying what is wrong.",
    ],
    ask: "The engagement partner, for anything that is a judgement rather than a check.",
  },

  calendar: {
    title: "The compliance calendar",
    why: "Every return for every client, period by period — the fastest way to see a month nobody filed.",
    road: [
      "Pick monthly, quarterly or annual",
      "Spot the red and the empty cells",
      "Open the cell",
      "Create or finish the job",
    ],
    you: {
      staff: "Click a cell to open its job. An empty circle means no job exists.",
      partner: "No red or empty cell should be left without an owner.",
    },
    when: "Weekly, and on the first of every month.",
    steps: [
      "Red means overdue: open it and agree a recovery plan with the owner.",
      "An empty circle means the period passed with no job. Create it, or mark it as another professional's or not engaged.",
      "A half-tick means one return of the pair is filed and the other is not.",
      "Hover any cell for its dates and status.",
    ],
    done: "No red and no empty cell without an owner and a date.",
    avoid: [
      "Marking a period 'not engaged' when the client pays us for it.",
      "Creating a job for a period the client was not with us.",
    ],
    ask: "The client partner, if it is unclear whether we do that service.",
  },

  documents: {
    title: "Documents and the file",
    why: "Everything the firm holds, and everything still to come in from clients.",
    road: ["Find the file", "Check what came in", "Accept or ask again"],
    you: {
      staff:
        "Open an upload before accepting it. Accepting it is a statement that it is the right file.",
      partner: "Watch anything that has been pending for more than a week.",
    },
    when: "Daily.",
    steps: [
      "Awaited tab, oldest first.",
      "Open each upload: right client, right period, complete, readable.",
      "Accept it, or ask for a replacement with the reason — the client sees the reason.",
      "Working papers stay internal; what the client may see is marked so deliberately.",
    ],
    done: "Nothing has been sitting unchecked for more than a day.",
    avoid: [
      "Sharing a working paper with a client.",
      "Accepting a photograph of the wrong month because it is easier than asking.",
    ],
    ask: "Your reviewer.",
  },

  "invoices.new": {
    title: "Raising an invoice",
    why: "The firm's bill, under the right office's GST registration and against work that was actually done.",
    road: ["Pick the work", "Check the lines", "Raise", "Send"],
    you: {
      staff: "Bill from the finished work, not from a blank invoice.",
      partner: "Approve anything waived, and any fee not yet agreed.",
    },
    when: "Weekly, and on the first for retainers.",
    steps: [
      "Start from Ready to bill, so every line is work with proof behind it.",
      "Check the client, the office, the GST treatment and the SAC on each line.",
      "Raise it — one invoice per client, from the office that did the work.",
      "Send it, and record what the client promises if they ask for time.",
    ],
    done: "No finished work older than a week is unbilled, and nothing is billed twice.",
    avoid: [
      "A fee of zero. Free work is a waiver, with a reason and a partner's approval.",
      "One invoice across two entities of a group.",
    ],
    ask: "The client partner, if a fee was never agreed.",
  },

  "invoices.receivables": {
    title: "Chasing money",
    why: "What is owed, how late it is, and what was promised about it.",
    road: ["Oldest first", "Remind", "Record the promise", "Escalate"],
    you: {
      staff: "Follow up in order. Record what the client actually said.",
      partner: "Take the ones over sixty days yourself.",
    },
    when: "Weekly, same day each week.",
    steps: [
      "Work the list oldest first.",
      "Send the reminder from the system, so the chase is on the record.",
      "Record a promise with its date — reminders then pause until that date passes.",
      "Escalate the long ones to the client partner rather than sending a fourth reminder.",
    ],
    done: "Every overdue invoice has either a reminder this week or a recorded promise.",
    avoid: [
      "Chasing a client who paid last week because the receipt was never matched.",
      "Writing off anything without a partner.",
    ],
    ask: "The client partner.",
  },

  billingDesk: {
    title: "The accounts desk",
    why: "Only the billing and collection items that need a person today.",
    road: [
      "Old unbilled work",
      "Fees to agree",
      "Overdue invoices",
      "Receipts to allocate",
    ],
    you: {
      staff: "Work each card until it is empty.",
      partner: "Decide the waivers and the write-offs.",
    },
    when: "Every morning.",
    steps: [
      "Bill, or explain, any work finished more than a week ago.",
      "Get the missing fees agreed by the client partner.",
      "Follow up the overdue invoices that have no promise against them.",
      "Allocate every receipt in full — to invoices, or as the client's advance.",
    ],
    done: "Every card is empty or has an owner.",
    avoid: [
      "Leaving money in the bank unallocated: it looks like a client who has not paid.",
      "Waiving a fee without writing why.",
    ],
    ask: "The client partner for a fee, a partner for a waiver.",
  },

  "practice.notices": {
    title: "Answering a notice",
    why: "Every notice, its replies, its hearings and the time limits the law puts on them, in one place.",
    road: [
      "Log it",
      "Assign it",
      "Draft the reply",
      "Review",
      "File it",
      "Hearing or order",
      "Decide on appeal",
    ],
    you: {
      staff:
        "Draft early and attach the draft, so nobody is alerted about a reply with nothing behind it.",
      partner:
        "Approve the draft, attend the hearing, and decide on appeal inside the time the law allows.",
    },
    when: "The day a notice arrives — not the week it is due.",
    steps: [
      "Log it with its reference, the section as printed, and both dates. Check the reference is genuine.",
      "Assign an owner; the clock starts from the date on the notice.",
      "Draft the reply issue by issue, with the evidence list against each one.",
      "The partner reviews it; then file it and record the acknowledgement.",
      "Record every hearing and every adjournment as it happens.",
      "When an order comes, decide on appeal before the limit the matter shows.",
    ],
    done: "Every matter has an owner, a draft before its date, and its outcome recorded.",
    avoid: [
      "Letting a reply date pass without filing or asking for time.",
      "Replying without the evidence that supports each ground.",
    ],
    ask: "The partner in charge of the matter, on anything that is a legal position.",
  },

  "practice.certificates": {
    title: "Issuing a certificate",
    why: "A certificate states a fact the firm is answerable for, so the format and the evidence are not negotiable.",
    road: [
      "Pick the certificate and the client",
      "Fill the editable parts",
      "Tick the evidence",
      "A partner approves the wording",
      "Add the UDIN",
      "Issue",
    ],
    you: {
      staff: "Prepare it and collect the evidence. You cannot issue it.",
      partner: "Approve the wording, check the number, issue it.",
    },
    when: "Every certificate request, however small.",
    steps: [
      "Pick the certificate, the client, the date and the level of assurance.",
      "Fill only the editable parts — the standard paragraphs are locked for a reason.",
      "Tick an evidence item only when the document is actually on the file.",
      "A partner approves the wording; any later edit withdraws that approval.",
      "Generate the number on the Institute's portal, record it, and issue.",
    ],
    done: "It is in the register with its number against it.",
    avoid: [
      "Words like 'true and correct', or certifying something nobody examined.",
      "Issuing with a blank left in it.",
    ],
    ask: "A partner, before drafting anything unusual.",
  },

  "practice.audit": {
    title: "An audit file",
    why: "One audit from acceptance to the file being closed, with the evidence in the order a reviewer reads it.",
    road: [
      "Acceptance",
      "Planning",
      "Data and tests",
      "Area programmes",
      "Completion",
      "Reporting",
      "Quality and closure",
    ],
    you: {
      staff:
        "Work your areas. Mark each item done, not applicable, or an issue — and write the note.",
      partner:
        "Decide the exceptions, record the conclusion, and sign only when every check is green.",
    },
    when: "Every audit.",
    steps: [
      "Finish acceptance and planning before fieldwork starts, not alongside it.",
      "Run the data tests and decide each exception: adjust, explain with evidence, ask the client, or send it to the partner.",
      "Complete the area programmes, with a working paper behind every item.",
      "Completion: representations, subsequent events, and every review note cleared.",
      "Reporting: the clause-by-clause annexures, the matters for the report, and the overall conclusion.",
      "Sign with the number, then assemble the file within the time the standard allows.",
    ],
    done: "Report signed, number recorded, file assembled and locked.",
    avoid: [
      "Marking an item done with no working paper behind it.",
      "Explaining away an exception without evidence on the file.",
    ],
    ask: "The engagement partner, on materiality and on anything to do with the opinion.",
  },

  "practice.tb": {
    title: "Trial balance to financial statements",
    why: "Turn the client's trial balance into statements in the format the law requires.",
    road: ["Import", "Map every ledger", "Answer the note questions", "Review"],
    you: {
      staff: "Map every ledger. An unmapped one blocks the statements, deliberately.",
      partner: "Look at the mapping of anything unusual.",
    },
    when: "Year-end accounts and every audit.",
    steps: [
      "Import the trial balance and check it totals to nil.",
      "Map each ledger to its head; last year's mapping is remembered and suggested.",
      "Answer the questions that decide which notes are needed.",
      "Read the draft statements against last year before anybody else does.",
    ],
    done: "Every ledger mapped and the statements agreeing to the trial balance.",
    avoid: ["Parking a balance in suspense to make it add up."],
    ask: "Your reviewer, on any head you are unsure of.",
  },

  "practice.sampling": {
    title: "Sampling and vouching",
    why: "Pick a sample that can be defended and vouch it properly.",
    road: ["Define the population", "Pick the sample", "Vouch each item", "Conclude"],
    you: {
      staff: "Vouch every attribute on every item, and record the exceptions.",
      partner: "Review the exceptions and the conclusion drawn from them.",
    },
    when: "Fieldwork.",
    steps: [
      "Agree the population and the method, and record both before picking.",
      "Vouch each item attribute by attribute, with the document reference.",
      "Record every exception, with what it was.",
      "Conclude on the population, not on the sample.",
    ],
    done: "Every sampled item vouched and every exception evaluated.",
    avoid: [
      "Treating an attribute failure as a money error without evaluating it.",
      "Picking the sample again because the first one had exceptions in it.",
    ],
    ask: "The audit manager.",
  },

  "practice.auditorsReport": {
    title: "The auditor's report",
    why: "The report in the order the standard sets, with the switches that change its shape.",
    road: [
      "Pick the audit",
      "Set the opinion and the switches",
      "Fill the blanks",
      "Check the format",
      "Sign from the file",
    ],
    you: {
      staff: "Prepare the draft and fill every blank.",
      partner: "Check the structure and the opinion. Signing happens on the audit file.",
    },
    when: "The reporting stage of every audit.",
    steps: [
      "Pick the audit file, so the report and the file cannot disagree.",
      "Set the opinion and the switches; each one changes which sections appear.",
      "Fill every blank — a draft that reads finished and is not is the danger.",
      "The format check must be green before it goes to the partner.",
    ],
    done: "A draft ready to sign, with no blanks and no structural warnings.",
    avoid: ["Editing a signed report. That is an amendment, with its own review."],
    ask: "The engagement partner, on the opinion.",
  },

  "registers.udin": {
    title: "The registers",
    why: "What the firm has signed, whose certificate expires when, and which logins we hold.",
    road: ["Check what is expiring", "Check what is unnumbered", "Act"],
    you: {
      staff:
        "Tell the partner about any row without a number. Use the vault for user ids; passwords are never shown.",
      partner: "Renew the certificates before they expire, not after.",
    },
    when: "Weekly.",
    steps: [
      "Certificates expiring in the next month: tell the client now.",
      "Anything signed without a number recorded: chase it the same week.",
      "Anything signed and not billed: send it to the accounts desk.",
    ],
    done: "No expired certificate is needed for open work, and nothing signed is unnumbered.",
    avoid: ["Keeping a password anywhere except the vault."],
    ask: "The practice administrator.",
  },

  lab: {
    title: "The data lab",
    why: "Any sheet a client exported, added up, with a checklist of what to look at.",
    road: [
      "Read the file or a sample",
      "Confirm what it is",
      "Confirm the columns",
      "Work it out",
      "Keep the summary",
    ],
    you: {
      staff: "Run the checks and write what you found on the job.",
      partner: "Read the figures before using them with a client.",
    },
    when: "Monthly figures, audit fieldwork, any client review.",
    steps: [
      "Read the file — it stays in the browser and is not kept.",
      "Confirm what kind of sheet it is; the guess is only a guess.",
      "Confirm which column is which, then work it out.",
      "Read the flags with their notes: most of them have an innocent explanation.",
      "Post the summary to the job, so a check run in March is on the record in June.",
    ],
    done: "The checks are run and what was found is on the job.",
    avoid: [
      "Quoting a total from a column nobody confirmed.",
      "Sending a client a figure the lab produced without reading the flags.",
    ],
    ask: "Your reviewer, if a result looks impossible.",
  },

  templates: {
    title: "Using a template",
    why: "The firm's letters, filled from the client's own record.",
    road: ["Pick the letter", "Pick the client", "Fill the blanks", "Copy or start it"],
    you: {
      staff: "Fill every highlighted blank before it leaves the screen.",
      partner: "Approve the wording of anything that goes out over the firm's name.",
    },
    when: "Any letter, engagement pack or request.",
    steps: [
      "Pick the template and the client; it fills in from their record.",
      "Fill every blank marked in square brackets.",
      "Copy it, or start it as a draft on the job where Word and PDF live.",
    ],
    done: "No blanks left, and the draft is on the job it belongs to.",
    avoid: [
      "Editing a locked paragraph to get round the approval.",
      "Sending a watermarked draft to a client.",
    ],
    ask: "A partner, for a new template or a change to the wording.",
  },

  automation: {
    title: "Automation and approvals",
    why: "What the system did on its own, and what is waiting for a person.",
    road: ["Approve or reject the queue", "Retry the failures", "Read the log"],
    you: {
      partner:
        "Preview before approving. Mark a recipe trusted only when you have read what it sends.",
      staff: "Read-only. Tell a partner about anything stuck.",
    },
    when: "Daily.",
    steps: [
      "Preview each batch: the first message is the one the client will read.",
      "Approve it, or decline it with a reason — the log is read by people.",
      "Retry the failures, or deal with them by hand.",
      "Nothing in the log is ever edited or deleted; it is the evidence of how the firm talks to clients.",
    ],
    done: "The queue is empty and no failure is left sitting.",
    avoid: ["Approving a bulk send without previewing it."],
    ask: "The practice administrator.",
  },

  messages: {
    title: "Email and WhatsApp",
    why: "Every message to and from clients, and whether it actually arrived.",
    road: ["Check what was held or failed", "Read the replies", "Act on the job"],
    you: {
      partner: "Approve the wording of the templates once, then watch the failures.",
      staff: "Read the replies and act on the job each one belongs to.",
    },
    when: "Daily.",
    steps: [
      "Filter to the replies and open the job each one is about.",
      "A bounce or a failure means the address or the number is wrong: fix it on the client's record.",
      "A message held back is one the client has not seen. Decide whether it should go.",
    ],
    done: "No reply older than a day is unread.",
    avoid: ["Assuming a logged message was delivered. The status says which."],
    ask: "The practice administrator.",
  },

  reports: {
    title: "Management reports",
    why: "How the firm is actually doing: punctuality, what we bill for, who is carrying what, who owes us.",
    road: ["Read the four", "Act on the worst one"],
    you: {
      partner: "Read them monthly with the managers, and act on one thing.",
      staff: "Read-only.",
    },
    when: "Monthly, in the partners' meeting.",
    steps: [
      "Punctuality by service: a service that is habitually late is a process to fix, not a person to blame.",
      "What was billed, by kind of work.",
      "Workload by person, with overdue beside open.",
      "Who owes us, with the overdue part of it.",
    ],
    done: "One action agreed and written down.",
    avoid: ["Judging somebody on the number of jobs. The tiers are not the same work."],
    ask: "The practice administrator for the figures behind a number.",
  },

  "team.plan": {
    title: "Planning the week",
    why: "Who does what this week, so nothing misses its date for want of a person.",
    road: [
      "Overdue",
      "At risk",
      "Blocked by clients",
      "Balance the load",
      "Confirm the owners",
    ],
    you: {
      partner: "Run it every Monday with the managers. Move work from red people to green.",
      staff: "Tell your manager early if you will be away.",
    },
    when: "Every Monday morning, and whenever somebody goes on leave.",
    steps: [
      "Overdue first: each one gets an owner and a date today.",
      "At risk: read why — a target missed, or a client not answering — and act on that.",
      "Blocked by a client: telephone them; the request is already on their portal.",
      "Anyone near their capacity: open one of their jobs and see who else could do it.",
      "Never make the preparer the reviewer.",
    ],
    done: "Nobody over capacity, every overdue job owned, every blocked job followed up.",
    avoid: [
      "Giving tier A work to somebody who is not allowed it.",
      "Assigning work to somebody who is on leave before the deadline.",
    ],
    ask: "The partner, if the week does not fit — something has to be deferred, and that is their call.",
  },

  "team.leave": {
    title: "Leave and cover",
    why: "Who is away, and who is handling their urgent work while they are.",
    road: ["Mark the leave", "Name the cover", "The cover sees their work"],
    you: {
      partner: "Give the managers the cover for the branches they look after.",
      staff: "Mark your own leave, with somebody named to cover.",
    },
    when: "As soon as leave is known, and when cover changes.",
    steps: [
      "Mark the dates and name who covers urgent work.",
      "The cover sees that person's issues, to-dos and notifications while they are away.",
      "Cancel it if the leave changes, so nobody is covering nothing.",
    ],
    done: "Nobody is away without cover named.",
    avoid: ["Leave with no cover during a filing week."],
    ask: "A partner.",
  },

  gstCycle: {
    title: "The monthly GST cycle",
    why: "One month of GST work for every client, from the data pack going out to the invoice going out.",
    road: [
      "Packs sent",
      "Data in and checked",
      "Prepared and reviewed",
      "Client confirms",
      "Returns filed",
      "Proof and invoice",
    ],
    you: {
      partner:
        "Watch the red: bounced packs, silent clients, corrections, anything filed late.",
      staff:
        "Check the uploads, prepare what is accepted, and answer the client's questions on the job.",
    },
    when: "Every month, from the first to the end of the cycle.",
    steps: [
      "The data pack goes out with each client's own template.",
      "Uploads are format-checked automatically; somebody still reads them before they are accepted.",
      "Prepare once the data is accepted, send for review, and get the tax confirmed by the client.",
      "File each return in the government utility and record the acknowledgement here.",
      "Billing follows automatically; the invoice goes with a payment link.",
    ],
    done: "Every client filed on time, and billed or marked as retainer.",
    avoid: [
      "Accepting a PDF of ledgers without keying it into the template.",
      "Sending data requests from a personal number.",
    ],
    ask: "A silent client after a week is the partner's call, not a fourth reminder.",
  },

  settings: {
    title: "Settings and customisation",
    why: "Everything you set once: the firm, the services, the dates, who may do what, and the words.",
    road: ["The firm", "How work runs", "People and access", "Your words"],
    you: {
      partner: "Set it up in the first week, and come back when the firm changes.",
      staff: "Ask a partner to change a setting.",
    },
    when: "At setup, and whenever the firm changes.",
    steps: [
      "The firm's details, its offices and their GST registrations and invoice series.",
      "The services you offer, their steps and their default fees.",
      "Confirm every due-date rule: until a partner confirms one, it puts no date on any job.",
      "Who may prepare, review and sign, and which branches each person can see.",
      "Rename anything your firm calls something else.",
    ],
    done: "New jobs come out with the right steps, dates and reviewers without anybody typing them.",
    avoid: [
      "Changing a review tier without telling the team.",
      "Confirming a due-date rule nobody has checked against the law.",
    ],
    ask: "Support, for anything that is not on a settings screen.",
  },

  learning: {
    title: "The learning library",
    why: "Learn a kind of work in depth, rather than being told it twice.",
    road: ["Pick a playbook", "Read it", "Try the exercise", "Use it on real work"],
    you: {
      staff:
        "Read the playbooks for the work you do, then use them on your next job.",
      partner: "Use them for induction, and to start a kind of work the firm is new to.",
    },
    when: "A new joiner's first week, new work, or a refresher.",
    steps: [
      "Pick the playbook for the work.",
      "Read the quick version, then the detailed one where you need the why.",
      "Try the exercise where there is one.",
      "On real work, follow the steps on the job and ask your reviewer when unsure.",
    ],
    done: "You can do the work on a real job and have it approved.",
    avoid: [
      "Treating a tick in the library as proof the work is done.",
      "Using a playbook without checking that what it says about the law is still current.",
    ],
    ask: "Your reviewer, or the partner who owns the topic.",
  },
};

/** @param {string} key */
export function starterSopFor(key) {
  return STARTER_SOPS[key] ?? null;
}

export const STARTER_SOP_KEYS = Object.keys(STARTER_SOPS);

# PHMG CRM — what has been built, how to use it, what is left

A plain-language account of the whole project so far, for the firm rather
than for a developer. Written 19-10-2026.

The two companion documents are `docs/DEPLOY.md` (how to put it live, step by
step) and `docs/ACCEPTANCE.md` (the eleven things to check before trusting
it). `docs/PROGRESS.md` is the detailed build log, and `docs/SPEC.md` is what
was agreed.

---

## 1. Where things stand, in one paragraph

**All twelve steps of Phase 1 are built.** Every screen, rule and report the
Phase 1 plan listed exists, with 529 automated tests behind the logic and a
clean build. **Nothing has ever run against a real database**, because the
MongoDB Atlas cluster does not exist yet — so the right word for the state of
the system is *finished but unproven*. Fifty-seven browser tests are written
and waiting for that cluster; they are the real check on most of the
acceptance criteria. Creating it is about ten minutes of clicking and is
free, and it is the only thing standing between here and a verified system.

| | |
| --- | --- |
| Phase 1 steps built | 12 of 12 |
| Automated tests passing | 529 |
| Browser tests waiting on the database | 57 |
| Collections of data | 22 |
| Outside libraries used | 20 |
| Verified against real data | **nothing yet** |

---

## 2. What this system is

A practice management system for the firm's four offices — Noida, Delhi
(Rohini), Ludhiana and Meerut. It replaces the tracking spreadsheets with one
place that knows:

- **who the clients are**, with their statutory identifiers, contacts,
  groups and portal logins;
- **what work is owed to each of them**, when it is statutorily due, who is
  doing it and who has to check it;
- **what documents came in**, from whom and when, and what is still awaited;
- **what has been billed, what has been received** and what is overdue;
- **and who did what**, permanently, in a log that cannot be edited.

It is deliberately not a general-purpose task manager. The work item is an
*engagement* — one service, for one client, for one statutory period — and
almost everything in the system hangs off that.

---

## 3. What is built, area by area

### Signing in and the people in the firm

- Email and password, then a **six-digit code from an authenticator app**.
  Two-factor is not optional and cannot be skipped: an account sets it up the
  first time it signs in, so no account can ever exist without it.
- **Five roles** — Partner, CA, Employee, Intern, Accounts — each limited to
  what the spec's permission matrix allows, and each person tied to one or
  more branches. An Employee cannot see another branch's work; an Intern sees
  only the clients they have work on; only a CA or a Partner can sign work
  off.
- **The permission check is on the server, in every action.** Hiding a button
  is not security, so pasting a URL for another branch's engagement gets you
  sent away rather than shown the page.
- Partners manage the team at **Settings → Team**: add people, change roles
  and branches, reset a password, reset two-factor, deactivate somebody.
- Sign-out after 30 minutes of inactivity. Five wrong passwords locks the
  account for 15 minutes. **Deactivating somebody takes effect on their very
  next click**, not at the end of their session.

### The audit trail

- **Every create, edit, delete, status change, file download and password
  reveal is written to the audit log in the same database transaction as the
  change itself.** The change and its log entry stand or fall together; there
  is no code path that can write data without a log.
- Entries record who, when, from which address and browser, and the **old and
  new value of every field that changed** — except PAN, Aadhaar, passwords and
  bank details, which are recorded as *changed* without their values.
- **The log is tamper-evident.** Each entry carries a fingerprint of the one
  before it, so an altered, deleted or resequenced entry is detectable, and
  the **Check for tampering** button on `/audit` reports exactly where a break
  is.
- Nothing is ever deleted outright, anywhere in the system. A delete is a
  soft delete: the record is hidden, and a Partner can restore it.
- Every client, engagement and invoice has an **Activity** tab showing its own
  history in sentences — "Riya changed status from In progress to Under
  review".

### Clients

- The full client record: identity, PAN, GSTIN(s), TAN, CIN, Udyam, IEC,
  Aadhaar, contacts, addresses, groups, the person in the firm who looks
  after them, classification and fee agreements.
- **Identifiers are properly checked, not just pattern-matched.** A GSTIN or
  an Aadhaar number with one wrong digit is caught at the keyboard, because
  their check digits are verified. A PAN whose fourth letter disagrees with
  the entity type is flagged as the wrong PAN pasted in.
- **Duplicate protection**: a PAN or GSTIN already in the system blocks the
  save, with an override tick box that is itself audited; a shared mobile
  number only warns.
- **The credentials vault** — income-tax, GST and MCA portal logins, encrypted,
  in their own collection so they never load with the client. Revealing a
  password writes an audit entry naming the person, and the password clears
  itself off the screen after a minute.
- **Import from a spreadsheet** with a row-by-row preview: a 300-row file with
  3 bad rows imports 297 and lists the 3 with their problems. (The file must
  be saved as CSV from Excel — see pending.)
- Client codes run `PHMG-NOI-0001` upward, one series per branch, never
  reused.

### The service catalog

- 15 starter services from the spec, each with a complexity level, the
  minimum role allowed to do it and to review it, a turnaround, a recurrence,
  a **client-side and a firm-side checklist**, and a sequence of steps.
- A service carries its SAC code, default fee, GST rate and whether the work
  needs a **UDIN**.
- **Fees are all ₹0 and most SAC codes are blank on purpose** — those are the
  firm's to set, and nothing statutory is invented by the system.
- Editing a service never reaches back into work already under way: an
  engagement **copies** the service definition when it is created.

### Engagements — the work itself

- An engagement is one service, one client, one period, with the service
  definition copied in, its checklists, its sub-tasks, its filing details
  (acknowledgement number, UDIN) and its comments with @mentions.
- **Eight statuses** — Not started, In progress, Waiting on client, Under
  review, Rework, Filed, Completed, Cancelled — with every rule about moving
  between them in one place. Holding, cancelling and sending back all demand
  a reason. Completed and Cancelled are final.
- **Maker and checker are always different people.** The person who did the
  work can never sign it off, and only a CA or a Partner can mark anything
  Completed. Completing requires every mandatory checklist item verified,
  every review point ticked, and a UDIN where the service needs one.
- **Three views of the same work** — list, board (drag a card between
  columns), and month calendar coloured by lateness. Every filter lives in the
  URL, so a useful view can be bookmarked or sent to a colleague.
- **Bulk actions** on a selection: move status, assign, set reviewer, change
  the internal date, set priority. Each record is checked separately, so you
  get "12 of 15 moved" and the three that could not, by code, with reasons.
- Periods follow the **Indian financial year** throughout: Q1 is April–June.

### Documents

- Files live in an encrypted vault on the firm's own BigRock hosting, not in
  the database and not on anybody's laptop. Each file is encrypted before it
  leaves the app.
- **No file is ever public.** Every open asks the server, which checks
  permission and writes the audit entry first, then issues a link that works
  for five minutes.
- Attach files to any checklist item; attaching moves the item to
  **Received** by itself. Re-uploading keeps the previous version. PDFs and
  images preview in the page.
- Each client has a **permanent file** — PAN card, incorporation papers, the
  things that are not about one year's work.
- **A client can send you documents without an account.** "Email the client a
  link" produces a seven-day upload page that lists only what is outstanding.
  That link can do exactly one thing: upload a file against an item that was
  asked for. It cannot read anything back, see another client, or reach any
  part of the CRM. Links can be withdrawn.
- A **recycle bin** (Partner only) holds deleted files for 90 days.
- Firm-wide document search, and a **"pending from clients"** list of every
  job waiting on paperwork.

### The compliance calendar and statutory dates

- A **due-date master**: one rule per service, with per-period variants (the
  March TDS quarter is due 31 May, not 30 April) and a place to record dates
  the government moves.
- **The system will not invent a statutory date.** A rule produces no date at
  all until a partner has confirmed it, and says why instead. Eleven draft
  rules are seeded, every one unconfirmed, each carrying its source and a note
  on what the sources disagreed about. **This is the one thing that must be
  done before any statutory date is relied on.**
- **Recurring work is generated automatically**, a fortnight before it is due,
  assigned to whoever normally does it. Work on an unconfirmed rule is still
  created on time, with the date left blank and a note saying why.
- **Recording a government extension moves every open engagement on that rule
  and period**, each with its own audit entry naming the notification.
- `/calendar` — the firm calendar in month, week and list views.
- The **compliance status grid** — clients down the side, periods across the
  top — which answers the question a list cannot: *which period did nobody
  ever create anything for?* A missing filing and unfinished work are shown
  differently, and a period still in progress is not called late.

### Billing

- **GST invoices** with the tax worked out from the two GSTINs: same state
  gives CGST and SGST, different states give IGST, with no setting for anyone
  to get wrong. Each line's tax rounds on its own so the printed invoice adds
  up as it is read.
- **Numbering is gapless**, one series per branch per financial year
  (`NOI/26-27/0087`), and the number is taken **at issue**, not at creation —
  so a draft that never becomes anything leaves no hole. An issued invoice
  cannot be quietly changed: a **credit note** cancels or reduces it and the
  original is left alone.
- Out-of-pocket costs are carried at cost, with no GST, in their own section.
  **TDS is shown as expected and never deducted from the total** — it is the
  client's deduction, not the firm's discount — alongside what should actually
  arrive in the bank.
- **Payments belong to the client, not to one invoice**: one transfer can be
  split across four bills, with a suggested allocation you can change, and
  anything unallocated sits as credit. A payment entered wrongly can be
  reallocated or removed, and the invoices go back as they were.
- **A client who deducts TDS has paid in full** — the invoice goes to Paid, not
  Partially paid, so the firm never chases money it was never going to
  receive in cash.
- The client's **Invoices** tab is their account: balance owed, the running
  ledger, every invoice. Plus **receivables ageing** in four buckets and a
  **done-but-not-billed** report with a "Bill it" link into a draft.
- The **invoice PDF** as the client receives it, with both GSTINs, place of
  supply, SAC per line, tax split by head and the total in words. A draft
  prints with a DRAFT watermark and a line saying it is not a valid tax
  invoice.

### Notifications and email

- **In-app notifications** on the bell in the top bar, and emails for the
  five events that matter: work assigned, sent for review, sent back for
  rework, invoice issued (with the PDF attached), payment received.
- **Seven timed reminders**: our own target 2 days before · the statutory date
  5 and 1 day before, only where the work is not filed · overdue daily until
  dealt with · documents chased every 3 days, four times at most · invoices 3
  days before, on the due date, then weekly.
- **Each rule can be switched off, retimed and reworded** at Settings →
  Messages, and switching one off is audited, because "why was nobody
  reminded?" gets asked months later.
- **One reminder, once** — overlapping runs, a late cron job and a retried job
  cannot chase a client twice.
- A **daily digest** at 09:00 and a **Monday summary** of the week. Nobody is
  ever sent an empty digest.
- **Client email is off by default.** Messages are composed, logged and
  visible on screen, and simply do not leave until the firm turns it on. A
  held message is logged with its reason, so nobody can believe a client was
  told something they were not.
- Nothing is emailed inline: every message queues, and goes out under an
  hourly cap, so a slow mailbox cannot make saving an engagement slow.

### Dashboards and reports

- `/today` is the page everyone lands on: three ruled columns of your own
  work, the statutory dates falling in the next seven days, and — depending on
  the role — a **firm overview** for a Partner, a **review queue** for a CA, a
  **billing board** for Accounts.
- **Every figure on a dashboard is a filter, not a calculation**: the tile is
  counted by the same query the list screen runs, and clicking it opens that
  list. A tile therefore cannot drift from the list it refers to.
- **Eight reports** with a shared filter bar (dates, branch, service, person,
  status): engagement status, overdue work, documents awaited, revenue (by
  client / service / branch / month), turnaround per service against the
  standard, new and lost clients, receivables, unbilled work — plus the
  compliance grid and the client ledger, linked rather than rebuilt.
- **Real Excel export on every list** — frozen header, money as a number Excel
  can sum, dates as real dates — and PDF on the three reports people print.
- **Saved views**: name the filters you keep coming back to ("Ludhiana GST
  overdue"). Private unless a Partner shares one with the firm.
- Every export is permission-scoped and audited.

### Privacy, security and the things nobody notices

- Portal passwords, bank details and Aadhaar are **encrypted in the
  database**; the keys live only in environment variables, never in the code.
- **DPDP data rights** on each client's record: *export everything held on
  this client* as a workbook, and *delete their personal data*, which is
  honoured as **redaction** — personal data overwritten, documents erased, and
  the statutory record (invoices, engagements, UDINs, the audit log) kept
  because the law requires it. The policy is shown on screen before anybody
  confirms, and is refused while the client still has unfinished work.
- **Breach detection and an incident log** at Settings → Security, built from
  the audit log the system already keeps: unusual sign-in failures, downloads
  in a burst, credential reveals. The log cannot be deleted from, only closed,
  and closing an incident requires saying what was done about it.
- **Error tracking** (Sentry), switched off until a DSN is set, with every
  report scrubbed first: no request body, cookies or headers, no email or IP,
  and PAN, Aadhaar and GSTIN written over wherever they appear.
- A **background job runner** behind all the timed work, with a heartbeat
  screen that goes red if the firm's cron stops — the failure that is
  otherwise invisible until a deadline is missed.
- `scripts/backup-vault.sh` copies the document vault off the server nightly,
  and refuses to ship a backup of an empty vault.
- `npm run doctor` — one command that checks the environment, the database,
  that transactions work, the indexes, the audit chain, the file vault, and
  then lists what is still missing before go-live.

### How it looks

Paper-and-ink rather than dashboard-blue: a ruled ledger, brass hairlines,
Fraunces for headings, IBM Plex for everything else, in a light "Paper" and a
dark "Night shift" theme. The signature moments from the spec are all built —
the turning branch map on the login screen (with a flat drawn map for phones
and anyone who asked for less motion), ink ticks that draw themselves when
something is verified, a COMPLETED stamp pressed on with the UDIN, folder tabs
on the client file, odometer figures on the dashboard, and a 3D deadline
terrain with a flat heatmap as the default. **Contrast is measured by a test**,
not asserted, and the whole system works at phone, laptop and monitor width,
in both themes, with the keyboard alone.

---

## 4. How to use it

### Getting in

1. Open the app and sign in with your email and password.
2. First time only: it shows a QR code. Scan it with Google Authenticator or
   Microsoft Authenticator on your phone, then type the six-digit code. From
   then on it asks for that code every time you sign in.
3. You land on **Today**.

### The shape of the screen

- **Left rail** — Today, Clients, Work, Calendar, Documents, Billing,
  Reports, Audit log, Settings. You only see what your role may open.
- **Top bar** — the branch you are looking at, search, quick-add, the
  notification bell, your profile, and the light/dark and density toggles.
- **Ctrl + K** (⌘K on a Mac) anywhere opens the command bar: type a client
  name, a PAN, a GSTIN, an engagement code, an invoice number or the name of a
  screen.

### A normal day

| You want to | Do this |
| --- | --- |
| see what is on your desk | **Today** — three columns: due, in progress, waiting |
| start a job | **Work → New**, pick client and service; the period and the people offered follow from the service |
| get documents from a client | open the engagement → **Request documents** → email the link, or copy it |
| record what came in | attach the file to its checklist item; it moves to Received by itself |
| send work for checking | on the engagement, **Send for review**, choosing a CA or Partner who is not you |
| sign work off (CA/Partner) | open it at Under review → tick the review points → **Complete**, with the UDIN if the service needs one |
| raise a bill | **Billing → New invoice**, which is driven by the finished-but-unbilled list → issue it |
| record money in | the client's **Invoices** tab → **Record payment**, accept or change the suggested split |
| chase money | **Billing → Receivables**, worst debt at the top |
| see where the firm is | **Today** as a Partner, or **Reports** |
| find anything | **Ctrl + K**, or the search box on any list |
| prove what happened | the **Activity** tab on the record, or **Audit log** for the firm |

### The rules that will surprise you

These are deliberate, and all of them are in the spec:

1. **You cannot approve your own work.** Assignee and reviewer must be
   different people, and only a CA or Partner can mark anything Completed.
2. **A statutory date is blank until a partner confirms its rule.** Work is
   still created on time; it simply carries no date, and says why. Go to
   **Settings → Due dates** and confirm all eleven rules before relying on any
   statutory date.
3. **A draft invoice has no number.** The number is taken when you issue it,
   so the series can never have a hole in it.
4. **An issued invoice cannot be edited.** Raise a credit note against it.
5. **Nothing is ever really deleted.** It is hidden, and a Partner can bring
   it back.
6. **Client emails do not go out** until the firm switches them on. Until
   then they are composed and listed at Settings → Messages with the reason
   they were held.
7. **A branch cannot issue an invoice until its GSTIN is entered.** Drafting
   works; issuing does not.

### Settings, and who can open them

| Section | For | What it is |
| --- | --- | --- |
| Team | Partner | people, roles, branches, 2FA resets |
| Services | staff read, Partner/CA edit | the service catalog |
| Branches | Partner | addresses, GSTINs, invoice series |
| Due dates | Partner/CA | the statutory rules, and confirming them |
| Messages | Partner | what is emailed, to whom, when, and whether client email is on |
| Bringing data in | Partner | team and opening-receivables imports |
| Security | Partner | unusual activity and the incident log |
| Background jobs | Partner | is the runner alive, what failed |
| Recycle bin | Partner | deleted documents |

---

## 5. What is pending

### A. Waiting on you — these block everything else

1. **Create the MongoDB Atlas cluster** (free tier is enough to start; Mumbai
   region). `docs/DEPLOY.md` §4 Step 1 is click-by-click. **Nothing in this
   system has ever stored a row, so this is the first real test of all of
   it.**
2. **Put the code somewhere other than this one laptop** — a private GitHub
   repository under the firm's account. There is no remote at all today.
3. **Create the Vercel project** and add the environment variables
   (`docs/DEPLOY.md` §4 Step 2).
4. **The BigRock file gateway** — the `files.` subdomain, the PHP upload, the
   cron job (§1 and §2). The PHP has never been executed; BigRock will be its
   first run.
5. **The `notices@` mailbox**, with SPF, DKIM and DMARC (§3).
6. **Confirm all eleven due-date rules** (Settings → Due dates). Until then no
   statutory date is applied to anything.
7. **Set the service fees and SAC codes**, and **enter the branch GSTINs**.
8. **Backups, and a restore you have actually performed** (§5). A backup
   nobody has restored is a hope, not a backup.
9. **Write the two encryption keys down outside this system** — a password
   manager and a sealed envelope. Lose them and the vault and the encrypted
   fields are unrecoverable, by design.

### B. Decisions I still need from you

- **Invoice numbering** — one series firm-wide or one per branch? (Built as
  per branch.) Is the firm GST-registered in each state?
- **Can interns see fees and invoice amounts?** (Built as: no.)
- **Is a separate Accounts/Billing role needed** beyond the one built?
- **Export target** for the accounts — Tally, Zoho Books, something else? The
  CSV is built; the import format for a specific package is not.
- **Where today's data lives** and how far back to bring it in.
- **BigRock questions**: does cPanel have Node.js support? what is the hourly
  email cap? which country is the server in?
- **Do overdue emails need to escalate?** Today the same email goes daily, as
  the spec says. Should it get louder after a week?
- **Is the Monday summary the right page** for a Monday morning?
- A handful of smaller "owner to confirm" decisions are listed in
  `docs/PROGRESS.md`.

### C. Built but unproven — the honest list

- **No screen has been seen against real data.** Every figure comes from a
  query that has never run.
- **57 browser tests are waiting** on the cluster. They are the real check on
  nine of the eleven acceptance criteria.
- **The PHP file gateway has never executed** (no PHP on this machine).
- **Nothing has ever been emailed**, and the backup script has never run.
- **The 3D login scene has never been drawn** by a browser. It compiles and
  its refusal-on-weak-devices logic is tested; the frame rate is unknown.
- **No error has ever reached Sentry**, so the scrubber is tested against
  made-up events rather than real ones.
- **Lighthouse has not been run** (it needs the app serving against a real
  database).

### D. Known gaps inside Phase 1

- **Spreadsheet import is CSV, not .xlsx.** Excel's "Save as → CSV UTF-8"
  first. A true .xlsx reader means another library — say if you want it.
- **Opening balances** are imported as invoices in an `OB/` series; the
  rehearsal in `docs/DEPLOY.md` §7 is how to check them before they are real.
- **Five reports from the spec are not built** — timesheet, utilisation,
  realisation, client profitability and intern exposure — because all five
  need **time tracking**, which the spec puts in Phase 2. Team utilisation is
  missing from the partner dashboard for the same reason.
- **No Storybook and no Figma file.** The spec asks for components built in
  Storybook against a shared token file; the tokens live in code instead.
  Worth settling before Phase 2.
- **Empty-state illustrations** are words, not drawings.
- **"Lost clients"** counts clients set to Closed, dated by when the record
  last changed, rather than a proper closing date.
- **No self-service password reset** — a Partner resets it. No email one-time
  codes as an alternative to the authenticator app.
- **Permissions are the spec's defaults in code**, not editable per role in a
  settings screen. Say if Phase 1 needs that screen.
- **Document search** is a name-and-client search, not full text inside files.
- **Reports cap at 5,000 rows** (10,000 for money), far above the firm's size,
  and say so when they hit it.
- **No "report a problem" link** for the problems that are not crashes.

### E. Not started, by design — Phase 2 and Phase 3

The spec puts these after Phase 1 is in daily use, and the plan is to break
them into steps and get your approval before any of it is built:

- **Phase 2**: time tracking and timesheets, the five reports that depend on
  them, WhatsApp messaging through a business provider, leave and capacity
  planning.
- **Phase 3**: a client portal with its own logins, and whatever the pilot
  turns up.

---

## 6. If you only do one thing next

Create the Atlas cluster, then run `npm run doctor`. It will tell you in
plain words whether the system can see the database, whether transactions
work — without them nothing can be audited — and what is still missing. After
that, `docs/ACCEPTANCE.md` is a list of eleven checks you can walk through
yourself in a browser, and the pilot month at Noida alongside the existing
spreadsheets is what turns "finished" into "trusted".

# PHMG Practice Management CRM — Developer Specification

Oct 15, 2026 · @Someone

## 1. Purpose and scope

Build a web-based practice management CRM that puts every client, service engagement, document, invoice and team member of PHMG & Associates in one system, with a full audit trail of who did what and when.

**Problem today.** Work is tracked across spreadsheets, WhatsApp and memory. Nobody can answer quickly: which filings are overdue, which client documents are still pending, who is overloaded, and how much money is outstanding.

**Goals**

- Every service delivered to a client exists as a tracked engagement with an owner, reviewer, due date and status.
- High-complexity work routes to CAs; routine work routes to employees and articled interns, always with CA review before completion.
- Document requirements are checklisted per service, on both the client side and the firm side.
- Every invoice is linked to the engagements it bills, with paid / pending / overdue status and receivables ageing.
- Every create, update, delete, status change, upload and login is written to an immutable audit log.
- Partners see firm-wide dashboards; each team member sees their own queue.

**In scope:** clients, service catalog, engagements and tasks, documents, billing, compliance calendar, time tracking, team and articleship tracking, dashboards, audit log, notifications, multi-branch support (Noida head office, Delhi–Rohini, Ludhiana, Meerut).

**Out of scope for v1:** a full accounting ledger (use Tally/Zoho Books; export to them), direct filing to government portals (GST, Income Tax, MCA), and a payroll module.

**Users:** the whole team — partners, CAs, employees and articled interns — plus an optional client portal in a later phase.

## 2. Users, roles and permissions

Access is role-based (RBAC) and branch-scoped: a user sees only clients of the branches they are assigned to, unless they are a Partner/Admin.

| Role | Who | Typical work |
| --- | --- | --- |
| Partner / Admin | Firm owner, partners | Everything, including settings, user management, write-offs, deleting records |
| CA (Manager) | Qualified CAs | Audits, tax planning, complex filings, reviewing and approving staff and intern work |
| Employee | Full-time staff (semi-qualified, accountants) | Routine filings, bookkeeping, data preparation |
| Articled Intern | CA students in articleship | Routine tasks under supervision; no billing or client financial data beyond the task |
| Accounts / Billing | Office accounts person (optional role) | Invoices, payment entry, reminders; no access to working papers |
| Client (phase 3) | Client users via portal | Upload documents, view status and invoices of their own engagements only |

**Permission matrix** (V = view, E = create/edit, A = approve, — = no access)

| Area | Partner | CA | Employee | Intern | Accounts |
| --- | --- | --- | --- | --- | --- |
| Clients (profile, contacts) | E | E | V | V (assigned only) | V |
| Client sensitive IDs (PAN, Aadhaar, bank, portal passwords) | E | E | V (assigned only) | — | — |
| Service catalog | E | V | V | V | V |
| Engagements: create and assign | E | E | — | — | — |
| Engagements: work on assigned | E | E | E | E | — |
| Engagements: review / mark complete | A | A | — | — | — |
| Documents | E | E | E (assigned) | E (assigned) | V |
| Invoices and payments | E | V | — | — | E |
| Fee write-off / discount above limit | A | — | — | — | — |
| Time entries | V all | V team | E own | E own | — |
| Dashboards | Firm-wide | Own team | Own queue | Own queue | Billing |
| Audit log | V | V (own branch) | — | — | — |
| Users and settings | E | — | — | — | — |
| Delete any record | Soft delete only, Partner | — | — | — | — |

Rules the developer must enforce server-side, not just hide in the UI:

- An intern or employee can never set an engagement to *Completed*; only a CA or Partner can, after review.
- The maker and the checker on an engagement must be different users.
- Nothing is hard-deleted from the app; deletes are soft (`deleted_at`, `deleted_by`) and logged.
- Permissions are configurable per role in settings, with the matrix above as the default.

## 3. Client management

The client record is the anchor: every engagement, document, invoice and note hangs off it, and its page shows all of them on one screen.

**Client profile fields**

| Group | Fields |
| --- | --- |
| Identity | Client code (auto, e.g. PHMG-NOI-0142), legal name, trade name, entity type, date of incorporation / birth |
| Statutory IDs | PAN, GSTIN (multiple, per state), TAN, CIN / LLPIN, Udyam no., IEC, Aadhaar (masked, last 4 shown) |
| Contacts | Multiple contact persons: name, designation, mobile, WhatsApp, email, primary flag |
| Address | Registered and correspondence addresses, state (drives GST place of supply) |
| Firm side | Branch, client partner (CA owner), relationship manager, onboarding date, referral source |
| Classification | Category (Individual / HUF / Firm / LLP / Pvt Ltd / Public Ltd / Trust / Society / AOP), industry, turnover band, risk rating (Low / Medium / High), tags |
| Status | Lead, Active, On hold, Inactive, Closed |
| Commercials | Default billing cycle, fee agreements (retainer amount, per-service fees), credit period in days, preferred invoice email |
| Credentials vault | Portal logins (GST, Income Tax, TRACES, MCA, EPFO/ESIC) — encrypted, access-logged, reveal on click only |
| Links | Group / family linking (e.g. a director's ITR client linked to the company) |

**Client page tabs:** Overview · Engagements · Documents · Invoices and payments · Compliance calendar · Notes and communication log · Activity (audit trail for this client).

**Onboarding flow**

1. Create as *Lead* (from walk-in, referral or website enquiry).
2. Record proposed services and quote.
3. On acceptance, capture KYC documents and engagement letter (upload, with signed date).
4. Run a conflict / duplicate check on PAN and GSTIN before activation.
5. Activate: status becomes *Active*, and the system offers to create recurring engagements from the selected services (section 4).

**Other requirements**

- Duplicate detection on PAN, GSTIN and mobile number.
- Bulk import from Excel/CSV with a validation preview, so existing clients can be migrated in one go.
- Client-level notes and a communication log (call, meeting, email, WhatsApp) with date, user and summary.
- When a client is closed, open engagements must be completed, cancelled or reassigned first.

## 4. Service catalog

Each service is defined once as a template; every engagement is created from a template, so duration, checklist, complexity and default fee come pre-filled and stay consistent across clients.

**Service template fields**

- Name, code, category (Direct Tax, Indirect Tax, Audit and Assurance, Company Law / ROC, Accounting, Payroll and Labour, Advisory, Registrations, Certification)
- Complexity level: **L1 Routine** (intern/employee can execute), **L2 Standard** (employee executes, CA reviews), **L3 Expert** (CA executes, Partner reviews)
- Minimum role to execute and minimum role to review
- Standard turnaround in working days, and an optional statutory due-date rule (links to section 8)
- Recurrence: one-time, monthly, quarterly, half-yearly, annual
- Client-side document checklist (what we need from the client)
- Firm-side deliverable checklist (what we produce: computation, return acknowledgement, audit report, UDIN-tagged certificate)
- Task sub-steps (e.g. *Collect data → Reconcile → Prepare → Review → File → Share acknowledgement*)
- Default fee and SAC code (998221 etc.) for invoicing, plus GST rate
- Whether a UDIN is required on completion

**Starter catalog** (the developer seeds these; the firm edits them in settings)

| Service | Level | Recurrence | Std. turnaround | UDIN |
| --- | --- | --- | --- | --- |
| GSTR-1 / GSTR-3B filing | L1 | Monthly / quarterly (QRMP) | Before statutory due date | No |
| GST annual return (GSTR-9 / 9C) | L2 | Annual | 15 working days | No |
| TDS return (24Q / 26Q) and Form 16 / 16A | L1 | Quarterly | Before due date | No |
| ITR — salaried individual | L1 | Annual | 3 working days | No |
| ITR — business / firm / company | L2 | Annual | 10 working days | No |
| Tax audit (Form 3CA/3CB-3CD) | L3 | Annual | 20 working days | Yes |
| Statutory audit (company) | L3 | Annual | 30 working days | Yes |
| ROC annual filing (AOC-4, MGT-7) | L2 | Annual | 10 working days | No |
| Company / LLP incorporation | L2 | One-time | 15 working days | No |
| GST / Udyam / IEC registration | L1 | One-time | 5 working days | No |
| Bookkeeping | L1 | Monthly | 10th of next month | No |
| Payroll, PF / ESI returns | L1 | Monthly | Before due date | No |
| Net worth / turnover certificate | L3 | One-time | 3 working days | Yes |
| Income tax notice / assessment reply | L3 | One-time | Per notice deadline | No |
| Advisory / tax planning | L3 | One-time | As agreed | No |

Templates are versioned: editing a template never changes engagements already created from an older version.

## 5. Engagements and task workflow

An engagement is one service for one client for one period (e.g. *GSTR-3B, ABC Traders, Oct 2026*); it moves through a fixed status pipeline with a maker-checker review gate before it can close.

&#91;embedded content: engagement status flow · 7 states, 1 review gate\]

Work is done by the assignee (maker) and approved by a different, senior reviewer (checker); a rejected review loops back to *In progress* with comments.

**Statuses**

| Status | Set by | Meaning |
| --- | --- | --- |
| Scheduled | System / CA | Created (auto by the compliance calendar or manually); not started |
| Awaiting documents | Assignee | Waiting on mandatory client documents; the clock on internal SLA pauses |
| In progress | Assignee | Work underway |
| Under review | Assignee | Submitted to the reviewer; assignee can no longer edit deliverables |
| Filed / delivered | Assignee or reviewer | Return filed or report issued; acknowledgement no. and UDIN captured |
| Completed | Reviewer (CA / Partner) only | Closed; locked except for comments |
| Billed | System | All fees for the engagement invoiced (billing status runs alongside, see section 7) |
| On hold | CA / Partner | Paused with a mandatory reason (e.g. client unresponsive, fees overdue) |
| Cancelled | CA / Partner | Not going ahead; mandatory reason |

**Assignment rules**

- Assignee must meet the template's minimum execution role; reviewer must meet the minimum review role (L1/L2 → CA, L3 → Partner).
- Assignee and reviewer must be different people.
- Defaults come from the client's service subscription; the creator can override.
- Reassignment keeps history and notifies both old and new assignee.
- Bulk actions: assign, reassign, change due date, or change status for many engagements at once (e.g. all October GSTR-3B for Ludhiana).

**Inside an engagement**

- Sub-tasks from the template's step list, each with its own assignee and tick-off.
- Document checklists (section 6).
- Comments thread with @mentions; internal-only flag so nothing leaks to a future client portal.
- Review checklist the reviewer ticks (e.g. *Reconciled with books*, *Prior year compared*) and review notes; returning for rework requires a comment.
- Time entries (section 9) and linked invoices (section 7).
- Priority (Low / Normal / High / Urgent) and tags.

**SLA and ageing**

- Each engagement shows days remaining to internal and statutory due dates, coloured green / amber / red.
- Time spent in each status is recorded, so the firm can see where work gets stuck (e.g. average days in *Awaiting documents* per client).
- Rework count per engagement and per assignee feeds the CA dashboard.

**Views:** list (filter, sort, group, save), Kanban board by status, calendar by due date, and *My work* for each user.

## 6. Document management

Every engagement carries two checklists copied from its service template — documents due *from the client* and deliverables due *from the firm* — and each item is tracked to receipt, with the file attached.

**Checklist item fields:** name, side (client / firm), mandatory flag, status (*Requested → Received → Verified* or *Not applicable*), requested date, received date, verified by, linked file(s), remarks.

**Requirements**

- Upload files to an item (PDF, Excel, images, ZIP); drag-and-drop and multi-file.
- Versioning: re-uploading keeps old versions, each with uploader and timestamp.
- Storage path is structured automatically: `Client / Financial year / Service / Engagement`.
- One-click **document request** to the client by email and WhatsApp, listing only pending items, with a secure upload link (expires in 7 days, no login needed). Received files land on the right checklist item.
- Automatic reminders for pending client documents (see section 12) and an *Awaiting client* indicator on the engagement.
- A client-level **permanent file** (PAN card, incorporation certificate, MOA/AOA, partnership deed, GST certificate) that every engagement can reference without re-uploading.
- Firm deliverables (returns filed, acknowledgements, audit reports, certificates) are stored on the engagement and, for UDIN services, the UDIN is recorded against the deliverable.
- Full-text search by client, document name, FY and service; filters for *pending from client* across the firm.
- File preview in the browser for PDF and images.
- Every view, download and delete of a document is written to the audit log.
- Retention: documents kept at least 8 years by default (configurable), in line with ICAI working-paper and tax record retention expectations; deleted files go to a recoverable bin for 90 days, Partner-only purge.

## 7. Billing, invoices and payments

Every invoice line links to an engagement (or a retainer period), so the firm can see at any time what work is unbilled, what is billed but unpaid, and what has been collected.

**Invoice types:** Proforma / quotation, Tax invoice (GST), Bill of supply (if ever needed), Credit note, Retainer invoice (auto-generated monthly or quarterly).

**Invoice fields:** invoice number (series per branch and FY, e.g. `NOI/26-27/0087`, no gaps), date, client, billing GSTIN, place of supply, line items (service, SAC, description, amount), CGST/SGST or IGST computed from place of supply, out-of-pocket reimbursements (government fees, stamp duty) as a separate non-taxable section, TDS expected (u/s 194J, 10%), total, due date from client credit period, linked engagements, notes, bank and UPI details with QR.

**Statuses**

| Status | Meaning |
| --- | --- |
| Draft | Created, not sent; editable |
| Sent | Issued to client; locked (changes only via credit note) |
| Partially paid | Some payment received |
| Paid | Fully settled, including TDS credit |
| Overdue | Unpaid past due date (computed automatically) |
| Disputed | Client raised a query; excluded from reminders |
| Written off | Partner-approved bad debt |
| Cancelled | Voided via credit note |

**Payments:** record amount, date, mode (bank transfer, UPI, cheque, cash), reference no., TDS deducted by client, and allocate against one or more invoices. Advances sit as unallocated credit on the client.

**Requirements**

- *Unbilled work* report: completed engagements with no invoice, so nothing is missed.
- Bill an engagement in stages (advance, on filing, on completion) or bill many engagements in one invoice.
- PDF invoice in firm branding, emailed and sent on WhatsApp from the app; a copy is stored on the client record.
- Receivables ageing per client and branch: 0–30, 31–60, 61–90, 90+ days.
- Client ledger view: invoices, payments, TDS, balance.
- TDS reconciliation report: TDS the client says it deducted vs. what appears in Form 26AS (manual tick in v1).
- Optional rule: block starting new engagements for a client whose overdue balance exceeds a set limit, with Partner override.
- Discounts above a configurable percentage need Partner approval.
- Export invoices and payments to Excel and in a format importable to Tally / Zoho Books.
- Online payment link via a gateway (Razorpay or similar) is phase 2.

## 8. Compliance calendar and deadline engine

The system auto-creates recurring engagements ahead of each statutory due date for every client subscribed to that service, so routine filings never depend on someone remembering.

**How it works**

1. Each recurring service template holds a **due-date rule**, e.g. GSTR-3B monthly = 20th of next month; TDS return Q2 = 31 October; ITR non-audit = 31 July; tax audit report = 30 September; AOC-4 = 30 days from AGM.
2. A nightly scheduled job generates the next period's engagements N days before the due date (configurable, default 15), assigned to the client's default team member for that service.
3. A **Statutory due-date master** table lets an admin change a date when the government extends it; all open engagements on that rule update in one action, and the change is logged.
4. Event-based deadlines (AGM date, notice reply date, assessment hearing) are entered on the client or engagement and drive the due date.

**Views**

- Firm calendar (month / week / list), filterable by branch, service, assignee and status.
- *Due this week* and *Overdue* lists on every user's home screen.
- A **compliance status grid**: clients down the side, periods across the top (e.g. Apr–Mar for GSTR-3B), each cell coloured by status — the fastest way to spot a missed month.

**Internal deadlines:** each engagement has both a statutory due date and an internal target date (default 3 working days earlier) so review happens before the last day.

The due-date master is maintained by the firm. The developer should seed it for FY 2026-27 from official CBIC, CBDT and MCA notifications, and the firm should verify it before go-live.

## 9. Time tracking, workload and team

Team members log time against engagements, which gives the firm real effort per service and per client and shows who is overloaded before deadlines slip.

**Team member record:** name, role, branch(es), reporting CA, joining date, skills / services they can handle, capacity (hours per day), active flag, login.

**Time tracking**

- Start/stop timer on an engagement, or manual entry (date, hours, engagement, note).
- Daily timesheet view; weekly submission; CA approves team timesheets.
- Reports: hours by client, by service, by person; effort vs. fee charged per engagement (realisation), to show which clients or services are underpriced.

**Workload**

- Workload board: each person's open engagements and hours due this week vs. capacity, colour-coded.
- Reassign engagements by drag-and-drop from an overloaded person to someone free (logged).
- Leave calendar: approved leave reduces capacity, and the system warns if a person on leave has engagements due.

**Articleship tracking (interns)**

- Articleship start and expected end date, principal (the CA they are registered under), ICAI registration number.
- Leave balance and leave taken against articleship rules, with an alert when nearing the permitted limit.
- Exposure log: auto-summary of service categories and hours worked, useful for training records and rotation (ensure each intern gets audit, tax and GST exposure).
- Exam leave periods blocked on the calendar.
- Stipend is out of scope (payroll), but the record can hold the amount for reference.

Attendance (check-in / check-out by branch) is optional for phase 2.

## 10. Dashboards and reports

Each role lands on a dashboard built for its job; every number on it is clickable through to the underlying list.

| Dashboard | Audience | Widgets |
| --- | --- | --- |
| Firm overview | Partner | Open / overdue / due-this-week engagements by branch; pending client documents; unbilled completed work (₹); receivables and ageing (₹); collections this month vs. last; revenue by service category; team utilisation |
| Review queue | CA | Engagements awaiting my review; my team's overdue items; rework rate by team member |
| My work | Employee, Intern | My tasks sorted by internal due date; documents I'm waiting on; hours logged this week |
| Billing | Accounts | Unbilled work; invoices overdue; payments received today; TDS pending reconciliation |

**Standard reports** (all filterable by date range, branch, client, service, assignee; all exportable to Excel and PDF)

- Engagement status report and overdue report
- Pending documents from clients
- Compliance status grid (from section 8)
- Revenue by client, service, branch and month
- Receivables ageing and client ledger
- Unbilled work
- Timesheet, utilisation and realisation (hours vs. fee)
- Turnaround time per service (actual vs. standard)
- Client profitability (fees minus time cost at a set hourly rate per role)
- Intern exposure and leave report
- New clients / lost clients by month

Saved filters ("views") per user, e.g. *Ludhiana GST overdue*, so common lookups are one click.

## 11. Audit trail and activity log

Every change to every record is captured in an append-only log that no user — including a Partner — can edit or delete from the application.

**What is logged**

- Create, update, soft-delete and restore on every entity, with field-level before and after values
- Status changes and reassignments on engagements
- Document upload, view, download, delete
- Credential vault reveals
- Invoice issue, edit (draft only), cancellation, payment entry, write-off
- Login, logout, failed logins, password resets, role and permission changes
- Exports of reports or bulk data

**Each log entry:** timestamp (server, IST), user, role, branch, action, entity type and ID, client (if applicable), changed fields with old → new values, IP address, device / browser.

**Where it shows**

- An *Activity* tab on every client, engagement and invoice showing its history in plain language ("Riya changed status from In progress to Under review").
- A firm-wide audit log screen for Partners, with filters by user, date, action, entity and client, exportable to Excel.

**Implementation notes for the developer**

- Write the `auditLogs` document in the same MongoDB transaction as the change (via a Mongoose plugin on every model), so a change never lands without its log.
- Keep `auditLogs` in its own collection; the app's database user gets a custom role with only `find` and `insert` on it, no `update` or `remove`.
- Chain a hash of each entry with the previous one (`prevHash`, `hash`) so tampering at database level is detectable.
- Retain logs at least 8 years; archive entries older than 2 years to Atlas Online Archive to keep the live collection fast.

## 12. Notifications and reminders

The system nudges the right person at the right time through in-app alerts and email for the team, and email plus WhatsApp for clients; each rule can be switched on or off and its timing changed in settings.

| Trigger | To | Channel | Default timing |
| --- | --- | --- | --- |
| Engagement assigned to me | Assignee | In-app, email | Immediately |
| Engagement sent for review | Reviewer | In-app, email | Immediately |
| Sent back for rework | Assignee | In-app, email | Immediately |
| Internal target date approaching | Assignee | In-app, email | 2 days before |
| Statutory due date approaching and not filed | Assignee, reviewer, client partner | In-app, email | 5 days and 1 day before |
| Engagement overdue | Assignee, reviewer, Partner | In-app, email | Daily until resolved |
| Documents pending from client | Client contact | Email, WhatsApp | On request, then every 3 days, max 4 reminders |
| Invoice issued | Client | Email, WhatsApp (with PDF) | Immediately |
| Invoice payment reminder | Client | Email, WhatsApp | 3 days before due, on due date, then every 7 days |
| Payment received | Client, client partner | Email | Immediately |
| Daily digest | Every team member | Email | 9:00 AM: today's due, overdue, awaiting review |
| Weekly firm summary | Partners | Email | Monday 9:00 AM |

**Requirements**

- Editable message templates with placeholders (client name, service, period, due date, pending document list, amount).
- WhatsApp through the official WhatsApp Business API (via a provider such as Gupshup, Interakt or AiSensy) using pre-approved templates, sent from the firm's business number.
- Email sent from the firm's own domain through a cPanel mailbox over SMTP, rate-limited to stay under the host's hourly cap, with SPF, DKIM and DMARC configured (section 14).
- Every outbound client message is logged on the client's communication log.
- Per-client opt-out of WhatsApp reminders.

## 13. Data model (MongoDB)

The data lives in MongoDB, modelled with Mongoose: embed what is always read with its parent and stays small (contacts, checklist items, invoice lines); reference anything that grows without limit or is queried on its own (documents, time entries, audit logs).

**Common fields on every collection:** `_id` (ObjectId), `createdAt`, `createdBy`, `updatedAt`, `updatedBy` (Mongoose timestamps), `deletedAt`, `deletedBy` (soft delete, hidden by a default query middleware), `branchId` where relevant, and `schemaVersion` for future migrations.

| Collection | Key fields | Embedded | References |
| --- | --- | --- | --- |
| `branches` | name, code (NOI, DEL, LDH, MRT), address, gstin, invoicePrefix | — | — |
| `users` | name, email, mobile, role, capacityHours, active, isIntern | articleship {principalId, icaiRegNo, start, expectedEnd, leaveAllowed, leaveTaken} | branchIds\[\], reportingTo |
| `clients` | code, legalName, tradeName, entityType, pan, tan, cin, status, risk, creditDays, tags\[\] | contacts\[\], gstins\[\], addresses\[\], feeAgreements\[\] | branchId, clientPartnerId, groupId |
| `clientCredentials` | portal, username, password (encrypted), notes | — | clientId (kept apart so it never loads with the client) |
| `clientGroups` | name | — | — |
| `serviceTemplates` | name, code, category, level (L1–L3), minExecRole, minReviewRole, turnaroundDays, recurrence, sac, defaultFee, gstRate, udinRequired, version | checklist\[\] {name, side, mandatory}, steps\[\] | dueRuleId |
| `dueDateRules` | serviceCode, periodType, formula | overrides\[\] {period, dueDate, reason} | — |
| `clientServices` | fee, startPeriod, active | — | clientId, serviceTemplateId, defaultAssigneeId, defaultReviewerId |
| `engagements` | code, period, status, priority, statutoryDue, internalDue, completedAt, udin, ackNo, fee, billingStatus | tasks\[\], checklist\[\] {name, side, status, requestedAt, receivedAt, verifiedBy, documentIds\[\]}, reviewChecklist\[\], statusHistory\[\], templateSnapshot | clientId, serviceTemplateId, assigneeId, reviewerId, branchId |
| `documents` | name, fileKey, size, mime, fy, isPermanent | versions\[\] {fileKey, uploadedBy, uploadedAt} | clientId, engagementId, uploadedBy |
| `docRequests` | tokenHash, expiresAt, items\[\], sentVia | — | clientId, engagementId |
| `comments` | body, mentions\[\], internal | — | entityType + entityId |
| `timeEntries` | date, minutes, note, approvedBy | — | userId, engagementId |
| `invoices` | number, date, dueDate, placeOfSupply, subtotal, cgst, sgst, igst, reimbursements, total, tdsExpected, status | lines\[\] {engagementId, description, sac, amount, gstRate} | branchId, clientId |
| `payments` | date, amount, mode, reference, tdsAmount | allocations\[\] {invoiceId, amount} | clientId |
| `counters` | \_id (e.g. `NOI/26-27`), seq | — | — |
| `leaves` | from, to, type, status | — | userId, approvedBy |
| `notifications` | type, readAt | — | userId, entity ref |
| `messageLogs` | channel, template, to, body, status, sentAt | — | clientId |
| `auditLogs` | ts, action, entityType, entityId, diff {field: \[old, new\]}, ip, userAgent, prevHash, hash | — | userId, clientId |

**Rules the developer must follow**

- An engagement stores a `templateSnapshot` (checklist, steps, version) when it is created, so later template edits never change it.
- Every data change and its `auditLogs` insert run in one multi-document transaction; this needs a replica set, which MongoDB Atlas provides by default.
- Invoice numbers come from an atomic `$inc` on `counters` inside the same transaction as the invoice insert, so the series has no gaps.
- Validate twice: Zod schemas in server actions, plus Mongoose schemas and a collection-level JSON Schema validator.
- Indexes at minimum: `clients.pan` (unique, partial on not-deleted), `clients.gstins.gstin`, `engagements {assigneeId, status, internalDue}`, `engagements {clientId, period}`, `engagements.statutoryDue`, `invoices.number` (unique), `invoices {clientId, status, dueDate}`, `auditLogs {entityType, entityId, ts}`, `auditLogs {userId, ts}`.
- Full-text search through Atlas Search indexes on clients, engagements and documents.

**Engagement code format:** `<branch>-<service code>-<period>-<seq>`, e.g. `NOI-GSTR3B-2026-10-0412`.

**Indian specifics to get right:** financial year April–March as the default period unit; PAN / GSTIN / TAN format validation; amounts stored as integer paise to avoid rounding errors; dates stored in UTC and shown in IST.

## 14. Recommended tech stack and architecture

Phase 1 runs on the firm's chosen setup: the Next.js app (JavaScript) on Vercel, the database on MongoDB Atlas (Mumbai), client documents and background jobs on the firm's BigRock cPanel hosting, and email through cPanel mailboxes. Storage and email sit behind adapters, so either can move later (for example to a VPS, S3 or Microsoft 365) by changing configuration, not code.

&#91;embedded content: system architecture · web app, worker, database, storage, external services\]

Vercel serves the app; BigRock holds the files and runs scheduled jobs; both connect to the same Atlas database.

| Layer | Choice | Why |
| --- | --- | --- |
| Language | JavaScript (ES2023), with JSDoc type hints and `// @ts-check` in editors | Firm's chosen language; JSDoc still catches many mistakes without a TypeScript build |
| Frontend | Next.js 15 (App Router), React, Tailwind CSS; UI libraries in section 15 | Server components for fast data-heavy pages |
| Backend | Next.js server actions and route handlers, Zod for input validation | One codebase; permission checks on every server call |
| App hosting | Vercel Pro, functions pinned to the Mumbai region (`bom1`) | Pro is required for commercial use; region sits next to Atlas |
| Database | MongoDB Atlas, Mumbai: Flex tier to start, dedicated M10 when needed; Mongoose ODM | Managed backups, multi-document transactions for audit logging, low starting cost |
| Search | Atlas Search | Full-text and fuzzy search on clients, PAN, GSTIN, documents |
| Auth | Auth.js (NextAuth) with MongoDB adapter, TOTP 2FA | Staff 2FA is mandatory (section 16) |
| File storage | BigRock cPanel hosting: a small PHP file gateway; files kept outside `public_html`, encrypted per file (AES-256-GCM) | Uses existing hosting; PHP runs on every cPanel plan |
| Background jobs | MongoDB `jobs` queue, processed by a runner that cPanel Cron Jobs on BigRock trigger every 5 minutes | Keeps scheduled and slow work off Vercel |
| Email | cPanel mailboxes; the CRM sends from `notices@phmgindia.com` over SMTP (Nodemailer) through a rate-limited queue | Uses existing mail hosting |
| WhatsApp | Official WhatsApp Business API via an Indian BSP (Gupshup, Interakt, AiSensy), phase 2 | Approved templates for reminders and invoices |
| PDF | React-PDF (runs on Vercel) | Branded invoices and reports |
| Quality | ESLint, Prettier, Vitest, Playwright, Storybook | Tests and a visual component library for the design system |
| Monitoring | Sentry, uptime monitor on the app and the file gateway, Atlas alerts, job-runner heartbeat | Problems found before staff report them |

**File gateway on BigRock**

- Served from a subdomain such as `files.phmgindia.com` on BigRock with free AutoSSL. Only the gateway scripts sit in its web folder; the files live in a folder outside `public_html` (e.g. `/home/<user>/phmg-vault/`) and can never be reached by URL.
- **Upload:** the browser asks the Next.js app for an upload ticket, signed with HMAC-SHA256 using a secret shared only by Vercel and BigRock (file key, max size, allowed types, 10-minute expiry). The browser uploads straight to the gateway, which avoids Vercel's request size limit (about 4.5 MB). The gateway checks the ticket, encrypts the file, stores it and returns a checksum; the app then records the document in Atlas.
- **Download:** the app checks permissions, writes the audit entry and issues a signed link valid for 5 minutes; the gateway verifies it, decrypts and streams the file as a download.
- The encryption key is stored on BigRock outside the web folder and apart from the files.
- The gateway rejects any request without a valid signature, allows cross-origin requests only from the app's domain, disables directory listing and logs every request.
- Deleting moves a file to a recycle folder; a job purges it after 90 days.
- In the app, all file access goes through one storage adapter (`getUploadTicket`, `getDownloadLink`, `remove`, `exists`) with a BigRock driver now, so an S3-compatible driver can replace it later.
- The encrypted vault is copied every night to a backup location outside BigRock (section 18).

**Background job runner**

- Jobs live in a MongoDB `jobs` collection: type, payload, runAt, status, attempts, lockedUntil, lastError.
- Recurring schedules (nightly engagement generation, reminders, overdue flags, daily digests, recycle purge) are defined in code; the runner enqueues each one when it is due.
- cPanel Cron Jobs on BigRock start the runner every 5 minutes. Preferred: a Node.js runner script on BigRock (through cPanel's Node.js app support, if the plan has it) connecting directly to Atlas. Fallback if Node.js is not available: the cron calls a secured Vercel route, `/api/jobs/run`, with a secret header.
- Each run takes a small batch and stops before 60 seconds, because shared hosting stops long processes. Locks prevent a job running twice; failed jobs retry with back-off up to 5 times, then show on the admin dashboard.
- The runner records a heartbeat; the dashboard warns if it has not run for 30 minutes.
- Because Vercel and BigRock have no fixed IP addresses, Atlas network access is open to all IPs; this is offset by a long random password and a database user limited to this one database.

**Email through cPanel**

- The CRM sends from a dedicated `notices@phmgindia.com` cPanel mailbox over SMTP (port 465, TLS) using Nodemailer.
- Every email goes through the job queue and is rate-limited below BigRock's hourly sending cap (configurable; default 100 per hour until the real limit is confirmed).
- SPF, DKIM and DMARC are set up through cPanel's Email Deliverability tool and GoDaddy DNS before go-live.
- A mailer adapter keeps a later move to Microsoft 365 or a transactional email service a configuration change.
- Delivery failures and bounces are recorded in `messageLogs`.

**Non-functional requirements**

- Responsive UI that works on a phone browser (installable as a PWA); no native app needed in v1.
- Common list pages load in under 2 seconds with 5,000 clients and 100,000 engagements.
- Excel/CSV export on every list; Excel import for clients, services and opening balances.
- All dates shown as DD-MM-YYYY, amounts in ₹ with Indian digit grouping (1,00,000).
- Automated tests for permissions, status transitions, GST calculation and invoice numbering.
- Source code, Atlas project and hosting accounts owned by the firm (associatesphmg@gmail.com or the firm's Workspace admin), not by the developer.

## 15. UI/UX and design system

The interface follows one concept, **"the modern ledger"**, drawn from the physical tools of a CA office: ruled ledger paper, the auditor's tick mark, the rubber stamp, carbon-copy blue and the case file. Every visual choice traces back to it, which is what keeps the product from looking like a generic template or AI output.

**Design principles**

- Numbers are the hero: tabular figures, right-aligned, Indian digit grouping (₹12,45,000).
- Calm by default, loud only for risk: colour is reserved for status, so an overdue item is found in one glance.
- Dense where people work (lists, grids), spacious where people decide (dashboards, client file).
- Every action reachable by keyboard; the mouse is optional for power users.
- Motion explains a change of state; nothing loops or moves for decoration.
- 3D appears only where it adds meaning, never on screens where people do daily work.

**Colour tokens** (defined as CSS variables; light theme "Paper", dark theme "Night shift")

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| Paper | #F5F1E8 | #12141A | App background |
| Surface | #FFFDF8 | #1A1D25 | Cards, tables, drawers |
| Ink | #1B2233 | #E9E4D8 | Primary text |
| Ink muted | #5E6577 | #9AA0AE | Secondary text, labels |
| Rule | #E3DCCB | #2A2E39 | Table lines, ledger ruling |
| Carbon blue | #2346A0 | #7D9BFF | Links, primary buttons, selection |
| Brass | #B07A2A | #D9A75A | Focus ring, highlights, partner-level items |
| Filed green | #2F7D4F | #5FBF86 | Filed, completed, paid |
| Waiting amber | #C98A16 | #E7B04A | Awaiting documents, due soon |
| Red pen | #B3362C | #F07466 | Overdue, rework, disputes |

**Typography** (self-hosted with `next/font`)

- **Fraunces** (variable serif) for page titles, client names and large dashboard figures; gives the product a professional, printed feel.
- **IBM Plex Sans** for all interface text; it has a matching Devanagari family if Hindi screens are added later.
- **IBM Plex Mono** for PAN, GSTIN, invoice numbers, UDIN and amounts in tables, so codes line up and are easy to read aloud.
- Scale: 12 / 13 / 14 / 16 / 20 / 28 / 40 px; tabular numerals everywhere numbers appear.

**Texture and form:** faint ledger ruling behind tables, a 2% paper grain on the background, hairline rules instead of heavy shadows, 6 px corner radius, 8 px spacing grid. No glassmorphism, no gradients except one brass hairline under the top bar.

**Signature moments**

| Moment | Where | What the user sees | Built with |
| --- | --- | --- | --- |
| Branch constellation | Login screen | A slowly turning relief map of North India; four glowing pins (Noida, Delhi, Ludhiana, Meerut) linked by thin arcs of light, with gentle cursor parallax. After sign-in the camera glides into the user's branch and dissolves into the dashboard. | React Three Fiber, drei, custom arc shader, subtle bloom |
| Audit tick | Document and review checklists | Ticking an item draws a hand-drawn tick in red or green ink, like an auditor's pen; un-ticking scratches it out. | Motion SVG path animation |
| The stamp | Engagement marked Completed | A rubber stamp reading COMPLETED with the UDIN presses onto the card at a slight angle, with ink texture and a soft press. | Motion spring, SVG turbulence filter |
| Deadline terrain | Partner dashboard (optional view) | A 3D landscape: weeks along one axis, branches along the other, column height = engagements due, colour = share overdue. Hover for counts, click to open the list; one toggle switches to a flat heatmap. | React Three Fiber, instanced meshes |
| Case file | Client page | The client opens as a file folder with tabbed dividers; switching tabs slides the divider, not the whole page. | Motion layout animations |
| Ledger sheet | Invoice preview | The invoice slides out like a printed sheet; the PDF matches the screen exactly. | Motion, React-PDF |
| Odometer figures | Dashboard KPIs | Figures roll to their new value when data changes, not on every page load. | NumberFlow |
| Command bar | Everywhere (Ctrl/Cmd + K) | Type a PAN, GSTIN, client name or an action ("new invoice", "GSTR-3B October") and jump straight there. | cmdk |

**Rules for 3D (Three.js)**

- Loaded lazily with `next/dynamic` and `ssr: false`, only on the login screen and the optional terrain view.
- The login form is usable before the scene finishes loading; the scene never blocks sign-in.
- Replaced by a static ledger-style illustration when the user prefers reduced motion, the device lacks WebGL2, has 4 or fewer CPU cores, or has data saver on.
- 3D code under 250 KB gzipped; target 60 fps on a mid-range laptop.

**Libraries**

| Need | Library |
| --- | --- |
| Styling | Tailwind CSS v4 with the tokens above as CSS variables |
| Accessible components | Radix UI primitives; shadcn/ui only as starting code, fully restyled to these tokens |
| Animation | Motion (formerly Framer Motion) |
| 3D | three.js via React Three Fiber, drei, @react-three/postprocessing |
| Data tables | TanStack Table + TanStack Virtual (smooth at 10,000 rows, sticky header and first column) |
| Charts | visx for custom on-brand charts; Apache ECharts for heavy dashboards |
| Drag and drop | dnd-kit (Kanban, reassignment) |
| Command bar | cmdk |
| Forms | React Hook Form + Zod |
| Dates | date-fns (en-IN locale), react-day-picker |
| Numbers | `Intl.NumberFormat('en-IN')`, @number-flow/react |
| Notifications | Sonner, restyled |
| Icons | Phosphor Icons (duotone in navigation, regular in tables) |
| Uploads and preview | react-dropzone, react-pdf |

**App shell and key screens**

- **Shell:** slim left rail (collapsible), top bar with branch switcher, command bar, quick-add (+), notifications and profile. Any client or engagement opens in a right-side drawer, so users never lose their place in a list.
- **Today** (everyone's home): three ruled columns, *Due today*, *Waiting on clients*, *Awaiting my review*, with the week's statutory dates as a single ledger line across the top.
- **Client case file:** client name in Fraunces, PAN and GSTIN as monospaced copy-on-click chips, risk, status and outstanding balance in the header; folder-style tabs below.
- **Engagement:** checklist with audit ticks on the left, tasks and comments in the centre, status timeline and the stamp on the right.
- **Kanban:** columns by status, swimlanes by assignee; each card's left edge is coloured by days to due date.
- **Compliance grid:** clients down, periods across, each cell a small ledger square coloured by status; sticky client column and arrow-key navigation.
- **Density toggle** (comfortable / compact) and **theme toggle** (Paper / Night shift) per user.

**What keeps it from looking AI-made**

- No purple-blue gradients, glowing blobs, gradient text, glass panels, emoji icons or stock 3D characters.
- No grid of identical rounded cards with drop shadows; hierarchy comes from type, ruling lines and spacing.
- Real (anonymised) firm data in every design and demo, never lorem ipsum.
- Custom empty-state illustrations in the ledger style: ink line drawings with brass accents.
- A UI designer produces the Figma screens and token file before coding starts; developers build every component in Storybook against it, and the firm signs off screens before build.

**Quality bars:** WCAG 2.2 AA contrast and full keyboard use; all motion respects reduced-motion settings; Lighthouse performance 90+ on list pages; interactions respond in under 200 ms; layouts tested at 390 px (phone), 1280 px (laptop) and 1920 px (monitor).

## 16. Security, privacy and professional obligations

The CRM will hold PAN, Aadhaar, bank details, financial statements and government portal passwords for every client, so security is a core requirement, not a later add-on.

**Access and authentication**

- Login with email + password plus mandatory 2FA (authenticator app or email OTP) for all staff.
- Optional single sign-on later, if the firm moves email to Microsoft 365 or Google Workspace.
- Session timeout after 30 minutes idle; force logout of a user instantly when they leave the firm.
- Interns' and employees' access limited to clients they are assigned to (section 2).

**Data protection**

- HTTPS everywhere: Vercel for the app, AutoSSL on the BigRock file subdomain.
- Client documents encrypted per file (AES-256-GCM) before they are written to BigRock; Atlas encrypts the database at rest.
- Portal passwords, bank details and Aadhaar encrypted at field level in the app (AES-256-GCM, or MongoDB Client-Side Field Level Encryption), with the master key kept only in Vercel's encrypted environment variables; reveal-on-click, every reveal logged.
- Aadhaar stored masked except where the full number is needed for a filing.
- Files served only through short-lived signed links from the file gateway, never public links; the storage folder sits outside the public web folder.
- Database hosted in India (Atlas Mumbai); confirm the country of the BigRock server that holds the files (section 18).
- Daily backups: Atlas backups for the database and a nightly off-server copy of the encrypted document vault, with a restore test every quarter.

**Digital Personal Data Protection Act, 2023 (DPDP)**

- Record the purpose and consent basis for client personal data (captured in the engagement letter).
- Ability to export all data held on a client and to delete personal data on a valid request when retention obligations allow.
- Breach detection and an incident log; the firm's lawyer should confirm the notification process under the DPDP Rules.

**ICAI and professional obligations**

- Confidentiality of client information: the access controls and audit log above support this.
- Working papers and documentation retained per firm policy and Standards on Auditing (default 8 years in settings).
- UDIN captured against every certificate, audit report and attestation.
- Client-facing messages and any portal content stay factual and non-promotional, consistent with ICAI's advertising rules.

The developer should treat this section as acceptance criteria and the firm should have it reviewed before go-live.

## 17. Rollout plan and acceptance criteria

Ship in three phases; Phase 1 alone should let the firm stop using spreadsheets for tracking, and each later phase starts only after its gate is met.

&#91;embedded content: rollout roadmap · 3 phases, 2 gates (not to scale)\]

The developer should estimate effort and cost per phase in their proposal; the firm then fixes dates.

**Go-live approach for Phase 1**

1. Seed the service catalog and due-date master; firm reviews and corrects.
2. Import existing clients, team members and opening receivables from Excel.
3. Pilot at the Noida head office for one compliance month, running in parallel with current sheets.
4. Fix issues, then roll out to Delhi (Rohini), Ludhiana and Meerut.
5. Retire the old spreadsheets once Gate 2 is met.

**Phase 1 acceptance criteria**

- [ ] Each role sees and can do exactly what the permission matrix in section 2 allows, checked on the server.
- [ ] An intern or employee cannot mark an engagement *Completed*; assignee and reviewer cannot be the same person.
- [ ] Recurring engagements for a month are generated automatically for all subscribed clients, with correct due dates.
- [ ] Changing a statutory due date in the master updates all open engagements on that rule and is logged.
- [ ] Every engagement shows client and firm checklists with pending items counted on the dashboard.
- [ ] Invoice numbers are sequential with no gaps per series; CGST/SGST vs. IGST is chosen correctly from place of supply.
- [ ] Payments can be split across invoices and TDS recorded; client ledger balances match.
- [ ] Every create, edit, delete, status change, file download and credential reveal appears in the audit log with before/after values.
- [ ] Overdue, due-this-week, pending-documents and unbilled-work figures on the Partner dashboard match the underlying lists.
- [ ] All lists export to Excel; client import from Excel validates PAN/GSTIN and flags duplicates.
- [ ] Daily backups run and a restore has been tested once before go-live.

## 18. Open questions for the firm

These decisions change the build and should be answered before development starts.

- [ ] How many users at launch (partners, CAs, employees, interns) and roughly how many active clients?
- [ ] Is invoice numbering one series for the firm or one per branch? Is the firm registered under GST in each state (UP, Delhi, Punjab)?
- [ ] Which accounting software should invoices and payments export to (Tally, Zoho Books, other)?
- [ ] Should articled interns ever see fees or invoice amounts on engagements they work on?
- [ ] Is a dedicated Accounts / Billing role needed, or do partners handle billing?
- [ ] Which WhatsApp Business API provider, and is the firm's WhatsApp number available to move onto the API (it can't stay on the regular WhatsApp app at the same time)?
- [ ] Will clients get portal logins in phase 3, or will document upload links be enough?
- [ ] Existing data to migrate: where does it live today (Excel sheets, Tally, another tool) and how far back?
- [ ] Build custom vs. buy: has the firm evaluated existing Indian CA practice-management tools, and what made them a poor fit?
- [ ] Budget and target go-live date for phase 1.

**Questions about the current hosting setup**

- [ ] Does the BigRock plan offer Node.js apps in cPanel ("Setup Node.js App")? This decides how the job runner is built (section 14).
- [ ] What is BigRock's hourly email sending limit, and the plan's disk space and inode (file count) limits?
- [ ] In which country is the BigRock server located?
- [ ] Where will the nightly backup of the encrypted document vault go (for example, the firm's Google Drive or a second hosting account)?

# PHMG CRM — Progress

Source of truth for what is done. Updated at the end of every step.
Status: ⬜ not started · 🟡 in progress · ✅ done

Last updated: 29-10-2026

## Phase 1 — Core MVP

| Step | What | Status | Notes |
| --- | --- | --- | --- |
| 0 | Project setup: Next.js, Tailwind tokens and fonts, ESLint, Prettier, Vitest, Playwright, Atlas connection, env handling, empty app shell | ✅ | Done 16-10-2026. Storybook deferred to Step 1; Atlas cluster still to be created by the owner |
| 1 | Auth, users, roles and branches (login, TOTP 2FA, permission helper, user management, seed partner) | 🟡 | Built 16-10-2026. Cannot be run until the owner creates the Atlas cluster; 6 Playwright tests are waiting on it |
| 2 | Audit log foundation (transaction helper, Mongoose plugin, hash chain, Activity tab, firm audit screen) | 🟡 | Built 16-10-2026. Needs Atlas to run: transactions require a replica set |
| 3 | Clients (profile, contacts, GSTINs, credentials vault, groups, onboarding, duplicate checks, Excel import) | 🟡 | Built 16-10-2026. Needs Atlas to run; 22 Playwright tests waiting |
| 4 | Service catalog (templates, versions, checklists, steps, starter catalog seed) | 🟡 | Built 16-10-2026. Needs Atlas to run; 3 Playwright tests waiting. Fees and most SAC codes left blank for the owner |
| 5a | Engagements core (template snapshot, status pipeline, maker-checker, tasks, checklists, comments, client tab, Today) | 🟡 | Built 16-10-2026. Needs Atlas to run; 2 Playwright tests waiting |
| 5b | Engagement views (filters, Kanban, calendar, bulk actions, CSV export) | 🟡 | Built 16-10-2026. Needs Atlas to run; 3 Playwright tests waiting |
| 6a | File gateway and documents core (PHP gateway, storage adapter, both drivers, uploads, versions, preview, permanent file, recycle bin) | 🟡 | Built 16-10-2026. The PHP gateway has never been executed — no PHP on the build machine — so BigRock is its first run. 2 Playwright tests waiting on Atlas |
| 6b | Document requests (public upload link, no login) and document search / "pending from client" | 🟡 | Built 17-10-2026. Needs Atlas to run; 2 more Playwright tests waiting. Emailing the link waits for the mailer in Step 9 |
| 7a | Job queue and runner (queue, runner, both deployment shapes, cron setup, heartbeat screen, recycle purge wired in) | 🟡 | Built 17-10-2026. Needs Atlas to run. Owner still to say whether cPanel has Node.js app support |
| 7b | Due-date master (rules, owner verification, government extensions, recurring generation) | 🟡 | Built 17-10-2026. **The owner must confirm all 11 rules in Settings → Due dates before any statutory date is applied.** 2 Playwright tests waiting on Atlas |
| 7c | Firm calendar and compliance status grid | 🟡 | Built 17-10-2026. Needs Atlas to run; 1 more Playwright test waiting |
| 8a | Invoices (GST computation, gapless numbering at issue, draft/issue lifecycle, credit notes, branch GSTINs) | 🟡 | Built 17-10-2026. **Blocked for real use until branch GSTINs are entered** — invoices can be drafted but not issued. 2 Playwright tests waiting on Atlas |
| 8b | Payments, allocations, client ledger, receivables ageing, unbilled work report | 🟡 | Built 17-10-2026. Needs Atlas to run; 1 more Playwright test waiting |
| 8c | Invoice PDF and Excel export | 🟡 | Built 17-10-2026. The Tally / Zoho import format still waits on the owner choosing one |
| 9a | Mail queue, templates, in-app notifications and the five event-driven messages | 🟡 | Built 17-10-2026. **Client email is off by default** — messages are composed and logged but not delivered until the owner switches it on |
| 9b | Scheduled reminders, overdue chasing, daily digest, weekly summary, per-rule settings | 🟡 | Built 18-10-2026. Needs Atlas to run; 2 more Playwright tests waiting. **Client-facing chasing does nothing until client email is switched on** — by design, not held in a queue |
| 10 | Dashboards and reports (Phase 1 set), saved views, Excel export on every list | 🟡 | Built 18-10-2026. Needs Atlas to run; 2 more Playwright tests waiting. Time-based reports (timesheet, utilisation, realisation, profitability, intern exposure) deferred to Phase 2 with time tracking |
| 11 | Signature UI moments and polish (login 3D scene + fallback, audit tick, stamp, command bar, a11y pass) | 🟡 | Built 18-10-2026. All 8 signature moments of spec §15 built, plus Kanban drag. Needs Atlas to run; 5 more Playwright tests waiting. **Three light-theme colours darkened to pass WCAG AA — see decisions** |
| 12 | Hardening and go-live (acceptance criteria, security checklist, backups, DEPLOY.md, migration rehearsal) | 🟡 | Built 19-10-2026. **Two holes found and fixed: a deactivated user kept working for up to 30 minutes, and a soft delete was saved outside its own audit transaction.** DPDP export and redaction, incident log, team and opening-balance imports, backup script, `docs/ACCEPTANCE.md`, a finished `DEPLOY.md` with the migration rehearsal and the monitoring setup. **Everything still open is owner-side or needs the database** |

## Phase 2 — role panels, 360° views, practice modules, A/B/C hierarchy, Portal Log

Step list approved by the owner 19-10-2026, against the Phase 2 upgrade brief.
**Opened although Phase 1 is not yet in daily use**, which `CLAUDE.md` gates
Phase 2 on — see the decisions table. Nothing in Phase 1 has ever run against a
database, so every Phase 2 step will report "built, needs Atlas" for the same
reason, including the security fixes in P2-1.

| Step | What | Status | Notes |
| --- | --- | --- | --- |
| P2-0 | Verify the brief's gap analysis against the code, then present the step plan | ✅ | Done 19-10-2026. 15 of 15 rows confirmed; 6 corrections and 6 further gaps found — see below |
| P2-1 | Permissions: D2, D3, `granted` scope, 9 new areas, `describeMatrix()`, client actor kind; the `generateMetadata` leak; the lockout helper | 🟡 | Built 19-10-2026. **Three more holes found and fixed on the way through.** Splitting `clientSensitive` moved to P2-2, where grant sections exist to hang it on. Needs Atlas to run; 2 Playwright tests waiting |
| P2-2 | `ClientAccess` + `lib/access/clientAccess.js` wired into the clients list, case file, tabs, document links, vault, search and command bar; grant UI; `expireGrants` job | 🟡 | Built 19-10-2026. **The worst hole in the build found and fixed: an employee could download the whole DPDP dossier of any client in the firm.** Includes the `clientSensitive` split deferred from P2-1, and the Team & access tab brought forward from P2-5. Needs Atlas to run; 6 Playwright tests waiting |
| P2-2b | Sample seed data: 6 staff with `reportingTo`, 4 clients, services across A/B/C, 9 engagements, grants of three widths | 🟡 | Built 19-10-2026. Opt-in behind `--sample`, and refuses to run with `NODE_ENV=production`. The portal user, UDIN rows, DSC tokens and document templates are seeded by the steps that create those models. Needs Atlas to run |
| P2-3 | `/me` (and `mustChangePassword` finally enforced) · employee rail · My senior CA · `/team` + `/team/[id]` Employee 360 · offboard wizard · MobileNav "More" sheet | 🟡 | Built 19-10-2026. **Nobody could change their own password at all, and `mustChangePassword` was written in three places and read in none.** `/settings/users` is now a redirect to `/team`. Needs Atlas to run; 6 Playwright tests waiting |
| P2-4 | A/B/C labels and `TierBadge` everywhere · per-step `minRole` and `assignTask` · the four enforcement gaps · C-tier bulk approve | 🟡 | Built 19-10-2026. **An A-tier job could be signed off by a CA, and any step was tickable by anybody on the engagement.** Also: tier counts per person, brought over from P2-3. Needs Atlas to run; 8 Playwright tests waiting |
| P2-5 | Client 360: the new tab set, tab counts, outstanding balance in the header, Compliance tab filled | 🟡 | Built 19-10-2026. Tab set kept at the eight that exist (owner, D10), with counts. The firm grid and the client grid are now one component. Includes "who works on this client", deferred from P2-2. Needs Atlas to run; 8 Playwright tests waiting |
| P2-6 | `FirmSettings` · ICAI page · `User.icai` · CPE log · ICAI notes | 🟡 | Built 19-10-2026. **The firm had no record of itself: its name was a literal in fifteen files and its FRN nowhere.** Now one document, wired into invoices, reports, exports, emails and the client upload page. No ICAI requirement is assumed (owner, D11). Needs Atlas to run; 6 Playwright tests waiting |
| P2-7 | UDIN register (and engagement sync) · DSC register (and `dscExpiring` rule, dashboard tile) | 🟡 | Built 19-10-2026. **A UDIN was a free-text field: the same number could sit on two jobs.** The register is now the record and the engagement field a copy of it, written in one transaction. DSC is expiry-only (owner, D12). Includes the sample UDIN and DSC rows deferred from P2-2b. Needs Atlas to run; 8 Playwright tests waiting |
| P2-8a | Audits · Statutory · Tax page, plus the `assurance` fields and `filedOn` | 🟡 | Built 20-10-2026. **The system could not say when anything was filed, or whether an audit opinion was clean.** Three books over the engagements that already exist, no second place to update. Needs Atlas to run; 3 Playwright tests waiting |
| P2-8b | Based Docs: `DocTemplate`, `lib/docs/resolve.js`, `templatePdf.jsx`, draft/final tier rules, 8 draft templates, template admin | 🟡 | Built 20-10-2026. **The eight starter templates ship unapproved and make watermarked drafts only** — a partner has to read each wording before anything can be issued. No file is stored: a final holds its own words and the PDF renders from them. Needs Atlas to run; 4 Playwright tests waiting |
| P2-8c | DOCX output | 🟡 | Built 20-10-2026. **`docx` approved as a dependency** (owner, D16). Word and PDF now come off one `prepareRender()`, so the two formats cannot print different words or answer the permission question differently. Needs Atlas to run; 1 more Playwright test waiting |
| P2-9a | `ClientUser` · client auth provider (2FA optional) · `/client/login` · middleware · portal-user admin · `sharedWithClient` | 🟡 | Built 20-10-2026. **The first login in the system for somebody outside the firm.** Four independent locks between a portal token and a staff screen; nothing is shared with a client until a CA ticks it. Needs Atlas to run; 7 Playwright tests waiting |
| P2-9b | The `/client/*` pages: overview, work, documents, invoices and PDF, ledger, profile and change request | 🟡 | Built 21-10-2026. Six pages, every query through one `lib/access/clientScope.js` — six pages each writing their own filter is six chances to show the wrong company's invoice. Needs Atlas to run; 4 Playwright tests waiting |
| P2-10a | Portal Log: rename, redirects, redesign | 🟡 | Built 21-10-2026. **The record-type filter had been stale since Step 2** — eight kinds of entry, `ClientUser` among them, could not be filtered for at all. Now derived from the log itself. `/audit` redirects with its filters intact. Needs Atlas to run |
| P2-10b | Settings: section layout and "Needs attention" | 🟡 | Built 21-10-2026. Ten checks for the conditions that make the system quietly wrong — unconfirmed due dates first among them — plus five groups instead of sixteen links in a column, and the read-only permissions table `describeMatrix()` was written for in P2-1. Needs Atlas to run; 4 Playwright tests waiting |
| P2-10c | Reports: KPI strip, category nav, 8 new report definitions | 🟡 | Built 21-10-2026. Eight reports from data the Phase 2 modules had already collected but nothing read — `filedOn`, `assurance`, the two registers, the grants, the portal accounts and `reworkCount`. Needs Atlas to run; 1 more Playwright test waiting |
| P2-10d | Final rail and Practice group · `scripts/doctor.js` additions · full Phase 2 acceptance pass | 🟡 | Built 21-10-2026. **Phase 2's step list is complete.** The doctor now reads the same check list the Settings strip does instead of keeping its own copy; `docs/ACCEPTANCE.md` has a Phase 2 half. Needs Atlas to run; 2 more Playwright tests waiting |
| P2-11 | Groups you can work from: `/groups`, `/groups/[id]`, the sibling band on a case file, the group filter on the engagement list and receivables | 🟡 | Added 24-10-2026 at the owner's request ("one client with two or three businesses"). **No new collection: with separate PANs each business already is a client record, and `ClientGroup` is the owner above them** (D17). One scoped rollup in `lib/groups/summary.js` feeds all four screens. Also fixed: the rail filtered a group's children and then threw the result away, so an intern was shown Practice registers they cannot open. Needs Atlas to run; 2 Playwright tests waiting |

| P2-12 | A target completion date on every engagement: the field on the create form, and `istInputDate()` | 🟡 | Added 24-10-2026 at the owner's request. The target date already existed as `internalDue` and was editable on the engagement page and in bulk, but **not at creation** — so work on a service with no turnaround was created with no target and nothing said so. **A one-day bug found and fixed in nine places:** a date stored at IST midnight is 18:30 UTC the day before, so `toISOString().slice(0, 10)` prefilled every date input with yesterday and bucketed work into the wrong day of the month view. Needs Atlas to run; 1 more Playwright assertion waiting |

| P2-13 | Three screens the owner asked for: the group on the client list, partner and papers on the UDIN register, compliance read by head | 🟡 | Added 24-10-2026 at the owner's request. **A new client can no longer be saved without a group** (required on creation only; the clients already on the books stay editable), and the spreadsheet import gained a Group column that creates the group as it writes the row. **A UDIN can no longer be recorded without naming the partner or CA it was generated against** — including from the engagement filing panel, which had been quietly recording nobody whenever an employee saved one. Documents now hang off a UDIN, so the certificate and the papers behind it read together. Compliance opens on a new **By head** view: one line per service under its category, monthly / quarterly / yearly, with a client-partner filter across all three views. Needs Atlas to run; 5 Playwright tests waiting |

## Phase 3 — prototype parity

Owner's instruction, 26-10-2026: **"keep everything exact like prototype"** —
the product model of `CA-Firm-OS-v6.2.html` becomes the target. The gap report
behind this list is `docs/GAP-v6.2.md`.

⬜ **Proposed. Awaiting the owner's approval of the step list** (CLAUDE.md: the
step list is approved before the phase starts). Nothing below is built.

Five things are deliberately *not* copied exactly, because CLAUDE.md forbids
them: money stays integer paise, dates stay DD-MM-YYYY, the audit log and soft
delete and field encryption all stay, statutory dates arrive unconfirmed, and
ICAI wording ships unapproved until a partner reads it. The behaviour is the
prototype's; the foundation is this project's.

**Group 1 — the model. Everything else reads it, so it goes first.**

| Step | What | Status |
| --- | --- | --- |
| P3-1 | **Filing milestones.** `Engagement.milestones[]`; the due-date engine returns a list, not one date; each milestone keeps its own acknowledgement, proof linked by document id, the version filed, and the due date as it stood on the filing day; a wrong record is superseded with a reason and stays readable | 🟡 | Built 26-10-2026. **The due-date master already said this was wrong** — a comment on the GST rule read *"GSTR-3B is the later of the pair, so it governs the engagement"*, so a month with GSTR-1 on time and GSTR-3B nine days late could only be recorded as one or the other. `statutoryDue`, `filedOn` and `ackNo` are kept as **derived** fields written in one place, which turned a 40-file rewrite into a 2-surface change. **A GST engagement's due date is now the 11th, not the 20th** — see decisions. 52 new unit tests (890 total); 2 Playwright tests waiting on Atlas. QRMP still not covered and now says so loudly |
| P3-2 | **Document requests.** Six states (Requested → Received → Format checked → Accepted / Replacement requested / Not required); numbered submissions where a replacement clears earlier checks; a rejection carries a reason the client receives; three client replies — cannot provide, someone else will provide it (one-item link, no other access), please clarify | 🟡 | Built 26-10-2026. **The completion gate was wrong and nobody had noticed**: it demanded every mandatory item be `Verified`, so an item a CA had decided was not needed blocked the engagement for ever and the only way out was to tick it as received — a lie about a document that does not exist. **This is the second write a portal account can make**, and `profile/actions.js` said in so many words that there was only one; see D29. 30 new unit tests (920 total); 2 Playwright tests waiting on Atlas |
| P3-3 | **Payment promises, and advances given a home.** A promise date per invoice pauses that invoice's reminders and expires by itself; credit on account is listed and reachable; the collections tile says what is not yet allocated | 🟡 | Built 26-10-2026. **Most of this step turned out to be already built, correctly** — `Payment` is a client-level receipt with embedded allocations, `collections()` sums receipts by date and never reads an allocation, and cross-client allocation is impossible because `openInvoicesFor()` scopes the options. The gap report's premise was wrong about this repo; see D32. What was genuinely missing was promises, which did not exist at all. 14 new unit tests (934 total) |
| P3-4 | **Scope and waivers.** Every finished job is billable, in retainer or waived; a fee must be a positive amount; free work is a waiver with a reason, requested by staff and approved by a partner, recorded with both names; not-separately-chargeable work stays listed with its reason | 🟡 | Built 26-10-2026. **The fee rule bites at billing, not at creation** (D37): the seeded catalog prices everything at ₹0 on purpose, so enforcing it earlier would have stopped work being created for a service the firm has not priced yet. **Three places counted unbilled money and would each have counted a waived fee as money owed** — the dashboard tile, the unbilled report and the partner's weekly email; a query fragment in `lib/engagements/scope.js` is now the one answer, and it has to match a *missing* `scope` field because a schema default never reaches rows already written. **A dead second copy of the unbilled query was deleted** rather than taught the rule (`unbilledFor()` in `invoices/actions.js`, which nothing called). One test caught a real inversion: "nothing is pending on this job" and "this job can be invoiced" are different questions, and retainer work answers them differently. 27 new unit tests (976 total); 3 Playwright tests waiting on Atlas |
| P3-5 | **Gates and clocks.** Review before filing, then client confirmation of the figures for GST / GSTR-9 / ITR / TDS, naming who confirmed, when, with what evidence, against which version; a change after approval raises the version and resets both gates; preparation and review targets computed from the statutory date; the **at risk** state | 🟡 | Built 26-10-2026. **P3-1 left the hooks and they lined up exactly**: `recordFiling` already wrote `milestone.versionFiled = engagement.version` against a field the schema did not have, and `canRecordFiling` carried a comment saying the review order was P3-5's to reverse. Both are now true. **The maker-checker rule existed in one place and is now used in two** — `checkReviewer()` was extracted out of `checkStatusChange`, so approving a version and marking work Completed cannot drift apart; the A-tier floor was only enforced for completion before. **Fifteen P3-1 tests failed the moment the gate went in**, which is the gate working: their fixture filed without an approval, so it now starts from approved work and `tests/gates.test.js` owns the gate. One bug found by a test: `recordClientConfirmation` read the wall clock, so a dated confirmation could not be tested at all — it takes `now` now, like `recordFiling`. **At risk is a report, not a list filter** (D42). 34 new unit tests (1010 total); 3 Playwright tests waiting on Atlas |

**Group 2 — reading what we already hold. No new collections.**

| Step | What | Status |
| --- | --- | --- |
| P3-6 | **Issues**, the landing page for everyone: every exception computed live from the records, each row with the button that performs the real action, nothing to mark resolved. Plus the per-job version of the same thing — one next step, role-aware, with Nudge and Help | 🟡 | Built 26-10-2026. **22 kinds of row across nine groups, no new collection and no `resolved` field anywhere** — `tests/issues.test.js` asserts the absence, so a well-meaning "mark as handled" button fails the suite. Every rule reads a function that was already tested where it lives (gates, risk, scope), so Issues has no second opinion about anything. **Three rows the firm had no way of seeing before**: a client who cannot provide a document, a client question nobody answered, and a client with nobody who may confirm figures. **Issues is now the landing page** (D43) — 23 `redirect("/today")` sites, the sign-in default, the error page and 26 Playwright sign-in helpers moved; Today stays on the rail. **The build caught a real mistake**: the Issues screen is a client component and imported the module that imports Mongoose, which bundles the MongoDB driver for the browser — the display half is now `lib/issues/shape.js`. Also done here, owed from P3-5: **a client can confirm the figures from the portal**, behind a right a partner grants per person (D44) — the third write a portal account can make. 24 new unit tests (1034 total); 3 Playwright tests waiting on Atlas |
| P3-7 | **Access versus view.** Access is enforced and already largely built (`branchIds`, `ClientAccess`); this adds the view selector — all branches, one branch, my work across branches — which never changes a record, a GSTIN or an invoice series, plus the no-access page and firm-wide labelling | 🟡 | Built 26-10-2026. **The branch switcher in the top bar was decoration** — `defaultValue="all"` and no handler at all, a control that looked like it filtered and did nothing since Step 0. It is now real, with the third option the prototype has: *my work across branches*. **The view rides on the actor**, so `branchFilter()` applies it in one place instead of twenty list pages each remembering to — which also means a page that forgets still gets *access* right, because access is the `branchIds` line and the view is the one under it. `readView()` treats the cookie as hostile input: a branch id the account is not assigned to is discarded, and `branchFilter` refuses it a second time, so **the worst a hand-edited cookie can do is show you less**. "My work" landed on the `params.mine` condition that was already there. **A refusal now says who can open it for you** instead of redirecting to the list, which told somebody following a link that the record did not exist — and it names a colleague, never anything about the client. Firm-wide screens say the view does not apply to them; a record opened from outside the current view says why it is visible. 16 new unit tests (1050 total); 6 Playwright tests waiting on Atlas |
| P3-8 | **Disabled with the reason** on every action control, instead of offered then refused | 🟡 | Built 26-10-2026. One helper, `whyNot()`, reads the refusal off the same matrix `can()` reads — so a screen cannot explain a rule that is not the rule, and `tests/why.test.js` checks that across every role, area and action: **`whyNot` is silent exactly when `can` is true**. The sentence names the role that is short *and* the roles that are not, or says it is the record rather than the role. `nextStatuses()` hid every move somebody could not make, which is right for a board and wrong on the engagement — `offeredStatuses()` now returns all of them with their reasons, and the old helper is built on it. **The reason is visible text, not a tooltip**: a disabled button cannot be focused, so a `title` reaches nobody on a phone or a keyboard, which is exactly the people who need it; `aria-describedby` ties the two. **And a duplicate of my own making is gone** — P3-6 put Approve on the Next band *and* in the Approval section, two buttons that could disagree about being disabled; the band now points at the one that owns it. 13 new unit tests (1063 total); 1 more Playwright test waiting on Atlas |
| P3-9 | **Never-created periods carry a reason**: our miss, handled by another professional, or not engaged for that period — only the first is a firm failure | 🟡 | Built 26-10-2026. One small collection, `periodReasons`, one row per client, service and period, holding **only the two reasons that excuse a hole** — handled by another professional, or not engaged for that period. There is deliberately **no "our miss" record**: the fix for that one is to create the job, and a note saying "we missed this" would be a second list to maintain. So the figure on the compliance screen now means what it says, and is renamed to match: **periods nobody has answered for**. The holes are also listed as a worklist above the grid, each with the three answers, because a dot on a grid is not something anybody works through. The screen says in words that only the first is a firm miss. **The P3-6 mistake was nearly repeated**: `lib/compliance/grid.js` is pure and read by screens, so the labels went in `lib/compliance/reasons.js` and the model imports them, not the other way round. Withdrawing an explanation is a soft delete, because deciding a period was somebody else's is part of why the firm did nothing about it for a year. 7 new unit tests (1070 total); 1 more Playwright test waiting on Atlas |
| P3-10 | **Automation gate.** Client-facing batches queue for partner approval with a preview; trusted is partner-only; quiet hours; four messages per client a month; over 25 always queues; firm-wide pause; stale batches cancel themselves; an unchecked document holds a batch; append-only run log | 🟡 | Built 26-10-2026. The gate sits between the morning sweep and the firm's clients: client-facing reminders are now grouped by rule and handed to `lib/mailer/gate.js`, which decides between sending, queueing for a partner, deferring to business hours, and the firm-wide pause. **A message to a colleague is not a batch** and is untouched — nobody needs approval to tell a CA their review is waiting. Trusted is **not** unlimited: above 25 clients it queues anyway, quiet hours (21:00–08:00 and Sundays) still defer, the four-a-month cap per client still applies, and the pause still stops everything; the screen says all four beside the toggle. **The two outcomes that are easy to conflate are kept apart**: a reason that has *gone* cancels the message (chasing somebody for what they have already done is the worst thing an automated system does to a relationship), while a document that arrived and nobody has checked **holds** it — if it is the wrong month the chase is still owed. `sendBatches` is the approval queue and the run log in one, with **no soft-delete plugin on purpose**: a record of what the firm said to its clients should not be removable from a list even with a `deletedAt` beside it. Exports one row per recipient, because a peer reviewer asks about a client, not a batch. `istHour()` was added to `lib/dates.js` — `istParts` is a date-only formatter and the quiet-hours rule needed the hour. 28 new unit tests (1098 total); 4 Playwright tests waiting on Atlas |

**Group 3 — the modules the spec covers in a catalog row each.**

| Step | What | Status |
| --- | --- | --- |
| P3-11 | **Notices as matters**: several submissions each with its own date and acknowledgement, hearings with adjournments counted, limitation dates computed from the notice type with the section shown and seeded unconfirmed, one merged timeline, the plain-words paragraph for the client, paper book | 🟡 | Built 27-10-2026. A notice is its own record now: the starter catalog treats it as one job with one due date, which is how you track a letter rather than a matter. **The law table is the careful part** (D48). Six notice kinds with their rules and sections, taken word for word from the prototype — which itself carries "to be verified by a practising CA before use" — and **every one arrives unconfirmed**. Nothing anywhere turns a rule into a date until a partner has read it and ticked it; `lawClocks` names which of three nothings it is (not a clock, not confirmed, or the date it counts from has not happened). The adjournment **count** is arithmetic and always shown; the adjournment **cap** is law, so it appears only once s.75(5) is confirmed. **One test caught a real off-by-one**: every date here is an IST midnight, so `shiftDate` was doing calendar arithmetic on the wrong UTC day and 31 January plus a month came out as 1 March instead of 28 February — on a limitation date that is the difference between an appeal in time and one that is not. `nextDue` deliberately **never** offers a limitation date: that is the firm's last chance, not what it owes this week, and "appeal by March" at the top of a Monday list is how Tuesday's reply gets missed. The client's paragraph refuses section numbers. The merged timeline is derived, not stored. 28 new unit tests (1126 total). **Not done: binding the paper book into a PDF** — the bundle is an index, and the screen says so |
| P3-12 | **The monthly GST cycle** end to end: data template out, upload, automatic validation, correction loop, staff review, indicative computation with set-off in the legal order, client confirms the tax, challan, GSTR-1, payment, GSTR-3B, proof, invoice — and the preparation workbook marked *not a filing file* | 🟡 | Built 27-10-2026, **partly — read the last sentence.** What is built is the middle of the cycle, which is the part that did not exist: the workbook out (per client, per period, stamped *not a filing file* on the front and on every sheet), the workbook back, the automatic check, the correction loop, and the indicative computation. **The set-off order is the careful part** (D49): IGST credit first, then own-head, and **never CGST against SGST** — that one is not a rounding difference, it is the wrong tax to the wrong government. Seven steps, tested step by step including the two that must not exist, and cited to s.49(5), s.49A and Rule 88A with a partner's confirmation required, like P3-11's table. Credit is taken only where the client marked it eligible **and** the goods arrived; what is excluded is **named**, never silently dropped. **A test caught a divide-by-a-hundred**: `lib/excel.js`'s `money` kind takes paise and the client's sheet is in rupees, so every figure came out at 1% — the `rupees` kind that already existed is the right one. The check names the sheet, the Excel row, the column and the fix, so what goes back is something a bookkeeper can work through. 27 new unit tests (1153 total). **Not built, and deliberately: the parts of the prototype's eight-day cycle that other steps already cover or that wait on a decision** — data packs and reminders are the sweep plus the P3-10 gate, uploads are the P2-9/P3-2 token links, the review and client-confirmation gates are P3-5, challan / GSTR-1 / GSTR-3B / proof are P3-1 milestones, the invoice is P3-4. WhatsApp is not built at all: spec §18 is unanswered, and the gap report put it behind that decision |
| P3-13 | **Audit studio, part 1**: seven stages, standards-referenced checklists, area programmes, the exception lifecycle through to posted and verified | 🟡 | Built 27-10-2026. Seven stages, the ten working-paper areas with their letters as the prototype files them (A B C E F G H J N Z — D and I are skipped on purpose, renumbering them would break every reference in a file somebody has made up), a programme of four or more questions under each, and the exception lifecycle. **Three rules carry this step.** *Escalation is not resolution*: with the partner and asked-the-client stay inside the unresolved list, because a file where "with partner" counts as dealt with is a file where nothing is. *Posted is not verified*: the books have been changed and nobody has checked the change, which is a different fact. *Nothing is signed over an open exception*: the move to Report + UDIN is disabled with the count, since the report says the auditor obtained sufficient evidence and with something open it does not say something true. Closing one by explaining it is **partner-only and needs words**, because that reason is the whole of the audit evidence for leaving it. An area at 100% with an exception open **is not complete**, which is the rule a percentage bar quietly breaks. Standards arrive unconfirmed as ever (D48). **The confirmation collection was renamed** `noticeLawConfirmations` → `ruleConfirmations` (D50): a third table now uses it, nothing has ever run against a database, so the name was corrected rather than left to mislead. 30 new unit tests (1183 total). Not in this step: the ledger-wide tests, CARO, 3CD, the opinion and the locked snapshot — those are P3-14 |
| P3-14 | **Audit studio, part 2**: tests across the whole ledger rather than a sample, CARO and 3CD pre-filled from them, the three-layer opinion, a signed report as a locked snapshot, amendments needing a fresh review and a new UDIN, the closure clock | 🟡 | Built 27-10-2026. **The sixteen tests are recorded, not run** (D51) — spec §1 puts the accounting ledger out of scope, so this system does not hold the vouchers and writing a runner over data it has never seen would be a screen that reports zero flags because there is nothing to test. What it holds is the programme: each test, its authority, **what it was run over and whether that was the whole population or a sample** (null until somebody says, because those are different audits and neither should be a default), and what it found. A test recorded as flagging things with nothing raised against it is caught before signing — that is the worst state a file can be in, since it says the firm looked, found things, and wrote none of them down. **CARO's twenty-one clauses and eleven 3CD clauses are pre-filled from the tests that feed them**, so an answer comes off the evidence; a person still answers each one. **The opinion has three layers and they may disagree** — what the matters suggest, the reviewer's conclusion, what is signed — and the conclusion is stamped with a **fingerprint of its inputs**, so moving a matter or the opinion makes it stale and it has to be given again (the same device as P3-5's approval version). **A signed report is a snapshot**: version, date, UDIN, opinion, matters and text, kept exactly as issued. An amendment needs a partner, a reason, and **its own UDIN** — reusing the first report's number is refused by name, because identifying a particular document signed on a particular day is the entire purpose of having one. The closure clock counts days and names SA 230 without asserting a period. 40 new unit tests (1223 total) |
| P3-15 | **Certificates and the auditor's report**: ICAI Guidance Note structure, assurance level changing the wording, locked paragraphs, banned-phrase check, evidence checklist, UDIN checked against the signer's membership number, register; and the SA 700 generator whose switches restructure the report | 🟡 | Built 27-10-2026. **The level of assurance rewrites the document**, it does not label it: limited assurance gives a conclusion in the negative form *and* makes describing the procedures compulsory, and switching level rewrites the locked paragraphs while keeping what a practitioner has written into the open ones. Four phrases are refused as they are typed — "true and correct", "certify that", "to whomsoever", "guarantee". **A UDIN is not an opaque string**: characters 3 to 8 are the member's own registration number and the first two are the year, so last year's number, or another partner's, is caught here rather than by the ICAI portal after the certificate has gone out — and what is printed under the signature is now read from `user.icai.membershipNo`, which the signing action had been reading off a field that does not exist. **Signing writes the register row and the signature in one transaction** (P2-7's rule: the register is the record), so "what have we signed this year" no longer answers with the engagements and leaves the certificates out. On the audit side the **SA 700 switches now restructure a real report**: `report700.js` had been written and tested with nothing calling it, and the sign action was snapshotting a free-text box — what is signed is now the report itself, assembled in the standard's order, and a section the standard puts in it that nobody has written is refused by name. 6 new unit tests (1269 total); 2 Playwright tests waiting on Atlas |
| P3-16 | **Team working**: weekly planning by effort and capacity with the review queue watched as closely as preparation, the take-over page, leave with a named cover whose inbox and issues include the absentee's | 🟡 | Built 27-10-2026. **The two lanes are two different weeks, and that is the whole board**: a return due on the 20th is its preparer's work on the 16th and its reviewer's on the 18th (P3-5's targets), so a reviewer's week fills up before the work reaches them — and a board with one lane per person tells them on the day it lands. The review lane counts *here now* and *still being prepared* apart for the same reason. **Capacity was already a field** (`User.capacityHours`, per person, from Step 1 and never read by anything); what was missing was effort, which is now a nullable `effortHours` on the service, snapshotted onto the engagement — and a lane containing one job without an estimate is **counted in jobs rather than part-totalled in hours** (D57), because a part-total says somebody is free when they are not. **Leave carries a required cover** and the rule that keeps it one hop deep: a cover who is away themselves is refused by name. **Cover decides whose list a row falls into and nothing else** (D59) — `isMine()` in `lib/issues/shape.js` was the one place ownership was decided and it still is; what the cover cannot see is counted on the banner and named as a count, with the sentence that covering does not open a client. The take-over page is the offboarding wizard's handover, lifted into `lib/team/handover.js` and shared, so the two screens cannot offer different people for the same job. **One gap from P3-9b is closed**: a reminder to somebody on leave now reaches their cover too, added in `peopleFor` — the single door every staff message goes through. 36 new unit tests (1305 total); 2 Playwright tests waiting on Atlas |
| P3-17a | **The inbox, mentions and Notify**: one list grouped and snoozable, a mention that actually tells somebody, and Notify as one action with a preview of every message | 🟡 | Built 27-10-2026. **A mention had told nobody since Step 5.** `addEngagementComment` collected the mentioned people and the line under it read *"the mentioned people are notified in Step 9"*; Step 9 never did it, so for twelve steps people could type a colleague's name into a box and nothing happened. The matching moved to `lib/inbox` and was tested for the first time — it matched on `startsWith`, so `@pri` reached Priya and `@a` reached everybody whose name began with an A. A handle is now a first name or a whole name, and **an ambiguous one reaches every person it fits**, because silently picking one Priya leaves the other out of a conversation she was named in. **`/notifications` is now `/inbox`** (the old URL redirects, since it is in sixty days of emails): grouped into seven kinds, and every row can be **snoozed** rather than dismissed — there is still nothing that loses a nudge, which is the Issues stance (P3-6) for a different reason. The bell counts only what is awake. **Notify is one action with a real preview** (D60): the exact text of every message, per recipient, built by `messagesFor` — **the same function the send calls**, because a preview assembled by a second code path is one that eventually lies. A client's copy is `audience: "client"`, so it goes behind the client-email switch and the guard exactly as an invoice does, and it carries no link into the firm's own system. 22 new unit tests (1327 total); 2 Playwright tests waiting on Atlas |
| P3-17b | **Announcements and the two threads**: announcements with audience and acknowledgement; job conversations split internal and with-client, with the client half reaching the portal | 🟡 | Built 27-10-2026. **The "Internal only" tick is no longer a lie** (D61). It had been on every comment since Step 5 and *nothing read it*: clearing it changed a boolean no query filtered on, so somebody could believe they had written to a client and be wrong. There are now two threads on the job with their own counts; posting on the with-client one **sends it** to every contact with an email address, and the comment records *when* — because while client email is off the guard holds it, so the row reads `not sent: client email is off` rather than looking delivered. A mention inside a with-client message is **refused by name** rather than stripped: `@priya` in a paragraph the client reads is the firm talking to itself in front of them. The client's half appears in their portal under Your work and **they can reply** — the fourth thing a portal account can write — but only onto a thread the firm started, because a portal that opens conversations about jobs nobody is watching is worse than email. `threadScope()` asks the database for `internal: false`, so the firm's own thread is **never read** rather than filtered after the fact, and `tests/announcements.test.js` asserts it. **Announcements** are their own collection whose audience is a *rule* — everybody, one office, one role — so somebody joining tomorrow is inside one posted today, and an audience the code does not recognise reaches **nobody**, since the other way round is how something meant for two people goes to forty. Acknowledgement never blocks anybody: the partner sees **who has not read it, by name**, because a percentage is not something you can act on. 23 new unit tests (1350 total); 2 Playwright tests waiting on Atlas |
| P3-18a | **The bulk client round-trip**: export in the import's own shape, match by client code, a per-field preview, partner holds on identity, and undo | 🟡 | Built 27-10-2026. The import has added clients since Step 3; this changes the ones already there, which is a different risk — **nobody mistypes forty PANs by hand, and everybody has dragged a cell down a column**. Three rules carry it. A row finds its client by **our own code and nothing else** (D62): matching on a PAN or a name is how two clients quietly become one. **A blank cell never clears a field**, and a field whose column is not in the file is not even considered — which is what the first version got wrong, because the import fills defaults for a new client (a missing Status becomes Active, a missing Credit days becomes 15) and on an update those defaults proposed changes nobody asked for. **Identity waits for a partner** (D63): legal name, entity type, branch, PAN, TAN, CIN, GSTIN and status land in `heldChanges` as one row per field, carrying both values, and a partner decides on each alone — because a PAN approved in the same click as a trade name is a PAN nobody read. **Two things the tests found**: an update row was being validated as a whole new client, so a sheet of corrections was refused for having no entity type, no branch and no contact; and an invalid GSTIN arrived as `gstins.0` while the column is called "GSTIN 1", so it was dropped in silence until the two were matched up. **Undo covers only what the audit log can restore** — a PAN is stored redacted there and a long list becomes "[3 items]", so writing those back would put a lie into the record; identity is changed on the client's own page instead. Issues gained the **"identity changes held"** row the gap report asked for and nothing had ever produced. 21 new unit tests (1371 total); 2 Playwright tests waiting on Atlas |
| P3-18b | **Quick add and kept drafts**: save-and-add-another on the client and engagement forms, and an unfinished onboarding kept per person | 🟡 | Built 27-10-2026. **A draft never holds a PAN or an Aadhaar** (D64), and says so when it hands the form back. A half-typed client is the firm's data in a new place, and those two fields are the ones the system goes to most trouble over everywhere else — encrypted on the record, redacted in the audit log — so leaving them in plain text in a form nobody remembers would undo that for the sake of some typing. One draft per person per kind, kept by a button rather than saved as you type: an autosave would write a partly-typed identity to the database every few seconds, which is the same problem with a faster clock. Drafts expire after a month and carry no audit entry and no soft delete, because somebody's unfinished typing is not a record of the firm's work. **Save and add another** keeps where it belongs and who looks after it — branch, group, client partner, manager, status, billing — and clears everything else, **the PAN above all**; on an engagement it keeps the service, the period and the people and clears the client, which is the field that changes when twelve GST returns are created in a sitting. 8 new unit tests (1379 total); 2 Playwright tests waiting on Atlas. **Modules on and off is deliberately not built** — see the note on the row below |
| — | **Modules on and off with firm presets** — proposed by the prototype, **not built**, agent's recommendation accepted 27-10-2026 | ⬜ | A five-person firm hiding screens from itself gains nothing, and switching a module off would hide work that is already built and untested — which is how a feature is quietly lost rather than finished. If it is wanted later, the honest version hides **rail entries only** and never the routes, because a link in an email to a hidden screen must still open |
| P3-19 | **Learning**: a procedure per screen in a side panel with a roadmap, and playbooks with calendars, roles, decision points, mistakes and a worked example — all in the firm's own words, not the prototype's | 🟡 | Built 27-10-2026. **The shelf is built and every shelf is empty** (D65), which is the decision and not an omission: a procedure telling PHMG's staff how PHMG does GST, written from a design file by somebody who has never worked there, is worse than no procedure, because people follow what they read. So a screen nobody has written up **says so in the panel and offers the box** — the **?** in the top bar knows which of 16 screens you are on, and an unknown screen resolves to *nothing* rather than a near miss, because showing the wrong procedure is the one failure worse than showing none. **Who may do the work is read from the permission matrix**, never typed into the procedure, so a handbook cannot say an intern may file a return when the server refuses them. A **CA or a partner writes** and a **partner confirms** it is still how the firm works — two acts on purpose, and **rewriting clears the confirmation**, since a partner stood behind the old words and not these. Anything nobody has confirmed within a year says so on its face, which is the failure mode of every firm handbook. The editor is **one textarea, one step per line**, a line starting `—` being a note on the step above: somebody writing down how the firm does GST is thinking about GST, not about an *Add step* button. Playbooks are the same record with the prototype's sections, each empty until written. 16 new unit tests (1395 total); 2 Playwright tests waiting on Atlas. **Not built: the quiz half** of the prototype's playbooks — marking an answer needs the answers, which is content again |
| P3-20a | **The data lab**: any spreadsheet in, a summary and a checklist out | 🟡 | Built 27-10-2026. **It profiles; it does not interpret** (D66): a column is a date or an amount only when *every* filled cell in it reads as one, and until somebody maps which column is which, **nothing is checked** — a tool that guesses analyses the wrong column and reports it with confidence. **Dates are read day first**, because 03-04-2026 is 3 April here and reading it month-first would move every entry in the file into the wrong month with nothing on screen looking odd. **Nothing is stored**: the file is read inside the request and the rows are gone when the response ends, so the firm does not grow a second store of its clients' transactions for a convenience tool; what can be kept is the *summary*, posted to a job's internal thread through `addEngagementComment`, so the lab adds no second way into an engagement. The checks are the ones true whatever the file is — unbalanced debits and credits, a reference used twice, **a gap in a numbered series** (what a department asks about), dates outside the period or in the future, amounts that are not numbers, negatives, the largest few, round figures, blank parties — and **every finding says what it does not mean**, because something that cries wolf is something nobody opens in March. A number the lab could not stand behind was deleted rather than approximated: "blank rows skipped" is impossible to count honestly once the parser has dropped them, so it is not reported. 22 new unit tests (1417 total); 2 Playwright tests waiting on Atlas |
| P3-20b | **Client experience**: WhatsApp assistant from live data, partner-released monthly report, business pulse | ⬜ | **Blocked on spec §18, unanswered since Step 0**: no WhatsApp Business provider has been chosen, and a messaging channel built against a provider nobody picked is work that gets thrown away. The monthly report is worth revisiting at the same time — it is largely "the client portal, emailed", which is a smaller job than it looks |

**Group 5 — menu and page parity.** Owner's brief, 27-10-2026: the left
menu and the number of pages must match `CA-Firm-OS-v6.2.html`. Built in
sub-steps P3-22a … P3-22f.

| Step | What | Status |
| --- | --- | --- |
| P3-22a | **The menu itself**: one config the rail, the drawer and the command bar read; the accordion, find-in-menu, compact mode and the phone drawer; module switches; the URL filters the menu needs; and a real route behind every item | 🟡 | Built 27-10-2026. **Ten groups and 58 links for a partner, eight and 24 for staff** — counted by `tests/nav.test.js`, and the rendered menu compared against `tests/fixtures/nav-v6.2.json` in a browser. There were **three menu lists** before this (the rail's, the command bar's, a bottom bar for phones) and they had already drifted: the rail knew the practice books, the command bar knew notices, neither knew the inbox. Now `lib/nav/tree.js` is the only file that names a menu item. **Every badge comes from the helper its page uses** (`navCounts`), because a number that disagrees with the rows it opens is a number nobody trusts twice — and `noticeQuery()` was extracted so the notices page and its four badges ask one question. **A badge of zero is not drawn.** The three filters are the brief's: module on, `can()`, and may-enter-client-data — and a group or a section label left with nothing under it **disappears**, which is the one thing the unit tests hammer, because a heading over an empty space is a menu lying about what you can do. **Nineteen new routes exist from today** with their own server-side permission checks and an empty state naming the sub-step that fills them: no menu item 404s, and nothing is invented to fill the space. The phone bottom bar is gone; the rail is a drawer. 20 new unit tests (1437 total) and **6 browser tests that pass against the real cluster** — including every one of the 58 hrefs answering 200 |
| P3-22b | **The nine screens behind the menu's new items**: My tasks and the firm dashboard as two pages; Billing as four tabs over the invoice list, the unbilled list, the ageing and a new TDS list; the accounts desk; the monthly GST board; the audit studio's front door and the SA 700 board; the logins vault; leave and cover | 🟡 | Built 28-10-2026. **Nothing new is stored and no new rule is written**: all nine read helpers that already existed, which is why the step is screens rather than a model. Three screens that existed moved — `/today` split into `/my-day` and `/dashboard`, and `/invoices` and `/invoices/receivables` became tabs of `/billing` — with the old addresses left as redirects that carry their filters, so the ten in-app links and any bookmark still land right (D72). **The TDS tab is the first screen `setTds26AS` has ever had**: the action was written at Step 8b and nothing called it, so a receipt short-paid by TDS could not be ticked off as credited. **A latent bug in the audit transaction was found and fixed, and it was not about payments**: `lib/audit/context.js` keeps its `AsyncLocalStorage` at module scope, Next.js duplicates that module into four route bundles, and the Mongoose model is registered once by whichever route touches it first — so after this step opened `/billing`, recording a payment from the client page wrote its audit entry against a different store and the plugin refused the change. The store now lives on `globalThis`, like the database connection. 10 new unit tests (1447 total) and **8 browser tests that pass against the real cluster, on a laptop and a phone**; six older specs were repaired on the way (see the notes) |
| P3-22c | **To-dos**: the small things that are not jobs — a line with a date and a name on it, kept in a collection of its own, with the firm's list, a panel on My tasks and a badge on the menu | 🟡 | Built 28-10-2026. **The first thing in Phase 3 that a person types in and finishes**, rather than a reading of records — so it is deliberately neither an engagement (one service, one client, one period, a fee and a reviewer) nor an Issue (computed live, with nothing to tick off, which is what P3-6 exists to be). A new `todos` area in the matrix is what decides whose list you can read, so the scoping is spec §2's and not the page's. **An undated to-do is kept and shown last rather than refused**: half of what anybody writes down has no date, and a list that demands one is a list people keep on paper. Ticking from My tasks and from the list is the same component and the same action, so the two screens cannot disagree about what finished means. **Two bugs found in the writing, both in the tick**: it read `event.target.checked` inside the transition, by which time React had reset a controlled checkbox — so a to-do ticked off saved itself as unfinished; and the confirmation disappeared with the row when the last to-do in a bucket went. 15 new unit tests (1462 total) and 4 browser tests that pass against the real cluster, on a laptop and a phone |
| P3-22d | **The settings screens that describe the system to itself**: new-firm setup, the coverage map, and what's new — three of the five the menu names | 🟡 | Built 28-10-2026, **three of five: `/settings/customise` and `/settings/modules` still need the owner** (custom fields and the firm's own words change the data model; modules were recommended against and that recommendation was accepted, so the screen should say so rather than offer switches). The three built are pure reads and share one rule: **nothing on them is a second record**. Setup reads the eight conditions from the records — six of them the very checks the "Needs attention" strip reads, by key, so the two screens cannot disagree — because a checklist with its own state is the copy that goes stale, on the screen whose whole job is to say what is missing. The coverage map **counts the menu** rather than keeping a list of features, and its "not built" half is written out with the reason and the decision behind each one, kept honest by a test that fails if it names a route with no page. What's new is **the firm's own change history, not release notes** (D76): every change already writes an audit entry, so it is a lens on the Portal log narrowed to the eight records that are *how the firm works*, and to changes rather than events. `lib/audit/describe.js` gained words for the twenty collections added since Step 2, which were printing as `firmsettings` and `docrequest` on the Portal log too. 8 new unit tests (1470 total) and 3 browser tests on a laptop and a phone; **`tests/e2e/settings.spec.js` had never run at all** — its fixture missed a field the due-date rule gained at step 7b — and two of its older tests were repaired (see the notes) |
| P3-23 | **The browser suite, made to tell the truth**: one sign-in helper instead of forty, a time budget that fits an audited write to Atlas, and the first real inventory of what is red | 🟡 | Started 28-10-2026, **not finished**. The suite had never run: `88 green / 60 red` on the first complete pass, and by the end of the day the specs that were worked on are green (registers 6/6, issues 3/3, keyboard 5/5, todos 4/4, screens 8/8, settings 9/10, access 3/5, engagements 2/3). **Four causes account for most of it**, and three were the product's, not the tests': the top bar's button was labelled "Search clients, PAN, GSTIN", so `getByLabel("Client")`, `getByLabel("PAN")` and `getByLabel("GSTIN")` all matched it (now just "Search" — better for a screen reader too); P3-8 deliberately **shows a refused control disabled with its reason** rather than hiding it, which two tests still asserted the old way; P3-5's filing gate means a fixture must start from approved work; and Playwright's 5-second assertion budget was **timing out on screens that were still working**, because every change here is a transaction to Mumbai. The suite takes **5.6 hours** against Atlas, which is why nobody ran it — a local replica set for tests is the recommendation (D77). **One finding may be a real bug on the most-used form in the system**: on `/clients/new`, with the form valid, clicking "Create client" does nothing at all — no request, no message, no row — while submitting the same form from JavaScript runs the action and returns its validation message. Reproduced five times in a real browser; see the notes |

**Group 4 — the interface.**

| Step | What | Status |
| --- | --- | --- |
| P3-21a | **The prototype's palette and type.** Token values only: `app/globals.css` and the font loader. The token *names* are unchanged, so sixty routes take the new look without being touched | 🟡 | Built 26-10-2026. **Two of the prototype's own colours fail the contrast bar spec §15 sets**, at the smallest text on screen — its faintest grey gives 2.97:1 on the page background where WCAG wants 4.5:1. Those two are the only values that are not the prototype's exactly, and `tests/contrast.test.js` now measures every new pair, including the chip-on-soft-fill ones, so a well-meaning revert fails the suite. The parser also resolved `var()` aliases, without which `--brass: var(--carbon)` silently left brass untested. Fraunces is gone with the ledger language; **Plex Sans at 700 does the headings now**. 4 new unit tests (938 total) |
| P3-21b | **The prototype's screens** — the layouts, the card and chip shapes, the eight signature moments from Step 11 parked behind a theme setting rather than deleted, so the decision stays reversible | 🟡 | Built 27-10-2026. **One radius token was doing four jobs.** The prototype has four and they all differ — 12px card, 8px control, 10px table, a full pill on a chip — and this application put `rounded-ledger` on all four, which was the single most visible shape difference. 907 uses swept by what each line already said it was (`py-0.5` a chip, `h-9` a control, `overflow-x-auto` a table): 472 controls, 40 tables, 17 chips, 378 cards left alone. **The headings were a step large**: the prototype sets h1 at 24px/700 and h2 at 15.5px, this had 28 and 20; 60 h1s and 111 h2s corrected, and figures left at 28 because that is the prototype's own `.big`. The shell took the prototype's measurements — a 232px rail, its accent-soft active item, its 34px logo, a top bar on the page's own ground rather than a third surface — and table headers took its sunk ground. **The eight signature moments are parked, not deleted** (D52): one `data-moments` attribute, a switch in the top bar beside the theme and density, and one line each in `globals.css` — the tick, the stamp, the grain, the ruling, the brass ring, the serif, the brass hairline and the login constellation. | **And the application was rendered for the first time** (D53). `next start` boots without a database and `/login` serves, so a real browser finally saw a screen of this build. It found what 1,223 passing tests could not: **every primary button in the dark theme sat at 2.8:1** — 101 places wrote `text-white` where the ground is `bg-carbon`, which is dark blue in the light theme and pale blue in the dark one. `tests/contrast.test.js` had the pair right and even said so in a comment; it measures tokens and could not see a class name. All 101 fixed, and `tests/markup-contrast.test.js` now watches the markup instead of the tokens. The login screen was laid out as two panels and rendered with a quarter of the viewport empty under both; it is a centred column now. 6 new unit tests (1229 total). **Only the dark theme has been seen rendered, and only the sign-in screen** — everything inside the application still needs the Atlas cluster |

**`docs/SPEC.md` was amended 26-10-2026** on the nine passages Phase 2 and
Phase 3 overtook: the A/B/C tiers, the six document states, Issues as the
landing page, the view selector, the three internal dates, the pipeline order,
the engagement shape, and the branch list (which stays flagged as the owner's
to confirm). Each amendment is marked in place and names the decision behind
it.

**Known before we start:** none of this can be *shown* until the Atlas cluster
exists — the same blocker as every step since Step 1. P3-1 changes a field that
two registers, eight reports and the client portal read, so it is the one step
whose cost grows every week it waits.

## Decisions made

| Date | Decision | By |
| --- | --- | --- |
| 29-10-2026 | D88: **time is stored in minutes, and chargeable means it has a job on it.** Minutes rather than decimal hours for the same reason money is paise (rule 5): 2.5 hours stored as a float adds up wrong often enough to matter, and a timesheet's whole purpose is that the week's total is the sum of its lines. Chargeable is **derived from `engagementId` on save, never offered as a choice** — a person who could tick "not chargeable" on a GSTR-1 could flatter their own utilisation, and the figure would then measure nothing. A line with no job must say what it was instead, so an unexplained hour cannot be saved. **A running timer is a row of the same collection** with `startedAt` set and `minutes` still zero, rather than a second collection holding one row per person, which would be the same thing with twice the code and a way for the two to disagree. | Agent |
| 29-10-2026 | D87: **partner and CA may edit time entries, not only read them.** The matrix had both at `view`, which meant the two roles doing most of the firm's chargeable work could not record their own hours — the timesheet would have been a report on everybody except the people who need it most. A CA reaches their own reports' sheets as well, because the commonest correction to a timesheet is a senior fixing a line an article put on the wrong job; every such correction is audited. **Accounts stays at `none`**: they bill the firm's work, they do not do it, so the Timesheet item does not appear in their menu. | Agent |
| 29-10-2026 | D86: **the strip tiles get icons too**, at the owner's instruction after the agent argued against it. The concern was that six tinted squares in one row is the grid of identical tiles rule 10 is actually about; built at 28px rather than the money tiles' 36px, which keeps the row from becoming the loudest thing on the screen. The icon is chosen **by label, in `Tiles.jsx`**, because the four places that build these tiles do not agree on a shape — only `headlines.js` carries a `key` — and threading a React component through four server functions to avoid a lookup table would put a presentation decision inside the counting code. `Circle` is the fallback, so a label added later renders a neutral mark rather than a hole in the row. | Owner, reaffirmed |
| 29-10-2026 | D85: **the icon square and the feature card are in, and `CLAUDE.md` rule 10 is amended for them.** Both come from the owner's reference; the agent left them out of D83 on the grounds of rule 10 ("no purple gradients, glass panels, emoji icons or grids of identical shadowed cards") and spec §15, and the owner — who wrote that rule — overrode it. What is kept is the part of those rules that was load-bearing: **a tint carries meaning, never decoration** (the square takes its colour from the tile's `tone`, so red means late and amber means waiting; there is no per-tile palette), **one feature card per screen** (`FeatureTile` is a separate export, so a second one takes a deliberate second import, and it only appears while there is something actually overdue — a gradient panel saying everything is fine teaches people to stop reading the dashboard), and **every pairing clears 4.5:1**. The reference's own gradient gives white about 3:1; these are its hues taken down until the figure is readable (4.85 and 7.62). Rule 10's other three clauses stand. | Owner, reaffirmed after the concern was raised |
| 29-10-2026 | D83: **the accent is teal, and it is back on the chrome.** The owner supplied a reference CRM on 29-10-2026 and asked for its colour theme across the application. Its values, sampled rather than guessed: ground `#f2f3f5`, cards white, ink all but black, and an action colour between `#42a0a0` and `#61bdbe` used on row buttons and behind the active nav item. The reference's own teal reads 2.79:1 on its ground, so it is taken down to `#177979`, which clears 4.5:1 on both the ground (4.67) and a card (5.19) — `carbon` is the link colour as well as the button fill. **This reverses D78's one move**, which kept colour off the chrome; what is kept is the discipline under it: one hue and no second, status colours still meaning status, no gradient, no tinted icon chips. The two devices the reference uses that `CLAUDE.md` rule 10 forbids — the gradient KPI card and the icon-in-a-tinted-square — were not copied. | Owner, with the reference |
| 29-10-2026 | D84: **four things move, and nothing performs an entrance.** Press feedback (`scale(0.97)`, 160ms), hover colour on rows, links and controls (120ms, gated behind a real pointer), the theme crossfade (220ms), and the two signature keyframes that already existed. No panel fades up on load and no list staggers in: this is a screen somebody is inside for eight hours, and an entrance is charming once and a tax every time after. The theme transition is **switched on for the length of the fade and off again** by the toggle rather than declared permanently — a standing `transition: background-color` on every surface also runs on first paint and on every route change, which is how a theme transition usually ends up making an application feel slow. Verified in a browser: 7 live transitions on a page, none using `transition: all`, nothing running on load. | Agent |
| 29-10-2026 | D78: **the look leaves the prototype behind.** The owner's verdict on the v6.2 look was that it read cheap, and the design study names its exact shape — an off-white ground, white cards, one stock blue on every button, tab and link — as what makes a screen read as a kit rather than a product. D35 is reversed **on the look only**; the prototype's product model, screens, data and words are untouched. The replacement is the `achromatic-ledger` direction (seed 1094860545), whose one move is that **colour leaves the chrome entirely**: the primary action is near-black, the secondary a grey pill, every active row and focus ring is ink, and the single hue `--data` is kept for data and for a figure that has moved. Token *names* are unchanged, so sixty routes took the new palette without being edited. | Owner, asked |
| 29-10-2026 | D79: **every figure is set in the mono face.** Rupees, PAN, GSTIN, UDIN, invoice numbers and dates all land on one character grid, so a column of them reads as a column. This is the firm's one piece of visual identity and the thing no template does — a Chartered Accountancy practice is a ledger. It cost no new dependency: `.num` was already on 179 figures across 71 screens doing tabular numerals, and IBM Plex Mono was already loaded. Tables keep tabular figures without the mono face, because a table holds names as well as figures. | Owner, asked |
| 29-10-2026 | D80: **one canvas width, capped in the app shell.** Sixty pages each named their own — 760, 860, 900, 1000, 1100, 1200, 1400 and 1600 — so the application changed shape from screen to screen, and at 1920px the widest stretched a filter row to 1550px. `app/(app)/layout.jsx` now caps the canvas at 1280 and centres it beside the rail. A page may still be narrower (a settings form at 760 is right); none may be wider. One edit instead of seventy-seven. | Agent, on the measured range of 1100-1250 for a data screen |
| 29-10-2026 | D81: **Fraunces comes back, for the sign-in screen and nothing else.** It was dropped with the ledger language in D35. Display type on a screen worked in for eight hours is a page's habit, so the application behind the sign-in stays one grotesk; the sign-in is the one screen that is looked at rather than worked in, and it is where the firm's own name is set. | Agent, with the login direction the owner chose |
| 29-10-2026 | D82: **the dealt typeface was redrawn, with a reason.** The `achromatic-ledger` sheet deals Geist; `CLAUDE.md` fixes this project's fonts to IBM Plex Sans, IBM Plex Mono and Fraunces. The brand constraint wins, which the skill's own rule for an existing brand allows, and `inspect.mjs` is run with `--allow font-not-dealt` so the gate records the exemption rather than hiding it. Plex is in any case the less generic face: the study's complaint is against stock Geist and Inter. | Agent |
| 28-10-2026 | D77: **the browser suite should run against a local MongoDB replica set, not Atlas** — recommended, owner to decide. A full pass takes **5.6 hours** against the cluster, because every write is a transaction to Mumbai over a home connection, and a suite nobody can re-run is a suite nobody fixes: that is precisely how 60 stale tests accumulated while every report said "waiting on Atlas". `mongodb-memory-server` (a dev dependency, one replica, transactions supported) or a docker container would make it minutes and would let it run in CI. Atlas stays where it belongs: the acceptance pass and go-live, where the point is the real cluster | Agent, to confirm |
| 28-10-2026 | D76: **"What's new" is the firm's own change history, not release notes about the software.** A page somebody remembers to update is a page nobody updates, and the prototype's own description of this screen rejects it. What a firm needs to know is what changed *here*: who confirmed a due-date rule, who approved a template, who added a service, who corrected the firm's record. All of it is already written down, so the screen is a lens on the Portal log narrowed to the records that are how the firm works, and to changes rather than events — a sign-in is not a change. Release notes about the product, if they are ever wanted, belong in a file in the repository that ships with the version it describes | Agent |
| 28-10-2026 | D75: **a to-do is a line with a date and a name, and anybody may write one for anybody they can see.** Owner's answer to the three questions put with the plan, 28-10-2026: a to-do can be made for a colleague (the row keeps both names, so one that turns up on your list says who put it there); a partner reads the firm's, a CA their branch's, everybody else their own plus the ones they wrote for somebody else; and ticking needs no review, because a maker-checker rule on a phone call would mean nobody uses the list at all. The intern is included on purpose: chasing a challan is exactly their work | Owner |
| 28-10-2026 | D74: **the accounts desk is four lists and performs nothing.** Money received and not applied, promises that have come round, drafts not issued, and fee waivers waiting on a partner — chosen as the four things an accounts person does every morning, and every row links to the screen where that action already lives rather than repeating the button (P3-8's rule). The owner said "go" without picking, so these four are the agent's reading of the brief's "receipts to enter, allocations to make, and what a partner has to approve"; a fifth panel is a dozen lines | Agent, to confirm |
| 28-10-2026 | D73: **"TDS credit to match" means a receipt the client paid short, which nobody has yet found in Form 26AS.** That is the only TDS the system holds: `Payment.tdsPaise` with `tdsSeenIn26AS` unticked (spec §7 says the reconciliation is manual in v1). The list is grouped by the quarter the receipt falls in, because 26AS is filed and read a quarter at a time, and the tick is reversible from a second list — ticking the wrong receipt is the likeliest mistake on that screen. Asked of the owner with the plan; they said "go" without answering, so this is the agent's reading | Agent, to confirm |
| 28-10-2026 | D72: **a screen that moved leaves a redirect, not a copy.** `/today` → `/my-day`, `/invoices` → `/billing?tab=invoices`, `/invoices/receivables` → `/billing?tab=collections` (and `?tab=unbilled` → `?tab=ready`), with the query string carried across. Two copies of the ageing report would be two places to fix when the ageing is wrong, and ten in-app links plus every bookmark the firm has made would otherwise have to be found and changed. `/invoices/[id]`, `/invoices/new` and the Excel export stay where they are: it is the list that moved, not the invoice. The in-app links were pointed at the new addresses anyway, so a click does not bounce; the redirects are for what is already written down | Agent, raised with the plan |
| 28-10-2026 | D71: **the shell carries three things and the profile menu carries the rest.** Out-of-band polish on the rail and the top bar, asked for by the owner. The rail is now three zones — a fixed head, a scrolling list, a fixed foot — because with a group open the list is taller than a laptop screen and the firm's name, the find box and the signed-in line all scrolled away with it. A hairline splits the ten groups into the eight that are work and the two that run the firm. The narrow/wide button is present in **both** states; before, it vanished once the rail was narrow and the only way back was to click a group and hope. The drawer on a phone is never narrow, whatever the desktop rail is set to. In the top bar the theme, density and flourishes toggles moved into the profile menu, captioned: as seven equal-weight glyphs in a row they were the loudest thing on a screen whose job is to be quiet, and **on a 390px phone they pushed the profile button clean off the right-hand edge** — one change, two problems. The bar's gutters now line up with the page's, and its icon buttons are 36px so a thumb can find them | Agent, owner asked for the polish |
| 27-10-2026 | D70: **the group icons are the ones already in the project, until the prototype arrives.** The brief says to copy the prototype's inline SVG paths exactly, and `docs/design/CA-Firm-OS-v6.2.html` **is not in the repository** — there is no `docs/design/` at all. Rather than stall the whole sub-step on a file, the ten group icons are Phosphor glyphs chosen to mean the same thing, and `components/shell/navIcons.jsx` is the only file that names one: eleven entries in a map, swapped in a single edit when the HTML lands. Everything else in the brief was buildable from the brief itself, which specifies all 58 links, the routes, the badges and every CSS value | Agent, **the owner still owes the prototype file** |
| 27-10-2026 | D69: **eight working screens the prototype's menu has no group for stay reachable.** `NAV13` has no item for the firm audit log, the client portal log, the client import, the two practice books (statutory and tax), the recycle bin, users, ICAI, security, the job runner or bringing data in. Spec §11 *requires* the audit log to be reachable, and the rest are daily work somebody built. They are in the command bar now, and the settings hub's "More" section in P3-22d. Nothing working was removed to make the menu match a picture of it — and note the trap in the words: the prototype's "Statutory" and "Tax audit" under Audit are *audit categories*, not this app's company-law and tax-filing books | Agent, finding |
| 27-10-2026 | D68: **the brand stays the firm's own.** The prototype's rail says "CA Firm OS" over the firm's name. This is PHMG's own system, not a product with a name of its own, so the rail keeps "PHMG" with `FirmSettings.name` underneath. The brief said to use the prototype's text unless the owner said otherwise; the owner left it to me | Agent, owner left it to me |
| 27-10-2026 | D67: **partners, CAs and the billing desk get the partner menu; employees and interns get the staff menu.** The prototype has two menus and this app has five roles. Accounts gets the partner layout because their work is in it — ready to bill, collections, TDS — and `can()` then takes away the Jobs and Audit groups they cannot open, which a test asserts. So the mapping costs nothing and nobody sees a group with nothing in it | Agent, owner left it to me |
| 27-10-2026 | D66: **the data lab reads a file and keeps nothing.** Spec §1 puts the accounting ledger out of scope and this keeps it there: the firm's own software does the accounting, and the lab reads a file somebody exported from it, inside one request. No upload is stored — a second store of clients' transaction data is not a thing to create for a convenience tool, and the file nobody kept is the file nobody has to protect. What *can* be kept is the summary of what was read and what was found, posted to a job's internal thread, so a check run in March is on the record in June. The other half of the decision: **it profiles rather than interprets.** A person maps which column is the amount before a single check runs, and nothing tax-specific is checked at all — a rule I invented would be exactly what CLAUDE.md rule 8 forbids, and wrong in a way nobody could see | Agent |
| 27-10-2026 | D65: **the learning library ships empty, and says so.** The prototype has a written procedure for every screen and five playbooks with worked examples; none of that text is in this build. A procedure is followed, so one written by the system — or by me, from a design file — would have PHMG's staff doing what somebody outside the firm guessed. The same stance as D48 on the notice-law table and D54 on certificate wording: the structure is the system's, the words are the firm's. An unwritten screen is a state with words — "nobody at the firm has written this up yet", and who could — never a blank and never a plausible filler. **The owner should know what this costs**: the panel is worth nothing until somebody writes the first few, and the ones worth writing are the ones a partner explains out loud most often | Agent, **the owner must write the content** |
| 27-10-2026 | D64: **a kept draft never holds a PAN or an Aadhaar, and says so.** They are encrypted on the client record and redacted in the audit log (CLAUDE.md rule 7); leaving them in plain text in a half-finished form, in a collection with no audit trail, would undo all of that to save somebody ten seconds of typing. The banner names what was left out, because a form handed back with an empty PAN box and no explanation is worse than one that admits it. The same reasoning made the draft a **button rather than an autosave**: saving as you type would write a partly-typed identity to the database every few seconds, which is the same problem with a faster clock | Agent |
| 27-10-2026 | D63: **a spreadsheet cannot rewrite a client's identity without a partner.** Legal name, entity type, branch, PAN, TAN, CIN, GSTIN and status are held when anybody but a partner sends a sheet: one `heldChanges` row per field, carrying what it was and what it would become, decided one at a time. A partner's own sheet applies, because holding a change for the only people who can release it is a queue that never empties. Everything else — trade name, risk, credit days, industry, turnover band, tags, invoice email — applies as soon as it is ticked. The split is the whole point: approving a PAN in the same click as a trade name is approving a PAN nobody read | Agent, owner left the field list to me |
| 27-10-2026 | D62: **a row finds its client by our own code, and by nothing else.** Not by PAN, not by name, not by GSTIN. A sheet is exactly where two clients quietly become one, and a fuzzy match at scale is unreviewable. A row with no code is a new client and goes down the ordinary import path with its duplicate checks; a code nobody has is refused by name rather than guessed at | Agent |
| 27-10-2026 | D61: **a comment marked not-internal is sent, or it says it was not.** The flag existed from Step 5 and nothing read it, which is the worst state a control can be in: the screen offered a choice and the choice did nothing. Three things follow. The with-client thread **sends** when it is posted, through the same guard and client-email switch as an invoice. The comment records *when* it went, so one written while client email is off is shown as held rather than delivered. And a client can reply **only on a thread the firm started** — no new per-account right, because answering a question about their own job is the least a portal can do, while starting one would create conversations about jobs nobody at the firm is watching | Agent, owner left the portal half to me |
| 27-10-2026 | D60: **Notify sends a person's own words, under their own name, and shows them first.** The owner left this one to me. Free text rather than a fixed template, because the alternative is not "no free text" — it is the same sentence typed into Outlook, where the firm has no record of it at all. Everything sent this way is logged in `messageLogs` beside every other message, a client-facing one is marked `audience: "client"` so the client-email switch and the guard hold it exactly as they would an invoice, and **the preview and the send are one function**, so what somebody reads before pressing send is the text that goes out. No partner approval: one message to your own client is not a batch, and the P3-10 gate exists for batches | Agent, owner left it to me |
| 27-10-2026 | D59: **cover changes whose list a row falls into, never what anybody may see.** Naming a cover gives that person the absentee's rows on Issues and a copy of the staff reminders addressed to them. It does **not** open a client they could not already open, and it does not move the work: the engagement stays on the absentee's name. Spec §2 is the reason, and it has a cost worth knowing — an *employee* covering a colleague sees almost nothing new, because an employee only ever sees their own work. So the absentee's open jobs that are outside the reader's access are **counted on the banner and named as a count**, rather than being silently absent from a page that says "you are covering". For an employee cover the answer is to move the work on the take-over page. **One loose end the owner should rule on**: the cover's *copy of a reminder* names a client and a job, so an employee cover can be told about work they could not open — say if that should be restricted to CAs and partners | Agent, **owner should confirm the mail half** |
| 27-10-2026 | D58: **a partner records leave, and recording it is the approval.** The owner's answer, 27-10-2026. There is deliberately no request-and-approve cycle behind it: a two-state workflow for a five-person firm is a second list to chase, and an unapproved leave would still have to be honoured on the morning somebody does not arrive. The row carries which partner recorded it and when, so approval is a fact on the record. Withdrawing one is a soft delete with a reason, because a cover who held somebody's work for three days of a cancelled fortnight did hold it | Owner, 27-10-2026 |
| 27-10-2026 | D57: **effort is an estimate per service, left blank until the firm fills it.** Spec §9 wants hours due this week against capacity; capacity has been a field since Step 1 and effort had no source, because time tracking is Phase 2 and nothing has ever been logged. So `effortHours` joins the service catalog as a nullable field, snapshotted onto each engagement like the fee — and the board **counts jobs rather than part-totalling hours** wherever one job in a lane has no estimate, since a part-total reads as the whole and says somebody is free when they are not. It is preparation effort only: nobody has estimated what reviewing costs, and a fraction of the preparation figure would be a number the firm never agreed to. When time tracking arrives, this estimate is what actuals get compared against | Agent, **the owner fills these in on the service catalog when they are ready** |
| 27-10-2026 | D56: **a certificate is signed by a CA or a partner, and only with a membership number on file.** The audit report is partner-only (SA 700, and the Companies Act's own signatory) and stays that way. A certificate is different: it is signed by a *member* against their own ICAI membership, which is what a UDIN is generated against, so the gate is `edit` on `udin` — the same population the UDIN register already offers as signing members. The second half is the harder one: signing is refused outright when the signer has no membership number recorded, because the number is printed under the signature and a certificate that goes out without it is not a certificate. Say if certificates should be partner-only at this firm | Agent, **owner should confirm this one** |
| 27-10-2026 | D55: **what is signed is the report, not a note about it.** P3-14 snapshotted whatever a partner typed into a box at the moment of signing, which meant the permanent record of an issued report could be the words "see the PDF". The snapshot is now the report assembled in SA 700's order from the opinion, the matters and the sections the switches add — and a section the standard puts in that report with nothing written in it refuses the signature, because an empty heading in an issued report is worse than a missing one. The free-text box is gone | Agent, **a gap in P3-14, now closed** |
| 27-10-2026 | D54: **a certificate cannot be signed while its wording is unconfirmed.** D48's rule, in the one place it has teeth. For a notice, an unconfirmed rule can simply withhold a date; a certificate *is* its wording, so there is nothing to withhold — the only honest enforcement is to refuse the signature. A partner confirms once per kind of certificate (five kinds), not once per draft, because asking on every draft turns reading the Guidance Note into a box somebody ticks. The confirmation is the same `ruleConfirmations` row the notice-law table and the auditing standards use, carrying the partner's name, the date and their note | Agent, **the owner must read five pieces of wording before any certificate goes out** |
| 26-10-2026 | D44: **a portal account confirms figures only if a partner grants it.** `mayConfirmFigures` is off on every account and granted per person, because uploading a bank statement and agreeing a tax figure are not the same act and should not be the same permission. The confirmation records itself as evidence — "Confirmed on the client portal by <name> (<email>)" — which is the one case where the evidence line writes itself, since the portal record *is* the evidence. This closes what P3-5 left out: the gap report asked for a portal approve action and only the staff-recorded path was built, while a comment in `gates.js` claimed otherwise | Agent, **a gap in P3-5, now closed** |
| 26-10-2026 | D43: **Issues is the landing page; Today stays on the rail.** Spec §15 says home is Today with three ruled columns, and the prototype lands on Issues and removes Today from the menu. Issues becomes home, because it is the only screen that says what needs doing rather than what is dated today. Today is kept and reachable: it was built at Step 5a, it has never been run, and deleting a working screen to match a prototype exactly is a loss with no gain. Spec §15 needs amending either way | Owner, 26-10-2026 |
| 27-10-2026 | D53: **the first render found a bug no test could.** Starting the production server and pointing a browser at `/login` — which works without a database — showed every primary button in the dark theme at 2.8:1, because 101 places hardcoded `text-white` on a ground that is pale blue in that theme. The token was right and `tests/contrast.test.js` proved it; a token test cannot see a class name. `tests/markup-contrast.test.js` now checks the markup for colours written as literals on a themed ground. The lesson is the cheap one: **27 steps were built without a screen ever being drawn**, and the first drawing found something in minutes | Agent, **this is the argument for doing the Atlas cluster next** |
| 27-10-2026 | D52: **the eight signature moments of spec §15 are switched off, not removed.** The prototype has none of them and the owner chose the prototype (D35), but Step 11 built all eight and a decision made in an afternoon should be reversible in one line. So there is a `data-moments` attribute on the root, a switch in the top bar beside the theme and the density, and one rule each in `globals.css`. Off is the default and is the prototype. It is a per-person reading preference rather than a firm setting: one partner wanting the stamp back does not change what anybody else sees | Owner, 27-10-2026 |
| 27-10-2026 | D51: **the sixteen ledger tests are recorded, not executed.** The prototype promises "16 tests on every voucher"; spec §1 puts the accounting ledger out of scope, so this system has never seen a voucher. A test runner over data it does not hold would report zero flags on every file, which reads as a clean audit and is worse than no feature. So the file records the *programme* — the test, its authority, the population, whether it was the whole population or a sample, and what was found — and the firm's own tool does the running. It is a smaller claim than the prototype's and it is the true one. When the data lab (P3-20) exists, the running can move in behind this same record | Agent, **the owner should know the prototype promises more here than is built** |
| 27-10-2026 | D50: **`noticeLawConfirmations` is now `ruleConfirmations`.** It was named after notices when notices were the only thing it held; the GST set-off order (P3-12) and the auditing standards (P3-13) use the same mechanism, so the name had become a lie about what is in it. The collection has never held a row — nothing in this repository has ever run against a database — so the rename cost nothing, and leaving a misleading name in place to avoid a migration that does not exist would have been the worse trade | Agent, finding |
| 27-10-2026 | D49: **the GST set-off order is cited, confirmed by a partner, and the computation is marked indicative whatever happens.** The order comes from s.49(5), s.49A and Rule 88A, and the one step that must not exist — CGST credit against an SGST liability — has its own test. A partner confirms the three rules before the figure is treated as settled; the arithmetic still runs without it, because a bookkeeper needs it, but the screen says the order is unconfirmed and tells nobody to send that figure to a client. Even fully confirmed it stays indicative: it is worked out from the sheet the client typed, and the return the firm files is prepared from the GSTR-2B reconciliation. That sentence is returned with the figures rather than written at the bottom of a page, because the figure is what somebody screenshots | Agent, **the owner must know this: the figure is indicative, always** |
| 27-10-2026 | D48: **the notice-law table is seeded unconfirmed, rule by rule, and a partner confirms each one.** CLAUDE.md rule 8 forbids inventing a statutory date or a tax rule. The six notice kinds and their sections come from the prototype verbatim, and the rules live in code so nobody can quietly edit one into something plausible — while the *confirmation* is a row in `noticeLawConfirmations` carrying a partner's name, their note and the wording as it stood. No confirmation means no date, anywhere, which is the same stance `DueDateRule.verifiedAt` already takes for statutory due dates. Confirmations are never deleted, only superseded: the firm relied on what a partner said last year, and that is part of the record | Agent, **the owner must know this: nothing here is authority until a partner reads it** |
| 26-10-2026 | D47: **the run log has no soft delete.** Everything else in this system can be soft deleted and restored (CLAUDE.md rule 3); `sendBatches` has no `deletedAt` at all, because a record of what the firm said to its clients is the evidence a peer reviewer reads, and it should not be removable from a list even with a deletion marker beside it. Batches are decided, never deleted | Agent, **owner should know this one** |
| 26-10-2026 | D46: **a refusal is visible text under the control, not a tooltip.** The prototype puts the reason in a `title`, which is unreachable by keyboard — a disabled button takes no focus — and invisible on a phone. So `components/ui/Action.jsx` renders the reason as a line under the button and links them with `aria-describedby`. This is the third place the prototype is followed in substance and not in form, after D36 and D41 | Agent, **owner should know this one** |
| 26-10-2026 | D45: **the view lives on the actor, not on each page.** `branchFilter()` was already the one place every list asked about branches, so the view was attached to the signed-in actor and read there — one change rather than twenty, and a list page that forgets the view still cannot leak a branch, because access and view are two different lines and only the second is optional. It is a cookie rather than a field on the user: a reading preference is not a fact about the account, and the server revalidates it against the account on every request | Agent, finding |
| 26-10-2026 | D42: **"at risk" is a report, not a filter on the engagement list.** It cannot be a Mongo query: it depends on the next open milestone, on whether the approval still matches the current version, and on working-day arithmetic. A list filter would have to post-filter one page, so the tile above it would print a different number from the list below — the thing spec §17 says must never happen. As a report it scans and shapes rows in JavaScript, which is what every other report here already does, and the dashboard tile opens it | Agent, finding |
| 26-10-2026 | D41: **the preparation and review targets are working days, not calendar days.** The prototype uses statutory − 4 and − 2 calendar days. Spec §8 counts the firm's target in working days, `internalTargetFor()` and `addWorkingDays()` already exist, and a target that lands on a Sunday is a target nobody can hit. The three dates now nest: prepare by − 4 working days, the firm's own target at − 3 (unchanged, still editable per job), reviewed by − 2. This is the second place where the prototype is drawn rather than counted, after D36 | Agent, **owner should know this one** |
| 26-10-2026 | D40: **five services ask the client to confirm the figures**, carried as a flag on the service template and snapshotted onto the engagement: `GSTR3B`, `GSTR9`, `TDS-RET`, `ITR-SAL`, `ITR-BUS`. Tax audit and statutory audit are deliberately out — they carry their own sign-off and representation letters, and the prototype excludes them for the same reason. It is a flag rather than a list in the code so the firm can change its mind in Settings without a release, and a snapshot so changing the catalog next month cannot add a client gate to work already under way | Owner, 26-10-2026 |
| 26-10-2026 | D39: **a waiver is asked for by whoever is billing, not by whoever did the work.** The prototype puts every money control behind billing permission, and the gap report says "requested by whoever is billing". So the ask needs `invoices` edit — a partner, a CA in their branch, or accounts — and the preparer sees the settled state without controls. The alternative, letting the preparer ask, puts the request in the hands of the person with the least view of the client's ledger | Agent, follows the prototype |
| 26-10-2026 | D38: **retainer and waived work stays on the unbilled list, and out of the unbilled figure.** The list answers "what did we do and not charge for", which the firm has to be able to answer; the figure answers "how much are we owed", which must reconcile. Dropping a waived job would shrink the list every time a partner was generous, and counting it would make the headline number unexplainable | Agent, from the gap report |
| 26-10-2026 | D37: **the positive-fee rule is enforced at billing, not at creation.** The starter catalog seeds every fee at ₹0 deliberately, waiting for the firm to price its own work, so a rule at creation would have blocked work on any unpriced service. Instead an unpriced job is created freely, `feeState()` names it *Fee not agreed*, and the invoice builder refuses it — the prototype puts the same condition on its Issues list rather than on its create form | Owner, 26-10-2026 |
| 26-10-2026 | D36: **the two prototype colours that fail WCAG are not copied.** The prototype's faintest grey is #8790A0, which gives 2.97:1 on its page background and 3.22:1 on a card — and it is used for the 11.5px and 12px text, which is exactly where the 4.5:1 bar applies. Its dark-theme counterpart #768092 gives 4.29:1. Both are darkened (#687080) or lightened (#7E8899) by the smallest amount that clears the bar; nothing else in the palette needed touching. A prototype is drawn, not measured, so this is the one place where spec §15's quality bar outranks D35 | Agent, **owner should know this one** |
| 26-10-2026 | D35: **the prototype's palette and type replace the "modern ledger" of spec §15.** Done as a token-value swap: the names (`paper`, `surface`, `ink`, `carbon`, `filed`, `waiting`, `redpen`) are kept and now describe their job rather than the metaphor they came from, so the whole application restyles without a screen being edited. `--brass` and `--font-display` survive as aliases pointing at the accent and at Plex Sans — a dozen screens name them, and rewriting those would be a large diff for no visible change, while this way one line each puts the serif and the brass back if the decision is reversed. Paper grain and ledger ruling are switched off at the token rather than stripped out of the markup, for the same reason | Owner, 26-10-2026 |
| 26-10-2026 | D32: **"cash counted once" was already true here, and the gap report was wrong to call it a model change.** The prototype needs that rule because its model is invoice-centric — payments are pushed into `invoice.paid[]`, so an allocation looks like a receipt. In this build `Payment` belongs to the client with allocations embedded, `collections()` sums `amountPaise` by payment date and never reads an allocation, and `openInvoicesFor(clientId)` makes a cross-client allocation impossible rather than merely requiring a reason for it. Nothing was changed; saying so is the decision | Agent, finding |
| 26-10-2026 | D33: **a payment promise expires by itself.** The sweep reads the date rather than a flag anybody has to clear, so the day after a promise passes the ordinary cadence resumes with nobody involved. A flag that must be cleared is a flag that stays set: the client pays, nobody remembers, and the invoice is never chased again. Spec §12's `Disputed` still exists for the harder case, where chasing stops until a person puts it back | Agent, owner to confirm |
| 26-10-2026 | D34: **a promise covers one invoice, not the client.** A client can be good for one bill and arguing about another, and a promise about the first must not buy silence on the second | Agent, owner to confirm |
| 26-10-2026 | D27: **a format check is not an acceptance.** Requested → Received → Format checked → Accepted, with Replacement requested and Not required as the two ways out. An automatic check can say a spreadsheet has the right columns; it cannot say the file is the right client's, for the right month, complete and legible. A person accepts, and the two states are kept apart so the system never claims the second when it only did the first. `Verified` stays valid in the schema and reads as settled; `npm run backfill` renames it | Owner instruction, built |
| 26-10-2026 | D28: **a replacement is a new submission and clears every earlier check.** Acceptance is tied to a submission number, so an item accepted at submission 1 and re-uploaded is no longer accepted, and a format check performed on one file never carries to another. Keeping either would have the system vouching for a file nobody opened | Agent, owner to confirm |
| 26-10-2026 | D29: **a portal account can now write one more thing.** Until P3-2 the only write was a change request, which is a comment and alters no record — `profile/actions.js` says so. The three commonest answers to a document request (*I don't have it*, *my accountant has it*, *I'm not sure what you mean*) were a phone call nobody recorded, so the job sat in Awaiting documents with no reason attached. The write is as narrow as one can be: the engagement must be in that client's scope, the item must be on the client's own side, it must not be settled, and the **only** field written is `clientReply` — not the status, not the documents, not a date. A client still cannot upload from the portal and cannot move an item forward | Agent, **owner should confirm this one** |
| 26-10-2026 | D30: **a delegate link is minted by the system, not the client.** The prototype lets the client create the upload link. A portal user minting a token that works without signing in is an escalation, so instead the client names the person and the system creates a one-item `DocRequest` — same hashed token, same seven days, same upload-only gateway, and the delegate sees one document name and nothing else of the engagement. If the contact is an email address it is sent; a mobile number waits for WhatsApp, and until then the firm sends the link by hand rather than the request going nowhere silently | Agent, owner to confirm |
| 26-10-2026 | D31: **the completion gate accepts a waived item.** It demanded `Verified` and nothing else, so a mandatory document a CA had decided was not needed blocked completion for ever. Settled now means accepted **or** not required, and not-required demands a reason — a waived mandatory document is exactly what a reviewer asks about | Agent, owner to confirm |
| 26-10-2026 | D21: **an engagement owes a list of filings, not one.** `Engagement.milestones[]` is where a filing is recorded; `statutoryDue`, `filedOn` and `ackNo` stay as a **derived view** of it, written only by `syncDerived()`. Forty files read `statutoryDue` and sixteen read `filedOn`, and all of them want what they always wanted — keeping them a view made this a two-surface change instead of a forty-file one | Owner instruction, built |
| 26-10-2026 | D22: **a GST engagement is now due on the 11th, not the 20th.** The governing date is the earliest filing still outstanding, so the GSTR-1 deadline is visible for the first time; it moves to GSTR-3B's date once GSTR-1 is in. **The overdue count will rise on any real data**, because a month with GSTR-1 unfiled after the 11th is now overdue and used not to be. That is the honest reading, and it is also what the reminders at 5 and 1 days before will now fire against | Agent, owner to confirm |
| 26-10-2026 | D23: **lateness is judged against the due date as it stood on the day of filing**, captured once in `dueDateAtFiling` and never recomputed. An extension announced in December must not retroactively make a late November filing punctual, and withdrawing one must not make a punctual filing late. The live `dueDate` moves with extensions; the frozen one is what the punctuality report reads | Agent, owner to confirm |
| 26-10-2026 | D24: **a correction supersedes, it does not overwrite.** Replacing a filing record moves the old acknowledgement, date and reason into `history` and reopens the filing. Refused outright once the work is invoiced — an invoice that cites a filing cannot quietly start citing a different one, so a credit note comes first. `Completed` stays terminal: a correction is its own recorded event and does not reopen the engagement | Agent, owner to confirm |
| 26-10-2026 | D25: **approval before filing was deliberately not built here.** The plan said this step would enforce it; on reading the pipeline, review still comes after filing (spec §5) and reversing the order is P3-5's whole job. Doing half of it would have left the pipeline in a state neither the spec nor the prototype describes. `canRecordFiling()` carries the note | Agent, owner to confirm |
| 26-10-2026 | D26: **QRMP is still not covered, and the rule now says so at length.** The plan was to add it as a variant carrying the prototype's 14-state list. On reading `variantSchema`, variants match on the *period code* — QRMP is a property of the client, so the mechanism cannot express it. It needs its own rule or a scheme field on the client (P3-12). Until then a QRMP client on the GST rule gets monthly dates, which are wrong for them, and the caution says that in those words | Agent, owner to confirm |
| 24-10-2026 | D18: **every new client belongs to a group.** Required on creation only — the clients already on the books predate the rule and have to stay editable, so an edit that does not mention the group leaves it alone. The Excel import names the group by name and creates it as the row is written | Owner, approved |
| 24-10-2026 | D19: **a UDIN names the CA or partner who signed it, and the field is no longer optional.** Both roles may be named, because a UDIN is generated against a member's own ICAI membership and a CA has one; what changed is that the register can now always answer "which member signed this certificate" | Owner, approved |
| 24-10-2026 | D20: **documents attach to a UDIN.** The signed certificate and the client papers behind it hang off the register row, and when the UDIN came out of an engagement that engagement's own papers are listed under them, read-only. Two lists, never merged — merging them would hide which file is the firm's evidence for the number | Owner, approved |
| 24-10-2026 | **Compliance is read by head using the service catalog itself**, not a new GST / TDS / ITR taxonomy. GSTR-3B *is* the GST monthly head and TDS-RET the TDS quarterly one, grouped under the categories the catalog already carries. A separate list of heads would be a second thing to maintain and a list the owner would have to verify | Agent, owner to confirm |
| 24-10-2026 | **The firm's target date keeps the name "Internal due date"**, and stays one date per engagement rather than a default per client and service. The owner chose both: the label already reads that way on five screens, three reports and the exports, and it is what distinguishes the firm's own date from the statutory one | Owner, approved |
| 24-10-2026 | D17: **a client's several businesses are several client records, grouped — not sub-records under one client.** The owner confirmed the businesses have separate PANs, and `Client` is already keyed on PAN with its own GSTINs, fees, engagements and invoices, so a `businesses[]` layer would have duplicated the client record one level down. `ClientGroup` becomes the owner (a person or a family) and P2-11 adds the screens that read a group together. **If a proprietor ever runs two firms on one PAN, this does not cover it** — the unique PAN index would refuse the second record, and that case needs the embedded design after all | Owner, approved |
| 24-10-2026 | **One invoice per business**, each carrying that business's own GSTIN. Separate registrations mean separate input credit, so a combined invoice would be wrong for the client's books | Owner, approved |
| 16-10-2026 | Tech stack fixed per CLAUDE.md (Next.js 15 App Router, JavaScript + JSDoc, MongoDB Atlas Mumbai, Vercel bom1, BigRock gateway) | Owner, pre-build |
| 16-10-2026 | Storybook deferred from Step 0 to Step 1 — nothing to put in it until the first real components exist | Agent, owner to confirm |
| 16-10-2026 | No Figma stage: design tokens built in code straight from spec §15. Revisit if a designer joins | Agent, owner to confirm |
| 16-10-2026 | Sentry deferred to Step 12 (go-live), not Step 0 | Agent, owner to confirm |
| 16-10-2026 | Dates formatted with `Intl` + `Asia/Kolkata` rather than a date library; date-fns arrives at Step 5/7 when working-day maths starts | Agent |
| 16-10-2026 | Theme (Paper / Night shift), density and rail state stored per browser in localStorage, not per user in Atlas — moves to the user record in Step 1 if it should follow people between devices | Agent, owner to confirm |
| 16-10-2026 | Git repository initialised locally; no GitHub remote yet, it needs the firm's account (spec §14: the firm owns the code) | Agent, owner action |
| 16-10-2026 | Sessions are JWTs, not database rows, and Auth.js runs without a MongoDB adapter — users already live in our own collection | Agent |
| 16-10-2026 | Passwords use Node's built-in scrypt rather than bcrypt; TOTP uses `otpauth`. One less dependency on the security path | Agent |
| 16-10-2026 | 2FA is enrolled on first sign-in (QR shown then), so no account can exist without it | Agent |
| 16-10-2026 | Five wrong passwords locks an account for 15 minutes | Agent, owner to confirm |
| 16-10-2026 | New users get a one-time password read out by the partner; emailed invitations wait for the mailer in Step 9 | Agent |
| 16-10-2026 | The audit chain is serialised through one counter document, so concurrent writes conflict and retry rather than forking the chain | Agent |
| 16-10-2026 | Audit export is CSV with a UTF-8 marker (Excel reads it natively) instead of a real .xlsx; revisit in Step 10 | Agent |
| 16-10-2026 | PAN and Aadhaar changes are logged as "changed" without their values, per CLAUDE.md rule 7, even though spec §11 asks for before/after on every field | Agent, owner to confirm |
| 16-10-2026 | A failed audit write rolls back the change it belongs to; the one exception is sign-out, which is never blocked by a log failure | Agent |
| 16-10-2026 | Client import accepts CSV (Excel's "Save as → CSV UTF-8") rather than .xlsx, to avoid a spreadsheet-parsing dependency | Agent, owner to confirm |
| 16-10-2026 | Client list is a server-paged plain table instead of TanStack Table + Virtual; revisit at the compliance grid in Step 7 | Agent, owner to confirm |
| 16-10-2026 | A duplicate PAN or GSTIN blocks saving but can be overridden with a tick box; a shared mobile only warns | Agent, owner to confirm |
| 16-10-2026 | Client codes run PHMG-<branch>-0001 upward, one series per branch, never reused | Agent |
| 16-10-2026 | A revealed portal password clears from the screen after one minute | Agent |
| 16-10-2026 | No separate template-versions collection: engagements snapshot the template when created, and the audit log already holds every field change, so `version` is just a label that goes up when the definition of the work changes | Agent |
| 16-10-2026 | A version bump is triggered by level, roles, turnaround, recurrence, UDIN, checklist or steps — not by a name, fee or SAC correction | Agent, owner to confirm |
| 16-10-2026 | Checklist and step rows reorder with up/down buttons, not dnd-kit; dnd-kit arrives at the Kanban in Step 5 | Agent |
| 16-10-2026 | Starter catalog seeded with every fee at ₹0 and SAC blank except 998221 on the two audit services — prices and SAC codes are the firm's to set | Agent, owner action |
| 16-10-2026 | Services are archived (hidden from new engagements), never deleted | Agent |
| 16-10-2026 | Settings is now visible to every role; the sections inside it are filtered, so staff can read the catalog without reaching Team | Agent |
| 16-10-2026 | Step 5 split into 5a (core workflow) and 5b (list, Kanban, calendar, bulk actions) | Owner, approved |
| 16-10-2026 | "Billed" is a billing status alongside the pipeline, not one of the eight pipeline statuses — spec §5 runs the two in parallel | Agent |
| 16-10-2026 | No date-fns: working days are Mon–Fri in eight lines in `lib/dates.js`, and the holiday list belongs with the due-date master in Step 7 | Agent, owner to confirm |
| 16-10-2026 | Kanban drag-and-drop (dnd-kit) deferred to Step 11; a "move to" control on each card is the keyboard path either way | Agent, owner to confirm |
| 16-10-2026 | Quarters and halves follow the Indian financial year (Q1 = Apr–Jun, H1 = Apr–Sep); one-time work is filed under the FY it starts in | Agent, owner to confirm |
| 16-10-2026 | Completed and Cancelled are terminal: nothing reopens an engagement, per spec §5 "locked except for comments" | Agent, owner to confirm |
| 16-10-2026 | Completing requires every mandatory checklist item verified, every review point ticked, and a UDIN where the service needs one | Agent |
| 16-10-2026 | The review checklist is one general list for every service plus a UDIN line where required; per-service review checklists can be added to the catalog later | Agent, owner to confirm |
| 16-10-2026 | One engagement per client, service and period, enforced by a unique index — the duplicate guard Step 7's generator will rely on | Agent |
| 16-10-2026 | Step 6 split into 6a (gateway, adapter, uploads, bin) and 6b (client upload links, document search) | Agent, owner approved |
| 16-10-2026 | A second storage driver writes to a local folder for development and tests, using the same tickets and the same encrypted format as BigRock — otherwise nothing in Step 6 could be built or tested before the cPanel work was done | Agent |
| 16-10-2026 | File size limit 25 MB; accepted types PDF, JPG/PNG/WebP/HEIC, Excel, Word, CSV, text, ZIP | Agent, owner to confirm |
| 16-10-2026 | Documents retained 8 years by default, recycle bin 90 days — both settings, not constants | Agent, owner to confirm |
| 16-10-2026 | A purged document keeps its row with the file key emptied: the record that something existed and was destroyed is itself part of the audit trail | Agent |
| 16-10-2026 | The file key is the AES-GCM additional authenticated data, so a stored file cannot be moved to another key and still decrypt | Agent |
| 17-10-2026 | Client upload links store only the token hash, last 7 days, cap at 50 files, and can be withdrawn. The link can upload and nothing else | Agent, owner to confirm |
| 17-10-2026 | A client upload moves a checklist item to Received, never to Verified — verifying stays with the firm | Agent |
| 17-10-2026 | Document search is a regex over names plus a client lookup, not Atlas Search; revisit with the reporting in Step 10 | Agent |
| 17-10-2026 | Step 7 split into 7a (queue and runner), 7b (due-date master and generation) and 7c (calendar and grid) | Agent, owner approved |
| 17-10-2026 | The jobs collection does **not** carry the audit plugin, unlike every other model: a job row is a note to the machine, and auditing each claim and retry would bury the real entries. What a job does is audited by its handler | Agent, owner to confirm |
| 17-10-2026 | Both runner deployment shapes are built — a cPanel Node.js script and a secret-guarded /api/jobs/run route — because the hosting answer is still open and the second costs nothing to leave in | Agent |
| 17-10-2026 | The heartbeat reuses the counters collection rather than adding one: its updatedAt is the last run and its seq is the run count | Agent |
| 17-10-2026 | Due-date rules are seeded unverified and produce no date at all until a partner confirms each one; unconfirmed work is still generated on time, with the deadline left blank (rule 8) | Agent |
| 17-10-2026 | The seeded table was drafted from third-party tax calendars searched in Oct 2026 — **no official CBIC/CBDT/MCA source was found**; each row carries its source and what the sources disagreed about | Agent, owner must verify |
| 17-10-2026 | An invoice number is taken when the invoice is **issued**, never when the draft is created — a statutory series cannot gap, and an abandoned draft must not leave a hole | Agent |
| 17-10-2026 | A branch with no GSTIN can draft but not issue: the first two digits of the GSTIN decide CGST+SGST vs IGST, and that cannot be guessed | Agent, owner action |
| 17-10-2026 | Invoice numbering is one series per branch per financial year, as spec §7 specifies | Agent, owner to confirm |
| 17-10-2026 | Issued invoices store their own tax figures rather than recomputing on read, so an old invoice always prints as it printed | Agent |
| 17-10-2026 | TDS at 10% under 194J is shown as expected but never deducted from the total — it is the client's deduction, not a discount | Agent, owner to confirm |
| 17-10-2026 | Discounts above 10% need a partner to approve them | Agent, owner to confirm |
| 17-10-2026 | An invoice is settled when cash plus TDS credited covers the total — a client who pays 90% and deducts 10% TDS has paid in full and is not chased | Agent |
| 17-10-2026 | A receipt belongs to the client, not to one invoice: allocations are embedded on the payment and anything unallocated sits as credit | Agent |
| 17-10-2026 | Client-facing email is off behind EMAIL_CLIENTS_ENABLED and stays off until go-live; held messages are still composed, logged and visible. A redirect-all address allows testing the real SMTP path without touching a client | Agent |
| 17-10-2026 | Nothing sends inline: every message is queued and drained under an hourly cap, so a slow mailbox cannot slow a save and a burst cannot get the domain throttled | Agent |
| 17-10-2026 | Notifications and message logs are written in the same transaction as the thing they describe, so nobody is told about a change that was rolled back | Agent |
| 17-10-2026 | Notifications carry no audit plugin and expire after 60 days; message logs are kept, because what a client was told is a record | Agent |
| 17-10-2026 | React-PDF added (named in spec §14) rather than relying on browser printing, because Step 9 has to attach the same file to an email | Agent |
| 17-10-2026 | Exports write rupees with two decimals, not paise: the file is read by a person, and a column of paise invites a hundredfold error | Agent |
| 17-10-2026 | Reallocating a payment reverses the old allocations before applying the new ones, in one transaction, so a correction cannot double-credit | Agent |
| 17-10-2026 | The compliance grid treats the period in progress as neither missing nor late — a hole is only a hole once the period has ended, or the grid cries wolf every month | Agent |
| 17-10-2026 | Internal target = 3 working days before the statutory date; recurring work is generated 15 days ahead (both spec §8 defaults, both settings) | Agent, owner to confirm |
| 17-10-2026 | Scheduled jobs are offered on every pass and de-duplicated by a unique key of schedule plus due moment, so nothing has to remember what was queued and a missed cron catches up by itself | Agent |
| 18-10-2026 | Notification rules keep their defaults in code; the `notificationRules` collection stores only the firm's changes, and saving the defaults back empties the row | Agent |
| 18-10-2026 | A reminder is de-duplicated by a key on the message log under a unique index, so overlapping runners and retried jobs cannot chase anybody twice | Agent |
| 18-10-2026 | The overdue email goes to the assignee and reviewer; Partners get the firm's whole overdue list in their daily digest instead of one email per job | Agent, owner to confirm |
| 18-10-2026 | Reminder sweep at 08:00 IST, digest at 09:00, weekly summary Monday 09:00 — the digest times are editable in settings, the sweep's is not | Agent, owner to confirm |
| 18-10-2026 | While client email is off, client-facing reminders are not composed at all, rather than logged as held — a sweep is not an event, and held chases would spend a request's four reminders without one arriving | Agent |
| 18-10-2026 | Each document chase mints a fresh upload link, because only the hash of the previous one is stored. Nothing about the link design was weakened to make chasing possible | Agent |
| 18-10-2026 | An empty daily digest is not sent | Agent |
| 18-10-2026 | Exports are real `.xlsx` through `exceljs` (owner approved), not CSV — frozen bold headers, money as a summable number, dates as dates. The four existing CSV exports were converted | Owner, approved |
| 18-10-2026 | A dashboard figure is a *filter*, counted by the same `engagementQuery` the list and the export use, and its link is that filter in the URL — so a tile cannot drift from its list | Agent |
| 18-10-2026 | The role dashboards live on `/today` rather than a second `/dashboard` screen; an employee's or intern's own work *is* their dashboard | Agent, owner to confirm |
| 18-10-2026 | Saved views store the query string, not the filter fields, so a new filter on a list needs no change to the model | Agent |
| 18-10-2026 | A saved view is private unless a Partner shares it with the firm | Agent, owner to confirm |
| 18-10-2026 | PDF export on the three reports people print (status, overdue, documents awaited); the rest are spreadsheet only | Owner, approved |
| 18-10-2026 | No visx: the one chart on the dashboard is six CSS bars. Marked `ponytail:` — visx when a real time series needs axes or a brush | Agent, owner to confirm |
| 18-10-2026 | **Filed green and Waiting amber in the light theme are darker than the hex in spec §15** (`#2F7D4F`→`#2D784C`, `#C98A16`→`#8D610F`). The spec also sets WCAG 2.2 AA; its own amber reads at **2.61:1** as text on Paper, which fails. The chip fills keep the spec's brighter hues, so the colours still look right | Agent, **owner should confirm** |
| 18-10-2026 | Brass keeps the spec's value for the focus ring (it clears the 3:1 a boundary needs); a darker `--brass-ink` is used in the four places brass is text | Agent |
| 18-10-2026 | No Motion library: the audit tick and the stamp are SVG + CSS keyframes. Spec §15 names Motion for both, but a stroke-dash draw and one transform are native CSS, and the library would be ~34 KB to do it | Agent, owner to confirm |
| 18-10-2026 | `@react-three/drei` was installed and then removed — the scene needs nothing from it, and an unused dependency on the login path is only a liability | Agent |
| 18-10-2026 | The camera glides into the **head office**, not the signed-in person's own branch: knowing their branch before the second factor is passed would leak which office an email belongs to | Agent |
| 18-10-2026 | Dragging a card on the board never offers On hold or Cancelled: both need a reason, and a drag has nowhere to type one. They stay on the explicit control, where the reason is audited | Agent |
| 18-10-2026 | Quick-add (+) opens the command bar rather than a second menu of the same links | Agent |
| 18-10-2026 | A DPDP deletion request is honoured as **redaction**, not deletion: personal data is overwritten and the documents erased, while the statutory record (invoices, engagements, UDINs, the audit log) is kept because the law requires it | Owner, approved |
| 18-10-2026 | A DPDP export reports encrypted fields as *held* and never decrypts them — a spreadsheet carrying a client's Aadhaar and portal passwords out of the building would be the worse breach | Agent |
| 18-10-2026 | The session is trusted for identity only. The role, the branches and the right to be here are read from the database on every request, so a deactivation or a demotion bites at once rather than in up to 30 minutes | Agent |
| 18-10-2026 | Opening receivables come in as invoices in their own `OB/` series, outside the statutory numbering, so history can never disturb the firm's gapless GST sequence | Agent, owner to confirm |
| 19-10-2026 | `softDelete()` and `restore()` now take the audit transaction's session, which the four callers pass. Threading it through explicitly rather than having the model reach for an ambient session, so no `save()` anywhere else in the app changes behaviour | Agent |
| 19-10-2026 | `npm run doctor` rather than a readiness screen inside the app: the first thing it checks is whether the app can reach the database at all, and a screen that needs the app running cannot report that | Agent |
| 19-10-2026 | **Sentry installed, switched off until a DSN is set.** No DSN means no account, no code loaded and not a byte added to what the browser downloads — the build is identical to the one before it | Owner, approved |
| 19-10-2026 | Errors only: performance tracing, session replay and profiling are all off. Each would send far more of what a staff member was doing than knowing about a crash requires | Agent |
| 19-10-2026 | Every error report is scrubbed before it leaves (`lib/observability/scrub.js`): no request body, cookies, headers or query string, no email or IP, and PAN, Aadhaar and GSTIN written over wherever they appear, including inside the error message itself. An error report is a log that leaves India, and CLAUDE.md rule 7 applies to it | Agent |
| 19-10-2026 | Sentry's build plugin is applied only when `SENTRY_AUTH_TOKEN` is set. Its only job is uploading source maps, and it roughly doubled the build time with nothing to upload | Agent |
| 19-10-2026 | **Phase 2 opened although Phase 1 is not in daily use**, which is what `CLAUDE.md` gates Phase 2 on. Phase 1 has never run against a database; the gate cannot be met until the Atlas cluster exists, and the owner chose to carry on building rather than wait | Owner, approved |
| 19-10-2026 | D1: the existing `partner` role **is** Admin. No new `admin` role; the label stays "Partner / Admin" | Owner |
| 19-10-2026 | D2: a CA gets everything a Partner has within their own branches, except creating or removing team accounts, role changes, Settings → Team / Security / Background jobs / Bringing data in, fee write-offs, soft delete and purge. `invoices.ca` moves from view/branch to **edit/branch** | Owner |
| 19-10-2026 | D3: employee and intern client access **narrows** to assignee or reviewer on an engagement, or an active Client Access Grant. This replaces `clients.employee = view/branch` | Owner |
| 19-10-2026 | D4: the A/B/C hierarchy is a relabelling of the stored levels — L3→A, L2→B, L1→C. **No data migration** | Owner |
| 19-10-2026 | D5: a C-tier job still cannot close without CA sign-off. Maker-checker stays; C-tier gets a **bulk "Approve selected"** in the review queue that records each sign-off separately and still blocks self-approval | Owner |
| 19-10-2026 | D6: offboarding is deactivate plus soft delete, never a hard delete, and is blocked until open engagements are reassigned and grants revoked. The email can be reused afterwards, because the unique index is partial on `deletedAt: null` | Owner |
| 19-10-2026 | D7: client logins live in a separate `clientUsers` collection, not `users`. Authenticator 2FA is **optional** for clients; staff 2FA stays mandatory. A CA or Partner issues the first one-time password | Owner |
| 19-10-2026 | D8: "Audit log" becomes **Portal log** in the words and the route only. The `AuditLog` model, the `auditLogs` collection, `lib/audit/*`, `ACTIONS`, the hash chain and the `auditLog` permission key all stay — the log is append-only and hash-chained, so copying it into a new collection would break `verifyAuditChain` | Owner |
| 19-10-2026 | D9: Based Docs output is **PDF first**, through the `@react-pdf/renderer` already used for invoices. DOCX needs the `docx` package and waits for its own approval (P2-8c) | Owner |
| 19-10-2026 | D10: the client panel is `/client/*`, login at `/client/login`, separate from the staff `/clients` list | Owner |
| 20-10-2026 | D13: **Statutory is the Registrar's book** — Company Law / ROC only. PF, ESI and PT are returns with a deadline, so Payroll and Labour sits in Tax. Accounting, Advisory, Registrations and Certification belong to no book: they are work, not filings | Owner default, applied |
| 20-10-2026 | D14: audit opinions are the four of SA 700 / SA 705 — Unmodified, Qualified, Adverse, Disclaimer — plus "Not yet issued" for the state every audit starts in. Anything but unmodified has to record what it is modified for | Owner default, applied |
| 21-10-2026 | **A client cannot edit their own record.** `/client/profile` is read-only and the box beneath it writes a change request to the firm: a GSTIN retyped by a client and checked by nobody goes onto invoices and into returns | Agent, owner to confirm |
| 21-10-2026 | Written-off and disputed invoices **are** shown in the portal. They were issued, and a client statement that disagreed with the firm's ledger would be worse than a blunt one | Agent, owner to confirm |
| 21-10-2026 | **No upload and no payment from the portal.** The document-request link already uploads with its own token and narrow scope; a second door into the vault is a second thing to get wrong, and there is no payment gateway | Agent |
| 21-10-2026 | A client sees the engagement's own status words, "On hold" and "Sent back" included. Honest, and possibly more than the firm wants read — flagged | Agent, owner to confirm |
| 20-10-2026 | **One portal account sees one client.** A person who runs two companies gets two logins, and one email can hold only one account across the whole portal — an ambiguous sign-in is refused rather than guessed at | Agent, owner to confirm |
| 20-10-2026 | **Portal 2FA is optional and off by default**, turned on by the firm per account (the brief's position). Staff 2FA stays mandatory | Agent, owner to confirm |
| 20-10-2026 | **Only a CA or a partner may share a document with a client**, although an employee may edit documents on their own work. Sharing is the only edit on that screen that sends the firm's material outside the firm | Agent, owner to confirm |
| 20-10-2026 | Middleware stays cookie-presence-only and does **not** decide staff-or-client. Verifying the JWT at the edge means pulling the auth config and Mongoose into a bundle already at 107 KB; the two layouts decide instead, against the database, every request | Agent |
| 20-10-2026 | Portal accounts live on the **Team & access tab**, not a ninth tab: that tab already asks who can see this client, and the client's own people are part of the answer | Agent |
| 20-10-2026 | D16: **`docx` approved as a dependency** for P2-8c, over hand-building the zip with `fflate` (already present) or skipping Word output. The deciding argument: whether Word opens the file is the one thing that cannot be tested here, and a library's output is known-good | Owner, approved |
| 20-10-2026 | D15: the eight starter document templates are the agent's proposal, **all unapproved**, their wording drafted plainly and explicitly not an ICAI pro forma. A partner approves each one before it can be issued; the list itself is the owner's to change | Owner default, applied |
| 20-10-2026 | **A generated document is not stored as a file.** A final holds its own words and the PDF renders from them, like an invoice. Storing one would need a server-side write to the file gateway, which only takes browser uploads with a signed ticket | Agent, owner to confirm |
| 20-10-2026 | Editing an approved template **un-approves it** and bumps its version. An approval is of a wording, not of a name on a list | Agent |
| 20-10-2026 | Issuing follows P2-4's sign-off ladder rather than a second one: a partner for A-tier work, a CA otherwise, and a document with no engagement behind it counts as A-tier | Agent |
| 20-10-2026 | **Late is computed, never stored**: `filedOn` against `statutoryDue`, in whole IST days, so correcting a due date corrects every answer with it. Filed *on* the due date is on time | Agent |
| 20-10-2026 | The three books are **one route with a three-entry definition**, not three pages. Three near-identical page files would have drifted within a month | Agent |
| 19-10-2026 | **Plain forms, not React Hook Form.** Spec §15 and the Phase 2 brief both name it; it is not installed, and neither are Radix, Motion, TanStack, date-fns, Sonner or visx. Every form in the app is a `<form>` and a server action, and Based Docs will be too | Owner, approved |
| 19-10-2026 | **An `identifiers` grant widens `clientSensitive` for an employee**, so the grant UI cannot offer a section the server then refuses. Never for an intern, and `credentials` is never reachable by any grant | Owner, approved |
| 19-10-2026 | **Storybook stays unbuilt.** Deferred from Step 0 and now declined for Phase 2. Spec §15's "every component built in Storybook against a Figma token file" is a process item the firm has chosen not to meet | Owner, approved |
| 19-10-2026 | Sample seed data moved early, to P2-2b: with no clients, staff or grants in the database, no step after P2-2 could be checked in a browser | Agent |
| 19-10-2026 | P2-8, P2-9 and P2-10 of the brief split into three, two and four steps — each was several steps' work in one row | Agent |
| 19-10-2026 | The `granted` scope is **not branch-tested**, unlike `assigned`. A grant names one person, one client and a reason, and is audited, so a branch check could only take back access somebody meant to give; it also stops a branch transfer stranding work already on someone's desk | Agent, owner to confirm |
| 19-10-2026 | `seesOnlyOwnRecords()` replaces three copies of `scopeOf(actor, "clients") === "assigned"`. Comparing a scope to a string by hand meant renaming the scope would silently widen all three lists — which is exactly what D3 would have done | Agent |
| 19-10-2026 | A client's name appears in the browser tab only for a Partner, a CA or the accounts person. An employee or intern gets "Client · PHMG" even on a client they may open: the title cannot be checked properly without a second query for a decoration, and the safe side of that trade is the dull title | Agent, owner to confirm |
| 19-10-2026 | **Splitting `clientSensitive` into identifiers and credentials deferred to P2-2.** One area covers both the statutory IDs and the credentials vault, so the owner's "identifiers yes for an employee, the vault never" cannot be expressed until there are grant sections to attach them to. P2-1 therefore leaves sensitive data exactly as wide as it was | Agent |
| 19-10-2026 | `clientSensitive` is now `clientIdentifiers` and `clientCredentials`. A PAN identifies a client; a portal password *acts as* them, and the two are not the same risk. The vault is in no grant ceiling below CA, so no list of sections anybody can post opens it | Owner's decision, applied |
| 19-10-2026 | **A grant is not branch-tested and `clientListFilter` adds no branch condition for an employee or an intern.** A CA can only grant their own branch's clients, so the branch is checked when the grant is given rather than every time it is read — and a person moved between offices keeps the clients somebody deliberately opened to them | Agent, owner to confirm |
| 19-10-2026 | **Being on the work gives the profile, the engagements and the documents — not the statutory IDs.** Spec §2 reads "sensitive IDs: employee V (assigned only)", which was wider; the Phase 2 brief lists what implicit access gives, and a PAN is not in it. A CA who wants an employee to have it grants `identifiers` by name. Narrower than §2, deliberately | Agent, **owner should confirm** |
| 19-10-2026 | **Access through an assignment lapses when the work closes.** Only *open* engagements open a client, so a finished job stops being a reason to hold the file open. A grant is how access outlives the work | Agent |
| 19-10-2026 | A grant lets somebody see that a client *has* this work; it does not let them open it. The `engagements` section hangs off the `clients` area, and the engagement screen itself stays on `engagementsWork`, which is assignment-scoped — so a grant shows the list without handing over the working papers | Agent |
| 19-10-2026 | **The per-client Activity tab now follows the `auditLog` permission**, so an employee and an intern no longer see a client's full change history. Spec §11 gives them no access to the log; it also asks for an Activity tab "on every client", and the two readings disagree. Taken the narrow one | Agent, **owner should confirm** |
| 19-10-2026 | An expiry is honoured when the grant is **read**, not when the nightly job runs. `jobs/expireGrants.js` only tidies the access list, so a cron that fails for a week cannot leave anybody's access open past its date | Agent |
| 19-10-2026 | The Team & access tab was brought forward from P2-5 rather than given the grant UI a temporary home. P2-5 adds its other two halves: who works on the client, and the client's portal accounts | Agent |
| 19-10-2026 | **Sample data is opt-in and separate.** `scripts/seed.js` writes what the firm needs and is what runs against the live cluster; `scripts/sample.js` invents clients and only runs on `--sample`, never under `NODE_ENV=production`. People carry an `@sample.phmgindia.test` address and clients the tag `sample`, so `--drop-sample` finds them all again | Agent |
| 19-10-2026 | Sample PANs and GSTINs are **built, not typed.** `checkGSTIN` verifies the state code, the embedded PAN, that the PAN's holder-type character agrees with the entity type, *and* a check digit — so an invented number would be refused by the firm's own form the first time anybody edited the client. `gstinCheckDigit` is now exported for that, and every seeded identifier goes through its validator in `tests/sample.test.js` | Agent |
| 19-10-2026 | The sample portal user, UDIN rows, DSC tokens and the eight document templates from §11 of the brief are seeded by P2-9a, P2-7 and P2-8b — the steps that create those models. They cannot be seeded before the collections exist | Agent |
| 19-10-2026 | **The forced password change lives outside the `(app)` layout**, at `/change-password`. The layout redirects there unconditionally when `mustChangePassword` is set; a screen inside the layout it protects would need the layout to know which page it was rendering just to avoid redirecting to itself | Agent |
| 19-10-2026 | **Changing your own password, and resetting your own 2FA, both require the current password.** The session already proves who they are, but a session is a cookie on a machine that may be borrowed — and moving the second factor onto a different phone is the one move that turns a borrowed laptop into a permanent account takeover | Agent |
| 19-10-2026 | **A demotion is refused while the person is still on work the new role could not do or review**, with the engagements named. Letting it through would leave engagements nobody is allowed to touch | Agent |
| 19-10-2026 | A partner cannot be offboarded from a screen, and nobody can offboard themselves. Two partners should do the first together | Agent, owner to confirm |
| 19-10-2026 | The offboarding wizard reassigns **one engagement at a time**, through the same `reassign` action the engagement screen and the bulk list use. Each row has its own minimum role, so one dropdown for all of them would offer somebody who cannot legally take half — and the wizard adds no new path into an engagement | Agent |
| 19-10-2026 | `MobileNav` shows **four links and a More sheet**, with the current page always among the four. It used to render every rail link, which already filled 390 px at nine and would have overflowed badly at seventeen | Agent |
| 19-10-2026 | "Clients" in the rail reads **"My clients"** for an employee or an intern. The label followed the permission scope rather than the role, so it is right for anybody who reaches clients one at a time | Agent |
| 19-10-2026 | A/B/C tier counts per person deferred to P2-4, which is where the tier labels and the badge are built. The team list and the Work tab show open and overdue counts and the old level label until then | Agent |
| 19-10-2026 | The A/B/C letters are a **presentation layer over the stored levels**: `TIER_OF` / `LEVEL_OF` in `lib/services/catalog.js` are the only place they meet, and no data was migrated. Relabelling must not touch work already in progress | Agent |
| 19-10-2026 | The tier filter, the tier badge and the tier counts all read **`templateSnapshot.level`**, never the template. A service re-tiered this month therefore does not re-tier work started last month | Agent |
| 19-10-2026 | A step whose `minRole` changes **bumps the service version**: who may do a step is part of what the work is. Blank inherits the service's `minExecRole`, which every step and task created before P2-4 holds | Agent |
| 19-10-2026 | Batch sign-off is capped at **25 a press** and lives in `lib/engagements/status.js` rather than beside the action, because a `"use server"` module may only export async functions and the bulk bar has to state the number before it sends anything | Agent |
| 19-10-2026 | When a subscription's usual people no longer qualify, the recurring generator **creates the work unassigned and says why** rather than assigning somebody who may not do it, and the client screen and the service save name what to fix | Agent, owner to confirm |
| 19-10-2026 | The starter catalog gets **no per-step restrictions**: which step of which service is a CA's is firm policy, not ours to invent. Every step inherits its service until the owner restricts one | Agent, owner to confirm |
| 19-10-2026 | **D10: the client case file keeps its eight tabs** — Overview · Engagements · Compliance · Documents · Invoices · Team & access · Notes · Activity — each with a count. Contacts stays a panel inside Overview and the ledger stays inside Invoices | Owner |
| 19-10-2026 | A tab count is the tab's own query, narrowed the same way, and is counted only for the tabs that person can open. Overview, Compliance and Activity have no count: an audit log has no meaningful total | Agent |
| 19-10-2026 | The per-client Compliance tab is **one grid per recurrence**, not one grid with mixed columns. Stretching an annual service across twelve monthly periods would invent holes, which is the one thing this screen must not do | Agent |
| 19-10-2026 | Somebody who reaches a client through their own work sees **no compliance grid**, with a line saying why: a partial grid shows gaps that are not real ones | Agent, owner to confirm |
| 19-10-2026 | "Who works on this client" is **derived from the open engagements** plus the named partner and relationship manager, never stored. Reassigning work is what changes it | Agent |
| 19-10-2026 | **D11: the firm enters its own CPE targets.** ICAI's hour requirements are not seeded, not guessed and not hardcoded (CLAUDE.md rule 8); until a partner enters them, hours are totalled and every year reads 'not set' rather than failed | Owner |
| 19-10-2026 | `FirmSettings` is **one document keyed `firm`**, read through a one-minute cache that never throws: a missing document, or no database, returns what the app said before the screen existed. An invoice must print even if the firm record is gone | Agent |
| 19-10-2026 | A **blank the firm saved is kept blank** — clearing the line under the firm name means no line. Only the name itself refuses to be empty | Agent |
| 19-10-2026 | The authenticator-app issuer and the browser tab title **stay hardcoded**: renaming the issuer would confuse every enrolled phone and buy nothing | Agent |
| 19-10-2026 | The CPE log is a **subdocument on the user**, not a collection: a couple of dozen entries a year, always read with the person, and spec §13 fixes the collection list | Agent |
| 19-10-2026 | A CPE year runs on the basis the firm picks (January–December or April–March). The rest of the app is April–March, but a CPE block is the ICAI's year and not ours to assume | Agent, owner to confirm |
| 19-10-2026 | Everybody may **read** the firm record (it is the letterhead, and somebody filling in a form needs the FRN); only a Partner changes it. The new `firmProfile` area is the one P2-1 said would arrive with this model | Agent |
| 19-10-2026 | **D12: the DSC register is expiry only.** The firm does not hold clients' tokens, so there is no custody and no movements log — and P2-1's note about an employee recording movements is obsolete | Owner |
| 19-10-2026 | **The UDIN register is the record and the engagement field is a copy of it**, both written in one transaction. A number already against other work is refused by name, behind a unique index so a race cannot produce two | Agent |
| 19-10-2026 | Clearing a UDIN on an engagement **unlinks** its register row; revoking marks it. Neither deletes: a number generated on the portal exists whether or not we still think it belongs there | Agent |
| 19-10-2026 | A UDIN records **the member it was generated against**, with their membership number snapshotted, because a UDIN belongs to a member's membership and the row must survive them leaving | Agent |
| 19-10-2026 | **No DSC PIN is stored anywhere.** It is a credential (CLAUDE.md rule 7) and belongs in the client's encrypted vault, not on a register half the firm can read | Agent |
| 19-10-2026 | `dscExpiring` is **internal**: the firm cannot renew a client's certificate for them, so the reminder goes to the client partner and their CA. It fires on the notice periods and once on the day, then stops | Agent, owner to confirm |
| 19-10-2026 | The DSC dashboard tile is **absent when nothing is expiring**, rather than showing a zero. A figure that never moves stops being read | Agent |
| 19-10-2026 | The ICAI's own document-type categories are **not modelled** on the UDIN register: what was signed is the firm's own words, since inventing the list would be a guess (CLAUDE.md rule 8) | Agent, owner to confirm |

## What P2-0 found

The brief's own gap analysis was read against the code; all fifteen rows hold.
What it did not say:

- **The tab-title leak is in three pages, not one.** `generateMetadata` reads
  the database before any permission check in `clients/[id]` (the legal name),
  `engagements/[id]` (the code) and `invoices/[id]` (the number). Only
  `reports/[report]` is clean, because it reads nothing.
- **Document downloads do not go through `app/api/storage/*`.** The single
  chokepoint is `linkToDocument()` in `app/(app)/documents/actions.js`;
  `app/api/storage/local/route.js` is the development driver, which verifies
  its own HMAC ticket and must never ask about permissions.
- **The sign-in lockout is not in `lib/security/password.js`** (that file holds
  only `temporaryPassword()`); five strikes and fifteen minutes is written
  inline in `app/(auth)/login/actions.js`.
- **`MATRIX` is module-private**, so the read-only permission screen needs a
  `describeMatrix()` helper rather than the object.
- **`Comment.kind` is an enum** and `internal` defaults to `true`, so a client
  change request has to extend the enum and set `internal: false` by hand.
- **`MobileNav` renders every rail link**, which is already at the edge of
  390 px with nine; the final rail has seventeen.
- **`scripts/seed.js` has no sample data at all** — four branches, one partner
  and the starter catalog, in 150 lines.
- **There is no `/me` or profile page**, and `mustChangePassword` has been
  recorded, displayed and unenforced since Step 1.
- **The audit chain is serialised through one counter document**, so a bulk
  approve writes one chain link per row inside a single transaction; the batch
  needs a cap.
- **`clientSensitive` had no grant story** — resolved by the owner's decision
  above.
- **D2 opens a hole**: `checkOpeningSheet` and `importOpeningBalances` in
  `app/(app)/settings/migration/actions.js` are gated on `edit invoices` with
  no target, while their page is gated on `usersSettings`. Giving a CA
  `invoices: edit/branch` would hand them the opening-balance importer, which
  D2 excludes by name. Fixed in P2-1.

## What P2-1 built

- **`lib/permissions.js`, rewritten.** D2 gives a CA `invoices: edit/branch`, so
  they bill their own branches; the write-off, the team accounts, the bin and
  the data imports stay out of reach because each is its own area. D3 moves
  `clients` and `documents` for an employee and an intern onto a new
  **`granted`** scope: work on their desk, or a Client Access Grant. Nine new
  areas for the Phase 2 screens (`team`, `clientAccess`, `udin`, `dsc`,
  `practice`, `icai`, `docTemplates`, `docGenerate`, `clientPortalUsers`).
- **A client portal user can never pass a staff check.** `can()` refuses
  anything with `kind: "client"` on its first line. They already failed because
  `"client"` is not a role, so this is the second lock: one careless matrix row
  added later cannot open a staff screen to a client. Tested against *every*
  area by iteration, so a tenth area cannot be forgotten.
- **`describeMatrix()`** turns the matrix into words ("Create and edit in their
  own branches") for the read-only permissions screen in P2-10b. `MATRIX`
  itself stays private — an exported object is one assignment away from a
  permission change nobody reviewed.
- **The tab-title leak, in all three pages that had it.** `generateMetadata`
  read the record before any permission check in `clients/[id]`,
  `engagements/[id]` and `invoices/[id]`, so a guessed id put a client's legal
  name, an engagement code or an invoice number in the browser tab of anybody
  signed in. All three now check first and fall back to a generic title.
  `reports/[report]` was already clean; it reads nothing.
- **`lib/security/lockout.js`** — five wrong passwords, fifteen minutes, as a
  pure function of a record and a moment. It was written inline in the staff
  login action; the client portal signs in against a different collection with
  the same rule in P2-9a, and two copies of a lockout drift apart quietly.

**Three holes found while doing it**

- **An intern could not open any client case file.** The page checked
  `can(actor, "view", "clients", { branchId })` — a target with no assignment
  in it, so the `assigned` scope had nothing to match and said no. The list
  showed them their clients and the file turned them away. The page now reads
  who is on the client's engagements and passes it, so the check can answer
  properly; under D3 the same ids are what lets an employee in at all.
- **The opening-balance importer was reachable by the accounts person**, and
  would have become reachable by every CA under D2. `checkOpeningSheet` and
  `importOpeningBalances` asserted `edit invoices` with **no target**, while
  the page they sit behind asserts `usersSettings`. Both now assert
  `usersSettings` too. Raising opening balances reads every client in the firm
  and writes money the firm says it is owed.
- **The client spreadsheet would have opened up.** `/clients/export` refused
  anybody on the `assigned` scope by comparing the scope to that string.
  Renaming the scope to `granted` would have turned the refusal off and handed
  an intern the whole branch as a workbook. Now `seesOnlyOwnRecords()`, in one
  place, used by the list, the export and the command bar alike.

**What P2-1 deliberately did not change:** the `documents` row moved to
`granted` but behaves identically until P2-2 supplies `grantedUserIds`, and
sensitive client data is still checked on the branch alone. So there is no step
in this sequence where anybody can see more than they could yesterday.

- Tests: 35 new Vitest tests (565 total) — the `granted` scope including that
  it ignores the branch and refuses somebody else's grant, every new and
  changed row, a client actor against every area, `seesOnlyOwnRecords`,
  `describeMatrix` and the lockout. 2 new Playwright tests waiting on Atlas:
  an unconnected intern turned away from a client with the name absent from
  the tab title, the list, the search API and the export, and a partner
  opening the same client and seeing it.

## What P2-2 built

- **`models/ClientAccess.js`** — one CA's decision to open one client to one
  person, for named sections, with a reason that is a required field, and an
  optional end date. One row per person per client, so widening a grant is an
  edit with an audit entry saying which sections were added rather than a
  second row nobody notices.
- **`lib/access/sections.js`** — what a grant can open and how far each role
  may ever be opened. **`credentials` and `billing` are in no ceiling below
  CA**, which is the owner's decision made structural: there is no list of
  sections anybody can post that opens the credentials vault or the fees to an
  employee or an intern. An intern is narrower again — no statutory IDs, per
  spec §2. The grant form and the server action call the same `capSections`,
  so the tick boxes cannot offer what the server then refuses, and the refusal
  reads the same in both places.
- **`lib/access/clientAccess.js`** — the one question, asked in one place.
  `accessFor()` for the case file, `scopedByClient()` for any list of a
  client's records, `clientListFilter()` for the client list itself,
  `targetForClient()` wherever a client's branch alone used to be passed to
  `can()`. The three client lists, the case file's eight tabs, every client
  write, the document links, the firm file search and the command bar now all
  read from it.
- **`clientSensitive` split into `clientIdentifiers` and `clientCredentials`**
  — the piece deferred from P2-1 — across twelve call sites.
- **The Team & access tab**, brought forward from P2-5: who has been given
  access, with sections, expiry, reason and who gave it; a drawer to give or
  widen one, with everything above the person's ceiling disabled and saying
  why; revoke, which leaves the row so the access review can still read it.
- **`jobs/expireGrants.js`**, nightly at 02:10. It enforces nothing — a lapsed
  grant already stops working when it is read — it tidies the access list so
  nobody has to date-check it by eye. One `save()` per grant, because the
  audit plugin cannot report what an `updateMany` touched, and "when did she
  stop being able to see this client" is what a confidentiality review asks.
- **The assignment hint**: handing work to an employee now also decides access,
  so `reassign` returns a line saying it opens this engagement and its
  documents only, linking to the drawer. A note on a success, not a dialog.

**Three more holes, and the worst one in the build so far**

- **An employee could download the complete DPDP dossier of any client in the
  firm.** `/clients/[id]/export` builds a workbook of every record held on one
  client, across every collection. Its own comment said "Partner-level"; its
  check was `can(actor, "view", "clientSensitive")` with **no target** — and a
  scope that needs a record to judge says yes when it is handed none, because
  that is how a screen-level question gets answered. Any branch, any client,
  no assignment needed. Now checked with the client's branch in hand, against
  `clientCredentials`. `logDataRequest` beside it had the same shape.
- **The firm file search was branch-wide.** `/documents` scoped by branch
  alone, so an employee got every document name in their office — which is the
  client list they are not allowed to see, spelled out in file names. Scoped
  by client now, through the same filter as `/clients`.
- **The new-and-lost-clients report was branch-wide**, and `reports/[report]`
  only asks `can(actor, "view", "clients")` with no record in hand, which a
  record-level scope passes. It now refuses the report to a role that sees
  clients one at a time and says why, rather than narrowing a firm trend to
  three clients and calling it a report.

**And one consistency fix:** the five paths that decide whether somebody may
touch a document each built their own `can()` target, three of them by hand.
They now share one `targetOf()`, which also means an employee on a client's
work can reach that client's **permanent file** — the PAN card, the
incorporation certificate — which belongs to no single engagement and which
every one of those hand-written targets silently refused.

- Tests: 17 new Vitest tests (582 total) on the part that decides — every
  ceiling, every refusal wording, no role below CA that any request can open
  the vault for, a path-traversal string in a section list, and that the
  section list and the permission matrix agree about an assignee. 6 new
  Playwright tests waiting on Atlas, covering acceptance 1, 2 and 3: a client
  with no grant absent from the list, the case file, the search API and the
  file search; a two-section grant showing exactly two tabs with the PAN still
  masked and the dossier export refused; revoking closing it on the next
  request; an expired grant doing nothing without the job having run; the
  drawer disabling the vault and the fees; and a partner giving access that
  the employee then sees.

## What P2-2b built

- **`scripts/sample.js`** — six colleagues, four clients, eight service
  subscriptions, nine engagements and three access grants, all invented. It is
  **opt-in** (`npm run seed -- --sample`), refuses to run with
  `NODE_ENV=production`, and marks everything it writes so
  `npm run seed -- --drop-sample` can take it out again by soft delete.
  `scripts/seed.js` is untouched in what it does by default: the firm's four
  branches, the catalog, the due-date rules and the first partner.
- **The identifiers are built rather than guessed.** `checkGSTIN` verifies a
  real state code, the embedded PAN, that the PAN's fourth character agrees
  with the entity type, *and* a check digit — so a number invented at the
  keyboard would be accepted by the seed (which writes through the model) and
  then refused the first time anybody opened the client for editing. The owner
  would have found that, not us. `gstinCheckDigit` is exported for the purpose
  and every seeded identifier is run through its own validator in the tests.
  Four entity types — company, LLP, partnership firm, individual — so the
  holder-type character has to be right four different ways.
- **The people hang together**: everybody below partner has a reporting CA who
  really is a CA, the intern is registered under one, and there is somebody in
  Noida, Rohini and Ludhiana.
- **The subscriptions cover all three tiers**, and the A-tier ones default to a
  CA. That matters more than it looks: a sample row that defaulted an employee
  onto an L3 service would make P2-4's enforcement look broken when it was
  working exactly as asked, so the test asserts `canExecute` for every row.
- **Nine engagements** across Scheduled, Awaiting documents, In progress, Under
  review and Completed — including one closed job, which is the fixture that
  shows access through an assignment lapsing rather than lasting for ever.
- **Three grants of different widths**, one expiring in three days, plus one
  deliberate absence: an employee who shares a branch with a client and has no
  way into it. That absence is the fixture behind acceptance check 1.
- **`scripts/doctor.js`** warns about any live employee or intern with no
  reporting CA, because `/me`'s "My senior CA" card has nothing to show
  without one.

- Tests: 33 new Vitest tests (615 total). Every PAN, GSTIN, CIN, mobile and
  email through the validator the firm's own forms use; the check digit proved
  by nudging it and watching the validator refuse; all three tiers present; no
  default assignee who is not allowed to do the work; no grant above its
  role's ceiling; and the deliberate absence still absent.

## What P2-3 built

**The hole that had been open since Step 1.** `mustChangePassword` was written
when a partner created an account, reset a password or imported the team — and
read nowhere. There was also **no way for anybody in the firm to change their
own password**, so a one-time password read out across a desk stayed that
person's password for good.

- **`/change-password`**, outside the `(app)` layout so there is nothing to
  loop against, and one unconditional redirect in the layout when the flag is
  set. The current password is required even though the session proves who they
  are: a session is a cookie on a machine that may be borrowed, and this is the
  action that replaces the thing only they know.
- **`/me`, for everybody.** An employee or an intern had nowhere in the app
  that answered "who is my senior", "what have I been given access to" and
  "how do I change my password", and the app answered none of the three. Now:
  the senior CA's name, email, mobile and branch (or "Not set — ask a
  partner", which is what `scripts/doctor.js` warns about); the grants they
  hold with the reason each was given; their open work, overdue count and
  rework; the articleship panel for an intern with an amber note near the
  leave limit; mobile, password and 2FA. **Mobile is the only field they can
  change** — somebody who can edit their own role has no role worth enforcing.
- **`/team`** — name, role, offices, reporting CA, open, overdue, awaiting
  their review, 2FA state, with filters and an Excel export. A CA sees their
  branches, a Partner the firm. An employee or intern is sent to `/me`.
- **`/team/[id]`**, the Employee 360, on the same folder tabs as a client:
  Profile · Work · Reviews · Clients & access · Activity · Admin, each tab
  filtered by permission. Work is grouped in pipeline order; Reviews shows a
  CA's queue and a maker's returned work as **a count beside a count, never a
  percentage**; Clients & access separates what the work on their desk opens
  from what somebody deliberately granted.
- **Offboarding** (owner decision D6) as a four-step checklist, because the
  first step is real work: somebody has to decide who picks up each engagement,
  and an A-tier job cannot land on an employee. Each row offers only people who
  may legally take it, worked out on the server, and goes through the same
  `reassign` action as everywhere else — so the wizard adds no new path into an
  engagement. The last step refuses to run until the list is empty, then
  deactivates, revokes every grant and soft deletes in **one** transaction.
  Nothing is hard-deleted: a firm that deletes the person also deletes the
  answer to "who prepared this return".
- **A demotion is now refused** while the person is still on work the new role
  could not do or review, naming the engagements. It would otherwise leave
  engagements nobody is allowed to touch.
- **`MobileNav`** shows four links and a More sheet, with the current page
  always among the four. It used to render every rail link — already the full
  width of a 390 px phone at nine of them, and the rail is going to seventeen.
- **`/settings/users` is a redirect to `/team`**; its five actions moved to
  `app/(app)/team/actions.js` and are still Partner-only (`usersSettings`, not
  `team` — a CA reads the records and changes nothing).

- Tests: 22 new Vitest tests (637 total) on the arithmetic, which is the part
  that goes wrong quietly — doing counted apart from reviewing, the statutory
  date preferred over the internal target, undated work never called late,
  finished work never called late however old its date, rework as two counts,
  ids compared as strings so an ObjectId does not read as nobody, and the
  assignment rules the wizard and the demotion guard both lean on. 6 new
  Playwright tests waiting on Atlas: the senior-CA card, an employee turned
  away from `/team` and the export, a one-time password getting no further than
  the change screen, a CA reading a record with no Admin tab and no offboarding
  screen, offboarding blocked by open work, and offboarding going through with
  the account dead, the grants revoked, the email reusable and the engagement
  still carrying their name.

## Page-load speed and the sample dataset (out of band, 21-10-2026)

Not a numbered step. The owner reported slow page loads and asked for sample
data across the whole app.

**Speed.** Three changes, measured on a cold `.next`: dev start 7.1s → 3.4s,
first load of `/login` 12.0s → 5.4s, `next build` 65s → 42s.

- `next dev --turbopack`. Webpack was recompiling each route on first visit.
- `experimental.optimizePackageImports: ["@phosphor-icons/react"]`. The barrel
  pulls 3,024 icon modules into every file that imports from it; Next does this
  rewrite by default for lucide and heroicons but not for Phosphor.
- `const sessionOnce = cache(auth)` in `auth.js`. `currentUser()` and
  `currentClientUser()` are called from 177 places and each call was decrypting
  the session cookie again. The database lookup behind them was already
  memoised; the decrypt was not.

Production bundles were never the problem (103–127 kB first load on every
route) and the per-page queries were already batched, so neither was touched.

**Sample data.** `scripts/sample.js` grew a second half:
invoices in all four states (part paid and overdue, paid, issued, draft),
two receipts with TDS, 6 files in the vault, 4 vault credentials, 10 notes and
comments, a client group, 5 notifications. `--drop-sample` takes every one of
them out again. `applyTotals` moved from the invoices server-action file to
`lib/billing/gst.js` so the script issues an invoice through the same code the
screen does, counter and all.

**One thing to look at:** the four branches had no GSTIN, and without one an
invoice can be drafted but not issued — so the script wrote an **invented**
firm GSTIN onto each branch that had none, printed it with a warning, and
`--drop-sample` removes it again if it is still untouched. Replace it with the
firm's real registrations in Settings → Branches. The SAC codes on the sample
invoice lines (998221 audit, 998222 accounts, 998231/998232 tax) are the
standard 9982-group codes and need the owner's confirmation; they were written
onto the sample invoices only, never into the service catalog.

**A bug found on the way.** `models/Client.js` declared the unique PAN index
with `pan: { $ne: "" }` in its partial filter. MongoDB accepts neither `$ne`
nor `$not` there and refuses to build the whole index, so PAN uniqueness has
never actually been enforced — `npm run doctor` had been reporting it. Now
`$gt: ""`, and the index builds.

Also: `npm run seed` and `npm run doctor` pointed at `.env.local`, which does
not exist in this checkout. Both now read `.env` first and `.env.local` after
it, if present.

## What P2-13 built

Three screens the owner asked for, and two holes found on the way.

**The group reads before the client.** The client list opens with a
**Group** column first, a group filter beside the others, and the group on
the Excel export. A new client cannot be saved without one — the form has
a picker that can also make a group on the spot, because being forced to
choose a group with nowhere to make one would leave the first client of a
new family unsaveable. Existing clients are untouched and stay editable;
the rule is on creation only (D18). The spreadsheet import gained a
**Group** column that names the group in words and creates it as the row is
written, matched without regard to case so "Sharma family" and "Sharma
Family" on two rows land in one group.

**The UDIN register says who signed, and shows the papers.** The signing
member is now required (D19), and the register filters by member with a
per-member tally across the year. *The hole:* the engagement filing panel
recorded the UDIN against whoever saved it, and against **nobody at all**
when that person was not a CA or a partner — so an employee entering a
filing created a register row the firm could not attribute. The panel now
has its own "Signed by" picker, and a new or changed number is refused
without one. Re-saving an acknowledgement number on work whose UDIN is
already recorded does not ask again.

Documents now carry a `udinId` (D20). Each register row expands into two
lists: what is attached to this UDIN — the signed certificate and the
client papers behind it, uploaded through the same gateway and signed links
as everywhere else — and, when the UDIN came out of an engagement, that
engagement's own papers underneath, read-only.

**Compliance opens on the heads.** A third view beside the calendar and the
status grid, and the one the page now lands on: one line per service under
the category the catalog gives it, tagged Monthly, Quarterly or Yearly,
with clients, created, done, open, overdue and **not created** for the
financial year. Every line opens the client-by-client grid behind it. A
**client partner** filter runs across all three views, and the grid now
names the client partner under each client.

*The second hole:* the heads rollup cannot be a MongoDB aggregation as the
code stands. The scope filters hold string ids, which `find()` casts and a
`$match` does not — a pipeline would have matched nothing and shown a clean
sheet to a CA with work outstanding. The year is read and counted in
memory instead, with a `ponytail:` note on the upgrade path.

"Not created" is worked out as one engagement per subscribed client per
closed period, less what exists; it reads one short per client who joined
mid-year. The grid behind each line is the exact answer, which is why every
line links to it.

## What P2-10d built

The last step of Phase 2. Three pieces, none of them large, and one of
them is deleting something.

**The rail, finished.** The five practice registers were reachable only
through Settings, where they never belonged — an audit book and a UDIN
register are daily work, not configuration. They are now a **Practice
group**: one rail entry that opens into Audits, Statutory, Tax, UDIN and
DSC, so the rail gains a line rather than five. The group opens itself
when you are inside it, and it is **absent for a role that may open none
of its registers** rather than present and empty. On a phone it is
flattened into the More sheet P2-3 added — an expandable tree inside a
bottom sheet is two taps where one will do. The Settings links stay: a
second way to reach something is not a bug.

**The doctor stopped keeping its own list.** `scripts/doctor.js` had its
own copies of the branch-GSTIN, due-date and zero-fee checks, written in
Step 12 — and P2-10b then wrote the same three again for the Settings
strip. The doctor now **reads `needsAttention()`**, so there is one list
and two readers, and a check added later appears in both. It keeps only
what has no screen: the vault probe, the transaction probe, the chain, the
reporting-CA warning, the CPE target, and how long the runner has been
alive, which a warning cannot say.

Three checks were added to the shared list while doing it, all Phase 2
conditions nothing was watching: **portal accounts that have never signed
in**, **open grants with no end date** (a grant nobody ends is a grant
nobody revokes), and **a client with a login but nothing shared** — a
portal that opens onto an empty room.

**The Phase 2 acceptance pass.** `docs/ACCEPTANCE.md` gains eleven rows in
the same shape as the Phase 1 ones: what the check is, exactly how to
perform it in a browser, and an honest mark. Every mark is 🟡. The
"before the firm relies on this" list now says 186 Playwright tests rather
than 56, and names the two portal suites as the ones to run first.

**And a sweep for leftovers**: `docs/DEPLOY.md` and `docs/REPORT.md` still
sent people to `/audit`, and `lib/permissions.js` still carried the note
about an employee recording DSC movements that owner decision D12 made
obsolete a step after it was written.

- Tests: 7 new Vitest tests (815 total) — the group's rule reproduced
  against the same permission helper the component calls: five registers
  for a partner and a CA, the readable ones for an employee, absent
  entirely for the accounts person, and never a register the role cannot
  open. Plus the shared check list covering both phases. 2 new Playwright
  tests: the group opening each register and staying open inside them, and
  an employee's narrower version of it.

## What P2-10c built

Eight reports, all from data the system had already been collecting and
nothing had ever read.

| Report | What it answers |
| --- | --- |
| Filing punctuality | What went in on time, what went in late, and by how long — P2-8a's `filedOn`, finally reported |
| Audit opinions | Every audit, its type and what the report said, modified ones counted |
| UDINs issued | What the firm signed this year, by member |
| Certificates expiring | DSCs soonest first, with whose they are |
| Work sent back from review | `reworkCount`, collected since **Step 5** and read by exactly one dashboard tile until now |
| Work by tier | A, B and C per person: who carries the senior jobs |
| Client access grants | Who can see a client they do not work on, and why |
| Client portal accounts | Who outside the firm can sign in, and whether they ever have |

- **Punctuality does not credit the firm with its own missing data.** Work
  filed against no recorded deadline is counted in a column of its own, not
  as on time — the due-date master leaves dates blank until a partner
  confirms the rule, and calling those punctual would flatter the firm with
  a gap in its own setup. The report says how many are in that state and
  where to fix it.
- **An audit with no opinion recorded is not a clean audit.** "Not
  recorded" and "Not yet issued" are counted separately from unmodified,
  which is the mistake the report exists to prevent.
- **Rework is shown beside the jobs each person finished**, because three
  sent back out of a hundred and three out of four are not the same thing
  and a bare count reads as if they were.
- **Each report sits behind its own permission area**, not a general
  reporting one: somebody who cannot open the UDIN register cannot read it
  as a report instead. A test asserts that for all eight.
- **Six headline figures** across the top of the index, each a link to what
  produced it, drawn from `lib/reports/figures.js` wherever a figure
  already existed so the strip cannot disagree with the dashboard. A figure
  behind a permission the reader lacks is absent, not blank.
- The index grows to five categories with a nav above them, and the
  printable set grows from three to five — a file review and a punctuality
  review both happen away from a screen.

**Still not built, for the same reason as before:** timesheet, utilisation,
realisation, client profitability and intern exposure. They need hours, and
nothing in Phase 2 records hours. The index keeps saying so.

- Tests: 8 new Vitest tests (808 total) — all eight registered and
  reachable, each with a real permission area and a runner, none clashing
  with a report that already existed, the registers behind their own areas,
  and the punctuality boundary (on the due date is on time, the next day is
  a day late, no deadline is no answer). One existing Step 10 test was
  updated: it pins which reports print, and two more now do. 1 new
  Playwright test: the figures, the categories, the four new screens
  opening and the punctuality export downloading.

## What P2-10b built

**"Needs attention", and why it had to exist.** Several settings screens
hide a condition that makes the app quietly wrong rather than visibly
broken: an unconfirmed due-date rule produces no deadline at all, a branch
with no GSTIN cannot issue an invoice, an unapproved template produces
nothing but drafts. Each of those is correct behaviour, and each is
invisible until somebody goes looking. Ten checks now do the looking, at
the top of Settings:

unconfirmed due-date rules · branches with no GSTIN · unapproved document
templates · gaps in the firm's own record · services with no fee or SAC ·
client email switched off · the job runner not heard from · failed jobs ·
sample data still in the database · accounts that have never signed in.

- **An item that counts zero is absent**, not shown ticked. A list of ticks
  is furniture; everything on this strip is worth doing today. When it is
  all clear it says so in one line.
- **Each check names the permission that lets somebody read it**, so nobody
  is nagged about a problem their role cannot fix — the accounts person is
  not told about audit templates, and an intern sees nothing at all. One
  test asserts that for every check against every role, so a check added
  later cannot quietly nag the wrong person.
- **A check that throws loses itself, not the screen.** The settings page
  500ing because a count failed would be worse than a missing warning.
- `needsAttention()` does **not** open its own connection — the page does,
  like every other page. A helper that connects cannot be tested without a
  database, which is how the first version of this failed its own tests.

**The sections.** Sixteen links in one column became five groups — the firm,
the work, the practice, messages, data and security. The practice group is
marked for P2-10d, which moves those registers into the rail: they are
daily work and they are in Settings only because there was nowhere else to
put them when they were built.

**The permissions table.** `describeMatrix()` was written in P2-1 for this
and has had nowhere to live since; it is now a read-only page under Data and
security. `MATRIX` itself stays private — an exported object is one
assignment away from a permission change nobody reviewed — so the page is
handed sentences. It states plainly that it cannot be edited here, because
spec §2 asks for configurable permissions and that screen still does not
exist.

- Tests: 11 new Vitest tests (800 total) — every check naming a real
  permission area and explaining itself; nothing shown when nothing is
  wrong; blocking items sorted above the rest; a throwing check skipped
  rather than fatal; the accounts person and the intern each told only what
  they can act on; and `describeMatrix()` covering every area for every
  role. 4 Playwright tests waiting on Atlas: the unconfirmed rule appearing
  on the strip and leaving it once confirmed, the five group headings, an
  employee seeing neither the items nor the admin groups, and the
  permissions table.

## What P2-10a built

**The rename (owner decision D8).** `/audit` is now `/portal-log`, and the
words change in the five places people read them: the rail, the command
bar, the heading, the page title and the Security settings link — plus four
sentences of prose elsewhere that said "audit log" to a user. **Nothing
underneath moved.** `AuditLog`, the `auditLogs` collection, `lib/audit/*`,
`ACTIONS`, the hash chain and the `auditLog` permission key are untouched,
because the log is append-only and chained and copying it would break
`verifyAuditChain()`.

**The redirects.** `/audit` and `/audit/export` keep working and carry their
query string with them, so a bookmark to "failed sign-ins last month" still
lands on that view. They are pages rather than middleware rules: middleware
runs on the edge and that bundle is already at 107 KB of Vercel's 1 MB.

**The bug inside the redesign.** The record-type filter was a **literal list
of seven** written in Step 2. The log had since gained entries for `Udin`,
`Dsc`, `DocTemplate`, `GeneratedDoc`, `ClientUser`, `ClientAccess`,
`Comment` and `FirmSettings` — **none of which could be filtered for**, so a
partner asking "who has been into the portal accounts" could not ask it.
The list now comes from `AuditLog.distinct("entityType")`, within the
reader's own scope, so it cannot go stale again.

- **Who** now offers portal accounts as well as staff, in two labelled
  groups. Since P2-9 a good share of entries are clients signing in and
  downloading their own documents, and none of them could be filtered for
  either.
- **Entries are grouped by Indian calendar day**, ruled off and labelled
  Today / Yesterday / the date. An entry at 4am IST belongs to that
  morning; grouping on the stored UTC date would file it under the day
  before, which is the usual trap and is what the test pins.
- **Five figures across the top** — entries, sign-ins, failed sign-ins,
  downloads, credential reveals — each a link to the filter that produced
  it, and the last two in red when they are not zero. They are the signals
  the Step 12 incident watch is tuned to, shown where somebody is already
  looking instead of waiting for a threshold.
- **Four quick filters**: Today, Last 7 days, Just me, Failed sign-ins.
- Deliberately untouched: the chain, the writer, the model, the permission
  key, and log retention — archiving to Atlas Online Archive is still the
  go-live task it always was.

- Tests: 13 new Vitest tests (789 total) — the record list carrying
  `ClientUser` and friends, still offering the familiar ones on an empty
  database, and de-duplicated and sorted; the day grouping at the IST
  boundary, named Today and Yesterday, newest first; the five figures and
  which two are alarming; and the quick filters' dates. Two existing
  Playwright tests now walk the redirect — `/audit` landing on the renamed
  screen, and `/audit?action=login_failed` keeping its filter.

## What P2-9b built

Six pages behind the door P2-9a built: overview, your work, documents,
invoices, account, your details.

**One helper, not six queries.** `lib/access/clientScope.js` turns the
portal session into the filter for every page. Six pages each writing
`{ clientId: person.clientId }` is six chances to forget, and the one that
forgets shows somebody another company's invoice. The id comes from the
session **record**, never from a URL or a form — a portal page does not get
to choose which client it is looking at — and the rules that are more than
the id live beside it:

- **documents**: `sharedWithClient: true`, and nothing else reaches the page.
- **invoices**: issued only. A draft is the firm thinking aloud about a
  number; a cancelled one is a mistake being corrected. Neither is a bill.
  Written off and disputed **are** shown: they were issued, and hiding them
  would make the client's statement disagree with the firm's.
- **engagements**: a projection, not a filter applied afterwards. The
  reviewer, the internal deadline, the rework count and the review notes are
  never read, so a page that forgets to drop one cannot leak it.

**The id in a URL is a guess until proved otherwise.** The document download
and the invoice PDF each check that the record is theirs *and* that it is
shareable, and answer **404 to all three failures** — not yours, not shared,
not there. A client learning that a document exists but is withheld is
itself a leak.

- **The invoice PDF is the firm's own**, through a new
  `lib/billing/invoiceView.js` lifted out of the staff route. Two renderers
  would be two chances for the client's copy to disagree with the firm's,
  and the client's copy is the one that ends up in somebody else's accounts.
  The ledger likewise runs the firm's own `buildLedger()`, so the balance
  agrees to the paisa.
- **The change request changes nothing.** A GSTIN the client retyped and
  nobody checked goes onto invoices and into returns, so `/client/profile`
  is read-only and the box beneath it writes a `Comment` of the new kind
  "Change request" with `internal: false` — the one place in the system
  that sets that by hand — and notifies the client partner and the
  relationship manager. It is the only write a portal account can make
  anywhere.
- **No upload from the portal**, deliberately: the document-request link
  from Step 6b already does that with its own token and its own narrow
  scope, and a second way into the same vault is a second thing to get
  wrong. No payment either — there is no gateway.
- Downloads by a client are audited against the portal account, so "who
  took a copy of this" has one answer whether it was staff or the client.
- The overview answers the three questions in the order a client asks them:
  what are you doing for me, what are you waiting for from me, what do I
  owe. The waiting list shows **only the client's own side** of a checklist
  — an item the firm owes itself read as a demand on the wrong person.

- Tests: 14 new Vitest tests (776 total) — the scope helper refusing a
  staff session, an empty one and a forged kind; every scope anchored to
  the session id; drafts and cancelled invoices out and the awkward ones
  (written off, disputed) in; another client's record refused by
  `belongsToClient`; and the engagement projection proved twice over, once
  on the shape it returns and once on the field list it never reads. 4
  Playwright tests waiting on Atlas: the unshared document absent from the
  page and 404 by id, a draft invoice and another client's invoice both 404
  while their own returns a PDF, the ledger balancing to the issued invoice
  alone, and a change request landing on the staff side with the client
  record untouched.

## What P2-9a built

The first login in this system that belongs to somebody outside the firm.
Almost all of the work is containment.

**A portal account is a separate collection, not a role.** A role is one
careless matrix row away from reaching a staff screen; `clientUsers` cannot
be given one at all. **One account sees one client** — somebody who runs two
companies gets two logins, because a join table is the moment one company
becomes visible from the other by accident.

**Four independent locks sit between a portal token and a staff screen**, and
none of them is the only one:

1. `can()` refuses `kind: "client"` on its first line (P2-1), tested against
   every area in the matrix including ones added later.
2. `currentUser()` now refuses the kind **explicitly**. It would have failed
   anyway — the id belongs to another collection — but a check that works by
   accident is one refactor from not working.
3. The `(app)` layout turns away anybody `currentUser()` will not vouch for.
4. The `(client)` layout does the same in reverse, so a member of the firm
   reaching `/client` lands on the portal's login screen.

**Middleware still does not read the JWT.** Deciding staff-or-client at the
edge means verifying the token there, which drags the auth config and
Mongoose into the edge runtime; the middleware bundle is already 107 KB
against Vercel's 1 MB. So it does one thing — sends a signed-out visitor to
the right front door, `/client/login` under `/client` and `/login`
everywhere else — and the layouts decide the rest against the database, on
every request.

- **A challenge cannot cross between the two flows.** Both are signed with
  the same key, so a portal challenge is prefixed `client:` and the staff
  provider refuses any id containing a colon. Neither can be replayed as
  the other.
- **2FA is optional for clients** and off by default (the firm turns it on
  per account), which is exactly why the lockout matters more here: the
  same five-and-fifteen as staff, through the `lib/security/lockout.js`
  written in P2-1 for this second caller. The failure message differs —
  staff are told to ask a partner, a client has nobody in the firm to ask
  by name.
- **Nothing is shared by default.** `sharedWithClient` is false on every
  document that exists, so switching the portal on reveals nothing until
  somebody ticks something. **Only a CA or a partner may tick it**:
  everything else on that screen an employee may do on their own work, but
  this one sends the firm's material outside the firm.
- **A closed account stops at once**, not when its session expires —
  `currentClientUser()` reads the record live on every request, the same
  stance `currentUser()` takes.
- The invited password is a one-time one, shown **once** on screen to be
  read out, and the portal opens nothing until it has been changed.
- `/client` itself is one page saying what is there and what is coming: the
  work, documents, invoices, ledger and change request are P2-9b. An empty
  frame of tabs that do nothing would be worse.
- The sample dataset gains one portal login, printed by the seed.

- Tests: 10 new Vitest tests (762 total) — the session shape
  `currentClientUser()` actually returns, failing every area, and failing
  again with a staff role and a branch bolted on; the record's defaults
  (password must change, 2FA not required, hash and secret never selected,
  one client, one account per email); a document unshared by default; and
  the lockout against the portal's own collection. 7 Playwright tests
  waiting on Atlas, and they are the point of this step: a client signing in
  and landing in their own portal, the same client turned away from eight
  staff screens and two exports, a staff session refused at `/client`, an
  account closed mid-session stopping on the next request, a wrong password
  and a missing account answering identically, and a partner creating an
  account and seeing the password once.

## What P2-8c built

The Word button, and the reason it had to exist: a letter is nearly always
edited before it is sent — a paragraph for this client, a figure typed into
a certificate's blank — and a PDF cannot be. Without this the firm would
retype the letter it just generated.

- **`docx` is the second dependency Phase 2 has added** (owner decision
  D16). The alternative was about 120 lines of hand-built WordprocessingML
  over `fflate`, which is already in `node_modules`. The deciding argument
  was not size: whether Word opens the file is the one thing that cannot be
  tested on this machine, and a library's output is known-good.
- **Both formats now come off one `prepareRender()`** in
  `lib/docs/render.js`. The PDF route had its own copy of the loading, the
  permission check and the footer; a second copy in the Word route would
  eventually have answered the permission question differently, which is the
  copy that matters. The PDF route is now 40 lines.
- A final prints its stored words in Word exactly as in the PDF; a draft
  resolves live, says DRAFT on the page, and lists its blanks at the foot.
  Both downloads are audited, and the audit note says which format.
- **Downloading an issued letter as Word hands somebody an editable copy of
  a signed document.** That is what was asked for; what the file does about
  it is carry its issue date and UDIN in the footer, so an edited copy is
  visibly a copy. Flagged rather than solved.

- Tests: 3 new Vitest tests (752 total) — every starter template rendered to
  Word without throwing, and the first one unzipped to prove it is a real
  zip with `word/document.xml` where Word looks for it, carrying the
  client's own name and no draft marking; a draft checked the other way,
  for its DRAFT text and its blanks. 1 new Playwright test: the issued
  letter downloaded, with the Word content type and a zip on the end of it.
- **Two sample files were generated and are worth opening**, because no test
  here can prove Word itself is happy:
  `C:\Users\sachi\AppData\Local\Temp\claude\C--code-crm\dde93875-98e6-4992-aa20-aca7d7657c96\scratchpad\ENG-LETTER.docx`
  and
  `C:\Users\sachi\AppData\Local\Temp\claude\C--code-crm\dde93875-98e6-4992-aa20-aca7d7657c96\scratchpad\NETWORTH-CERT.docx`.

## What P2-8b built

The letters a firm writes a hundred times a year, written once.

**No file is stored anywhere.** A final document holds its own words and the
PDF is rendered from them on demand — the way an invoice's PDF is rendered
from the stored figures rather than kept on a disk. That makes a signed
letter reproducible byte for byte with no second copy to keep in step, and it
avoids inventing a server-side write to the file gateway, which only ever
takes uploads from a browser with a signed ticket. A **draft holds no words
at all**: it re-resolves from live data every time it is opened, because a
draft that had quietly gone stale is the one thing worse than no draft.

**A template nobody has approved cannot sign anything.** The eight that ship
produce watermarked drafts and nothing else until a partner reads the wording
and approves it, and **editing an approved template takes the approval away
again** — the approval is of a wording, not of a name on a list. This is the
stance the due-date master takes toward an unconfirmed rule (CLAUDE.md rule
8), applied to words instead of dates.

**Nothing sensitive can reach a letter.** `lib/docs/resolve.js` holds a closed
list of the fields a template may use, built field by field. A PAN, an
Aadhaar or a portal password is not among them, so no template — however it
is written, whoever writes it — can print one (CLAUDE.md rule 7). The field
list is printed under the editor so nobody has to guess.

- **A blank is never silent.** A field the record does not have renders as
  `[Client GSTIN — not recorded]`, is reported above the draft, is boxed in
  red on the draft PDF, and **stops the document being issued** until it is
  filled in on the record. A letter that went out with an invisible hole in
  it would not be noticed until the client noticed.
- **An unknown placeholder stays on the page** exactly as typed, so a typo in
  a template is obvious to the first person who reads a draft rather than
  vanishing. Issuing refuses outright while one is there.
- **Issuing follows P2-4's ladder, not a new one**: a partner issues an
  A-tier job's letters, a CA the rest, and a document with no engagement
  behind it is treated as A-tier because nothing said it was routine. Three
  templates — the two letters to another member and the consent — are a
  partner's whatever the work is tiered at, and the net worth certificate
  additionally refuses to issue without a UDIN on the engagement.
- **An issued document cannot be discarded.** A draft can; a final was sent,
  and the record of having sent it is the point.
- Downloads are audited like any other document, and the PDF carries the
  template code, the issue date and the UDIN in its footer.

**About the eight templates.** They are drafted plainly and **every one is
unapproved**. The wording is not an ICAI pro forma and does not pretend to
be: the communication with a previous auditor, the NOC and the consent to act
carry professional obligations whose form is the firm's to settle, and each
row carries a `sourceNote` saying so that the approval screen prints. Nothing
in any of them quotes a section number or a statutory date, which a test
enforces.

- Tests: 23 new Vitest tests (749 total) — the resolver (a blank marked and
  reported, the same blank reported once, an unknown placeholder surviving
  untouched, spaces inside the braces), that no field on the closed list is
  sensitive and a PAN cannot come through a context, the tier and UDIN rules
  for issuing, and the eight templates themselves: eight codes, none
  approved, no placeholder that does not exist, no section numbers — and
  **all eight rendered to a real PDF**, because a layout mistake in the
  renderer is a crash at the moment somebody prints. 4 Playwright tests
  waiting on Atlas: a draft filling itself in from the record, an unapproved
  template refusing a partner, a CA seeing no approve button and still unable
  to issue A-tier work after approval, and an issued document that cannot be
  discarded.

## What P2-8a built

Three questions a practice is asked constantly, none of which the system
could answer: what have we signed and was the opinion clean, what is going to
the Registrar and when did it go, which returns are in and which went in late.

**The system did not know when anything was filed.** It knew when work was
*completed* — the day the firm signed it off — which is a different date, and
the only date a return's lateness can be measured from. `filedOn` is that
date, and **late is never stored**: it is `filedOn` against `statutoryDue`, in
whole IST days, computed every time it is shown. Correcting a due date
therefore corrects every answer that depended on it, and a return filed at
11pm on the deadline is on time, which a stored flag written at midnight
would get wrong half the time.

**An audit's opinion was nowhere.** `assurance` holds the audit type, the
appointment and report dates, the opinion and — required for anything but an
unmodified one — what it is modified for. A report that was not clean, with
nothing in the file saying why, is what a peer reviewer asks about first, so
the form refuses to save it. The **signing member is deliberately not a field
here**: a UDIN is already recorded against a member in the register (P2-7),
and the books read it from there rather than keeping a second copy free to
disagree.

**The books are views, not records.** `/practice/audits`, `/practice/statutory`
and `/practice/tax` are one route over `lib/practice/books.js`, which says
which service categories each book reads and which columns it shows. They run
the engagement list's own `engagementQuery()`, so the scoping is the list's
scoping: an employee sees their own work and a CA their branches, and a
register can never show somebody work the list would have hidden. Closed work
stays in — an audit signed in June belongs in the book for ever — and the year
is the Indian financial year, as everywhere else.

- **One panel, one action.** The filing details are recorded where the work
  is, on the engagement, in the panel that already took the acknowledgement
  number and the UDIN. The assurance block appears for audit services only —
  and the server reads those fields only for audit services too, so a hand-
  posted form cannot write an opinion onto a GST return.
- **A filing date in the future is refused**, on the server as well as by the
  input's `max`. It is the one date somebody types while looking at a calendar
  for the wrong month.
- Both counts at the top of a book — past the deadline and filed late — are
  links to the rows they counted, and are **absent when they are zero**.
- The export is the same query and the same row builder as the screen, so the
  workbook cannot disagree with the page, and it is audited like every other
  export.
- The engagement header carries a line into whichever book it appears in, for
  anybody allowed to see it.
- The sample dataset gains one genuinely late GST filing, an ROC annual
  filing with an AGM behind it and a deadline already passed, and an audit
  under way with no report yet — so all three books have something true to
  show the first time they are opened.

- Tests: 24 new Vitest tests (726 total). Most of them are the "late"
  arithmetic, because it is arithmetic on two hand-typed dates that the firm
  has to be able to trust: on the day itself and at 11pm on the day itself are
  both on time, a missing due date answers nothing rather than accusing
  anybody, and a cancelled engagement with a date behind it is not a missed
  deadline. Also that no category falls into two books, that every book's
  columns exist, and that the sample data's own opinions would pass the
  check. 3 Playwright tests waiting on Atlas: a return filed three days late
  reaching the Tax book and the count filtering to it, a qualified opinion
  refused without a reason and accepted with one, and a future filing date
  refused.

## What P2-7 built

Two registers the firm is expected to be able to produce, and neither existed.

**The UDIN register.** Spec section 16 requires a UDIN against every
certificate, audit report and attestation. Until now there was **one
free-text field on an engagement**: the same number could be typed against
two jobs with nothing noticing, a certificate issued outside any engagement
had nowhere to live, and "what have we signed this year" had no answer at all.

- `models/Udin.js`, one row per number, with the client, the engagement where
  there is one, what was signed, the date — and **the member it was generated
  against**, because a UDIN belongs to a member's own membership and not to a
  firm. The membership number is snapshotted, so the row stays readable after
  somebody leaves.
- **The register is the record; the engagement's field is a copy of it.** Both
  are written in the same transaction as the audit entry (CLAUDE.md rule 2),
  through `lib/practice/udin.js`, whichever door the number came in by — the
  filing panel on an engagement or the register screen.
- **A number already recorded against other work is refused, by name.** A
  unique partial index backs the check, so two people saving the same number
  at the same moment cannot both win: the second loses at the database rather
  than both appearing to succeed.
- Clearing a UDIN on an engagement **unlinks the row rather than deleting
  it**, with a note saying so. A number generated on the portal exists
  whether or not we still think it belongs there, and deleting the row would
  destroy the firm's only record of having signed something.
- Revoking is a state, not a deletion: the row stays, struck through, with
  the reason and the date. Somebody reading an old file needs to see both the
  number and that it was withdrawn.
- **Nothing here generates a UDIN.** The portal does; this records what it
  gave. The 18-character shape is checked and nothing more.

**The DSC register** — **expiry only** (owner decision D12). The firm does not
hold clients' tokens, so there is no custody and no movements log, and P2-1's
permission note about an employee recording movements is now obsolete. One
question answered: whose certificate is about to run out.

- `models/Dsc.js` — the holder (a person, not the company: a company's filings
  are signed by a director's certificate), their role, the class, the
  certifying authority, the dates, and one `heldBy` fact. Sorted by what
  expires first, which is the only order anybody wants it in.
- **No PIN, ever.** A PIN is a credential and CLAUDE.md rule 7 puts those in
  the encrypted vault, not on a register half the firm can read. The screen
  says so, so nobody adds one to the note field.
- The same person's certificate with the same expiry twice is refused: that is
  somebody entering it again, and a register with two of everything is read by
  nobody.
- **A `dscExpiring` rule** in the same shape as every other reminder — the
  firm sets the notice periods (30 and 7 days to start), and it goes to the
  client partner and the client's own CA. **Internal, by design**: the firm
  cannot renew a client's certificate for them, but being the one who noticed
  is the service. It fires on each notice period and once on the day itself,
  then stops — a daily email about a certificate that has already lapsed is
  noise, and the register shows it in red for as long as it sits there.
- **A dashboard tile** for a partner and a CA, counted within their own
  branches and linking to the filter it counted. It is **absent when nothing
  is expiring**: a tile reading zero that never moves is furniture.
- The register filters to one client, and the client's own case file carries a
  line into it — a count and the next expiry, not a second copy of the list.

**Sample data**, the piece P2-2b deferred here: two certificates (one inside
the month, so the tile and the reminder both have something real to act on),
one UDIN against the completed engagement, and **membership numbers for the
two sample CAs**, which the ICAI screen from P2-6 had nothing to show without.

- Tests: 22 new Vitest tests (702 total) — the UDIN shape accepted and four
  ways refused; the expiry boundary (the thirtieth day out is "soon", the
  thirty-first is not, and a certificate is never called expired while it is
  still good); a reminder on each notice period, silence on every other day,
  once on the day itself, and **silence for ever after it lapses**; the rule
  switched off planning nothing; the composed message being `team` audience so
  it is never held back with client email; and the sample rows' own
  consistency, including that the seeded UDIN sits on work that is finished.
  8 new Playwright tests waiting on Atlas (4 × 2 projects): a UDIN typed on an
  engagement appearing in the register with the member's number snapshotted,
  **the same number refused on a second engagement with nothing half-written**,
  a revocation keeping the row, and a certificate added, refused as a
  duplicate, then counted on the dashboard and opened from it.

## What P2-6 built

Until now **the firm had no record of itself.** Its name was a literal in
fifteen files, its ICAI registration number was nowhere at all, and the
document retention period spec section 6 calls "configurable in settings" was
a number in the source.

- **`FirmSettings`: one document, for ever.** Who the firm is as a client sees
  it (name, the line underneath, PAN, head office, phone, email), its ICAI
  record (FRN, constitution, peer review validity, the firm's own notes), the
  CPE targets, and the retention period. `key: "firm"` is unique, so an upsert
  cannot fork into two. Read through `firmProfile()`, cached for a minute like
  the notification rules, and **it never throws**: no document, or no database
  at all, returns exactly what the app said before this screen existed. A
  blank letterhead on a tax invoice is not an option.
- **A blank the firm chose is respected.** Clearing "Chartered Accountants"
  means no second line; only the name itself refuses to be empty. The first
  version of `withDefaults()` filled empty strings back in, which made the
  PDF's own check for a cleared tagline dead code — found by writing the test.
- **Wired into what the firm sends out**, not merely stored: the invoice PDF
  (which now also prints the FRN when there is one), the report PDF, the author
  of every Excel export, the DPDP dossier's title, the public upload page a
  client sees without signing in, and the signature of every email — the
  templates already filled `{placeholders}`, so "PHMG & Associates" became
  `{firm}` and `compose()` supplies it in one place. **Two things stay
  hardcoded on purpose**: the authenticator-app issuer, because changing it
  would confuse every enrolled phone for no gain, and the browser tab title.
- **`User.icai`** — membership number, ACA or FCA, admitted on, and whether
  they hold a Certificate of Practice and from when. Separate from
  `articleship`, which is the intern's side: one is somebody qualifying, the
  other somebody qualified, and nobody is both at once.
- **The CPE log** as entries on the member (date, hours in halves, structured
  or unstructured, programme, organiser) — a subdocument rather than a new
  collection, because a member logs a couple of dozen a year and they are
  always read with the person.
- **Settings → ICAI**, following the permissions P2-1 already set: everybody
  reads the firm's half (it is the letterhead, and somebody filling in a form
  needs the FRN without waiting for a partner to come out of a meeting); a CA
  keeps their own membership and hours; a Partner keeps everybody's; the
  accounts role has no business here at all. The new `firmProfile` permission
  area is the one P2-1 said would arrive with this model.
- **No ICAI requirement is assumed anywhere** (CLAUDE.md rule 8, and the
  owner's decision of 19-10-2026). The CPE targets are the firm's own figures,
  entered by a partner. Until they are, every year reads **"not set"** — never
  a cross, because an unanswered question is not a failure and marking it as
  one would have people chasing hours nobody has asked them for. The firm also
  says whether its CPE year runs January–December or April–March; the rest of
  the app runs April–March, but a CPE block is the ICAI's year, not the tax
  year.
- **`scripts/doctor.js`** now warns when the firm's record has never been
  saved, when there is no FRN, and when no CPE target is set.

- Tests: 18 new Vitest tests (680 total) — the defaults when there is no
  document, a stored blank kept blank, a nameless firm refused, a field the
  stored document has never heard of, the CPE year on both bases including an
  entry made at 23:30 IST on 31 December, structured and unstructured totalled
  apart, a year left unjudged until a target exists and then judged with what
  is short, an entry with no kind counted as structured, and `{firm}` reaching
  a composed email with and without a caller supplying it. 6 new Playwright
  tests waiting on Atlas (3 × 2 projects): a partner recording the FRN and
  watching the "no CPE target" warning go away, a CA keeping their own log and
  seeing nobody else's with the firm's half read-only, and — the one that
  matters — renaming the firm and reading the new name back out of a generated
  Excel file, which is the surface that can actually be checked (a PDF's text
  streams are compressed).

## What P2-5 built

The case file answers three questions it could not answer before: how much of
each thing there is, what the client owes, and which periods nobody filed.

- **A count on every divider** (`FolderTabs` takes one): open engagements,
  files, unpaid bills, notes, people with access. Each count runs the **same
  query, narrowed the same way**, as the tab behind it — including the
  engagement-scoped narrowing, so an employee's "1" is the one job they can
  reach and not the firm's view of the client. Overview, Compliance and
  Activity carry no number: an audit log has no meaningful total, and a count
  that means something different on each tab is noise. **Counted only for the
  tabs that person can open**, so a number never reports the size of something
  they may not look at.
- **Outstanding in the header**, for anybody who may see billing, with the
  overdue part said separately and the date it has been overdue since — ₹2 lakh
  outstanding on this month's bills is a business; ₹2 lakh overdue since June
  is a problem. The arithmetic moved into `outstandingSummary()` beside the
  rest of the money code: credit notes never reach it, and TDS counts as paid,
  because a client who pays 90% and deducts 10% has settled the bill.
- **The Compliance tab, filled.** The client's services down the side, periods
  across the top, one financial year at a time with the last three offered. The
  services are the ones they subscribe to **plus** any service they have work
  against that year, so a subscription stopped in November does not erase April
  to October. **One grid per recurrence**: a monthly return and an annual audit
  cannot honestly share twelve columns, and stretching one over the other's
  periods would invent holes — the one thing this screen must not do.
- **`components/compliance/StatusGrid.jsx`** — the firm's grid from Step 7c and
  this one are now the same component, differing only in what goes down the
  side (`buildGrid` takes a `keyOf`). The colours, the arrow keys and above all
  the mark that means *nothing was ever created here* cannot come to mean two
  different things on two screens.
- **"Who works on this client"**, the half of the Team & access tab deferred
  from P2-2: the client partner, the relationship manager, and everyone holding
  open work, with how much each is doing and reviewing. **Derived from the
  engagements, not stored** — handing work over is the act that changes this
  list, and a second copy of that fact would be a second thing to get wrong.
- **Somebody who reaches a client through their own work gets no grid**, and is
  told why: they would see every period they are not on as a hole, and a grid
  whose empty cells mean two different things is worse than no grid.

- Tests: 8 new Vitest tests (662 total) — the grid keyed by service instead of
  client, counting a service's holes the same way, and still keying on the
  client when nothing says otherwise; the balance arithmetic with a mix of late
  and current bills, TDS settling a bill in full, the oldest due date kept
  rather than the last one read, an undated bill owed but not late, and zero on
  an empty list. 8 new Playwright tests waiting on Atlas: the header's figure
  and its overdue line, a divider's count matching the rows behind it, the
  Compliance tab showing April filed, **May never created** and June in hand
  with the hole counted in words, and an employee on the work getting the
  explanation instead of a misleading grid.

## What P2-4 built

The A / B / C hierarchy (owner decision D4) stops being a label on a settings
screen and becomes the thing the server enforces.

**The letters are a presentation layer.** `L1`, `L2` and `L3` are still what
every `serviceTemplates.level` holds and what every engagement copied into its
snapshot; `TIER_OF` / `LEVEL_OF` in `lib/services/catalog.js` are the only
place the two meet. Nothing was migrated, so no work already under way was
touched for a relabelling.

- **`TierBadge`** — the letter in a ruled box, with the tier's whole rule as
  its accessible name. **Colour and the letter, never colour alone**: a brass
  square on its own is unreadable to about one reader in twelve. It is on the
  engagements list, the board cards, the engagement header, Today, the client's
  work and services, `/me`, the Employee 360 and the catalog, and the tier is a
  column in the engagements Excel export.
- **A tier filter on the engagements list**, which reads
  `templateSnapshot.level` and not the template — so a service re-tiered last
  month does not retrospectively re-tier work already in flight. Indexed with
  the status.
- **Per-step `minRole`.** A service can now carry a step stricter than itself:
  an employee prepares the audit file and "Sign the report" is a CA's. Set in
  the catalog, copied into each engagement's tasks like everything else, and
  it bumps the template version, because changing who may do a step changes
  what the work is. Empty inherits the service's `minExecRole` — which is what
  every step and every task created before P2-4 holds, so nothing in flight
  behaves differently.
- **`assignTask`.** `tasks[].assigneeId` has been on the model since Step 5a
  and no action ever set it: the field existed and the feature did not. A step
  can now be given to one person, and only to somebody who may do it — a step
  nobody may do is a step nobody may be given.
- **Bulk "Approve selected"** (owner decision D5), offered only to a checker,
  only for routine (C) work, and only from a status that can reach Completed.
  **It skips no rule whatsoever**: it loops `changeStatus(id, "Completed")`, so
  each engagement separately still refuses self-approval, refuses a reviewer
  who is not the named one, demands every mandatory checklist item verified,
  every review point ticked and a UDIN where the service needs one — and each
  sign-off writes its own audit entry. What is faster is that the CA presses
  one button instead of twelve; what comes back names every row that would not
  go through and why. Capped at 25 a press (`BULK_APPROVE_LIMIT`), because the
  audit chain is serialised through one counter document.
- **Tier counts per person**, deferred here from P2-3: A · B · C beside the
  open count on the team list, the Employee 360 and the team export. Three
  counts and not a weighted score — "busy" and "carrying the crucial work" are
  different sentences, and one index would hide the second.

**The four enforcement gaps.** The brief's list was reconstructed from the
code, so say if one of these is not the fourth you meant:

1. **An A-tier job could be signed off by a CA.** `checkStatusChange` demanded
   a CA or a Partner and never read the tier's own `minReviewRole`.
   `checkAssignment` stops a CA being *named* as reviewer of an L3 service, but
   an engagement with **nobody named** could be completed by any CA. The tier's
   rule is now checked on the actor, so A-tier waits for a Partner.
2. **Any step was tickable by anybody who could edit the engagement**, so
   "Sign the report" was tickable by the intern who collected the data. Every
   tick and every per-step assignment now goes through `stepFloor()`.
3. **The recurring generator trusted stale defaults.** A subscription's usual
   people were legal when somebody chose them, but a default goes stale: the
   person is demoted, or the service is raised to A-tier. The generator now
   checks before it assigns and, when the default no longer qualifies,
   **creates the work unassigned and records why** — the same discipline as an
   unconfirmed due date. The job appears on time; who does it waits for a
   person. Assigning somebody who may not do the work would make every later
   check a lie.
4. **A stale default was invisible until generation day.** The client's
   services list now says which subscription names somebody who may no longer
   do the work, and raising a service's bar warns on save, naming the clients
   to go and fix. The save stays on the form when there is a warning to read.

- Tests: 17 new Vitest tests (654 total) — the letter/level mapping both ways
  and its refusal of anything that is not a tier; a CA refused on A-tier work
  with a reviewer named and with nobody named, and a Partner allowed; a
  snapshot that says nothing still behaving exactly as it did before P2-4; the
  step floor inheriting, overriding and surviving a snapshot that is missing;
  the step's role copied into the engagement's tasks; a step's role bumping the
  version; the tier filter reading the snapshot and ignoring a level handed to
  it as a tier; and the per-tier counts, including that finished work is
  nobody's load and work with no snapshot is not guessed at. 8 new Playwright
  tests waiting on Atlas (4 × 2 projects): an employee ticking the step that is
  theirs and refused the one that is not, a CA-only step offering only seniors,
  A-tier refusing a CA with nobody named as reviewer, and the batch sign-off
  offered for one C-tier row, withdrawn the moment an A-tier row joins the
  selection, and going through with the work signed off by somebody other than
  the person who did it.

## What Step 0 built

- Next.js 15.5 App Router, JavaScript, Tailwind v4, import alias `@/*`
- `app/globals.css`: all 10 colour tokens from spec §15 in both themes, 8 px grid, 6 px radius, 12–40 px type scale, paper grain, ledger ruling, brass focus ring, reduced-motion rule
- Fonts via `next/font`: Fraunces (display), IBM Plex Sans (interface), IBM Plex Mono (codes and figures)
- App shell: collapsible left rail, top bar (branch switcher, command-bar slot, quick-add, notifications, profile), brass hairline, phone bottom nav, theme and density toggles that survive a reload
- `app/(app)/today`: the three ruled columns and the statutory ledger line, empty
- `app/(auth)/login`: route placeholder
- `lib/money.js` (integer paise, `Intl.NumberFormat('en-IN')`), `lib/dates.js` (UTC storage, IST display, April–March financial year), `lib/db.js` (cached Mongoose connection)
- ESLint, Prettier, Vitest, Playwright, `.env.example`, `vercel.json` pinned to `bom1`
- Tests: 14 Vitest unit tests (money, dates), 5 Playwright tests run on both laptop and phone viewports — all passing; `next build` clean

## What Step 1 built

- `lib/permissions.js`: the whole spec §2 matrix in one place — level (none/view/edit/approve) plus scope (all/branch/team/assigned/own), with `can()`, `assertCan()` and `branchFilter()` for queries. 40 tests cover it.
- `lib/crypto.js`: scrypt password hashing and AES-256-GCM field encryption, both from Node's own crypto — no third-party library on the security path.
- `lib/twoFactor.js`: mandatory TOTP. Sign-in is two steps (password, then code) joined by a signed 5-minute challenge, so the password never waits in the browser. Codes cannot be replayed.
- `models/Branch.js`, `models/User.js` and a reusable soft-delete plugin that hides deleted records from every ordinary query.
- `auth.js`: Auth.js with JWT sessions, 30-minute idle timeout. No database adapter — with email/password/TOTP and users in our own collection it would have been dead weight.
- `middleware.js`: signed-out visitors are redirected to login and sent back where they were going.
- Login screen with first-time 2FA enrolment (QR code plus a typed-key fallback).
- Partner-only Settings → Team: add people, set role/branches/reporting CA, reset password, reset 2FA, deactivate. Interns get the articleship fields.
- Role-aware navigation: the rail only shows what a role may open, and every page and action checks again on the server.
- `scripts/seed.js`: the four branches and the first partner account, safe to run twice.
- Tests: 58 Vitest (40 of them on the permission matrix), 8 Playwright on the sign-in gate, plus 6 more covering the full sign-in flow that skip until `MONGODB_URI` is set.

## What Step 2 built

- `lib/audit/index.js`: `withAudit()` opens the transaction a change and its audit entry share, and `recordAudit()` appends an entry. There is no path that writes data without a log.
- `lib/audit/hash.js`: the tamper-evidence chain. Each entry hashes the one before it, so an altered entry, a resequenced one or a deleted one is detectable, and the break's position is reported.
- `models/plugins/audit.js`: attached to every model, so `save()` and `findOneAndUpdate()` write their own field-level before/after entry inside the caller's transaction. Deliberately does **not** cover `updateMany` — it cannot say which records it touched — so bulk actions must loop.
- `lib/audit/diff.js`: builds `{ field: [before, after] }`, redacting PAN, Aadhaar, passwords, bank details and 2FA secrets to `•••` (CLAUDE.md rule 7) and dropping bookkeeping noise like `updatedAt`.
- `lib/audit/context.js`: carries the actor, IP address and browser for the whole request using Node's AsyncLocalStorage, so no function has to pass them down and none can forget.
- `lib/audit/describe.js` + `components/audit/ActivityFeed.jsx`: entries as plain sentences ("Riya changed status from In progress to Under review"), ready to drop into the Activity tab on clients, engagements and invoices.
- `/audit`: the firm-wide log, filterable by person, action, record type and date range, with a **Check for tampering** button that re-hashes the chain on demand. Partners see the firm; a CA sees their own branches.
- Export to CSV (opens in Excel), and the export is itself logged.
- `models/AuditLog.js`: every update and delete path is blocked in the application, and the entry schema carries `seq`, `prevHash` and `hash`.
- Step 1's `TODO(step-2)` markers are filled in: user created, role changed, account activated/deactivated, password reset, 2FA reset — plus sign-in, failed sign-in and sign-out.
- Tests: 23 new Vitest tests (81 total) covering the chain against editing, resequencing, deletion and re-hashing, plus redaction and the sentence builder. 4 more Playwright tests waiting on Atlas.

## What Step 3 built

- `lib/validators.js`: PAN, GSTIN, TAN, CIN/LLPIN, Udyam, IEC, Aadhaar, mobile, IFSC. **GSTIN and Aadhaar check digits are verified properly**, not just the shape — a GSTIN with one mistyped character is caught at the keyboard, and so is a transposed pair of Aadhaar digits. A PAN whose 4th character disagrees with the entity type is flagged as the wrong PAN pasted in.
- `models/Client.js`: the full profile from spec §3 — identity, statutory IDs, embedded contacts / GSTINs / addresses / fee agreements, firm side, classification, commercials, status. Aadhaar stored encrypted with only the last four digits in the clear.
- `models/ClientCredential.js`: the vault, in its own collection so it never loads with the client; passwords and notes encrypted, `select: false`.
- `models/ClientGroup.js` and `models/Comment.js` (notes + communication log, reused for engagement comments in Step 5).
- `lib/clients/validate.js`: **one validator shared by the form and the import**, so the import cannot accept what the form would reject.
- `lib/clients/duplicates.js`: PAN and GSTIN clashes block; a shared mobile or identical name warns. Soft-deleted clients are included, so a PAN sitting on a deleted record is explained rather than causing a database error.
- `/clients`: list with search across name, code, PAN, GSTIN and mobile, filters, paging, CSV export.
- `/clients/new` and `/clients/[id]/edit`: the onboarding form with live duplicate checking as the PAN or a GSTIN loses focus.
- `/clients/[id]`: the case file with folder tabs — Overview, Notes and Activity are live; Engagements, Documents, Invoices and Compliance say which step fills them.
- Credentials vault UI: reveal-on-click, the revealed password clears itself after a minute, and every reveal writes an audit entry naming the person.
- `/clients/import`: download a template, upload a CSV, see a row-by-row preview with every problem named, then import only the good rows — a 300-row file with 3 bad rows imports 297 and lists the 3.
- Client codes (`PHMG-NOI-0142`) from an atomic per-branch counter inside the transaction, so two people onboarding at once cannot collide.
- Tests: 51 new Vitest tests (132 total) on the identifiers, the CSV parser and the import pipeline; 14 new Playwright tests waiting on Atlas.

## What Step 4 built

- `models/ServiceTemplate.js`: the whole of spec §4 — name, code, category, L1–L3 complexity, minimum role to execute and to review, turnaround, recurrence, embedded checklist (client side and firm side) and steps, SAC, default fee in paise, GST rate, UDIN flag, version, active.
- `lib/services/catalog.js`: the lists the form, the seed and the tests all read, plus `bumpsVersion()` — the one rule that decides what counts as a new version of a service.
- `lib/services/starter.js`: the 15 starter services from the spec table, each with a real checklist and a real sequence of steps. Fees are ₹0 and SAC codes blank except 998221 on the two audit services; nothing statutory is invented.
- `/settings/services`: the catalog grouped by category, searchable, with archived services hidden until asked for, and a banner naming the SAC codes still to be set.
- `/settings/services/new` and `/settings/services/[id]`: one form for both, with reorderable checklist and step rows. Choosing a complexity level moves the execute/review roles with it; both stay editable.
- Only a CA or a Partner can be offered as the reviewer, so no template can be written that breaks maker-checker (spec §5).
- Versioning without a second collection: an engagement snapshots the template when it is created, so editing one never reaches back into work in progress. `version` goes up when the *definition of the work* changes, and the form says so.
- Settings now shows each role only the sections it may open, so staff can read the catalog without reaching the Team screen.
- `scripts/seed.js` loads the starter catalog, skipping any service the firm has already edited.
- **Fixed on the way through:** the seed script and the Playwright fixtures wrote through audited models without opening a transaction, which would have failed the moment Atlas was connected. `lib/audit/system.js` gives scripts and fixtures the same audited transaction the app uses, attributed to System.
- Tests: 23 new Vitest tests (155 total) on the version rule, the review-role floor and the starter catalog's consistency; 3 new Playwright tests waiting on Atlas.

## What Step 5a built

- `models/Engagement.js`: one service, one client, one period — with the template **copied in**, not referred to: `templateSnapshot`, `tasks[]`, `checklist[]` and `reviewChecklist[]` are all copies, so editing the catalog next month cannot change work already under way.
- `models/ClientService.js`: what a client is signed up for — their agreed fee and usual people, which the create form fills in and Step 7's generator will read.
- `lib/engagements/status.js`: the eight statuses and every rule about moving between them, in one file. Only a CA or Partner can hold, cancel or complete; the person who did the work can never sign it off; On hold, Cancelled and rework all demand a reason; Completed and Cancelled are terminal.
- `lib/engagements/period.js`: months, quarters, halves and years on the Indian financial year — Q1 is April–June, not January–March. Period codes round-trip, so an engagement created last year still describes itself correctly.
- `lib/engagements/create.js` and `assign.js`: building an engagement from a template, and the assignment rules (minimum role to execute, minimum role to review, maker ≠ checker).
- `lib/dates.js`: working-day arithmetic that steps over weekends, and the days-remaining figure behind the green / amber / red chips.
- `/engagements/new`: the period list and the people offered both follow from the service chosen, so the form cannot offer a combination the server would refuse.
- `/engagements/[id]`: pipeline buttons, sub-tasks, both checklists, filing details (acknowledgement number and UDIN), the reviewer's panel, comments with @mentions, the pipeline history and the Activity trail.
- `/engagements`: a plain list of open work, scoped to what the person may see. Filters, board, calendar and bulk actions are Step 5b.
- The client page's **Engagements** tab is live, with the client's service subscriptions beneath it; **Today**'s three columns now show real work.
- Completing is gated: every mandatory checklist item verified, every review point ticked, and a UDIN where the service requires one.
- Tests: 37 new Vitest tests (192 total) covering period maths across February and the year end, every pipeline rule, the maker-checker gate and the template snapshot; 2 new Playwright tests — the full create → review → rework → complete round trip — waiting on Atlas.

## What Step 5b built

- `lib/engagements/filter.js`: one query builder, used by both the list screen and the CSV export, so what you see is exactly what you download. Scope is applied inside it — a filter typed into the URL can never widen what a role may see, and an employee or intern still sees only their own work.
- `/engagements`: search by client or engagement code, plus filters for status, service, period, due (overdue / today / 7 days / 30 days), priority, branch, assignee, "only mine" and "include closed". Paged at 100.
- **Three views of the same filtered set**: a list, a board with one column per status, and a month calendar coloured by how late the work is. The view and every filter live in the URL, so a useful view can be bookmarked or pasted to a colleague — saved views proper are Step 10.
- **Bulk actions** on a selection: move status (with a reason where one is required), assign, set reviewer, move the internal due date, set priority. They run the single-engagement action once per record, so every rule is asked per record; whatever cannot move is reported by engagement code with the reason — "12 of 15 moved to Under review" and the three that could not.
- CSV export of the filtered list, audited like the client export.
- **Unblocked from Step 3:** an intern's client list was empty by design until engagements existed. It now shows the clients of the work on their desk, and nothing else in the branch.
- Tests: 13 new Vitest tests (205 total) on the filter builder, mostly on what scope refuses to widen; 3 Playwright tests waiting on Atlas, including a bulk move that half-fails and names the rows it skipped.

## What Step 6a built

- `gateway/`: the PHP file gateway for BigRock — `upload.php`, `download.php`, `delete.php` and the shared `verify.php`. Every request must carry an HMAC-SHA256 ticket the app signed; files are encrypted with AES-256-GCM and written outside `public_html`; the key sits in a config file above the web root; CORS is limited to the app's domain, directory listing is off, `verify.php` is not reachable by URL, and every request is logged. A delete moves the file to a recycle folder — only the purge erases anything.
- `lib/storage/`: the adapter from spec §14 (`getUploadTicket`, `getDownloadLink`, `remove`, `exists`) with **two drivers**. The BigRock one talks to the gateway; the local one does the gateway's job inside the app, with the same tickets and the same encrypted layout, so development and the tests exercise the real rules rather than a stub.
- Uploads go **browser → gateway directly**, so Vercel's ~4.5 MB request limit never applies. The app signs a ten-minute ticket first and records the document only once the gateway confirms what it stored, so a failed upload leaves no row and no row points at missing bytes.
- `models/Document.js`: versions kept on re-upload, each with its uploader and time; `isPermanent` for the client's permanent file; a retention setting.
- Structured storage path, built from codes the app generates rather than anything typed: `clients/<client>/FY<year>/<service>/<engagement>/<id>-<name>`.
- Attach files to any checklist item on an engagement (multi-file, drag-and-drop, and a button for the keyboard). Attaching moves the item to **Received** by itself.
- Preview PDFs and images in the page; download through a five-minute link. **No link is ever rendered into the HTML** — every open asks the server, which checks permission and writes the audit entry first.
- Client **Documents** tab: the permanent file at the top, then everything by the engagement it came in on, with a one-click move into the permanent file.
- Recycle bin at `/documents/bin`, Partner only: restore, or erase with a confirmation. `jobs/purgeRecycleBin.js` is the 90-day handler, ready for the runner in Step 7.
- Tests: 28 new Vitest tests (233 total). Because the gateway is PHP and cannot run here, the tests pin the contract instead — the exact ticket format the PHP verifies, and the exact `IV‖tag‖ciphertext` layout it reads, plus tampering, expiry, wrong-operation and path-climbing attempts. 2 Playwright tests cover attach → download → delete → restore against the local driver.
- **Not yet proven:** the PHP itself has never been executed — this machine has no PHP. Its first real run is on BigRock, and the checks in DEPLOY are written to catch a problem on the first upload rather than the hundredth.

## What Step 6b built

- `models/DocRequest.js` and `lib/storage/requests.js`: a request for documents, with a 32-byte random token. **Only the token's hash is stored**, so a copy of the database contains no working links — the same reasoning as a password. Lookups are by hash and the comparison is constant-time.
- `/upload/<token>`: the page the client opens. No account, no password, seven days. It lists only what is outstanding, has one button per document, and says in words what has been received. It uses the firm's fonts and colours but none of the app's furniture.
- **What that link can do is the whole security story, so it is deliberately narrow:** it can write one file against one item that was asked for, and nothing else. It cannot read a document back, list anything, see another client, or reach any part of the CRM. The middleware exemption is scoped to `/upload/` alone and says why in a comment.
- Links can be withdrawn before they expire, stop after 50 files, and every upload through one is audited as *uploaded by the client through request `ab12cd…`*.
- Asking moves the checklist items to **Requested**; a client's upload moves them to **Received** — never to Verified, which stays a decision for the firm.
- On the engagement: a panel showing what is outstanding, the link (displayed once, with a copy button), and the history of links made.
- `/documents`: search across the firm by file name, client, financial year, service, or permanent-file only; and a **Pending from clients** tab listing every job waiting on a document, with what it is waiting for and whether it is overdue.
- Tests: 8 new Vitest tests (241 total) on the token — unguessable, stored only as a hash, constant-time comparison, seven-day expiry, and a link that points outside the signed-in area. 2 Playwright tests cover a real client upload from a browser that has never signed in, that the same browser is still refused at `/clients`, and that a withdrawn link stops working.

## What Step 7a built

- `models/Job.js` and `lib/jobs/queue.js`: the work queue from spec §14. A job is claimed by one atomic update that also takes a five-minute lease, so two overlapping cron runs can never do the same job twice — and a run the host kills mid-job is picked up again once its lease lapses. Failures retry at 1, 2, 4, 8 and 16 minutes, then stop and wait for a person.
- `lib/jobs/schedules.js`: the recurring work, defined in code with IST times. The runner **offers every schedule on every pass** and de-duplicates on a key of schedule-plus-due-moment, so nothing has to remember what was queued, and a cron run that fails or fires late simply catches up at the next one.
- `lib/jobs/run.js`: one pass, used by both deployment shapes. It stops starting new jobs after 45 seconds — finishing the job in hand, leaving the rest for five minutes' time — because shared hosting kills long processes and a half-done run is worse than a slow queue.
- **Both deployment shapes**, since the hosting question is still open: `runner/run.js` for cPanel's Node.js app support, and `/api/jobs/run` guarded by a constant-time secret check for a plan without it. The route refuses everything, and says only "Not found", when the secret is unset or wrong.
- **Settings → Background jobs**: green or red at a glance, the last check-in, what runs and when, and any job that gave up — with Try again, Cancel, and a Run now button for setting cron up. Red after 30 minutes means six missed runs, which nobody would otherwise notice until a deadline was.
- The 90-day recycle purge from Step 6a is wired in as the first real scheduled job.
- `docs/DEPLOY.md` section 2: which hosting you have, the cron line for each case, how to check it is working the next day, and what to look at when it is not.
- Tests: 18 new Vitest tests (259 total). The pure parts — back-off, and when a schedule was last due across midnight, month ends and IST — plus the runner loop itself with the queue stubbed: it stops at its budget, keeps its batch limit, records a failure and carries on, fails a job whose handler no longer exists rather than looping on it, and writes a heartbeat even when there was nothing to do.

## What Step 7b built

- `models/DueDateRule.js` and `lib/compliance/dueDate.js`: one rule per service, with a formula, per-period variants (the March TDS quarter is due 31 May, not 30 April), and overrides for dates the government moves.
- **Rule 8, made structural.** A rule carries `verifiedBy` and `verifiedAt`, and `statutoryDueFor` returns no date at all from a rule nobody has confirmed — it returns the reason instead. There is no path that puts an unchecked date on an engagement.
- `lib/compliance/starterRules.js`: a draft of 11 rules. The dates were searched on the web in October 2026 and **no official source was found** — not gst.gov.in, not incometax.gov.in, not an MCA circular. Every row therefore carries its source and a `caution` naming what the sources disagreed about: QRMP state groupings for GSTR-3B (22nd vs 24th), ESI (15th vs 21st), whether the ITR-BUS row should be three rules rather than one, and that ROC filing needs each client's actual AGM date.
- `/settings/due-dates`: one card per rule showing the date it *would* produce for the period in hand, where the draft came from, and what to check — then a single button: "This is right — confirm it". Correcting a rule un-confirms it, because what was confirmed is no longer what is stored.
- **Government extensions**: record the new date and the notification, and every open engagement on that service and period moves with it, each with its own audit entry naming the notification. Not `updateMany` — each engagement needs its own log line and its internal target recalculated.
- `jobs/generateRecurring.js`: nightly, creates the coming period's work a fortnight before it is due, assigned to whoever normally does it. Work on an unconfirmed rule is **still created on time**, with the statutory date blank and the status history saying why — the job never waits on a date, and never invents one.
- Engagements gained `eventDate` / `eventName` for the deadlines that run from an AGM or a notice rather than the calendar.
- Tests: 21 new Vitest tests (280 total), most of them on rule 8 itself — no rule, unverified rule, verified rule, every seeded rule being unverified and carrying a caution — plus month-end clamping, financial-year arithmetic, the Q4 variant, event-based dates and the three-working-day internal target. 2 Playwright tests cover the confirm-then-generate change in behaviour and an extension moving an open engagement.

## What Step 7c built

- `lib/compliance/grid.js`: the status grid from spec §8, as a pure function — which periods a financial year contains for any recurrence, and what each cell means.
- **The distinction the grid exists for:** a period where *nothing was ever created* is shown differently from one where the work simply is not finished. The first is a hole in the system; the second is work in progress. A list can never show the first, because there is nothing in it to see.
- A design error caught by its own test: the first version marked the **period in progress** as a missing filing — October's return flagged as missed on 17 October, when it is not due until 20 November and the generator only creates it on the 5th. A hole is now only a hole once the period has ended, so the grid does not cry wolf every month.
- `/calendar`: the firm calendar in month, week and list views, filterable by service, status, assignee and branch, reusing the engagement list's query builder so scope and filters behave identically in both places. Statutory dates and internal targets are coloured apart.
- The status grid: clients down the side, periods across the top, with the two numbers a partner wants at the top — periods with nothing created, and open work past its date. Every cell carries a plain-language tooltip, and a legend sits underneath.
- **Today's statutory ledger line is filled in** — a placeholder since Step 0. It shows the real statutory dates falling in the next seven days, within the person's own scope. Only statutory dates, never internal targets: the firm's own promise is not the law's deadline.
- Tests: 14 new Vitest tests (294 total) on the grid — period columns for every recurrence, each cell state, undated work not being called late, and the counts. 1 Playwright test on a filed April beside a May nobody created.

## What Step 8a built

- `lib/billing/gst.js`: every figure on an invoice, in integer paise. The supplying state comes from the branch's own GSTIN and the destination from the client's — same state means CGST and SGST, different means IGST, and there is no setting anyone can get wrong. Each line's tax rounds on its own, so the printed invoice adds up line by line as a GST invoice is read; where CGST and SGST split an odd paisa, the halves still sum to the whole.
- Out-of-pocket costs are carried at cost in their own section with no GST, and they do not touch the TDS figure. TDS at 10% under 194J is shown as expected and **never deducted from the total** — it is the client's deduction, not the firm's discount — alongside what should actually arrive in the bank.
- `lib/billing/number.js`: `NOI/26-27/0087`, one series per branch per financial year, **with the number taken at issue rather than at creation**. A statutory series cannot have holes, and a draft may never become anything, so a draft has no number at all until the transaction that issues it. There is also a gap checker for the Step 12 hardening pass.
- `models/Invoice.js`: issued invoices store their own tax figures rather than recomputing on read, so an invoice from October 2026 prints in 2029 exactly as it printed then. Overdue is computed on reading, never stored, so nothing needs touching at midnight to stay truthful.
- The draft/issue line is the spine of the screens: a draft has input boxes, an issued invoice has a number and a credit-note button. Nothing about an issued tax invoice can be quietly changed — a credit note cancels or reduces it and the original is left alone.
- **Settings → Branches**, which did not exist before: addresses, GST registrations and each branch's series with the number it has reached. The invoice list and the branch screen both say plainly that a branch without a GSTIN can draft but not issue.
- `/invoices` with search and status filters, `/invoices/new` driven by the unbilled-work list, and the invoice screen itself. Issuing an invoice marks its engagements Billed.
- Tests: 31 new Vitest tests (325 total). The GST ones are deliberately fussy about the rupee — the odd-paisa split, line totals summing to the foot, reimbursements and TDS staying out of the tax, discounts reducing the taxable value — plus the series following the April-to-March year and the gap checker. 2 Playwright tests cover a branch with no GSTIN being able to draft but not issue, then registering it, issuing with IGST, the series running 1 then 2 with no gap, and a credit note cancelling without rewriting the original.

## What Step 8b built

- `lib/billing/allocation.js`: the money logic, kept pure because getting it almost right means chasing a client who has paid, or failing to chase one who has not. Outstanding amounts, the status an invoice should carry, a suggested spread across the oldest bills, validation of what someone typed, ageing buckets and the running ledger.
- **TDS is treated as settlement, not shortfall.** A client who pays ₹1,08,000 against a ₹1,18,000 invoice and deducts ₹10,000 TDS has paid in full, and the invoice goes to Paid rather than Partially paid. Getting this wrong would have the firm chasing money it was never going to receive in cash.
- `models/Payment.js`: a receipt belongs to the client, not to an invoice — one transfer often covers four bills — so allocations are embedded on the payment and anything unallocated sits as credit against the client rather than being lost.
- Recording a payment moves the receipt and every invoice it touches inside one audited transaction. Reallocating reverses the old allocations before applying the new ones in that same transaction, so a correction cannot leave double credit behind. Deleting a payment entered in error puts the invoices back as they were.
- The client's **Invoices** tab is now the account: balance owed, a one-panel payment entry with a suggested allocation the person can change, the running ledger with a balance down the page, and every invoice.
- `/invoices/receivables`: ageing in the four buckets spec §7 asks for, firm-wide and per client, sorted so the worst 90+ debt is at the top — beside the **done but not billed** report, which is the other end of the same question. Each unbilled job has a "Bill it" link straight into a draft.
- A manual tick for TDS seen in Form 26AS, as spec §7 says reconciliation is manual in v1.
- Tests: 26 new Vitest tests (351 total) on the awkward real cases — TDS settling a bill, one transfer across several invoices, advances with nothing to allocate against, over-allocation refused, the ageing boundary days, credit notes subtracting in the ledger, and drafts and write-offs staying out of the balance. 1 Playwright test records a part-cash part-TDS receipt and checks the invoice ends up Paid.

## What Step 8c built

- `lib/billing/invoicePdf.jsx`: the invoice as the client receives it. A tax invoice is a legal document before it is a design, so both GSTINs, the place of supply, the SAC against each line, the tax split by head and the total in words are all required furniture; the ledger look from spec §15 is applied around them, never through them.
- Every figure is read from the stored invoice rather than recomputed, so the PDF sent in 2029 matches the one issued in 2026.
- A draft prints with a **DRAFT** watermark and a footer saying it is not a valid tax invoice — a preview should never be mistakable for the real thing.
- `/invoices/[id]/pdf` renders it on the server and audits the download. Server-side rather than browser printing because Step 9 has to attach the same file to an email, which a print dialog cannot do.
- `/invoices/export`: invoices or payments as CSV, with every tax head, what has been received, TDS credited and what is outstanding. **Amounts are written in rupees with two decimals, not paise** — the file is read by a person and pasted into a return, and a column of paise invites a hundredfold error.
- New dependency: `@react-pdf/renderer`, which spec §14 names. Nothing else.
- Tests: 10 new Vitest tests (361 total). A compiled PDF hides its text, so the tests read the element tree — where a missing GSTIN or the wrong tax head would actually be — and separately check that the whole thing renders to real PDF bytes, including a forty-line invoice that has to paginate.
- **Not built:** the Tally or Zoho import format, which waits on the firm choosing one. The CSV above is what either would be built from.

## What Step 9a built

- **The guard, first.** This is the first step that can reach real clients out of a database holding their real addresses, and a loop in notification code can mail a whole client list before anyone notices. So `lib/mailer/guard.js` holds client email back behind `EMAIL_CLIENTS_ENABLED`, off by default: messages are still composed, logged and visible on screen, they simply do not leave. A redirect-all address sends everything to one inbox with the intended recipient in the subject, for testing the real SMTP path without touching a client. `EMAIL_ENABLED=false` stops everything including internal mail.
- `lib/mailer/`: Nodemailer over cPanel SMTP behind an adapter, with a **log transport** for development — so nothing in this step waited on the mailbox existing, and a test run cannot post a letter.
- **Nothing sends inline.** Every message is queued on Step 7a's job runner and drained under an hourly cap (100 by default, under BigRock's). A slow mailbox cannot make saving an engagement slow, and fifty invoices raised at once trickle out rather than getting the firm's domain throttled. The rate limit lives in the job, where the whole hour's traffic can be counted, and defers by throwing — which the runner already treats as a retry with back-off.
- `models/Notification.js` (the bell, expiring after 60 days, no audit plugin — a nudge is not a record) and `models/MessageLog.js` (kept, because what a client was told *is* a record). A held message is logged with its reason, so nobody can believe a client was told something they were not.
- Notifications and message logs are written **inside the same transaction as the change they describe**, so nobody is ever told about something that was then rolled back.
- Five event-driven messages, wired into the existing actions without those actions learning anything about email: assigned, sent for review, sent back for rework, invoice issued (with the PDF attached), payment received (client thanked, partner told).
- The bell in the top bar is live with an unread dot, `/notifications` lists them, and **Settings → Messages** answers the question a partner actually has — *are we emailing clients yet, and if not why not* — in sentences rather than environment variables.
- `docs/DEPLOY.md` section 3: creating the mailbox, SPF and DKIM through cPanel and GoDaddy, a DMARC record, testing on yourself with the redirect, and only then going live.
- Tests: 18 new Vitest tests (379 total), most of them about what does **not** get sent — client mail held by default, "yes please" not counting as true, the redirect not overriding the off switch, an invalid address refused rather than attempted, and an unknown placeholder staying visible rather than printing "undefined" at a client.

## What Step 9b built

- **The seven timed messages of spec §12**, in two jobs on Step 7a's runner: `reminders` at 08:00 IST and `dailyDigest` at 09:00, with `weeklySummary` on Monday at 09:00. Both only queue mail, so the hourly cap still governs delivery and a pass stays well inside the runner's 60 seconds however much work the firm has.
- **The date arithmetic is pure and separately tested.** `lib/mailer/sweep.js` is given a record and a date and says what should go out; it touches no database and sends nothing. This is the part that is either right or quietly wrong for a year, because nobody notices a reminder that never went — so every rule is checked on the day before, the day itself and the day after.
- Our own target date 2 days before (assignee) · the statutory date 5 and 1 day before, **only where the work is not filed** (assignee, reviewer, client partner) · overdue daily until dealt with · documents chased every 3 days, 4 times at most · invoices 3 days before, on the due date, then every 7 days.
- **One reminder, once.** Every reminder carries a `dedupeKey`, stored on the message log under a unique index. The sweep checks before sending and the index refuses a second copy, so overlapping runners, a late cron and a retried job cannot chase a client twice.
- A document chase **mints a fresh upload link** each time, because only the hash of the previous one is kept. Nothing was weakened to make reminders possible.
- **Every rule can be switched off, retimed and reworded** in Settings → Messages (`models/NotificationRule.js`). Only the firm's *changes* are stored, so an untouched rule follows the code and cannot be half-configured; saving the defaults back empties the row rather than pinning today's defaults into the database. Switching one off is audited, because "why was nobody reminded" gets asked months later.
- The digest times are read by the runner, so changing the time in settings really changes when it goes out. Schedules gained an optional `dow`, so the weekly summary is genuinely weekly rather than a daily job that does nothing six days in seven.
- **Nobody is emailed an empty digest.** An empty email every morning teaches people to ignore the ones that matter.
- **Partners get overdue work in their digest, not one email per job.** Spec §12 lists Partner on the overdue row; at one email per overdue engagement per day that is a rule people mute, so the daily email goes to the assignee and reviewer and the partner's digest carries the firm's whole overdue list with names against it. **Owner to confirm.**
- The Monday summary: work started and completed last week, overdue now, awaiting review, completed-but-unbilled, total receivable and how much of it is past due, and overdue by person. **Owner to confirm this is the right Monday morning page.**
- **Document requests can now be emailed** (the gap Step 6b left for the mailer) — "Email the client a link" on the engagement, which also starts the three-day follow-ups. While client email is off it says so plainly and hands the link back rather than letting the firm believe a client was written to.
- Tests: 43 new Vitest tests (422 total) and 2 Playwright tests waiting on Atlas — one that a reminder goes out once and not twice, one that switching a rule off in the browser actually stops the sweep.

## What Step 10 built

- **The dashboards of spec §10, on `/today`** — the page everybody already lands on. A partner gets the firm overview, a CA the review queue, accounts the billing board; everybody keeps their own three columns underneath. An employee or intern gets no second dashboard, because their own work *is* the dashboard §10 describes for them.
- **Every figure is a filter, not a calculation.** `lib/reports/figures.js` counts a tile with the same `engagementQuery` the list screen and the Excel export use, and the tile's link is that same filter in the URL. So a tile cannot drift from its list — the §17 acceptance criterion holds by construction rather than by care, and the Playwright test reads the number off the tile, clicks it and counts the rows.
- Partner overview: open / overdue / due-this-week / awaiting documents / under review · open and overdue by branch · unbilled finished work (₹) · owed to the firm with 30-day ageing · collected this month against last · jobs held up for client documents · billed this year by kind of work.
- CA review queue: waiting for me, under review anywhere, overdue in my scope, and **work that came back** by person — written "3 of 12", never as a percentage, because three out of twelve and thirty out of a hundred and twenty are different conversations.
- Accounts billing board: to be invoiced · overdue invoices · received today · TDS still to reconcile.
- **`/reports`** — eight reports, each with the same filter bar (dates, branch, service, person, status) as a plain GET form, so the filters live in the URL: bookmarkable, shareable, savable, and handed straight to the download buttons without a line of JavaScript. New this step: engagement status, overdue, documents awaited, revenue (by client / service / branch / month), turnaround per service against the standard, and new-and-lost clients. The compliance grid, receivables ageing, ledger and unbilled work are **linked, not rebuilt** — one report, one home.
- **Real Excel, not CSV.** `lib/excel.js` (exceljs) writes a frozen bold header, money as a number Excel can sum with Indian grouping, and dates as real dates on the IST calendar day. The clients, engagements and invoices/payments exports were converted over, so every export now behaves the same way.
- **PDF** on the three reports people print, landscape with a repeating header row, who ran it and when in the footer, rendered by the same `@react-pdf/renderer` the invoices use and formatted by the same helper the screen uses — so a printed figure cannot disagree with the screen it came from.
- **Saved views** (`models/SavedView.js`) on the reports and on the engagement list: name the filters you keep coming back to, e.g. *Ludhiana GST overdue*. The view stores the query string rather than the fields, so a new filter needs no change to the model. Private unless a Partner shares it with the firm. Soft-deleted like everything else.
- Every report and every export is permission-scoped on the server and the download is audited (spec §11): a spreadsheet of client fees leaving the building is worth a line in the log.
- Tests: 27 new Vitest tests (449 total) — the workbook is read back and asked what *type* each cell is, because a test that only checked the bytes exist would pass on a file full of text — and 2 Playwright tests waiting on Atlas.
- **One new dependency:** `exceljs`, which you approved. Nothing else; the dashboard's bar chart is six CSS bars rather than visx.

## What Step 12 built

- **The one real security hole in the build, found and fixed.** Sessions are JWTs, and `auth.js` hardcoded the session's `active` flag as true while carrying a frozen copy of the role and branches. So a deactivated user kept working for up to thirty minutes, and a demotion took that long to bite — against spec §16's "force logout of a user instantly when they leave the firm". The session is now trusted for identity only: the role, the branches and the right to be here come from the database on every request, memoised per request with React `cache()`.
- **DPDP export** (spec §16): everything held on one client, across every collection, as a workbook, Partner-level and audited. Encrypted fields are reported as *held*, never decrypted — a spreadsheet containing a client's Aadhaar and their portal passwords would be a worse breach than a slow answer.
- **DPDP deletion, as redaction** (the owner's decision, 18-10-2026): personal data overwritten, documents erased from the vault, and the statutory record kept because the law requires it — invoices, engagements, UDINs, audit log. The policy is written as *data* in `lib/dpdp/index.js` so a partner or a lawyer can read what will happen without reading JavaScript, and the screen shows it before anybody confirms. Refused while the client still has unfinished work.
  - **Corrected mid-build:** the first draft claimed it would "destroy the key for their documents". There is one storage key for the whole firm, so there is no per-client key to throw away — the only honest way is to erase the files, and that is what it now does.
- **Breach detection and an incident log** (spec §16), at Settings → Security. The signals come out of the audit log that already records every sign-in, credential reveal and download; what was missing was somebody looking. Thresholds are generous on purpose, because a screen that cries wolf gets ignored. The log cannot be deleted from, only closed, and closing an incident requires saying what was done about it.
- **The go-live imports** (spec §17 step 2): team members and opening receivables. Opening balances come in as invoices in their own `OB/` series, outside the statutory numbering, so history cannot disturb the firm's gapless GST sequence — and importing the same sheet twice is refused rather than doubling the receivables. The team import will not create a Partner from a spreadsheet.
- **`scripts/backup-vault.sh`** — the nightly off-server copy §16 asks for, which refuses to ship a backup of an empty vault, because a backup taken after a disaster is how the disaster becomes permanent.
- **The second hole: a soft delete saved outside its own transaction.** `softDelete()` and `restore()` called `save()` with no session, so wherever it was used — deleting a document, a payment or a saved view, and restoring a document from the bin — the audit entry joined the transaction and the change itself did not. A failed log would have rolled back nothing (CLAUDE.md rule 2). The method now takes the session and the four callers pass it.
- **The migration rehearsal** (`docs/DEPLOY.md` §7): the imports run first into a scratch database on the same cluster, checked against the spreadsheets to the rupee, then dropped — because client codes are a per-branch series that is never reused, so a half-finished import on the live database cannot be tidied up afterwards.
- **Sentry** (spec §14), the owner's decision of 19-10-2026: `instrumentation.js` on the server, `instrumentation-client.js` in the browser, `app/global-error.jsx` for a crash that takes the layout with it, and **a scrubber every event passes through** — the request body, cookies, headers and query string dropped, the user reduced to an id, and PAN, Aadhaar and GSTIN written over wherever they appear, including inside the error message. 9 tests, including that an invoice number and a date are not mistaken for an Aadhaar number. **Measured cost with no DSN set: nothing.** The shared bundle is 103 KB and login 116 KB, exactly as before, because both halves load the SDK only when there is somewhere to send to. With a DSN the browser fetches ~60 KB as a separate chunk. `docs/DEPLOY.md` §8 has the seven steps, the five variables and the list of what is and is not sent.
- **Monitoring** (`docs/DEPLOY.md` §8): Atlas alerts, two uptime checks and the runner heartbeat, all free and all owner-side. The gateway check expects a **404 and the words "Not found"** — the 404 is deliberate, and checking the body too is what catches PHP being switched off, which would turn the same URL into a 200 serving the source.
- **`npm run doctor`** (`scripts/doctor.js`): the pre-flight check for the day the cluster appears and for every go-live step after it. Environment variables checked for shape as well as presence (a 31-byte key is not a key), the connection opened with Atlas's own errors translated into plain words, **a real transaction opened and rolled back** — because without a replica set nothing in this app can be audited and the failure would otherwise show up as a confusing error on a save — indexes built, the audit chain walked, a probe file put through the vault and erased, then the go-live blockers that are data rather than code: branch GSTINs, unconfirmed due-date rules, services still at ₹0, how stale the job runner is. For the BigRock driver the probe goes through the **real gateway over the network**, which is `DEPLOY.md` §1 Step 7 in one command instead of six by hand.
- **Three environment variables the code reads were missing from `.env.example`** (`DOC_REQUEST_DAYS`, `GENERATE_LEAD_DAYS`, `INTERNAL_TARGET_WORKING_DAYS`), and `.env.example` itself was never in the repository — `.gitignore` had a blanket `.env*` that swallowed the template along with the real file. Both fixed; CLAUDE.md rule 6 asks for that file to be current, which it cannot be if it is not tracked.
- **`DEPLOY.md` named two environment variables that do not exist**: the Vercel table asked for `STORAGE_GATEWAY_SECRET` and `JOB_RUNNER_SECRET`, where the code reads `STORAGE_SHARED_SECRET` and `JOBS_SECRET`. That would have cost an afternoon on go-live day, with the app simply refusing every upload.
- **`docs/ACCEPTANCE.md`** — all eleven §17 criteria plus §16 treated as criteria, each with exactly how to check it in the browser and an honest mark. Nothing is ticked, because nothing can be until the database exists.
- **`docs/DEPLOY.md` finished** — Atlas, Vercel, the two irreplaceable keys, restricting the audit-log database user, backups with a restore test that is actually performed, a thirteen-step go-live order, how to stop, and how to roll back.
- Tests: 45 new Vitest tests (529 total), four of them on the soft-delete plugin: that it records who and when, that it saves inside the session it is handed, and that an ordinary `find` still cannot see a deleted row.

## What Step 11 built

**All eight signature moments of spec §15**, not only the four in the step's row — the owner asked for the rest folded in.

- **Branch constellation** on the login screen: a slowly turning relief map of North India, four brass pins joined to the head office by arcs of light with a travelling pulse (a 40-line shader, so the light moves without any per-frame geometry work), cursor parallax, bloom, and a glide into the head office when somebody signs in. The relief is a **formula, not a heightmap** — the Himalayan foothills rise along the north edge and the plain is flat, which is the only geographic claim the scene makes, and it costs three lines of arithmetic instead of a texture to download.
- **The flat ledger map is not a placeholder** — it is what most phones will see, so it is drawn to be looked at: ink contour lines, the two rivers, four brass pins, a plate in the corner. It is in the markup every time; the 3D scene fades in over it only after the device has passed all four of spec §15's tests (reduced motion, data saver or 2G, four cores or fewer, no WebGL2), and a lost WebGL context falls back to it mid-session rather than going black. **Login's first load is 116 KB** — the 3D stack is a separate chunk that most devices never request.
- **Command bar** (Ctrl/Cmd + K) on cmdk: client name, PAN, GSTIN, engagement code, invoice number, or the name of a screen. Searching runs on the server with **the same scoping as the lists**, including the intern rule, so the command bar cannot become the back door to a client whose record their own list would not show. Deliberately not audited: a keystroke is not an action, and logging every letter would bury the entries that matter.
- **Audit tick** on both checklists: ink laid down along the stroke, scratched out with two strokes on un-ticking. It animates **only on a change**, never on page load — forty verified items drawing themselves every time the page opens would be a cartoon, not a ledger. The real checkbox stays underneath, so the keyboard and the screen reader are untouched.
- **The stamp**: COMPLETED with the UDIN, pressed on at a slight angle with ink texture from an SVG turbulence filter. It presses once, when the status has just changed; a finished engagement opened a second time simply has it on.
- **Case file folder tabs**: the brass divider measures and slides between tabs instead of the page moving. The tabs are still links with the section in the URL, so bookmarks and the back button work.
- **Odometer figures** on the dashboard tiles (`@number-flow/react`), with `respectMotionPreference` on.
- **Deadline terrain**: weeks × branches, column height is how much is due, colour runs from carbon to red pen by how much is late; hover for the counts, click to open that week's list. One `InstancedMesh` draws all of it. The **flat heatmap is the default** and carries the same numbers as a proper table with row and column headers — the toggle to the 3D view is not even offered on a device that said no.
- **Kanban drag** on dnd-kit: cards drag between columns, columns the card cannot legally reach do not light up, and the drop runs the same bulk action the list uses, so dragging can do nothing the keyboard path cannot. A drag handle keeps dragging from competing with the card's link or its checkbox.

**Accessibility pass**

- **WCAG 2.2 AA contrast is now measured, not asserted.** `tests/contrast.test.js` reads the real tokens out of `app/globals.css` and computes every ratio, so it fails if a colour is ever nudged past the line. It found three genuine failures in the light theme, including the spec's own Waiting amber at **2.61:1** as text — see the decisions table.
- Skip-to-content link as the first thing in the tab order; `<main id="content">`.
- **Arrow-key navigation on the compliance grid**, which spec §15 names and it did not have: one tab stop gets you in, arrows move cell to cell, Enter opens. Row headers are now `<th scope="row">` and every cell has a label naming its client and period.
- The quick-add (+) button was a dead control; it now opens the command bar.
- Captions on the grid and the heatmap tables, `scope` on their headers, and the 3D canvases `aria-hidden` so neither is ever announced as content.
- Tests: 35 new Vitest tests (484 total), including that the scene **refuses** to run on each of the four devices spec §15 says it must not; and 5 Playwright tests waiting on Atlas, covering Ctrl+K from anywhere, finding a client by PAN with the keyboard alone, and the skip link.

## Open questions waiting on the owner

From spec §18 — none answered yet. These block later steps, not Step 0:

- [ ] User count at launch and active client count
- [ ] Invoice numbering: one series firm-wide or one per branch? GST registration in each state?
- [ ] Export target: Tally, Zoho Books, other?
- [ ] Can interns see fees / invoice amounts?
- [ ] Is a separate Accounts / Billing role needed?
- [ ] WhatsApp BSP choice and number availability (phase 2)
- [ ] Client portal logins in phase 3, or upload links only?
- [ ] Where existing data lives today and how far back to migrate
- [ ] Budget and target go-live date
- [ ] BigRock: Node.js app support in cPanel? hourly email cap? disk/inode limits? server country? backup destination?

## Owner tasks outstanding

- [ ] Create MongoDB Atlas cluster, DB user, network access — **blocks Step 1**
- [ ] Decide on a GitHub (or other) remote for the code, under the firm's account
- [ ] Create Vercel project + env vars (needed before the first deploy)
- [ ] **Atlas: restrict the app's database user on `auditLogs` to `find` and `insert` only** (spec §11). The application already refuses to edit or delete entries; this stops anything else. Needs a custom role in Atlas — I will give click-by-click steps at go-live.
- [ ] Atlas: set up Online Archive for `auditLogs` entries older than 2 years (spec §11), to keep the live collection fast
- [ ] BigRock: `files.` subdomain, PHP gateway, cron jobs (Steps 6 and 7)
- [ ] `notices@` mailbox + SPF/DKIM/DMARC (Step 9)

## Left over / known gaps

> **A correction, 27-10-2026.** Many step notes below say nothing has ever
> run against a database. **That is out of date.** The Atlas cluster exists
> and always did: `npm run doctor` connects, transactions work, the audit
> chain is intact. What actually kept the end-to-end suite skipping for
> twenty steps was that **Playwright never loaded `.env`** — three lines in
> `playwright.config.mjs`, now fixed. The suite runs; 36 of 135 passed on
> the first real run and the number is climbing as each stale expectation
> and each real bug is dealt with. Treat "needs Atlas" in an older note as
> "needs its own test fixed", not as a missing cluster.

**From the shell pass (28-10-2026)**

- **`tests/e2e/keyboard.spec.js:124` fails, and it is a real conflict, not a stale test.** It asserts spec §15's login scene is in the page; D52 parked all eight signature moments, and `app/(auth)/login/page.jsx` wraps the scene in `.moments-only`, which `globals.css` sets to `display: none`. A hidden element is not in the accessibility tree, so the `img` role the test looks for does not exist and `/login` renders the form alone. **The owner has to choose**: exempt the login scene from the moments switch — it is the one of the eight that is a first impression rather than a flourish on a working screen — or change the test to assert the scene is present but parked. Neither is a thing to guess at.
- The rail's **Find in menu** does what Ctrl-K already does, against the same tree. Kept rather than removed, because removing a working control is the owner's call; worth revisiting if nobody uses it.
- **Page widths are per page** — 760 / 900 / 1100 / 1400 / 1600px across sixty files. At 1920 the client filter row stretches to 1550px, which is the worst-looking view in the application. Out of scope for a shell pass; a deliberate pass over the page containers would fix it.
- `AUTH_SKIP_2FA=true` is set in `.env` for the trial. `playwright.config.mjs` forces it off for the suite, so the tests still exercise the real sign-in. **Vercel has its own environment**: the deployed trial keeps asking for a code until the variable is set there too, and `npm run doctor` refuses go-live while it is on, by design.

**From P3-23**

- **Clicking "Create client" does nothing, and this needs a human to try
  it.** On `/clients/new`, with the form valid (`checkValidity()` true on
  all four required fields), clicking the submit button produces **no
  server action call, no message, no row, no console error and no
  navigation** — five times, in a real browser, including after waiting for
  the on-blur duplicate check to finish. The same form submitted with
  `form.requestSubmit()` from JavaScript runs `createClient` and returns its
  validation message, so the action and the wiring are fine. Either
  Playwright's click is being swallowed by something (a disabled flicker
  from the duplicate check's transition, an overlay) **or client creation is
  broken for anybody using a mouse** — and those two have very different
  consequences. Thirty seconds by hand settles it: open the form, fill it,
  press Create. Six `clients.spec.js` tests are red behind this.
- **The suite's 5.6 hours is the reason it rotted.** Nobody re-runs a suite
  that takes most of a working day, so each step's "2 Playwright tests
  waiting on Atlas" went unverified until they were all waiting together.
  D77 is the recommendation; until it is taken, the working loop is one
  spec file at a time (one to three minutes each).
- **Three of the four big causes were the product's, not the tests'.** The
  top bar's label collided with every form field called Client, PAN or
  GSTIN; P3-8 changed a refused control from hidden to disabled-with-reason;
  P3-5 put a review gate before filing. Each was a deliberate decision that
  nothing propagated to the tests, because the tests could not be run.
- **One sign-in helper now** (`tests/e2e/signin.js`), where there were forty
  copies. It also does two things no copy did: it handles both second steps
  (enrolment and code) and the `AUTH_SKIP_2FA` case, and it **retries a
  refused code in the next time step** — the replay guard refuses a step
  already used, which is right in production and wrong for a suite that
  signs the same person in ten times a minute. The two client-portal specs
  keep their own helper: a client signs in on a different screen.
- **`gotoForm()` waits for hydration**, because Playwright types faster than
  a browser hydrates and a `fill()` before hydration is invisible to React.
  Worth knowing beyond the suite: **these forms have no no-JavaScript
  fallback** — before hydration the submit reloads the page and loses what
  was typed. A person takes half a minute to type a client's name, so it is
  the suite's race and not theirs, but it is a real property of the forms.
- **Playwright's budget is now 60s per test and 15s per assertion**, raised
  once in the config rather than per assertion. It must not become a way to
  stop noticing slowness: an audited write is one or two seconds, and a
  single click that needs more than a few is worth reading the query for.
- **Two fixture bugs, found only because the specs finally ran**: the UDIN
  in `registers.spec.js` was 16 characters where the form demands 18, so
  every test in that file failed on a validation message rather than on its
  subject; and `settings.spec.js` built a `DueDateRule` without the
  `formula` the model has required since step 7b, so its `beforeAll` threw
  and all ten of its tests counted as "waiting on Atlas".
- **The specs share one database and interfere.** `screens.spec.js` passes
  alone and failed inside the full run, because another spec had registered
  a branch GSTIN and a third had confirmed the due-date rules. `workers: 1`
  is not enough; real isolation means a branch and a firm record per spec,
  or a database per spec. It is the next structural job after D77.
- **`settings.spec.js`'s last failure is its own and destructive**: it
  confirms *every* due-date rule on screen to prove the warning goes, which
  also writes a partner's confirmation onto the firm's real statutory rules.
  It wants rethinking as much as fixing.
- **What is still red, by cause**: the clients form (above, 6 tests), books
  and milestones around filing after P3-1 (4), docs templates (5),
  due-dates including an off-by-one on an extension date that looks real
  (4), team, portal-pages, icai, automation, documents, docs, lab,
  round-trip, cover, checklist, client-360, permissions, tiers, view,
  signin-flow, portal (1-3 each).

**From P3-22d**

- **Two of the five screens are not built, and both need the owner.**
  `/settings/customise` would let the firm rename what the system calls
  things and add fields of its own — both change the data model, so the
  decision comes first. `/settings/modules` is stranger: switching modules
  off was proposed by the prototype and recommended against on 27-10-2026,
  and that recommendation was accepted — so the honest screen says that,
  and offering switches would contradict a decision already taken. Say
  which of the two you want and it is a short step; left alone, both keep
  their stub, which names the sub-step and does not pretend.
- **The coverage map's "not built" list is written by hand**, because a
  thing that does not exist leaves no trace to derive it from. A test keeps
  the half it can: every entry that names a route must name one that
  exists. Nothing stops the *reasons* going stale, so it is worth reading
  through whenever a phase closes — it is ten entries, not a hundred.
- **The coverage map counts screens, it does not list them.** A reader who
  wants to know whether something exists has to open the menu; the page
  answers "how much is there" and "what is deliberately missing". Listing
  all 58 labels again would be the second inventory this step exists to
  avoid.
- **What's new reads eight record types** — the firm's record, branches,
  services, due-date rules, document templates, reminder rules, team
  accounts and procedures. A ninth kind of settings record added later will
  not appear until it is added to that list; the alternative was to exclude
  the day's work by type, which breaks the other way round the moment a new
  *work* collection arrives.
- **It shows changes, not events.** A sign-in is recorded against a team
  member and is excluded on purpose: it is on the Portal log and the
  security screen. So is a failed one.
- **Setup's two own counts are "is there anybody but the partner" and "is
  there a real client".** Neither is a warning anywhere else, because
  neither is a *problem* — a firm that has not added its staff yet is not
  broken, it is new. That is why they are not in `attention.js`.
- **Setup is partner-only** (`usersSettings` edit). It is a page about the
  firm's own readiness and every step links to a screen only a partner can
  use.
- The setup page says a step is done when nothing is left to count, which
  means **a step can tick itself without anybody looking at it** — a branch
  created with a GSTIN already on it, for instance. That is the honest
  reading of "read from the records", and it is why each step keeps a link
  that says "Open it anyway".
- **`tests/e2e/settings.spec.js` had never run**: its fixture built a
  `DueDateRule` without the `formula` the model has required since step 7b,
  so `beforeAll` threw and all of its tests were counted as "waiting on
  Atlas". It runs now, 9 of 10 pass, and the two stale rail tests were
  rewritten against P3-22a's menu (the group is "Audit and certificates",
  not "Practice"). **The one still failing is P2-10b's own**: it confirms
  every due-date rule on screen and expects the warning to go, which also
  means it writes a confirmation onto the firm's real statutory rules —
  worth rethinking as well as fixing.
- The sign-in helper that forty specs share **gets flaky after several
  sign-ins in one file**, which is why a spec can pass alone and fail in
  company. It is a suite-wide problem, not this step's, and it wants one
  pass of its own.

**From P3-22c**

- **Nothing reminds anybody.** A to-do that is late sits on the list, on My
  tasks and in the badge, and no email is sent — spec §12's events are about
  engagements and invoices, and a daily "you have three to-dos" message is
  the fastest way to teach people to ignore the firm's email. Worth adding
  to the digest (P3-9b) rather than as a mail of its own, and it is a few
  lines when the owner wants it.
- **A to-do does not repeat.** "Reconcile the bank every Monday" has to be
  written again each week. Recurrence is a real feature with a real cost
  (the job runner would have to generate them, and generated to-dos nobody
  ticks pile up) and a firm of five is better served by writing the line
  again.
- **It cannot be attached to a job**, only to a client. `engagementId` is
  deliberately not on the model: nothing links to a to-do from an engagement
  yet, so the field would have been a column nobody fills. One line in the
  model and one select when the engagement screen wants it.
- **A CA reaches a colleague's to-do only if that person reports to them**,
  because that is what the `team` scope means in `inScope()`. A CA who wants
  to re-date somebody else's writes their own instead. If a CA should be
  able to work the whole branch's list, the matrix row changes to `branch`
  and nothing else does.
- **The tick is believed.** Anybody who may change a row can say it is done,
  and the audit entry names them and the moment — which is the whole record.
  There is no "are you sure" and no second person, by the owner's decision
  (D75).
- **The badge counts late and today only**, so it reaches zero. A to-do due
  on Friday is on the list but not on the badge, which means the badge
  cannot be used to see "what is coming" — that is the list's job.
- The list reads at most 500 open and 100 finished rows and says nothing
  when it hits that, like the other caps in the system. Far above a firm of
  five keeping a working list; worth revisiting only if to-dos are being
  written and never ticked, which is its own problem.
- **`/todos` is the ninth screen with its own collection and the first since
  P3-11's notices.** Everything in P3-22b was a reading of records; this one
  adds rows, so the seed script (`--sample`) does not know about it and a
  fresh database shows an empty list with the add box, which is the right
  first impression.

**From P3-22b**

- **Nine screens, nothing new stored.** Every figure on them is read off
  fields earlier steps already write, so there is no second record of a
  month, a file or an absence that could disagree with the job itself. The
  cost of that choice is that a screen is only as good as what was recorded:
  the GST board says "waiting for data" for a client nobody has asked yet,
  because asking is not a thing the system keeps.
- **The audit-store bug was latent before today and is worth understanding.**
  Four route bundles each had their own copy of `lib/audit/context.js`, and
  the Mongoose model is registered once per process by whichever route is hit
  first — so which pairs of routes worked depended on the order the first
  requests arrived in. Opening `/billing` and then recording a payment was
  simply the first pair anybody had tried. It is fixed at the root (the store
  is on `globalThis`), and the same hazard applies to any other
  module-scope singleton that the plugin side reads: there is only this one
  today, and `lib/db.js` was already doing it the right way.
- **Six older browser specs were repaired on the way, and two of them were
  broken fixtures rather than stale selectors.** `registers.spec.js` tried to
  create two engagements for one client, one service and one period, which
  the unique index forbids, so its whole suite died in `beforeAll`; three
  specs picked a `<select>` option by a regex label, which Playwright has
  never accepted and `tests/e2e/alerts.js` exists to work around. The
  selector repairs were P3-22a's and D71's doing: the rail now has its own
  "Overdue" link and the top bar's search button is labelled "Search
  clients, PAN, GSTIN", both of which older specs matched by accident.
- **Two browser specs are still red, and neither is this step's.**
  `registers.spec.js` (6 tests) asserts on a UDIN panel that P2-13 rebuilt —
  `getByLabel("UDIN")` now matches three controls — and
  `issues.spec.js:286` depends on the test before it not having accepted the
  one document that put a row on an employee's Issues. Both are stale tests
  over working screens, and both want a pass of their own; say the word and
  it is a short step.
- **The five rail tests skip on the phone project** (`nav.spec.js`), because
  at 390px the menu is a drawer and the drawer has a test of its own that
  makes its own phone context. The nine new screens are tested at both
  widths.
- **`/billing`'s group filter narrows the rows, not the figures of the
  firm.** Collections, Ready to bill and Invoices all honour `?group=`, and
  the heading says which group — but the five ageing buckets above the table
  are that group's, not the firm's, which is right for the page and worth
  knowing before reading a figure out loud.
- **The firm dashboard is the same boards as before**, moved. No tile was
  added, and the five reports that wait on time tracking (Phase 2) are still
  absent rather than empty.
- **The GST board opens on the most recent month that has GST work**, which
  is a query rather than a rule: October's return is filed in November, so
  "this month" would be the wrong default half the year. Pick any of six
  months from the selector.
- **The audit studio's two boards show every audit engagement**, including
  the ones with no file opened yet — a file is created the first time
  somebody opens the studio on the job, so "Not opened" is the honest first
  group and not a gap.
- **The logins vault shows what is held and never reveals it.** No reveal
  button, and the ciphertext is `select: false` on the model, so the page
  never had a password in memory to leak. It also lists clients with no login
  at all, which is new information the firm has not had.
- **Leave and cover reads 30 days ahead** and lists what falls due inside
  each absence — the warning spec §9 asks for. It cannot warn about a cover
  who is themselves away on the day, because `coveringOn()` allows one hop
  by design (P3-16); the overlap check at recording time is what stops that.
- **The TDS tick has no second gate.** Anybody who may edit invoices can say
  a credit has appeared in 26AS, and the audit entry names them. If that
  should be the accounts person only, or need a partner, it is one line in
  the matrix.
- The accounts desk reads at most 200 rows per panel and the vault 5,000
  logins — far above this firm, and both say nothing when they hit it, which
  is the one place on these screens where a cap is silent.

**From P3-22a**

- **The prototype file is still missing** (D70), so the icons are
  stand-ins and nothing here has been compared with `NAV13` itself. The
  fixture was generated from `lib/nav/tree.js`, which makes the browser
  test a drift test between the rail and the tree — not proof that the
  labels match the prototype.
- **Nineteen routes are real pages that do nothing yet**, each naming its
  sub-step. They are honest, not finished.
- **Compact mode and the drawer were built, the compact dot is untested**:
  the browser tests cover the drawer, the accordion and find-in-menu, and
  the 7px badge dot at a group's icon in compact mode is only checked by
  eye.
- The group badge shows **only while the group is closed**, which is the
  prototype's rule; the counts behind it are recomputed on every page load
  (about fifteen bounded queries). Cache per user for a minute if it ever
  shows in the slow log.
- `/calendar?freq=annual` **takes the half-yearly services with it**, since
  a client asking for the annual filings means those too. One-time work
  belongs to no recurrence and appears under none of the three.
- The five audit categories match on the **words in `auditType`**, which is
  free text the firm typed. An audit whose type says nothing appears under
  "All files" and under none of the five.


**From P3-20a**

- **Nothing has run against a database** — though the lab is the one screen
  that barely needs one: the reading and the checks are pure, and only
  "post the summary to a job" touches Atlas. The 2 Playwright tests do the
  flow when the cluster exists.
- **CSV only.** Reading `.xlsx` needs a dependency the project does not
  have, exactly as at Step 3; the screen teaches the same "Save as → CSV
  UTF-8" line the import does.
- **No .xlsx download of the summary.** The summary posts to a job, which
  is the record that matters; a file download would need the uploaded rows
  to survive the request, which is the thing D66 refuses.
- **The checks are generic on purpose.** Nothing GST-specific, nothing
  about TDS rates or HSN codes — those are rules, and inventing one is what
  CLAUDE.md rule 8 forbids. A real one, verified by a partner, could be
  added per check the way the notice-law table is.
- **The mapping is not remembered.** The same client's register, mapped
  again every month. A saved mapping per client is a small job and an
  obvious next one.
- **5 MB and 50,000 rows**, read in memory in the request. Above that it
  needs a job and a different design.
- D51's hope is **still not satisfied**: the sixteen audit tests are
  recorded, not run, and the lab does not run them either — it checks a
  file somebody uploaded, which is not the same as testing a ledger the
  system holds.

**From P3-19**

- **Every procedure is unwritten.** That is the design (D65), and it is
  also the work the owner now owns: until somebody at PHMG writes the first
  few, the **?** panel is a well-built empty room. The ones worth writing
  are the ones a partner explains out loud most often — taking on a client,
  reviewing before a filing, chasing money.
- **Sixteen screens are on the shelf**, chosen by me. A screen that is not
  on the list says "not one the firm keeps a procedure for" rather than
  offering to write one; adding another is a line in `lib/learning/screens.js`.
- **Nothing links a playbook to the work it is about** beyond the screen
  list: a playbook does not appear on the engagement it describes, and
  there is no "this job follows the GST playbook" anywhere.
- **No quiz and no exercise**, which the prototype's playbooks have. Marking
  an answer needs the answers, and a quiz nobody wrote is a quiz nobody
  takes.
- **No search across procedures**, and no versions: rewriting one replaces
  it, and what it said before is in the audit log rather than on screen.
- The panel asks for its procedure **when it is opened**, not on every page
  load — a query per screen for a panel nobody opened would be a tax on
  every page in the system. The cost is a short "Looking…" the first time.

**From P3-18b**

- **Nothing has run against a database.** The draft, its restore and the
  add-another path are code that has never executed; the 2 Playwright tests
  do the flow the moment Atlas exists.
- **One kind of draft: the client onboarding.** The engagement and invoice
  forms have add-another but no keep-for-later. `DRAFT_KINDS` is a list of
  one and the actions take the kind, so a second is a few lines — but
  nobody has asked for one.
- **The draft is kept by a button, not as you type** (D64). Somebody who
  closes the tab without pressing it loses what they typed, exactly as
  before.
- **Quick add is still the command bar**, which navigates to the full form.
  There is no modal that creates a client without leaving the page; the
  forms are long enough that a modal would be a worse version of the screen
  they already have.
- **Modules on and off is not built**, by recommendation accepted on
  27-10-2026 — see the row in the step table.

**From P3-18a**

- **Nothing has run against a database.** The export, the held changes and
  the undo are all code that has never executed. The 2 Playwright tests do
  the whole flow the moment Atlas exists.
- **Contacts and addresses are not updated by a sheet.** Their columns are
  read when a row creates a client and ignored when it updates one: merging
  two lists of people from a spreadsheet is a different problem, and it
  should be done on the client's own page where you can see who you are
  about to overwrite.
- **A PAN change does not re-check the GSTINs already on the record.** The
  validator refuses a GSTIN that disagrees with the PAN *in the same sheet*,
  but changing only the PAN can leave the client's existing GSTINs
  belonging to the old one. A partner reads the held change, which is the
  safety net; a proper cross-check belongs with the identity rules.
- **Undo is this batch only**, and only for the plain fields. Leave the
  page and the record of what changed is the client's Activity tab, which
  has every field-level before and after.
- **A held change is never chased.** It sits on `/clients/changes` and on
  Issues until a partner decides; nothing emails them, and nothing expires
  it.
- The sheet reads at most 5,000 rows and 2 MB, and the export at most
  10,000 clients — the same ceilings the import has carried since Step 3.
- **Quick add, save-and-add-another, kept drafts and modules are P3-18b**,
  not built.

**From P3-17b**

- **Nothing has run against a database.** The announcement, its
  acknowledgements, the sending of a with-client message and the client's
  reply are all code that has never executed. The 2 Playwright tests do the
  flow the moment Atlas exists.
- **A client's reply arrives by portal only.** They can also reply to the
  email, which lands in the `notices@` mailbox and not in the thread —
  nothing reads that mailbox, and nothing in Phase 1 or 3 does. The
  template says "reply to this email, or in your portal", which is honest
  but means two places to look.
- **A client cannot start a conversation about a job.** They can ask a
  question on their profile (P2-9b) and answer a document request (P3-2).
  Say if they should be able to open a thread on a job.
- **No digest of announcements and no per-person inbox settings**: an
  announcement emails everybody it reaches immediately. The firm can switch
  the whole rule off in Settings → Messages, which is all or nothing.
- An announcement dated into the future is **told about now** rather than
  on the morning it goes up. The inbox strip respects the dates; the email
  does not wait. A scheduled job for something this rare would be more
  machinery than it is worth.
- Announcements reach **staff only**, and the audience rules deliberately
  have no "all clients" option.
- The conversation split is on the **engagement** only. A client record's
  notes and a notice's comments are still one internal list.

**From P3-17a**

- **Nothing has run against a database.** The mention notification, the
  snooze and the Notify log are all code that has never executed. The 2
  Playwright tests do the flow the moment Atlas exists.
- ~~**The "Internal only" tick is still a lie**~~ — **fixed in P3-17b**: a
  comment on the with-client thread is sent when it is posted, and the row
  says so, or says it was held.
- **Notify is on the engagement only.** The client record, the invoice and
  the notice have no button yet, though the action and the builder are
  general enough to carry one.
- **No attachments on a Notify.** The mail path supports them (an invoice
  PDF goes that way); the screen does not offer them.
- The inbox holds the last 300 rows and the collection still clears itself
  after sixty days, so a snooze longer than that outlives the thing it was
  put off — the three choices stop at a week, so it cannot happen by
  accident.
- ~~**Announcements, acknowledgement and the with-client thread are
  P3-17b**, not built~~ — **built in P3-17b**, which also added the
  *Announcements* group to the inbox that this note wrongly claimed was
  already there. Per-person inbox settings and a digest of announcements
  are still not built.
- A mention still only exists on an **engagement** comment. Client notes
  and notice comments do not parse mentions.

**From P3-16**

- **Nothing has run against a database.** The leave rows, the cover lookup
  on every Issues load and the two counts behind the banner are all code
  that has never executed. The 2 Playwright tests do the whole flow the
  moment Atlas exists.
- **Every service still has a blank effort estimate**, so the board counts
  jobs and the strip at the top says how many are unestimated. Nothing is
  wrong until the owner fills them in — but "hours vs capacity", which is
  what spec §9 asks for, only appears once a lane's services all have one.
- **Review effort is not estimated at all** (D57). The review lane is
  counted in jobs, which means a CA's capacity line is about preparation
  they may not be doing. Say if a second estimate per service is wanted.
- **The firm's holiday list still does not exist**, so capacity counts every
  Monday-to-Friday as a working day. `isWorkingDay` has said this since
  Step 7 and it is the same gap: a holiday master is a table the owner
  verifies (CLAUDE.md rule 8).
- **No drag-and-drop** between people on the board (owner, 27-10-2026:
  later). Moving work is the take-over page, which enforces the same rules
  the engagement screen does.
- **There is no leave request.** A partner records it (D58). Somebody
  wanting leave asks a partner the way they do now; when P3-17's inbox
  exists, that conversation has a home.
- **A cover's copy of a reminder is not access-checked** (D59's loose end).
  The cover is added in `peopleFor`, which is the one door every staff
  message goes through and knows nothing about the client the message is
  about. An employee cover can therefore be told, by email, about a job
  they could not open on screen.
- Leave does not reduce anybody's **articleship leave balance** (spec §9's
  intern rules). `articleship.leaveTaken` is still a figure somebody types,
  and exam leave recorded here does not move it.
- The plan reads at most 3,000 open engagements and 200 people a week. Far
  above the firm's size, and the same ceiling the Issues page carries.

**From P3-15**

- **Nothing has been signed.** Like every step since Step 1, none of this
  has run against a database: the register row, the transaction that writes
  it with the signature, and the gapless certificate series are all code
  that has never executed. The 2 Playwright tests do the whole flow the
  moment Atlas exists.
- **The certificate is not a PDF.** It assembles into a document you can
  read on screen and nothing prints it on the firm's letterhead. The invoice
  PDF (Step 8) is the pattern to follow; it was left out because the wording
  has to be confirmed by a partner before anything is worth printing.
- **The wording is a first draft and five partners' readings are owed.** Net
  worth, turnover, drawing power, grant utilisation and capital
  contribution each need confirming once (D54). Until then the strip on the
  register says so and signing is refused.
- A certificate's number is taken when the **draft** is started, not when it
  is signed — so an abandoned draft keeps its number and the series shows
  the gap in use rather than a hole. That is the opposite of the invoice rule
  and it is deliberate; the register's question is "what were we asked to
  certify".
- **The UDIN check is a shape check and says so.** Year, membership number,
  length and the firm-wide duplicate are all checked; whether the number was
  ever issued is a question only the ICAI portal can answer, and the message
  says that rather than showing a tick that reads as "valid".
- The SA 700 sections carry the **standard's structure and a first draft of
  its wording**, which nobody has confirmed. There is no `ruleConfirmations`
  gate on the audit report yet — P3-13's area standards have one, the report
  wording does not. Worth adding if the owner wants the same discipline on
  the report as on the certificate.
- **Key audit matters are a single section, not a list of matters.** SA 701
  wants each matter, why it was significant and how it was addressed. The
  report asks for one piece of prose instead, which is the smaller claim and
  enough for a firm with no listed clients.
- The report has no **place and date** fields; the signature block carries
  them as `[place]` and `[date]` placeholders for whoever types the final
  document. The certificate's `as at` date is real; the report's is not yet.

**From P3-21a**

- **Nobody has looked at it.** The palette is measured, not seen — every
  contrast pair is computed in `tests/contrast.test.js`, but no browser has
  drawn a single screen in the new colours. Measured and seen are different
  things, and the second one needs the owner opening the app.
- **The screens are still the old shapes** (P3-21b). They have the
  prototype's colours and the prototype's type, in the old layouts: 6px
  corners where the prototype has 12, hairline rules where it has soft
  fills, and no use yet of the five new tokens (`sunk`, `faint`,
  `carbon-soft`, `rule-soft`, the `-soft` status fills). So this is a
  halfway state that looks deliberate rather than broken, but it is not the
  prototype.
- **The eight signature moments from Step 11 are untouched and unparked.**
  The audit tick, the completion stamp and the login scene still carry the
  ledger language. The theme setting that was meant to park them is P3-21b.
- Paper grain, ledger ruling and brass are switched off, not removed — the
  `.ledger-rule` class still sits on a handful of tables and now paints
  nothing, and `.ledger-rule-lines` holds the original rule so a reversal is
  a rename. Cheap to carry; worth sweeping out once the decision has stood
  for a while.
- ~~The dark theme's values are duplicated between the
  `prefers-color-scheme` block and `[data-theme="dark"]`, and the contrast
  test only reads the second~~ — **closed in this step.** The duplication
  stands (CSS has no way to say it once that works in both places), but the
  parser now returns both copies, the whole contrast suite runs against
  each, and one test holds them to being identical. A colour changed in one
  place only now fails, instead of being invisible to whichever half of the
  firm is on the other path.

**From P3-3**

- **Nothing here has run against a database.** 14 new unit tests cover the
  promise logic and the sweep without one. There is no new Playwright test:
  the behaviour worth proving in a browser is that a reminder does *not* go
  out, and the reminder suites are themselves skipped until Atlas exists, so
  a test of an absence on top of a skip would prove nothing.
- **A promise is recorded by hand and nothing verifies it.** If a client
  pays, the promise sits there until its date passes. Harmless — the invoice
  is Paid and the sweep ignores it either way — but the promise is not
  cleared, so the ledger shows a promise that was kept without saying so.
- **Nothing chases a broken promise.** The receivables page lists them, which
  is where somebody looks, but no reminder or task is raised. That belongs
  with Issues in P3-6, where it is one more row with a button.
- **Advances are listed, not applied from the list.** The credit block links
  to the client's ledger, where the existing payment screen does the applying.
  A one-click "apply to the oldest invoice" would be the prototype's version
  and is a small follow-up.
- The advances figure reads the last 5,000 payments rather than aggregating,
  which is nothing at this firm's size and would not scale to a much larger
  practice. Same shape as the `$expr` note in P2-10c.

**From P3-2**

- **Nothing here has run against a database.** 30 new unit tests cover the
  state machine without one; the two Playwright tests are skipped like every
  other suite. The portal write in particular has never been exercised
  against a real session, and it is the one that most wants to be.
- **The automatic format check does not exist yet.** The `Format checked`
  state is real and a submission can arrive in it, but nothing produces that
  verdict — the GST template reader that would is P3-12. Until then every
  upload lands as `Received`, which is correct, just one state short.
- **A replacement reason reaches the client only by email**, and client email
  is off by default (Step 9a). So today the reason is recorded, shown on the
  job and shown on the portal, and not delivered. WhatsApp waits on the
  provider decision still open in spec §18.
- **A delegate with a mobile number gets nothing sent.** The link is created
  and visible to the firm, who has to pass it on. Same reason as above.
- **`clientReply` holds one reply at a time.** A client who says they cannot
  provide something and then asks a question overwrites the first. Fine for
  now; a list would be the honest shape if it turns out people do both.
- The portal write is audited as `client:<id>` with the name suffixed
  "(client)", which keeps it distinguishable in the log but means it is not a
  `User` id. Anything that joins audit entries to the team table will not
  resolve it, by design.

**From P3-1**

- **Nothing here has run against a database.** 52 new unit tests pass and the
  2 Playwright tests are skipped like every other suite. The milestone
  arithmetic is covered without a database; the saving, the audit entries and
  the transaction are not.
- **The overdue count will jump** the first time this meets real data, because
  a GST month with GSTR-1 unfiled after the 11th is now overdue and was not
  before (D22). That is a correction, not a regression, but it will look like
  a regression on the dashboard.
- **Work created before P3-1 becomes one milestone, not two.** There is
  nothing in the old row to say which of a pair the acknowledgement belonged
  to, so months from before the change can never show the GSTR-1 / GSTR-3B
  split. `npm run backfill:milestones -- --dry-run` reports what it would do.
- **Backfilled punctuality is a guess and is labelled one.** The old shape
  never recorded the due date in force at filing, so the backfill takes
  today's `statutoryDue`. For anything whose deadline was later extended that
  is wrong, and the audit note on each row says so.
- **The punctuality report still reads the derived fields**, not the
  milestones, so it judges a part-filed month by one date. It is not wrong,
  it is coarse; reading per-milestone is a small follow-up and was left out
  deliberately to keep this step to the shape of the record.
- **`saveFiling` is now two things.** It keeps UDIN and the audit report, and
  writes the old `ackNo`/`filedOn` only for work that has no milestones. That
  is a seam, and it should close once the backfill has run everywhere.
- The e2e spec builds its milestones by hand rather than from a verified rule,
  so it proves the panel and the actions, not the generator's wiring.

**From P2-10d — and the honest state of Phase 2**

- **Everything is built. Nothing has run.** Every one of the eleven Phase 2
  steps ends the same way Phase 1 did: the code is complete, 815 unit tests
  pass, and no row has ever been written to a database. **190 Playwright
  tests are waiting on Atlas**, and they are the only thing that will turn
  any of this from "built" into "works".
- **The two portal suites should be run first.** They are what prove
  somebody outside the firm cannot reach anything of the firm's, and that
  is the one new risk Phase 2 introduced.
- The rail's group is tested through the rule, not the rendering: the test
  reproduces what `LeftRail.jsx` does rather than rendering it, because
  there is no component test setup (no Storybook either, by owner
  decision). If the two drift, the test will not notice.
- **The rail is now eleven entries plus a group of five.** That is close to
  the ceiling for a left rail; the next thing added should probably join a
  group rather than start a twelfth row.
- `scripts/doctor.js` reads the attention list as a **partner**, since it
  runs from a terminal with nobody signed in. That is deliberate — the
  point of the doctor is to see everything — but it means the doctor shows
  items a given person's Settings screen would not.
- The Phase 2 acceptance rows are the agent's reading of what each step
  should prove. **A partner should disagree with at least one of them**,
  and that disagreement is worth more than the list.

**From P2-10c**

- **Nothing here has run against a database**, so no report has ever
  returned a row. The shapes and the definitions are unit-tested; the
  queries are not.
- **Punctuality will look thin until the due-date rules are confirmed.**
  Every filing with no deadline behind it lands in the "no deadline
  recorded" column, so on a fresh database that column is the whole
  report. This is the same dependency the Settings strip now warns about.
- **The late-filings headline uses `$expr`**, which compares two fields
  and therefore cannot use an index. One query over a financial year's
  filings at this firm's size is nothing; it is the one figure on that
  strip that would not scale to a much larger practice.
- Rework counts the **assignee**, not the reviewer. "Who sends the most
  work back" is a different and more delicate question, and nobody has
  asked for it.
- The eight have **no PDF except punctuality and opinions**, and no
  charts. They are tables, like every other report here.
- Tier mix reads the level off each engagement's own snapshot, so a
  service re-tiered last month does not retrospectively move old work
  between columns — correct, and worth knowing when a column looks wrong.

**From P2-10b**

- **Nothing here has run against a database.** Ten counts are stubbed in
  the unit tests; the 4 Playwright tests wait on Atlas like everything
  else.
- **The strip costs ten count queries on every Settings load.** All indexed
  and all in parallel, so it is one round trip's wait, but it is ten more
  than the page used to do. If Settings ever feels slow, this is why.
- **"Services with no fee or no SAC" will read high for a long time** — the
  starter catalog seeded every fee at zero on purpose. It is honest, and it
  will stay on the strip until the firm prices its own work.
- **Permissions still cannot be edited**, which spec §2 asks for. The page
  says so. Making it editable means the matrix moves from code to the
  database, and that is a bigger change than it looks: every check in the
  app reads it.
- The checks are not configurable — nobody can say "stop telling me about
  the sample data". If one becomes a nuisance, say which.
- `/settings/permissions` is a wide table on a phone. It scrolls
  horizontally, which is the honest answer for a matrix of five roles.

**From P2-10a**

- **Nothing here has run against a database**, so the day grouping and the
  figures have never been seen with real entries in them. The two redirect
  assertions ride on the sign-in suite, which is among the oldest waiting
  on Atlas.
- **The figures strip reads up to 5,000 of today's entries** to count five
  numbers. It is one indexed query on a day's worth of rows and nothing
  like a load at this firm's size, but it is a count done in JavaScript
  rather than by the database, and an aggregation is the answer if a day
  ever gets busy. Marked `ponytail:` in `lib/audit/log.js`.
- **A CA's record-type list is drawn from their own branches**, so a type
  that only ever appears on another branch's records is not offered to
  them. Correct, and it means two people can see different options.
- The export is still CSV with a BOM, as it has been since Step 2.
- Retention and archiving are untouched: the log grows for ever until the
  Atlas Online Archive task on the go-live list is done.

**From P2-9b**

- **Nothing here has run against a database.** The scope helper is
  unit-tested hard, but the 4 Playwright tests that try to open another
  client's invoice have never run. With P2-9a's seven, that is **11 portal
  tests waiting**, and they are the first ones to run when Atlas exists.
- **A client cannot upload anything.** The document-request link covers it,
  but it is emailed per request rather than living in the portal, so a
  client who wants to send something unprompted has no button. Worth
  revisiting once the firm has watched people use it.
- **A change request has no reply.** The firm reads it on the Notes tab and
  rings or emails; the portal does not show "we have dealt with this".
  Closing that loop needs a status on the comment, which is a small job
  nobody has asked for yet.
- **Nothing tells the client their invoice is overdue** from the portal.
  The chasing emails (P2-9 / Step 9b) do that, when client email is on.
- The pages cap at 500 rows each with no paging. Far above any client's own
  file.
- **The portal has no empty-state illustrations and no print styles.** A
  client printing their own ledger gets the screen.
- `/client/work` shows the engagement's own status words — "On hold" and
  "Sent back" among them. That is honest, and it may be more than the firm
  wants a client reading. Say if those should be softened to a smaller set.

**From P2-9a**

- **Nothing here has run against a database**, and this is the step where
  that matters most: the four locks are reasoned and unit-tested, but the 7
  Playwright tests that actually walk a client into a staff screen and watch
  the door shut have never run. **They should be the first suite run when
  Atlas exists.**
- **No portal account can be invited by email yet.** The one-time password
  is read out, like a staff account's. Emailing it needs a template and the
  client-email switch thrown, which is a P2-9b or P2-10 job.
- **There is no "forgot password" for clients**, and no self-registration.
  Both are deliberate; a client who is locked out rings the office, which is
  what the lockout message says.
- **A client cannot ask for an account.** Only a CA or a partner creates
  one, and only for a client in their own branch scope.
- `/client` is a single page. Work, documents, invoices, the ledger and the
  change request are **P2-9b** and it says so on screen rather than showing
  dead tabs.
- **Nothing at all is shared yet**: `sharedWithClient` is false everywhere
  and there is no bulk way to tick a year's documents. One at a time, by a
  CA, is the safe start — say if that becomes tedious.
- The portal session uses the **same cookie** as the staff session, so
  signing in as a client on a machine signs the staff user out of it, and
  the other way round. One browser profile is one identity. For a partner
  checking what a client sees, that means a private window.
- The 30-minute idle timeout applies to clients too. It is right for staff
  and may be short for a client who opens a document and reads it; worth
  revisiting once anybody has used it.
- `currentClientUser()` adds **one indexed lookup per request** to the
  portal, the same cost the staff side already pays, and for the same
  reason: a closed account must stop now.

**From P2-8c**

- **No Word file has been opened in Word.** The zip structure is verified in
  a test and two samples are in the scratchpad (paths above), but the first
  real check is the owner double-clicking one. If anything is wrong it will
  be the letterhead spacing, not the text.
- The test that unzips a `.docx` uses **`fflate`, which is a transitive
  dependency**, not one we declared. It is only used in a test, and if a
  future install drops it that test fails loudly rather than anything
  shipping broken — but it is worth knowing.
- **An edited Word copy of an issued letter comes back to nobody.** The
  system's record is the words it issued; what somebody does to the
  downloaded file afterwards is outside it. The footer carries the issue
  date and the UDIN so a changed copy is visibly a copy.
- No page break control, no tables, no images: these are letters. A
  template that needs a table wants a different renderer.

**From P2-8b**

- **Nothing here has run against a database**, like every step since Step 1.
  The resolver, the rules and the renderer are unit-tested; the 4 Playwright
  tests wait on Atlas.
- **The eight templates are unapproved and should stay that way until read.**
  Approving one is a minute's work per letter and it is the firm's
  professional judgement, not the system's. Until then every document is
  watermarked DRAFT, which is the honest state.
- **A generated document is not in the client's document file.** It lives on
  the engagement, and it is not a `Document` row, because storing one would
  need a server-side write to the file gateway that does not exist (the
  gateway takes uploads from a browser with a signed ticket). If a signed
  letter should sit alongside the client's uploads, that is the piece of
  plumbing to add, and it is not small.
- **A final cannot be emailed yet.** The renderer produces a buffer the
  mailer could attach the day it is asked to, exactly as the invoice PDF
  does, but no template is wired to an email.
- **Nothing numbers the documents.** An invoice series has to be gapless; a
  letter does not, so a generated document is identified by its template,
  its client and its date. Say if the firm wants a reference on its
  correspondence.
- **A draft is not editable.** It is the template's words filled in, and the
  way to change them is to change the record or the template. Per-document
  editing — for the blanks a certificate leaves to be typed in by hand, like
  the figure on a net worth certificate — is the obvious next thing, and
  those templates currently print `______` for a person to complete by hand
  after printing.
- The sample dataset seeds no documents; the starter templates come from
  `scripts/seed.js`, which every environment runs.
- `signatory.designation` is "Partner" or "Chartered Accountant" from the
  role. A firm with a designated partner or a different signing style edits
  the letter's template.
- DOCX output is **P2-8c** and needs the `docx` dependency, which has not
  been approved.

**From P2-8a**

- **Nothing here has run against a database**, like every step since Step 1.
  The late arithmetic is unit-tested hard; the 3 Playwright tests wait on
  Atlas.
- **Most rows will say "Filed on time" by default, and that is a half-truth.**
  Late is measured against `statutoryDue`, which stays blank until a partner
  verifies the rule it comes from (Step 7b, CLAUDE.md rule 8). Until those 11
  rules are confirmed in Settings → Due dates, a filing with no deadline
  behind it is not called late, because the system does not know. The books
  are only as honest as that screen.
- **Nothing reminds anybody that a filing date is missing.** A return that
  went in last week and was never recorded sits in the book as "past the
  deadline, not filed" until somebody types the date. A reminder for it would
  be a reasonable P2-9 addition; say if you want one.
- **The books do not reach outside an engagement.** A certificate issued
  without one — which the UDIN register deliberately allows — appears in the
  UDIN register and in no book. Rare, and the register is the record either
  way.
- Payroll filings sit in Tax (D13). If the firm comes to want a Payroll book
  of its own, it is one entry in `lib/practice/books.js`.
- The year filter offers the current financial year and two before it, like
  the UDIN register. Older work is in the database and reachable by URL, just
  not on a chip.
- There is **no rail entry** for the three books yet — they are reached from
  Settings and from the engagement header. The Practice group in the left rail
  is P2-10d.
- A book caps at 1,000 rows on screen (20,000 in the export) and says so.
  Far above the firm's size.

**From P2-7**

- **Nothing here has run against a database**, like every step since Step 1.
  The UDIN shape, the expiry arithmetic and the reminder's timing are
  unit-tested; the 8 Playwright tests — including the one that matters, the
  same UDIN refused on a second engagement — wait on Atlas.
- **P2-1's permission comment for `dsc` is now wrong**: it says an employee
  may record a token's movements, and there are no movements (owner decision
  D12). The row itself still reads sensibly — an employee may add and correct
  a certificate in their own scope — but the comment should be corrected when
  P2-10b builds the permissions screen that quotes it.
- **A UDIN is recorded against the member who saved it**, if they are a member
  at all. An employee entering what a partner generated leaves it blank rather
  than claiming it, and the register screen is where it gets set — so a number
  entered by an employee and never revisited has no member against it.
- **The UDIN register has no export.** Spec §17 wants Excel on every list and
  this one is a list the ICAI might ask about; it was left out because the
  report set is P2-10c, where it belongs beside the others.
- Recording a UDIN from the register screen takes an **engagement id typed in
  by hand**, because the usual way round is the engagement's own filing panel.
  A picker would need the client's engagements loaded as the client changes —
  worth doing if anybody actually works that way round.
- **A renewed DSC is a new row.** Nothing links the replacement to the
  certificate it replaced, so the register shows both until the old one is
  taken off. Say if a renewal chain matters.
- **No reminder about the firm's own certificates** — the register is for
  clients' DSCs. If the firm holds its own, it is a client-less row the model
  does not allow.
- The `dscExpiring` rule has **never fired**, like every other reminder: the
  sweep has not run against a database.
- The dashboard tile counts certificates **expiring within 30 days**, a fixed
  window, while the reminder uses the firm's own notice periods. Deliberate —
  a tile that moved with the settings would be harder to read than one that
  always means the same thing — but they can disagree about what "soon" is.

**From P2-6**

- **Nothing here has run against a database**, like every step since Step 1.
  The firm record, the CPE arithmetic and `{firm}` in an email are unit-tested;
  the 6 Playwright tests wait on Atlas.
- **The firm's record is empty until a partner saves it**, and until then the
  app signs itself with the name that used to be hardcoded — right for this
  firm, wrong for anybody else. `npm run doctor` warns about it. It is
  deliberately **not seeded**: seeding an FRN or a peer review date would be
  inventing the firm's own credentials.
- **No CPE target is set**, by design, so no year is judged. The ICAI's
  requirements depend on whether a member holds a Certificate of Practice and
  on their age, and they change — they are the firm's figures to enter.
- **CPE is per year only.** If the ICAI block the firm works to is a rolling
  three-year one, that is not modelled; the notes field can hold the rule and
  the per-year figures still add up. Say if a block total is wanted.
- **Nothing reminds anybody about CPE.** No rule fires as a year closes with
  hours short, and the peer review expiry raises nothing either — both are
  notification rules, and spec §12's set is closed until somebody asks.
- **Bank details stay in `FIRM_BANK_DETAILS`**, an environment variable, not in
  `FirmSettings`: CLAUDE.md rule 7 keeps bank details out of plain fields, and
  an encrypted settings field would need the vault pattern for one value.
- The firm's **logo is not uploadable** — the invoice is typeset, not
  letterheaded. It would need the file gateway and a size discipline of its own.
- A member's ICAI record and CPE log are **not on their `/team/[id]` page yet**,
  only on Settings → ICAI. The Employee 360's tab set is settled; adding a
  seventh tab is a P2-10d decision.
- `User.cpe` grows for ever. At a couple of dozen entries a year that is fine
  for a decade; a member of twenty years' standing is still under 500
  subdocuments. If it ever matters, the log becomes its own collection.

**From P2-5**

- **Nothing here has run against a database**, like every step since Step 1.
  The grid keying and the balance arithmetic are unit-tested; the 8 Playwright
  tests that drive the counts, the header and the hole in May wait on Atlas.
- **The client's portal accounts are still missing from Team & access** — the
  third part of that tab. `ClientUser` does not exist until P2-9a, so there is
  nothing to list yet.
- **The counts cost five more queries per client page**, run in parallel and
  only for the tabs that person can open. Nothing has been measured against a
  real database; if the case file ever feels slow, these are the first thing to
  look at.
- The Compliance tab offers **this financial year and the two before it**. A
  longer history is a wider query and nobody has asked for one.
- The grid's columns are **the service's own recurrence**, so a service whose
  recurrence was changed in the catalog shows this year under the new shape.
  Engagements keep their snapshot, so the cells are still right; the columns
  are not re-created per period.
- `ClientService.startPeriod` is **not** used to blank out periods before a
  client signed up, so a service added in September shows April to August as
  holes. Deliberate for now — the firm's existing clients are being migrated
  with history — but say if a subscription's start should close the grid off.

**From P2-4**

- **Nothing here has run against a database either**, like every step since
  Step 1. The tier rules, the step floor and the batch sign-off are unit-tested
  on the pure functions; the 8 Playwright tests that drive them through the
  screens are waiting on Atlas.
- **B and C differ only in who may execute.** Both demand a CA to sign off, so
  the enforced difference between a B-tier and a C-tier job is the floor on the
  person doing it (employee against intern) plus the batch sign-off being
  offered for C only. If B-tier work should demand something more of its
  reviewer, say so and it is one line.
- **Giving somebody a step tells them nothing.** `assignTask` writes the name
  and the audit entry but sends no notification — spec §12's events are per
  engagement, not per step. Worth adding if steps are going to be handed round.
- **The batch sign-off lives on the engagements list**, filtered to Under
  review, not inside the CA dashboard's review panel: that panel is tiles that
  link to this list, so the button sits where the rows are. Say if it should be
  on the dashboard itself.
- The starter catalog has **no restricted steps** (see the decisions table), so
  nothing demonstrates per-step `minRole` until the owner sets one or the
  sample data is extended.
- Reports and the compliance grid do **not** break down by tier yet; the report
  set is P2-10c.
- An engagement whose snapshot has no `level` — none exist, but nothing stops
  one — shows an em dash and is counted in no tier rather than guessed at.

**From Step 12**

- **`npm run doctor` has only been run as far as the connection.** The environment half is unit-tested (7 tests) and both failure paths were exercised by hand — no variables set, and a cluster address that does not exist. Everything past the connection, including the vault probe, has never executed; the local vault round trip it performs was proved separately with the same calls.
- **Nothing in Step 12 has been exercised against a database either.** The DPDP export, the redaction, the incident log and both imports are unit-tested and have never written a row. The redaction in particular is irreversible by design, so the rehearsal in `docs/DEPLOY.md` §7 is where it should first be tried — on a scratch client, in the scratch database.
- **Acceptance is 0 of 11 ticked.** Not a defect: every criterion needs the cluster. `docs/ACCEPTANCE.md` says exactly how to check each one, and criterion 11 (backups and a restore actually performed) is owner-side and last.
- **Sentry sends nothing until the firm creates the project** and sets the five variables (`docs/DEPLOY.md` §8). Until then error tracking is Vercel's own logs, which keep about a day.
- **No error has ever been reported to Sentry.** The scrubber is unit-tested against the kinds of event Sentry builds, but no real event has been through it, and the first one will be in production. The scrubber is deliberately blunt for that reason: it drops whole fields rather than trying to be clever about which part of them is safe.
- **Error tracking costs 75 KB on the edge middleware bundle** — 32 KB becomes 107 KB, against Vercel's 1 MB limit. `instrumentation.js` is bundled into the edge runtime as well as Node, and the edge bundler cannot split code, so the SDK lands there whatever the guards say. Measured and accepted; the only way out is to stop reporting server errors. Marked `ponytail:` in the file.
- **No uptime monitor or Atlas alert is set up** — both are accounts the firm owns. `docs/DEPLOY.md` §8 has the two URLs and the three alerts to add.
- The incident log's thresholds (failed sign-ins, downloads in a burst, credential reveals) are a guess at what is unusual for a firm this size, because there is no history to calibrate against. They should be revisited after the pilot month.
- The breach-notification side of DPDP — telling the Data Protection Board and the affected people within the statutory window — is a **process, not a screen**. The incident log records what happened and what was done; who signs the notification and in what words is for the firm's lawyer to settle.
- `scripts/backup-vault.sh` has **never run** — there is no cPanel here and no vault to copy. BigRock is its first execution, like the PHP gateway.
- The team import cannot create a Partner, deliberately. If the firm ever needs a second partner, it is made by hand on the Team screen.
- A staff member who hits a crash now sees a page with a reference on it, and the error reaches Sentry — but there is still no "report a problem" link for the half of problems that are not crashes, where somebody has to tell somebody.

**From Step 11**

- **The 3D scene has never been seen.** It compiles and the capability gate is unit-tested, but no browser has drawn it: the frame rate, the bloom level and whether the arcs read as arcs are all unverified. First real look is the owner opening `/login`.
- **The 3D bundle is ~240 KB gzipped**, against spec §15's 250 KB budget. Measured by gzipping the chunks, not in a browser — worth checking on the network tab at go-live. It is lazy-loaded and most devices never fetch it.
- The camera glide goes to the head office rather than the signed-in person's branch (see decisions). If the firm wants it to land on your own branch, that needs the branch returned after the second factor, not before.
- **No Storybook.** It was deferred from Step 0 and spec §15 asks for every component built in Storybook against a Figma token file. There is no Figma file either (Step 0 decision). These are the two process items from §15 that have not been met, and they are worth raising before Phase 2.
- Empty-state ink illustrations (spec §15) are **not built** — empty lists still explain themselves in words. Cheap to add later; no screen is worse than it was.
- The engagement screen's status timeline is a list, not the illustrated one spec §15 pictures beside the stamp.
- Phosphor icons are all the regular weight; spec §15 asks for duotone in navigation.
- Lighthouse has not been run (spec §15 asks for 90+ on list pages). It needs the app actually serving against Atlas.
- The arrow-key grid sets `tabIndex` directly on the DOM nodes rather than through React state. It is the smaller, more robust thing for a table that is already rendered, but it is the one place in the app where the DOM is written to by hand.

**From Step 10**

- **Nothing has been seen against real data.** Every figure is built from queries that have never run against a populated database, so the first job after Atlas exists is the dashboard-against-list check the Playwright test automates.
- **Five reports from spec §10 are not built**, all for the same reason: timesheet, utilisation, realisation, client profitability and intern exposure / leave all need time tracking, which spec §9 puts in Phase 2. The reports index says so rather than listing them empty.
- **Team utilisation is missing from the partner overview** for the same reason. The tile is absent rather than showing zero.
- "Lost clients" counts clients whose status was set to Closed, dated by when the record was last changed. A client who simply goes quiet is not lost as far as the system knows, and a client record edited for another reason after being closed would be dated by that edit. Good enough for a monthly trend; say if you want a proper `closedOn` date.
- Revenue is grouped by the **category on the engagement's service snapshot**, since an invoice line names the work and not the kind of work. A line typed in by hand with no engagement behind it lands in "Other / ad hoc".
- Reports cap at 5,000 rows (10,000 for the money ones) and say so when they hit it. Far above the firm's size; narrowing the filters is the answer either way.
- ~~`softDelete()` saves outside the audit transaction~~ — **fixed in Step 12**.
- The saved-view dropdown is a row of chips, not a cmdk palette; the command bar in Step 11 is where searching views would belong if the list ever grows long.

**From Step 9b**

- **Nothing has actually been sent.** The sweep has never run against a real database, like everything else since Step 1.
- **Client chasing waits for client email.** While `EMAIL_CLIENTS_ENABLED` is off, client-facing reminders are not composed at all — unlike an invoice, where a held copy is the record of an event, a daily sweep logging a held chase every morning would bury the messages screen and spend a request's four reminders without one arriving. Chasing therefore starts on the day the switch is thrown; nothing from before it is sent retroactively.
- WhatsApp is **not built** (Phase 2, spec §12). The rules exist for email only, and per-client WhatsApp opt-out comes with it.
- The rule cache lives in memory for a minute, so on Vercel a rule switched off can fire from another serverless instance for up to 60 seconds. The settings save clears its own instance immediately.
- **Overdue does not escalate.** Spec §12 says "daily until resolved" and that is what it does — the same email every day, with a line telling people how to make it stop. If it should get louder after a week, say so.
- Reminder audiences are the spec's, but a reminder going to someone who is on leave has no one to fall back to; a holiday or out-of-office rule would need a field the system does not have.
- The sweep reads at most 500 engagements, 500 invoices and 500 open requests a pass. Well above the firm's size; worth revisiting if the client list grows past a few thousand live engagements.

**From Step 3**

- **Interns currently see an empty client list.** Spec §2 limits them to clients they are assigned to, and assignment comes from engagements (Step 5). Showing them their whole branch would be wider than the spec allows, so the list explains itself and stays empty until Step 5.
- Import is **CSV, not .xlsx** (marked `ponytail:` in `lib/csv.js`). The screen tells the owner to use Excel's "Save as → CSV UTF-8". A real .xlsx reader means another dependency — say if it is wanted.
- The client list is a plain server-paged table, **not TanStack Table + Virtual** as spec §15 lists. At 50 rows a page there is nothing to virtualise. Flagged as a deviation to confirm; Step 7's compliance grid is where virtual scrolling genuinely earns its place.
- Opening balances are not imported (spec §17 mentions them for go-live) — they need invoices, so Step 8.
- Spec §3 step 5 offers to create recurring engagements on activation; the offer needs the service catalog (Step 4) and engagements (Step 5).
- KYC document and engagement letter upload (onboarding step 3) needs the file gateway, Step 6.
- Closing a client should first require open engagements to be finished (spec §3) — the check is noted in `setClientStatus` and lands in Step 5.
- Fee agreements are stored on the model but have no editing UI yet; the quote captured at lead stage covers Phase 1 onboarding.

**From Step 2**

- **Nothing has been written to a real audit log yet.** Transactions need a replica set, which Atlas provides; the code raises a clear error if `MONGODB_URI` points somewhere without one.
- The Activity tab component is built but has no client or engagement pages to sit on yet (Steps 3 and 5).
- Export is CSV, not a formatted `.xlsx` (marked `ponytail:` in the route). Excel opens it fine; swap to a real workbook in Step 10 if the firm wants frozen headers.
- Archiving entries older than 2 years to Atlas Online Archive (spec §11) is not set up — an Atlas console task for go-live, listed under owner tasks.
- The nightly automatic chain check is listed in spec §11's spirit but belongs to the job runner in Step 7; for now it is the on-demand button.

**From Step 1**

- **Nobody has signed in yet.** The flow is built and tested as far as it can be without a database; the 6 skipped Playwright tests run the real thing the moment `MONGODB_URI` and `AUTH_SECRET` are set.
- Audit entries for user changes are marked `TODO(step-2)` in `app/(app)/settings/users/actions.js` — the audit helper arrives in Step 2.
- `mustChangePassword` is recorded and shown but not yet enforced; the change-password screen is part of Step 2's work on the profile area.
- One-time passwords are read out by the partner, not emailed. Email needs the mailer (Step 9).
- Email OTP as an alternative to an authenticator app (spec §16 allows either) is not built; authenticator app only for now.
- Password reset is partner-initiated only. No self-service "forgot password", which also needs the mailer.
- Permissions are the spec §2 defaults in code. Spec §2 also asks for them to be *configurable per role in settings* — that screen is not built; say if it is needed for Phase 1.

**From Step 0**

- The branch list in the top bar is hardcoded (NOI / DEL / LDH / MRT); it reads from the `branches` collection in Step 1.
- The command bar button is present but disabled; cmdk wiring is Step 11.
- Quick-add, notifications and profile buttons are placeholders with no menus behind them.
- The left rail links to `/clients`, `/engagements`, `/calendar`, `/invoices`, `/reports`, `/settings`, which 404 until their steps build them.
- `MONGODB_URI` is not set anywhere yet, so `connectDB()` has never actually opened a connection. First real use is Step 1.
- No GitHub remote; commits are local only.

## What P3-24 built — the achromatic ledger (29-10-2026)

The owner's verdict on 29-10-2026: the colour theme, the type and the
layout read cheap. **They did, and for a reason that was recorded rather
than accidental** — D35, on 26-10-2026, replaced spec §15's design
language with the v6.2 prototype's at the owner's instruction ("keep
everything exact like prototype"), and parked eight hand-built details
behind a switch that is off by default (D52).

The prototype's palette is an off-white ground, white cards and one stock
blue on every button, tab and link. The design study behind this step
names that exact combination as what makes a screen read as "a
well-applied kit, not a product with its own identity". So the look was
doing precisely what it had been told to.

**The direction is `achromatic-ledger`**, seed 1094860545, dealt for the
brief "practice management for an Indian Chartered Accountancy firm, used
in eight-hour sessions". Its one move: colour leaves the chrome
completely. Measured on real finance screens, a screen of this kind is
under 1% coloured pixels, and 12 of 23 carry no filled coloured button at
all.

**What changed**

- **The token layer** (`app/globals.css`). A blue-grey ledger ground, a
  near-black primary, a grey-pill secondary, ink focus rings, neutral
  active rows, and one hue — `--data` — reserved for data and for a figure
  that has moved. Four panel radii became two and a pill. The resting
  shadow became none: a border or a tone step, never both. **Not one
  token name changed**, so sixty routes took the new palette without being
  edited.
- **`--faint` moved from #687080 to #666e7e.** The ledger ground is two
  levels deeper than the old one, which cost the 12px label text 0.02 and
  put it under 4.5:1. This is the least-darkened value that clears the bar
  on both the ground and a card. Everything else that already passed was
  left alone.
- **Every figure is mono** (D79), through the `.num` class that was already
  on 179 figures across 71 screens.
- **39 table headers across 35 files** stopped shouting: one repeated class
  string carried `uppercase`, `tracking-wide` and a `bg-sunk` header band,
  all three of which the study flags as louder than the data. The header
  words were already sentence case in the markup; only the CSS was
  capitalising them.
- **35 more uppercase section labels** went the same way, and the rail's
  group labels came up from 10.5px tracked capitals to 12px sentence case
  — 10.5px is under the floor at which a label is read rather than seen.
- **10 filter-bar buttons stopped competing with the screen's primary.**
  Filter, Apply, Search and Show were all wearing the filled near-black of
  the one primary action; they are the grey pill now. The other 44 uses of
  that class are genuine primaries and were left.
- **One canvas width** (D80), capped once in the app shell.
- **The sign-in screen** was rebuilt as a plate and a sheet: the firm's
  name in Fraunces on deep ink with its particulars as a ledger block in
  mono, the form on white beside it. Every word on the plate is read from
  `firmProfile()`; a particular the firm has not entered is left out
  rather than printed as a gap. The two lines that are always true — the
  financial year and today's date in IST — are computed, so the plate holds
  its shape on a firm that has never opened Settings.

**`scripts/shots.mjs` is new.** The design tools can only reach `/login`;
everything else is behind a session, so a change to the token layer — which
restyles sixty routes at once — was being judged on the one screen that
needs no password. It signs in with the suite's own helper and photographs
eight screens in both themes. It makes and removes its own account, exactly
as every spec does, so nobody's real password is in a screenshot script.

**Checks:** lint clean, 1470 Vitest tests pass, `next build` succeeds,
`inspect.mjs --app` on the production build reports 0 FAIL, and
`impeccable detect` reports nothing on the seven files touched by hand.

**Left over**

- **`inspect.mjs` needs `--allow font-not-dealt`** (D82). The sheet deals
  Geist; `CLAUDE.md` fixes the fonts. The exemption is passed explicitly
  rather than the rule being switched off.
- **Two warnings are defended, not fixed.** `app-title-size` reads the
  sign-in's 68px name as a landing-page title — it is the one screen in the
  product that is looked at rather than worked in. `panel-void` reads the
  two full-height halves as cards and their centred blocks as holes.
- **The eight signature moments are still parked** (D52), the login scene
  among them. It stays inside `.moments-only` in the new page, so the
  switch still works and `keyboard.spec.js` can still turn it on — but the
  plate's particulars, not the scene, are what the screen is built around
  now. **This settles the choice `keyboard.spec.js:124` was waiting on**
  only in the sense that the scene is no longer load-bearing; the test
  still asserts §15's wording and still needs the owner's answer.
- **`bg-carbon` is on 141 elements.** Ten were demonstrably wrong and were
  fixed. A screen-by-screen pass for "one filled primary per screen" is a
  separate job from a token pass and was not attempted.
- **The empty cards on My tasks keep ~160px of blank.** Keeping an empty
  section's frame is right; the height is more than the content needs. It
  closes itself the moment the account has work in it.
- **Only light was checked at 1920.** The shots script takes a width; dark
  at 1920 was not looked at.

## What P3-25 built — the teal theme and the motion layer (29-10-2026)

The owner gave a reference CRM screenshot and asked for its colour theme
across the application, plus light and dark mode and "some smooth
animation effect".

**Light and dark already existed** and were not rebuilt: the toggle is in
the profile menu under "How this looks", `data-theme` is written to
`<html>`, the choice is kept in `localStorage`, and an inline script in
the root layout applies it before first paint so the page never flashes
the wrong theme. What this step did was make the new palette work in both,
which `tests/contrast.test.js` proves — 32 assertions, including that the
two copies of the dark theme say the same thing.

**The palette was sampled, not guessed.** The reference was decoded in a
browser and read region by region: ground `#f2f3f5`, cards `#ffffff`, ink
`#000002`, the action colour between `#42a0a0` and `#61bdbe`. It is a
teal, not the green it looks like at a glance. `#177979` is that teal
taken down until it clears the contrast bar (D83).

**Two devices in the reference were deliberately not copied**, because
`CLAUDE.md` rule 10 forbids them and the owner wrote that rule: the
teal-to-green gradient on its "Overdue" card, and the icon in a tinted
square on each KPI tile. Say the word and either is a small change.

**The motion layer is four things** (D84), all under 300ms, all on strong
curves rather than the browser's weak built-ins, and all reversible by
`prefers-reduced-motion` — which now means *gentler*, not *off*. The old
rule flattened every duration in the document to 0.01ms, which also killed
the colour crossfades that help comprehension rather than hurting it.

**Checks:** lint clean, 1470 Vitest tests pass, `next build` succeeds,
`inspect.mjs --app` 0 FAIL, and a browser check confirming the motion
claims rather than asserting them.

**Left over**

- **The theme toggle is two clicks deep**, inside the profile menu. That
  is where P3-21b put it on purpose, with a caption, because three bare
  glyphs in the top bar read as nothing. If the owner wants it on the bar
  itself it is a two-line move.
- **`--data` is now the same teal as the chrome.** With the accent back on
  buttons there is no second hue to give the data, and inventing one would
  put two unrelated colours on a screen. The cost is that a chart no
  longer stands out from the controls around it by colour alone.
- **The 500ms opacity fade on the sign-in form** is over the 300ms bar. It
  is the departure fade tied to the parked 3D scene's arrival, and with
  the scene parked the branch is never taken — so it never runs. It should
  go with the scene whenever that decision is made.

## What P3-26 built — the two devices from the reference (29-10-2026)

P3-25 copied the reference's colours and deliberately left out two of its
devices, on the grounds of `CLAUDE.md` rule 10. The owner overrode that
and asked for both. They are in (D85).

**The icon square.** `MoneyTile` and `CountTile` take an `icon` and draw
it in a 36px tinted square. The tint is the tile's own `tone`, so it
cannot disagree with the figure beside it: red for late, amber for
waiting, green for good, teal otherwise. A count tile at zero drops back
to the neutral tint, because a red square over a `0` is an alarm about
nothing. The square is `aria-hidden`: the label already says what the
tile is.

**The feature card.** `FeatureTile` is the filled gradient panel the
reference uses for its overdue total. It is a separate export rather than
a `tone`, so a second one on a screen takes a deliberate second import,
and on both dashboards it is **conditional** — with nothing past due the
tile reverts to an ordinary white one. The two screens that have it are
the firm dashboard and the accounts desk, and on each it is the one
figure that screen exists to raise the alarm about.

**Contrast.** The reference's own gradient is a light teal-green that
gives white about 3:1. These are the same hues taken down until white
clears 4.5:1 at both ends — 4.85 at `#17806a` and 7.62 at `#0e5c6a` —
because the figure on that card is the one somebody has to read. The four
icon tints clear 4.6 to 6.5 against their own glyph colour in light, and
6.5 to 7.6 in dark.

**The three gradients in the codebase now carry `taste-skill-ignore`**
with a reason each, so the skill's linter reports 0 FAIL honestly rather
than being switched off: this card (the owner's call), `.ledger-rule-lines`
(dead by default, kept so D35 reverses by a rename) and `.brass-hairline`
(only with the flourishes on). Each marker is placed where Prettier keeps
it on the flagged line.

**Checks:** lint clean, 1470 Vitest tests pass, `next build` succeeds,
`lint.mjs --app` 0 FAIL. Both dashboards photographed in both themes.

**Left over**

- **Rule 10's other three clauses stand** — no glass panels, no emoji
  icons, no grids of identical shadowed cards. Only the gradient and the
  icon-in-a-tinted-square were overridden.
- **`TileRow` has no icons.** It is the six-across ruled strip at the top
  of the dashboard, where a square per cell would be six squares in a row
  — which is the grid of identical tiles rule 10 is actually about. The
  icons are on the four money tiles only.
- **The reference gives each KPI a different hue** (a yellow star, a blue,
  a red) with no relation to what the figure means. Here the hue is the
  tone, so three of the four squares are usually the same teal. If the
  owner wants the reference's variety instead, it is a one-line map from
  label to hue — and it would mean a colour that says nothing.

## What P3-27 built — icons on the strip tiles (29-10-2026)

P3-26 put icons on the four money tiles and left the six-across strip
without them, on the grounds that six tinted squares in a row is the grid
of identical tiles rule 10 is about. The owner asked for them anyway
(D86), so they are in, at 28px rather than 36.

**The icon is chosen by label**, from a map in `Tiles.jsx`. The four
builders behind these tiles — `workTiles` and `dscExpiringTile` in
`lib/reports/figures.js`, `reviewTiles` in `components/dashboard/
RoleDashboard.jsx`, and `lib/reports/headlines.js` — do not agree on a
shape, and only one of them carries a `key`. Threading a React component
back through four server functions to avoid a lookup table would put a
presentation decision inside the counting code, which is the wrong side
of that line. `Circle` is the fallback.

**Checks:** lint clean, 1470 Vitest tests pass, `next build` succeeds,
`lint.mjs --app` 0 FAIL and 0 WARN on the dashboard components.

**Left over**

- **A latent quirk, found while wiring the tint and deliberately not
  changed.** The strip's figure takes its colour from `tile.value > 0`.
  For a count that is a string of digits (`"5" > 0`) the comparison works;
  for a tile whose value is a formatted amount (`"₹51,840" > 0`) it is
  always false, so the money tiles in `headlines()` never colour their
  figure even when they carry `tone: "late"`. The new icon tint uses the
  **same** expression on purpose, so the square and the number it sits
  over cannot disagree — a correct square over an uncoloured figure would
  be worse than two consistent ones. Fixing it properly means deciding
  whether `headlines()` should pass paise alongside the formatted string,
  which is a change to four builders and not a design job.
- **Fifteen labels are mapped.** A label reworded in any of the four
  builders falls back to `Circle` rather than breaking; nothing warns that
  it happened, which is the cost of mapping by label rather than by key.

## What P3-28 built — the timesheet, and what time was worth (29-10-2026)

The first of the five screens the v6.2 gap left (`docs/GAP-SCREENS.md`),
built in the order the owner approved. `/team/time` was a stub; it is now
a working timesheet with the firm's three time figures over it.

**A new collection, `timeEntries`.** Minutes rather than decimal hours
(D88), the day held at IST midnight, `chargeable` derived from whether
there is an engagement on the line, and `startedAt` set only while a
timer runs — so the running clock is a row of this collection and not a
second place for the same fact to live. Soft delete and the audit plugin
like everything else: a removed hour is exactly what a fee argument turns
on a year later.

**The clock is on My tasks as well as on the timesheet.** The one moment
anybody will remember to start a timer is the moment they start work, and
My tasks is the page they are already on. The jobs it offers are the ones
already on that screen, not every open engagement in the firm. The
elapsed figure counts up in the browser off `startedAt`; **the minutes are
counted on the server**, so a tab left open overnight or a laptop that
slept cannot put an hour on the sheet that nobody worked. A timer stopped
under a minute records nothing rather than a row of zeros.

**Typing a line in is the plain path and the clock is the convenience.**
Nobody starts a stopwatch before a phone call, and a sheet filled in on
Friday afternoon is still a sheet. Hours read as `2.5` or `2:30`; a day in
the future is refused, because a timesheet that can hold intentions is not
a record of anything.

**Two permission scopes are checked separately on every write** — whose
sheet (the `timeEntries` scope) and which job (the `engagements` scope).
A line on an engagement names a client, so somebody who may not see that
client may not learn about it by booking an hour to it either.

**The three figures.** Utilisation is chargeable minutes over each
person's own capacity across the *working* days of the window, so a week
with a holiday in it does not read as a week somebody slacked. Days
nobody has filled in are named before any money is, because a
profitability figure built on half a timesheet is worse than no figure.
Realisation and client profitability come last, worst client first —
sorting by name buries exactly the clients the screen exists to find.

**Nothing on it invents a rate.** Time value needs an hourly rate per
person, which is a partner's decision about what the firm's work is worth
(rules 8 and 9). `chargeRatePaise` is new on the user record, set in
rupees on each person's page, zero by default. With every rate at zero the
money half of the screen says so and shows hours instead; with some set,
it names the people who have none and says plainly that every figure
below understates the cost.

**Checks:** lint clean, 1494 + 24 Vitest tests pass, `next build`
succeeds, 4 Playwright tests pass at laptop and phone widths.

**The owner has to do one thing**

Set an hourly charge rate for each person: **Team → the person → Charge
rate (₹ an hour) → Save.** Until at least one is set, utilisation and the
unrecorded-days list work and the three money figures do not. There is no
default and there will not be one.

**Left over**

- **A line cannot be edited, only removed and re-added.** Correcting
  "2.5" to "3" is two actions. An edit action is a third write path to
  audit for a correction that takes four seconds as it stands.
- **No approval step on a timesheet.** Spec §9 does not ask for one and
  the firm is five people. If weekly sign-off is wanted later it is a
  status field on the week, not on the line.
- **Utilisation ignores leave.** Somebody on approved leave reads as
  somebody who recorded nothing. `Leave` is already a collection, so this
  is a join away, but a leave-aware denominator is a decision about what
  utilisation means and not a bug.
- **The time-based reports deferred since Step 10 are now possible and
  not yet built.** Timesheet, utilisation, realisation and profitability
  all exist as panels on this screen; none of them is in
  `lib/reports/standard.js`, so none exports to Excel or PDF yet.

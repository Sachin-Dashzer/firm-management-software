# PHMG CRM — Progress

Source of truth for what is done. Updated at the end of every step.
Status: ⬜ not started · 🟡 in progress · ✅ done

Last updated: 24-10-2026

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

## Phase 3

Not started (spec §17).

## Decisions made

| Date | Decision | By |
| --- | --- | --- |
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

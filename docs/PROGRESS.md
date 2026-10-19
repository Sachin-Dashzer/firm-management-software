# PHMG CRM — Progress

Source of truth for what is done. Updated at the end of every step.
Status: ⬜ not started · 🟡 in progress · ✅ done

Last updated: 19-10-2026

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

## Phase 2 / Phase 3

Not started. Break into steps only after the owner confirms Phase 1 is in daily use (spec §17).

## Decisions made

| Date | Decision | By |
| --- | --- | --- |
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
| 19-10-2026 | **Sentry is not installed.** Spec §14 names it, but it needs the firm's own account and Vercel already keeps a day of error logs for nothing. Atlas alerts, two free uptime checks and the runner heartbeat cover the rest of §14 monitoring. Send a DSN and it goes in | Agent, owner to decide |

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
- **Monitoring** (`docs/DEPLOY.md` §8): Atlas alerts, two uptime checks and the runner heartbeat, all free and all owner-side. The gateway check expects a **404 and the words "Not found"** — the 404 is deliberate, and checking the body too is what catches PHP being switched off, which would turn the same URL into a 200 serving the source. **Sentry is not installed** — see the decisions table.
- **`docs/ACCEPTANCE.md`** — all eleven §17 criteria plus §16 treated as criteria, each with exactly how to check it in the browser and an honest mark. Nothing is ticked, because nothing can be until the database exists.
- **`docs/DEPLOY.md` finished** — Atlas, Vercel, the two irreplaceable keys, restricting the audit-log database user, backups with a restore test that is actually performed, a thirteen-step go-live order, how to stop, and how to roll back.
- Tests: 29 new Vitest tests (513 total), four of them on the soft-delete plugin: that it records who and when, that it saves inside the session it is handed, and that an ordinary `find` still cannot see a deleted row.

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

**From Step 12**

- **Nothing in Step 12 has been exercised against a database either.** The DPDP export, the redaction, the incident log and both imports are unit-tested and have never written a row. The redaction in particular is irreversible by design, so the rehearsal in `docs/DEPLOY.md` §7 is where it should first be tried — on a scratch client, in the scratch database.
- **Acceptance is 0 of 11 ticked.** Not a defect: every criterion needs the cluster. `docs/ACCEPTANCE.md` says exactly how to check each one, and criterion 11 (backups and a restore actually performed) is owner-side and last.
- **Sentry is not installed** (see decisions). Error tracking is Vercel's own logs until the owner says otherwise.
- **No uptime monitor or Atlas alert is set up** — both are accounts the firm owns. `docs/DEPLOY.md` §8 has the two URLs and the three alerts to add.
- The incident log's thresholds (failed sign-ins, downloads in a burst, credential reveals) are a guess at what is unusual for a firm this size, because there is no history to calibrate against. They should be revisited after the pilot month.
- The breach-notification side of DPDP — telling the Data Protection Board and the affected people within the statutory window — is a **process, not a screen**. The incident log records what happened and what was done; who signs the notification and in what words is for the firm's lawyer to settle.
- `scripts/backup-vault.sh` has **never run** — there is no cPanel here and no vault to copy. BigRock is its first execution, like the PHP gateway.
- The team import cannot create a Partner, deliberately. If the firm ever needs a second partner, it is made by hand on the Team screen.
- There is still no error-reporting path for the owner: if a staff member hits a crash, they see the error page and have to tell somebody. Sentry would close that; so would a "report a problem" link, which is not built.

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

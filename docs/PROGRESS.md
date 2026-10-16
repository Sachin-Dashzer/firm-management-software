# PHMG CRM — Progress

Source of truth for what is done. Updated at the end of every step.
Status: ⬜ not started · 🟡 in progress · ✅ done

Last updated: 16-10-2026

## Phase 1 — Core MVP

| Step | What | Status | Notes |
| --- | --- | --- | --- |
| 0 | Project setup: Next.js, Tailwind tokens and fonts, ESLint, Prettier, Vitest, Playwright, Atlas connection, env handling, empty app shell | ✅ | Done 16-10-2026. Storybook deferred to Step 1; Atlas cluster still to be created by the owner |
| 1 | Auth, users, roles and branches (login, TOTP 2FA, permission helper, user management, seed partner) | 🟡 | Built 16-10-2026. Cannot be run until the owner creates the Atlas cluster; 6 Playwright tests are waiting on it |
| 2 | Audit log foundation (transaction helper, Mongoose plugin, hash chain, Activity tab, firm audit screen) | 🟡 | Built 16-10-2026. Needs Atlas to run: transactions require a replica set |
| 3 | Clients (profile, contacts, GSTINs, credentials vault, groups, onboarding, duplicate checks, Excel import) | 🟡 | Built 16-10-2026. Needs Atlas to run; 22 Playwright tests waiting |
| 4 | Service catalog (templates, versions, checklists, steps, starter catalog seed) | ⬜ | |
| 5 | Engagements and workflow (template snapshot, status pipeline, maker-checker, tasks, comments, list/Kanban/calendar, bulk actions) | ⬜ | |
| 6 | File gateway and documents (PHP gateway, storage adapter, uploads, versions, permanent file, signed links, recycle bin) | ⬜ | |
| 7 | Job runner and compliance calendar (jobs queue, runner, cron setup, due-date master, recurring generation, compliance grid) | ⬜ | |
| 8 | Billing (GST invoices, gapless numbering, PDF, payments, allocations, TDS, ledger, unbilled work) | ⬜ | |
| 9 | Notifications (in-app, team emails, daily digest, invoice emails, all via mail queue) | ⬜ | |
| 10 | Dashboards and reports (Phase 1 set), saved views, Excel export on every list | ⬜ | |
| 11 | Signature UI moments and polish (login 3D scene + fallback, audit tick, stamp, command bar, a11y pass) | ⬜ | |
| 12 | Hardening and go-live (acceptance criteria, security checklist, backups, DEPLOY.md, migration rehearsal) | ⬜ | |

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

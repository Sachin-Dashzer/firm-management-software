# PHMG CRM — Progress

Source of truth for what is done. Updated at the end of every step.
Status: ⬜ not started · 🟡 in progress · ✅ done

Last updated: 16-10-2026

## Phase 1 — Core MVP

| Step | What | Status | Notes |
| --- | --- | --- | --- |
| 0 | Project setup: Next.js, Tailwind tokens and fonts, ESLint, Prettier, Vitest, Playwright, Atlas connection, env handling, empty app shell | ✅ | Done 16-10-2026. Storybook deferred to Step 1; Atlas cluster still to be created by the owner |
| 1 | Auth, users, roles and branches (login, TOTP 2FA, permission helper, user management, seed partner) | 🟡 | Built 16-10-2026. Cannot be run until the owner creates the Atlas cluster; 6 Playwright tests are waiting on it |
| 2 | Audit log foundation (transaction helper, Mongoose plugin, hash chain, Activity tab, firm audit screen) | ⬜ | |
| 3 | Clients (profile, contacts, GSTINs, credentials vault, groups, onboarding, duplicate checks, Excel import) | ⬜ | |
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
- [ ] BigRock: `files.` subdomain, PHP gateway, cron jobs (Steps 6 and 7)
- [ ] `notices@` mailbox + SPF/DKIM/DMARC (Step 9)

## Left over / known gaps

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

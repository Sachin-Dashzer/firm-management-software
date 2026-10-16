# PHMG CRM — Progress

Source of truth for what is done. Updated at the end of every step.
Status: ⬜ not started · 🟡 in progress · ✅ done

Last updated: 16-10-2026

## Phase 1 — Core MVP

| Step | What | Status | Notes |
| --- | --- | --- | --- |
| 0 | Project setup: Next.js, Tailwind tokens and fonts, ESLint, Prettier, Vitest, Playwright, Atlas connection, env handling, empty app shell | ✅ | Done 16-10-2026. Storybook deferred to Step 1; Atlas cluster still to be created by the owner |
| 1 | Auth, users, roles and branches (login, TOTP 2FA, permission helper, user management, seed partner) | ⬜ | |
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

**From Step 0**

- The branch list in the top bar is hardcoded (NOI / DEL / LDH / MRT); it reads from the `branches` collection in Step 1.
- The command bar button is present but disabled; cmdk wiring is Step 11.
- Quick-add, notifications and profile buttons are placeholders with no menus behind them.
- The left rail links to `/clients`, `/engagements`, `/calendar`, `/invoices`, `/reports`, `/settings`, which 404 until their steps build them.
- `MONGODB_URI` is not set anywhere yet, so `connectDB()` has never actually opened a connection. First real use is Step 1.
- No GitHub remote; commits are local only.

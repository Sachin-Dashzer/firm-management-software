# PHMG CRM — Progress

Source of truth for what is done. Updated at the end of every step.
Status: ⬜ not started · 🟡 in progress · ✅ done

Last updated: 16-10-2026

## Phase 1 — Core MVP

| Step | What | Status | Notes |
| --- | --- | --- | --- |
| 0 | Project setup: Next.js, Tailwind tokens and fonts, ESLint, Prettier, Vitest, Playwright, Storybook, Atlas connection, env handling, empty app shell | 🟡 | Plan presented, awaiting owner's "go" |
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

- [ ] Create MongoDB Atlas cluster, DB user, network access (needed to finish Step 0)
- [ ] Create Vercel project + env vars (needed before first deploy)
- [ ] BigRock: `files.` subdomain, PHP gateway, cron jobs (Step 6/7)
- [ ] `notices@` mailbox + SPF/DKIM/DMARC (Step 9)

## Left over / known gaps

- Nothing yet.

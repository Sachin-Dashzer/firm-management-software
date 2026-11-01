# Go-live handoff

What the readiness audit of 01-11-2026 found, what was done about each item,
and what is left. Written for the firm owner and for whoever picks the work
up next.

The audit's one-line conclusion was that the system is **architecturally
sound and has never been operated**. That was accurate. The foundations were
right — 1,681 unit tests passing, an audit hash chain intact across 6,543
entries, money in integer paise, a statutory-date guard that fails closed,
server-side permission checks everywhere — and almost nothing had ever been
run: the job runner had never processed a job, the file gateway had never been
executed, and the browser suite had never completed a pass.

Six of the seven code- and infrastructure-side blockers are closed. The
seventh, the browser suite, is partly done and honestly reported.

---

## 1. Every blocker, and what happened to it

| Blocker | What changed | How it was verified | Commit |
| --- | --- | --- | --- |
| **The browser suite ran against the live Atlas cluster** while its specs called `User.deleteOne` and `Client.deleteMany`. `tests/e2e/local-db.mjs` was written to prevent this and was imported by nothing; its own docstring claimed the config loaded it. | `mongodb-memory-server` installed. `scripts/e2e.mjs` starts a throwaway replica set and sets `MONGODB_URI` before Playwright loads, so the config, the server under test and every worker agree. `tests/e2e/assert-safe-db.mjs` refuses any remote host or `+srv` URI, at config-load time and again in every worker. `.env.test` replaces `.env` for tests. `webServer` no longer reuses a server that is already up, and has its own port. | A fake Atlas URI makes even `playwright test --list` abort with the guard error, exit 1. One spec through the real path lands on `127.0.0.1` and passes 4/4. 17 unit tests for the guard. | `6b5c08a` |
| **The job runner had never run.** 88 jobs queued, 0 processed, no cron job in `vercel.json` or on BigRock, and `JOBS_SECRET` unset so the one HTTP way in answered 404 to every caller. | The queue, runner and route were already correct — the cause was that nothing had ever called them. Added the `*/5` schedule to `vercel.json`; `/api/jobs/run` now also accepts `Authorization: Bearer` (Vercel Cron) and `CRON_SECRET`; a missing `JOBS_SECRET` returns 500 and logs why instead of a silent 404. `npm run jobs:tick` runs one pass by hand; `npm run jobs:backlog` reads the queue, dry-run by default. | Five jobs of different types enqueued against a throwaway replica set → `jobs-tick` completed **11 of 11** (its own due schedules included), 0 failed, exit 0. 16 unit tests for the queue against a real MongoDB — atomic claim under concurrency, lease recovery, max-attempts — and 12 for the route's lock. | `dd96a57` |
| **The PHP file gateway had never been executed.** No PHP on the build machine, so BigRock would have been its first run with the firm's documents as the test data. | Run for real against PHP 8.1.34. `scripts/gateway-smoke.mjs` drives it through the app's own storage driver. `docker-compose.gateway.yml` and a `php -S` fallback. `docs/GATEWAY_DEPLOY.md` written for the owner. | **26 checks passed, 0 failed:** the AES-256-GCM round trip byte for byte; encryption confirmed at rest (58 plaintext bytes stored as 86 = 12 IV + 16 tag + 58 cipher, no plaintext on disk); eight path-traversal keys refused including url- and double-encoded, backslash and null-byte; a tampered signature, a download ticket reused on `delete.php`, an expired ticket; oversized and disallowed-type uploads; the bin/restore/purge lifecycle. No PHP notice or warning in the run. | `1241075` |
| **`AUTH_SKIP_2FA=true` in the firm's own `.env`** — the password alone signed anybody in. | Ignored on a production deployment, logged once when ignored, and still reported by `doctor` either way. Previews keep the hatch. Only the exact string `"true"` counts. | 9 unit tests. New `tests/e2e/two-factor.spec.js`: the right password alone gets nowhere, a wrong code is refused, a valid code from another account is refused, a wrong password does not reveal whether the address exists, and five wrong passwords lock the account so the correct one then fails too. | `eb0df18` |
| **`STORAGE_DRIVER=local` would silently lose every document** on Vercel, whose disk is discarded on each deploy. | The app refuses to boot in production; `doctor` fails on it. The check lives in `lib/storage/production.js`, importing nothing, because `instrumentation.js` is bundled into the edge runtime where a reach through to `node:crypto` fails the build. | 8 unit tests. The edge-bundle problem was found by a red build, not by reasoning. | `1241075` |
| **`doctor` was not a complete gate.** | PASS/WARN/FAIL per line, non-zero exit on any FAIL, read-only. Added: `NEXTAUTH_URL` https-and-not-localhost in production; a missing `JOBS_SECRET` as FAIL rather than a note; secret lengths; `SENTRY_ENVIRONMENT`; the production storage driver; a Background jobs section reporting the heartbeat, a backlog older than an hour and the failed count; and a check that the browser suite is still locked to a throwaway database. | Run against the live cluster; output in section 3. 19 unit tests for `checkEnv`. | `eb0df18` |
| **Sample data mixed in with real; invoice series with unexplained gaps.** | `npm run purge:sample` prints the full tree of what would go and its effect on the firm's totals, reusing the existing `dropSample` so the dry run cannot describe a different set from what `--apply` removes. `npm run invoice:gaps` writes `docs/INVOICE_GAPS.md`, cross-referencing each missing number against the audit log. Neither was applied. | Dry runs executed and read. The gap report explained 3 of 8 gaps from `invoice_issue` entries and states what the log proves about the other 5 rather than guessing. | `3bf0c5c` |
| **121 of 348 browser tests failing.** | 5 root causes found and fixed across 8 specs. The rest inventoried by evidence in `docs/E2E_REPORT.md`. | **Not finished — see section 5.** | `6b5c08a`, `eb0df18` |

### A real application bug found on the way

The browser suite, the first thing ever to run the app against an empty
database, found that **Settings → Customise could not create the firm's own
record**: it built the document and set only `vocabulary`, and
`FirmSettings.name` is required, so the save died with a validation error.

Not a test artefact. A new deployment starts with no firm record and Customise
is reachable before ICAI, so a partner renaming a menu item on day one would
have hit it. Fixed with a shared `firmDocFor(session)` used by both writers,
and a regression test against a real MongoDB. Commit `3bf0c5c`.

Three smaller things fixed in passing: the never-run test seed keyed document
templates on a `key` field the schema does not have; the Settings attention
check counted sample clients but not the six sample **staff accounts** sitting
in the firm's team list; and the PDF test file was flaking on worker
contention rather than on anything real.

---

## 2. Final numbers

Everything below was run in this session and observed.

| | |
| --- | --- |
| `npm run build` | **exit 0**, 125 routes (4 static, 121 dynamic) |
| `npm run lint` | **clean** |
| `npx vitest run` | **1,757 passed / 1,757**, 89 files — up from 1,681 / 83 |
| Gateway smoke | **26 passed, 0 failed** against a live PHP 8.1.34 gateway |
| Job runner, one tick | **11 of 11 completed**, 0 failed, exit 0 |
| Audit hash chain | **intact across 6,595 entries** |
| `npm run test:e2e` | **not passing — 215 passed, 121 failed** (complete run, 59 min). See section 5 |

The unit-test count never dropped at any point: 1,681 → 1,698 → 1,714 → 1,726
→ 1,734 → 1,754 → 1,757.

**The one number that is not green is the browser suite**, and it is not
green because it had never run before this session, not because something
regressed.

---

## 3. What `npm run doctor` says now

Run against the live cluster at the end of this work:

```
Environment
  FAIL  AUTH_SKIP_2FA is on: the password alone signs anybody in.
  FAIL  JOBS_SECRET is not set, so /api/jobs/run refuses every caller and
        nothing scheduled runs. Generate one with `npm run secrets`.
  WARN  NEXT_PUBLIC_APP_URL still points at localhost.

Database
  PASS  connected to phmg
  PASS  replica set atlas-rp19ou-shard-0: transactions available
  PASS  a transaction opened and rolled back cleanly
  PASS  44 collections, indexes built

Audit log
  PASS  6595 entries, chain intact

File vault
  PASS  local driver: wrote, read and erased a probe file
  WARN  this is the development driver. Production uses the BigRock gateway.

Background jobs
  FAIL  the job runner has never run.
  FAIL  88 job(s) have been waiting over an hour.

The browser suite
  PASS  the browser suite is locked to a throwaway database

Still to do before the firm relies on this
  FAIL  1 details are missing from the firm's own record
  FAIL  9 sample clients and colleagues are still in the database
  WARN  1 due-date rules have not been confirmed
  WARN  8 document templates have not been approved
  WARN  13 services have no fee or no SAC code
  WARN  1 client email is switched off
  ... and six more WARNs about grants, portal accounts and sign-ins

6 things to fix above.
```

**Every remaining FAIL is an owner action or a configuration value I cannot
supply**: the three environment items belong in Vercel, the two job-queue
items need the cron job set up, and the last two are the firm's own data.
This file was run on a developer machine against `.env`, which is why the
environment section looks worse than production will.

---

## 4. What the owner does next, in order

Each step says how to check it worked. Nothing here needs me.

**Step 1 — the secrets.** Generate them once:

```
npm run secrets
```

Paste each into **Vercel → Settings → Environment Variables (Production)**:
`AUTH_SECRET`, `JOBS_SECRET`, `STORAGE_SHARED_SECRET`. Also set
`STORAGE_DRIVER=bigrock`, `STORAGE_GATEWAY_URL=https://files.phmgindia.com`,
`NEXTAUTH_URL=https://crm.phmgindia.com`,
`NEXT_PUBLIC_APP_URL=https://crm.phmgindia.com`, `SENTRY_ENVIRONMENT=production`.
**Remove `AUTH_SKIP_2FA` entirely.** Then redeploy — environment changes do
not reach a deployment that is already running.

*Check:* you can sign in and are asked for a 2FA code.

**Step 2 — the file gateway.** Follow `docs/GATEWAY_DEPLOY.md` top to bottom,
then from the project:

```
node scripts/gateway-smoke.mjs --base-url=https://files.phmgindia.com
```

*Check:* `26 passed, 0 failed`. Anything else, stop — the table in §7 of that
document says what each failure means. Do not let the firm upload a document
until this is clean.

**Step 3 — the job runner.** Answer the three questions in
`docs/OWNER_QUESTIONS.md` §6 first (does cPanel have "Setup Node.js App"? is
Vercel on Hobby or Pro?), then follow the matching option in `DEPLOY.md` §2.

*Check:* **Settings → Background jobs** shows the runner checked in a minute
or two ago.

**Step 4 — the backlog, before it sends anything.** 88 jobs are waiting and
some are client reminders weeks old.

```
npm run jobs:backlog
```

Read-only. Then decide how stale is too stale and set those aside
(`docs/OWNER_QUESTIONS.md` §1 for the question, `DEPLOY.md` §2c for the
commands). Client email is off by default, so staff mail is the immediate
risk — check **Settings → Messages** first.

**Step 5 — the sample data.**

```
npm run purge:sample
```

Read-only; it prints exactly what would go. If nothing in there is a real
record you have been using, apply it. Note that this blanks all four branch
GSTINs, so enter the real ones afterwards or no invoice can be issued.

```
npm run purge:sample -- --apply
npm run invoice:gaps
```

**Step 6 — your own data.** Settings → ICAI (name, FRN, address). Settings →
Services (the fee and SAC code for each service you offer). Settings → Due
dates: **read and confirm all 11 statutory rules** — until you do, no job
gets a statutory deadline at all. Settings → Doc templates: read and approve
the eight starter wordings.

**Step 7 — the gate.**

```
npm run doctor
```

Keep going until nothing says FAIL. The WARNs are work, not faults.

---

## 5. What I could not finish, and why

### The browser suite is not at 348/348

**Status: 215 passed, 121 failed** — the first complete run the suite has
ever produced, in 59 minutes. Stage 2 of the plan
asked for two consecutive clean runs. That is not where it is.

**Why not.** The suite had never completed a run in its life — every report
for twenty-odd steps said "waiting on Atlas" when the real cause was three
missing lines in the Playwright config. So this session was the first time
anybody saw what it says, and what it says is that roughly 40% of it fails.

Those failures are not 121 separate bugs, and this is the important part:
several spec files share state through a module-level `ids` object that
earlier tests populate, so one failure cascades into every later test in the
file as `Cannot read properties of null`. Until those fixtures are
independent, the failure count is not a count of bugs. Triaging the rest
before fixing the cascades is reading noise.

I fixed five root causes rather than fifty symptoms — a stale landing-page
assumption, the IST date bug replicated in four specs, an ambiguous selector
(fixed by naming the panel, which helps screen readers too), a substring
label match, and the real `FirmSettings` bug. `docs/E2E_REPORT.md` has the
full inventory, grouped by evidence, with the order I would work it in.

An honest estimate: the cascades are a fixture rewrite in four or five files,
and a full verification run takes about 70 minutes, so this is days of work
rather than hours. It is the single largest thing standing between this
system and go-live, and it should be finished before the firm relies on the
software.

### The gateway has not been run on BigRock

It has been run — against PHP 8.1.34 on this machine, passing 26/26. But the
firm's own hosting may differ in PHP version or extensions, and I cannot sign
in to BigRock. That is step 2 above, and `docs/GATEWAY_DEPLOY.md` §7 exists so
it is a command to run rather than a thing to work out.

### Nothing destructive was applied

By instruction, and I agree with it: `purge:sample --apply` and
`jobs:backlog --apply` were built, dry-run, and not run. Which invented
records are safe to remove and which stale reminders should never go out are
the owner's calls, and both are asked in `docs/OWNER_QUESTIONS.md`.

### `isSample` was not added to every collection

Stage 7 suggested a flag on every seeded record. I did not add one. The real
guarantee is Stage 1: the browser suite now physically cannot reach the
firm's database, which is stronger than a column. The existing `sample` tag
and the sample email domain mark seeded records, and `doctor` now fails on
either — including the staff accounts it used to miss. Adding a field to
forty-odd models and every report query would be a large change for a weaker
guarantee.

### One thing worth saying plainly

The engineering in this repo is better than its operational state. The audit
chain, the transaction discipline, the fail-closed statutory guard and the
gateway's own defences were all correct on first execution — the gateway
passed 26 security and round-trip checks having never run. What was missing
was never the thinking; it was that nothing had been switched on, and
therefore nothing had been checked. Most of this session was switching things
on and watching them work.

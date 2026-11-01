# The browser suite: what is failing and why

Written 01-11-2026, during the go-live work. **This is a status document, not
a completed one.** Stage 2 of the readiness plan asked for 348/348 passing
across two consecutive runs. That is not where the suite is, and this says
exactly where it is instead.

---

## The headline

| | |
| --- | --- |
| Tests in the suite | 348 (174 specs × 2 projects: `laptop`, `phone`) |
| Baseline before this work | never completed a run — see below |
| Baseline during this work | **167 passed, 101 failed** at 268 of 348 |
| Root causes found and fixed | 5 |
| Specs changed | 8 |
| Remaining failures | inventoried below, not yet fixed |

**The suite had never completed a run against a database in its life.** Every
report for twenty-odd steps said "waiting on Atlas"; the real reason was three
missing lines in `playwright.config.mjs`. So these are not regressions — this
is the first time anybody has seen what the suite actually says.

A run takes about 70 minutes against the throwaway replica set, most of it in
`next build` and the serial worker. Against Atlas it took 5.6 hours, which is
why nobody had done it.

---

## Fixed: root causes, not symptoms

### 1. The landing page moved and one spec did not

`lib/nav/landing.js` was changed to `/dashboard` (the owner's choice, D43).
`access.spec.js` read the client list straight off the page after signing in,
which used to be the clients list and is now the firm dashboard. It asserted a
client list against a dashboard and reported a **missing client** — which, in
the one spec dedicated to proving that access grants work, is the worst
possible thing to be wrong about.

*Fix:* `await page.goto("/clients")` before asserting. `tests/e2e/access.spec.js`.

### 2. `toISOString().slice(0, 10)` in four specs

A date stored at IST midnight is 18:30 UTC the **previous** day. Four specs
defined their own `asInput = (date) => date.toISOString().slice(0, 10)` to fill
a date box, so they typed yesterday's date.

This is the bug P2-12 fixed in nine places in the application, and
`istInputDate`'s own docstring describes it. The tests meant to catch it had
their own copy of it.

It is also time-of-day dependent: for a date built from `new Date()` the naive
form is only wrong between midnight and 05:30 IST — a test that passes all
afternoon and fails overnight.

*Fix:* all four now use `istInputDate` from `lib/dates.js`, and the assertion
in `due-dates.spec.js` reads the stored date back in IST.
`books`, `cover`, `gates`, `milestones`, `due-dates`.

### 3. A draft's wording was being read off the whole page

`docs.spec.js` asserted the client's name appeared in a generated draft. The
engagement header also shows the client's name, so the locator matched two
elements and the test died on a strict-mode violation.

Worth noting what the easy fix would have cost: adding `.first()` makes the
error go away *and* makes the test pass against an empty draft, because the
header alone satisfies it.

*Fix:* the preview panel in `DocsPanel.jsx` is now a named region
(`role="region"`, `aria-label="… — draft wording"`), which a screen reader
announces and the test can scope to. `docs.spec.js`, `DocsPanel.jsx`.

### 4. "Structured" is a substring of "Unstructured"

`icai.spec.js` called `getByLabel("Structured hours a year")`, which
substring-matched both CPE boxes.

*Fix:* `{ exact: true }`. `icai.spec.js`.

### 5. A real application bug: the firm's record could not be created

Settings → Customise built the firm document itself and set only
`vocabulary`. `FirmSettings.name` is required, so on a database where nobody
had saved the ICAI page the save died with `FirmSettings validation failed:
name is required`.

**Not a test artefact.** A new deployment starts with no firm record, and
Customise is reachable before ICAI, so a partner renaming a menu item on day
one would hit it. The browser suite found it because it was the first thing
ever to run the app against an empty database.

*Fix:* `firmDocFor(session)` in `lib/firm/settings.js`, used by both writers,
creating the document with the default name every screen already displays.
Regression test in `tests/firm-doc.test.js` (against a real MongoDB, because
the bug was Mongoose validation on save).

---

## Not fixed: the inventory

Grouped by what the evidence says, most-likely-systemic first. Counts are from
the partial baseline (268 of 348), so the laptop project is complete and the
phone project is not.

### A. Intra-file cascades — the largest group

Several specs share state through a module-level `ids` object that earlier
tests in the same file populate. When the first test fails, later ones read
`null` and fail with `TypeError: Cannot read properties of null`.

| Spec | Symptom |
| --- | --- |
| `docs.spec.js` | `reading 'deletedAt'`, `reading '_id'` — downstream of failure 3 above, so these may already be fixed |
| `team.spec.js` | `reading 'active'` |
| `reports.spec.js` | `reading '1'` |
| `automation.spec.js` | `SendBatch.status` is `queued`, expected `sent` — the batch the test approves is not the one `ids.batch` names |

These are not separate bugs. The plan's rule — "each spec must create its own
data and not depend on the order of other specs" — is the fix, and it is a
rewrite of the fixtures in those files rather than a patch.

**Checked and ruled out:** `approveBatch` → `sendBatch` does set `status:
"sent"` and save it (`lib/mailer/batches.js:241`). The application is right;
the test is looking at the wrong batch.

### B. Timeouts waiting for a control that never appears — 20+ tests

`locator.click: Test timeout of 60000ms exceeded` waiting for, typically, an
`Issue` button, a checklist control, or a payment form.

| Spec | Tests |
| --- | --- |
| `invoices.spec.js` | 3 |
| `documents.spec.js` | 3 |
| `docs.spec.js` | 2 |
| `checklist.spec.js` | 2 |
| `gates.spec.js` | 2 |
| `milestones.spec.js` | 2 |
| `settings.spec.js` | 2 |
| `inbox.spec.js`, `view.spec.js` | 1 each |

Each needs the page state read at the moment of failure. Some will be
cascades from group A (no engagement in the right state → no `Issue`
button); some will be genuine gaps between what the spec expects and what the
screen now renders. **I have not separated them, and I am not going to guess
the split.**

### C. Date- and clock-sensitive fixtures

`due-dates.spec.js >> a rule gives no date until a partner confirms it` fails
because `generateRecurring({})` creates nothing, so the engagement the test
then reads is `null`.

A hypothesis worth testing first, not yet confirmed: `GENERATE_LEAD_DAYS=15`
means recurring work is created 15 days before a period's due date. For a
monthly rule due on the 20th, generation for October's period starts on the
5th of November. The baseline ran on the 1st. If that is it, the test passes
or fails depending on the day of the month it is run — the same class of bug
as fix 2, and the fix is to generate against a fixed date rather than today.

### D. Counts and text that no longer match

Straightforward stale assertions, one each: `client-360` (a divider's count),
`announcements` (`Not read yet:` resolved to 2 elements), `cover`, `books`
(`"Qualified"` vs `""`), `checklist`, `reports`.

Cheap to fix once somebody reads each screen. Not cheap to guess.

---

## How to run it

```
npm run test:e2e                          the whole suite
npm run test:e2e -- tests/e2e/docs.spec.js --project=laptop
npm run test:e2e -- --reporter=list
```

`npm run test:e2e` starts its own throwaway MongoDB replica set and sets
`MONGODB_URI` before Playwright loads. **It cannot reach the firm's database**:
`tests/e2e/assert-safe-db.mjs` refuses any remote host or `+srv` URI, at config
load time (so even `--list` refuses) and again in every worker.

Do not run `npx playwright test` directly — without the wrapper there is no
database and the guard will say so.

---

## What an honest finish looks like

In order:

1. Fix the group A fixtures so no spec depends on another's leftovers. That
   alone will resolve an unknown but substantial share of group B.
2. Re-run, and re-triage group B against a suite that no longer cascades.
3. Settle group C by generating against a fixed date.
4. Work through group D screen by screen.
5. Two consecutive clean runs before anybody calls it done.

Step 1 is the one that matters: until the cascades are gone, the failure
count is not a count of bugs, and triaging group B before then is reading
noise.

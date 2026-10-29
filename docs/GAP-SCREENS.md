# Screen-by-screen gap — `CA-Firm-OS-v6.2.html` against the build

29-10-2026 · agent · **the inventory, and what was then built from it**

`docs/GAP-v6.2.md` (26-10-2026) asked six questions about the *shape of the
data* and proposed five steps. It was not a screen inventory, and one had
never been done. This is that inventory, measured rather than eyeballed,
with the result of acting on it recorded underneath.

## Method

The prototype declares every screen as `VIEWS.<name>` and every control as
`data-act="…"`. Both were extracted mechanically:

- **53 unique screens**, declared across **92 definitions** — the file's
  thirteen revision passes redefine and patch each other, so the feature
  surface of a screen is the union of its definitions, not the last one.
- **284 distinct actions** across those screens.

Each screen was then mapped to the route in this application that answers
it, and the two were compared by size and by feature.

## The headline

**Every one of the 53 prototype screens has a route here.** Nothing was
missing as a *page*. Phase 3 was built as prototype parity and it largely
succeeded: of the 53, **21 were already larger here than in the
prototype** — the engagement file, the client file, the audit file,
documents, notices, billing, the registers and the work list are all
substantially deeper, because they carry permissions, an audit trail and
real persistence the prototype has none of.

The gap was **depth on six screens**, and one deliberate behavioural
difference.

## What was built, 29-10-2026

The owner read the inventory and said to build all five of the suggested
steps, in order. All five are in.

| Route | Was | Now | Step |
| --- | --- | --- | --- |
| `/team/time` | a stub | a timesheet: a clock on My tasks, lines typed in, utilisation, the days nobody filled in, realisation and client profitability | P3-28 |
| `/settings/customise` | a stub | the firm's own words for four nouns, applied to the whole menu, with a live preview; and a hub pointing at the service template editor and the setup wizard, which already existed and are deeper than the prototype's | P3-29 |
| `/practice/sampling` | a stub | SA 530: three selection methods off a stored seed, key-item promotion, a three-state vouching grid, voucher photographs on their own row, exceptions and a projection to the audit file | P3-30 |
| `/billing/desk` | four lists, performing nothing (D74) | the same four lists, performing their own decisions through the records' own server actions (D92) | P3-31 |
| `/practice/tb` | a stub | five steps: import, map to confirmed Schedule III heads with last year's mapping remembered, a three-state adjustments journal, which notes are needed, and the statements with a five-sheet export | P3-32 |

Each step's own write-up — what it does, what it refuses, and what it
leaves out — is in `docs/PROGRESS.md` under its number. The decisions are
D87 to D93.

**Two of the six stubs are still stubs, and deliberately.**
`/client-experience` is blocked on the WhatsApp Business provider
question, unanswered since Step 0 — a messaging channel built against a
guessed provider is wasted work. `/settings/modules` was recommended
against on 27-10-2026 and that recommendation was accepted: a five-person
firm hiding screens from itself gains nothing, and switching a module off
would hide work that is already live.

Within the five that were built, what was deliberately left out is on the
screen that would have held it, and in `lib/settings/coverage.js` so the
"what this covers" page cannot drift from it: no cash flow statement or
Schedule III ratios, no ageing schedules, no written note text, no
stratified sampling, no manual payment reminder, and the time figures are
not yet exportable reports.

## The six stubs as they were found

| Route | Prototype screen | What the prototype did that this did not |
| --- | --- | --- |
| `/practice/tb` | TB to financials (9.4 KB) | Import a trial balance from Tally XML, Busy, Zoho or any Excel with ledger/group/opening/debit/credit/closing. Map each ledger to a Schedule III head with suggestions to confirm in bulk. An adjustments journal whose unadjusted entries flow to the misstatement summary on the audit file. A notes builder — nine standard notes always, plus the ones this company needs, with figures from the mapped TB. Preview of the balance sheet and the P&L, then export. |
| `/practice/sampling` | Sampling and vouching (3.5 KB) | Sample design by monetary unit, random or systematic, each explained in plain words on screen. A vouching grid where a cell is marked ✓ or ✗, and a voucher photo taken on a phone at the client's office attaches to the row. |
| `/team/time` | Timesheet and profitability (2.3 KB) | A timesheet filled automatically by the timer on My day. Client profitability: fee against time value, realisation per client, chargeable ÷ available hours, and who has not filed a timesheet this week. |
| `/client-experience` | Client experience (7.0 KB) | WhatsApp answers from live data; a monthly report generated on the 1st and released by a partner; a business pulse — sales by month from GSTR-1, customer concentration. |
| `/settings/customise` | Customise (8.2 KB) | Six setup questions that configure the rest. A service template editor (add/remove/reorder steps). Custom fields with a type and where they show. The firm's own words — "Assignment" for job, "Party" for client — with the logic behind them fixed. Client portal branding with a preview. |
| `/settings/modules` | Modules (3.3 KB) | Switch off what the firm does not do; compliance, clients, billing and documents always on. Start from a preset for your kind of firm. |

## The one screen that was deliberately shallower

`/billing/desk` — the accounts desk. The prototype's desk carries
**eighteen actions**: bill one job, set a fee, open and approve a waiver,
send a reminder, record a promise, match TDS, apply an advance, send to
review. Ours was **four lists and performed nothing** — that was D74, on
the reasoning that the desk is a place to see what needs doing and the
doing belongs on the record itself.

The owner asked for the prototype's behaviour and it is built (P3-31,
D92). What was load-bearing in D74 is kept: no decision is reimplemented,
so every button calls the same server action the record's own screen
calls, and **no new server action was written for the step**. Two of the
eighteen stay off the desk with the reason on the screen — billing a job
with its fee is one decision taken together on Ready to bill, and a
manual reminder would be a second, unrecorded cadence.

## Three false alarms, checked and cleared

Raised by the size comparison, dismissed on inspection:

- **Client onboarding** looked 9% the size of the prototype's. The wizard
  is in `ClientForm.jsx` (24 KB), not in the route file. Parity.
- **Branch access** has no screen of its own; `branchIds` is edited on the
  person's own page (`/team/[id]`). Same capability, different place. A
  cross-link from Settings would close the discoverability gap without
  building a screen.
- **`/today`** measures as 5% because it is a redirect to `/my-day`. That
  is P3-22b, and correct.

## What was not worth taking

The prototype's `why` screen (55 KB, its largest) is "what is different in
this version" — a reviewer's pass over the *previous prototype sample*. It
is a changelog about the prototype, not about the firm.
`/settings/whats-new` already answers the firm's version of that question
from its own records (D76).

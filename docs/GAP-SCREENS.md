# Screen-by-screen gap — `CA-Firm-OS-v6.2.html` against the build

29-10-2026 · agent · **nothing here has been built; this is the inventory**

`docs/GAP-v6.2.md` (26-10-2026) asked six questions about the *shape of the
data* and proposed five steps. It was not a screen inventory, and one has
never been done. This is that inventory, measured rather than eyeballed.

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

**Every one of the 53 prototype screens has a route here.** Nothing is
missing as a *page*. Phase 3 was built as prototype parity and it largely
succeeded: of the 53, **21 are larger here than in the prototype** — the
engagement file, the client file, the audit file, documents, notices,
billing, the registers and the work list are all substantially deeper,
because they carry permissions, an audit trail and real persistence the
prototype has none of.

The gap is **depth on six screens**, and it is precise.

## The six stubs

These routes exist so the menu does not 404 and say so honestly. They are
found by one grep (`the page is named, its place in the plan is named`).

| Route | Prototype screen | What the prototype does that this does not |
| --- | --- | --- |
| `/practice/tb` | TB to financials (9.4 KB) | Import a trial balance from Tally XML, Busy, Zoho or any Excel with ledger/group/opening/debit/credit/closing. Map each ledger to a Schedule III head with suggestions to confirm in bulk. An adjustments journal whose unadjusted entries flow to the misstatement summary on the audit file. A notes builder — nine standard notes always, plus the ones this company needs, with figures from the mapped TB. Preview of the balance sheet and the P&L, then export. |
| `/practice/sampling` | Sampling and vouching (3.5 KB) | Sample design by monetary unit, random or systematic, each explained in plain words on screen. A vouching grid where a cell is marked ✓ or ✗, and a voucher photo taken on a phone at the client's office attaches to the row. |
| `/team/time` | Timesheet and profitability (2.3 KB) | A timesheet filled automatically by the timer on My day. Client profitability: fee against time value, realisation per client, chargeable ÷ available hours, and who has not filed a timesheet this week. |
| `/client-experience` | Client experience (7.0 KB) | WhatsApp answers from live data; a monthly report generated on the 1st and released by a partner; a business pulse — sales by month from GSTR-1, customer concentration. |
| `/settings/customise` | Customise (8.2 KB) | Six setup questions that configure the rest. A service template editor (add/remove/reorder steps). Custom fields with a type and where they show. The firm's own words — "Assignment" for job, "Party" for client — with the logic behind them fixed. Client portal branding with a preview. |
| `/settings/modules` | Modules (3.3 KB) | Switch off what the firm does not do; compliance, clients, billing and documents always on. Start from a preset for your kind of firm. |

**Two of the six are already decided and should stay stubs unless you say
otherwise.** `/client-experience` is blocked on the WhatsApp Business
provider question, unanswered since Step 0 — a messaging channel built
against a guessed provider is wasted work. `/settings/modules` was
recommended against on 27-10-2026 and that recommendation was accepted:
a five-person firm hiding screens from itself gains nothing, and switching
a module off would hide work that is already live.

## One screen that is deliberately shallower

`/billing/desk` — the accounts desk. The prototype's desk carries
**eighteen actions**: bill one job, set a fee, open and approve a waiver,
send a reminder, record a promise, match TDS, apply an advance, send to
review. Ours is **four lists and performs nothing** — that was D74, on
the reasoning that the desk is a place to see what needs doing and the
doing belongs on the record itself.

That reasoning is defensible and it is also the single largest behavioural
difference left. If you want the desk to act, it is a real step, not a
tweak: every one of those actions needs its own permission check and audit
entry, which is why they live on the records today.

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

## What is not worth taking

The prototype's `why` screen (55 KB, its largest) is "what is different in
this version" — a reviewer's pass over the *previous prototype sample*. It
is a changelog about the prototype, not about the firm.
`/settings/whats-new` already answers the firm's version of that question
from its own records (D76).

## Suggested order, if you want them built

1. **`/team/time`** — the timer already exists on My day and writes
   nothing. Smallest step, and it unlocks the time-based reports deferred
   since Step 10 (timesheet, utilisation, realisation, profitability).
2. **`/settings/customise`** — but the first two tabs only (the firm's own
   words, and the service template editor). Custom fields change the data
   model and need their own decision.
3. **`/practice/sampling`** — self-contained, and the audit file it hangs
   off is already built.
4. **The accounts desk's actions** — reverses D74. Biggest behavioural
   change of the four.
5. **`/practice/tb`** — the largest by far. A trial-balance importer, a
   Schedule III mapper, an adjustments journal and a notes builder is a
   phase of its own, not a step.

Left alone: `/client-experience` until the WhatsApp provider is chosen,
and `/settings/modules` unless the 27-10 decision is reversed.

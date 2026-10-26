# Gap report — `CA-Firm-OS-v6.2.html` against the spec and the build

26-10-2026 · agent · **decisions needed from the owner**

This compares the design prototype `CA-Firm-OS-v6.2.html` against `docs/SPEC.md`
and what `docs/PROGRESS.md` records as built. It asks six questions, proposes
four small steps, and lists what should be left alone for now.

Nothing in here has been built. Nothing in the code has changed.

---

## How to read this

Three different things are being compared, and they are not versions of each other.

| | What it is | State |
| --- | --- | --- |
| `docs/SPEC.md` | The contracted build: Next.js, MongoDB Atlas, 24 collections, roles, audit chain, soft delete, the "modern ledger" design | Written 15-10-2026, **never revised** |
| This repository | That spec, implemented. 30 models, 17 screen groups, Phase 1 (12 steps) and Phase 2 (15 steps) | **Built. Never run.** 815 unit tests pass; 190+ browser tests wait on an Atlas cluster |
| The prototype | A design artefact that works out *how the work behaves*. No sign-in, no database, no security | Thirteen revision passes beyond the spec |

So the prototype is neither ahead nor behind. It answers a question the spec
never asked: not "what screens exist" but "what must be true before a return is
treated as filed".

**The prototype is not code to copy.** It is one HTML file where each revision
patches the one before it at runtime, and later passes rewrite the output of
earlier ones with text replacement. It also has no sign-in, no audit trail (its
log is a list that empties when the tab closes) and no real encryption (a vault
"password" is a scramble of the client name). What is worth taking is the
thinking, not the lines.

---

## Part A — Six questions

Five change the shape of the data. The sixth reverses a decision you made two
days ago, so it is listed separately and last.

They are independent of each other: you can answer yes to one and no to the
rest. Each one ends with what I would do and why.

---

### Q1. Does one engagement have one filing, or several?

**Today.** An engagement is one service for one client for one period, and it
holds one acknowledgement number and one UDIN (spec §13). A GST engagement for
October is one row, filed once.

**The prototype.** A job holds several *filing milestones* that finish
independently. October GST has GSTR-1 due on the 11th and GSTR-3B due on the
20th; GSTR-1 can be filed and recorded while GSTR-3B is still open. Each
milestone keeps its own:

- due date, and the due date **as it stood on the day it was filed** (so an
  extension announced later does not retroactively make a late filing punctual,
  and does not make a punctual one late)
- acknowledgement or token number
- the proof document, linked by id rather than by name
- which version of the work was filed
- a correction history: a wrong record is superseded with a stated reason, and
  the old one stays readable

It also separates preparing from filing. The prototype rewrites every service
step that read "Prepare and file GSTR-1" into "Prepare GSTR-1 (filing is
recorded below)", so ticking the last step never implies a return went in.

**Why it matters.** Right now, if a client's GSTR-1 goes in on time and the
GSTR-3B goes in nine days late, the system can record one date. Whatever it
records is wrong about one of the two returns, and the punctuality report (built
at P2-10c) reads from it.

**Cost.** This is the largest of the six. `Engagement` gains a `milestones[]`
array; `filedOn`, `ackNo` and `udin` move into it; the due-date engine (step 7b)
produces a list instead of one date; the compliance grid, the punctuality
report, the client portal and the filing panel all read the new shape. The
unique index "one engagement per client, service and period" stays as it is —
this adds depth inside a row, not more rows.

**I would do this, and do it before Phase 3.** It is the one item on this list
that gets more expensive every week, because the two registers, eight reports
and the client portal all read the field it replaces. GST is the firm's highest
volume work and it is the case the current shape cannot record truthfully.

→ Proposed **D21**.

---

### Q2. How many states does a requested document have, and may a client answer back?

**Today.** Requested → Received → Verified, or Not applicable (spec §6).

**The prototype.** Six states: Requested → Received → **Format checked** →
Accepted, or **Replacement requested**, or **Not required**. Submissions are
numbered, and a replacement clears every check on the earlier one, so an
accepted file and a later corrected file are never confused.

The automatic check only assists. A person still accepts. The prototype is
explicit that a passed format check is not acceptance — it reads "Format
checked — staff to review" and the reviewer is told to open the file and
confirm the client, the period, completeness and legibility.

And the client gets three replies besides uploading:

- **"I don't have this"**, with a reason — the job shows it, and staff decide
  whether to ask for an alternative or proceed without it
- **"Someone else will provide it"** — names a person, who gets a link to upload
  that one item and can see nothing else and approve nothing
- **"Please clarify"** — the question arrives on the job and the answer goes back
  to the client

**Why it matters.** The firm's commonest delay is a client who sent the wrong
month's file. Today that is a verbal problem. In the prototype the rejection
carries a written reason the client actually receives, and the job stays visibly
blocked with that reason attached.

**Cost.** Moderate. The checklist already sits embedded on the engagement with
`status`, `requestedAt`, `receivedAt`, `verifiedBy`. This adds three states, a
submission counter, a rejection reason, and three client-side actions on the
portal (built at P2-9b).

**I would do this.** It is mostly new states on a field that exists, and the
"someone else will provide it" path solves a real problem — the client's
accountant is usually the person with the file, and today that means sharing a
portal login.

→ Proposed **D22**.

---

### Q3. When was money received, and where does the unallocated part sit?

**Today.** A payment records amount, date, mode, reference and TDS, and
allocates against one or more invoices. "Advances sit as unallocated credit on
the client" (spec §7).

**The prototype** sets out one rule: **cash is counted once.**

- Money received = bank receipts by **receipt** date, plus direct payments
- Allocating a receipt to an invoice is **not** new cash, and settling an
  advance against an invoice is **not** new cash — both are marked so they never
  reach a collections figure twice
- One receipt can pay several invoices, part each
- Paying **another client's** invoice needs a written reason, kept on the
  allocation
- Whatever is left over stays on the accounts desk, visible, until it is either
  allocated or deliberately held as that client's advance — it cannot quietly
  vanish
- Advances are then applied to a named invoice, and that application is recorded

It also puts a **promise** on the invoice rather than on the client. A logged
promise date pauses automatic reminders **for that invoice only** until the day
after it passes; "remind anyway" stays available and is logged with the fact that
a promise was overridden; and a bulk reminder leaves promised invoices out and
says how many it left. Spec §12 has fixed reminder cadences and a *Disputed*
status that drops an invoice out of chasing altogether — a promise is the softer,
commoner case, and it expires by itself.

**Why it matters.** "Collected this month" is a number a partner reads to decide
things. If allocating an old receipt in October adds to October's collections,
the number is wrong and nothing on screen says so. The prototype shows the
figure with "bank receipts by date" written under it, and names how much is
still unallocated.

**Cost.** Moderate, and contained. `Payment` gains an allocation-level
non-cash marker and an on-behalf reason; the receipt becomes the cash event and
the allocation stops being one; `Invoice` gains a promise date. Receivables
ageing and the client ledger (step 8b) are unaffected — they already read
allocations. The collections figure on the partner dashboard changes, and the
reminder rules built at 9b learn to skip a promised invoice.

**I would do this.** It is a small change that makes one headline figure true,
and the alternative is a number nobody can quite explain.

→ Proposed **D23**.

---

### Q4. Is free work a zero fee, or a waiver?

**Today.** Spec §7: "Discounts above a configurable percentage need Partner
approval." The starter catalog seeded every fee at ₹0 on purpose, waiting for
the firm to price its own work.

**The prototype** does not allow free work to be a blank:

- A fee must be a positive whole-rupee amount
- Free work is a **waiver**: a reason, requested by whoever is billing, approved
  by a partner, recorded with both names
- One waiver process, identical on the billing screen and the accounts desk
- Every finished job is **billable**, **in retainer**, or **waived** — and the
  ones that are not separately chargeable stay listed with their reason, so the
  unbilled report does not quietly shrink

**Why it matters.** A zero fee and a waived fee look identical in a database and
mean opposite things: one is "nobody has priced this yet", the other is "a
partner decided not to charge, for this reason". The Settings warning strip
(P2-10b) already flags "services with no fee or no SAC", and PROGRESS notes it
will read high for a long time — this is what distinguishes the two cases.

**Cost.** Small. `Engagement` gains a treatment (billable / retainer / waived)
with a reason and an approver. "Billed" already runs alongside the pipeline as a
billing status rather than inside it, so there is a place for this to live.

**I would do this.** It is the smallest of the five and it closes a real hole:
today a partner cannot tell deliberate goodwill from an unpriced service.

→ Proposed **D24**.

---

### Q5. In what order do the three gates come?

**Today.** Spec §5: the assignee files or delivers, captures the acknowledgement
and UDIN, and then the reviewer sets *Completed*. Review is the last gate.

**The prototype** puts review **before** filing, and adds a client gate between:

1. Staff prepare and send for review
2. Reviewer approves — and cannot be the same person, and for A-tier work must
   be a partner
3. For GST, GSTR-9, ITR and TDS: **the client confirms the figures**, naming who
   confirmed, when, with what evidence, against which version
4. Only then can a filing be recorded

Approval is a precondition of recording a filing, not a sign-off afterwards. And
changing anything after approval raises the version, withdraws the approval and
the client confirmation, and sends the job back.

**Why it matters.** The current order asks the reviewer to approve something
already filed. If the reviewer disagrees, the return is on the portal and the
fix is a revised return. Reviewing first is also what the firm does in practice,
and what a peer reviewer would expect to see.

The client-confirmation gate matters because the client, not the firm, owes the
tax. The prototype records the confirmation with evidence precisely so that a
later dispute has an answer.

**Cost.** Small in code, larger in habit. The statuses already exist; this
changes which transitions are allowed, adds a client-confirmation record, and
adds a rule that editing after approval resets both gates. The portal (P2-9b)
gains an approve action for contacts who are allowed to use it.

There is one knock-on: PROGRESS records that *Completed and Cancelled are
terminal — nothing reopens an engagement*. Correcting a filing record (Q1) and
amending after approval both need a way back. I would keep Completed terminal
and let a correction be its own recorded event rather than a reopening, which is
what the prototype does.

**I would do this**, and I would make the client gate per service rather than
always on — the prototype limits it to four service types and that looks right.

→ Proposed **D25**.

---

### Q6. Two internal dates, or one? — this reverses a decision you made on 24-10-2026

I am raising this knowing you already decided it, because the prototype disagrees
and the reason is worth a minute of your time. If the answer is still one date,
say so and I will not raise it again.

**Your decision, 24-10-2026.** *"The firm's target date keeps the name 'Internal
due date', and stays one date per engagement rather than a default per client and
service."*

**The prototype** has three dates, not two: the statutory date, a **preparation**
target (four days before) and a **review** target (two days before). From that it
derives a state the system does not have today:

> **At risk** — the statutory date is still ahead, but an internal target has
> already slipped.

That is the list a partner can still act on. Overdue is the list where acting is
too late. The prototype keeps them as two separate cards for exactly that reason,
and the weekly planning board gives them separate lanes.

**What I am not asking for.** Not a default per client and service — you rejected
that, and the prototype does not have it either. Both of its targets are computed
from the statutory date, so there is nothing extra to enter and nothing extra to
maintain.

**Cost.** Small: two computed dates rather than one stored one, and one new
derived state on the lists that already exist.

**I would do this**, because "at risk" is the only item on this whole list that
tells you about work while there is still time to save it. But it is your call
and you have already made it once.

→ Proposed **D26**, or a recorded "asked again, answer unchanged".

---

## Part B — Five steps I would build next

These need no model decision and no answer to Part A. They read data that
already exists. P3-1 to P3-4 were the original four; P3-5 was added by the
completeness check at the end of this document.

**One honest warning first.** All of them can be *built* but none can be *shown*
until the Atlas cluster exists. That has been true of every step since Step 1 and
it is the only thing standing between "built" and "works" for the whole
repository. If you do one owner task this month, do that one.

### P3-1 · The Issues page

**Spec sections to re-read:** §10 (dashboards), §5 (SLA and ageing), §12
(notifications).

Everything that needs attention, in one list, worked out live from the records —
each row with the button that performs the real action.

The prototype computes about twenty kinds in one pass: late milestones, uploads
waiting to be reviewed, replacement awaited, waiting for review, client to
confirm, approved but not filed, acknowledgement not attached, fee not agreed,
waiver waiting for a partner, overdue invoices, unallocated receipts, reply dates
passed, DSCs expiring, invalid PAN or GSTIN, a client with nobody who can
approve, identity changes held, overdue to-dos, unanswered client messages.

The thing worth copying is what it refuses to do: **there is nothing to mark
resolved.** Fix the record and the row disappears by itself. A list you tick is a
second list to maintain and it goes stale.

- Filters: Mine / Everyone, by kind, by urgency
- Each row names its owner, and the row counts as yours if you are covering for
  that person
- This becomes the landing page for everyone in the firm

**Build:** one `lib/issues/list.js` that returns rows from existing collections,
one screen, one count on the rail. No new collection, no new field.

**Tests:** Vitest on the rule for each kind (a row appears when the condition is
true and is gone when it is not); one Playwright flow — land on Issues, act on a
row, see the row go.

**How you check it:** sign in, land on Issues, accept a waiting upload from the
row itself, and watch that row disappear without a page reload.

**Size:** the largest of the four, and the one I would build first.

---

### P3-2 · An approval gate on anything a client will receive

**Spec sections to re-read:** §12 (notifications and reminders), §14 (job runner).

`NotificationRule` and the mail queue already exist. This adds the governance
the prototype puts around them:

- Client-facing batches wait in an **approval queue** with a preview of the first
  real message and the full recipient list
- A rule is marked **trusted** by a partner only; trusted rules send without the
  queue
- Quiet hours (21:00–08:00 and Sundays), urgent notice alerts excepted
- At most four automated messages to one client a month
- Any send above 25 clients always needs approval, trusted or not
- A firm-wide pause switch
- Batches whose reason has gone cancel themselves — if the documents arrived, the
  chaser does not go out
- A received-but-unchecked document **holds** a batch rather than cancelling it
- An append-only run log, exportable, described on screen as the evidence a peer
  reviewer reads

**Build:** a status and a queue on the existing rule runner, plus one screen.

**Tests:** Vitest on the gate (trusted bypasses, untrusted queues, over-25 always
queues, quiet hours defer, stale batch cancels, unchecked document holds); one
Playwright flow approving a batch.

**How you check it:** turn on the document chaser, see nine messages wait for
you, open the preview, approve, and find the send in the run log with your name
on it.

---

### P3-3 · Disabled, with the reason, instead of refused afterwards

**Spec sections to re-read:** §2 (permissions).

Spec §2 says enforce on the server, not just hide in the UI. The build does
that. The prototype goes one step further: a button you are not allowed to press
is **shown disabled with the reason in its tooltip**, rather than offered and
then refused.

`lib/permissions.js` and `describeMatrix()` already hold the rules. This asks
every action control to consult them before rendering.

It also removes a smaller annoyance the prototype fixes: the same action should
not appear twice on one screen.

**Build:** one helper the action buttons call; no new rules.

**Tests:** Vitest — for each role and action, the control is present, disabled,
and carries a reason; one Playwright check that an employee sees *why* they
cannot approve.

**How you check it:** switch to the Staff view, open a job in review, and see
Approve greyed with "the person who did the work cannot review it".

---

### P3-4 · A reason on every period nobody opened

**Spec sections to re-read:** §8 (compliance calendar and grid).

The compliance grid colours cells by status. It has no idea what an **empty**
cell means, and empty is the dangerous one.

The prototype makes it three things, only the first of which is a firm failure:

- **Our miss** — create the job now, with the right dates and the branch's team
- **Handled by another professional** — not ours, not a miss
- **Not engaged for this period** — the client was not with us then

**Build:** one small record per client, service and period carrying the reason,
and the three actions on the grid cell. A bulk "create the missing ones" exists
already in the prototype and is worth having.

**Tests:** Vitest on the cell rule; one Playwright flow marking a cell and seeing
it leave the "never created" count.

**How you check it:** open Compliance, click a dashed cell, mark it "handled by
another professional", and watch the count on the dashboard drop by one.

---

### P3-5 · Separate "what you may see" from "what you are looking at"

**Spec sections to re-read:** §2 (permissions, branch scoping).

Added after the completeness check below — this was missed on the first pass and
it is the one item here with any structural weight.

Spec §2 says a user sees only clients of the branches they are assigned to. The
prototype splits that single idea in two, and the distinction is the useful part:

- **Access** is what you may see: a per-person list of branches, enforced on the
  server. Open a link to a client outside it and you get a page that says so and
  names what to ask for, rather than an empty list or an error.
- **View** is what you are looking at *inside* your access: a selector offering
  all branches, one branch, or **my work across branches** — the jobs you prepare
  or review wherever the client sits.

The rule the prototype states plainly: **changing the view never changes a
record, a GSTIN or an invoice series.** It is a filter on reading, nothing else.
Screens that are firm-wide by nature say so rather than appearing filtered, and
opening a record from outside the current view shows a line explaining why it is
visible.

**How this sits with what is built.** The access half largely exists and is
better than the prototype's: `User.branchIds[]` plus `ClientAccess` grants with
expiry and an `expireGrants` job (P2-1, P2-2) are more precise than a flat branch
list. What is missing is the **view** half — the selector, the "my work across
branches" scope, and the firm-wide labelling. So this is a query-scope and
top-bar change on models that already exist, not a new model.

**Build:** one scope helper the list queries call, a selector in the top bar
remembered per person, and the no-access page.

**Tests:** Vitest — a view never widens access; "my work" returns only jobs you
prepare or review; a firm-wide screen ignores the selector. Playwright: a manager
with two branches switches view and the counts move together.

**How you check it:** sign in as the Ludhiana manager, switch to "my work across
branches", and see the Noida job you review appear while the rest of Noida
stays hidden.

---

## Part C — What I would leave alone

Each of these is a product in its own right, the spec does not ask for any of
them, and the prototype's own content carries "to be verified by a practising CA
before use" throughout.

| From the prototype | Why not now |
| --- | --- |
| The audit module (7 stages, ~30 SA references, 16 tests on every voucher, CARO clause by clause, three-layer opinion, locked snapshots, amendments) | The biggest single thing in the prototype. Needs a partner's sign-off on every standard reference before a line is written |
| Certificate studio (ICAI Guidance Note structure, banned-phrase check, UDIN validated against the signer's membership number) | Same. The UDIN format check is the one small piece worth lifting early, and it belongs with the register built at P2-7 |
| Auditor's report generator (SA 700 structure driven by the opinion type) | Same, and downstream of the audit module |
| Data lab (any spreadsheet in, MIS and an analysis checklist out) | Genuinely useful and completely unspecified. Spec §1 puts the accounting ledger out of scope |
| Learning library (per-screen SOPs, playbooks with exercises) | Valuable for training a new joiner. Needs the firm's own words, not the prototype's |
| Client experience (WhatsApp assistant, monthly health report, business pulse) | Needs the WhatsApp Business API decision first — still unanswered in spec §18 |
| Monthly GST cycle as one tracked lifecycle | Worth having, but it sits on Q1. Decide the milestones first |
| Notices as matters with law clocks and adjournment counting | Needs a partner to confirm every limitation rule. Large, and the current build has nothing to conflict with it |
| Weekly planning by effort, take-over page, leave with cover, one inbox, Notify, announcements, split job conversations, bulk client round-trip | All good, none urgent. Candidates for a Phase 3 list once Part A is settled |
| **One next step per job**, role-aware: the card names the single next action and shows either your button, "Nudge <name>" when it is someone else's, or "Help: <action>" where your role permits helping | Worth having and purely a reading of data we hold. It belongs with P3-1, which computes the same conditions firm-wide — build Issues first and this becomes the per-job view of it |
| **Modules on and off**, with three presets by kind of firm (compliance only / plus audit / full) | Right idea, wrong time. A five-person pilot firm does not need to hide screens from itself, and switching a module off would hide work that is already built and untested |
| **Quick add from anywhere** (one key), "save and add another", and an unfinished onboarding kept as a per-person draft | Small and genuinely useful for whoever does data entry. Not urgent while nobody can sign in |
| **Saying on screen what is sample and what is real**: a "sample data" marker in the top bar, every simulator behind one demo switch, the preparation workbook stamped "not a filing file", and every legal reference carrying "partner to confirm" | The discipline is right and costs nothing. Two pieces are worth adopting now rather than later: the unconfirmed-due-date warning already exists on the Settings strip (P2-10b), and nothing that leaves the building should imply it was filed by us. The rest follows whenever the features it labels get built |

---

## Part D — The spec needs an amendment either way

`docs/SPEC.md` is eleven days old and has been overtaken on three points by
decisions already in the code. Anyone reading it today reads something that
contradicts the build.

| Spec says | Reality | Action |
| --- | --- | --- |
| Complexity levels **L1 / L2 / L3** (§4) | The build and the prototype both use **A / B / C** (P2-4) | Amend §4 |
| Four branches: Noida, Delhi–Rohini, Ludhiana, Meerut (§1, §13) | The prototype has five and calls the Delhi office Pitampura | Confirm the real list, amend §1 |
| Home screen is **Today**, three ruled columns (§15) | The prototype lands on **Issues** and removes Today from the menu | Follows from P3-1; amend §15 |
| Internal target = statutory − 3 working days (§8) | The build stores one date; the prototype computes two | Follows from Q6 |
| Documents: Requested → Received → Verified (§6) | Six states in the prototype | Follows from Q2 |
| One acknowledgement per engagement (§13) | Several milestones in the prototype | Follows from Q1 |

Two places where the **spec is right and the prototype is loose** — no change
needed, recorded so nobody copies the prototype later:

- **Money is integer paise** (§13). The prototype uses whole rupees. The build is
  correct.
- **Dates read DD-MM-YYYY** (§14). The prototype shows "25 Oct 2026". The build
  is correct.

---

## Part E — Two questions that are not about the data

### E1. Who decides how it looks?

Spec §15 specifies a whole design language — "the modern ledger": Fraunces for
titles, paper grain, ledger ruling, a brass focus ring, and eight signature
moments including a 3D map of the branches on the login screen, a hand-drawn
audit tick, and a rubber stamp that presses onto a completed engagement. Step 11
built all eight.

The prototype has none of it. It is a plain, neutral interface in IBM Plex with a
blue accent.

These are not compatible, and I cannot tell from the prototype whether the
plainer look is a preference or just what was quick to build in one file. Spec
§15 also says a designer produces the screens before coding starts, and
PROGRESS records a decision to skip that stage and build tokens from the spec
directly.

**If the prototype's look is now what you want, that is a reversal of spec §15
and of a built step, and it should be written down as a decision rather than
drifted into.** I have not assumed either way.

### E2. Should any of this start before something runs?

`CLAUDE.md` gates Phase 2 on Phase 1 being in daily use. PROGRESS records, at the
top of the Phase 2 table, that Phase 2 was opened anyway with nothing having
ever run.

A Phase 3 built on the same footing would be a third layer on an unverified
foundation. Twenty-seven steps are complete and no row has been written to a
database.

My recommendation: **answer Part A now, build nothing from Part B until the
cluster exists.** The answers cost you an hour and they stop the model drifting
further; the building can wait a week. The two client-portal test suites should
run first when it does — they are what prove somebody outside the firm cannot
reach anything of the firm's.

---

## Completeness check — 26-10-2026

The owner asked whether this document covers the whole of the reference. I
checked it against the prototype instead of answering from memory, and it did
not. Six things were read in the prototype and then dropped in the writing up.
They are now in, and recorded here so the omission is visible rather than
quietly patched:

| Missed | Now at |
| --- | --- |
| Access versus view — the two halves of branch scoping | **P3-5**, new step. The one with structural weight, and it should not have been left out |
| Payment promises per invoice, pausing reminders | Folded into **Q3**, where it belongs — it is the same question about cash |
| One role-aware next step per job | Part C, tied to P3-1 |
| Modules on and off, with firm presets | Part C |
| Quick add, save-and-add-another, kept drafts | Part C |
| Saying on screen what is sample and what is real | Part C |

What the check confirms is covered: the six questions of Part A, the audit
module, certificates, the SA 700 generator, the GST cycle, notices with law
clocks, the data lab, the learning library, client experience, weekly planning,
the take-over page, leave and cover, the inbox, Notify, announcements, split job
conversations, and the bulk client round-trip.

**This is a reading of one HTML file by one agent.** Another pass would probably
find more. If something you expected to see is still absent, it was missed, not
rejected — say so and it goes in.

---

## What I need from you

1. **Q1–Q5**, and **Q6** if you want to revisit it — yes, no, or "explain it
   again" on each. Answers become D21–D26 in `PROGRESS.md`.
2. **E1** — the design question.
3. **E2** — whether to build or wait.
4. The one owner task that unblocks everything: **create the MongoDB Atlas
   cluster, database user and network access.** I will give you click-by-click
   steps whenever you want them.

Nothing gets built until you say go.

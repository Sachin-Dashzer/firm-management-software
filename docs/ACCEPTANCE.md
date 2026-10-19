# Phase 1 acceptance criteria

The eleven criteria from spec §17, each with **exactly how to check it** and
an honest mark. Written so the owner can run through it themselves — every
check is something you do in the browser, not something you take on trust.

Status: ✅ verified · 🟡 built, not yet verified against the database ·
⬜ not built · ⛔ blocked

Last gone through: 18-10-2026, by the agent, before the Atlas cluster existed.
**Nothing below is ✅ yet, and nothing can be until the database exists.**
That is the honest position: the code is complete and unit-tested, and no
row has ever been written.

---

## 1. Each role sees and can do exactly what §2 allows, checked on the server

🟡 Built. Permissions live in one place (`lib/permissions.js`) and every
server action asks it before writing. 38 unit tests cover the matrix.

**How to check it.** Sign in as each of the five roles in turn (make a test
user per role on the Team screen) and confirm:

| As | Should be able to | Should not be able to |
| --- | --- | --- |
| Partner | everything | — |
| CA | complete an engagement, see fees | reach Team, delete anything |
| Employee | work their own engagements | see another branch's work, complete anything |
| Intern | see only clients they are assigned to | see fees, complete anything |
| Accounts | invoices, payments | engagement checklists |

Then the part that matters: with the employee signed in, take the URL of an
engagement in **another** branch and paste it in. You should get sent away,
not shown the page. A UI that hides a button is not security; this checks
the server.

## 2. An intern or employee cannot mark an engagement Completed; assignee and reviewer cannot be the same person

🟡 Built, 9 unit tests.

**How to check it.** As an employee, open your own engagement at Under
review — there is no Completed button. Then try the server directly if you
like; it refuses. On any engagement, try to set the same person as both
assignee and reviewer: it is refused with a reason (spec §5, maker and
checker).

## 3. Recurring engagements are generated for all subscribed clients, with correct due dates

🟡 Built (`jobs/generateRecurring.js`), 14 unit tests.

**How to check it.** Settings → Background jobs shows the nightly run. Sign
a client up to a monthly service, confirm its due-date rule, then wait for
the 01:30 run (or trigger the runner). Next month's engagement appears,
assigned to whoever does that work, with the statutory date on it.

**The important half:** un-confirm the due-date rule and generate again.
The engagement is still created, with **no date** and a note saying why.
The system never invents a statutory date (CLAUDE.md rule 8).

## 4. Changing a statutory due date in the master updates all open engagements on that rule, and is logged

🟡 Built, 2 Playwright tests waiting on the database.

**How to check it.** Settings → Due dates → a rule → record an extension
for a period. The screen says how many engagements moved. Open one: its
date has changed and its internal target has been recalculated. Its
Activity tab shows the change with the notification reference you typed.

## 5. Every engagement shows client and firm checklists with pending items counted on the dashboard

🟡 Built.

**How to check it.** Open an engagement: two checklists, client and firm.
Leave a mandatory client item pending. On `/today` as a partner, "Waiting
on a client" counts it; `/reports/pending-documents` lists it by name.
Click the figure — the list underneath matches it.

## 6. Invoice numbers are sequential with no gaps per series; CGST/SGST vs IGST is chosen correctly from place of supply

🟡 Built, 31 unit tests on the numbering and the GST split.

**How to check it.** Raise three invoices and issue them: the numbers run
consecutively. Cancel the middle one — it keeps its number and a credit
note is raised against it; no number is reused and none is skipped. Then
raise one for a client in your own state (CGST + SGST, half each) and one
for another state (IGST, the whole rate). A draft has no number at all
until it is issued.

**Opening balances carried in at go-live sit in their own `OB/` series and
do not touch this numbering** — by design, so history cannot disturb the
statutory sequence.

## 7. Payments can be split across invoices and TDS recorded; client ledger balances match

🟡 Built, 27 unit tests on allocation and the ledger.

**How to check it.** Enter one payment for less than two invoices total and
split it across both. Record TDS on one. The client's ledger shows each
invoice, what was received, TDS credited and what is left — and the closing
balance equals the sum of the outstanding column. Re-allocate the payment:
the old allocation is reversed in the same transaction, so nothing is
double-credited.

## 8. Every create, edit, delete, status change, file download and credential reveal appears in the audit log with before/after values

🟡 Built. Every change is written in the **same transaction** as the change
itself, so a change cannot land without its log entry (CLAUDE.md rule 2).
The entries are hash-chained, and the chain can be checked from the Audit
screen.

**How to check it.** Change something on a client, move an engagement's
status, download a document, reveal a portal password. Each appears on
`/audit` within seconds, with who, when, from where, and the old and new
values. Then press **Check the chain** — it verifies every entry back to the
first.

**Two deliberate exceptions**, both because of CLAUDE.md rule 7: PAN and
Aadhaar changes are logged as *changed* without their values, and the audit
log never holds a password or a document's contents.

## 9. Overdue, due-this-week, pending-documents and unbilled-work figures on the Partner dashboard match the underlying lists

🟡 Built, and built so that it cannot drift: a dashboard tile is a
**filter**, counted by the same query the list screen runs, and the tile's
link is that filter in the URL.

**How to check it.** On `/today` as a partner, note each figure, click it,
and count the rows on the list it opens. They will agree, or the query
builder is wrong and the list is wrong too. One Playwright test does
exactly this.

## 10. All lists export to Excel; client import from Excel validates PAN/GSTIN and flags duplicates

🟡 Built. Exports are real `.xlsx` (frozen headers, money as a summable
number, dates as dates). Import is **CSV** — "Save as → CSV UTF-8" in
Excel — which is a known deviation; say if a true `.xlsx` reader is wanted.

**How to check it.** Export clients, engagements, invoices, payments and any
report; open each in Excel and total a money column. Then import a client
sheet containing a bad PAN, a bad GSTIN, and a PAN that is already in the
system: every row is listed with its problem, nothing is written, and the
duplicate can only be saved by ticking the override.

## 11. Daily backups run and a restore has been tested once before go-live

⛔ **Blocked on you, and the last thing to do before go-live.**

Three parts, in `docs/DEPLOY.md` §5:

- **Atlas backups** — needs an M10 cluster or above. The free tier has none.
- **The vault** — `scripts/backup-vault.sh` on a cPanel cron, copying the
  encrypted documents off BigRock nightly.
- **A restore, actually done.** Not "backups are configured": restore last
  night's copy into an empty folder and open a file from it. A backup nobody
  has restored is a hope, not a backup.

**Also on the checklist:** `STORAGE_ENCRYPTION_KEY` must be written down
somewhere outside this system — a password manager, and a sealed envelope in
the office. The backup is encrypted with it and does not contain it. Lose
the key and every document in the vault is lumber.

---

## Beyond the eleven: §16 as acceptance criteria

Spec §16 says to treat it as acceptance criteria too.

| Requirement | State |
| --- | --- |
| Email + password + mandatory 2FA | 🟡 built |
| 30-minute idle timeout | 🟡 built |
| **Force logout instantly when somebody leaves** | 🟡 **fixed in Step 12** — the session no longer decides whether you still work here; the database does, on every request |
| Intern/employee limited to assigned clients | 🟡 built |
| HTTPS everywhere | ⛔ Vercel gives it; BigRock AutoSSL is yours to turn on |
| Per-file AES-256-GCM before writing to BigRock | 🟡 built; the PHP half has never executed |
| Field-level encryption, key only in env, reveal logged | 🟡 built |
| Aadhaar masked except where needed | 🟡 built (last four stored plainly, the rest encrypted) |
| Files only via short-lived signed links, vault outside the web root | 🟡 built |
| Database in India | ⛔ yours: Atlas Mumbai (`ap-south-1`) |
| BigRock server's country confirmed | ⬜ open question for the firm |
| Daily backups, quarterly restore test | ⛔ see criterion 11 |
| DPDP: purpose and consent recorded | 🟡 captured in the engagement letter; there is no separate consent field — **confirm this is enough with your lawyer** |
| DPDP: export everything held on a client | 🟡 built in Step 12 |
| DPDP: delete personal data where retention allows | 🟡 built in Step 12 as redaction — see the policy on the client's Activity tab |
| Breach detection and an incident log | 🟡 built in Step 12, Settings → Security |
| Working papers retained 8 years | 🟡 a setting, default 8 years |
| UDIN captured on every certificate and attestation | 🟡 built; required before Completed where the service needs one |
| Client messages factual and non-promotional (ICAI) | 🟡 the templates are; **read them once** at Settings → Messages |

---

## What has to happen before the firm relies on this

In order:

1. **Atlas cluster.** Everything below needs it. Then `npm run doctor`,
   which proves the connection, the transactions every audit entry depends
   on, the indexes and the vault in one command.
2. **Run the 56 Playwright tests** against it. They are the real check on
   criteria 1–10.
3. **Walk this document** with a partner, screen by screen, and mark each
   criterion ✅ or raise what is wrong.
4. **The migration rehearsal** (`docs/DEPLOY.md` §7) — the imports run into
   a scratch database and checked against the spreadsheets before the real
   one.
5. **The owner tasks** in `docs/PROGRESS.md` — Vercel, the BigRock gateway,
   the mailbox, SPF/DKIM/DMARC.
6. **Backups, and a restore that was actually performed.**
7. **§16 reviewed by the firm**, as §16 itself asks — and the DPDP
   notification process confirmed with the firm's lawyer.
8. **Pilot at Noida for one compliance month, in parallel with the
   spreadsheets** (spec §17). Do not retire the sheets until a full month
   has gone through both.

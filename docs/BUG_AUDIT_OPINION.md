# An audit opinion that saved as nothing, under a message saying it saved

`tests/e2e/books.spec.js:235` had been failing with an audit filing stored
with an **empty opinion** while the screen said "Filing details saved" and
still showed the opinion selected. For an audit file that is the worst shape
of wrong: it is silent, it is believable, and it surfaces at review, at UDIN
generation, or in front of somebody who is entitled to ask.

This is the write-up of what was actually wrong, how it was proved, and what
was changed.

---

## 1. The root cause

**React 19 resets a form after its `action` prop has run — whether the save
succeeded or was refused — and a DOM reset does not make React re-commit a
controlled `value`.**

So the sequence on the filing panel was:

1. The CA picks **Qualified**. `opinion` state becomes `"Qualified"`, and
   because `MODIFIED_OPINIONS.includes(opinion)`, the "What the opinion is
   modified for" box appears.
2. They save without filling the reason in. `checkAssurance()` refuses it
   correctly — nothing is written.
3. **React resets the form.** Every field goes back to its default:
   `opinion`, `auditType`, `udin`, the dates. The `<select>` was controlled
   by `value={opinion}`, but React only writes a `value` to the DOM when it
   changes, and the state had not changed — so React never put `"Qualified"`
   back. The select now reads `""` in the DOM.
4. The screen still looks right. React state is still `"Qualified"`, so the
   reason box is still there and the user fills it in.
5. They save again. `FormData` carries `opinion=""`. `checkAssurance()` has
   no objection — no modified opinion means no reason required — and the
   record is written with a blank opinion and the reason text beside it.
6. `{ ok: "Filing details saved." }`.

The opinion never left the browser. Everything underneath the form behaved
exactly as written; it was simply never asked about the value the user chose.

**Where:**

| | |
| --- | --- |
| `app/(app)/engagements/[id]/EngagementWork.jsx:675` (was) | `<form action={(formData) => startTransition(...)}>` — the reset is React's response to this prop |
| `app/(app)/engagements/[id]/EngagementWork.jsx:795` (was) | `<select name="opinion" value={opinion} …>` — controlled, so the reset left it out of step with React |
| `app/(app)/engagements/actions.js:859` (was) | `opinion: String(formData.get("opinion") ?? "").trim()` — read the `""` faithfully |
| `models/Engagement.js:165` (was) | `opinion: { type: String, default: "", trim: true }` — no `enum`, so nothing underneath objected |

### How it was proved

A throwaway Playwright test read the form's own values back after the
refused save, instead of inferring them from what was on screen:

```
PROBE before submit: {
  opinion: 'Qualified',
  auditType: 'Statutory audit',
  udin: '25419876AAAAAAAAAA'
}
PROBE after refused submit: { opinion: '', auditType: '', udin: '', noteVisible: true }
```

That is the whole bug in two lines. Every field was wiped by the refusal,
and `noteVisible: true` is why nobody could see it: the reason box was still
on screen, so the opinion looked as though it were still selected.

The probe was deleted once it had done its job; the assertions it was
checking are now permanent, in `tests/e2e/books.spec.js`.

---

## 2. The checklist, ruled in or out

| Candidate | Verdict | Evidence |
| --- | --- | --- |
| **Field name mismatch** (`opinion` vs `auditOpinion` vs `report.opinion`) | **Ruled out** | Form `name="opinion"`, server `formData.get("opinion")`, schema `assurance.opinion`. All three agree. The probe showed the field present and empty, not absent. |
| **Enum / value mismatch** (label vs value, casing) | **Ruled out** as the cause | `OPINIONS` are used as both label and value, so `selectOption("Qualified")` matches either way. It was a real *gap* though — there was no `enum` anywhere, so a mismatch would have been stored silently. Closed as defence in depth. |
| **Uncontrolled / stale state** | **RULED IN — this is it** | The select was controlled and the DOM was reset behind React's back. Probe output above. |
| **Payload builder omits the field** | **Ruled out** | No `pick()` or whitelist on either side; `assurance` is assembled field by field from `formData` in `saveFiling`. |
| **Partial update bug** (`$set` with `undefined`, overwriting spread) | **Ruled out** | `saveFiling` assigns `engagement.assurance = assurance` wholesale and saves the document; no `$set`. A test now covers a second save touching `ackNo` leaving the opinion alone. |
| **Two saves racing** (autosave + manual) | **Ruled out** | There is no autosave on this panel. The only writer of `assurance` is `saveFiling`. |
| **Optimistic UI / swallowed error** | **Ruled out** as the cause | "Filing details saved" came from the server's own `{ ok }`, and the server genuinely had saved — a blank. No `catch` was swallowing anything. The message was honest about the write and wrong about the content, which is why the read-back below was added. |
| **Transaction aborted, 200 returned anyway** | **Ruled out** | `audited()` throws out of the transaction and `saveFiling` returns `{ error }`. The record really did contain `""` — read back directly from MongoDB by the spec. |
| **Read path / serialiser dropping it** | **Ruled out** | The spec asserts against `Engagement.findById(...).lean()`, i.e. the database, not the screen. The field was empty in the database. |

One cause, proved. The rest are closed with evidence, and two of them —
the missing `enum` and the message that could not tell "written" from
"written correctly" — were real holes even though they were not the cause.

---

## 3. What changed

All of it in one commit, `2b219b1`.

### The root cause

**`lib/forms/saving.js`** (new). `<form onSubmit={saving(run, report, startTransition)}>`
in place of `<form action={run}>`. It owns the submit, so React does not
reset anything, and it ties the reset to the server's answer instead:

- **refused** — nothing is reset, the fields keep what the user entered, and
  the error can be corrected and sent again;
- **saved** — the form is reset, which clears an add-a-row form and re-reads
  an edit-in-place one from the `defaultValue`s the revalidated server
  component has just supplied, i.e. from the persisted record;
- **a caller that hands back no answer** keeps React's old always-reset, so
  nothing silently changed behaviour where the answer is not plumbed through
  yet (see §4).

Nothing is lost by owning the submit: these forms all passed a closure, not
a server action reference, so they already required JavaScript and were
never progressively enhanced. The clicked button is passed to `FormData` so
a multi-button form still posts what React's `action` would have posted.

**`app/(app)/engagements/[id]/EngagementWork.jsx`** — the opinion `<select>`
is now `defaultValue` with an `onChange`, so React state decides only what
is *rendered* (whether the reason box is shown) and can no longer drift away
from the field that gets posted. The filing form also re-reads the opinion
from the persisted record the server echoes back.

### Defence in depth

**`models/Engagement.js`** — `assurance.opinion` and `assurance.auditType`
now carry `enum`s. An opinion that is not one of SA 700 / SA 705's words
cannot be written by any code path, not just by the route that happened to
be checking. `""` stays legal: an audit in progress has not formed an
opinion yet.

**`lib/practice/books.js`** — `isAuditWork()`, `missingOpinion()`, and the
two database filters the report and the doctor read. `missingOpinion()`
treats both `""` and `"Not yet issued"` as missing, because a file being
*closed* in either state is the same gap.

**`app/(app)/engagements/actions.js`**

- `saveFiling` **reads the record back inside the same transaction** and
  compares the stored opinion with the one it was asked to store. A
  difference throws, which rolls the transaction back, and the user gets an
  error instead of "saved". That covers a dropped field, a silent cast and a
  second write landing in between without having to know which happened.
- `saveFiling` returns the persisted `assurance` with the message, so the
  panel shows what the database holds rather than what was typed into it.
- A **UDIN cannot be recorded** against audit work whose opinion is blank. A
  UDIN is generated against a signed report, and the report is its opinion.
- An **audit cannot be marked Completed** with a blank opinion. This sits in
  `changeStatus`, which is the one place every sign-off goes through —
  including the bulk "sign off" action, which loops it.

Nothing anywhere fills an opinion in. Choosing one is the signing CA's
judgement under SA 700 / SA 705, and code's only job is to refuse to let the
file be closed without it.

### Finding the records already affected

**`scripts/report-empty-audit-opinions.mjs`** / `npm run opinions:empty` —
read-only. Lists every audit engagement with no opinion, with client, period,
status, UDIN, report date and who last touched it; separates the ones already
completed, numbered or dated; cross-references the audit log to show where an
opinion *was* entered and is not there now; and lists test and sample records
apart. Writes `docs/AFFECTED_AUDIT_FILINGS.md`.

**`scripts/doctor.js`** — a new "Audit opinions" section. WARN while any
audit engagement has no opinion yet (normal for work in progress), FAIL if
any is completed, numbered or dated without one.

### The other 57 files

`<form action={…}>` → `<form onSubmit={saving(…)}>` across 97 forms, and 23
screens' local `run()` helpers now hand their result back so `saving()` can
tell a save from a refusal. Mechanical, one expression per form; the full
list is the diff.

---

## 4. The same pattern elsewhere (step 5)

**Every** form in the app had the input-wiping half of this bug: React's
reset is a property of the `action` prop, not of this screen. All 97 are
converted, so no refused save wipes what the user typed anywhere.

The compliance-critical ones, checked individually:

| Screen | Found |
| --- | --- |
| **Audit studio — the opinion** (`practice/audit/[id]/ReportPanel.jsx`, `setOpinion`) | A second, separate opinion record: `AuditFile.opinion.type`. Its server action **already refuses** an empty or unknown type (`report.js:232`) and demands a basis for a modified one, so a wiped form failed *loudly* here — annoying, never silent. Converted; its schema has no `enum`, which is listed below. |
| **Audit report signing** (`signAuditReport`, `amendAuditReport`) | Server-validated. Converted. |
| **Certificates / UDIN** (`practice/certificates/[id]/CertificateDraft.jsx`, `practice/udin/UdinRegister.jsx`) | `signCertificate` validates on the server; the UDIN register writes through the same register helper as the filing panel. Converted. |
| **Notices** (`practice/notices/[id]/NoticeMatter.jsx`, 9 forms) | All route through one local `form()`/`run()` pair, now plumbed. Hearing and submission dates are server-validated. |
| **Trial balance and sampling** (`tb/[id]/Journal.jsx`, `sampling/[id]/Design.jsx`, `Grid.jsx`) | Journal entries are balanced on the server before being accepted; sampling design is validated in `lib/practice/sampling.js`. Converted. |
| **Engagement status** (`changeStatus`) | Not a form field — driven by buttons with their own checks. Gained the opinion gate described above. |
| **Invoices** (`invoices/[id]/InvoiceEditor.jsx`) | Numbering is gapless and server-side; line arithmetic is recomputed on the server, not trusted from the form. Converted. |
| **Client PAN / GSTIN** (`clients/ClientForm.jsx`) | Validated by Zod on the server (`lib/validators`), and a wrong PAN is refused rather than stored. Converted. |

### Suspicious, not confirmed, not patched

- **`AuditFile.opinion.type` has no `enum`** (`models/AuditFile.js:215`), the
  same gap the engagement's opinion had. Its action validates, so there is no
  known path to a bad value — but that was true of the engagement's opinion
  too, right up until a form found one. Worth closing the same way.
- **25 forms still hand `saving()` no answer**, so they keep React's old
  always-reset: the 13 `useActionState` screens (login, both password
  changes, announcements, new notice, new certificate, start TB, start
  sample, confirm heads, customise words, add time, timer, add todo, client
  change request) and 12 with local `onSubmit`/`onSave`/`onPreview` handlers.
  Behaviour there is **unchanged from before this fix** — a refusal still
  clears the form. Four of them already reset themselves deliberately. The
  upgrade is one argument per form and should be done where a refusal is
  possible; none of them is an audit or compliance field.
- **`FilingMilestones.jsx:189`, `settings/branches/Branches.jsx:89`,
  `settings/due-dates/DueDates.jsx:233` and `:308`** keep their result
  internal for the same reason. Same note.

---

## 5. Tests added, and what they print

### `tests/audit-opinion.test.js` — new, 28 tests, real MongoDB

A memory replica set, because `enum` and `strict` are the things under test
and a stub would be testing the stub.

- each of the five opinions written and **read back from the database**;
- the opinion surviving a later save that touches another field;
- an opinion outside the list refused, on create *and* on update, with the
  stored value unchanged;
- a differently cased opinion (`"qualified"`) refused rather than stored;
- an audit type outside the list refused;
- a blank opinion still accepted — work in progress;
- `checkAssurance` on a modified opinion with and without a reason;
- `missingOpinion` for blank, `"Not yet issued"`, each real opinion, non-audit
  work, and a malformed engagement;
- the two database filters the report and the doctor read, against nine
  record shapes, so they cannot disagree with `missingOpinion`.

```
 RUN  v5.0.5 C:/code/crm

 Test Files  1 passed (1)
      Tests  28 passed (28)
   Duration  2.19s
```

Confirmed failing before the fix. With the `enum` taken back off
`models/Engagement.js` and nothing else changed:

```
     × refuses an opinion that is not one of the standard's words 28ms
     × refuses a differently cased opinion rather than storing it 18ms
     × refuses the same on an update, not only on a create 28ms
      Tests  3 failed | 16 passed (19)
```

### `tests/e2e/books.spec.js` — strengthened, not relaxed

`:235` keeps every assertion it had. Two were added:

- after the **refused** save, `select[name="opinion"]` still reads
  `"Qualified"` — the line the bug hid behind;
- after the successful save, the page is **reloaded** and the opinion and the
  reason are read again, from the server rather than from anything the
  browser kept.

And a new test: a UDIN cannot be recorded against an audit with no opinion —
refused, nothing written, no invented opinion, and the number the user typed
still in the box to save once the opinion is there.

```
  ✓  1 [laptop] › books.spec.js:203:1 › a return filed after its deadline is called late in the Tax book (3.5s)
  ✓  2 [laptop] › books.spec.js:235:1 › an audit report that was not clean has to say why (2.4s)
  ✓  3 [laptop] › books.spec.js:281:1 › a UDIN cannot be recorded against an audit with no opinion (1.9s)
  ✓  4 [laptop] › books.spec.js:319:1 › a filing date in the future is refused (1.9s)
  ✓  5 [phone]  › books.spec.js:203:1 › …
  ✓  6 [phone]  › books.spec.js:235:1 › …
  ✓  7 [phone]  › books.spec.js:281:1 › …
  ✓  8 [phone]  › books.spec.js:319:1 › …
  8 passed (1.2m)
```

### A second bug found on the way: `books.spec.js:319`

`E2E_REPORT.md` guessed this one — a future filing date not being refused —
"may be the same mechanism". It is not, and it was worth running down because
it looked like a missing server guard.

The test sets the date input's `.value` past the input's `max` attribute. That
leaves the field failing HTML constraint validation, and **the browser then
refuses to fire `submit` at all** — so the server, which is where the refusal
has to come from (CLAUDE.md rule 1), was never being asked. Proved by
ruling out the alternative: a three-second wait before the click (in case the
click was landing before React hydrated) changed nothing.

The server guard was there all along, on both save paths —
`app/(app)/engagements/actions.js:851` and `lib/engagements/milestones.js:287`.
The test now removes `max` before setting the value, so it asks the server the
question it was written to ask. It passes.

### The suites

```
> npm run lint
(clean)

> npx vitest run
 Test Files  90 passed (90)
      Tests  1790 passed (1790)

> npm run build
✓ Compiled successfully
```

The unit count went up by 28 (89 files / 1762 tests before), and nothing was
removed.

### A regression check on the form change, against known-green specs

97 forms changed, so the specs that were **already passing** before this work
are the ones worth re-running: a failure in them is attributable. Between them
they drive both styles of converted form — the login and 2FA screens
(`useActionState`), the ICAI member form (a plumbed `run()` helper), the
access grant drawer, and the filing panel itself.

```
  ✓ access.spec.js      6 of 6
  ✓ books.spec.js       4 of 4
  ✓ icai.spec.js        3 of 3
  ✓ two-factor.spec.js  4 of 4
  17 passed (1.5m)
```

The rest of the browser suite has not been re-run clean end to end here. Its
standing failures are catalogued in `E2E_REPORT.md` and are the fixture-
isolation groups described there, not this change — but that is a statement
about what is already known, not a run.

---

## 6. What the owner has to do

### Check the live database

From a machine with the firm's `.env` in place:

```
npm run opinions:empty
```

**Read-only.** It changes nothing and fills nothing in. It writes
`docs/AFFECTED_AUDIT_FILINGS.md`, which lists, in order of urgency:

1. **Audit files already completed, numbered or dated with no opinion.**
   These are the ones that matter. Each reads as a finished audit and says
   nothing about what was concluded.
2. **Files where the audit log shows an opinion was entered and is not there
   now** — the ones this bug ate. The log is a hash chain, so those entries
   cannot have been quietly edited: somebody did choose that opinion, on that
   date.
3. Audits still in progress, where blank is a legitimate state. Nothing to do
   — they cannot now be completed or numbered without an opinion, so they
   will surface on their own.
4. Test and sample records, listed separately.

### Then, for each affected file

**A CA or partner has to re-enter the opinion by hand.** Not the one in the
log, and not the one that seems likely from the qualification note — the one
in the audit report that was actually issued and signed. Open the file, read
the report, enter that. One file at a time, by the person entitled to sign
it.

The log entry in section 2 of the report is a pointer to which files to look
at first, not an answer. Code has deliberately not copied those values back
in: an opinion restored by a script is an opinion nobody formed.

Every correction is audited, so it appears on the record *as* a correction,
which is what a peer reviewer will want to see.

### Then confirm

```
npm run doctor
```

It fails while any completed, numbered or dated audit still has a blank
opinion. A clean doctor is the proof the list has been worked through.

### One decision needed

`docs/OWNER_QUESTIONS.md` §8: the opinion list offers both a blank "Not said"
and "Not yet issued", which mean the same thing. Dropping the blank is a
one-line change. Nothing is blocked on the answer.

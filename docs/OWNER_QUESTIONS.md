# Questions only you can answer

Things the go-live work ran into that need a business decision, not a
technical one. Nothing here is blocking anything else — the code is written
and waiting. Answer them in any order; strike each one out when it is done.

---

## 1. The 88 jobs waiting in the queue

**The situation.** The background runner has never run — no cron job was
ever set up, so work has been collecting since the queue was built. There
are 88 jobs in it, some weeks old. Switching the runner on points it at all
of them.

**The risk.** Some are reminders and emails. A reminder generated six weeks
ago for a deadline that has since passed is not late, it is wrong — and a
client who gets one will ring you about it. Staff email is the immediate
risk because client email is still switched off.

**What to do.** Read the queue before the first tick:

```
npm run jobs:backlog
```

That is read-only. It groups what is waiting by type and age. Then decide
how old is too old, and set those aside:

```
npm run jobs:backlog -- --expire-older-than=7 --types=reminders,sendMail
npm run jobs:backlog -- --expire-older-than=7 --types=reminders,sendMail --apply
```

The first of those two is still a dry run. Nothing is deleted either way:
the jobs are marked `expired` and the rows stay, so the decision is on the
record.

**The question:** how many days old does a reminder have to be before you
would rather it never went out? My guess would be 7, but it is a judgement
about your clients, not a technical setting.

---

## 2. The sample data in the live database

**The situation.** The database currently holds 3 invented clients and 6
invented colleagues, plus their engagements, invoices, documents and
comments — and all four branch GSTINs are invented too. They are mixed in
with whatever is real, so every total you read today includes them.

**What to do.** See exactly what would go:

```
npm run purge:sample
```

Read-only. It prints the tree: each client, everything hanging off it, the
colleagues, the groups, the branch registrations. Then:

```
npm run purge:sample -- --apply
```

Everything is soft-deleted with an audit entry per record. Nothing is
hard-deleted.

**Two things to know first.** Three of those are issued invoices. Their
numbers stay spent — a GST series is never renumbered — and the gaps are
explained in `docs/INVOICE_GAPS.md`, which is the note to keep on file.
And the four branch GSTINs will be blanked, so you will need to enter the
real ones before any invoice can be issued.

**The question:** is there anything in there you have been using as a real
record? If you have been typing real work against a sample client, say so
before this runs.

---

## 3. The 11 statutory due-date rules

**The situation.** All 11 are unconfirmed, which means the compliance
calendar puts **no date on anything**. That is deliberate — the system
refuses to apply a statutory deadline nobody has checked (CLAUDE.md rule 8)
— but it also means that side of the system is doing nothing at all until
you confirm them.

**What to do.** Settings → Due dates. Read each rule against the law and
confirm it. The wording in each one says where the draft came from.

**The question:** this is yours alone and cannot be delegated to me. I will
not fill in a statutory date, and nothing will put one on a job until you
have read the rule behind it.

---

## 4. The firm's own record

**The situation.** The firm's FRN is blank, and the name is a default. Both
print on every invoice, report and letter.

**What to do.** Settings → ICAI. Fill in the name, the FRN, the
constitution and the head-office address.

**The question:** none, really — I just cannot invent your registration
number.

---

## 5. 13 services with no fee or SAC code

**The situation.** The starter catalog shipped with every fee at zero and
most SAC codes blank. A wrong SAC code goes onto a GST invoice and is your
problem with the department, not the software's.

**What to do.** Settings → Services, and fill in the fee and the SAC for
each one you actually offer. Deactivate the ones you do not.

**The question:** your fees, and the SAC code you have been using for each
service. I will not guess either.

---

## 6. Which way the job runner should be started

**The situation.** There are three ways, and the right one depends on your
hosting (`docs/DEPLOY.md` §2):

1. **BigRock cron + Node** — needs "Setup Node.js App" in cPanel.
2. **BigRock cron + curl** — works on any cPanel plan.
3. **Vercel Cron** — nothing on BigRock at all, but on Vercel's **Hobby**
   plan it runs **once a day**, not every five minutes. A CRM whose
   reminders go out daily is not what the spec describes, so on Hobby this
   means either option 1 or 2, or paying for Pro, or pointing a free
   external pinger (cron-job.org) at the route.

**The questions:**

- Does your cPanel have **Setup Node.js App**? (Look under "Software".)
- Is the Vercel account on **Hobby** or **Pro**?
- If Hobby and no Node.js app support: are you content for a third party
  (cron-job.org) to hold the runner's secret and know the URL? It is a
  reasonable trade at this size, but it is your call. BigRock cron keeps it
  in-house.

---

## 7. The Tally / Zoho export format

Left over from step 8c and still open: the accounts export can be written
in Tally's XML or Zoho's CSV shape, and I need to know which one you
actually import into before writing it.

---

## Answered, for the record

Nothing yet. As each question above is settled, move it here with the
answer and the date, so the next person reading this knows what was decided
rather than guessing from the code.

# Deploying PHMG CRM

Written for the firm owner, not a developer. Do the steps in order and stop
where it says to stop.

This file grows with each step. Today it covers **the file gateway on
BigRock** (Step 6). Vercel, Atlas, the job runner and email are added as
those steps are built.

---

## 1. The file gateway on BigRock

This is what stores client documents. Files never sit in a public folder and
are encrypted on disk, so even someone with access to the hosting account
cannot read them without the key.

### What you will need

- Your BigRock cPanel login
- About 20 minutes
- Somewhere safe to keep two secrets (the firm's password manager)

### Step 1 — make the two secrets

In the Claude Code terminal, type each of these and press Enter. Copy both
results somewhere safe before you go on; the second one in particular **can
never be recovered**, and losing it makes every stored document unreadable.

```
! node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Run it **twice**. Call the first result the **shared secret** and the second
the **encryption key**.

### Step 2 — create the subdomain

1. Sign in to cPanel.
2. **Domains → Create A New Domain**.
3. Domain: `files.phmgindia.com`
4. Untick **Share document root**.
5. Document root: `/home/<your-cpanel-user>/files.phmgindia.com`
6. **Submit**.
7. Go to **SSL/TLS Status**, tick the new subdomain, click **Run AutoSSL**,
   and wait until it shows a valid certificate. Do not go on until it does.

### Step 3 — create the vault folders

1. **File Manager**, then go to `/home/<your-cpanel-user>` (the top level,
   *not* inside `public_html`).
2. Create a folder called `phmg-vault`.
3. Inside it, create two folders: `files` and `.recycle`.
   (In File Manager, turn on **Settings → Show Hidden Files** to see
   `.recycle` afterwards.)
4. Create one more folder at the top level: `phmg-logs`.
5. Select `phmg-vault`, click **Permissions**, and set it to **0700**
   (tick only the three "User" boxes). Do the same for `phmg-logs`.

### Step 4 — upload the gateway

1. In File Manager, open `/home/<your-cpanel-user>/files.phmgindia.com`.
2. Upload these four files from the project's `gateway` folder:
   `upload.php`, `download.php`, `delete.php`, `verify.php`, `index.php`
   and `.htaccess`.
   (`.htaccess` starts with a dot — if you cannot see it after uploading,
   turn on **Show Hidden Files**.)
3. Do **not** upload `config.example.php` here.

### Step 5 — write the configuration file

1. Go up to `/home/<your-cpanel-user>`.
2. Create a new file called `phmg-gateway-config.php`.
3. Edit it and paste in the contents of `gateway/config.example.php` from the
   project, then fill in:
   - `shared_secret` → the **first** secret from Step 1
   - `encryption_key` → the **second** secret from Step 1
   - `vault_dir` → `/home/<your-cpanel-user>/phmg-vault`
   - `log_dir` → `/home/<your-cpanel-user>/phmg-logs`
   - `allowed_origin` → the CRM's own address, e.g.
     `https://crm.phmgindia.com`
4. Save, then set its permissions to **0600**.

This file must stay where it is. If it ever ends up inside
`files.phmgindia.com`, both secrets become downloadable — move it back out
immediately and make new ones.

### Step 6 — tell the app

Add these to the Vercel project (**Settings → Environment Variables**), and
to `.env.local` if you run the app on your own machine:

| Name | Value |
| --- | --- |
| `STORAGE_DRIVER` | `bigrock` |
| `STORAGE_GATEWAY_URL` | `https://files.phmgindia.com` |
| `STORAGE_SHARED_SECRET` | the first secret from Step 1 |
| `STORAGE_ENCRYPTION_KEY` | the second secret from Step 1 |

They must match the config file exactly — a stray space is enough to break
every upload.

### Step 7 — check it works

1. Open the CRM, go to any engagement, and attach a small PDF to a checklist
   item.
2. It should say the file is attached, and the checklist item should move to
   **Received**.
3. Click **Preview**, then **Download**. The file that comes back must open
   normally.
4. In cPanel File Manager, look in `phmg-vault/files/clients/…`. You should
   see the file there, and opening it in File Manager's editor should show
   **gibberish** — that is the encryption working. If you can read it, stop
   and tell me.
5. In a browser, try to open
   `https://files.phmgindia.com/phmg-vault/` and
   `https://files.phmgindia.com/verify.php`. Both must fail. If either shows
   anything, stop and tell me.
6. Delete the file in the CRM, then look in **Settings → Recycle bin**: it
   should be listed with a date 90 days out. Restore it and check it still
   downloads.

### If something goes wrong

- **"Gateway is not configured"** — `phmg-gateway-config.php` is not where
  the gateway expects it, or cannot be read. It belongs one level above the
  `files.phmgindia.com` folder.
- **"Bad signature"** — `STORAGE_SHARED_SECRET` and `shared_secret` are not
  identical. Re-copy both.
- **"File could not be decrypted"** — the encryption key has changed since
  the file was stored. Put the old one back; do not re-upload.
- **Upload fails on larger files** — BigRock's PHP limits. In cPanel,
  **MultiPHP INI Editor**, raise `upload_max_filesize` and `post_max_size` to
  `30M` for the subdomain.
- The gateway's own log is in `/home/<your-cpanel-user>/phmg-logs`, one line
  per request.

---

## 2. The background job runner

This is what does the work nobody triggers: generating next month's filings,
sending reminders, clearing the recycle bin. It runs every five minutes.

There are two ways to set it up. **Do step A first** — it tells you which
one you need.

### Step A — which kind of hosting do you have?

1. Sign in to cPanel.
2. Look through the icons for **Setup Node.js App** (usually under
   "Software").
3. If it is there, follow **Option 1**. If it is not, follow **Option 2**.
   Either works; option 1 is slightly more robust because it does not depend
   on the website being awake.

### Option 1 — the runner on BigRock (if you have Node.js)

1. In cPanel, **File Manager**, create a folder
   `/home/<your-cpanel-user>/phmg-runner`.
2. Upload the project into it (or ask me to produce a zip of just what the
   runner needs).
3. In **Setup Node.js App**: Application root `phmg-runner`, Application
   mode **Production**, then **Create**.
4. Open the application and add these environment variables:
   `MONGODB_URI`, `STORAGE_GATEWAY_URL`, `STORAGE_SHARED_SECRET`,
   `STORAGE_ENCRYPTION_KEY`, `FIELD_ENCRYPTION_KEY` — the same values as
   Vercel.
5. Click **Run NPM Install**.
6. Go to **Cron Jobs**. Common Settings: **Every Five Minutes**
   (`*/5 * * * *`). Command — the Node.js app page shows a line beginning
   `source /home/.../bin/activate`; copy it, then add the runner:

   ```
   source /home/<user>/nodevenv/phmg-runner/20/bin/activate && cd /home/<user>/phmg-runner && node runner/run.js >> /home/<user>/phmg-runner/runner.log 2>&1
   ```

   The exact `nodevenv` path comes from your own Node.js app page — use
   that, not this example.

### Option 2 — the runner called over the web (no Node.js needed)

1. Make a secret:

   ```
   ! node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

2. Add it to Vercel (**Settings → Environment Variables**) as `JOBS_SECRET`,
   and redeploy. Until it is set, the route refuses every caller.
3. In cPanel, **Cron Jobs**. Common Settings: **Every Five Minutes**.
   Command (one line, with your own address and secret):

   ```
   curl -s -m 60 -H "x-jobs-secret: YOUR_SECRET_HERE" https://crm.phmgindia.com/api/jobs/run > /dev/null
   ```

4. Set **Cron Email** to your own address at first, so a failure reaches
   you. Turn it off once it has run quietly for a week, or the mail becomes
   noise you stop reading.

### Step B — check it is working

1. Wait five minutes, then open **Settings → Background jobs** in the CRM.
2. The top panel should be green and say the runner checked in a minute or
   two ago. If it is red after ten minutes, cron is not reaching it.
3. Press **Run now**. The count of runs should go up.
4. Come back the next day: the run count should have gone up by roughly 288
   (five-minute intervals over 24 hours).

**If the panel stays red**

- Option 1: check `runner.log` in the runner folder — it has one line per
  run, and the error if there was one.
- Option 2: run the same `curl` line yourself from the Claude Code terminal
  with `!` in front. If it returns `Not found`, `JOBS_SECRET` in Vercel does
  not match the one in the cron line, or the deploy has not picked it up
  yet.
- Either way the CRM keeps working — background work simply waits. Nothing
  is lost, it just does not happen until the runner runs.

---

## 3. The email mailbox

The CRM sends from `notices@phmgindia.com`. Until this is set up it writes
every message to the server log instead, which is harmless — nothing is
lost, and you can read what would have been sent in **Settings →
Messages**.

**Nothing reaches a client until you deliberately switch that on**, which
is the last step below. Do the rest first and watch it for a few days.

### Step 1 — create the mailbox

1. cPanel → **Email Accounts** → **Create**.
2. Username `notices`, domain `phmgindia.com`.
3. Set a long random password and keep it in the firm's password manager.
4. Storage: 1 GB is plenty.
5. **Create**.

### Step 2 — tell the app

Add to Vercel (**Settings → Environment Variables**):

| Name | Value |
| --- | --- |
| `EMAIL_TRANSPORT` | `smtp` |
| `SMTP_HOST` | `mail.phmgindia.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `notices@phmgindia.com` |
| `SMTP_PASSWORD` | the password from step 1 |
| `EMAIL_FROM` | `PHMG & Associates <notices@phmgindia.com>` |

Redeploy, then open **Settings → Messages**. The delivery line should say
the mailbox answered. If it does not, the message there says why.

### Step 3 — make the mail arrive, not go to spam

Mail from a new address lands in junk until the domain vouches for it.
Three records do that.

1. cPanel → **Email Deliverability**. Find `phmgindia.com`.
2. It will show SPF and DKIM as "problems exist" with a **Manage** button.
   Click it. cPanel shows the exact records needed — copy them.
3. Your DNS is at GoDaddy, so they have to be added there: sign in →
   **My Products** → the domain → **DNS** → **Add**.
   - **SPF**: a TXT record, host `@`, with the value cPanel gave you. If a
     TXT record starting `v=spf1` already exists, **edit that one** rather
     than adding a second — two SPF records are worse than none.
   - **DKIM**: a TXT record, host `default._domainkey`, value from cPanel.
4. Add a third record yourself, for DMARC: TXT, host `_dmarc`, value:

   ```
   v=DMARC1; p=none; rua=mailto:associatesphmg@gmail.com
   ```

   `p=none` means "watch and report, do not block" — the right setting
   while you confirm everything works. Tighten it later if you wish.
5. Wait an hour, then go back to **Email Deliverability** in cPanel. SPF
   and DKIM should both show green ticks.

### Step 4 — test it on yourself before any client

1. Add `EMAIL_REDIRECT_TO` in Vercel, set to your own address, and
   `EMAIL_CLIENTS_ENABLED=true`. Redeploy.
2. Every message now goes to you, whoever it was addressed to, with the
   intended recipient shown in the subject in square brackets.
3. Issue a test invoice to a test client. You should receive it, with the
   PDF attached, and the subject should start `[to ...]`.
4. Check it arrived in the inbox and not in spam. Send one to a Gmail
   address too — Gmail is the strictest judge of a new sender.

### Step 5 — go live

Only when steps 3 and 4 are both clean:

1. **Remove** `EMAIL_REDIRECT_TO` from Vercel.
2. Keep `EMAIL_CLIENTS_ENABLED=true`.
3. Redeploy.

From this moment clients receive invoices and reminders. Until it,
**Settings → Messages** shows everything that was held back and why.

To stop everything in a hurry at any time, set `EMAIL_ENABLED=false` and
redeploy; nothing is lost, and the queue resumes when you turn it back on.

---

## 4. The database and the app

### Step 1 — the Atlas cluster

1. **cloud.mongodb.com** → sign in or **Try Free** with the firm's email.
2. **Create a cluster.** **M0 Free** is fine for the pilot; **M10** is the
   first tier with its own backups, which you need before go-live
   (section 5).
3. **Provider AWS. Region: Mumbai (ap-south-1).** Spec §16 requires the data
   in India and the app runs in the same region.
4. Name it `phmg-crm` → **Create Deployment**. Three to five minutes.
5. When it asks for a user: username `phmg-app`, **Autogenerate Secure
   Password**, **Copy** it somewhere safe — Atlas will not show it again.
6. **Network Access → Add IP Address → Allow Access from Anywhere**
   (`0.0.0.0/0`), comment `Vercel - app`. This sounds alarming and is
   correct: Vercel functions have no fixed IP, and the database is still
   behind the username, the password and TLS.
7. **Clusters → Connect → Drivers → Node.js 6.7+**, copy the string,
   replace `<db_password>`, and put the database name `phmg` after `.net/`:

   ```
   mongodb+srv://phmg-app:THEPASSWORD@phmg-crm.xxxxx.mongodb.net/phmg?retryWrites=true&w=majority
   ```

### Step 2 — the Vercel project

1. **vercel.com** → sign in with the firm's GitHub account → **Add New →
   Project** → import the repository.
2. Framework **Next.js** is detected. Do not change the build command.
3. **Settings → Functions → Region: Mumbai, bom1.** The app and the
   database must be in the same place or every page waits on a round trip
   to another continent.
4. **Settings → Environment Variables.** Add every line from
   `.env.example`, for **Production** *and* **Preview**:

   | Variable | What to put |
   | --- | --- |
   | `MONGODB_URI` | the string from Step 1 |
   | `AUTH_SECRET` | run `openssl rand -base64 32` and paste the result |
   | `NEXTAUTH_URL` | `https://crm.phmgindia.com` (or the vercel.app address until the domain is pointed) |
   | `NEXT_PUBLIC_APP_URL` | the same address |
   | `FIELD_ENCRYPTION_KEY` | `openssl rand -base64 32` — **this one is irreplaceable**, see below |
   | `STORAGE_ENCRYPTION_KEY` | the key from section 1, Step 1 |
   | `STORAGE_GATEWAY_URL`, `STORAGE_GATEWAY_SECRET` | from section 1 |
   | `EMAIL_*` | from section 3 |
   | `JOB_RUNNER_SECRET` | from section 2 |

5. **Deploy.**

> **The two keys you must keep outside this system.**
> `FIELD_ENCRYPTION_KEY` decrypts portal passwords, bank details and
> Aadhaar. `STORAGE_ENCRYPTION_KEY` decrypts every client document. Lose
> either and that data is gone — there is no recovery, by design. Put both
> in the firm's password manager **and** on paper in a sealed envelope in
> the office safe. Do this on the day you create them, not later.

### Step 3 — the first partner account

Once the cluster is live and the app is deployed, on your own machine:

```
npm run seed
```

It creates the first Partner account and prints a one-time password. Sign
in with it, set up 2FA when asked, then add the rest of the team — either
on the Team screen, or in bulk at **Settings → Bringing data in**.

### Step 4 — restrict the audit log user (M10 and above)

Spec §11 wants the app unable to rewrite its own audit log. The application
already refuses; this stops anything else.

1. Atlas → **Database Access → Custom Roles → Add Custom Role**, name it
   `app-no-audit-edit`.
2. On database `phmg`, collection `auditLogs`: allow **find** and **insert**
   only.
3. Grant `readWrite` on `phmg` *except* `auditLogs`, plus the custom role.
4. Edit the `phmg-app` user to use it, then press **Check the chain** on the
   `/audit` screen to confirm the app still works.

---

## 5. Backups, and a restore you have actually done

Spec §16: daily backups, and a restore test every quarter.

### The database

1. Atlas → your cluster → **Backup**. Needs **M10** or above; the free tier
   has no backups at all, which is the main reason to upgrade before the
   firm relies on this.
2. Turn on **Cloud Backup**, daily snapshots, **retain 7 daily, 4 weekly,
   12 monthly**.
3. Also turn on **Point in Time Restore** if the tier offers it — it is what
   lets you go back to ten minutes before a mistake rather than to midnight.

### The documents

`scripts/backup-vault.sh` copies the encrypted vault off BigRock nightly.

1. Upload it to `/home/<cpanel-user>/bin/backup-vault.sh`.
2. In **Terminal** (or File Manager → Permissions): `chmod 700` it.
3. Set the off-server target inside the file — either `RCLONE_TARGET` (to
   Google Drive, say) or `SCP_TARGET` (to another machine). **Without one it
   warns you**, because a copy on the same server as the original is not a
   backup; one fire takes both.
4. **cPanel → Cron Jobs → Add**, once a day at **02:15**:
   `/bin/sh /home/<cpanel-user>/bin/backup-vault.sh`
5. Next morning, check `~/phmg-backups/backup.log`.

The archive is already-encrypted files, so it is no more sensitive than the
vault — and it does **not** contain the key. See the warning in Step 2.

### The restore test — the part that counts

Every quarter, and once before go-live. Put the date in the diary.

1. On BigRock, make an empty folder: `mkdir ~/restore-test`
2. `tar -xzf ~/phmg-backups/phmg-vault-<yesterday>.tar.gz -C ~/restore-test`
3. Count the files. It should be close to the vault's own count.
4. The real test: in the app, find a document that existed yesterday, note
   its file key from the audit log, find that file in `~/restore-test`, and
   confirm it is there and is the right size.
5. `rm -rf ~/restore-test` when you are satisfied.
6. Record it at **Settings → Security** as an incident of severity *Noted*,
   so the firm can show the test was done and when.

**For Atlas, restore to a new cluster**, never over the live one: Atlas
offers "restore to a new cluster", and that is the only safe way to test.

---

## 6. Going live, in order

Do not do these in parallel. Each one is checkable, and a problem found at
step 3 is much easier than the same problem found at step 8.

1. **Atlas cluster** (section 4) → `npm run seed` → sign in. *Check: you can
   sign in and the Today screen loads.*
2. **Vercel project and all environment variables** → deploy. *Check: the
   deployed address signs you in too.*
3. **File gateway on BigRock** (section 1). *Check: upload a file to a
   client and download it again.*
4. **Cron for the job runner** (section 2). *Check: Settings → Background
   jobs says the last run was minutes ago, not stale.*
5. **Mailbox, SPF, DKIM, DMARC** (section 3), with
   `EMAIL_REDIRECT_TO=yourself` still set. *Check: you receive a test.*
6. **Confirm the due-date rules** — all eleven, at Settings → Due dates.
   **Until a partner confirms a rule the system will not put its date on
   any engagement.** Nothing statutory works before this.
7. **Set the service fees and SAC codes** at Settings → Services. They were
   seeded at ₹0 deliberately.
8. **Enter the branch GSTINs** at Settings → Branches. Invoices can be
   drafted without them but not issued.
9. **Bring the data in** (Settings → Bringing data in, then the client
   import): team, clients, opening balances, in that order. **Rehearse it
   first** — section 7.
10. **Backups, and the restore test** (section 5).
11. **Walk `docs/ACCEPTANCE.md`** with a partner and mark it off.
12. **Turn client email on**: `EMAIL_CLIENTS_ENABLED=true`, and remove
    `EMAIL_REDIRECT_TO`. This is the point of no return for anything that
    reaches a client, so it is deliberately last.
13. **Pilot at Noida for one compliance month, in parallel with the
    spreadsheets** (spec §17). Retire the sheets only after a full month has
    gone through both.

### If you need to stop

| To stop | Do this |
| --- | --- |
| all email | `EMAIL_ENABLED=false`, redeploy |
| client email only | `EMAIL_CLIENTS_ENABLED=false` |
| the background jobs | remove the cron job; the queue waits |
| the whole app | Vercel → Deployments → promote the previous deployment |

Nothing is lost by any of these. The job queue resumes where it stopped,
and held messages stay on the Messages screen with their reason.

### Rolling back

Vercel keeps every deployment. **Deployments → the last good one →
Promote to Production**: about twenty seconds, and no data is touched.

What a rollback does **not** undo is a database change — if a release added
a field, rolling the code back leaves the field there, harmlessly. The one
thing to be careful of is the audit chain: it is append-only, so never
restore an older database over a newer one without telling me, because the
chain would then have a gap and the check on `/audit` would report it.

---

## 7. The data migration rehearsal

Spec §17 brings the firm's existing team, clients and opening receivables in
from spreadsheets. **Do it twice: once into a scratch database that you throw
away, then once for real.** The reason is client codes — `PHMG-NOI-0001`
upward, one series per branch, and a code is never reused. A half-finished
import leaves gaps in the numbering that nothing can tidy up afterwards, and
the fix is always "start the database again", which is cheap now and
expensive after the first invoice.

### Rehearse

1. In Atlas, nothing to create: the scratch run uses a **different database
   name on the same cluster**. On your own machine, in `.env.local`, change
   the end of `MONGODB_URI` from `/phmg` to `/phmg_rehearsal`.
2. `npm run seed` → `npm run dev` → sign in as the partner.
3. Import in this order, which is also the order on the screen. Nothing later
   works without the thing before it:
   - **Settings → Bringing data in → Team.** Read the one-time passwords out
     of the screen as you go; they are shown once. The import will not create
     a Partner from a spreadsheet — make those by hand on the Team screen.
   - **Clients → Import.** Bad PAN, bad GSTIN and duplicates are listed row
     by row and **nothing is written** until the sheet is clean. Fix the
     sheet, not the import.
   - **Settings → Bringing data in → Opening receivables.** These arrive as
     invoices in their own `OB/` series, outside the statutory numbering.
4. Now check it, against the spreadsheets and not against the screen's own
   arithmetic:

| Check | Where | Must agree with |
| --- | --- | --- |
| number of clients | Clients, the count at the top | rows in your sheet |
| number of staff | Settings → Team | rows in your sheet |
| total receivables | Invoices → Receivables, the total | your outstanding sheet, **to the rupee** |
| ten clients in detail | open ten at random | PAN, GSTIN, branch, group, contact |
| nothing arrived twice | Clients, sort by code | no two rows for one PAN |

5. Re-run the opening-receivables sheet deliberately. It must be **refused**,
   not doubled. If it is not, stop and tell me.
6. Throw the rehearsal away: Atlas → Collections → `phmg_rehearsal` → **Drop
   database**. Put `/phmg` back in `.env.local`.

### Then do it for real

The same three imports, in the same order, on the live database, once —
step 9 of section 6. Keep the sheets you imported from, unchanged, in a
folder with the date on it. If a figure is ever questioned, that folder is
the answer.

---

## 8. Monitoring

Spec §14 asks for four things watching the system. Three are free and take
twenty minutes; the fourth needs a decision.

### Atlas alerts (free, do this)

Atlas → **Alerts** → the defaults are sensible; add email to the partner for
**connections above 80%**, **disk above 75%** and **authentication
failures**. The last one is the interesting one: nobody but Vercel should
ever fail to sign in to the database.

### An uptime monitor (free, do this)

Any of the free monitors (UptimeRobot, Better Stack, cron-job.org) will do.
Two checks, every five minutes, alerting the partner by email:

| What | URL | Expect |
| --- | --- | --- |
| the app | `https://<your-vercel-domain>/login` | status **200** |
| the file gateway | `https://files.phmgindia.com/` | status **404** and the words `Not found` |

The gateway's 404 is deliberate — it has three endpoints and no front page.
Checking for the 404 *and* the words is what tells you PHP is still running:
if PHP ever stops, Apache serves the file itself and the body changes.

### The job runner's heartbeat (built in)

**Settings → Background jobs** shows when the runner last finished. If it says
hours rather than minutes, the cron has stopped — section 2 Step B. This is
the one that fails quietly: no screen breaks, deadlines simply stop being
generated and nothing is emailed.

### Error tracking — Sentry (needs your decision)

Spec §14 names Sentry. It is not installed, because it needs an account of
the firm's and a paid-or-free plan decision, and because Vercel already shows
you the last day of errors under **Deployments → Logs** at no cost.

What Sentry adds is the thing Vercel's logs do not: an email when a staff
member hits an error, grouped so you see "this happened eleven times today"
rather than scrolling. If you want it, create the account and send me the
DSN — about an hour's work to wire in, and nothing in the app changes.

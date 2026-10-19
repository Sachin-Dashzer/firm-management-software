#!/bin/sh
#
# A nightly copy of the document vault, off the server that holds it
# (spec section 16: "a nightly off-server copy of the encrypted document
# vault, with a restore test every quarter").
#
# Why a shell script and not a job in the queue: the vault lives on
# BigRock, the app lives on Vercel, and the one machine that can read the
# vault cheaply is BigRock itself. This runs there, from cPanel's cron, and
# never touches the app.
#
# What it copies is already encrypted. Every file in the vault is
# AES-256-GCM ciphertext (lib/storage/crypto.js), so a copy of it on
# another machine, or in Drive, is no more sensitive than the vault — the
# key is in Vercel's environment variables and is not in this backup. That
# is deliberate: a backup that contained the key would undo the encryption.
#
# IT ALSO MEANS: lose the key and the backup is lumber. Keep
# STORAGE_ENCRYPTION_KEY somewhere a person can reach without this system —
# a password manager and a sealed envelope in the office. Written on the
# go-live checklist for exactly this reason.
#
# ---------------------------------------------------------------------------
# Setting it up in cPanel (see docs/DEPLOY.md section 5):
#
#   1. Upload this file to  /home/<cpanel-user>/bin/backup-vault.sh
#   2. chmod 700 backup-vault.sh
#   3. Cron Jobs → add, once a day at 02:15 →
#        /bin/sh /home/<cpanel-user>/bin/backup-vault.sh
#   4. Fill in the three settings below.
# ---------------------------------------------------------------------------

set -eu

# --- settings ---------------------------------------------------------------

# the vault, which sits OUTSIDE public_html (spec section 16)
VAULT="${VAULT:-$HOME/phmg-vault}"

# where the nightly archives are kept on this server before going off it
STAGE="${STAGE:-$HOME/phmg-backups}"

# how many nightly copies to keep here. Thirty is a month: long enough to
# notice that something went wrong three weeks ago.
KEEP="${KEEP:-30}"

# Off-server copy. Set ONE of these.
#   RCLONE_TARGET  — e.g. "gdrive:phmg-vault-backups" (rclone configured first)
#   SCP_TARGET     — e.g. "user@backup-host:/backups/phmg"
RCLONE_TARGET="${RCLONE_TARGET:-}"
SCP_TARGET="${SCP_TARGET:-}"

# --- the work ---------------------------------------------------------------

stamp=$(date +%Y-%m-%d)
archive="$STAGE/phmg-vault-$stamp.tar.gz"
log="$STAGE/backup.log"

mkdir -p "$STAGE"

say() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >>"$log"
  echo "$1"
}

if [ ! -d "$VAULT" ]; then
  say "FAILED: no vault at $VAULT"
  exit 1
fi

say "starting: $VAULT"

# -C so the archive holds relative paths and can be restored anywhere
tar -czf "$archive" -C "$(dirname "$VAULT")" "$(basename "$VAULT")"

size=$(du -k "$archive" | cut -f1)
files=$(find "$VAULT" -type f | wc -l | tr -d ' ')
say "archived $files files, ${size}KB → $archive"

# A vault that suddenly has almost nothing in it is the shape of a disaster,
# and a backup taken afterwards is how the disaster becomes permanent. So
# the archive is kept and the run is marked failed, loudly.
if [ "$files" -lt 1 ]; then
  say "FAILED: the vault is empty. Keeping the archive, not sending it."
  exit 1
fi

# --- off the server ---------------------------------------------------------

if [ -n "$RCLONE_TARGET" ]; then
  say "sending to $RCLONE_TARGET"
  rclone copy "$archive" "$RCLONE_TARGET" --quiet
  say "sent"
elif [ -n "$SCP_TARGET" ]; then
  say "sending to $SCP_TARGET"
  scp -q "$archive" "$SCP_TARGET"
  say "sent"
else
  say "WARNING: no off-server target set, so this copy is still on the same machine as the vault. A fire takes both."
fi

# --- tidy up ----------------------------------------------------------------

# oldest first, delete everything past KEEP
count=$(ls -1 "$STAGE"/phmg-vault-*.tar.gz 2>/dev/null | wc -l | tr -d ' ')
if [ "$count" -gt "$KEEP" ]; then
  drop=$((count - KEEP))
  ls -1t "$STAGE"/phmg-vault-*.tar.gz | tail -n "$drop" | while read -r old; do
    rm -f "$old"
    say "removed old archive $(basename "$old")"
  done
fi

say "done"
